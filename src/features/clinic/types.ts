export type ClinicId = "surgery" | "dental" | "pharmacy";

export type QueueSource = "booking" | "walk-in";
export type QueueStatus =
  | "waiting"
  | "in-progress"
  | "hold"
  | "done"
  | "skipped";
export type SyncState = "synced" | "pending";

export type ClinicDefinition = {
  id: ClinicId;
  slug: string;
  shortName: string;
  title: string;
  subtitle: string;
  metaLine?: string;
  prefix: string;
  phone: string;
  email?: string;
  locationLabel: string;
  hoursLabel: string;
  accentColor: string;
  hasBooking: boolean;
  mapUrl?: string;
};

export type QueueEntry = {
  id: string;
  clinicId: ClinicId;
  clientRequestId: string;
  queueOrder?: number;
  token: string;
  bookingId: string;
  name: string;
  mobile: string;
  source: QueueSource;
  dayLabel: string;
  slotLabel: string;
  status: QueueStatus;
  syncState: SyncState;
  createdAt: string;
  updatedAt?: string;
  notes?: string;
  provisionalToken?: string;
  provisionalBookingId?: string;
  requiresPharmacyFollowUp?: boolean;
  pharmacyStatus?: "not-needed" | "pending" | "done";
  isReportCheck?: boolean;
  arrivedAt?: string;
};

export type ClinicSettings = {
  doctorName: string;
  clinicName: string;
  address: string;
  phone: string;
  whatsapp: string;
};

export type ClinicState = {
  clinicId: ClinicId;
  clinicName: string;
  clinicSubtitle: string;
  clinicPrefix: string;
  doctorMessage: string;
  lastUpdated: string;
  lastSyncedAt?: string;
  queue: QueueEntry[];
  emergencyClosed?: boolean;
  emergencyMessage?: string;
  bookingClosedToday?: boolean;
  bookingClosedTomorrow?: boolean;
  settings?: ClinicSettings;
};

export type CreateBookingInput = {
  clinicId: ClinicId;
  dayLabel: string;
  slotLabel: string;
  name: string;
  mobile: string;
  clientRequestId?: string;
  createdAt?: string;
  requiresPharmacyFollowUp?: boolean;
};

export type CreateWalkInInput = {
  clinicId: ClinicId;
  name?: string;
  mobile?: string;
  clientRequestId?: string;
  createdAt?: string;
  requiresPharmacyFollowUp?: boolean;
};

export type QueueSummary = {
  current: QueueEntry | null;
  next: QueueEntry | null;
  waiting: QueueEntry[];
  holdCount: number;
  walkIns: number;
  bookings: number;
};
