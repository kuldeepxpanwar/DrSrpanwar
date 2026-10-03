"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  Clock,
  User,
  Phone,
  CheckCircle2,
  Share2,
  Eye,
  PlusCircle,
  AlertTriangle,
  Pill,
  Loader2,
} from "lucide-react";
import { buildClinicHref } from "@/features/clinic/catalog";
import { useClinic } from "@/features/clinic/state/clinic-provider";
import { useLang } from "@/i18n/lang-provider";

const dayOptions = ["Aaj", "Kal"] as const;

/** Format date as localized string like "रवि, 26 अप्रैल 2026" */
function formatDateLabel(date: Date, lang: string): string {
  return date.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Get day name in English for schedule lookup */
function getDayName(date: Date): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()];
}

/**
 * Generate time slots between open and close times.
 * E.g. generateSlots("09:00", "13:00", 30) => ["09:00 AM","09:30 AM","10:00 AM",...]
 */
function generateSlots(openTime: string, closeTime: string, intervalMin = 30): string[] {
  if (!openTime || !closeTime) return [];
  const slots: string[] = [];
  const [oh, om] = openTime.split(":").map(Number);
  const [ch, cm] = closeTime.split(":").map(Number);
  let current = oh * 60 + (om || 0);
  const end = ch * 60 + (cm || 0);

  while (current < end) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    slots.push(`${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`);
    current += intervalMin;
  }
  return slots;
}

/** Default fallback slots if schedule hasn't been configured yet */
const defaultSlots: Record<string, string[]> = {
  surgery: generateSlots("09:00", "17:00"),
  dental: generateSlots("10:00", "17:00"),
};

/**
 * Filter out past time slots for today.
 * Returns only slots that are in the future (with a small buffer).
 */
function filterPastSlots(slots: string[]): string[] {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return slots.filter((slot) => {
    // Parse "09:30 AM" or "01:00 PM" format
    const match = slot.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return true; // keep slot if can't parse
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const period = match[3].toUpperCase();
    if (period === "PM" && h !== 12) h += 12;
    if (period === "AM" && h === 12) h = 0;
    const slotMinutes = h * 60 + m;
    // Only show slots at least 15 minutes in the future
    return slotMinutes > currentMinutes + 15;
  });
}

function buildWhatsAppUrl(clinic: string, token: string, day: string, slot: string): string {
  const msg = encodeURIComponent(
    `🏥 मेरा अपॉइंटमेंट बुक हो गया!\n\n` +
    `📋 टोकन: ${token}\n` +
    `🏥 क्लिनिक: ${clinic}\n` +
    `📅 ${day} · ${slot}\n\n` +
    `Panwar SmartCare Hub`
  );
  return `https://wa.me/?text=${msg}`;
}

type BookingConfirmation = {
  bookingId: string;
  token: string;
  dayLabel: string;
  slotLabel: string;
  syncState: "synced" | "pending";
};

type DayScheduleData = {
  dayName: string;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
  slots: string[];
  maxPatients: number;
};

type ShiftGroup = {
  label: string;
  startTime: string;
  endTime: string;
  slots: string[];
  closed: boolean;
};

type DayAvailability = {
  isOpen: boolean;
  dateLabel: string;
  dayName: string;
  shiftGroups: ShiftGroup[];
};

