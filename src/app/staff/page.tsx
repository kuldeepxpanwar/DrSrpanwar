"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PlayCircle,
  CheckCircle2,
  PauseCircle,
  SkipForward,
  RotateCcw,
  AlertTriangle,
  ShieldAlert,
  CalendarCheck,
  ShieldCheck,
  ClipboardList,
  CalendarClock,
  Phone,
  Inbox,
  Lock,
  UserPlus,
} from "lucide-react";
import { getQueueSummary } from "@/features/clinic/services/queue-engine";
import { useClinic } from "@/features/clinic/state/clinic-provider";
import { useLang } from "@/i18n/lang-provider";
import {
  getStaffSession,
  setStaffAuthToken,
  setStaffSession,
} from "@/components/navbar";
import { useToast } from "@/components/toast";
import { PrescriptionModal } from "@/components/prescription-modal";
import { QuickAddModal } from "@/components/quick-add-modal";
import type { QueueEntry } from "@/features/clinic/types";

type StaffSessionData = {
  id: string;
  name: string;
  role: "doctor" | "staff" | "pharmacist";
  designation: string;
  clinicAccess: string[];
};

type PatientHistorySummary = {
  totalVisits: number;
  lastVisitDate: string | null;
  clinicBreakdown: Record<string, number>;
};

type QueueTab = "live" | "scheduled" | "tomorrow" | "complete";

