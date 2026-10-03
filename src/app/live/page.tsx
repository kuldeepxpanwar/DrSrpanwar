"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  PlayCircle,
  CheckCircle2,
  PauseCircle,
  SkipForward,
  CalendarClock,
  UserCircle,
  Inbox,
} from "lucide-react";
import { buildClinicHref } from "@/features/clinic/catalog";
import { getQueueSummary } from "@/features/clinic/services/queue-engine";
import { useLiveQueuePolling } from "@/features/clinic/hooks/use-live-queue-polling";
import { useClinic } from "@/features/clinic/state/clinic-provider";
import { useLang } from "@/i18n/lang-provider";
import { getStaffSession } from "@/components/navbar";
import { supabase } from "@/lib/supabase/client";

export default function LivePage() {
  const {
    activeClinic,
    activeClinicId,
    state: clinicState,
    advanceQueue,
    syncPendingEntries,
    updateQueueStatus,
    rescheduleQueueEntry,
  } = useClinic();
  const { t } = useLang();
  useLiveQueuePolling(5000);
  const summary = useMemo(() => getQueueSummary(clinicState), [clinicState]);
  const current = summary.current;
  const next = summary.next;

  const [session, setSession] = useState<{ name: string; role: string } | null>(
    () => getStaffSession(),
  );
  const [myToken, setMyToken] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setMyToken(window.localStorage.getItem('my_clinic_token'));
    }
  }, []);

  useEffect(() => {
    const sync = () => setSession(getStaffSession());
    window.addEventListener("staff-session-change", sync);
    return () => window.removeEventListener("staff-session-change", sync);
  }, []);

  const isDoctor = session?.role === "doctor";
  const isStaff = session?.role === "staff";
  const isLoggedIn = isDoctor || isStaff;

  // Pharmacy specific queue tracking
  const [pharmacyReady, setPharmacyReady] = useState<{ token: string; name: string } | null>(null);
  const [pharmacyNext, setPharmacyNext] = useState<{ token: string; name: string } | null>(null);
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
          
          const surgicalRx = rxList.filter((p: any) => p.tokenId.startsWith("S-") && p.status !== "collected");
          const readyList = surgicalRx
            .filter((p: any) => p.status === "ready")
            .sort((a: any, b: any) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
            
          const preparingList = surgicalRx.filter((p: any) => p.status === "preparing" || p.status === "sent");
          
          if (readyList.length > 0) {
            setPharmacyReady({ token: readyList[0].tokenId, name: readyList[0].patientName });
            if (readyList.length > 1) {
              setPharmacyNext({ token: readyList[1].tokenId, name: readyList[1].patientName });
            } else {
              setPharmacyNext(null);
            }
          } else {
            setPharmacyReady(null);
            setPharmacyNext(null);
          }
          setPharmacyWaitingCount(preparingList.length);
        }
      } catch (e) {}
    };

    void fetchPharmacyRx();
    
    const channel = supabase
      .channel(`pharmacy_live_changes_${Math.random()}`)
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

  const runAction = async (task: () => Promise<void>) => {
    try { await task(); } catch { /* silent */ }
  };

  const resolveEntryId = async (entry: { id: string; clientRequestId: string; syncState: "synced" | "pending" }) => {
    if (entry.syncState !== "pending") {
      return entry.id;
    }

    const syncedState = await syncPendingEntries(activeClinicId);
    const syncedEntry = syncedState.queue.find(
      (item) => item.clientRequestId === entry.clientRequestId,
    );

    if (!syncedEntry || syncedEntry.syncState === "pending") {
      throw new Error("Entry abhi server par sync nahi hui.");
    }

    return syncedEntry.id;
  };

  return (
    <div className="min-h-screen bg-[#0c1512] px-4 py-6 text-[#fdfffc] sm:px-8 sm:py-8 font-sans">
      <div className="mx-auto flex min-h-[calc(100svh-3rem)] w-full max-w-7xl flex-col gap-8">
        <header className="rounded-[32px] border border-[rgba(255,255,255,0.15)] bg-[rgba(15,107,99,0.1)] px-6 py-5 backdrop-blur-[40px] shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[rgba(255,255,255,0.5)]">
                {t("live", "waitingArea")}
              </p>
              <h1 className="display-type mt-1 text-3xl sm:text-4xl">{clinicState.settings?.doctorName || activeClinic.title}</h1>
              {activeClinic.metaLine && (
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(255,255,255,0.72)]">
                  {activeClinic.metaLine}
                </p>
              )}
              <p className="mt-1 text-sm text-[rgba(255,255,255,0.6)]">{t("live", "refreshNote")}</p>
            </div>
            <div className="flex items-center gap-3">
              {isLoggedIn && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(255,255,255,0.1)] px-3 py-1 text-xs font-semibold">
                  <UserCircle className="h-3.5 w-3.5" /> {session?.name}
                </span>
              )}
              <p className="text-xs text-[rgba(255,255,255,0.5)]">
                {t("live", "lastUpdated")}: {new Date(clinicState.lastUpdated).toLocaleTimeString("en-IN")}
              </p>
            </div>
          </div>
        </header>

        <main className="grid flex-1 gap-8 xl:grid-cols-[minmax(0,1.1fr)_24rem]">
          <section className="live-token-shadow rounded-[32px] border border-[rgba(255,255,255,0.1)] bg-[rgba(15,107,99,0.05)] p-6 sm:p-10 backdrop-blur-[20px]">
            <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-[#00ffcc] drop-shadow-[0_0_8px_rgba(0,255,204,0.5)]">
              {activeClinicId === "pharmacy" ? "Ready To Collect" : t("live", "currentToken")}
            </p>
            <div className={`mt-6 rounded-[32px] ${
              (activeClinicId === "pharmacy" ? pharmacyReady?.token : current?.token) === myToken 
                ? "bg-[linear-gradient(180deg,#3a3000,#725f00)] shadow-[0_0_40px_rgba(255,215,0,0.3)] border-2 border-[#ffd700]" 
                : "bg-[linear-gradient(180deg,#00513f,#002118)] shadow-[0_0_30px_rgba(0,255,204,0.15)] border border-[#00ffcc]"
            } px-8 py-12 relative overflow-hidden`}>
              {/* Glass reflection effect */}
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.1)_0%,transparent_50%)] rounded-[32px] pointer-events-none" />
              
              {(activeClinicId === "pharmacy" ? pharmacyReady?.token : current?.token) === myToken && (
                <div className="absolute top-4 right-6 rounded-full bg-[#ffd700] px-4 py-1.5 text-xs font-black uppercase tracking-widest text-[#221b00] shadow-[0_0_20px_rgba(255,215,0,0.8)] animate-pulse">
                  ⭐ It's Your Turn!
                </div>
              )}
              <p className="display-type text-[5rem] flex items-center gap-4 leading-none sm:text-[7rem] lg:text-[9.5rem] font-black tracking-tighter text-[#fdfffc] drop-shadow-md">
                {activeClinicId !== "pharmacy" && current?.isReportCheck && <span className="text-[#00ffcc] opacity-90 text-[4rem] sm:text-[6rem] lg:text-[8rem]">🔄</span>}
                {activeClinicId === "pharmacy" 
                  ? (pharmacyReady?.token ?? "---") 
                  : (current?.token ?? `${activeClinic.prefix}-000`)}
              </p>
              <p className="mt-4 flex items-center gap-2 text-2xl font-bold text-[#a2f1e6]">
                {activeClinicId === "pharmacy"
                  ? (pharmacyReady?.name ? (isLoggedIn ? pharmacyReady.name : pharmacyReady.name.split(' ').map((n, i, arr) => i === arr.length - 1 && arr.length > 1 ? n.charAt(0) + '.' : n).join(' ')) : "No Medicines Ready")
                  : (current?.name ? (isLoggedIn ? current.name : current.name.split(' ').map((n, i, arr) => i === arr.length - 1 && arr.length > 1 ? n.charAt(0) + '.' : n).join(' ')) : t("live", "queuePreparing"))}
                {activeClinicId !== "pharmacy" && current?.isReportCheck && <span className="rounded-full bg-[#00ffcc]/20 px-3 py-1 text-xs font-bold text-[#00ffcc] uppercase tracking-wider">Report Check</span>}
              </p>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="rounded-[24px] border border-[rgba(255,255,255,0.08)] bg-[rgba(25,33,30,0.6)] p-6 backdrop-blur-md relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[radial-gradient(circle,#00ffcc_0%,transparent_70%)] opacity-10 pointer-events-none" />
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#83958d]">
                  {activeClinicId === "pharmacy" ? "Next Ready" : t("live", "nextToken")}
                </p>
                <p className="mt-3 flex items-center gap-2 text-[3.5rem] leading-none font-black text-[#dbe5df]">
                  {activeClinicId !== "pharmacy" && summary.next?.isReportCheck && <span className="text-[#00ffcc] opacity-80 text-[2.5rem]">🔄</span>}
                  {activeClinicId === "pharmacy"
                    ? (pharmacyNext?.token ?? "--")
                    : (summary.next?.token ?? "--")}
                </p>
                <p className="mt-2 flex items-center gap-2 text-base font-medium text-[#b9cbc2]">
                  {activeClinicId === "pharmacy"
                    ? (pharmacyNext?.name ?? "--")
                    : (summary.next?.name ?? "--")}
                  {activeClinicId !== "pharmacy" && summary.next?.isReportCheck && <span className="rounded-full bg-[#00ffcc]/10 px-2 py-0.5 text-[9px] font-bold text-[#00ffcc] uppercase tracking-wider">Report</span>}
                </p>
              </div>
              <div className="rounded-[24px] border border-[rgba(255,255,255,0.08)] bg-[rgba(25,33,30,0.6)] p-6 backdrop-blur-md relative overflow-hidden">
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#83958d]">
                  {activeClinicId === "pharmacy" ? "Preparing" : t("live", "queueCount")}
                </p>
                <p className="mt-3 text-[3.5rem] leading-none font-black text-[#dbe5df]">
                  {activeClinicId === "pharmacy" ? pharmacyWaitingCount : summary.waiting.length}
                </p>
                <p className="mt-2 text-base font-medium text-[#b9cbc2]">
                  {activeClinicId === "pharmacy" ? "Prescriptions" : t("live", "patientsWaiting")}
                </p>
              </div>
            </div>

            {/* Doctor/Staff Controls */}
            {isLoggedIn && (
              <div className="mt-6 flex flex-wrap gap-2">
                <button type="button"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(103,237,170,0.2)] px-5 py-2 text-sm font-semibold text-[#67edaa] transition hover:bg-[rgba(103,237,170,0.3)] active:scale-95"
                  onClick={() => void runAction(async () => { await advanceQueue(); })}>
                  <PlayCircle className="h-4 w-4" /> {t("staff", "advanceBtn")}
                </button>
                {isDoctor && current && (
                  <>
                      <button type="button"
                      className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(31,122,84,0.4)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[rgba(31,122,84,0.6)] active:scale-95"
                      onClick={() => void runAction(async () => {
                        const resolvedEntryId = await resolveEntryId(current);
                        await updateQueueStatus(resolvedEntryId, "done");
                      })}>
                      <CheckCircle2 className="h-4 w-4" /> {t("staff", "doneBtn")}
                    </button>
                      <button type="button"
                      className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(255,255,255,0.08)] px-4 py-2 text-sm font-semibold text-[rgba(255,255,255,0.7)] transition hover:bg-[rgba(255,255,255,0.15)] active:scale-95"
                      onClick={() => void runAction(async () => {
                        const resolvedEntryId = await resolveEntryId(current);
                        await updateQueueStatus(resolvedEntryId, current.status === "hold" ? "waiting" : "hold");
                      })}>
                      <PauseCircle className="h-4 w-4" /> {current.status === "hold" ? t("staff", "resumeBtn") : t("staff", "holdBtn")}
                    </button>
                      <button type="button"
                      className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(182,93,54,0.2)] px-4 py-2 text-sm font-semibold text-[rgba(255,180,140,0.9)] transition hover:bg-[rgba(182,93,54,0.3)] active:scale-95"
                      onClick={() => void runAction(async () => {
                        const resolvedEntryId = await resolveEntryId(current);
                        await updateQueueStatus(resolvedEntryId, "skipped");
                      })}>
                      <SkipForward className="h-4 w-4" /> {t("staff", "skipBtn")}
                    </button>
                  </>
                )}
              </div>
            )}
          </section>

          <aside className="rounded-[32px] border border-[rgba(255,255,255,0.1)] bg-[rgba(21,29,26,0.6)] p-6 backdrop-blur-[20px] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-[rgba(255,255,255,0.05)]">
              <p className="text-[12px] font-extrabold uppercase tracking-widest text-[#a2f1e6]">
                {t("live", "waitingList")}
              </p>
              <Link
                href={buildClinicHref("/staff", activeClinicId)}
                className="rounded-full border border-[#3a4a44] bg-[#29322f] px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#dbe5df] transition hover:bg-[#323b37]"
              >
                {t("nav", "staff")}
              </Link>
            </div>

            <div className="mt-4">
              <input 
                type="text" 
                placeholder="नाम या टोकन खोजें 🔍" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-[16px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-white placeholder-[rgba(255,255,255,0.4)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] transition-colors"
              />
            </div>

            <div className="mt-4 space-y-3 overflow-y-auto pr-1 custom-scrollbar">
              {(() => {
                const filtered = summary.waiting.filter(entry => 
                  entry.token.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  (entry.name && entry.name.toLowerCase().includes(searchQuery.toLowerCase()))
                );
                
                const displayList = showAll || searchQuery ? filtered : filtered.slice(0, 10);
                
                if (summary.waiting.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Inbox className="h-8 w-8 text-[rgba(255,255,255,0.15)]" />
                      <p className="mt-2 text-sm text-[rgba(255,255,255,0.35)]">
                        {t("staff", "noPatients")}
                      </p>
                    </div>
                  );
                }

                if (filtered.length === 0) {
                  return <p className="text-center text-sm text-[rgba(255,255,255,0.5)] py-4">कोई मरीज़ नहीं मिला</p>;
                }
                
                return (
                  <>
                    {displayList.map((entry, index) => {
                      const isMyToken = entry.token === myToken;
                      return (
                      <div
                        key={entry.id}
                        className={`rounded-[20px] px-5 py-4 relative transition-all duration-300 ${
                          isMyToken
                            ? "bg-[rgba(255,215,0,0.1)] shadow-[0_0_20px_rgba(255,215,0,0.15)] border border-[#ffd700] transform scale-[1.02]"
                            : index === 0 && !searchQuery
                            ? "bg-[rgba(0,255,204,0.05)] border border-[rgba(0,255,204,0.3)]"
                            : "bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.05)]"
                        }`}
                      >
                        {isMyToken && (
                          <div className="absolute -top-3 right-4 rounded-full bg-[#ffd700] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#221b00] shadow-[0_0_10px_rgba(255,215,0,0.5)]">
                            ⭐ Your Token
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <p className={`text-2xl font-black flex items-center gap-2 ${isMyToken ? "text-[#ffd700]" : "text-[#fdfffc]"}`}>
                              {entry.isReportCheck && <span className="text-[#00ffcc] opacity-90">🔄</span>}
                              {entry.token}
                            </p>
                            <span className="rounded-full bg-[rgba(255,255,255,0.1)] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#b9cbc2]">
                              {entry.isReportCheck ? "Report Check" : entry.source}
                            </span>
                            {entry.arrivedAt && (
                              <span className="rounded-full bg-[rgba(52,211,153,0.15)] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#34d399] flex items-center gap-1">
                                ✅ Arrived
                              </span>
                            )}
                          </div>
                          {/* Doctor inline actions */}
                          {isDoctor && (
                            <div className="flex gap-1.5 opacity-80 hover:opacity-100">
                              <button type="button"
                                className="inline-flex items-center gap-1 rounded-full bg-[rgba(0,255,204,0.15)] px-2.5 py-1 text-[10px] font-bold text-[#00ffcc] hover:bg-[rgba(0,255,204,0.25)] transition active:scale-95"
                                onClick={() => void runAction(async () => {
                                  const resolvedEntryId = await resolveEntryId(entry);
                                  await updateQueueStatus(resolvedEntryId, "in-progress");
                                })}>
                                <PlayCircle className="h-3 w-3" /> {t("staff", "callNow")}
                              </button>
                              <button type="button"
                                className="inline-flex items-center gap-1 rounded-full bg-[rgba(255,180,171,0.15)] px-2.5 py-1 text-[10px] font-bold text-[#ffb4ab] hover:bg-[rgba(255,180,171,0.25)] transition active:scale-95"
                                onClick={() => void runAction(async () => {
                                  const resolvedEntryId = await resolveEntryId(entry);
                                  await rescheduleQueueEntry(resolvedEntryId);
                                })}>
                                <CalendarClock className="h-3 w-3" /> {t("queue", "shiftToTomorrow")}
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="mt-1.5 text-base font-medium text-[#b9cbc2]">
                          {isLoggedIn ? entry.name : entry.name.split(' ').map((n, i, arr) => i === arr.length - 1 && arr.length > 1 ? n.charAt(0) + '.' : n).join(' ')}
                        </p>
                      </div>
                    )})}
                    
                    {!showAll && !searchQuery && filtered.length > 10 && (
                      <button
                        onClick={() => setShowAll(true)}
                        className="w-full mt-2 rounded-[16px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] py-3 text-sm font-semibold text-[#a2f1e6] hover:bg-[rgba(255,255,255,0.08)] transition-colors"
                      >
                        बाकी {filtered.length - 10} मरीज़ देखें (View All)
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