export default function BookPage() {
  const { activeClinic, activeClinicId, createBooking, syncInFlight, state } = useClinic();
  const { t } = useLang();

  const [dayLabel, setDayLabel] = useState<"Aaj" | "Kal">("Aaj");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [requiresPharmacyFollowUp, setRequiresPharmacyFollowUp] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scheduleSlots, setScheduleSlots] = useState<Record<string, string[]>>({});
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [dayAvailability, setDayAvailability] = useState<Record<string, DayAvailability>>({
    Aaj: { isOpen: true, dateLabel: "", dayName: "", shiftGroups: [] },
    Kal: { isOpen: true, dateLabel: "", dayName: "", shiftGroups: [] },
  });
  const [currentTime, setCurrentTime] = useState(new Date());

  // Live clock — update every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Fetch schedule using resolved API (shift-aware)
  useEffect(() => {
    const fetchSchedule = async () => {
      setLoadingSlots(true);
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const todayName = getDayName(today);
      const tomorrowName = getDayName(tomorrow);
      const lang = document.documentElement.lang || "hi";
      const todayDateLabel = formatDateLabel(today, lang);
      const tomorrowDateLabel = formatDateLabel(tomorrow, lang);

      try {
        // Try resolved API first (shift-aware)
        const resolvedRes = await fetch(`/api/schedule?clinic=${activeClinicId}&mode=resolved`);
        if (resolvedRes.ok) {
          const data = await resolvedRes.json();
          const todayData = data.today;
          const tomorrowData = data.tomorrow;

          const todayShifts: ShiftGroup[] = (todayData?.shifts || []).map((s: ShiftGroup) => ({
            label: s.label, startTime: s.startTime, endTime: s.endTime,
            slots: s.slots || [], closed: s.closed || false,
          }));
          const tomorrowShifts: ShiftGroup[] = (tomorrowData?.shifts || []).map((s: ShiftGroup) => ({
            label: s.label, startTime: s.startTime, endTime: s.endTime,
            slots: s.slots || [], closed: s.closed || false,
          }));

          const todayIsOpen = (todayData?.isOpen ?? true) && !state?.bookingClosedToday;
          const tomorrowIsOpen = (tomorrowData?.isOpen ?? true) && !state?.bookingClosedTomorrow;

          setDayAvailability({
            Aaj: { isOpen: todayIsOpen, dateLabel: todayDateLabel, dayName: todayName, shiftGroups: todayShifts },
            Kal: { isOpen: tomorrowIsOpen, dateLabel: tomorrowDateLabel, dayName: tomorrowName, shiftGroups: tomorrowShifts },
          });

          const newSlots: Record<string, string[]> = {
            Aaj: todayIsOpen ? todayShifts.flatMap(s => s.closed ? [] : s.slots) : [],
            Kal: tomorrowIsOpen ? tomorrowShifts.flatMap(s => s.closed ? [] : s.slots) : [],
          };
          setScheduleSlots(newSlots);

          if (!todayIsOpen && tomorrowIsOpen) setDayLabel("Kal");
        } else {
          // Fallback to legacy API
          const res = await fetch(`/api/schedule?clinic=${activeClinicId}&weekOffset=0`);
          if (res.ok) {
            const data = await res.json();
            const schedule: DayScheduleData[] = data.schedule || [];
            const todaySchedule = schedule.find((d) => d.dayName === todayName);
            const tomorrowSchedule = schedule.find((d) => d.dayName === tomorrowName);
            const todayIsOpen = (todaySchedule?.isOpen ?? true) && !state?.bookingClosedToday;
            const tomorrowIsOpen = (tomorrowSchedule?.isOpen ?? true) && !state?.bookingClosedTomorrow;

            setDayAvailability({
              Aaj: { isOpen: todayIsOpen, dateLabel: todayDateLabel, dayName: todayName, shiftGroups: [] },
              Kal: { isOpen: tomorrowIsOpen, dateLabel: tomorrowDateLabel, dayName: tomorrowName, shiftGroups: [] },
            });

            const newSlots: Record<string, string[]> = {};
            if (todayIsOpen && todaySchedule?.slots?.length) newSlots["Aaj"] = todaySchedule.slots;
            else if (todayIsOpen) newSlots["Aaj"] = defaultSlots[activeClinicId] || [];
            else newSlots["Aaj"] = [];

            if (tomorrowIsOpen && tomorrowSchedule?.slots?.length) newSlots["Kal"] = tomorrowSchedule.slots;
            else if (tomorrowIsOpen) newSlots["Kal"] = defaultSlots[activeClinicId] || [];
            else newSlots["Kal"] = [];

            setScheduleSlots(newSlots);
            if (!todayIsOpen && tomorrowIsOpen) setDayLabel("Kal");
          }
        }
      } catch {
        const todayDateL = formatDateLabel(new Date(), lang);
        const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1);
        setDayAvailability({
          Aaj: { isOpen: true, dateLabel: todayDateL, dayName: todayName, shiftGroups: [] },
          Kal: { isOpen: true, dateLabel: formatDateLabel(tmrw, lang), dayName: tomorrowName, shiftGroups: [] },
        });
        setScheduleSlots({
          Aaj: defaultSlots[activeClinicId] || [],
          Kal: defaultSlots[activeClinicId] || [],
        });
      } finally {
        setLoadingSlots(false);
      }
    };
    void fetchSchedule();
  }, [activeClinicId]);

  const currentSlots = useMemo(() => {
    const raw = scheduleSlots[dayLabel] || defaultSlots[activeClinicId] || [];
    return dayLabel === "Aaj" ? filterPastSlots(raw) : raw;
  }, [scheduleSlots, dayLabel, activeClinicId]);
  const [slotLabel, setSlotLabel] = useState("");
  const selectedSlot = currentSlots.includes(slotLabel) ? slotLabel : (currentSlots[0] ?? "");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setError(t("booking", "nameRequired"));
      return;
    }
    // Mobile is OPTIONAL — only validate if provided
    if (mobile.trim() && mobile.replace(/\D/g, "").length !== 10) {
      setError(t("booking", "invalidMobile"));
      return;
    }
    setIsSubmitting(true);
    try {
      const nextState = await createBooking({
        clinicId: activeClinicId,
        dayLabel,
        slotLabel: selectedSlot,
        name,
        mobile: mobile.trim() || "",
        requiresPharmacyFollowUp,
      });
      const latestEntry = nextState.queue[nextState.queue.length - 1];
      setConfirmation({
        bookingId: latestEntry.bookingId,
        token: latestEntry.token,
        dayLabel: latestEntry.dayLabel,
        slotLabel: latestEntry.slotLabel,
        syncState: latestEntry.syncState,
      });
      setName("");
      setMobile("");
      setError("");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Booking failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!activeClinic.hasBooking) {
    return (
      <div className="page-shell">
        <div className="section-shell flex min-h-[50vh] items-center justify-center py-10">
          <div className="mx-auto max-w-md text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)]">
              <Pill className="h-6 w-6 text-[var(--accent)]" />
            </div>
            <h1 className="display-type mt-4 text-xl text-[var(--accent-strong)]">
              {t("pharmacy", "infoTitle")}
            </h1>
            <p className="mt-3 text-sm text-[rgba(19,49,58,0.6)]">
              {t("pharmacy", "noBookingNeeded")}
            </p>
            <div className="card mt-4 space-y-2 p-4 text-left">
              <p className="flex items-center gap-2 text-sm text-[rgba(19,49,58,0.65)]">
                <Clock className="h-3.5 w-3.5 text-[var(--accent)]" /> {state.settings?.address || activeClinic.locationLabel}
              </p>
              <p className="flex items-center gap-2 text-sm text-[rgba(19,49,58,0.65)]">
                <Clock className="h-3.5 w-3.5 text-[var(--accent)]" /> {activeClinic.hoursLabel}
              </p>
              <p className="flex items-center gap-2 text-sm text-[rgba(19,49,58,0.65)]">
                <Phone className="h-3.5 w-3.5 text-[var(--accent)]" /> {state.settings?.phone || activeClinic.phone}
              </p>
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link href={buildClinicHref("/walkin", activeClinicId)} className="btn btn-warm btn-lg">
                {t("pharmacy", "pickupToken")}
              </Link>
              <Link href={buildClinicHref("/", activeClinicId)} className="btn btn-outline btn-lg">
                {t("common", "back")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (confirmation) {
    return (
      <div className="page-shell">
        <div className="section-shell py-10">
          <div className="mx-auto max-w-lg">
            <div className="fade-up card card-elevated p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--success-soft)]">
                <CheckCircle2 className="h-6 w-6 text-[var(--success)]" />
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--success)]">
                {t("booking", "confirmed")}
              </p>
              <div className="mt-5 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-strong)] p-5 text-white">
                <p className="text-[10px] uppercase tracking-[0.24em] text-[rgba(255,255,255,0.6)]">
                  {t("booking", "token")}
                </p>
                <p className="display-type mt-2 text-5xl">{confirmation.token}</p>
              </div>
              <div className="mt-4 space-y-1.5 text-sm text-[rgba(19,49,58,0.65)]">
                <p>{t("booking", "bookingId")}: <strong>{confirmation.bookingId}</strong></p>
                <p className="flex items-center justify-center gap-1.5">
                  <CalendarCheck className="h-3.5 w-3.5 text-[var(--accent)]" />
                  {confirmation.dayLabel} · {confirmation.slotLabel}
                </p>
                <p>{t("common", "clinic")}: <strong>{activeClinic.shortName}</strong></p>
                <span className={`badge ${confirmation.syncState === "pending" ? "badge-waiting" : "badge-done"}`}>
                  {confirmation.syncState === "pending" ? t("booking", "pending") : t("booking", "synced")}
                </span>
              </div>
              {syncInFlight && (
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--accent)]">
                  <Loader2 className="h-3 w-3 animate-spin-slow" /> {t("home", "syncing")}...
                </p>
              )}
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--warm-soft)] px-3 py-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-[var(--warm)]" />
                <p className="text-xs font-medium text-[#8b4626] text-left">{t("booking", "screenshotNote")}</p>
              </div>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <a
                  href={buildWhatsAppUrl(
                    activeClinic.shortName,
                    confirmation.token,
                    confirmation.dayLabel === "Aaj" ? t("booking", "today") : t("booking", "tomorrow"),
                    confirmation.slotLabel,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm" style={{background:'#25D366',color:'white'}}
                >
                  <Share2 className="h-3 w-3" /> {t("whatsapp", "shareBtn")}
                </a>
                <Link href={buildClinicHref("/status", activeClinicId)} className="btn btn-outline btn-sm">
                  <Eye className="h-3 w-3" /> {t("booking", "viewToken")}
                </Link>
                <button type="button" onClick={() => setConfirmation(null)} className="btn btn-primary btn-sm">
                  <PlusCircle className="h-3 w-3" /> {t("booking", "bookAnother")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="section-shell py-8">
        <div className="mx-auto max-w-2xl">
          <h1 className="display-type text-center text-2xl text-[var(--accent-strong)] sm:text-3xl">
            {t("booking", "title")} — {activeClinic.shortName}
          </h1>

            <div className="mt-8 space-y-5">
            {/* Step 1: Day */}
            <div className="card p-5">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--accent)]">
                <CalendarCheck className="h-3.5 w-3.5" />
                {t("booking", "step")} 1 · {t("booking", "chooseDay")}
              </p>

              {/* Live Date & Time Banner */}
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--surface-container-low,var(--accent-soft))] px-3 py-2">
                <Clock className="h-3.5 w-3.5 text-[var(--accent)]" />
                <p className="text-xs font-medium text-[var(--foreground)]">
                  {currentTime.toLocaleDateString("hi-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  {" · "}
                  <span className="font-semibold text-[var(--accent)]">
                    {currentTime.toLocaleTimeString("hi-IN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                {dayOptions.map((day) => {
                  const avail = dayAvailability[day];
                  const isClosed = !avail?.isOpen;
                  const isSelected = dayLabel === day;

                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={isClosed}
                      className={`rounded-xl px-4 py-3 text-left transition ${
                        isClosed
                          ? "opacity-50 cursor-not-allowed border border-[var(--line)] bg-[var(--surface-container,#f5eddf)]"
                          : isSelected
                            ? "bg-gradient-to-r from-[var(--accent-deep,var(--accent))] to-[var(--accent)] text-white shadow-md"
                            : "border border-[var(--line)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
                      }`}
                      onClick={() => !isClosed && setDayLabel(day)}
                    >
                      <p className="text-lg font-semibold">
                        {day === "Aaj" ? t("booking", "today") : t("booking", "tomorrow")}
                      </p>
                      {/* Show actual date below */}
                      {avail?.dateLabel && (
                        <p className={`mt-0.5 text-[10px] ${
                          isSelected && !isClosed ? "text-[rgba(255,255,255,0.7)]" : "text-[rgba(19,49,58,0.45)]"
                        }`}>
                          {avail.dateLabel}
                        </p>
                      )}
                      {/* Show closed label */}
                      {isClosed && (
                        <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-[var(--danger)]">
                          <AlertTriangle className="h-3 w-3" />
                          {t("booking", "closed") || "बंद"}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Both days closed warning */}
              {!dayAvailability.Aaj?.isOpen && !dayAvailability.Kal?.isOpen && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--danger-soft)] px-3 py-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 text-[var(--danger)]" />
                  <p className="text-sm font-medium text-[var(--danger)]">
                    {t("booking", "bothDaysClosed") || "आज और कल दोनों दिन क्लिनिक बंद है"}
                  </p>
                </div>
              )}
            </div>

            {/* Step 2: Slot */}
            <div className="card p-5">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--accent)]">
                <Clock className="h-3.5 w-3.5" />
                {t("booking", "step")} 2 · {t("booking", "chooseSlot")}
              </p>
              {loadingSlots ? (
                <p className="mt-3 flex items-center gap-1.5 text-sm text-[rgba(19,49,58,0.5)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin-slow" /> {t("common", "loading")}
                </p>
              ) : currentSlots.length === 0 ? (
                <div className="mt-3 flex flex-col gap-2 rounded-xl bg-[var(--warm-soft)] px-3 py-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 text-[var(--warm)]" />
                    <p className="text-sm font-medium text-[#8b4626]">
                      {dayLabel === "Aaj"
                        ? (t("booking", "todayClosed") || "आज के सभी स्लॉट बीत चुके हैं")
                        : `${t("booking", "closed")} — ${t("booking", "tomorrow")}`}
                    </p>
                  </div>
                  {dayLabel === "Aaj" && (
                    <button type="button" className="btn btn-warm btn-sm self-start"
                      onClick={() => setDayLabel("Kal")}>
                      <CalendarCheck className="h-3 w-3" />
                      {t("booking", "bookTomorrow") || "कल के लिए बुक करें →"}
                    </button>
                  )}
                </div>
              ) : dayAvailability[dayLabel]?.shiftGroups?.length > 0 ? (
                /* ── Shift-Grouped Slots ── */
                <div className="mt-3 space-y-4">
                  {dayAvailability[dayLabel].shiftGroups.map((group, gIdx) => {
                    if (group.closed || group.slots.length === 0) return null;
                    const filteredSlots = dayLabel === "Aaj" ? filterPastSlots(group.slots) : group.slots;
                    if (filteredSlots.length === 0) return null;
                    return (
                      <div key={gIdx}>
                        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[rgba(19,49,58,0.45)]">
                          {gIdx === 0 ? "☀️" : gIdx === 1 ? "🌤️" : "🌙"} {group.label} ({group.startTime} – {group.endTime})
                        </p>
                        <div className="mt-1.5 grid grid-cols-3 gap-2">
                          {filteredSlots.map((slot) => (
                            <button key={slot} type="button"
                              className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                                slotLabel === slot
                                  ? "bg-[var(--warm)] text-white shadow-sm"
                                  : "border border-[var(--line)] hover:border-[var(--warm)] hover:bg-[var(--warm-soft)]"
                              }`}
                              onClick={() => setSlotLabel(slot)}>
                              {slot}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* ── Flat Slots (legacy fallback) ── */
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {currentSlots.map((slot) => (
                    <button key={slot} type="button"
                      className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                        slotLabel === slot
                          ? "bg-[var(--warm)] text-white shadow-sm"
                          : "border border-[var(--line)] hover:border-[var(--warm)] hover:bg-[var(--warm-soft)]"
                      }`}
                      onClick={() => setSlotLabel(slot)}>
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Step 3: Details */}
            <div className="card p-5">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--accent)]">
                <User className="h-3.5 w-3.5" />
                {t("booking", "step")} 3 · {t("booking", "patientDetails")}
              </p>
              <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-[rgba(19,49,58,0.65)]">
                      {t("booking", "patientName")} *
                    </span>
                    <input value={name} onChange={(e) => setName(e.target.value)}
                      className="input" placeholder={t("booking", "namePlaceholder")} />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-[rgba(19,49,58,0.65)]">
                      {t("common", "mobile")} <span className="font-normal text-[rgba(19,49,58,0.4)]">(optional)</span>
                    </span>
                    <input value={mobile} onChange={(e) => setMobile(e.target.value)}
                      inputMode="numeric" className="input" placeholder={t("booking", "mobilePlaceholder")} />
                  </label>
                </div>

                <label className="card flex items-center gap-2.5 px-3 py-2.5 text-sm text-[rgba(19,49,58,0.65)] cursor-pointer">
                  <input type="checkbox" checked={requiresPharmacyFollowUp}
                    onChange={(e) => setRequiresPharmacyFollowUp(e.target.checked)}
                    className="h-4 w-4 accent-[var(--accent)]" />
                  <Pill className="h-4 w-4 text-[var(--accent)]" />
                  {t("booking", "pharmacyFollowUp")}
                </label>

                {error && (
                  <div className="flex items-center gap-2 rounded-xl bg-[var(--danger-soft)] px-3 py-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 text-[var(--danger)]" />
                    <p className="text-sm font-medium text-[var(--danger)]">{error}</p>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button type="submit" className="btn btn-primary btn-lg"
                    disabled={isSubmitting || currentSlots.length === 0}>
                    {isSubmitting
                      ? <><Loader2 className="h-4 w-4 animate-spin-slow" /> {t("common", "loading")}</>
                      : <><CalendarCheck className="h-4 w-4" /> {t("booking", "confirmBtn")}</>}
                  </button>
                  <span className="badge badge-booking">
                    {dayLabel === "Aaj" ? t("booking", "today") : t("booking", "tomorrow")} · {slotLabel || "—"}
                  </span>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
