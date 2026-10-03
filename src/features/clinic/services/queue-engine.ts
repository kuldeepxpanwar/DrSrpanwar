import { createSeedClinicState } from "@/features/clinic/data/seed";
import { getClinicDefinition } from "@/features/clinic/catalog";
import type {
  ClinicId,
  ClinicState,
  CreateBookingInput,
  CreateWalkInInput,
  QueueEntry,
  QueueStatus,
  QueueSummary,
} from "@/features/clinic/types";

function sanitizeMobile(value: string) {
  return value.replace(/\D/g, "").slice(-10);
}

function touchState(state: ClinicState, syncTimestamp?: string): ClinicState {
  return {
    ...state,
    lastUpdated: new Date().toISOString(),
    lastSyncedAt: syncTimestamp ?? state.lastSyncedAt,
  };
}

function getNextNumericToken(queue: QueueEntry[], prefix: string) {
  const values = queue
    .filter((entry) => entry.token.startsWith(`${prefix}-`))
    .map((entry) => Number(entry.token.split("-")[1]))
    .filter((value) => Number.isFinite(value));

  return (values.length ? Math.max(...values) : 0) + 1;
}

function getNextTempSequence(queue: QueueEntry[]) {
  const values = queue
    .flatMap((entry) => [entry.token, entry.provisionalToken])
    .filter((token): token is string => Boolean(token))
    .filter((token) => token.startsWith("TEMP-"))
    .map((token) => Number(token.split("-")[1]))
    .filter((value) => Number.isFinite(value));

  return (values.length ? Math.max(...values) : 0) + 1;
}

function getNextQueueOrder(queue: QueueEntry[]) {
  const values = queue
    .map((entry, index) => entry.queueOrder ?? index + 1)
    .filter((value) => Number.isFinite(value));

  return (values.length ? Math.max(...values) : 0) + 1;
}

function getNextTempReference(queue: QueueEntry[], prefix: "TEMP-BK" | "TEMP-WI") {
  const values = queue
    .flatMap((entry) => [entry.bookingId, entry.provisionalBookingId])
    .filter((bookingId): bookingId is string => Boolean(bookingId))
    .filter((bookingId) => bookingId.startsWith(`${prefix}-`))
    .map((bookingId) => Number(bookingId.split("-")[2]))
    .filter((value) => Number.isFinite(value));

  return (values.length ? Math.max(...values) : 0) + 1;
}

function createRequestId() {
  return `request-${crypto.randomUUID()}`;
}

export function createInitialClinicState(clinicId: ClinicId) {
  return createSeedClinicState(clinicId);
}

export function createEmptyClinicState(clinicId: ClinicId): ClinicState {
  const clinic = getClinicDefinition(clinicId);

  return {
    clinicId,
    clinicName: clinic.title,
    clinicSubtitle: clinic.subtitle,
    clinicPrefix: clinic.prefix,
    doctorMessage:
      clinicId === "pharmacy"
        ? "Medicines aur follow-up pickup ke liye token lein."
        : "Appointment aur walk-in dono available hain.",
    lastUpdated: new Date().toISOString(),
    lastSyncedAt: new Date().toISOString(),
    queue: [],
    emergencyClosed: false,
    emergencyMessage: "",
  };
}

