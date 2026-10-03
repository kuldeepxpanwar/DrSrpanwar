import "server-only";

import { randomUUID } from "crypto";
import { getClinicDefinition } from "@/features/clinic/catalog";
import { createEmptyClinicState } from "@/features/clinic/services/queue-engine";
import type {
  ClinicId,
  ClinicState,
  CreateBookingInput,
  CreateWalkInInput,
  QueueEntry,
  QueueSource,
  QueueStatus,
} from "@/features/clinic/types";
import { getDb, toIsoString } from "@/lib/supabase/db";
import { saveVisitRecord } from "@/lib/db/patient-history";

type QueryableDb = {
  <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): T;
};

type ClinicStateRow = {
  clinic_id: ClinicId;
  clinic_name: string;
  clinic_subtitle: string;
  clinic_prefix: string;
  doctor_message: string;
  next_token_number: number;
  next_queue_order: number;
  emergency_closed: boolean;
  emergency_message: string;
  last_updated: string | Date;
  last_synced_at: string | Date;
};

type QueueEntryRow = {
  id: string;
  clinic_id: ClinicId;
  client_request_id: string;
  queue_order: number;
  token: string;
  booking_id: string;
  name: string;
  mobile: string;
  source: QueueSource;
  day_label: string;
  slot_label: string;
  status: QueueStatus;
  sync_state: "synced" | "pending";
  created_at: string | Date;
  updated_at: string | Date;
  notes: string | null;
  requires_pharmacy_follow_up: boolean;
  pharmacy_status: "not-needed" | "pending" | "done";
  arrived_at?: string | Date | null;
};

type PendingSyncEntry = {
  clientRequestId: string;
  createdAt?: string;
  source: QueueSource;
  name: string;
  mobile: string;
  dayLabel: string;
  slotLabel: string;
  provisionalToken?: string;
  provisionalBookingId?: string;
  requiresPharmacyFollowUp?: boolean;
  arrivedAt?: string;
};

function sanitizeMobile(value: string) {
  return value.replace(/\D/g, "").slice(-10);
}

function padSequence(value: number) {
  return String(value).padStart(3, "0");
}

function getBookingIdPrefix(clinicId: ClinicId, source: QueueSource) {
  if (clinicId === "pharmacy") {
    return "RX";
  }

  return source === "booking" ? "BK" : "WI";
}

function createClinicDocument(clinicId: ClinicId): ClinicStateRow {
  const baseState = createEmptyClinicState(clinicId);

  return {
    clinic_id: clinicId,
    clinic_name: baseState.clinicName,
    clinic_subtitle: baseState.clinicSubtitle,
    clinic_prefix: baseState.clinicPrefix,
    doctor_message: baseState.doctorMessage,
    next_token_number: 1,
    next_queue_order: 1,
    emergency_closed: false,
    emergency_message: "",
    last_updated: baseState.lastUpdated,
    last_synced_at: baseState.lastSyncedAt ?? baseState.lastUpdated,
  };
}

function mapQueueEntry(row: QueueEntryRow): QueueEntry {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    clientRequestId: row.client_request_id,
    queueOrder: row.queue_order,
    token: row.token,
    bookingId: row.booking_id,
    name: row.name,
    mobile: row.mobile,
    source: row.source,
    dayLabel: row.day_label,
    slotLabel: row.slot_label,
    status: row.status,
    syncState: row.sync_state,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    notes: row.notes?.replace("[REPORT_CHECK]", "")?.trim() || undefined,
    isReportCheck: row.notes?.includes("[REPORT_CHECK]") ?? false,
    requiresPharmacyFollowUp: row.requires_pharmacy_follow_up,
    pharmacyStatus: row.pharmacy_status,
    arrivedAt: row.arrived_at ? toIsoString(row.arrived_at) : undefined,
  };
}

