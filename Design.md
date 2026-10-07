## StaffPatientAssignment: own PK + assigned_at/unassigned_at instead of composite key

Initially considered (s_id, p_id) as a composite primary key. Realized this
breaks when a staff member is reassigned to a patient, then later reassigned
back — the same pair would need to be inserted twice, causing either a
duplicate-key error or forcing deletion of the original row and losing
assignment history.

Fix: gave the table its own auto-increment id, with assigned_at and a
nullable unassigned_at. "Currently assigned" = unassigned_at IS NULL.
Preserves full assignment history instead of destroying it on reassignment

## Alert.p_id: denormalized instead of joining through VitalReading

Alert could get its patient via VitalReading.p_id (through r_id), avoiding
duplicate data. Chose to store p_id directly on Alert instead, because the
most frequent query in the system — "show pending alerts for my patients" —
runs on every dashboard load and would otherwise require a join through
VitalReading every single time. Tradeoff: p_id now exists in two places,
so if a reading's patient ever needed correcting, both would need updating
(unlikely to happen in this domain, so accepted the redundancy for read speed).

## Ward: kept on both Staff and Patient, not shared or derived from one another

Considered deriving a staff member's ward from whichever patients they're
assigned to. Rejected: a staff member has a ward independent of current
assignments (they could have zero patients and still belong to a ward;
or be temporarily covering a different ward than their patients suggest).
Kept both as separate current-state fields, no shared source of truth,
since they answer different questions (where staff works vs. where
patient is).

## 4. VitalReading: one row per single measurement, not one row per multi-vital reading event

Considered a wide table with a column per vital type (heart_rate, bp,
spo2, temperature all on one row). Rejected: a real measurement event
often only captures one or two vital types at a time (e.g., just heart
rate), which would leave most columns null on most rows, and makes the
core alerting logic ("did this specific reading cross a threshold")
awkward to check across many columns.

Instead, each row represents exactly one measurement: p_id, vital_type
(ENUM), value, is_flagged, recorded_at. `recorded_at` specifically
exists because the alert-dedup logic needs to know whether multiple
flagged readings for the same patient happened within the same short
window (same ongoing episode → one alert) versus on separate occasions
(separate legitimate alerts) — a question that's impossible to answer
without a timestamp on each reading.

## 5. Every table gets its own surrogate primary key (a_id, r_id, s_id, p_id, id)

Considered, at various points, using an existing foreign key column as
a table's primary key instead of adding a new one (e.g., could Alert
use r_id as its PK, assuming one reading maps to at most one alert?).
Rejected this pattern everywhere it came up: tying a table's identity
to another table's key creates a hard 1:1 coupling that may not hold as
logic evolves (e.g., dedup rules might mean a reading generates zero
alerts, or future logic could bundle multiple readings into one alert).

Every table — staff, patient, staff_patient_assignment, vital_reading,
alert — has its own independent auto-increment surrogate key, prefixed
with the table's initial (s_id, p_id, r_id, a_id) for clarity when

## 6. Foreign key delete behavior: RESTRICT (Postgres default), not CASCADE

I considered three options for what should happen if a patient row is
ever deleted while vital_reading or alert rows still reference them:
CASCADE (auto-delete the dependent rows too), SET NULL (delete the
patient, orphan the readings/alerts), or RESTRICT (block the deletion
entirely while dependent rows exist).

