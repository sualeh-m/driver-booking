-- ============================================================
-- Driver & Warehouse Booking System — PostgreSQL schema (v2)
-- For Replit (built-in PostgreSQL). Run ONCE. Internal use only.
--
-- Rest-day rule (HGV only) is NOT stored here — it is computed
-- live from the bookings table. Thresholds (warn at 5, block at 6)
-- are app config, not hardcoded, so they can be changed easily.
-- ============================================================

-- 1. Users — account managers (login + audit trail)
CREATE TABLE users (
    id                   SERIAL PRIMARY KEY,
    name                 TEXT NOT NULL,
    email                TEXT NOT NULL UNIQUE,
    password_hash        TEXT,                                  -- scrypt hash; null only for not-yet-provisioned accounts
    role                 TEXT NOT NULL DEFAULT 'standard' CHECK (role IN ('admin','standard')),
    must_change_password BOOLEAN NOT NULL DEFAULT false,        -- true after create / admin reset; cleared on self change
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Sheets — a booking schedule for one depot + worker type.
--    Was "contracts". One sheet = one depot, one worker type, one client.
CREATE TABLE sheets (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,                 -- display name, e.g. "Martin Brower Hemel - HGV"
    client_company  TEXT NOT NULL,                 -- the client, e.g. Martin Brower
    depot           TEXT,                          -- location / depot
    worker_type     TEXT NOT NULL
                    CHECK (worker_type IN ('HGV','Warehouse','Both')),  -- 'Both' = sheet runs HGV and warehouse work
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Sheet contacts — multiple client emails per sheet (one primary)
CREATE TABLE sheet_contacts (
    id            SERIAL PRIMARY KEY,
    sheet_id      INTEGER NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
    contact_name  TEXT,
    email         TEXT NOT NULL,
    is_primary    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_sheet_contacts_sheet ON sheet_contacts (sheet_id);

-- 4. Workers — HGV drivers AND warehouse staff. Thin cache from Vincere
--    (name/phone/role) PLUS our own operational fields (start_date, status).
CREATE TABLE workers (
    id           SERIAL PRIMARY KEY,
    vincere_id   TEXT UNIQUE,          -- link back to the Vincere record
    full_name    TEXT NOT NULL,
    phone        TEXT,                 -- for Twilio confirmations
    job_role     TEXT,                 -- e.g. HGV 1, HGV 2, Picker
    custom_job_title TEXT,             -- free-text title, required when job_role='Other'
    worker_type  TEXT NOT NULL
                 CHECK (worker_type IN ('HGV','Warehouse')),
    start_date   DATE,                 -- joined company — feeds retention buckets
    status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','left')),
    do_not_book  BOOLEAN NOT NULL DEFAULT false, -- flagged unbookable (manual or auto after 5 no-shows)
    synced_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4b. Remembered custom job titles for the "Other" role — the suggestion list
--     offered whenever someone types a custom title. Deduped case-insensitively.
CREATE TABLE custom_job_titles (
    id          SERIAL PRIMARY KEY,
    title       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX custom_job_titles_title_lower ON custom_job_titles (lower(title));

-- 5. Worker–Sheet links — a worker can sit on multiple sheets.
--    Holds the per-sheet standing note (the old "Notes" column).
CREATE TABLE worker_sheets (
    worker_id   INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    sheet_id    INTEGER NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
    notes       TEXT,                 -- e.g. "Fully flex", "PM Trunker", "04:00-12:00"
    PRIMARY KEY (worker_id, sheet_id)
);

-- 6. Bookings — THE HEART. One row per worker per day.
--    The rest-day counter reads this table ordered by shift_date.
CREATE TABLE bookings (
    id           SERIAL PRIMARY KEY,
    worker_id    INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    sheet_id     INTEGER NOT NULL REFERENCES sheets(id) ON DELETE RESTRICT,
    shift_date   DATE NOT NULL,
    status       TEXT NOT NULL DEFAULT 'Available'
                 CHECK (status IN ('Available','Pre-Booked','Rest','Off','Holiday','Confirmed')),
    start_time   TIME,                -- 24h clock; NULL unless working
    note         TEXT,                -- free-text instruction for the cell; NULL when none
    created_by   INTEGER REFERENCES users(id),
    updated_by   INTEGER REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- One cell per worker per day = double-booking guard + clean rest-day counting
    CONSTRAINT one_booking_per_worker_per_day UNIQUE (worker_id, shift_date)
);

CREATE INDEX idx_bookings_date   ON bookings (shift_date);
CREATE INDEX idx_bookings_sheet  ON bookings (sheet_id);
CREATE INDEX idx_bookings_worker ON bookings (worker_id, shift_date);

-- 7. Shift requirements — the SECOND roster: what the client asked for,
--    entered by account managers BEFORE roles are filled. Drives fill rate.
CREATE TABLE shift_requirements (
    id               SERIAL PRIMARY KEY,
    sheet_id         INTEGER NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
    req_date         DATE NOT NULL,
    job_role         TEXT,                 -- e.g. HGV 1
    quantity_needed  INTEGER NOT NULL DEFAULT 1,
    created_by       INTEGER REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_requirements_sheet_date ON shift_requirements (sheet_id, req_date);

-- 8. Submissions — workers put forward against a requirement.
--    submitted = put forward to client; passed = accepted / cleared vetting.
CREATE TABLE submissions (
    id              SERIAL PRIMARY KEY,
    -- A submission is EITHER for an existing worker OR a brand-new candidate not
    -- yet in the worker list (candidate_name set). A candidate submission never
    -- creates a bookable worker.
    worker_id       INTEGER REFERENCES workers(id) ON DELETE CASCADE,
    candidate_name  TEXT,
    candidate_phone TEXT,
    requirement_id  INTEGER REFERENCES shift_requirements(id) ON DELETE SET NULL,
    sheet_id        INTEGER REFERENCES sheets(id) ON DELETE SET NULL,
    submitted_date  DATE NOT NULL,
    outcome         TEXT NOT NULL DEFAULT 'submitted'
                    CHECK (outcome IN ('submitted','passed','rejected')),
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Exactly one identity source: an existing worker OR a standalone candidate.
    CONSTRAINT submissions_identity CHECK (
        (worker_id IS NOT NULL AND candidate_name IS NULL)
        OR (worker_id IS NULL AND candidate_name IS NOT NULL)
    )
);

CREATE INDEX idx_submissions_date ON submissions (submitted_date);

-- 9. Leavers — feeds leaver analysis + retention-by-length-of-service
CREATE TABLE leavers (
    id          SERIAL PRIMARY KEY,
    worker_id   INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    leave_date  DATE NOT NULL,
    reason      TEXT NOT NULL
                CHECK (reason IN (
                    'low_rates','travel_distance','permanent_employment',
                    'shift_pattern','performance_issues','attendance_issues','other')),
    notes       TEXT,
    created_by  INTEGER REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Events — no-shows (both types) and CPC/test failures (HGV only).
--     Enforce "HGV only" for cpc/test failures in the app at entry time.
CREATE TABLE events (
    id          SERIAL PRIMARY KEY,
    worker_id   INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    sheet_id    INTEGER REFERENCES sheets(id) ON DELETE SET NULL,
    event_date  DATE NOT NULL,
    event_type  TEXT NOT NULL
                CHECK (event_type IN ('no_show','cpc_failure','test_failure')),
    notes       TEXT,
    created_by  INTEGER REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_date ON events (event_date);
CREATE INDEX idx_events_type ON events (event_type);

-- 11. Audit log — every booking change (old -> new), who, when
CREATE TABLE audit_log (
    id          SERIAL PRIMARY KEY,
    booking_id  INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
    user_id     INTEGER REFERENCES users(id),
    action      TEXT NOT NULL,       -- 'created','status_change','time_change','deleted'
    old_value   TEXT,
    new_value   TEXT,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_booking ON audit_log (booking_id);

-- 12. Messages — confirmations sent/received via the central company number
CREATE TABLE messages (
    id            SERIAL PRIMARY KEY,
    worker_id     INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
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

CREATE INDEX idx_messages_worker ON messages (worker_id);

-- ============================================================
-- KPI NOTES (all derived by query — no extra tables needed):
--   Active workers      = count workers WHERE status = 'active'
--   Requirements recvd  = sum(quantity_needed) from shift_requirements
--   Submitted / Passed  = count submissions by outcome
--   Fill rate %         = filled bookings / requirements over period
--   Leavers / reasons   = count leavers grouped by reason
--   Retention buckets   = (leave_date or today) - start_date, bucketed:
--                         <1wk, 1-4wk, 1-3mo, 3-6mo, 6mo+
--   No-shows / CPC/test = count events by event_type
--   All filterable by depot, worker_type, client, and date range.
-- ============================================================