function normalizeClinicState(
  clinicId: ClinicId,
  clinicDocument: ClinicStateRow | undefined,
  queue: QueueEntry[],
): ClinicState {
  const clinic = getClinicDefinition(clinicId);

  return {
    clinicId,
    clinicName: clinicDocument?.clinic_name ?? clinic.title,
    clinicSubtitle: clinicDocument?.clinic_subtitle ?? clinic.subtitle,
    clinicPrefix: clinicDocument?.clinic_prefix ?? clinic.prefix,
    doctorMessage:
      clinicDocument?.doctor_message ??
      (clinicId === "pharmacy"
        ? "Medicines aur follow-up pickup ke liye token lein."
        : "Appointment aur walk-in dono available hain."),
    lastUpdated: clinicDocument ? toIsoString(clinicDocument.last_updated) : new Date().toISOString(),
    lastSyncedAt: clinicDocument
      ? toIsoString(clinicDocument.last_synced_at)
      : new Date().toISOString(),
    emergencyClosed: clinicDocument?.emergency_closed ?? false,
    emergencyMessage: clinicDocument?.emergency_message ?? "",
    queue: queue.sort((first, second) => {
      const firstOrder = first.queueOrder ?? Number.MAX_SAFE_INTEGER;
      const secondOrder = second.queueOrder ?? Number.MAX_SAFE_INTEGER;

      if (firstOrder === secondOrder) {
        return first.createdAt.localeCompare(second.createdAt);
      }

      return firstOrder - secondOrder;
    }),
  };
}

async function ensureClinicInitialized(sql: QueryableDb, clinicId: ClinicId) {
  const document = createClinicDocument(clinicId);

  await sql`
    insert into clinic_states (
      clinic_id,
      clinic_name,
      clinic_subtitle,
      clinic_prefix,
      doctor_message,
      next_token_number,
      next_queue_order,
      emergency_closed,
      emergency_message,
      last_updated,
      last_synced_at
    )
    values (
      ${document.clinic_id},
      ${document.clinic_name},
      ${document.clinic_subtitle},
      ${document.clinic_prefix},
      ${document.doctor_message},
      ${document.next_token_number},
      ${document.next_queue_order},
      ${document.emergency_closed},
      ${document.emergency_message},
      ${toIsoString(document.last_updated)},
      ${toIsoString(document.last_synced_at)}
    )
    on conflict (clinic_id) do nothing
  `;
}

async function readClinicQueueFrom(sql: QueryableDb, clinicId: ClinicId) {
  const rows = (await sql<QueueEntryRow[]>`
    select
      id,
      clinic_id,
      client_request_id,
      queue_order,
      token,
      booking_id,
      name,
      mobile,
      source,
      day_label,
      slot_label,
      status,
      sync_state,
      created_at,
      updated_at,
      notes,
      requires_pharmacy_follow_up,
      pharmacy_status,
      arrived_at
    from queue_entries
    where clinic_id = ${clinicId}
    order by queue_order asc
  `) as QueueEntryRow[];

  return rows.map(mapQueueEntry);
}

async function promoteNextWaitingEntry(
  sql: QueryableDb,
  clinicId: ClinicId,
  updateTimestamp: string,
) {
  const [activeEntry] = await sql<{ id: string }[]>`
    select id
    from queue_entries
    where clinic_id = ${clinicId} and status = 'in-progress' and day_label = 'Aaj' and source = 'walk-in'
    order by queue_order asc
    limit 1
  `;

  if (activeEntry) {
    return;
  }

  const [nextEntry] = await sql<{ id: string }[]>`
    select id
    from queue_entries
    where clinic_id = ${clinicId} and status = 'waiting' and day_label = 'Aaj' and source = 'walk-in'
    order by queue_order asc
    limit 1
    for update
  `;

  if (!nextEntry) {
    return;
  }

  await sql`
    update queue_entries
    set status = 'in-progress', updated_at = ${updateTimestamp}
    where id = ${nextEntry.id}
  `;
}

