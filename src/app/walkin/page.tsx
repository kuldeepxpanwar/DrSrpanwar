"use client";

import { FormEvent, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ticket, User, Phone, Share2, Eye, AlertTriangle, Pill, Loader2, CheckCircle2 } from "lucide-react";
import { buildClinicHref } from "@/features/clinic/catalog";
import { getEntryPosition, getQueueSummary } from "@/features/clinic/services/queue-engine";
import { useClinic } from "@/features/clinic/state/clinic-provider";
import { useLang } from "@/i18n/lang-provider";
import { useClinicSchedule } from "@/features/clinic/hooks/use-clinic-schedule";

type WalkInConfirmation = {
  token: string;
  bookingId: string;
  waitMinutes: number;
  syncState: "synced" | "pending";
};

export default function WalkInPage() {
  const { activeClinic, activeClinicId, createWalkIn, isOnline, syncInFlight, state } = useClinic();
  const { t } = useLang();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [requiresPharmacyFollowUp, setRequiresPharmacyFollowUp] = useState(activeClinicId === "pharmacy");
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<WalkInConfirmation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const router = useRouter();
  const schedule = useClinicSchedule(activeClinicId);

  useEffect(() => {
    if (redirectCountdown === null) return;
    
    if (redirectCountdown === 0) {
      router.push(buildClinicHref("/live", activeClinicId));
      return;
    }
    
    const timer = setTimeout(() => {
      setRedirectCountdown(prev => (prev !== null ? prev - 1 : null));
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [redirectCountdown, router, activeClinicId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() && mobile.replace(/\D/g, "").length === 0) {
      setError(t("walkin", "nameOrMobileRequired"));
      return;
    }
    if (mobile && mobile.replace(/\D/g, "").length > 0 && mobile.replace(/\D/g, "").length !== 10) {
      setError(t("booking", "invalidMobile"));
      return;
    }
    setIsSubmitting(true);
    try {
      const nextState = await createWalkIn({
        clinicId: activeClinicId,
        name,
        mobile,
        requiresPharmacyFollowUp,
      });
      const latestEntry = nextState.queue[nextState.queue.length - 1];
      const position = getEntryPosition(nextState, latestEntry.id);
      const summary = getQueueSummary(nextState);
      setConfirmation({
        token: latestEntry.token,
        bookingId: latestEntry.bookingId,
        waitMinutes: Math.max(position?.estimatedWaitMinutes ?? 0, summary.current ? 10 : 0),
        syncState: latestEntry.syncState,
      });
      setError("");
      setName("");
      setMobile("");
      
      // Save token to localStorage so Live Queue can highlight it
      if (typeof window !== "undefined") {
        window.localStorage.setItem('my_clinic_token', latestEntry.token);
      }
      
      // Start countdown to redirect
      setRedirectCountdown(5);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Token generation failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="section-shell py-8">
        <div className="mx-auto max-w-lg">
          <h1 className="display-type text-center text-2xl text-[var(--accent-strong)] sm:text-3xl">
            {t("walkin", "title")} — {activeClinic.shortName}
          </h1>
          <p className="mt-2 text-center text-sm text-[rgba(19,49,58,0.65)]">
            {t("walkin", "subtitle")}
          </p>

          <div className="mt-8 grid gap-6">
            {/* Form or Block Message */}
            {!confirmation && (schedule.status === "on_leave" || state?.emergencyClosed) ? (
              <div className="card p-8 text-center flex flex-col items-center">
                <div className="h-16 w-16 rounded-full bg-red-50 text-red-500 flex items-center justify-center mb-4">
                  <AlertTriangle className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-bold text-[var(--accent-strong)] mb-2">{t("home", "tokensClosed")}</h3>
                <p className="text-sm text-[rgba(19,49,58,0.7)] mb-6">
                  {state?.emergencyClosed ? (state?.emergencyMessage || t("emergency", "defaultMessage")) : schedule.message}
                </p>
                <Link href={buildClinicHref("/book", activeClinicId)} className="btn btn-primary w-full justify-center">
                  {t("walkin", "bookInstead")}
                </Link>
              </div>
            ) : !confirmation ? (
              <div className="card p-5">
                <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-[rgba(19,49,58,0.65)]">
                      <User className="inline h-3 w-3 mr-1" />{t("walkin", "patientName")}
                    </span>
                    <input value={name} onChange={(e) => setName(e.target.value)}
                      className="input" placeholder={t("booking", "namePlaceholder")} />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-[rgba(19,49,58,0.65)]">
                      <Phone className="inline h-3 w-3 mr-1" />{t("common", "mobile")}
                    </span>
                    <input value={mobile} onChange={(e) => setMobile(e.target.value)}
                      inputMode="numeric" className="input" placeholder={t("booking", "mobilePlaceholder")} />
                  </label>
                </div>

                {activeClinicId !== "pharmacy" && (
                  <label className="card flex items-center gap-2.5 px-3 py-2.5 text-sm text-[rgba(19,49,58,0.65)] cursor-pointer">
                    <input type="checkbox" checked={requiresPharmacyFollowUp}
                      onChange={(e) => setRequiresPharmacyFollowUp(e.target.checked)}
                      className="h-4 w-4 accent-[var(--accent)]" />
                    <Pill className="h-4 w-4 text-[var(--accent)]" />
                    {t("walkin", "pharmacyFollowUp")}
                  </label>
                )}

                {error && (
                  <div className="flex items-center gap-2 rounded-xl bg-[var(--danger-soft)] px-3 py-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 text-[var(--danger)]" />
                    <p className="text-sm font-medium text-[var(--danger)]">{error}</p>
                  </div>
                )}

                {schedule.status === "break" && (
                  <div className="flex items-start gap-3 rounded-xl bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.2)] px-4 py-3">
                    <AlertTriangle className="h-5 w-5 flex-shrink-0 text-[#d97706] mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-[#b45309]">{t("walkin", "betweenShiftsTitle")}</p>
                      <p className="text-xs font-medium text-[#d97706] mt-0.5">{t("walkin", "validForNextShift")} {schedule.nextAvailableTime}.</p>
                    </div>
                  </div>
                )}

                <button type="submit" className="btn btn-warm btn-lg w-full justify-center" disabled={isSubmitting}>
                  {isSubmitting
                    ? <><Loader2 className="h-4 w-4 animate-spin-slow" /> {t("walkin", "generating")}</>
                    : <><Ticket className="h-4 w-4" /> {t("walkin", "generateBtn")}</>}
                </button>
                <p className="flex items-center justify-center gap-1.5 text-center text-xs text-[rgba(19,49,58,0.5)]">
                  <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-emerald-500 animate-pulse-dot" : "bg-red-400"}`} />
                  {isOnline ? t("walkin", "onlineMode") : t("walkin", "offlineMode")}
                </p>
              </form>
            </div>
            ) : null}

            {/* Token Result */}
            {confirmation ? (
              <div className="fade-up card-elevated overflow-hidden rounded-2xl">
                <div className="bg-gradient-to-br from-[rgba(19,49,58,0.94)] to-[rgba(8,42,51,0.98)] p-6 text-center text-white">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(255,255,255,0.12)]">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-[rgba(255,255,255,0.55)]">
                    {t("walkin", "yourToken")}
                  </p>
                  <p className="display-type mt-2 text-6xl">{confirmation.token}</p>
                  <div className="mt-4 space-y-1 text-sm text-[rgba(255,255,255,0.65)]">
                    <p>{t("walkin", "referenceId")}: <strong>{confirmation.bookingId}</strong></p>
                    <p>{t("walkin", "estimatedWait")}: <strong>{confirmation.waitMinutes} {t("booking", "minutes")}</strong></p>
                    <span className={`badge ${confirmation.syncState === "pending" ? "badge-waiting" : "badge-done"}`}>
                      {confirmation.syncState === "pending" ? t("booking", "pending") : t("booking", "synced")}
                    </span>
                  </div>
                  {syncInFlight && (
                    <p className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-[rgba(255,255,255,0.8)]">
                      <Loader2 className="h-3 w-3 animate-spin-slow" /> {t("home", "syncing")}...
                    </p>
                  )}
                  <div className="mt-4 flex items-center gap-2 rounded-xl bg-[rgba(235,193,125,0.12)] px-3 py-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 text-[var(--gold)]" />
                    <p className="text-xs font-medium text-left">{t("walkin", "noteToken")}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(
                        `🏥 मेरा वॉक-इन टोकन!\n\n📋 टोकन: ${confirmation.token}\n🏥 क्लिनिक: ${activeClinic.shortName}\n⏱️ Wait: ~${confirmation.waitMinutes} min\n\nPanwar SmartCare Hub`
                      )}`}
                      target="_blank" rel="noopener noreferrer"
                      className="btn btn-sm" style={{background:'#25D366',color:'white'}}>
                      <Share2 className="h-3 w-3" /> {t("whatsapp", "shareBtn")}
                    </a>
                    <Link href={buildClinicHref("/status", activeClinicId)}
                      className="btn btn-sm" style={{borderColor:'rgba(255,255,255,0.2)',color:'white'}}>
                      <Eye className="h-3 w-3" /> {t("walkin", "checkQueue")}
                    </Link>
                  </div>
                  {redirectCountdown !== null && (
                    <div className="mt-5 rounded-lg bg-[rgba(255,255,255,0.1)] p-3 backdrop-blur-sm">
                      <p className="text-xs font-semibold text-[rgba(255,255,255,0.9)] animate-pulse">
                        Redirecting to Live Queue in {redirectCountdown} seconds...
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="card flex flex-col items-center justify-center border-dashed p-6 text-center">
                <Ticket className="h-8 w-8 text-[rgba(19,49,58,0.18)]" />
                <p className="mt-2 text-sm text-[rgba(19,49,58,0.45)]">
                  {t("walkin", "yourToken")} — {t("common", "loading").replace("...", "")}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
