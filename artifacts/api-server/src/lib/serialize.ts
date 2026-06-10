import type {
  User,
  Contract,
  Driver,
  Booking,
} from "@workspace/db";

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function serializeUser(u: User) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    createdAt: iso(u.createdAt),
  };
}

export function serializeContract(c: Contract) {
  return {
    id: c.id,
    companyName: c.companyName,
    clientContactName: c.clientContactName,
    clientContactEmail: c.clientContactEmail,
    location: c.location,
    createdAt: iso(c.createdAt),
  };
}

export function serializeDriver(d: Driver) {
  return {
    id: d.id,
    vincereId: d.vincereId,
    fullName: d.fullName,
    phone: d.phone,
    jobRole: d.jobRole,
    notes: d.notes,
    active: d.active,
    syncedAt: iso(d.syncedAt),
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
    driverId: b.driverId,
    contractId: b.contractId,
    shiftDate: b.shiftDate,
    status: b.status,
    startTime: shortTime(b.startTime),
    createdBy: b.createdBy,
    updatedBy: b.updatedBy,
    createdAt: iso(b.createdAt),
    updatedAt: iso(b.updatedAt),
  };
}