function createQueueEntry(
  clinicId: ClinicId,
  clinicDocument: ClinicStateRow,
  input: PendingSyncEntry,
) {
  const clinic = getClinicDefinition(clinicId);
  const tokenNumber = clinicDocument.next_token_number;
  const queueOrder = clinicDocument.next_queue_order;
  const token = `${clinic.prefix}-${padSequence(tokenNumber)}`;
  const bookingId = `${getBookingIdPrefix(clinicId, input.source)}-${clinic.prefix}-${padSequence(
    tokenNumber,
  )}`;
  const createdAt = input.createdAt ?? new Date().toISOString();

  return {
    entry: {
      id: input.clientRequestId,
      clinic_id: clinicId,
      client_request_id: input.clientRequestId,
      queue_order: queueOrder,
      token,
      booking_id: bookingId,
      name: input.name.trim() || "Walk-in Patient",
      mobile: sanitizeMobile(input.mobile),
      source: input.source,
      day_label: input.dayLabel,
      slot_label: input.slotLabel,
      status: "waiting" as const,
      sync_state: "synced" as const,
      created_at: createdAt,
      updated_at: createdAt,
      notes: input.provisionalToken
        ? `Synced from ${input.provisionalToken}`
        : null,
      requires_pharmacy_follow_up: Boolean(input.requiresPharmacyFollowUp),
      pharmacy_status: input.requiresPharmacyFollowUp ? "pending" : "not-needed",
      arrived_at: input.arrivedAt ?? null,
    } satisfies QueueEntryRow,
    nextClinicDocument: {
      ...clinicDocument,
      next_token_number: tokenNumber + 1,
      next_queue_order: queueOrder + 1,
    },
  };
}

export async function getRemoteClinicState(clinicId: ClinicId): Promise<ClinicState> {
  const db = getDb();
  await ensureClinicInitialized(db, clinicId);

  const [clinicDocument] = await db<ClinicStateRow[]>`
    select
      clinic_id,
      clinic_name,
      clinic_subtitle,
      clinic_prefix,
      doctor_message,
      next_token_number,
      next_queue_order,
      emergency_closed,
      emergency_message,
      last_updated,
      last_synced_at
    from clinic_states
    where clinic_id = ${clinicId}
    limit 1
  `;

  // Auto-reset daily logic
  if (clinicDocument && clinicDocument.last_updated) {
    const lastUpdateDate = new Date(clinicDocument.last_updated).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
    const currentDate = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
    if (lastUpdateDate !== currentDate) {
      console.log(`[Auto-Reset] Triggering daily reset for ${clinicId}. Last updated: ${lastUpdateDate}, Current: ${currentDate}`);
      return await resetRemoteClinicQueue(clinicId);
    }
  }

  const queue = await readClinicQueueFrom(db, clinicId);
  const normalizedState = normalizeClinicState(clinicId, clinicDocument, queue);

  try {
    const { getClinicSettings } = await import("@/lib/db/clinic-settings");
    const settings = await getClinicSettings(clinicId);
    if (settings) {
      normalizedState.settings = {
        doctorName: settings.doctorName,
        clinicName: settings.clinicName,
        address: settings.address,
        phone: settings.phone,
        whatsapp: settings.whatsapp,
      };
      
      // Override default names if setting exists
      if (settings.clinicName) normalizedState.clinicName = settings.clinicName;
      if (settings.address) normalizedState.clinicSubtitle = settings.address;
    }
  } catch (err) {
    console.error("Failed to fetch clinic settings:", err);
  }

  return normalizedState;
}