export default function StaffPage() {
  const {
    activeClinic,
    activeClinicId,
    state: clinicState,
    advanceQueue,
    resetClinicState,
    rescheduleQueueEntry,
        setEmergencyState,
    setBookingState,
    syncPendingEntries,
    updateQueueStatus,
    markReportCheck,
    createWalkIn,
  } = useClinic();
  const { t, lang } = useLang();
  const { toast } = useToast();
  const summary = useMemo(() => getQueueSummary(clinicState), [clinicState]);

  const [session, setSession] = useState<StaffSessionData | null>(() => getStaffSession());
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<QueueTab>("live");
  const [historyMap, setHistoryMap] = useState<Record<string, PatientHistorySummary>>({});
  const [emergencyMsg, setEmergencyMsg] = useState("");
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [rxEntry, setRxEntry] = useState<{
    id: string;
    token: string;
    name: string;
    clientRequestId: string;
    syncState: "synced" | "pending";
  } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const isDoctor = session?.role === "doctor";
  
  const pendingEntries = useMemo(
    () => clinicState.queue.filter((e) => e.status !== "done" && e.status !== "skipped"),
    [clinicState.queue],
  );
  // Split queue logically
  const liveQueue = useMemo(
    () => clinicState.queue.filter((e) => e.status !== "done" && e.status !== "skipped" && e.dayLabel === "Aaj" && (e.source === "walk-in" || e.status === "in-progress" || e.status === "hold")),
    [clinicState.queue],
  );

  const scheduledToday = useMemo(
    () => clinicState.queue.filter((e) => e.status !== "done" && e.status !== "skipped" && e.dayLabel === "Aaj" && e.source === "booking" && e.status !== "in-progress" && e.status !== "hold"),
    [clinicState.queue],
  );

  const tomorrowBookings = useMemo(
    () => clinicState.queue.filter((e) => e.status !== "done" && e.status !== "skipped" && e.dayLabel === "Kal"),
    [clinicState.queue],
  );

  const completeEntries = useMemo(
    () => clinicState.queue.filter((e) => e.status === "done" || e.status === "skipped"),
    [clinicState.queue],
  );

  const visibleEntries = useMemo(() => {
    switch (tab) {
      case "live": return liveQueue;
      case "scheduled": return scheduledToday;
      case "tomorrow": return tomorrowBookings;
      case "complete": return completeEntries;
      default: return liveQueue;
    }
  }, [tab, liveQueue, scheduledToday, tomorrowBookings, completeEntries]);

  useEffect(() => {
    const sync = () => setSession(getStaffSession());
    window.addEventListener("staff-session-change", sync);
    return () => window.removeEventListener("staff-session-change", sync);
  }, []);

  const login = async () => {
    if (!pin.trim()) {
      setError(t("staff", "enterPin"));
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.message || t("staff", "invalidPin");
        setError(msg);
        toast(msg, "error");
        return;
      }
      const sessionData: StaffSessionData = {
        id: data.member.id,
        name: data.member.name,
        role: data.member.role,
        designation: data.member.designation,
        clinicAccess: data.member.clinicAccess,
      };
      setStaffSession(sessionData);
      setStaffAuthToken(data.sessionToken || null);
      setSession(sessionData);
      window.dispatchEvent(new Event("staff-session-change"));
      setPin("");
      toast(`${t("staff", "welcomeBack")}, ${sessionData.name}`, "success");
    } catch {
      setError(t("staff", "invalidPin"));
      toast(t("staff", "invalidPin"), "error");
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (task: () => Promise<void>, successMsg?: string) => {
    setError("");
    try {
      await task();
      if (successMsg) toast(successMsg, "success");
    } catch (actionError) {
      const msg = actionError instanceof Error ? actionError.message : "Action failed.";
      setError(msg);
      toast(msg, "error");
    }
  };

  const resolveEntryForAction = async (entry: QueueEntry) => {
    if (entry.syncState !== "pending") {
      return entry.id;
    }

    const syncedState = await syncPendingEntries(activeClinicId);
    const syncedEntry = syncedState.queue.find(
      (item) => item.clientRequestId === entry.clientRequestId,
    );

    if (!syncedEntry || syncedEntry.syncState === "pending") {
      throw new Error("Entry abhi server par sync nahi hui. Internet stable karke dobara try karein.");
    }

    return syncedEntry.id;
  };

  const syncPendingEntryFromModal = async () => {
    if (!rxEntry) {
      throw new Error("Queue entry missing.");
    }

    if (rxEntry.syncState !== "pending") {
      return rxEntry.id;
    }

    const syncedState = await syncPendingEntries(activeClinicId);
    const syncedEntry = syncedState.queue.find(
      (item) => item.clientRequestId === rxEntry.clientRequestId,
    );

    if (!syncedEntry || syncedEntry.syncState === "pending") {
      throw new Error("Entry abhi server par sync nahi hui. Internet stable karke dobara try karein.");
    }

    return syncedEntry.id;
  };

  // Fetch patient history for a mobile number
  const fetchHistory = async (mobile: string) => {
    if (!mobile || mobile.length < 10 || historyMap[mobile]) return;
    try {
      const res = await fetch(`/api/patients/${mobile.replace(/\D/g, "").slice(-10)}/history`);
      if (res.ok) {
        const data = await res.json();
        setHistoryMap((prev) => ({ ...prev, [mobile]: data.summary }));
      }
    } catch {
      // silent
    }
  };

  // Login Screen
  if (!session) {
    return (
      <div className="page-shell">
        <div className="section-shell flex min-h-[60vh] items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <div className="fade-up card card-elevated p-6">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)]">
                <Lock className="h-5 w-5 text-[var(--accent)]" />
              </div>
              <h1 className="display-type mt-4 text-center text-xl text-[var(--accent-strong)]">
                {t("staff", "loginTitle")}
              </h1>
              <p className="mt-2 text-center text-xs text-[rgba(19,49,58,0.55)]">
                {t("staff", "loginSubtitle")}
              </p>

              <div className="mt-6">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-[rgba(19,49,58,0.65)]">
                    {t("staff", "enterPin")}
                  </span>
                  <input
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    type="password"
                    inputMode="numeric"
                    className="input text-center text-2xl tracking-[0.5em]"
                    placeholder="····"
                    maxLength={6}
                    onKeyDown={(e) => { if (e.key === "Enter") void login(); }}
                  />
                </label>
              </div>

              {error && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--danger-soft)] px-3 py-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 text-[var(--danger)]" />
                  <p className="text-sm font-medium text-[var(--danger)]">{error}</p>
                </div>
              )}

              <button
                type="button"
                className="btn btn-primary btn-lg mt-5 w-full justify-center"
                onClick={() => void login()}
                disabled={busy}
              >
                {busy ? t("staff", "loggingIn") : t("staff", "loginBtn")}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard
  return (
    <div className="page-shell">
      <div className="section-shell py-6">
        {/* Header */}
        <div>
          <h1 className="display-type text-xl text-[var(--accent-strong)]">
            {t("staff", "title")} — {activeClinic.shortName}
          </h1>
          <p className="mt-1 text-xs text-[rgba(19,49,58,0.6)]">
            {t("staff", "welcomeBack")}, <strong>{session.name}</strong> ({isDoctor ? t("staff", "doctor") : t("staff", "staffRole")})
          </p>
        </div>

        {/* Emergency Banner */}
        {clinicState.emergencyClosed && (
          <div className="mt-4 rounded-xl bg-[rgba(182,93,54,0.1)] border border-[rgba(182,93,54,0.2)] px-4 py-3">
            <p className="text-sm font-semibold text-[#8b4626]">
              ⚠️ {t("emergency", "closedTitle")}
            </p>
            <p className="mt-1 text-xs text-[rgba(139,70,38,0.8)]">
              {clinicState.emergencyMessage || t("emergency", "defaultMessage")}
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-[rgba(182,93,54,0.08)] px-3 py-2 text-sm text-[#8b4626]">{error}</div>
        )}

        {/* ─── Daily Summary Card ─── */}
        <div className="mt-5 rounded-2xl border border-[var(--line)] overflow-hidden">
          <div className="bg-gradient-to-r from-[rgba(15,107,99,0.92)] to-[rgba(10,78,83,0.95)] px-5 py-3.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[rgba(255,255,255,0.55)]">
                {t("staff", "dailySummary")}
              </p>
              <p className="mt-0.5 text-xs text-[rgba(255,255,255,0.7)]">
                {new Date().toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="text-right">
              <p className="display-type text-3xl text-white">{clinicState.queue.length}</p>
              <p className="text-[10px] text-[rgba(255,255,255,0.6)]">{t("staff", "totalPatients")}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-[var(--line)] sm:grid-cols-5">
            <div className="bg-white/80 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase text-[#1f7a54]">{t("staff", "checkupDone")}</p>
              <p className="mt-1 text-xl font-bold text-[#1f7a54]">
                {clinicState.queue.filter((e) => e.status === "done").length}
              </p>
            </div>
            <div className="bg-white/80 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase text-[#8b4626]">{t("staff", "skipped")}</p>
              <p className="mt-1 text-xl font-bold text-[#8b4626]">
                {clinicState.queue.filter((e) => e.status === "skipped").length}
              </p>
            </div>
            <div className="bg-white/80 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase text-[var(--accent)]">{t("staff", "waiting")}</p>
              <p className="mt-1 text-xl font-bold">
                {clinicState.queue.filter((e) => e.status === "waiting").length}
              </p>
            </div>
            <div className="bg-white/80 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase text-[rgba(19,49,58,0.55)]">{t("staff", "holdCount")}</p>
              <p className="mt-1 text-xl font-bold">{summary.holdCount}</p>
            </div>
            <div className="bg-white/80 px-4 py-3 col-span-2 sm:col-span-1">
              <p className="text-[10px] font-semibold uppercase text-[rgba(19,49,58,0.55)]">{t("staff", "bookings")}/{t("staff", "walkins")}</p>
              <p className="mt-1 text-xl font-bold">{summary.bookings}/{summary.walkIns}</p>
            </div>
          </div>
        </div>

        {/* Live Token Stats */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[rgba(19,49,58,0.94)] p-4 text-white">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.55)]">{t("staff", "currentToken")}</p>
            <p className="display-type mt-2 text-3xl">{summary.current?.token ?? "--"}</p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-white/70 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--accent)]">{t("staff", "nextToken")}</p>
            <p className="mt-2 text-2xl font-semibold">{summary.next?.token ?? "--"}</p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-white/70 p-4 col-span-2 sm:col-span-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--accent)]">{t("queue", "pendingCount")}</p>
            <p className="mt-2 text-2xl font-semibold">{pendingEntries.length}</p>
          </div>
        </div>

        {/* Controls — role-based */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
            style={{background:'var(--accent-strong)'}}
          >
            <UserPlus className="h-4 w-4" />
            + New Walk-in
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void runAction(async () => { await advanceQueue(); }, t("staff", "advanceBtn") + " ✓")}
          >
            <PlayCircle className="h-4 w-4" />
            {t("staff", "advanceBtn")}
          </button>

          {isDoctor && (
            <>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  if (confirm(t("staff", "resetConfirm"))) {
                    void runAction(async () => { await resetClinicState(); }, t("staff", "resetQueue") + " ✓");
                  }
                }}
              >
                <RotateCcw className="h-4 w-4" />
                {t("staff", "resetQueue")}
              </button>
              <button
                type="button"
                className={clinicState.emergencyClosed ? "btn btn-primary" : "btn btn-danger"}
                onClick={() => {
                    if (clinicState.emergencyClosed) {
                      void runAction(
                        async () => {
                          await setEmergencyState({
                            emergencyClosed: false,
                            emergencyMessage: "",
                          });
                        },
                        t("emergency", "reopenClinic"),
                      );
                    } else {
                      setEmergencyMsg(t("emergency", "defaultMessage"));
                      setShowEmergencyModal(true);
                  }
                }}
              >
                {clinicState.emergencyClosed
                  ? <><ShieldCheck className="h-4 w-4" />{t("emergency", "reopenClinic")}</>
                  : <><ShieldAlert className="h-4 w-4" />{t("emergency", "closeClinic")}</>}
              </button>
            </>
          )}
        </div>

        {/* Emergency Close Modal */}
        {showEmergencyModal && isDoctor && (
          <div className="mt-4 card p-5" style={{borderColor:'rgba(192,57,43,0.2)', background:'var(--danger-soft)'}}>
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--danger)]">
              <ShieldAlert className="h-4 w-4" /> {t("emergency", "closeClinic")}
            </p>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-semibold text-[rgba(19,49,58,0.65)]">
                {t("emergency", "enterMessage")}
              </span>
              <textarea
                value={emergencyMsg}
                onChange={(e) => setEmergencyMsg(e.target.value)}
                className="input"
                rows={2}
              />
            </label>
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn btn-danger"
                onClick={() => {
                  void runAction(
                    async () => {
                      await setEmergencyState({
                        emergencyClosed: true,
                        emergencyMessage: emergencyMsg,
                      });
                      setShowEmergencyModal(false);
                    },
                    t("emergency", "closeClinic"),
                  );
                }}>
                <ShieldAlert className="h-4 w-4" /> {t("emergency", "closeClinic")}
              </button>
              <button type="button" className="btn btn-outline"
                onClick={() => setShowEmergencyModal(false)}>
                {t("common", "cancel")}
              </button>
            </div>
          </div>
        )}

                  {/* Booking Controls */}
          {isDoctor && (
            <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-container)] overflow-hidden">
              <div className="border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3 font-semibold text-sm flex items-center gap-2 text-[var(--accent-strong)]">
                <CalendarCheck className="h-4 w-4" /> Booking Controls
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Online Booking (Aaj)</p>
                    <p className="text-xs text-[var(--foreground-muted)] opacity-80">Allow patients to book slots for today</p>
                  </div>
                  <button 
                    type="button" 
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${!clinicState.bookingClosedToday ? "bg-[var(--primary)] text-white" : "bg-[rgba(19,49,58,0.1)] text-[var(--foreground-muted)]"}`}
                    onClick={() => {
                      void runAction(
                        async () => {
                          await setBookingState({ bookingClosedToday: !clinicState.bookingClosedToday });
                        },
                        "Toggle Booking Today"
                      );
                    }}
                  >
                    {!clinicState.bookingClosedToday ? "ON" : "OFF"}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Online Booking (Kal)</p>
                    <p className="text-xs text-[var(--foreground-muted)] opacity-80">Allow patients to book slots for tomorrow</p>
                  </div>
                  <button 
                    type="button" 
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${!clinicState.bookingClosedTomorrow ? "bg-[var(--primary)] text-white" : "bg-[rgba(19,49,58,0.1)] text-[var(--foreground-muted)]"}`}
                    onClick={() => {
                      void runAction(
                        async () => {
                          await setBookingState({ bookingClosedTomorrow: !clinicState.bookingClosedTomorrow });
                        },
                        "Toggle Booking Tomorrow"
                      );
                    }}
                  >
                    {!clinicState.bookingClosedTomorrow ? "ON" : "OFF"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Queue Tabs */}
        <div className="mt-6 flex gap-1 rounded-xl bg-[rgba(19,49,58,0.06)] p-1 overflow-x-auto no-scrollbar">
          <button
            type="button"
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === "live"
                ? "bg-white text-[var(--accent-strong)] shadow-sm"
                : "text-[rgba(19,49,58,0.55)]"
            }`}
            onClick={() => setTab("live")}
          >
            Live ({liveQueue.length})
          </button>
          <button
            type="button"
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === "scheduled"
                ? "bg-white text-[var(--accent-strong)] shadow-sm"
                : "text-[rgba(19,49,58,0.55)]"
            }`}
            onClick={() => setTab("scheduled")}
          >
            Scheduled ({scheduledToday.length})
          </button>
          <button
            type="button"
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === "tomorrow"
                ? "bg-white text-[var(--accent-strong)] shadow-sm"
                : "text-[rgba(19,49,58,0.55)]"
            }`}
            onClick={() => setTab("tomorrow")}
          >
            Tomorrow ({tomorrowBookings.length})
          </button>
          <button
            type="button"
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === "complete"
                ? "bg-white text-[var(--accent-strong)] shadow-sm"
                : "text-[rgba(19,49,58,0.55)]"
            }`}
            onClick={() => setTab("complete")}
          >
            Done ({completeEntries.length})
          </button>
        </div>

        {/* Queue List */}
        <div className="mt-4 card p-4">
          {visibleEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Inbox className="h-10 w-10 text-[rgba(19,49,58,0.2)]" />
              <p className="mt-3 text-sm font-medium text-[rgba(19,49,58,0.45)]">{t("staff", "noPatients")}</p>
            </div>
          ) : (
            <div className="space-y-2 stagger-children">
              {visibleEntries.map((entry) => (
                <div key={entry.id} className={`fade-up card p-3 ${entry.status === "done" || entry.status === "skipped" ? "opacity-75" : ""}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-2.5">
                        <span className={`queue-dot mt-2 ${entry.status}`} />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-lg font-bold">{entry.token}</span>
                            <span className={`badge ${entry.source === 'booking' ? 'badge-booking' : 'badge-walkin'}`}>
                              {entry.source}
                            </span>
                            <span className={`badge badge-${entry.status === 'in-progress' ? 'in-progress' : entry.status}`}>
                              {entry.status}
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm font-medium">{entry.name}</p>
                          <p className="flex items-center gap-1 text-xs text-[rgba(19,49,58,0.5)]">
                            <CalendarClock className="h-3 w-3" /> {entry.dayLabel} · {entry.slotLabel}
                            {entry.mobile && <><Phone className="ml-1 h-3 w-3" /> {entry.mobile}</>}
                            {!entry.mobile && <span className="text-[rgba(19,49,58,0.35)]">{t("staff", "noMobile")}</span>}
                          </p>
                          {/* Patient history badge */}
                          {entry.mobile && historyMap[entry.mobile] && (
                            <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-[var(--accent)]">
                              <ClipboardList className="h-3 w-3" /> {t("history", "totalVisits")}: {historyMap[entry.mobile].totalVisits}
                              {historyMap[entry.mobile].lastVisitDate && ` · ${t("history", "lastVisit")}: ${historyMap[entry.mobile].lastVisitDate}`}
                            </p>
                          )}
                          {/* Fetch history on first view */}
                          {entry.mobile && !historyMap[entry.mobile] && (
                            <button
                              type="button"
                              className="mt-0.5 text-[10px] font-semibold text-[var(--accent)] underline"
                              onClick={() => void fetchHistory(entry.mobile!)}
                            >
                              {t("history", "viewHistory")}
                            </button>
                          )}
                        </div>
                      </div>
                      {entry.status !== "done" && entry.status !== "skipped" && (
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" className="btn btn-primary btn-sm"
                            onClick={() => void runAction(async () => {
                              const resolvedEntryId = await resolveEntryForAction(entry);
                              await updateQueueStatus(resolvedEntryId, "in-progress");
                            })}>
                          <PlayCircle className="h-3 w-3" /> {t("staff", "callNow")}
                        </button>
                        <button type="button" className="btn btn-sm" style={{background:'var(--success)',color:'white'}}
                          onClick={() =>
                            setRxEntry({
                              id: entry.id,
                              token: entry.token,
                              name: entry.name,
                              clientRequestId: entry.clientRequestId,
                              syncState: entry.syncState,
                            })}
                        >
                          <CheckCircle2 className="h-3 w-3" /> {t("staff", "doneBtn")}
                        </button>
                        <button type="button" className="btn btn-outline btn-sm"
                          onClick={() => void runAction(async () => {
                            const resolvedEntryId = await resolveEntryForAction(entry);
                            await updateQueueStatus(resolvedEntryId, entry.status === "hold" ? "waiting" : "hold");
                          })}>
                          <PauseCircle className="h-3 w-3" /> {entry.status === "hold" ? t("staff", "resumeBtn") : "Test / Hold"}
                        </button>
                        {entry.status === "hold" && (
                          <button type="button" className="btn btn-sm" style={{background:'var(--accent)',color:'white'}}
                            onClick={() => void runAction(async () => {
                              const resolvedEntryId = await resolveEntryForAction(entry);
                              await markReportCheck(resolvedEntryId);
                            }, "Patient inserted for report check ✓")}>
                            <RotateCcw className="h-3 w-3" /> Insert for Report
                          </button>
                        )}
                        <button type="button" className="btn btn-ghost btn-sm"
                          onClick={() => {
                            if (confirm(t("queue", "shiftConfirm"))) {
                              void runAction(async () => {
                                const resolvedEntryId = await resolveEntryForAction(entry);
                                await rescheduleQueueEntry(resolvedEntryId);
                              });
                            }
                          }}>
                          <CalendarClock className="h-3 w-3" /> {t("queue", "shiftToTomorrow")}
                        </button>
                        <button type="button" className="btn btn-danger btn-sm"
                          onClick={() => void runAction(async () => {
                            const resolvedEntryId = await resolveEntryForAction(entry);
                            await updateQueueStatus(resolvedEntryId, "skipped");
                          })}>
                          <SkipForward className="h-3 w-3" /> {t("staff", "skipBtn")}
                        </button>
                        </div>
                      )}

                      {(entry.status === "done" || entry.status === "skipped") && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <button type="button" className="btn btn-outline btn-sm"
                            onClick={() => void runAction(async () => {
                              const resolvedEntryId = await resolveEntryForAction(entry);
                              await updateQueueStatus(resolvedEntryId, "waiting");
                            }, "Patient re-queued successfully")}>
                            <RotateCcw className="h-3 w-3" /> Re-Queue / Undo
                          </button>
                        </div>
                      )}
                    </div>
                </div>
              ))}
              </div>

            )}
        </div>
      </div>

      {/* Prescription Photo Modal */}
      {rxEntry && (
        <PrescriptionModal
          tokenId={rxEntry.token}
          patientName={rxEntry.name}
          clinicId={activeClinicId}
          createdBy={session?.id || "staff"}
          onDone={() => {
            // Mark entry as done after photo sent or skipped
            void runAction(
              async () => {
                const resolvedEntryId = await syncPendingEntryFromModal();
                await updateQueueStatus(resolvedEntryId, "done");
              },
              t("staff", "doneBtn") + " ✓",
            );
            setRxEntry(null);
          }}
          onClose={() => setRxEntry(null)}
        />
      )}

      {/* Quick Add Walk-in Modal */}
      {showAddModal && (
        <QuickAddModal 
          onClose={() => setShowAddModal(false)}
          onAdd={async (name, mobile) => {
            const resultState = await createWalkIn({
              clinicId: activeClinicId,
              name,
              mobile: mobile || undefined,
            });
            // We need to return the token to the modal so it can show the success screen & print option
            // Find the most recently added pending entry
            const sortedPending = [...resultState.queue].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            const token = sortedPending[0]?.token || "Walk-in";
            return { token };
          }}
        />
      )}
    </div>
  );
}
