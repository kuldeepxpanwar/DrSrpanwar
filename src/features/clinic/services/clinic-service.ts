import { hasRemoteSyncConfig } from "@/config/env";
import { ApiClientError, apiClient } from "@/services/api";
import { DEFAULT_CLINIC_ID } from "@/features/clinic/catalog";
import {
  advanceQueueState,
  createBookingState,
  createInitialClinicState,
  createWalkInState,
  rescheduleQueueEntryState,
  resetClinicState as createResetState,
  setEmergencyStateState,
  syncPendingState,
  updateQueueStatusState,
  checkInState,
} from "@/features/clinic/services/queue-engine";
import { readClinicState, writeClinicState } from "@/features/clinic/storage/indexed-db";
import type {
  ClinicState,
  ClinicId,
  CreateBookingInput,
  CreateWalkInInput,
  QueueStatus,
} from "@/features/clinic/types";

async function persistState(state: ClinicState) {
  await writeClinicState(state);
  return state;
}

function shouldFallbackToOffline(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.isNetworkError;
  }

  return false;
}

function sortQueueState(state: ClinicState) {
  return {
    ...state,
    queue: [...state.queue].sort((first, second) => {
      const firstOrder = first.queueOrder ?? Number.MAX_SAFE_INTEGER;
      const secondOrder = second.queueOrder ?? Number.MAX_SAFE_INTEGER;

      if (firstOrder === secondOrder) {
        return first.createdAt.localeCompare(second.createdAt);
      }

      return firstOrder - secondOrder;
    }),
  };
}

function mergePendingEntries(remoteState: ClinicState, localState: ClinicState) {
  const existingRequestIds = new Set(
    remoteState.queue.map((entry) => entry.clientRequestId),
  );
  const pendingEntries = localState.queue.filter(
    (entry) =>
      entry.syncState === "pending" && !existingRequestIds.has(entry.clientRequestId),
  );

  if (pendingEntries.length === 0) {
    return sortQueueState(remoteState);
  }

  return sortQueueState({
    ...remoteState,
    queue: [...remoteState.queue, ...pendingEntries],
  });
}

function remoteStateUrl(clinicId: ClinicId) {
  return `/api/clinics/${clinicId}/state`;
}

