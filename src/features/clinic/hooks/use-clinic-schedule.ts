"use client";

import { useState, useEffect } from "react";
import type { ClinicId } from "@/features/clinic/types";
import type { ResolvedDaySchedule } from "@/lib/db/schedule-store";
import { useLang } from "@/i18n/lang-provider";
import { supabase } from "@/lib/supabase/client";

export type ClinicScheduleStatus = "open" | "break" | "closed_for_day" | "on_leave" | "loading" | "error";

export type ClinicLiveState = {
  status: ClinicScheduleStatus;
  message: string;
  isWalkInAllowed: boolean;
  activeShift?: { start: string; end: string; label: string };
  nextAvailableTime?: string;
};

export function useClinicSchedule(clinicId: ClinicId) {
  const { t } = useLang();
  
  // Try to load initial data from local storage (if in browser) for instant loading
  const getInitialData = () => {
    if (typeof window === "undefined") return null;
    try {
      const cached = localStorage.getItem(`schedule_cache_${clinicId}`);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  };

  const [scheduleData, setScheduleData] = useState<{ today: ResolvedDaySchedule; tomorrow: ResolvedDaySchedule } | null>(getInitialData);
  const [liveState, setLiveState] = useState<ClinicLiveState>({
    status: "loading",
    message: "...",
    isWalkInAllowed: false,
  });

  // Fetch schedule from API
  useEffect(() => {
    let mounted = true;

    const fetchSchedule = async () => {
      try {
        const res = await fetch(`/api/schedule?mode=resolved&clinic=${clinicId}`);
        if (!res.ok) throw new Error("Failed to fetch schedule");
        const data = await res.json();
        if (mounted) {
          setScheduleData(data);
          // Cache the fresh data so the next page load is instant
          localStorage.setItem(`schedule_cache_${clinicId}`, JSON.stringify(data));
        }
      } catch (error) {
        if (mounted) {
          setLiveState(prev => ({ ...prev, status: "error", message: "Error" }));
        }
      }
    };

    void fetchSchedule();

    // Listen for Realtime updates on day_overrides
    const channel = supabase
      .channel(`schedule_changes_${Math.random()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "day_overrides", filter: `clinic_id=eq.${clinicId}` },
        () => {
          // Immediately fetch the newly resolved schedule from our API when DB changes
          void fetchSchedule();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [clinicId]);

  // Calculate live state based on current time
  useEffect(() => {
    if (!scheduleData) return;

    const calculateStatus = () => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTimeStr = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;

      const { today, tomorrow } = scheduleData;

      // 1. Check for Leave / Full Day Closure
      if (!today.isOpen) {
        let reasonText = "";
        let returnDate = "";
        let returnTime = "";
        let parsedReason = null;

        // Try to parse reason if it's JSON from Smart Away Mode
        if (today.override?.reason) {
          try {
            parsedReason = JSON.parse(today.override.reason);
            reasonText = parsedReason.text || "";
            returnDate = parsedReason.returnDate || "";
            returnTime = parsedReason.returnTime || "";
          } catch {
            reasonText = today.override.reason;
          }
        }

        const formatTime = (time24: string) => {
          if (!time24) return "";
          const [h, m] = time24.split(":");
          const d = new Date();
          d.setHours(parseInt(h, 10));
          d.setMinutes(parseInt(m, 10));
          return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        };

        const formatDate = (dateStr: string) => {
          if (!dateStr) return "";
          return new Date(dateStr).toLocaleDateString("hi-IN", { day: "numeric", month: "long" });
        };

        // If it's a planned override (leave)
        if (today.source === "override") {
          let nextMessage = "";
          
          if (returnTime) {
            nextMessage = `${t("banner", "returnTodayAt")} ${formatTime(returnTime)} ${t("banner", "nextAvailable").replace(':', '')}`;
          } else if (returnDate) {
            nextMessage = `${formatDate(returnDate)} ${t("banner", "returnOnDate")}`;
          } else {
             // Fallback to generic next day
             const nextDayLabel = tomorrow.isOpen ? t("banner", "tomorrowAt") : t("banner", "later");
             nextMessage = `${t("banner", "nextAvailable")} ${nextDayLabel}`;
          }

          setLiveState({
            status: "on_leave",
            message: `${reasonText || t("banner", "doctorOnLeave")} • ${nextMessage}`,
            isWalkInAllowed: false,
          });
          return;
        }

        // Just a regular weekly off or week-schedule closed day — NO walk-ins
        const nextDayLabel = tomorrow.isOpen ? t("banner", "tomorrowAt") : t("banner", "later");
        setLiveState({
          status: "closed_for_day",
          message: `${t("banner", "clinicClosedToday")} ${nextDayLabel}.`,
          isWalkInAllowed: false, // Weekly off / scheduled close — walk-ins not allowed
        });
        return;
      }

      // 2. Check Shifts for Today
      const validShifts = today.shifts.filter(s => s.enabled && !s.closed);
      
      if (validShifts.length === 0) {
        setLiveState({
          status: "closed_for_day",
          message: t("banner", "noActiveShifts"),
          isWalkInAllowed: true,
        });
        return;
      }

      // Find current active shift
      const activeShift = validShifts.find(s => currentTimeStr >= s.startTime && currentTimeStr < s.endTime);
      
      const formatTime = (time24: string) => {
        const [h, m] = time24.split(":");
        const d = new Date();
        d.setHours(parseInt(h, 10));
        d.setMinutes(parseInt(m, 10));
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      };

      if (activeShift) {
        // We are currently INSIDE a shift
        setLiveState({
          status: "open",
          message: `${t("banner", "clinicOpen")} ${t("banner", "till")} ${formatTime(activeShift.endTime)}`,
          isWalkInAllowed: true,
          activeShift: {
            start: activeShift.startTime,
            end: activeShift.endTime,
            label: activeShift.label,
          }
        });
        return;
      }

      // Find NEXT shift for today
      const upcomingShift = validShifts.find(s => currentTimeStr < s.startTime);

      if (upcomingShift) {
        // Between shifts
        setLiveState({
          status: "break",
          message: `${t("banner", "doctorAwayNextShift")} ${formatTime(upcomingShift.startTime)}.`,
          isWalkInAllowed: true, // Allow taking token for next shift
          nextAvailableTime: formatTime(upcomingShift.startTime),
        });
        return;
      }

      // Day has ended (past all shifts)
      let nextMessage = "";
      if (tomorrow.isOpen) {
        const firstTomorrowShift = tomorrow.shifts.find(s => s.enabled && !s.closed);
        if (firstTomorrowShift) {
          nextMessage = ` • ${t("banner", "clinicClosedToday")} ${t("banner", "tomorrowAt")} ${formatTime(firstTomorrowShift.startTime)}`;
        }
      }

      // Change to Overtime banner message but DO NOT BLOCK
      setLiveState({
        status: "closed_for_day",
        message: `${t("banner", "routineShiftEnded")}${nextMessage}`,
        isWalkInAllowed: true,
      });
    };

    calculateStatus();

    // Recalculate every minute
    const interval = setInterval(calculateStatus, 60 * 1000);
    return () => clearInterval(interval);

  }, [scheduleData, t]);

  return liveState;
}
