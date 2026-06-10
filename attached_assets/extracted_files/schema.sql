-- ============================================================
-- Driver Booking System — PostgreSQL schema
-- For Replit (uses the built-in PostgreSQL database).
-- Run this ONCE to create all tables. Internal use only.
-- ============================================================

-- 1. Users — your account managers (for login + audit trail)
CREATE TABLE users (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Contracts — a client + location combo (one per "sheet")
CREATE TABLE contracts (
    id                   SERIAL PRIMARY KEY,
    company_name         TEXT NOT NULL,
    client_contact_name  TEXT,
    client_contact_email TEXT,
    location             TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Drivers — a THIN CACHE pulled from Vincere. Vincere stays the master record.
--    You store only what the grid and confirmations need.
CREATE TABLE drivers (
    id          SERIAL PRIMARY KEY,
    vincere_id  TEXT UNIQUE,          -- link back to the Vincere candidate record
    full_name   TEXT NOT NULL,
    phone       TEXT,                 -- needed to send Twilio text confirmations
    job_role    TEXT,                 -- e.g. HGV 1, HGV 2
    notes       TEXT,                 -- e.g. "Fully flex", "04:00-12:00"
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT now()  -- last refresh from Vincere
);

-- 4. Driver–Contract links — a driver can sit on more than one contract
CREATE TABLE driver_contracts (
    driver_id   INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    PRIMARY KEY (driver_id, contract_id)
);

-- 5. Bookings — THE HEART. One row per driver per day.
CREATE TABLE bookings (
    id           SERIAL PRIMARY KEY,
    driver_id    INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    contract_id  INTEGER NOT NULL REFERENCES contracts(id) ON DELETE RESTRICT,
    shift_date   DATE NOT NULL,
    status       TEXT NOT NULL DEFAULT 'Available'
                 CHECK (status IN ('Available','Pre-Booked','Rest','Off','Holiday','Confirmed')),
    start_time   TIME,                -- 24h clock; NULL unless the driver is working
    created_by   INTEGER REFERENCES users(id),
    updated_by   INTEGER REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- A driver can only hold ONE cell per day. This is your double-booking guard.
    CONSTRAINT one_booking_per_driver_per_day UNIQUE (driver_id, shift_date)
);

CREATE INDEX idx_bookings_date     ON bookings (shift_date);
CREATE INDEX idx_bookings_contract ON bookings (contract_id);

-- 6. Audit log — records every change (old value -> new value), who, and when
CREATE TABLE audit_log (
    id          SERIAL PRIMARY KEY,
    booking_id  INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
    user_id     INTEGER REFERENCES users(id),
    action      TEXT NOT NULL,       -- 'created', 'status_change', 'time_change', 'deleted'
    old_value   TEXT,
    new_value   TEXT,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_booking ON audit_log (booking_id);

-- 7. Messages — confirmations sent/received via the central company number
CREATE TABLE messages (
    id            SERIAL PRIMARY KEY,
    driver_id     INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    shift_date    DATE,
    direction     TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
    channel       TEXT NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms','email')),
    body          TEXT,
    status        TEXT,              -- 'sent','delivered','failed','replied'
    sent_by       INTEGER REFERENCES users(id),
    sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    response_text TEXT,
    responded_at  TIMESTAMPTZ
);

CREATE INDEX idx_messages_driver ON messages (driver_id);