function isFromToday(dateString: string) {
  const date = new Date(dateString);
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

export const clinicService = {
  async loadState(
    clinicId: ClinicId = DEFAULT_CLINIC_ID,
    options: { online?: boolean } = {},
  ) {
    let localState = await readClinicState(clinicId);
    
    // Clear offline cache if it is from a previous day
    if (!isFromToday(localState.lastUpdated) && localState.queue.length > 0) {
      localState = createInitialClinicState(clinicId);
      await writeClinicState(localState);
    }

    const online = options.online ?? true;

    if (online && hasRemoteSyncConfig()) {
      try {
        const response = await apiClient.get<{ state: ClinicState }>(remoteStateUrl(clinicId));
        const mergedState = mergePendingEntries(response.data.state, localState);
        await writeClinicState(mergedState);
        return mergedState;
      } catch {
        return sortQueueState(localState);
      }
    }

    if (localState.queue.length === 0) {
      const seeded = createInitialClinicState(clinicId);
      await writeClinicState(seeded);
      return seeded;
    }

    return sortQueueState(localState);
  },

  async resetState(
    clinicId: ClinicId = DEFAULT_CLINIC_ID,
    options: { online?: boolean } = {},
  ) {
    const online = options.online ?? true;

    if (online && hasRemoteSyncConfig()) {
      try {
        const response = await apiClient.post<{ state: ClinicState }>(
          `/api/clinics/${clinicId}/reset`,
        );

        return persistState(sortQueueState(response.data.state));
      } catch {
        // Fall through to local reset if remote reset fails.
      }
    }

    return persistState(createResetState(clinicId));
  },

  async createBooking(input: CreateBookingInput, options: { online: boolean }) {
    const createdAt = new Date().toISOString();
    const clientRequestId = input.clientRequestId ?? `request-${crypto.randomUUID()}`;
    const nextInput = {
      ...input,
      clientRequestId,
      createdAt,
    };

    if (options.online && hasRemoteSyncConfig()) {
      try {
        const response = await apiClient.post<{ state: ClinicState }>(
          `/api/clinics/${input.clinicId}/booking`,
          nextInput,
        );

        return persistState(sortQueueState(response.data.state));
      } catch (error) {
        if (!shouldFallbackToOffline(error)) {
          throw error;
        }

        // If network is flaky, keep the booking locally and sync later.
      }
    }

    const state = await readClinicState(input.clinicId);
    const nextState = createBookingState(state, nextInput, { online: false });
    return persistState(sortQueueState(nextState));
  },

  async createWalkIn(input: CreateWalkInInput, options: { online: boolean }) {
    const createdAt = new Date().toISOString();
    const clientRequestId = input.clientRequestId ?? `request-${crypto.randomUUID()}`;
    const nextInput = {
      ...input,
      clientRequestId,
      createdAt,
    };

    if (options.online && hasRemoteSyncConfig()) {
      try {
        const response = await apiClient.post<{ state: ClinicState }>(
          `/api/clinics/${input.clinicId}/walkin`,
          nextInput,
        );

        return persistState(sortQueueState(response.data.state));
      } catch (error) {
        if (!shouldFallbackToOffline(error)) {
          throw error;
        }

        // If network is flaky, keep the token locally and sync later.
      }
    }

    const state = await readClinicState(input.clinicId);
    const nextState = createWalkInState(state, nextInput, { online: false });
    return persistState(sortQueueState(nextState));
  },

  async syncPendingEntries(
    clinicId: ClinicId = DEFAULT_CLINIC_ID,
    options: { online?: boolean } = {},
  ) {
    const state = await readClinicState(clinicId);
    const pendingEntries = state.queue.filter((entry) => entry.syncState === "pending");

    if (pendingEntries.length === 0) {
      return sortQueueState(state);
    }

    if (options.online ?? true) {
      try {
        if (!hasRemoteSyncConfig()) {
          return persistState(sortQueueState(syncPendingState(state)));
        }

        const response = await apiClient.post<{ state: ClinicState }>(
          `/api/clinics/${clinicId}/sync`,
          {
          pendingEntries: pendingEntries.map((entry) => ({
            clientRequestId: entry.clientRequestId,
            source: entry.source,
            name: entry.name,
            mobile: entry.mobile,
            dayLabel: entry.dayLabel,
            slotLabel: entry.slotLabel,
            provisionalToken: entry.provisionalToken,
            provisionalBookingId: entry.provisionalBookingId,
            createdAt: entry.createdAt,
            requiresPharmacyFollowUp: entry.requiresPharmacyFollowUp,
          })),
          },
        );

        return persistState(sortQueueState(response.data.state));
      } catch {
        return sortQueueState(state);
      }
    }

    return sortQueueState(state);
  },

  async advanceQueue(
    clinicId: ClinicId = DEFAULT_CLINIC_ID,
    options: { online?: boolean } = {},
  ) {
    if ((options.online ?? true) && hasRemoteSyncConfig()) {
      const response = await apiClient.post<{ state: ClinicState }>(
        `/api/clinics/${clinicId}/advance`,
      );
      return persistState(sortQueueState(response.data.state));
    }

    const state = await readClinicState(clinicId);
    return persistState(sortQueueState(advanceQueueState(state)));
  },

  async checkIn(
    clinicId: ClinicId,
    entryId: string,
    options: { online?: boolean } = {},
  ) {
    if ((options.online ?? true) && hasRemoteSyncConfig()) {
      const response = await apiClient.post<{ state: ClinicState }>(
        `/api/clinics/${clinicId}/entries/${entryId}/check-in`,
        {},
      );
      return persistState(response.data.state);
    }

    const state = await this.loadState(clinicId, { online: false });
    const nextState = checkInState(state, entryId);
    return persistState(nextState);
  },

  async updateQueueStatus(
    clinicId: ClinicId,
    entryId: string,
    status: QueueStatus,
    options: { online?: boolean } = {},
  ) {
    if ((options.online ?? true) && hasRemoteSyncConfig()) {
      const response = await apiClient.post<{ state: ClinicState }>(
        `/api/clinics/${clinicId}/entries/${entryId}/status`,
        { status },
      );
      return persistState(sortQueueState(response.data.state));
    }

    const state = await readClinicState(clinicId);
    return persistState(sortQueueState(updateQueueStatusState(state, entryId, status)));
  },

  async markReportCheck(
    clinicId: ClinicId,
    entryId: string,
    options: { online?: boolean } = {},
  ) {
    if ((options.online ?? true) && hasRemoteSyncConfig()) {
      const response = await apiClient.post<{ state: ClinicState }>(
        `/api/clinics/${clinicId}/entries/${entryId}/report`,
      );
      return persistState(sortQueueState(response.data.state));
    }

    // Dynamic import to avoid circular dependency issues if any
    const { markReportCheckState } = await import("@/features/clinic/services/queue-engine");
    const state = await readClinicState(clinicId);
    return persistState(sortQueueState(markReportCheckState(state, entryId)));
  },

  async rescheduleQueueEntry(
    clinicId: ClinicId,
    entryId: string,
    options: { online?: boolean } = {},
  ) {
    if ((options.online ?? true) && hasRemoteSyncConfig()) {
      const response = await apiClient.post<{ state: ClinicState }>(
        `/api/clinics/${clinicId}/entries/${entryId}/reschedule`,
      );
      return persistState(sortQueueState(response.data.state));
    }

    const state = await readClinicState(clinicId);
    return persistState(sortQueueState(rescheduleQueueEntryState(state, entryId)));
  },

  
  async setBookingState(
    clinicId: ClinicId,
    input: { bookingClosedToday?: boolean; bookingClosedTomorrow?: boolean }
  ) {
    if (hasRemoteSyncConfig()) {
      const response = await apiClient.patch<{ state: ClinicState }>(
        `/api/clinics/${clinicId}/state/booking`,
        input,
      );
      return persistState(sortQueueState(response.data.state));
    }
    const state = await readClinicState(clinicId);
    return persistState({ ...state, ...input });
  },

  async setEmergencyState(
    clinicId: ClinicId,
    input: { emergencyClosed: boolean; emergencyMessage?: string },
    options: { online?: boolean } = {},
  ) {
    if ((options.online ?? true) && hasRemoteSyncConfig()) {
      const response = await apiClient.post<{ state: ClinicState }>(
        `/api/clinics/${clinicId}/state`,
        input,
      );
      return persistState(sortQueueState(response.data.state));
    }

    const state = await readClinicState(clinicId);
    return persistState(sortQueueState(setEmergencyStateState(state, input)));
  },
};