async function upsertRemoteEntries(clinicId: ClinicId, entries: PendingSyncEntry[]) {
  const db = getDb();
  const syncTimestamp = new Date().toISOString();

  await db.begin(async (tx) => {
    await ensureClinicInitialized(tx, clinicId);
    const [clinicDocument] = await tx<ClinicStateRow[]>`
      select
        clinic_id,
        clinic_name,
        clinic_subtitle,
        clinic_prefix,
        doctor_message,
        next_token_number,
        next_queue_order,
        emergency_closed,
        emergency_message,
        last_updated,
        last_synced_at
      from clinic_states
      where clinic_id = ${clinicId}
      for update
    `;

    let nextClinicDocument = clinicDocument ?? createClinicDocument(clinicId);
    let touched = false;

    for (const pendingEntry of entries) {
      const requestId = pendingEntry.clientRequestId || `request-${randomUUID()}`;
      const existing = await tx<{ id: string }[]>`
        select id
        from queue_entries
        where client_request_id = ${requestId}
        limit 1
      `;

      if (existing.length > 0) {
        continue;
      }

      const { entry, nextClinicDocument: updatedClinicDocument } = createQueueEntry(
        clinicId,
        nextClinicDocument,
        {
          ...pendingEntry,
          clientRequestId: requestId,
        },
      );

      await tx`
        insert into queue_entries (
          id,
          clinic_id,
          client_request_id,
          queue_order,
          token,
          booking_id,
          name,
          mobile,
          source,
          day_label,
          slot_label,
          status,
          sync_state,
          created_at,
          updated_at,
          notes,
          requires_pharmacy_follow_up,
          pharmacy_status,
          arrived_at
        )
        values (
          ${entry.id},
          ${entry.clinic_id},
          ${entry.client_request_id},
          ${entry.queue_order},
          ${entry.token},
          ${entry.booking_id},
          ${entry.name},
          ${entry.mobile},
          ${entry.source},
          ${entry.day_label},
          ${entry.slot_label},
          ${entry.status},
          ${entry.sync_state},
          ${entry.created_at},
          ${entry.updated_at},
          ${entry.notes},
          ${entry.requires_pharmacy_follow_up},
          ${entry.pharmacy_status},
          ${entry.arrived_at ?? null}
        )
      `;

      nextClinicDocument = updatedClinicDocument;
      touched = true;
    }

    if (touched || !clinicDocument) {
      await tx`
        update clinic_states
        set
          clinic_name = ${nextClinicDocument.clinic_name},
          clinic_subtitle = ${nextClinicDocument.clinic_subtitle},
          clinic_prefix = ${nextClinicDocument.clinic_prefix},
          doctor_message = ${nextClinicDocument.doctor_message},
          next_token_number = ${nextClinicDocument.next_token_number},
          next_queue_order = ${nextClinicDocument.next_queue_order},
          emergency_closed = ${nextClinicDocument.emergency_closed},
          emergency_message = ${nextClinicDocument.emergency_message},
          last_updated = ${syncTimestamp},
          last_synced_at = ${syncTimestamp}
        where clinic_id = ${clinicId}
      `;
    }
  });

  return getRemoteClinicState(clinicId);
}

export async function createRemoteBooking(input: CreateBookingInput) {
  return upsertRemoteEntries(input.clinicId, [
    {
      clientRequestId: input.clientRequestId || `request-${randomUUID()}`,
      createdAt: input.createdAt,
      source: "booking",
      name: input.name,
      mobile: input.mobile,
      dayLabel: input.dayLabel,
      slotLabel: input.slotLabel,
      requiresPharmacyFollowUp: input.requiresPharmacyFollowUp,
    },
  ]);
}

export async function createRemoteWalkIn(input: CreateWalkInInput) {
  const clinic = getClinicDefinition(input.clinicId);

  return upsertRemoteEntries(input.clinicId, [
    {
      clientRequestId: input.clientRequestId || `request-${randomUUID()}`,
      createdAt: input.createdAt,
      source: "walk-in",
      name: input.name?.trim() || "Walk-in Patient",
      mobile: input.mobile ?? "",
      dayLabel: "Aaj",
      slotLabel: clinic.id === "pharmacy" ? "Pickup" : "Walk-in",
      requiresPharmacyFollowUp: input.requiresPharmacyFollowUp,
    },
  ]);
}

export async function syncRemotePendingEntries(
  clinicId: ClinicId,
  pendingEntries: PendingSyncEntry[],
) {
  return upsertRemoteEntries(clinicId, pendingEntries);
}

export async function advanceRemoteQueue(clinicId: ClinicId) {
  const db = getDb();
  const updateTimestamp = new Date().toISOString();

  await db.begin(async (tx) => {
    await ensureClinicInitialized(tx, clinicId);
    await tx`
      select clinic_id
      from clinic_states
      where clinic_id = ${clinicId}
      for update
    `;

    const [currentEntry] = await tx<{ id: string }[]>`
      select id
      from queue_entries
      where clinic_id = ${clinicId} and status = 'in-progress'
      order by queue_order asc
      limit 1
      for update
    `;

    if (currentEntry) {
      await tx`
        update queue_entries
        set status = 'done', updated_at = ${updateTimestamp}
        where id = ${currentEntry.id}
      `;
    }

    const [nextEntry] = await tx<{ id: string }[]>`
      select id
      from queue_entries
      where clinic_id = ${clinicId} and status = 'waiting'
      order by queue_order asc
      limit 1
      for update
    `;

    if (nextEntry) {
      await tx`
        update queue_entries
        set status = 'in-progress', updated_at = ${updateTimestamp}
        where id = ${nextEntry.id}
      `;
    }

    if (currentEntry || nextEntry) {
      await tx`
        update clinic_states
        set last_updated = ${updateTimestamp}, last_synced_at = ${updateTimestamp}
        where clinic_id = ${clinicId}
      `;
    }
  });

  return getRemoteClinicState(clinicId);
}

