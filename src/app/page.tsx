"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Award,
  CalendarCheck,
  Clock,
  ExternalLink,
  HeartPulse,
  Mail,
  MapPin,
  Monitor,
  Phone,
  Pill,
  Search,
  ShieldCheck,
  Stethoscope,
  Ticket,
  Facebook,
  Instagram,
  MessageCircle,
  Code2,
  Zap,
  X,
  type LucideIcon,
} from "lucide-react";
import { CLINICS, buildClinicHref } from "@/features/clinic/catalog";
import { getQueueSummary } from "@/features/clinic/services/queue-engine";
import { useClinic } from "@/features/clinic/state/clinic-provider";
import { useLang } from "@/i18n/lang-provider";
import { type TranslationKey } from "@/i18n/translations";
import { getStaffSession } from "@/components/navbar";
import type { ClinicDefinition, ClinicId } from "@/features/clinic/types";
import { ClinicLiveStatusBanner } from "@/components/clinic-live-status-banner";
import { useClinicSchedule } from "@/features/clinic/hooks/use-clinic-schedule";
import { supabase } from "@/lib/supabase/client";

type TrustPoint = {
  label: string;
  detail: string;
  icon: LucideIcon;
};

const TRUST_POINTS: Record<ClinicId, TrustPoint[]> = {
  surgery: [
    { label: "10+ Years", detail: "Clinical Experience", icon: Award },
    { label: "ATLS", detail: "Trauma Certified", icon: ShieldCheck },
    { label: "Jaisalmer", detail: "Specialist Surgical Care", icon: HeartPulse },
  ],
  dental: [
    { label: "Dental Care", detail: "Appointments Available", icon: Award },
    { label: "Family", detail: "Comfort-focused Visits", icon: ShieldCheck },
    { label: "Daily", detail: "Clean & Guided Follow-up", icon: HeartPulse },
  ],
  pharmacy: [
    { label: "Trusted", detail: "Post-consult Pickup", icon: Award },
    { label: "Support", detail: "Follow-up Medicines", icon: ShieldCheck },
    { label: "Daily", detail: "Easy Local Access", icon: HeartPulse },
  ],
};

function ClinicIcon({ id, className }: { id: string; className?: string }) {
  switch (id) {
    case "surgery":
      return <Stethoscope className={className} />;
    case "pharmacy":
      return <Pill className={className} />;
    default:
      return <CalendarCheck className={className} />;
  }
}

