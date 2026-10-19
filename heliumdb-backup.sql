--
-- PostgreSQL database dump
--

\restrict O9u8nmKXdYkwDHpW9pqV39lx6xA7fChLR9CtAzandfFWSafSHXKl7Q7Dsz94SKn

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id integer NOT NULL,
    booking_id integer,
    user_id integer,
    action text NOT NULL,
    old_value text,
    new_value text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id integer NOT NULL,
    worker_id integer NOT NULL,
    sheet_id integer NOT NULL,
    shift_date date NOT NULL,
    status text DEFAULT 'Available'::text NOT NULL,
    start_time time without time zone,
    created_by integer,
    updated_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    note text,
    CONSTRAINT bookings_status CHECK ((status = ANY (ARRAY['Available'::text, 'Pre-Booked'::text, 'Rest'::text, 'Off'::text, 'Holiday'::text, 'Confirmed'::text])))
);


--
-- Name: bookings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bookings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bookings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bookings_id_seq OWNED BY public.bookings.id;


--
-- Name: custom_job_titles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_job_titles (
    id integer NOT NULL,
    title text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: custom_job_titles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.custom_job_titles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: custom_job_titles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.custom_job_titles_id_seq OWNED BY public.custom_job_titles.id;


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id integer NOT NULL,
    worker_id integer NOT NULL,
    sheet_id integer,
    event_date date NOT NULL,
    event_type text NOT NULL,
    notes text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_event_type CHECK ((event_type = 'no_show'::text))
);


--
-- Name: events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.events_id_seq OWNED BY public.events.id;


--
-- Name: leavers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leavers (
    id integer NOT NULL,
    worker_id integer NOT NULL,
    leave_date date NOT NULL,
    reason text NOT NULL,
    notes text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT leavers_reason CHECK ((reason = ANY (ARRAY['low_rates'::text, 'travel_distance'::text, 'permanent_employment'::text, 'shift_pattern'::text, 'performance_issues'::text, 'attendance_issues'::text, 'other'::text])))
);


--
-- Name: leavers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leavers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leavers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leavers_id_seq OWNED BY public.leavers.id;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id integer NOT NULL,
    worker_id integer NOT NULL,
    shift_date date,
    direction text NOT NULL,
    channel text DEFAULT 'sms'::text NOT NULL,
    body text,
    status text,
    sent_by integer,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    response_text text,
    responded_at timestamp with time zone,
    CONSTRAINT messages_channel CHECK ((channel = ANY (ARRAY['sms'::text, 'email'::text]))),
    CONSTRAINT messages_direction CHECK ((direction = ANY (ARRAY['outbound'::text, 'inbound'::text])))
);


--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: sheet_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sheet_contacts (
    id integer NOT NULL,
    sheet_id integer NOT NULL,
    contact_name text,
    email text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL
);


--
-- Name: sheet_contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sheet_contacts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sheet_contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sheet_contacts_id_seq OWNED BY public.sheet_contacts.id;