export function createBookingState(
  state: ClinicState,
  input: CreateBookingInput,
  options: { online: boolean },
) {
  const normalizedMobile = sanitizeMobile(input.mobile);
  const cleanName = input.name.trim();
  const clinic = getClinicDefinition(input.clinicId);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const clientRequestId = input.clientRequestId ?? createRequestId();
  const queueOrder = getNextQueueOrder(state.queue);

  if (options.online) {
    const finalNumber = getNextNumericToken(state.queue, clinic.prefix);
    const token = `${clinic.prefix}-${String(finalNumber).padStart(3, "0")}`;
    const bookingId = `BK-${clinic.prefix}-${String(finalNumber).padStart(3, "0")}`;

    return touchState({
      ...state,
      queue: [
        ...state.queue,
        {
          id: `entry-${crypto.randomUUID()}`,
          clinicId: input.clinicId,
          clientRequestId,
          queueOrder,
          token,
          bookingId,
          name: cleanName,
          mobile: normalizedMobile,
          source: "booking",
          dayLabel: input.dayLabel,
          slotLabel: input.slotLabel,
          status: "waiting",
          syncState: "synced",
          createdAt,
          requiresPharmacyFollowUp: Boolean(input.requiresPharmacyFollowUp),
          pharmacyStatus: input.requiresPharmacyFollowUp ? "pending" : "not-needed",
          notes:
            input.dayLabel === "Kal"
              ? "Tomorrow booking saved for clinic review."
              : undefined,
        },
      ],
    });
  }

  const provisionalNumber = getNextTempSequence(state.queue);
  const provisionalToken = `TEMP-${String(provisionalNumber).padStart(3, "0")}`;
  const provisionalBookingId = `TEMP-BK-${String(
    getNextTempReference(state.queue, "TEMP-BK"),
  ).padStart(3, "0")}`;

  return touchState({
    ...state,
    queue: [
      ...state.queue,
      {
        id: `entry-${crypto.randomUUID()}`,
        clinicId: input.clinicId,
        clientRequestId,
        queueOrder,
        token: provisionalToken,
        bookingId: provisionalBookingId,
        provisionalToken,
        provisionalBookingId,
        name: cleanName,
        mobile: normalizedMobile,
        source: "booking",
        dayLabel: input.dayLabel,
        slotLabel: input.slotLabel,
        status: "waiting",
        syncState: "pending",
        createdAt,
        requiresPharmacyFollowUp: Boolean(input.requiresPharmacyFollowUp),
        pharmacyStatus: input.requiresPharmacyFollowUp ? "pending" : "not-needed",
        notes: "Offline provisional booking. Final token online sync par milega.",
      },
    ],
  });
}

export function createWalkInState(
  state: ClinicState,
  input: CreateWalkInInput,
  options: { online: boolean },
) {
  const cleanName = input.name?.trim() || "Walk-in Patient";
  const normalizedMobile = sanitizeMobile(input.mobile ?? "");
  const clinic = getClinicDefinition(input.clinicId);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const clientRequestId = input.clientRequestId ?? createRequestId();
  const queueOrder = getNextQueueOrder(state.queue);

  if (options.online) {
    const finalNumber = getNextNumericToken(state.queue, clinic.prefix);
    const token = `${clinic.prefix}-${String(finalNumber).padStart(3, "0")}`;
    const bookingId = `${clinic.id === "pharmacy" ? "RX" : "WI"}-${clinic.prefix}-${String(
      finalNumber,
    ).padStart(3, "0")}`;

    return touchState({
      ...state,
      queue: [
        ...state.queue,
        {
          id: `entry-${crypto.randomUUID()}`,
          clinicId: input.clinicId,
          clientRequestId,
          queueOrder,
          token,
          bookingId,
          name: cleanName,
          mobile: normalizedMobile,
          source: "walk-in",
          dayLabel: "Aaj",
          slotLabel: clinic.id === "pharmacy" ? "Pickup" : "Walk-in",
          status: "waiting",
          syncState: "synced",
          createdAt,
          requiresPharmacyFollowUp: Boolean(input.requiresPharmacyFollowUp),
          pharmacyStatus: input.requiresPharmacyFollowUp ? "pending" : "not-needed",
        },
      ],
    });
  }

  const provisionalNumber = getNextTempSequence(state.queue);
  const provisionalToken = `TEMP-${String(provisionalNumber).padStart(3, "0")}`;
  const provisionalBookingId = `TEMP-WI-${String(
    getNextTempReference(state.queue, "TEMP-WI"),
  ).padStart(3, "0")}`;

  return touchState({
    ...state,
    queue: [
      ...state.queue,
      {
        id: `entry-${crypto.randomUUID()}`,
        clinicId: input.clinicId,
        clientRequestId,
        queueOrder,
        token: provisionalToken,
        bookingId: provisionalBookingId,
        provisionalToken,
        provisionalBookingId,
        name: cleanName,
        mobile: normalizedMobile,
        source: "walk-in",
        dayLabel: "Aaj",
        slotLabel: clinic.id === "pharmacy" ? "Pickup" : "Walk-in",
        status: "waiting",
        syncState: "pending",
        createdAt,
        requiresPharmacyFollowUp: Boolean(input.requiresPharmacyFollowUp),
        pharmacyStatus: input.requiresPharmacyFollowUp ? "pending" : "not-needed",
        notes: "Offline provisional walk-in. Final token online sync par milega.",
      },
    ],
  });
}