I chose RESTRICT. My application will never intentionally run DELETE
FROM patient — a discharge is a status update (admitted -> discharged),
not a row deletion, consistent with how I already handled staff-patient
assignment history (mark inactive, don't delete). RESTRICT enforces
this same "never destroy historical data" principle at the database
level itself, not just in my application code — so even a bug, a bad
script, or a careless manual query can't accidentally wipe out a
patient's vitals and alert history. Since RESTRICT is Postgres's
default behavior for foreign keys with no ON DELETE clause specified,
no extra syntax was needed on any of the existing REFERENCES — this
was a deliberate choice to keep the default, not an oversight.


## 7. Added 'admin' as a third staff role, alongside nurse and doctor

I initially modeled staff_role with only nurse and doctor, but realized
this meant every staff member would have identical permissions — anyone
could admit patients, assign beds, AND manage clinical vitals/alerts.
This mirrors the exact shallow "role-based auth" gap I had in an earlier
project, where role distinctions existed in name but not in actual
enforced permissions.

I added 'admin' as a distinct role: admins handle patient admission,
ward/bed assignment, and staff-patient assignment (administrative tasks),
while nurse/doctor handle vital readings and alert management (clinical
tasks). This means my authorization middleware will need to check not
just "is this user logged in" but "is this specific role allowed to
perform this specific action" — genuine role-based access control,
not just a label.

## 8. Frontend: React instead of server-rendered EJS, kept deliberately minimal

I initially considered EJS, since it's what I used in my earlier projects.
Rejected it once I worked through what this project actually needs: a
staff dashboard that receives real-time alert pushes via WebSocket,
without page reloads. EJS only renders a full HTML page once, at request
time — it has no mechanism to update an already-loaded page when new
data arrives on the server side. Real-time delivery needs a persistent
client-side app that can listen for incoming events and update the DOM
in place, which server-rendered templating doesn't provide.

Chose React over plain vanilla JS for the actual build, since I already
know React's fundamentals but haven't built anything substantial with
it — this project is a reasonable, low-stakes place to do that for real.
Deliberately scoped the frontend to stay minimal (a patient form, a live
alert feed) rather than a full multi-page app, since this project's
core value is backend/system-design depth — the frontend's job is to
prove the backend works, not to be the differentiator.

Running frontend (Vite, localhost:5173) and backend (Express,
localhost:8080) as separate processes required enabling CORS on the
backend, since browsers block cross-origin requests by default. Used
the `cors` package with open access for local development; would
restrict allowed origins explicitly in a production deployment.

## 9. getPatientById for non-admin roles: 403 vs 404 for an unassigned patient

When a nurse or doctor requests a patient they are not currently assigned
to, I considered returning 404 (Not Found) instead of 403 (Forbidden).
The general security argument for 404 is real: a 403 confirms a resource
exists even to a requester who can't access it, which can be a genuine
information leak in systems reachable by untrusted or anonymous parties
(e.g., ID enumeration revealing how many records exist).

I chose 403 instead, after weighing the actual threat model for this
system specifically. Every requester who could hit this endpoint at all
is already an authenticated staff member of the same hospital, not an
anonymous or external party — so the realistic risk is narrow (a staff
member probing IDs outside their assignment), not the broad enumeration
risk the 404 argument is designed to prevent. Given that, 403 is more
conventional REST semantics and easier to reason about, and I judged
the information-leak risk acceptable for this project's actual scope.
I would reconsider this in favor of 404 if this system were handling
real patient data under genuine regulatory scrutiny (HIPAA-style
requirements do treat this distinction seriously, even among authorized
staff) — but for this project, 403 was the deliberate, documented choice,
not an oversight.

## 10. getPatientById query ordering: JOIN-first, existence-check as fallback

For a non-admin requester, distinguishing "patient doesn't exist" (404)
from "patient exists but isn't assigned to you" (403) requires knowing
which condition actually failed — a single JOIN query filtered by both
s_id and p_id can't tell you that on its own, since an empty result could
mean either.

I considered running a plain existence check (SELECT p_id FROM patient
WHERE p_id = $1) first, then the JOIN-filtered query second. Rejected
this ordering: it means every successful request — a nurse fetching a
patient they ARE assigned to, which is the realistic common case —
pays for two queries instead of one.

Instead, I run the JOIN-filtered query first. If it returns a row, the
request succeeds in a single query — the common, successful path stays
cheap. Only if it returns nothing do I run a second, simple existence
check, purely to decide whether the correct response is 403 or 404.
This accepts a slightly more expensive failure path in exchange for a
cheaper success path, on the principle that the common case should be
optimized first, not the exception.