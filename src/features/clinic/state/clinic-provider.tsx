"use client";

import {
  createContext,
  startTransition,
  use,
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { useRealtimeQueue } from "@/features/clinic/hooks/use-realtime-queue";
import { clinicService } from "@/features/clinic/services/clinic-service";
import {
  CLINICS,
  DEFAULT_CLINIC_ID,
  getClinicDefinition,
  isClinicId,
} from "@/features/clinic/catalog";
import { 
  createEmptyClinicState,
  advanceQueueState,
  markReportCheckState,
  rescheduleQueueEntryState,
  updateQueueStatusState,
  createWalkInState,
  createBookingState,
} from "@/features/clinic/services/queue-engine";
import type {
  ClinicId,
  ClinicState,
  CreateBookingInput,
  CreateWalkInInput,
  QueueStatus,
} from "@/features/clinic/types";

type ClinicContextValue = {
  activeClinicId: ClinicId;
  activeClinic: ReturnType<typeof getClinicDefinition>;
  state: ClinicState;
  isReady: boolean;
  isOnline: boolean;
  syncInFlight: boolean;
  refresh: (clinicId?: ClinicId) => Promise<void>;
  createBooking: (input: CreateBookingInput) => Promise<ClinicState>;
  createWalkIn: (input: CreateWalkInInput) => Promise<ClinicState>;
  syncPendingEntries: (clinicId?: ClinicId) => Promise<ClinicState>;
  advanceQueue: () => Promise<ClinicState>;
  updateQueueStatus: (entryId: string, status: QueueStatus) => Promise<ClinicState>;
  markReportCheck: (entryId: string) => Promise<ClinicState>;
  rescheduleQueueEntry: (entryId: string) => Promise<ClinicState>;
  resetClinicState: () => Promise<ClinicState>;
  setBookingState: (input: { bookingClosedToday?: boolean; bookingClosedTomorrow?: boolean }) => Promise<ClinicState>;
  setEmergencyState: (input: {
    emergencyClosed: boolean;
    emergencyMessage?: string;
  }) => Promise<ClinicState>;
};

const ClinicContext = createContext<ClinicContextValue | null>(null);

function browserOnline() {
  return typeof window === "undefined" ? true : window.navigator.onLine;
}

import { readFallbackState } from "@/features/clinic/storage/indexed-db";

function createInitialStateMap() {
  return Object.fromEntries(
    CLINICS.map((clinic) => {
      const cached = readFallbackState(clinic.id);
      return [clinic.id, cached ?? createEmptyClinicState(clinic.id)];
    }),
  ) as Record<ClinicId, ClinicState>;
}

function createInitialReadyMap() {
  return Object.fromEntries(
    CLINICS.map((clinic) => {
      // If we found a cache in localStorage, it's instantly ready
      const hasCache = readFallbackState(clinic.id) !== null;
      return [clinic.id, hasCache];
    }),
  ) as Record<ClinicId, boolean>;
}

export function ClinicProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const requestedClinicId = (() => {
    const value = searchParams.get("clinic");
    return isClinicId(value) ? value : DEFAULT_CLINIC_ID;
  })();

  return (
    <ClinicProviderInner requestedClinicId={requestedClinicId}>
      {children}
    </ClinicProviderInner>
  );
}

export function ClinicProviderFallback({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClinicProviderInner requestedClinicId={DEFAULT_CLINIC_ID}>
      {children}
    </ClinicProviderInner>
  );
}

