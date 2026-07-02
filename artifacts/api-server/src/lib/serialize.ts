import type {
  User,
  Sheet,
  SheetContact,
  Worker,
  Booking,
  Event,
} from "@workspace/db";

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function serializeUser(u: User) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as "admin" | "standard",
    mustChangePassword: u.mustChangePassword,
    createdAt: iso(u.createdAt),
  };
}

// A sheet's display name is ALWAYS derived from client company + depot
// ("Client — Depot"), never user-entered. Deriving on read means existing
// sheets display consistently and any client/depot edit updates the name.
export function sheetDisplayName(clientCompany: string, depot: string | null | undefined): string {
  return depot && depot.trim() ? `${clientCompany} — ${depot}` : clientCompany;
}

export function serializeSheet(s: Sheet) {
  return {
    id: s.id,
    name: sheetDisplayName(s.clientCompany, s.depot),
    clientCompany: s.clientCompany,
    depot: s.depot,
    workerType: s.workerType,
    createdAt: iso(s.createdAt),
  };
}

export function serializeSheetContact(c: SheetContact) {
  return {
    id: c.id,
    sheetId: c.sheetId,
    contactName: c.contactName,
    email: c.email,
    isPrimary: c.isPrimary,
  };
}

export function serializeWorker(w: Worker) {
  return {
    id: w.id,
    vincereId: w.vincereId,
    fullName: w.fullName,
    phone: w.phone,
    jobRole: w.jobRole,
    customJobTitle: w.customJobTitle,
    workerType: w.workerType,
    startDate: w.startDate,
    status: w.status,
    doNotBook: w.doNotBook,
    syncedAt: iso(w.syncedAt),
  };
}

function shortTime(t: string | null): string | null {
  if (t == null) return null;
  // Postgres TIME comes back as HH:MM:SS — trim to HH:MM
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function serializeBooking(b: Booking) {
  return {
    id: b.id,
    workerId: b.workerId,
    sheetId: b.sheetId,
    shiftDate: b.shiftDate,
    status: b.status,
    startTime: shortTime(b.startTime),
    note: b.note,
    createdBy: b.createdBy,
    updatedBy: b.updatedBy,
    createdAt: iso(b.createdAt),
    updatedAt: iso(b.updatedAt),
  };
}

export function serializeEvent(e: Event) {
  return {
    id: e.id,
    workerId: e.workerId,
    sheetId: e.sheetId,
    eventDate: e.eventDate,
    eventType: e.eventType,
    notes: e.notes,
    createdBy: e.createdBy,
    createdAt: iso(e.createdAt),
  };
}