--
-- Name: sheets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sheets (
    id integer NOT NULL,
    name text NOT NULL,
    client_company text NOT NULL,
    depot text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sheets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sheets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sheets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sheets_id_seq OWNED BY public.sheets.id;


--
-- Name: shift_requirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_requirements (
    id integer NOT NULL,
    sheet_id integer NOT NULL,
    req_date date NOT NULL,
    job_role text,
    quantity_needed integer DEFAULT 1 NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shift_requirements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shift_requirements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shift_requirements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shift_requirements_id_seq OWNED BY public.shift_requirements.id;


--
-- Name: submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.submissions (
    id integer NOT NULL,
    worker_id integer,
    requirement_id integer,
    sheet_id integer,
    submitted_date date NOT NULL,
    outcome text DEFAULT 'submitted'::text NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    candidate_name text,
    candidate_phone text,
    job_role text,
    custom_job_title text,
    cpc_status text DEFAULT 'pending'::text NOT NULL,
    test_status text DEFAULT 'pending'::text NOT NULL,
    CONSTRAINT submissions_cpc_status CHECK ((cpc_status = ANY (ARRAY['pending'::text, 'passed'::text, 'failed'::text]))),
    CONSTRAINT submissions_identity CHECK ((((worker_id IS NOT NULL) AND (candidate_name IS NULL)) OR ((worker_id IS NULL) AND (candidate_name IS NOT NULL)))),
    CONSTRAINT submissions_outcome CHECK ((outcome = ANY (ARRAY['submitted'::text, 'cpc_failed'::text, 'test_failed'::text, 'passed'::text, 'rejected'::text]))),
    CONSTRAINT submissions_test_status CHECK ((test_status = ANY (ARRAY['pending'::text, 'passed'::text, 'failed'::text])))
);


--
-- Name: submissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.submissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: submissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.submissions_id_seq OWNED BY public.submissions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    password_hash text,
    role text DEFAULT 'standard'::text NOT NULL,
    must_change_password boolean DEFAULT false NOT NULL,
    CONSTRAINT users_role CHECK ((role = ANY (ARRAY['admin'::text, 'standard'::text])))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: worker_sheets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_sheets (
    worker_id integer NOT NULL,
    sheet_id integer NOT NULL,
    notes text
);


--
-- Name: workers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workers (
    id integer NOT NULL,
    vincere_id text,
    full_name text NOT NULL,
    phone text,
    job_role text,
    worker_type text NOT NULL,
    start_date date,
    status text DEFAULT 'active'::text NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL,
    do_not_book boolean DEFAULT false NOT NULL,
    custom_job_title text,
    CONSTRAINT workers_status CHECK ((status = ANY (ARRAY['active'::text, 'left'::text]))),
    CONSTRAINT workers_worker_type CHECK ((worker_type = ANY (ARRAY['HGV'::text, 'Warehouse'::text])))
);


--
-- Name: workers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workers_id_seq OWNED BY public.workers.id;


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: bookings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings ALTER COLUMN id SET DEFAULT nextval('public.bookings_id_seq'::regclass);


--
-- Name: custom_job_titles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_job_titles ALTER COLUMN id SET DEFAULT nextval('public.custom_job_titles_id_seq'::regclass);


--
-- Name: events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events ALTER COLUMN id SET DEFAULT nextval('public.events_id_seq'::regclass);


--
-- Name: leavers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leavers ALTER COLUMN id SET DEFAULT nextval('public.leavers_id_seq'::regclass);


--
-- Name: messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);


--
-- Name: sheet_contacts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_contacts ALTER COLUMN id SET DEFAULT nextval('public.sheet_contacts_id_seq'::regclass);


--
-- Name: sheets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheets ALTER COLUMN id SET DEFAULT nextval('public.sheets_id_seq'::regclass);


--
-- Name: shift_requirements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_requirements ALTER COLUMN id SET DEFAULT nextval('public.shift_requirements_id_seq'::regclass);


--
-- Name: submissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions ALTER COLUMN id SET DEFAULT nextval('public.submissions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: workers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workers ALTER COLUMN id SET DEFAULT nextval('public.workers_id_seq'::regclass);


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_log (id, booking_id, user_id, action, old_value, new_value, changed_at) FROM stdin;
1	1	\N	created	\N	Confirmed @ 06:00	2026-06-11 13:18:14.581146+00
3	3	\N	created	\N	Rest	2026-06-11 13:18:14.696566+00
5	5	\N	created	\N	Available	2026-06-11 13:18:14.802724+00
6	6	\N	created	\N	Holiday	2026-06-11 13:18:14.855605+00
7	7	\N	created	\N	Confirmed @ 14:00	2026-06-11 13:18:14.907938+00
8	8	\N	created	\N	Off	2026-06-11 13:18:14.963509+00
9	9	\N	created	\N	Confirmed @ 05:30	2026-06-11 13:18:15.017051+00
10	10	\N	created	\N	Pre-Booked @ 06:00	2026-06-11 13:18:15.070137+00
11	9	\N	time_change	05:30	06:00	2026-06-11 13:24:53.560936+00
18	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:12:42.844194+00
34	\N	\N	deleted	Lucy Owen · 2026-06-15 · Confirmed @ 06:00	\N	2026-06-11 14:13:30.209931+00
19	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:12:43.003708+00
35	\N	\N	deleted	Lucy Owen · 2026-06-16 · Confirmed @ 06:00	\N	2026-06-11 14:13:30.27235+00
20	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:12:43.089302+00
36	\N	\N	deleted	Lucy Owen · 2026-06-17 · Confirmed @ 06:00	\N	2026-06-11 14:13:30.356929+00
21	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:12:43.179977+00
37	\N	\N	deleted	Lucy Owen · 2026-06-18 · Confirmed @ 06:00	\N	2026-06-11 14:13:30.448177+00
22	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:12:43.264105+00
38	\N	\N	deleted	Lucy Owen · 2026-06-19 · Confirmed @ 06:00	\N	2026-06-11 14:13:30.50671+00
159	91	\N	created	\N	Confirmed	2026-06-12 09:41:15.45381+00
160	8	\N	status_change	Available	Confirmed	2026-06-12 09:41:15.45381+00
17	16	\N	created	\N	Holiday	2026-06-11 13:59:00.260509+00
79	46	\N	created	\N	Confirmed	2026-06-11 14:33:34.654709+00
80	47	\N	created	\N	Confirmed	2026-06-11 14:33:37.137289+00
81	48	\N	created	\N	Confirmed	2026-06-11 14:33:40.191533+00
82	49	\N	created	\N	Confirmed	2026-06-11 14:33:45.349214+00
83	50	\N	created	\N	Confirmed	2026-06-11 14:33:48.167399+00
84	51	\N	created	\N	Confirmed	2026-06-11 14:33:51.168122+00
85	52	\N	created	\N	Confirmed	2026-06-11 14:33:53.699531+00
94	61	\N	created	\N	Confirmed	2026-06-11 18:07:40.702046+00
95	62	\N	created	\N	Confirmed	2026-06-11 18:07:46.086438+00
12	\N	\N	created	\N	Off	2026-06-11 13:58:45.60613+00
75	\N	\N	status_change	Off	Confirmed	2026-06-11 14:32:53.409516+00
13	\N	\N	created	\N	Available	2026-06-11 13:58:48.497399+00
76	\N	\N	status_change	Available	Confirmed	2026-06-11 14:32:57.397391+00
14	\N	\N	created	\N	Pre-Booked	2026-06-11 13:58:51.371104+00
77	\N	\N	status_change	Pre-Booked	Confirmed	2026-06-11 14:33:00.520016+00
15	\N	\N	created	\N	Confirmed	2026-06-11 13:58:54.342541+00
16	\N	\N	created	\N	Rest	2026-06-11 13:58:57.551179+00
78	\N	\N	status_change	Rest	Confirmed	2026-06-11 14:33:08.469774+00
74	\N	\N	created	\N	Confirmed	2026-06-11 14:32:49.017861+00
96	\N	\N	deleted	Anthony Kyriacou · 2026-06-07 · Confirmed	\N	2026-06-11 20:09:18.863217+00
161	90	\N	status_change	Available	Confirmed	2026-06-12 09:41:15.45381+00
97	\N	\N	deleted	Anthony Kyriacou · 2026-06-08 · Confirmed	\N	2026-06-11 20:09:23.595363+00
162	71	\N	status_change	Available	Confirmed	2026-06-12 09:41:15.45381+00
98	\N	\N	deleted	Anthony Kyriacou · 2026-06-09 · Confirmed	\N	2026-06-11 20:09:26.830425+00
163	92	\N	created	\N	Confirmed	2026-06-17 11:48:15.652628+00
99	\N	\N	deleted	Anthony Kyriacou · 2026-06-10 · Confirmed	\N	2026-06-11 20:09:29.636904+00
164	93	\N	created	\N	Confirmed	2026-06-17 11:49:22.268431+00
100	\N	\N	deleted	Anthony Kyriacou · 2026-06-11 · Confirmed	\N	2026-06-11 20:09:33.128004+00
165	94	\N	created	\N	Confirmed	2026-06-17 11:49:50.238836+00
101	\N	\N	deleted	Anthony Kyriacou · 2026-06-12 · Confirmed	\N	2026-06-11 20:09:35.916356+00
102	66	\N	created	\N	Off	2026-06-11 20:09:41.186975+00
105	66	\N	status_change	Off	Available	2026-06-11 20:26:56.478962+00
106	66	\N	status_change	Available	Confirmed	2026-06-11 20:27:00.227652+00
107	66	\N	status_change	Confirmed	Pre-Booked	2026-06-11 20:27:04.335833+00
108	66	\N	status_change	Pre-Booked	Holiday	2026-06-11 20:27:08.584119+00
104	\N	\N	deleted	Tom Bradley · 2026-06-11 · Pre-Booked @ 07:00	\N	2026-06-11 20:22:58.12311+00
103	\N	\N	created	\N	Off	2026-06-11 20:22:20.561303+00
109	69	\N	created	\N	Rest	2026-06-11 20:29:18.23133+00
110	70	\N	created	\N	Available	2026-06-11 20:29:22.634869+00
111	71	\N	created	\N	Confirmed @ 06:00	2026-06-12 08:36:31.181912+00
112	10	\N	status_change	Pre-Booked	Confirmed	2026-06-12 08:36:31.181912+00
113	\N	\N	created	\N	Confirmed @ 06:00	2026-06-12 08:42:45.413548+00
114	\N	\N	created	\N	Confirmed @ 06:00	2026-06-12 08:42:45.413548+00
115	\N	\N	created	\N	Confirmed @ 06:00	2026-06-12 08:42:45.413548+00
116	\N	\N	created	\N	Confirmed @ 06:00	2026-06-12 08:42:45.413548+00
117	\N	\N	created	\N	Confirmed @ 06:00	2026-06-12 08:42:45.413548+00
118	\N	\N	created	\N	Confirmed @ 06:00	2026-06-12 08:42:45.413548+00
119	\N	\N	created	\N	Confirmed @ 06:00	2026-06-12 08:45:00.56811+00
120	\N	\N	created	\N	Confirmed @ 06:00	2026-06-12 08:45:00.56811+00
121	\N	\N	created	\N	Confirmed @ 06:00	2026-06-12 08:45:00.56811+00
122	\N	\N	created	\N	Confirmed @ 06:00	2026-06-12 08:45:00.56811+00
123	\N	\N	created	\N	Confirmed @ 06:00	2026-06-12 08:45:00.56811+00
124	\N	\N	created	\N	Confirmed @ 06:00	2026-06-12 08:45:00.56811+00
125	\N	\N	created	\N	Confirmed @ 06:00	2026-06-12 08:45:12.473361+00
126	46	\N	status_change	Confirmed	Available	2026-06-12 08:50:40.249043+00
127	46	\N	time_change	\N	0400	2026-06-12 08:50:40.249043+00
128	47	\N	status_change	Confirmed	Available	2026-06-12 08:50:40.249043+00
129	47	\N	time_change	\N	0400	2026-06-12 08:50:40.249043+00
130	48	\N	status_change	Confirmed	Available	2026-06-12 08:50:40.249043+00
131	48	\N	time_change	\N	0400	2026-06-12 08:50:40.249043+00
132	49	\N	status_change	Confirmed	Available	2026-06-12 08:50:40.249043+00
133	49	\N	time_change	\N	0400	2026-06-12 08:50:40.249043+00
134	50	\N	status_change	Confirmed	Available	2026-06-12 08:50:40.249043+00
135	50	\N	time_change	\N	0400	2026-06-12 08:50:40.249043+00
136	85	\N	created	\N	Available	2026-06-12 09:01:50.257109+00
137	86	\N	created	\N	Available	2026-06-12 09:01:50.257109+00
138	87	\N	created	\N	Available	2026-06-12 09:01:50.257109+00
139	88	\N	created	\N	Available	2026-06-12 09:01:50.257109+00
140	89	\N	created	\N	Available	2026-06-12 09:01:50.257109+00
141	85	\N	status_change	Available	Confirmed	2026-06-12 09:02:08.682476+00
142	85	\N	time_change	\N	06:00	2026-06-12 09:02:08.682476+00
143	86	\N	status_change	Available	Confirmed	2026-06-12 09:02:08.682476+00
144	86	\N	time_change	\N	06:00	2026-06-12 09:02:08.682476+00
145	87	\N	status_change	Available	Confirmed	2026-06-12 09:02:08.682476+00
146	87	\N	time_change	\N	06:00	2026-06-12 09:02:08.682476+00
147	88	\N	status_change	Available	Confirmed	2026-06-12 09:02:08.682476+00
148	88	\N	time_change	\N	06:00	2026-06-12 09:02:08.682476+00
149	89	\N	status_change	Available	Confirmed	2026-06-12 09:02:08.682476+00
150	89	\N	time_change	\N	06:00	2026-06-12 09:02:08.682476+00
151	8	\N	status_change	Off	Available	2026-06-12 09:05:20.571312+00
152	90	\N	created	\N	Available	2026-06-12 09:05:20.571312+00
153	71	\N	status_change	Confirmed	Available	2026-06-12 09:05:20.571312+00
154	71	\N	time_change	06:00	\N	2026-06-12 09:05:20.571312+00
155	9	\N	status_change	Confirmed	Available	2026-06-12 09:05:20.571312+00
156	9	\N	time_change	06:00	\N	2026-06-12 09:05:20.571312+00
157	10	\N	status_change	Confirmed	Available	2026-06-12 09:05:20.571312+00
158	10	\N	time_change	06:00	\N	2026-06-12 09:05:20.571312+00
23	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:12:43.431696+00
39	\N	\N	deleted	Lucy Owen · 2026-06-20 · Confirmed @ 06:00	\N	2026-06-11 14:13:30.567439+00
24	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:12:55.320931+00
40	\N	\N	deleted	Lucy Owen · 2026-06-22 · Confirmed @ 06:00	\N	2026-06-11 14:13:30.626563+00
25	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:12:55.435999+00
41	\N	\N	deleted	Lucy Owen · 2026-06-23 · Confirmed @ 06:00	\N	2026-06-11 14:13:30.687163+00
26	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:13:14.084673+00
42	\N	\N	deleted	Wendy Warehouse · 2026-06-15 · Confirmed @ 06:00	\N	2026-06-11 14:13:30.748674+00
27	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:13:14.17009+00
43	\N	\N	deleted	Wendy Warehouse · 2026-06-16 · Confirmed @ 06:00	\N	2026-06-11 14:13:30.810335+00
28	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:13:14.255118+00
44	\N	\N	deleted	Wendy Warehouse · 2026-06-17 · Confirmed @ 06:00	\N	2026-06-11 14:13:30.869759+00
29	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:13:14.338071+00
45	\N	\N	deleted	Wendy Warehouse · 2026-06-18 · Confirmed @ 06:00	\N	2026-06-11 14:13:30.929238+00
30	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:13:14.4245+00
46	\N	\N	deleted	Wendy Warehouse · 2026-06-19 · Confirmed @ 06:00	\N	2026-06-11 14:13:30.987296+00
31	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:13:14.505576+00
47	\N	\N	deleted	Wendy Warehouse · 2026-06-20 · Confirmed @ 06:00	\N	2026-06-11 14:13:31.04786+00
32	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:13:14.588792+00
48	\N	\N	deleted	Wendy Warehouse · 2026-06-21 · Confirmed @ 06:00	\N	2026-06-11 14:13:31.108602+00
33	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:13:14.673867+00
49	\N	\N	deleted	Wendy Warehouse · 2026-06-22 · Confirmed @ 06:00	\N	2026-06-11 14:13:31.166708+00
50	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:18:25.149584+00
56	\N	\N	deleted	Import Test HGV · 2026-07-01 · Confirmed @ 06:00	\N	2026-06-11 14:18:40.882196+00
51	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:18:25.243865+00
57	\N	\N	deleted	Import Test HGV · 2026-07-02 · Confirmed @ 06:00	\N	2026-06-11 14:18:40.94128+00
52	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:18:25.263029+00
58	\N	\N	deleted	Import Test HGV · 2026-07-03 · Confirmed @ 06:00	\N	2026-06-11 14:18:40.99739+00
53	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:18:25.272862+00
59	\N	\N	deleted	Import Test HGV · 2026-07-04 · Confirmed @ 06:00	\N	2026-06-11 14:18:41.056573+00
54	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:18:25.281599+00
60	\N	\N	deleted	Import Test HGV · 2026-07-05 · Confirmed @ 06:00	\N	2026-06-11 14:18:41.111388+00
55	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 14:18:25.289701+00
61	\N	\N	deleted	Import Test HGV · 2026-07-06 · Confirmed @ 06:00	\N	2026-06-11 14:18:41.167887+00
62	\N	\N	created	\N	Confirmed	2026-06-11 14:18:41.231136+00
68	\N	\N	deleted	Tom Bradley · 2026-07-01 · Confirmed	\N	2026-06-11 14:18:41.975846+00
63	\N	\N	created	\N	Confirmed	2026-06-11 14:18:41.314244+00
69	\N	\N	deleted	Tom Bradley · 2026-07-02 · Confirmed	\N	2026-06-11 14:18:42.032676+00
64	\N	\N	created	\N	Confirmed	2026-06-11 14:18:41.397738+00
70	\N	\N	deleted	Tom Bradley · 2026-07-03 · Confirmed	\N	2026-06-11 14:18:42.086917+00
65	\N	\N	created	\N	Confirmed	2026-06-11 14:18:41.481224+00
71	\N	\N	deleted	Tom Bradley · 2026-07-04 · Confirmed	\N	2026-06-11 14:18:42.142628+00
66	\N	\N	created	\N	Confirmed	2026-06-11 14:18:41.569217+00
72	\N	\N	deleted	Tom Bradley · 2026-07-05 · Confirmed	\N	2026-06-11 14:18:42.197174+00
67	\N	\N	created	\N	Confirmed	2026-06-11 14:18:41.736039+00
73	\N	\N	deleted	Tom Bradley · 2026-07-06 · Confirmed	\N	2026-06-11 14:18:42.250933+00
86	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 17:51:49.633492+00
2	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 13:18:14.642237+00
87	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 17:56:05.569592+00
88	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 17:56:05.653501+00
89	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 17:57:29.147684+00
90	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 17:57:29.167632+00
91	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 17:57:49.965243+00
92	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 17:57:50.08341+00
93	\N	\N	created	\N	Confirmed @ 06:00	2026-06-11 17:57:50.192381+00
4	\N	\N	created	\N	Pre-Booked @ 07:00	2026-06-11 13:18:14.750234+00
\.


--
-- Data for Name: bookings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bookings (id, worker_id, sheet_id, shift_date, status, start_time, created_by, updated_by, created_at, updated_at, note) FROM stdin;
9	3	1	2026-06-11	Available	\N	\N	\N	2026-06-11 13:18:15.017051+00	2026-06-12 09:05:20.59+00	\N
10	3	1	2026-06-12	Available	\N	\N	\N	2026-06-11 13:18:15.070137+00	2026-06-12 09:05:20.594+00	\N
8	3	1	2026-06-08	Confirmed	\N	\N	\N	2026-06-11 13:18:14.963509+00	2026-06-12 09:41:15.471+00	\N
1	1	1	2026-06-08	Confirmed	06:00:00	\N	\N	2026-06-11 13:18:14.581146+00	2026-06-11 13:18:14.581146+00	\N
3	1	1	2026-06-10	Rest	\N	\N	\N	2026-06-11 13:18:14.696566+00	2026-06-11 13:18:14.696566+00	\N
5	2	1	2026-06-08	Available	\N	\N	\N	2026-06-11 13:18:14.802724+00	2026-06-11 13:18:14.802724+00	\N
6	2	1	2026-06-09	Holiday	\N	\N	\N	2026-06-11 13:18:14.855605+00	2026-06-11 13:18:14.855605+00	\N
7	2	1	2026-06-10	Confirmed	14:00:00	\N	\N	2026-06-11 13:18:14.907938+00	2026-06-11 13:18:14.907938+00	\N
68	1	1	2026-06-11	Pre-Booked	07:00:00	\N	\N	2026-06-11 20:23:27.617838+00	2026-06-11 20:23:27.617838+00	\N
92	4	1	2026-06-14	Confirmed	\N	\N	\N	2026-06-17 11:48:15.652628+00	2026-06-17 11:48:15.652628+00	Bring hi-vis vest
93	4	1	2026-06-16	Confirmed	\N	\N	\N	2026-06-17 11:49:22.268431+00	2026-06-17 11:49:22.268431+00	Early start - gate code 1234
94	4	1	2026-06-18	Confirmed	\N	\N	\N	2026-06-17 11:49:50.238836+00	2026-06-17 11:49:50.238836+00	\N
51	7	2	2026-06-12	Confirmed	\N	\N	\N	2026-06-11 14:33:51.168122+00	2026-06-11 14:33:51.168122+00	\N
52	7	2	2026-06-13	Confirmed	\N	\N	\N	2026-06-11 14:33:53.699531+00	2026-06-11 14:33:53.699531+00	\N
61	6	1	2026-05-17	Confirmed	\N	\N	\N	2026-06-11 18:07:40.702046+00	2026-06-11 18:07:40.702046+00	\N
62	4	1	2026-05-17	Confirmed	\N	\N	\N	2026-06-11 18:07:46.086438+00	2026-06-11 18:07:46.086438+00	\N
66	4	1	2026-06-07	Holiday	\N	\N	\N	2026-06-11 20:09:41.186975+00	2026-06-11 20:27:08.585+00	\N
69	4	1	2026-06-08	Rest	\N	\N	\N	2026-06-11 20:29:18.23133+00	2026-06-11 20:29:18.23133+00	\N
70	4	1	2026-06-09	Available	\N	\N	\N	2026-06-11 20:29:22.634869+00	2026-06-11 20:29:22.634869+00	\N
46	7	2	2026-06-07	Available	04:00:00	\N	\N	2026-06-11 14:33:34.654709+00	2026-06-12 08:50:40.25+00	\N
47	7	2	2026-06-08	Available	04:00:00	\N	\N	2026-06-11 14:33:37.137289+00	2026-06-12 08:50:40.258+00	\N
48	7	2	2026-06-09	Available	04:00:00	\N	\N	2026-06-11 14:33:40.191533+00	2026-06-12 08:50:40.264+00	\N
49	7	2	2026-06-10	Available	04:00:00	\N	\N	2026-06-11 14:33:45.349214+00	2026-06-12 08:50:40.268+00	\N
50	7	2	2026-06-11	Available	04:00:00	\N	\N	2026-06-11 14:33:48.167399+00	2026-06-12 08:50:40.272+00	\N
85	6	1	2026-06-08	Confirmed	06:00:00	\N	\N	2026-06-12 09:01:50.257109+00	2026-06-12 09:02:08.688+00	\N
86	6	1	2026-06-09	Confirmed	06:00:00	\N	\N	2026-06-12 09:01:50.257109+00	2026-06-12 09:02:08.697+00	\N
87	6	1	2026-06-10	Confirmed	06:00:00	\N	\N	2026-06-12 09:01:50.257109+00	2026-06-12 09:02:08.703+00	\N
88	6	1	2026-06-11	Confirmed	06:00:00	\N	\N	2026-06-12 09:01:50.257109+00	2026-06-12 09:02:08.711+00	\N
89	6	1	2026-06-12	Confirmed	06:00:00	\N	\N	2026-06-12 09:01:50.257109+00	2026-06-12 09:02:08.715+00	\N
63	1	1	2026-06-15	Confirmed	06:00:00	\N	\N	2026-06-11 19:51:20.545408+00	2026-06-11 19:51:20.545408+00	\N
64	2	1	2026-06-16	Confirmed	06:00:00	\N	\N	2026-06-11 19:51:20.545408+00	2026-06-11 19:51:20.545408+00	\N
65	3	1	2026-06-16	Pre-Booked	\N	\N	\N	2026-06-11 19:51:20.545408+00	2026-06-11 19:51:20.545408+00	\N
91	3	1	2026-06-07	Confirmed	\N	\N	\N	2026-06-12 09:41:15.45381+00	2026-06-12 09:41:15.45381+00	\N
90	3	1	2026-06-09	Confirmed	\N	\N	\N	2026-06-12 09:05:20.571312+00	2026-06-12 09:41:15.474+00	\N
71	3	1	2026-06-10	Confirmed	\N	\N	\N	2026-06-12 08:36:31.181912+00	2026-06-12 09:41:15.477+00	\N
16	4	1	2026-06-13	Holiday	\N	\N	\N	2026-06-11 13:59:00.260509+00	2026-06-24 14:09:59.382+00	\N
\.


--
-- Data for Name: custom_job_titles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.custom_job_titles (id, title, created_at) FROM stdin;
\.


--
-- Data for Name: events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.events (id, worker_id, sheet_id, event_date, event_type, notes, created_by, created_at) FROM stdin;
4	4	1	2026-06-11	no_show	\N	\N	2026-06-11 14:53:17.942107+00
10	6	1	2026-06-07	no_show	\N	\N	2026-06-11 17:31:37.149067+00
11	6	1	2026-06-07	no_show	\N	\N	2026-06-11 17:31:41.673747+00
12	2	1	2026-06-07	no_show	\N	\N	2026-06-11 17:31:53.381695+00
13	2	1	2026-06-08	no_show	\N	\N	2026-06-11 17:32:00.754216+00
17	4	1	2026-06-10	no_show	\N	\N	2026-06-11 17:32:24.484205+00
1	1	1	2026-06-10	no_show	Missed 06:00 start	\N	2026-06-11 14:50:17.984805+00
18	1	1	2026-06-10	no_show	\N	\N	2026-06-11 17:37:01.330147+00
\.


--
-- Data for Name: leavers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.leavers (id, worker_id, leave_date, reason, notes, created_by, created_at) FROM stdin;
6	13	2026-06-09	low_rates	\N	\N	2026-06-11 20:50:07.639373+00
7	14	2026-06-10	travel_distance	\N	\N	2026-06-11 20:50:07.639373+00
8	15	2026-06-11	permanent_employment	\N	\N	2026-06-11 20:50:07.639373+00
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.messages (id, worker_id, shift_date, direction, channel, body, status, sent_by, sent_at, response_text, responded_at) FROM stdin;
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.session (sid, sess, expire) FROM stdin;
_PDzM8ytjGXGo2K4CHVB8xUU4kDObi1y	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-08-21T11:53:53.019Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":48}	2026-08-21 11:54:47
pUCg1183xwUhUXOEXZe4BQ-weSiCX3f7	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-08-21T12:31:45.916Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":49}	2026-08-21 12:31:52
DJ-PE8sBB1i2nmVGtaUlgNziukxHq8P2	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-08-01T09:30:44.735Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":33}	2026-08-01 09:30:45
HftoRRluvC9WiGrB8vBlwMX480xHLJQ0	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-08-01T09:29:55.302Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":33}	2026-08-01 09:29:56
hUiwrVULqufoEItrfKUw4JXAvBBrxWth	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-08-01T09:48:31.985Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":34}	2026-08-01 09:48:33
el2HD_i0ZHc5Nktls517ndxJQslT8HmW	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-08-01T11:34:39.466Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":35}	2026-08-01 11:34:58
cD80m6mPNdr_NuYfYiva2m9eVDe0ikyV	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-08-01T11:46:21.896Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":36}	2026-08-01 11:46:23
H1hPdvGMOXR3KOHrjwOH5c-woABWgKyx	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-08-01T11:46:58.242Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":37}	2026-08-01 11:46:59
8WRSsSHKjoXIVZOnfz-uyKlBwlxf-t9X	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-07-24T14:04:50.845Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":27}	2026-07-24 14:04:52
1zwJ9H211khwlBiNde3t1nay2BqPu1p1	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-07-24T13:57:37.509Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":26}	2026-07-24 13:57:59
1oqbHZtsnsfSpDCyJv2wKw1H_M6AKCGh	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-07-24T14:09:40.653Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":28}	2026-07-24 14:10:00
Ks5HJs49_afMBjz7NCiWxTJgXfiUx46z	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-07-24T14:13:55.038Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":28}	2026-07-24 14:13:56
qEru3HqC0vxVOoWB2aP862YORNkioPhb	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-07-24T14:16:08.432Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":28}	2026-07-24 14:16:09
3YsgaP5A3b5NA483y5bHNwSXEfU7cQnT	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-07-17T21:13:00.101Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":6}	2026-08-05 13:09:35
RskjnzSOFXaFhxkquwsNmfPkYDK9YtmX	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-07-31T11:22:41.402Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":29}	2026-07-31 11:23:32
trKP-jZBxKpctYPZg2CSyHYrsMqqKkCd	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-07-31T11:46:30.526Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":30}	2026-07-31 11:46:59
zYMSpM3ZyRUXoRSHqFejTMrBgGvxuRLV	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-07-31T11:46:30.580Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":31}	2026-07-31 11:46:50
u5_wVlvVGMn9m4_IANQpiH9LMzvpL2h6	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-07-31T14:29:34.836Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":32}	2026-07-31 14:29:40
u_iS7wDzd07Zx3pdn-Y5PHSePJyFb1mu	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-08-01T11:49:24.295Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":38}	2026-08-01 11:49:25
-8M7Pojwang0ai2h7KV76hdAyYorzICs	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-08-05T11:51:20.153Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":43}	2026-08-05 11:51:21
tJSsQ2BJIA5ONdf0lDK6dvcE1Jj0D2q_	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-08-21T12:40:59.579Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":50}	2026-08-21 12:42:01
RkfffABmFR8_1wAw51IfqSwM-djdd88Q	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-08-01T14:20:09.549Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":41}	2026-08-01 14:20:10
zEIL7JHBBw5IBnVu6-Lb7IxEZeeiSJxI	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-08-21T10:58:23.915Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":45}	2026-08-21 10:59:06
Y7qnFH2ugdPzQAsv88ZjxX4X-sOjJGro	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-08-01T14:11:25.696Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":39}	2026-08-01 14:11:27
0v9eyFvw3crimiVLo7T_1-ddsTrOsMAm	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-08-01T14:12:20.971Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":40}	2026-08-01 14:12:22
sBWd7xgTlWZ0ZIDE7-CdIAug6mFe7eBB	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-08-21T11:12:44.548Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":46}	2026-08-21 11:13:13
vm4tqMpIBtVEKSZC1Txpg3CA4yVRm08T	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-08-21T10:56:44.881Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":45}	2026-08-21 11:03:05
TT0PkqSrpBNubsUA5bK3IYYDDTDECo2r	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-08-01T15:11:16.530Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":42}	2026-08-01 15:11:17
slpLW6UjLZys6isRqGyxW3IH2BgeFp2r	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-08-21T11:14:55.876Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":47}	2026-08-21 11:14:57
4DJxnxfJFn3VQtKv3yX6n_MTDH6fni-b	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-08-21T11:03:45.158Z","httpOnly":true,"path":"/","sameSite":"lax"},"userId":45}	2026-08-21 11:05:01
\.


--
-- Data for Name: sheet_contacts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sheet_contacts (id, sheet_id, contact_name, email, is_primary) FROM stdin;
1	1	Dawn Carter	dawn@acme.co.uk	t
2	1	Ops Desk	ops@acme.co.uk	f
3	1	Kyriacou	anthony@intrepidgbl.com	f
4	1	Anthony Kyriacou	anthony.kyriacou89@gmail.com	f
\.


--
-- Data for Name: sheets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sheets (id, name, client_company, depot, created_at) FROM stdin;
1	Mon-Fri Days	Acme Logistics	Daventry	2026-06-11 13:17:51.393766+00
2	Nights	Globex Freight	Crick	2026-06-11 13:29:16.056016+00
3	Nights	Globex-h1072	Crick	2026-06-11 13:31:02.205157+00
\.


--
-- Data for Name: shift_requirements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shift_requirements (id, sheet_id, req_date, job_role, quantity_needed, created_by, created_at) FROM stdin;
3	1	2026-06-18	\N	0	\N	2026-06-11 20:03:27.067204+00
4	1	2026-06-19	\N	0	\N	2026-06-11 20:04:39.673455+00
6	1	2026-06-07	\N	5	\N	2026-06-11 20:08:55.65516+00
7	1	2026-06-08	\N	3	\N	2026-06-11 20:08:58.476441+00
8	1	2026-06-09	\N	4	\N	2026-06-11 20:08:59.66222+00
9	1	2026-06-10	\N	2	\N	2026-06-11 20:09:01.375623+00
10	1	2026-06-11	\N	1	\N	2026-06-11 20:09:02.279298+00
11	1	2026-06-12	\N	1	\N	2026-06-11 20:09:03.294193+00
1	1	2026-06-15	HGV Class 1 Driver	3	\N	2026-06-11 18:25:45.742102+00
2	1	2026-06-16	HGV Class 2 Driver	2	\N	2026-06-11 18:25:45.742102+00
\.


--
-- Data for Name: submissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.submissions (id, worker_id, requirement_id, sheet_id, submitted_date, outcome, created_by, created_at, candidate_name, candidate_phone, job_role, custom_job_title, cpc_status, test_status) FROM stdin;
6	4	\N	\N	2026-06-11	passed	\N	2026-06-11 18:38:56.704508+00	\N	\N	\N	\N	passed	passed
7	3	1	1	2026-06-11	passed	\N	2026-06-11 18:41:34.601555+00	\N	\N	\N	\N	passed	passed
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, name, email, created_at, password_hash, role, must_change_password) FROM stdin;
7	Nicholas K	nicholas@intrepidgbl.com	2026-06-17 20:25:37.773336+00	scrypt$3dac8d40be40a09b4dc777fd48c92809$fcbd88a8c14f1f9c12b8198a45fbd0cfb2c9952d5dd5b385e7257fa9058b6caa6901efff0d193452229b8b0006b06ef3ed4e79d7adf41b28fb73467007bc0850	standard	t
8	Andreas P	andreas@intrepidgbl.com	2026-06-17 20:25:42.573412+00	scrypt$c157a216bc5f327ac5682f39abc3b713$20164c9bf7617ab888e6a9c58c167d45fd0fc279cbcb32f43d449416c6bf596100e1c90909099b755fcbda3c2d9340224181fe710811eeaa017a8d0e88c513e1	standard	t
9	Jude G	jude.gregory@intrepidgbl.com	2026-06-17 20:25:47.171642+00	scrypt$3215f5513d2f91b485775998c2f44681$a1cf4a476f1ef054c4000ecdd536e302ed223e3aee1fada40acddea33a6c665c1f80ba1d2b9137350e3847d28e84148a01c4bc73ad9124346841d4f603898f3a	standard	t
10	Isla M	isla@intrepidgbl.com	2026-06-17 20:25:51.634036+00	scrypt$d20a4a8f92aa4acba56508a83fc3b907$b44cd728596cb9d4493b1b94ed58150ec4a9cbb43a604a50eee41ab8b2574a93a23314406355092e371a103badec9e2fc9cda5a56768d0bc30ebebe78fcf877e	standard	t
11	Perla K	perla@intrepidgbl.com	2026-06-17 20:25:56.907562+00	scrypt$bfba5e838c588491554432e16e4916a3$0a88da3c97440017f903b06af2ab7c2edb54494fd60bede016674871d7f0d4aab7c71fe1a44931b7112c9e58ad6a0f2f925d3a9138687e10b8b9f28791ed7e03	standard	t
12	Nick C	nick.c@intrepidgbl.com	2026-06-17 20:26:01.144434+00	scrypt$0e2193ddc4ef5290aa6a723d480d21a5$5f47c4f1d641ca404ade19d40c8934e0a25841deb1f748cc08070e2ff2184472a0d63b201127561ddda26969fe8be0a2cfcc257f07c12877f0cc3be8b8e542c2	standard	t
13	Reemiah L	rem@intrepidgbl.com	2026-06-17 20:26:05.529877+00	scrypt$8c7fc41242f177822502af6d7d178f35$82056ad7a257b18b9af9fe65f176ddc932c4b7e1746a45812731a1bcff463ea0ca472984f4c864c8807411ab71816df35179854ae405937168f44f4245909971	standard	t
6	Anthony K	anthony@intrepidgbl.com	2026-06-17 20:25:32.536139+00	scrypt$db387224f12e3e76be529e8d6f2d9305$d428042d082479553b2c72b45cd1c57552a159ddb5cf7ed4908f1c2c09c7c3b7f4653acba1080d5f9f53ad1d865d93973c1effff3f76bbe07ade91d2721e7ed3	admin	t
\.


--
-- Data for Name: worker_sheets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.worker_sheets (worker_id, sheet_id, notes) FROM stdin;
2	1	ADR licensed.
3	1	
6	1	\N
7	2	\N
13	1	\N
14	1	\N
15	2	\N
1	1	\N
4	1	Nights only
\.


--
-- Data for Name: workers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.workers (id, vincere_id, full_name, phone, job_role, worker_type, start_date, status, synced_at, do_not_book, custom_job_title) FROM stdin;
7	\N	Anthony Kyriacou	07545 010758	Warehouse	Warehouse	2026-06-07	active	2026-06-11 14:33:30.858257+00	f	\N
6	\N	Import Test Hgv	\N	HGV 1	HGV	2026-05-17	active	2026-06-11 14:18:25.149584+00	f	\N
3	\N	Lucy Owen	07700 900003	HGV 1	HGV	2026-06-07	active	2026-06-11 13:18:03.729608+00	f	\N
4	\N	Anthony Kyriacou	07700 111222	HGV 2	HGV	2026-05-17	active	2026-06-11 13:58:39.251294+00	f	\N
13	\N	Greg Departed	\N	HGV 1	HGV	2026-03-01	left	2026-06-11 20:49:59.136497+00	f	\N
14	\N	Hannah Gone	\N	HGV 1	HGV	2026-05-20	left	2026-06-11 20:49:59.136497+00	f	\N
5	\N	Wendy Warehouse	\N	Warehouse	Warehouse	\N	active	2026-06-11 14:12:55.166716+00	f	\N
15	\N	Will Left	\N	Warehouse	Warehouse	2026-01-05	left	2026-06-11 20:49:59.136497+00	f	\N
1	\N	Tom Bradley	07700 900001	HGV 1	HGV	2026-06-08	active	2026-06-11 13:18:03.625571+00	f	\N
2	\N	Raj Singh	07700 900002	HGV 2	HGV	2026-06-08	active	2026-06-11 13:18:03.677267+00	f	\N
\.


--
-- Name: audit_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.audit_log_id_seq', 206, true);


--
-- Name: bookings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.bookings_id_seq', 140, true);


--
-- Name: custom_job_titles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.custom_job_titles_id_seq', 10, true);


--
-- Name: events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.events_id_seq', 30, true);


--
-- Name: leavers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.leavers_id_seq', 10, true);


--
-- Name: messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.messages_id_seq', 1, false);


--
-- Name: sheet_contacts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sheet_contacts_id_seq', 6, true);


--
-- Name: sheets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sheets_id_seq', 19, true);


--
-- Name: shift_requirements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.shift_requirements_id_seq', 12, true);


--
-- Name: submissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.submissions_id_seq', 18, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 50, true);


--
-- Name: workers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.workers_id_seq', 67, true);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: custom_job_titles custom_job_titles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_job_titles
    ADD CONSTRAINT custom_job_titles_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: leavers leavers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leavers
    ADD CONSTRAINT leavers_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: bookings one_booking_per_worker_per_day; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT one_booking_per_worker_per_day UNIQUE (worker_id, shift_date);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: sheet_contacts sheet_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_contacts
    ADD CONSTRAINT sheet_contacts_pkey PRIMARY KEY (id);


--
-- Name: sheets sheets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheets
    ADD CONSTRAINT sheets_pkey PRIMARY KEY (id);


--
-- Name: shift_requirements shift_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_requirements
    ADD CONSTRAINT shift_requirements_pkey PRIMARY KEY (id);


--
-- Name: submissions submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: worker_sheets worker_sheets_worker_id_sheet_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_sheets
    ADD CONSTRAINT worker_sheets_worker_id_sheet_id_pk PRIMARY KEY (worker_id, sheet_id);


--
-- Name: workers workers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workers
    ADD CONSTRAINT workers_pkey PRIMARY KEY (id);


--
-- Name: workers workers_vincere_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workers
    ADD CONSTRAINT workers_vincere_id_unique UNIQUE (vincere_id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- Name: custom_job_titles_title_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX custom_job_titles_title_lower ON public.custom_job_titles USING btree (lower(title));


--
-- Name: idx_audit_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_booking ON public.audit_log USING btree (booking_id);


--
-- Name: idx_bookings_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_date ON public.bookings USING btree (shift_date);


--
-- Name: idx_bookings_sheet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_sheet ON public.bookings USING btree (sheet_id);


--
-- Name: idx_bookings_worker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_worker ON public.bookings USING btree (worker_id, shift_date);


--
-- Name: idx_events_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_date ON public.events USING btree (event_date);


--
-- Name: idx_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_type ON public.events USING btree (event_type);


--
-- Name: idx_messages_worker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_worker ON public.messages USING btree (worker_id);


--
-- Name: idx_requirements_sheet_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_requirements_sheet_date ON public.shift_requirements USING btree (sheet_id, req_date);


--
-- Name: idx_sheet_contacts_sheet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sheet_contacts_sheet ON public.sheet_contacts USING btree (sheet_id);


--
-- Name: idx_submissions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_submissions_date ON public.submissions USING btree (submitted_date);


--
-- Name: audit_log audit_log_booking_id_bookings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_booking_id_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: bookings bookings_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: bookings bookings_sheet_id_sheets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_sheet_id_sheets_id_fk FOREIGN KEY (sheet_id) REFERENCES public.sheets(id) ON DELETE RESTRICT;


--
-- Name: bookings bookings_updated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: bookings bookings_worker_id_workers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_worker_id_workers_id_fk FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: events events_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: events events_sheet_id_sheets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_sheet_id_sheets_id_fk FOREIGN KEY (sheet_id) REFERENCES public.sheets(id) ON DELETE SET NULL;


--
-- Name: events events_worker_id_workers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_worker_id_workers_id_fk FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: leavers leavers_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leavers
    ADD CONSTRAINT leavers_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: leavers leavers_worker_id_workers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leavers
    ADD CONSTRAINT leavers_worker_id_workers_id_fk FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: messages messages_sent_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sent_by_users_id_fk FOREIGN KEY (sent_by) REFERENCES public.users(id);


--
-- Name: messages messages_worker_id_workers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_worker_id_workers_id_fk FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: sheet_contacts sheet_contacts_sheet_id_sheets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_contacts
    ADD CONSTRAINT sheet_contacts_sheet_id_sheets_id_fk FOREIGN KEY (sheet_id) REFERENCES public.sheets(id) ON DELETE CASCADE;


--
-- Name: shift_requirements shift_requirements_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_requirements
    ADD CONSTRAINT shift_requirements_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: shift_requirements shift_requirements_sheet_id_sheets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_requirements
    ADD CONSTRAINT shift_requirements_sheet_id_sheets_id_fk FOREIGN KEY (sheet_id) REFERENCES public.sheets(id) ON DELETE CASCADE;


--
-- Name: submissions submissions_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: submissions submissions_requirement_id_shift_requirements_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_requirement_id_shift_requirements_id_fk FOREIGN KEY (requirement_id) REFERENCES public.shift_requirements(id) ON DELETE SET NULL;


--
-- Name: submissions submissions_sheet_id_sheets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_sheet_id_sheets_id_fk FOREIGN KEY (sheet_id) REFERENCES public.sheets(id) ON DELETE SET NULL;


--
-- Name: submissions submissions_worker_id_workers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_worker_id_workers_id_fk FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: worker_sheets worker_sheets_sheet_id_sheets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_sheets
    ADD CONSTRAINT worker_sheets_sheet_id_sheets_id_fk FOREIGN KEY (sheet_id) REFERENCES public.sheets(id) ON DELETE CASCADE;


--
-- Name: worker_sheets worker_sheets_worker_id_workers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_sheets
    ADD CONSTRAINT worker_sheets_worker_id_workers_id_fk FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict O9u8nmKXdYkwDHpW9pqV39lx6xA7fChLR9CtAzandfFWSafSHXKl7Q7Dsz94SKn