export function syncPendingState(state: ClinicState) {
  const clinic = getClinicDefinition(state.clinicId);
  let nextNumber = getNextNumericToken(state.queue, clinic.prefix);
  const syncTimestamp = new Date().toISOString();

  const queue = state.queue.map((entry) => {
    if (entry.syncState !== "pending") {
      return entry;
    }

    const token = `${clinic.prefix}-${String(nextNumber).padStart(3, "0")}`;
    const bookingId = `${entry.source === "booking" ? "BK" : "WI"}-${clinic.prefix}-${String(
      nextNumber,
    ).padStart(3, "0")}`;
    nextNumber += 1;

    return {
      ...entry,
      token,
      bookingId,
      syncState: "synced" as const,
      updatedAt: syncTimestamp,
      notes: `Synced from ${entry.provisionalToken ?? "offline token"}`,
    };
  });

  return touchState(
    {
      ...state,
      queue,
    },
    syncTimestamp,
  );
}

export function advanceQueueState(state: ClinicState) {
  const nextQueue = [...state.queue];
  const currentIndex = nextQueue.findIndex((entry) => entry.status === "in-progress" && entry.dayLabel === "Aaj" && entry.source === "walk-in");

  if (currentIndex >= 0) {
    nextQueue[currentIndex] = {
      ...nextQueue[currentIndex],
      status: "done",
      updatedAt: new Date().toISOString(),
    };
  }

  const nextIndex = nextQueue.findIndex((entry) => entry.status === "waiting" && entry.dayLabel === "Aaj" && entry.source === "walk-in");

  if (nextIndex >= 0) {
    nextQueue[nextIndex] = {
      ...nextQueue[nextIndex],
      status: "in-progress",
      updatedAt: new Date().toISOString(),
    };
  }

  return touchState({
    ...state,
    queue: nextQueue,
  });
}

