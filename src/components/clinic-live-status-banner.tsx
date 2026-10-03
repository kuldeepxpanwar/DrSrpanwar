"use client";

import { useClinicSchedule } from "@/features/clinic/hooks/use-clinic-schedule";
import type { ClinicId } from "@/features/clinic/types";
import { Loader2 } from "lucide-react";

export function ClinicLiveStatusBanner({ clinicId }: { clinicId: ClinicId }) {
  const schedule = useClinicSchedule(clinicId);

  if (schedule.status === "loading") {
    return (
      <div className="mt-5 sm:mt-6 mb-3 flex h-14 sm:h-16 w-full animate-pulse items-center justify-center rounded-[1rem] bg-[rgba(19,49,58,0.05)]">
        <Loader2 className="h-5 w-5 animate-spin text-[rgba(19,49,58,0.3)]" />
      </div>
    );
  }

  if (schedule.status === "error") {
    return null; // Fail gracefully
  }

  // Determine styles based on status
  let wrapperClass = "";
  let iconColor = "";

  switch (schedule.status) {
    case "open":
      // Premium Green
      wrapperClass = "bg-[linear-gradient(135deg,#059669,#10b981)] border border-[#34d399]/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_8px_20px_-6px_rgba(16,185,129,0.5)]";
      iconColor = "bg-[#a7f3d0] shadow-[0_0_12px_#34d399]";
      break;
    case "break":
      // Premium Orange
      wrapperClass = "bg-[linear-gradient(135deg,#ea580c,#f97316)] border border-[#fb923c]/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_8px_20px_-6px_rgba(249,115,22,0.5)]";
      iconColor = "bg-[#fde68a] shadow-[0_0_12px_#fbbf24]";
      break;
    case "closed_for_day":
    case "on_leave":
      // Premium Red
      wrapperClass = "bg-[linear-gradient(135deg,#b91c1c,#ef4444)] border border-[#f87171]/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_8px_20px_-6px_rgba(239,68,68,0.5)]";
      iconColor = "bg-[#fecaca] shadow-[0_0_12px_#f87171]";
      break;
  }

  return (
    <div className={`mt-5 sm:mt-6 mb-4 flex h-14 sm:h-16 w-full items-center overflow-hidden rounded-[16px] sm:rounded-[20px] text-white ${wrapperClass}`}>
      {/* Left Pane - Live Indicator */}
      <div className="flex h-full items-center justify-center bg-[rgba(0,0,0,0.2)] px-4 sm:px-6 backdrop-blur-md z-10 border-r border-[rgba(255,255,255,0.15)] rounded-l-[16px] sm:rounded-l-[20px]">
        <span className="relative flex h-3.5 w-3.5 sm:h-4 sm:w-4">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${iconColor}`}></span>
          <span className={`relative inline-flex rounded-full h-3.5 w-3.5 sm:h-4 sm:w-4 ${iconColor}`}></span>
        </span>
        <span className="ml-2.5 text-sm sm:text-base font-black tracking-widest uppercase text-white drop-shadow-sm">Live</span>
      </div>
      
      {/* Marquee Container */}
      <div className="relative flex h-full flex-1 items-center overflow-hidden">
        {/* We use two spans for continuous smooth marquee effect */}
        <div className="animate-marquee whitespace-nowrap px-4 py-2 font-bold text-base sm:text-lg tracking-wide drop-shadow-md">
          {schedule.message}
          <span className="mx-8 text-[rgba(255,255,255,0.5)]">•</span>
          {schedule.message}
          <span className="mx-8 text-[rgba(255,255,255,0.5)]">•</span>
          {schedule.message}
        </div>
      </div>

      <style jsx>{`
        @keyframes marquee {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-marquee {
          display: inline-block;
          animation: marquee 15s linear infinite;
        }
      `}</style>
    </div>
  );
}
