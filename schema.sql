--
-- PostgreSQL database dump
--

\restrict l9sSDrNhM2xZvI4nNqeBJoAcKGc0ASoBwODOusRqQp8aJhp1xcdutlNl9ES2eeX

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: alert_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.alert_status AS ENUM (
    'pending',
    'acknowledged',
    'resolved'
);


--
-- Name: patient_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.patient_status AS ENUM (
    'admitted',
    'discharged'
);


--
-- Name: severity_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.severity_level AS ENUM (
    'low',
    'medium',
    'high'
);


--
-- Name: staff_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.staff_role AS ENUM (
    'nurse',
    'doctor',
    'admin'
);


--
-- Name: vital_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vital_type_enum AS ENUM (
    'heart_rate',
    'bp_systolic',
    'bp_diastolic',
    'spo2',
    'temperature'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alert; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert (
    a_id integer NOT NULL,
    r_id integer NOT NULL,
    p_id integer NOT NULL,
    severity public.severity_level NOT NULL,
    status public.alert_status DEFAULT 'pending'::public.alert_status NOT NULL,
    acknowledged_by integer,
    acknowledged_at timestamp without time zone,
    resolved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: alert_a_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alert_a_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alert_a_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alert_a_id_seq OWNED BY public.alert.a_id;


--
-- Name: patient; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient (
    p_id integer NOT NULL,
    name character varying(100) NOT NULL,
    dob date NOT NULL,
    ward character varying(100) NOT NULL,
    bed character varying(20) NOT NULL,
    status public.patient_status DEFAULT 'admitted'::public.patient_status NOT NULL
);


--
-- Name: patient_p_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.patient_p_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: patient_p_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.patient_p_id_seq OWNED BY public.patient.p_id;


--
-- Name: staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff (
    s_id integer NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(100) NOT NULL,
    password character varying(256) NOT NULL,
    role public.staff_role NOT NULL,
    ward character varying(100) NOT NULL
);


--
-- Name: staff_patient_assignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_patient_assignment (
    id integer NOT NULL,
    s_id integer NOT NULL,
    p_id integer NOT NULL,
    assigned_at timestamp without time zone DEFAULT now() NOT NULL,
    unassigned_at timestamp without time zone
);


--
-- Name: staff_patient_assignment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_patient_assignment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_patient_assignment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_patient_assignment_id_seq OWNED BY public.staff_patient_assignment.id;


--
-- Name: staff_s_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_s_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_s_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_s_id_seq OWNED BY public.staff.s_id;


--
-- Name: vital_reading; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vital_reading (
    r_id integer NOT NULL,
    p_id integer NOT NULL,
    vital_type public.vital_type_enum NOT NULL,
    value numeric(5,2) NOT NULL,
    is_flagged boolean DEFAULT false NOT NULL,
    recorded_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: vital_reading_r_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vital_reading_r_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vital_reading_r_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vital_reading_r_id_seq OWNED BY public.vital_reading.r_id;


--
-- Name: alert a_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert ALTER COLUMN a_id SET DEFAULT nextval('public.alert_a_id_seq'::regclass);


--
-- Name: patient p_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient ALTER COLUMN p_id SET DEFAULT nextval('public.patient_p_id_seq'::regclass);


--
-- Name: staff s_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff ALTER COLUMN s_id SET DEFAULT nextval('public.staff_s_id_seq'::regclass);


--
-- Name: staff_patient_assignment id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_patient_assignment ALTER COLUMN id SET DEFAULT nextval('public.staff_patient_assignment_id_seq'::regclass);


--
-- Name: vital_reading r_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vital_reading ALTER COLUMN r_id SET DEFAULT nextval('public.vital_reading_r_id_seq'::regclass);


--
-- Name: alert alert_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert
    ADD CONSTRAINT alert_pkey PRIMARY KEY (a_id);


--
-- Name: patient patient_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient
    ADD CONSTRAINT patient_pkey PRIMARY KEY (p_id);


--
-- Name: staff staff_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_email_key UNIQUE (email);


--
-- Name: staff_patient_assignment staff_patient_assignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_patient_assignment
    ADD CONSTRAINT staff_patient_assignment_pkey PRIMARY KEY (id);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (s_id);


--
-- Name: vital_reading vital_reading_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vital_reading
    ADD CONSTRAINT vital_reading_pkey PRIMARY KEY (r_id);


--
-- Name: alert alert_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert
    ADD CONSTRAINT alert_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES public.staff(s_id);


--
-- Name: alert alert_p_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert
    ADD CONSTRAINT alert_p_id_fkey FOREIGN KEY (p_id) REFERENCES public.patient(p_id);


--
-- Name: alert alert_r_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert
    ADD CONSTRAINT alert_r_id_fkey FOREIGN KEY (r_id) REFERENCES public.vital_reading(r_id);


--
-- Name: staff_patient_assignment staff_patient_assignment_p_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_patient_assignment
    ADD CONSTRAINT staff_patient_assignment_p_id_fkey FOREIGN KEY (p_id) REFERENCES public.patient(p_id);


--
-- Name: staff_patient_assignment staff_patient_assignment_s_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_patient_assignment
    ADD CONSTRAINT staff_patient_assignment_s_id_fkey FOREIGN KEY (s_id) REFERENCES public.staff(s_id);


--
-- Name: vital_reading vital_reading_p_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vital_reading
    ADD CONSTRAINT vital_reading_p_id_fkey FOREIGN KEY (p_id) REFERENCES public.patient(p_id);


--
-- PostgreSQL database dump complete
--

\unrestrict l9sSDrNhM2xZvI4nNqeBJoAcKGc0ASoBwODOusRqQp8aJhp1xcdutlNl9ES2eeX