export async function updateRemoteQueueEntryStatus(
  clinicId: ClinicId,
  entryId: string,
  status: QueueStatus,
) {
  const db = getDb();
  const updateTimestamp = new Date().toISOString();
  const entryToSave = await db.begin(async (tx) => {
    await ensureClinicInitialized(tx, clinicId);
    await tx`
      select clinic_id
      from clinic_states
      where clinic_id = ${clinicId}
      for update
    `;

    const [entrySnapshot] = await tx<QueueEntryRow[]>`
      select *
      from queue_entries
      where clinic_id = ${clinicId} and id = ${entryId}
      limit 1
      for update
    `;

    if (!entrySnapshot) {
      throw new Error("Queue entry not found.");
    }

    await tx`
      update queue_entries
      set status = ${status}, updated_at = ${updateTimestamp}
      where id = ${entryId}
    `;

    if (status === "done" || status === "skipped" || status === "hold") {
      await promoteNextWaitingEntry(tx, clinicId, updateTimestamp);
    }

    await tx`
      update clinic_states
      set last_updated = ${updateTimestamp}, last_synced_at = ${updateTimestamp}
      where clinic_id = ${clinicId}
    `;

    return entrySnapshot;
  });

  if (status === "done" && entryToSave) {
    await saveVisitRecord(entryToSave.mobile, entryToSave.name, clinicId, {
      token: entryToSave.token,
      bookingId: entryToSave.booking_id,
      source: entryToSave.source,
      dayLabel: entryToSave.day_label,
      slotLabel: entryToSave.slot_label,
    });
  }

  return getRemoteClinicState(clinicId);
}

export async function updateRemoteQueueEntryArrivedAt(
  clinicId: ClinicId,
  entryId: string,
  arrivedAt: string,
) {
  const db = getDb();
  await db`
    update queue_entries
    set
      arrived_at = ${arrivedAt},
      updated_at = ${new Date().toISOString()}
    where clinic_id = ${clinicId} and id = ${entryId}
  `;

  await db`
    update clinic_states
    set last_updated = ${new Date().toISOString()}
    where clinic_id = ${clinicId}
  `;
}

export async function markRemoteEntryAsReportCheck(clinicId: ClinicId, entryId: string) {
  const db = getDb();
  const updateTimestamp = new Date().toISOString();

  await db.begin(async (tx) => {
    await ensureClinicInitialized(tx, clinicId);
    await tx`
      select clinic_id
      from clinic_states
      where clinic_id = ${clinicId}
      for update
    `;

    const [entrySnapshot] = await tx<{ id: string, status: string }[]>`
      select id, status
      from queue_entries
      where clinic_id = ${clinicId} and id = ${entryId}
      limit 1
      for update
    `;

    if (!entrySnapshot) {
      throw new Error("Queue entry not found.");
    }

    // Find the currently in-progress or first waiting patient
    const [currentEntry] = await tx<{ queue_order: number }[]>`
      select queue_order
      from queue_entries
      where clinic_id = ${clinicId} and status in ('in-progress', 'waiting') and id <> ${entryId}
      order by queue_order asc
      limit 1
    `;

    // If no one is waiting/in-progress, target order is 0, they become first.
    const targetOrder = currentEntry ? currentEntry.queue_order : 0;

    // Shift everyone after target order down by 1
    await tx`
      update queue_entries
      set queue_order = queue_order + 1
      where clinic_id = ${clinicId} and status = 'waiting' and queue_order > ${targetOrder}
    `;

    // Insert the returning patient right after the target order
    await tx`
      update queue_entries
      set 
        status = 'waiting',
        queue_order = ${targetOrder + 1},
        notes = concat(coalesce(notes, ''), ' [REPORT_CHECK]'),
        updated_at = ${updateTimestamp}
      where id = ${entryId}
    `;

    await tx`
      update clinic_states
      set last_updated = ${updateTimestamp}, last_synced_at = ${updateTimestamp}
      where clinic_id = ${clinicId}
    `;
  });

  return getRemoteClinicState(clinicId);
}