function ClinicProviderInner({
  children,
  requestedClinicId,
}: {
  children: React.ReactNode;
  requestedClinicId: ClinicId;
}) {
  const [stateMap, setStateMap] = useState<Record<ClinicId, ClinicState>>(
    () => createInitialStateMap(),
  );
  const [readyMap, setReadyMap] = useState<Record<ClinicId, boolean>>(
    () => createInitialReadyMap(),
  );
  const [isOnline, setIsOnline] = useState(() => browserOnline());
  const [syncInFlight, setSyncInFlight] = useState(false);
  const state = stateMap[requestedClinicId] ?? createEmptyClinicState(requestedClinicId);
  const isReady = readyMap[requestedClinicId] ?? false;
  const activeClinic = getClinicDefinition(requestedClinicId);

  const refresh = async (clinicId: ClinicId = requestedClinicId) => {
    const nextState = await clinicService.loadState(clinicId, { online: browserOnline() });
    applyState(clinicId, nextState);
  };

  const applyState = (clinicId: ClinicId, nextState: ClinicState) => {
    startTransition(() => {
      setStateMap((current) => ({
        ...current,
        [clinicId]: nextState,
      }));
      setReadyMap((current) => ({
        ...current,
        [clinicId]: true,
      }));
    });

    return nextState;
  };

  // Use Realtime hook to automatically call refresh when Supabase pushes updates
  useRealtimeQueue(requestedClinicId, () => {
    // We only refresh if the system isn't currently syncing to prevent loops
    if (!syncInFlight && isOnline) {
      refresh(requestedClinicId).catch(console.error);
    }
  });

  const syncPendingEntries = async (clinicId: ClinicId = requestedClinicId) => {
    setSyncInFlight(true);

    try {
      const nextState = await clinicService.syncPendingEntries(clinicId, {
        online: browserOnline(),
      });
      return applyState(clinicId, nextState);
    } finally {
      setSyncInFlight(false);
    }
  };

  const refreshEffect = useEffectEvent(() => {
    void refresh();
  });

  const syncPendingEffect = useEffectEvent(() => {
    void Promise.all(
      CLINICS.map(async (clinic) => {
        const nextState = await clinicService.syncPendingEntries(clinic.id, {
          online: true,
        });
        applyState(clinic.id, nextState);
      }),
    );
  });

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      const nextState = await clinicService.loadState(requestedClinicId, {
        online: browserOnline(),
      });

      if (!isMounted) {
        return;
      }

      applyState(requestedClinicId, nextState);
    };

    void bootstrap();

    const handleOnline = () => {
      setIsOnline(true);
      syncPendingEffect();
    };

    const handleOffline = () => setIsOnline(false);
    const handleFocus = () => refreshEffect();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);

    return () => {
      isMounted = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
    };
  }, [requestedClinicId]);

  const value: ClinicContextValue = {
    activeClinicId: requestedClinicId,
    activeClinic,
    state,
    isReady,
    isOnline,
    syncInFlight,
    refresh,
    createBooking: async (input) => {
      const payload = {
        ...input,
        clinicId: input.clinicId ?? requestedClinicId,
      };

      // Optimistic Update
      const optimisticState = createBookingState(state, payload, { online: isOnline });
      applyState(payload.clinicId, optimisticState);

      try {
        const nextState = await clinicService.createBooking(payload, { online: isOnline });
        return applyState(nextState.clinicId, nextState);
      } catch (err) {
        applyState(payload.clinicId, state);
        throw err;
      }
    },
    createWalkIn: async (input) => {
      const payload = {
        ...input,
        clinicId: input.clinicId ?? requestedClinicId,
      };

      // Optimistic Update
      const optimisticState = createWalkInState(state, payload, { online: isOnline });
      applyState(payload.clinicId, optimisticState);

      try {
        const nextState = await clinicService.createWalkIn(payload, { online: isOnline });
        return applyState(nextState.clinicId, nextState);
      } catch (err) {
        applyState(payload.clinicId, state);
        throw err;
      }
    },
    syncPendingEntries,
    advanceQueue: async () => {
      // Optimistic Update
      const optimisticState = advanceQueueState(state);
      applyState(requestedClinicId, optimisticState);
      
      try {
        const nextState = await clinicService.advanceQueue(requestedClinicId, {
          online: isOnline,
        });
        return applyState(requestedClinicId, nextState);
      } catch (err) {
        // Revert on error
        applyState(requestedClinicId, state);
        throw err;
      }
    },
    updateQueueStatus: async (entryId, status) => {
      // Optimistic Update
      const optimisticState = updateQueueStatusState(state, entryId, status);
      applyState(requestedClinicId, optimisticState);
      
      try {
        const nextState = await clinicService.updateQueueStatus(
          requestedClinicId,
          entryId,
          status,
          { online: isOnline },
        );
        return applyState(requestedClinicId, nextState);
      } catch (err) {
        applyState(requestedClinicId, state);
        throw err;
      }
    },
    markReportCheck: async (entryId) => {
      // Optimistic Update
      const optimisticState = markReportCheckState(state, entryId);
      applyState(requestedClinicId, optimisticState);

      try {
        const nextState = await clinicService.markReportCheck(
          requestedClinicId,
          entryId,
          { online: isOnline },
        );
        return applyState(requestedClinicId, nextState);
      } catch (err) {
        applyState(requestedClinicId, state);
        throw err;
      }
    },
    rescheduleQueueEntry: async (entryId) => {
      // Optimistic Update
      const optimisticState = rescheduleQueueEntryState(state, entryId);
      applyState(requestedClinicId, optimisticState);

      try {
        const nextState = await clinicService.rescheduleQueueEntry(
          requestedClinicId,
          entryId,
          { online: isOnline },
        );
        return applyState(requestedClinicId, nextState);
      } catch (err) {
        applyState(requestedClinicId, state);
        throw err;
      }
    },
    resetClinicState: async () => {
      const nextState = await clinicService.resetState(requestedClinicId, {
        online: isOnline,
      });
      return applyState(requestedClinicId, nextState);
    },
    setBookingState: async (input) => {
      const nextState = await clinicService.setBookingState(requestedClinicId, input);
      applyState(requestedClinicId, nextState);
      return nextState;
    },
    setEmergencyState: async (input) => {
      const nextState = await clinicService.setEmergencyState(requestedClinicId, input, {
        online: isOnline,
      });
      return applyState(requestedClinicId, nextState);
    },
  };

  return (
    <ClinicContext value={value}>
      {children}
    </ClinicContext>
  );
}

export function useClinic() {
  const context = use(ClinicContext);

  if (!context) {
    throw new Error("useClinic must be used within ClinicProvider");
  }

  return context;
}