export default function HomePage() {
  const { activeClinic, activeClinicId, state, isOnline } = useClinic();
  const { lang, t } = useLang();
  const summary = useMemo(() => getQueueSummary(state), [state]);
  const [session, setSession] = useState<{ name: string; role: string; clinicAccess: string[] } | null>(
    () => getStaffSession(),
  );

  const [showDeveloperModal, setShowDeveloperModal] = useState(false);

  useEffect(() => {
    const sync = () => setSession(getStaffSession());
    window.addEventListener("staff-session-change", sync);
    return () => window.removeEventListener("staff-session-change", sync);
  }, []);

  const isDoctor = session?.role === "doctor";
  const isStaff = session?.role === "staff";
  const isLoggedIn = isDoctor || isStaff;
  const heroTitle = lang === "hi" ? "पंवार हेल्थ केयर" : "PANWAR HEALTH CARE";

  // Pharmacy specific queue tracking
  const [pharmacyReady, setPharmacyReady] = useState<{ token: string; name: string } | null>(null);
  const [pharmacyWaitingCount, setPharmacyWaitingCount] = useState(0);

  useEffect(() => {
    if (activeClinicId !== "pharmacy") return;
    
    let mounted = true;
    const fetchPharmacyRx = async () => {
      try {
        const res = await fetch("/api/prescriptions");
        if (res.ok) {
          const data = await res.json();
          if (!mounted) return;
          const rxList = data.prescriptions || [];
          
          // Only show those from surgical as requested: "bas surgical --> pharmacy ko hi kro"
          // We can't strictly filter by origin clinic easily without checking prefix, so let's check prefix
          const surgicalRx = rxList.filter((p: any) => p.tokenId.startsWith("S-") && p.status !== "collected");
          
          const readyList = surgicalRx
            .filter((p: any) => p.status === "ready")
            .sort((a: any, b: any) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
            
          const preparingList = surgicalRx.filter((p: any) => p.status === "preparing" || p.status === "sent");
          
          if (readyList.length > 0) {
            // Show the oldest ready one (first in the list, assuming sorting is desc, so last in array)
            // Wait, the API returns them ordered by created_at desc. So readyList[0] is the NEWEST ready.
            // Let's show the NEWEST ready.
            setPharmacyReady({ token: readyList[0].tokenId, name: readyList[0].patientName });
          } else {
            setPharmacyReady(null);
          }
          setPharmacyWaitingCount(preparingList.length);
        }
      } catch (e) {}
    };

    void fetchPharmacyRx();
    
    const channel = supabase
      .channel(`rx_changes_home_${Math.random()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prescriptions" },
        () => {
          void fetchPharmacyRx();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [activeClinicId]);

  return (
    <div className="page-shell">
       {
  return (
    <div className="card-elevated overflow-hidden rounded-[1.9rem]">
      <div className="bg-[linear-gradient(145deg,rgba(10,78,83,0.98),rgba(15,107,99,0.96))] p-5 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[rgba(255,255,255,0.58)]">
          Queue Snapshot
        </p>
        <p className="display-type mt-3 text-5xl tracking-tight" key={currentToken}>
          <span className="inline-block animate-flip-down">{currentToken}</span>
        </p>
        <p className="mt-2 text-sm text-[rgba(255,255,255,0.76)]" key={currentName}>
          <span className="inline-block animate-fade-up">{currentName}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4">
        <MiniStat label={t("home", "nextToken")} value={nextToken} />
        <MiniStat label={t("home", "waiting")} value={`${waitingCount}`} />
      </div>

      <div className="px-4 pb-4">
        <Link href={buildClinicHref("/live", clinic.id)} className="btn btn-outline w-full justify-center">
          <Monitor className="h-4 w-4" /> {t("nav", "live")}
        </Link>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.35rem] border border-[rgba(12,86,81,0.08)] bg-[rgba(255,255,255,0.84)] p-4 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">{label}</p>
      <p className="mt-2 text-2xl font-bold text-[var(--accent-strong)]">{value}</p>
    </div>
  );
}

function FocusedClinicCard({
  clinic,
  isLoggedIn,
  t,
  settings,
}: {
  clinic: ClinicDefinition;
  isLoggedIn: boolean;
  t: (section: TranslationKey, key: string) => string;
  settings?: any;
}) {
  const isSurgeryClinic = clinic.id === "surgery";
  const trustPoints = TRUST_POINTS[clinic.id];
  const schedule = useClinicSchedule(clinic.id);
  const isWalkInDisabled = schedule.status === "on_leave";

  return (
    <div className="card-elevated overflow-hidden rounded-[2rem] border border-[rgba(255,255,255,0.78)]">
      <div className="p-4 sm:p-6">
        <div className="flex flex-row items-center sm:items-start gap-4 sm:gap-6">
          {/* Doctor Profile Image - Option 1 (Left Side) */}
          {isSurgeryClinic && (
            <div className="flex-shrink-0">
              <div className="relative h-[110px] w-[110px] sm:h-40 sm:w-40 rounded-full border-[3.5px] sm:border-[4px] border-white shadow-[0_8px_25px_rgba(15,107,99,0.22)] sm:shadow-[0_15px_35px_rgba(15,107,99,0.25)] overflow-hidden transform hover:scale-105 transition-transform duration-300">
                <img 
                  src="/dr-panwar-circle.png" 
                  alt="Dr. Sattaram Panwar" 
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h2 className="display-type text-[1.35rem] leading-[1.1] tracking-tighter text-[#17130f] sm:mt-1 sm:text-[2.5rem] break-words">
              {settings?.doctorName || clinic.title}
            </h2>

            <div
              className={`mt-2 sm:mt-3 inline-flex w-full sm:max-w-3xl rounded-[16px] sm:rounded-[20px] px-3 py-2 sm:px-4 sm:py-2.5 text-left shadow-[0_10px_20px_rgba(183,138,63,0.12)] sm:shadow-[0_14px_32px_rgba(183,138,63,0.16)] ${
                isSurgeryClinic
                  ? "bg-[linear-gradient(135deg,#b99043,#d9bc73)] text-white"
                  : "bg-[linear-gradient(135deg,rgba(15,107,99,0.12),rgba(15,107,99,0.2))] text-[var(--accent-strong)]"
              }`}
            >
              <p className="w-full text-[11px] font-semibold sm:font-medium leading-snug sm:text-[1.2rem] sm:leading-7">
                {clinic.subtitle}
              </p>
            </div>

            {clinic.metaLine && (
              <p className="mt-3 text-sm font-bold tracking-[0.02em] text-[#17130f] sm:text-xl border-l-4 border-[var(--accent)] pl-2.5 sm:pl-3">
                {clinic.metaLine}
              </p>
            )}
          </div>
        </div>

        {clinic.hasBooking && <ClinicLiveStatusBanner clinicId={clinic.id} />}

        {!isLoggedIn && (
          <div className="mt-6 space-y-3">
            {clinic.hasBooking ? (
              <div className="grid gap-3 sm:grid-cols-1">
                {/* PRIMARY ACTION: Walk-in Token (For users at the clinic) */}
                {isWalkInDisabled ? (
                  <div className="flex items-center gap-4 rounded-[1.8rem] bg-[#f3f4f6] border border-[#e5e7eb] p-3 pr-5 shadow-none text-[rgba(19,49,58,0.4)] cursor-not-allowed">
                    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-[1.4rem] bg-[rgba(19,49,58,0.04)]">
                      <Ticket className="h-8 w-8" />
                    </div>
                    <div className="flex-1 text-left min-w-0 py-1">
                      <p className="text-[1.35rem] font-bold leading-tight">{t("home", "tokensClosed")}</p>
                      <p className="mt-0.5 text-sm font-medium truncate">{t("home", "doctorUnavailable")}</p>
                    </div>
                  </div>
                ) : (
                  <Link href={buildClinicHref("/walkin", clinic.id)} className="flex items-center gap-4 rounded-[1.8rem] bg-[linear-gradient(145deg,#23c965,#1cb056)] p-3 pr-5 shadow-[0_12px_24px_rgba(35,201,101,0.25)] transition-transform hover:-translate-y-1 active:scale-95 text-white">
                    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-[1.4rem] bg-[rgba(255,255,255,0.2)] shadow-inner">
                      <Ticket className="h-8 w-8" />
                    </div>
                    <div className="flex-1 text-left min-w-0 py-1">
                      <p className="text-[1.35rem] font-bold leading-tight">{t("home", "walkinBtnTitle")}</p>
                      <p className="mt-0.5 text-sm font-medium text-[rgba(255,255,255,0.9)] truncate">{t("home", "walkinBtnSub")}</p>
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(255,255,255,0.2)]">
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </Link>
                )}

                {/* SECONDARY ACTION: Book Appointment (For future dates) */}
                <Link href={buildClinicHref("/book", clinic.id)} className="flex items-center gap-4 rounded-[1.8rem] border border-[rgba(12,86,81,0.06)] bg-white p-3 pr-5 shadow-[0_8px_20px_rgba(30,27,19,0.04)] transition-transform hover:-translate-y-1 active:scale-95 text-[#17130f]">
                  <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-[1.4rem] bg-[rgba(15,107,99,0.06)] text-[var(--accent)]">
                    <CalendarCheck className="h-8 w-8" />
                  </div>
                  <div className="flex-1 text-left min-w-0 py-1">
                    <p className="text-[1.35rem] font-bold leading-tight">{t("home", "bookBtnTitle")}</p>
                    <p className="mt-0.5 text-sm font-medium text-[rgba(19,49,58,0.52)] truncate">{t("home", "bookBtnSub")}</p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(19,49,58,0.04)]">
                    <ArrowRight className="h-4 w-4 text-[rgba(19,49,58,0.4)]" />
                  </div>
                </Link>

                {/* TERTIARY ACTION: Live Queue */}
                <Link href={buildClinicHref("/live", clinic.id)} className="flex items-center gap-4 rounded-[1.8rem] border border-[rgba(12,86,81,0.06)] bg-white p-3 pr-5 shadow-[0_8px_20px_rgba(30,27,19,0.04)] transition-transform hover:-translate-y-1 active:scale-95 text-[#17130f]">
                  <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-[1.4rem] bg-[#f0f5ff] text-[#2c61fb]">
                    <Clock className="h-8 w-8" />
                  </div>
                  <div className="flex-1 text-left min-w-0 py-1">
                    <p className="text-[1.35rem] font-bold leading-tight">{t("home", "liveQueueTitle")}</p>
                    <p className="mt-0.5 text-sm font-medium text-[rgba(19,49,58,0.52)] truncate">{t("home", "liveQueueSub")}</p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(19,49,58,0.04)]">
                    <ArrowRight className="h-4 w-4 text-[rgba(19,49,58,0.4)]" />
                  </div>
                </Link>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-1">
                <Link href={buildClinicHref("/walkin", clinic.id)} className="flex items-center gap-4 rounded-[1.8rem] bg-[linear-gradient(145deg,#23c965,#1cb056)] p-3 pr-5 shadow-[0_12px_24px_rgba(35,201,101,0.25)] transition-transform hover:-translate-y-1 active:scale-95 text-white">
                  <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-[1.4rem] bg-[rgba(255,255,255,0.2)] shadow-inner">
                    <Ticket className="h-8 w-8" />
                  </div>
                  <div className="flex-1 text-left min-w-0 py-1">
                    <p className="text-[1.35rem] font-bold leading-tight">{t("home", "walkinBtn")}</p>
                    <p className="mt-0.5 text-sm font-medium text-[rgba(255,255,255,0.9)] truncate">फार्मेसी के लिए टोकन</p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(255,255,255,0.2)]">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Link>

                <Link href={buildClinicHref("/live", clinic.id)} className="flex items-center gap-4 rounded-[1.8rem] border border-[rgba(12,86,81,0.06)] bg-white p-3 pr-5 shadow-[0_8px_20px_rgba(30,27,19,0.04)] transition-transform hover:-translate-y-1 active:scale-95 text-[#17130f]">
                  <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-[1.4rem] bg-[#f0f5ff] text-[#2c61fb]">
                    <Clock className="h-8 w-8" />
                  </div>
                  <div className="flex-1 text-left min-w-0 py-1">
                    <p className="text-[1.35rem] font-bold leading-tight">{t("home", "liveQueue")}</p>
                    <p className="mt-0.5 text-sm font-medium text-[rgba(19,49,58,0.52)] truncate">अस्पताल की कतार देखें (Queue)</p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(19,49,58,0.04)]">
                    <ArrowRight className="h-4 w-4 text-[rgba(19,49,58,0.4)]" />
                  </div>
                </Link>
              </div>
            )}
          </div>
        )}


        {!clinic.hasBooking && (
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-[var(--accent-soft)] px-3 py-2">
            <Pill className="h-4 w-4 text-[var(--accent)]" />
            <p className="text-xs font-medium text-[var(--accent-strong)]">{t("pharmacy", "noBookingNeeded")}</p>
          </div>
        )}
      </div>
    </div>

  );
}