export function checkInState(state: ClinicState, entryId: string) {
  const nextQueue = [...state.queue];
  const index = nextQueue.findIndex((entry) => entry.id === entryId);

  if (index >= 0) {
    nextQueue[index] = {
      ...nextQueue[index],
      arrivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  return touchState({
    ...state,
    queue: nextQueue,
  });
}

export function updateQueueStatusState(
  state: ClinicState,
  entryId: string,
  status: QueueStatus,
) {
  return touchState({
    ...state,
    queue: state.queue.map((entry) =>
      entry.id === entryId
        ? {
            ...entry,
            status,
            updatedAt: new Date().toISOString(),
          }
        : entry,
    ),
  });
}

export function markReportCheckState(state: ClinicState, entryId: string) {
  const queue = [...state.queue];
  const entryIndex = queue.findIndex((entry) => entry.id === entryId);

  if (entryIndex < 0) {
    return state;
  }

  const [returningEntry] = queue.splice(entryIndex, 1);
  const currentEntryIndex = queue.findIndex((e) => e.status === "in-progress" || e.status === "waiting");
  
  const targetQueueOrder = currentEntryIndex >= 0 ? (queue[currentEntryIndex].queueOrder ?? 0) : 0;
  
  const insertIndex = currentEntryIndex >= 0 ? currentEntryIndex + 1 : 0;

  // Shift everyone after
  for (let i = insertIndex; i < queue.length; i++) {
    if (queue[i].status === "waiting" && (queue[i].queueOrder ?? 0) > targetQueueOrder) {
      queue[i] = { ...queue[i], queueOrder: (queue[i].queueOrder ?? 0) + 1 };
    }
  }

  queue.splice(insertIndex, 0, {
    ...returningEntry,
    status: "waiting",
    queueOrder: targetQueueOrder + 1,
    notes: `${returningEntry.notes || ""} [REPORT_CHECK]`.trim(),
    isReportCheck: true,
    updatedAt: new Date().toISOString(),
  });

  return touchState({
    ...state,
    queue,
  });
}

export function rescheduleQueueEntryState(state: ClinicState, entryId: string) {
  const queue = [...state.queue];
  const index = queue.findIndex((entry) => entry.id === entryId);

  if (index < 0) {
    return state;
  }

  const [entry] = queue.splice(index, 1);

  queue.push({
    ...entry,
    dayLabel: "Kal",
    slotLabel: "Morning",
    status: "waiting",
    source: "booking",
    queueOrder: getNextQueueOrder(queue),
    updatedAt: new Date().toISOString(),
    notes: "Kal ke liye rescheduled",
  });

  return touchState({
    ...state,
    queue,
  });
}

export function resetClinicState(clinicId: ClinicId) {
  return createInitialClinicState(clinicId);
}

export function setEmergencyStateState(
  state: ClinicState,
  input: { emergencyClosed: boolean; emergencyMessage?: string },
) {
  return touchState({
    ...state,
    emergencyClosed: input.emergencyClosed,
    emergencyMessage: input.emergencyClosed ? input.emergencyMessage?.trim() || "" : "",
  });
}

export function getQueueSummary(state: ClinicState): QueueSummary {
  // Only include today's entries (exclude tomorrow's "Kal" bookings from live queue)
  const isToday = (entry: QueueEntry) => entry.dayLabel !== "Kal";

  const current =
    state.queue.find((entry) => entry.status === "in-progress" && isToday(entry)) ??
    state.queue.find((entry) => entry.status === "waiting" && isToday(entry)) ??
    null;

  const waiting = state.queue.filter((entry) => entry.status === "waiting" && isToday(entry));
  const next = current?.status === "in-progress" ? waiting[0] ?? null : waiting[1] ?? null;

  return {
    current,
    next,
    waiting,
    holdCount: state.queue.filter((entry) => entry.status === "hold" && isToday(entry)).length,
    walkIns: state.queue.filter((entry) => entry.source === "walk-in").length,
    bookings: state.queue.filter((entry) => entry.source === "booking").length,
  };
}

export function getEntryPosition(state: ClinicState, entryId: string) {
  // Exclude tomorrow's bookings from position count (they don't affect today's wait)
  const activeQueue = state.queue.filter(
    (entry) =>
      entry.dayLabel !== "Kal" &&
      (entry.status === "in-progress" ||
        entry.status === "waiting" ||
        entry.status === "hold"),
  );

  const index = activeQueue.findIndex((entry) => entry.id === entryId);

  if (index < 0) {
    return null;
  }

  return {
    patientsAhead: Math.max(index, 0),
    estimatedWaitMinutes: Math.max(index, 0) * (state.clinicId === "pharmacy" ? 5 : 12),
  };
}

export function findEntriesByMobile(mobile: string, state: ClinicState) {
  const normalized = sanitizeMobile(mobile);

  if (!normalized) {
    return [];
  }

  return state.queue
    .filter((entry) => sanitizeMobile(entry.mobile) === normalized)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