export async function rescheduleRemoteQueueEntry(clinicId: ClinicId, entryId: string) {
  const db = getDb();
  const updateTimestamp = new Date().toISOString();

  await db.begin(async (tx) => {
    await ensureClinicInitialized(tx, clinicId);
    const [clinicDocument] = await tx<ClinicStateRow[]>`
      select
        clinic_id,
        clinic_name,
        clinic_subtitle,
        clinic_prefix,
        doctor_message,
        next_token_number,
        next_queue_order,
        emergency_closed,
        emergency_message,
        last_updated,
        last_synced_at
      from clinic_states
      where clinic_id = ${clinicId}
      for update
    `;

    const [entrySnapshot] = await tx<{ id: string }[]>`
      select id
      from queue_entries
      where clinic_id = ${clinicId} and id = ${entryId}
      limit 1
      for update
    `;

    if (!entrySnapshot) {
      throw new Error("Queue entry not found.");
    }

    const nextQueueOrder = clinicDocument?.next_queue_order ?? 1;

    await tx`
      update queue_entries
      set
        day_label = 'Kal',
        slot_label = ${clinicId === "pharmacy" ? "Pickup" : "11:30 AM"},
        status = 'waiting',
        queue_order = ${nextQueueOrder},
        updated_at = ${updateTimestamp},
        notes = ${
          clinicId === "pharmacy"
            ? "Medicine pickup kept for next availability."
            : "Kal 11:30 AM par rescheduled"
        }
      where id = ${entryId}
    `;

    await promoteNextWaitingEntry(tx, clinicId, updateTimestamp);

    await tx`
      update clinic_states
      set
        next_queue_order = ${nextQueueOrder + 1},
        last_updated = ${updateTimestamp},
        last_synced_at = ${updateTimestamp}
      where clinic_id = ${clinicId}
    `;
  });

  return getRemoteClinicState(clinicId);
}

export async function resetRemoteClinicQueue(clinicId: ClinicId): Promise<ClinicState> {
  const db = getDb();
  const document = createClinicDocument(clinicId);
  const clinic = getClinicDefinition(clinicId);

  await db.begin(async (tx) => {
    await ensureClinicInitialized(tx, clinicId);
    
    // Delete only Aaj's entries (clearing today's history)
    await tx`
      delete from queue_entries
      where clinic_id = ${clinicId} and day_label = 'Aaj'
    `;

    // Fetch tomorrow's bookings
    const kalEntries = await tx<QueueEntryRow[]>`
      select * from queue_entries
      where clinic_id = ${clinicId} and day_label = 'Kal'
      order by queue_order asc, created_at asc
    `;

    let nextToken = 1;
    let nextOrder = 1;

    // Promote tomorrow's bookings to today, assigning new tokens
    for (const entry of kalEntries) {
      const newToken = `${clinic.prefix}-${padSequence(nextToken)}`;
      await tx`
        update queue_entries
        set
          day_label = 'Aaj',
          token = ${newToken},
          queue_order = ${nextOrder},
          updated_at = ${toIsoString(new Date())}
        where id = ${entry.id}
      `;
      nextToken++;
      nextOrder++;
    }

    await tx`
      update clinic_states
      set
        clinic_name = ${document.clinic_name},
        clinic_subtitle = ${document.clinic_subtitle},
        clinic_prefix = ${document.clinic_prefix},
        doctor_message = ${document.doctor_message},
        next_token_number = ${nextToken},
        next_queue_order = ${nextOrder},
        emergency_closed = ${document.emergency_closed},
        emergency_message = ${document.emergency_message},
        last_updated = ${toIsoString(new Date())},
        last_synced_at = ${toIsoString(new Date())}
      where clinic_id = ${clinicId}
    `;
  });

  return getRemoteClinicState(clinicId);
}

export async function setRemoteClinicEmergencyState(
  clinicId: ClinicId,
  input: { emergencyClosed: boolean; emergencyMessage?: string },
) {
  const db = getDb();
  const timestamp = new Date().toISOString();

  await ensureClinicInitialized(db, clinicId);
  await db`
    update clinic_states
    set
      emergency_closed = ${input.emergencyClosed},
      emergency_message = ${input.emergencyClosed ? input.emergencyMessage?.trim() || "" : ""},
      last_updated = ${timestamp},
      last_synced_at = ${timestamp}
    where clinic_id = ${clinicId}
  `;

  return getRemoteClinicState(clinicId);
}
