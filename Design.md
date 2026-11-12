# Patient Monitor --- Design Decisions and Implementation Notes

## 1. StaffPatientAssignment: surrogate primary key and assignment history

Initially considered `(s_id, p_id)` as a composite primary key. This
breaks when a staff member is unassigned from a patient and later
reassigned: the same pair would need to be inserted again, causing a
duplicate-key error or requiring deletion of the original row and loss
of history.

**Decision:** give the table its own auto-increment `id`, with
`assigned_at` and nullable `unassigned_at`. A current assignment is
represented by `unassigned_at IS NULL`. This preserves assignment
history instead of destroying it on reassignment.

## 2. Alert.p_id: denormalized for dashboard queries

An alert could obtain its patient through `VitalReading.p_id` via
`r_id`, avoiding duplicate data. We chose to store `p_id` directly on
`Alert` because a frequent query---showing open alerts for a staff
member's assigned patients---would otherwise require a join through
`VitalReading`.

**Trade-off:** `p_id` exists in two places. If a reading's patient ever
needed correction, both records would need to be updated. This
redundancy is accepted for simpler alert retrieval.

## 3. Ward: separate fields on Staff and Patient

A staff member's ward is independent of current patient assignments: a
staff member can have no patients and still belong to a ward, or
temporarily cover another ward. Therefore, `ward` is stored
independently on `Staff` and `Patient`; neither is derived from the
other.

## 4. VitalReading: one row per measurement

A wide table with a column per vital type would leave many null columns
when a measurement event captures only one or two vital types and would
make threshold checks awkward.

**Decision:** each `vital_reading` row represents one measurement:
`p_id`, `vital_type`, `value`, `is_flagged`, and `recorded_at`. The
timestamp supports history ordering and cursor pagination, and helps
distinguish readings recorded at different times.

## 5. Independent surrogate primary keys

Each table---`staff`, `patient`, `staff_patient_assignment`,
`vital_reading`, and `alert`---has its own auto-increment primary key
(`s_id`, `p_id`, `id`, `r_id`, and `a_id` respectively). Using another
table's foreign key as a primary key would couple identities too
tightly: a reading may produce no alert, and alert-deduplication rules
may evolve.

## 6. Foreign-key delete behavior: preserve history

Foreign keys use PostgreSQL's default restrictive behavior rather than
`ON DELETE CASCADE`. A patient discharge is represented by a status
update (`admitted` to `discharged`), not by deleting the patient and its
clinical history. This protects historical readings and alerts from
accidental deletion.

The benchmark seed script has a deliberate reset mode for local test
data only; it is not application deletion behavior and must not be used
against a database whose data needs preserving.

## 7. Role-based access control

The `staff_role` enum includes `nurse`, `doctor`, and `admin`. - Admins
handle administrative actions such as patient creation/updates and
staff-patient assignment. - Nurses and doctors handle clinical actions
such as submitting vital readings and managing alerts. - Authentication
alone is not sufficient; routes enforce the role permitted for each
action.

Alert routes are restricted to authenticated nurses and doctors. Patient
assignment checks ensure staff can access only patients currently
assigned to them where required.

## 8. Frontend: minimal React application

The frontend uses React/Vite on `localhost:5173`, while the Express API
runs separately on `localhost:8080`. CORS is configured to allow the
local frontend origin with credentials for session-based authentication.
The frontend is deliberately minimal: the backend and system-design work
are the project's primary focus.

The longer-term frontend plan includes a live alert feed; WebSocket
delivery is a later roadmap phase, not yet implemented.

## 9. Patient access: 403 versus 404

For an authenticated nurse or doctor requesting a patient they are not
assigned to, the API returns `403 Forbidden`; if the patient does not
exist, it returns `404 Not Found`. This is an explicit project decision
based on the current authenticated-staff threat model. A stricter
production environment may choose to avoid revealing whether an
inaccessible patient exists.

## 10. Patient lookup query ordering

For assignment-scoped patient lookup, the common successful path should
avoid unnecessary queries. The assignment-filtered lookup is attempted
first; if it returns no row, a second existence check distinguishes a
missing patient (`404`) from an existing but unassigned patient (`403`).
This makes the less common failure path slightly more expensive in
exchange for a cheaper successful path.

## 11. Alert deduplication and severity escalation

Repeated abnormal readings should not flood the dashboard, but a
worsening condition must still be surfaced. The severity order is
`low < medium < high`.

When a reading is evaluated, compare its severity with existing open
alerts for the same patient and vital type. Create a new alert only when
the new severity is higher than the highest relevant open severity.
Repeated readings at the same or lower severity do not create another
alert. The open statuses are `pending` and `acknowledged`; `resolved`
and `retracted` alerts do not suppress new alerts.

The comparison is performed in the vital-submission transaction. The
patient row is selected `FOR UPDATE` before the batch is inserted and
evaluated, serializing submissions for the same patient so concurrent
requests do not race through the alert-deduplication decision. Readings
and resulting alerts are committed atomically.

## 12. Batch vital submission: transaction and row locking

`POST /patients/:id/vitals` accepts a batch of readings. It checks the
staff member's active assignment, locks the patient row with
`SELECT ... FOR UPDATE`, inserts the batch, evaluates each reading,
flags abnormal readings, and creates only warranted severity-escalation
alerts.

These operations run in a PostgreSQL transaction. If a step fails, the
transaction is rolled back; if all steps succeed, readings and alerts
are committed together. This prevents a reading from being persisted
without its corresponding alert decision, or vice versa.

## 13. Alert lifecycle: pending, acknowledged, resolved, and retracted

Alert acknowledgement and resolution are separate workflow steps.
Acknowledging an alert records who acknowledged it and when. Resolution
records the resolution time. An alert can be resolved while pending or
acknowledged, according to the current controller behavior.

**Retraction is distinct from resolution.** Retraction is for an alert
created incorrectly or otherwise deemed invalid---not simply because a
later reading is normal. It preserves the alert row and records
`retracted_by`, `retracted_at`, and a required `retraction_reason`.
Retraction requires a non-empty reason (trimmed and validated, maximum
500 characters) and is limited to staff currently assigned to the
patient.

The `alert_status` enum includes `pending`, `acknowledged`, `resolved`,
and `retracted`. Normal alert-list retrieval shows pending and
acknowledged alerts; a direct lookup can still expose a retracted alert
for audit purposes. Retracted alerts are excluded from the open-alert
deduplication query.

## 14. Assignment-scoped authorization for clinical endpoints

The vital-history endpoint and alert actions enforce current assignment
scope. Nurses and doctors can retrieve a patient's vital history only
when they have an active assignment (`unassigned_at IS NULL`). Admin
access to this clinical history endpoint is intentionally not enabled.
Alert acknowledge, resolve, and retract operations also check active
assignment in the database update/query, rather than relying only on
frontend behavior.

For history access, a missing patient returns `404`; an existing patient
who is not assigned to the requester returns `403`.

## 15. Vital-history pagination: keyset cursor instead of offset pagination

`GET /patients/:id/vitals` uses keyset/cursor pagination. The default
page size is 20, the maximum is 100, and the query fetches `limit + 1`
rows to determine whether another page exists.

Results are ordered by `recorded_at DESC, r_id DESC`. The next cursor
carries both `recordedAt` and `rId`, and the next page applies
`(recorded_at, r_id) < ($timestamp, $id)`. Including `r_id` as a
tie-breaker makes the ordering deterministic when timestamps match and
avoids common duplicate/skip problems of offset pagination when new rows
are inserted.

The endpoint returns `readings`, `hasMore`, and `nextCursor`. Invalid
JSON cursors return `400`. The `recorded_at` column was changed in the
live database from `timestamp without time zone` to
`timestamp with time zone` using an explicit `Asia/Kolkata`
interpretation of existing timestamps. The schema dump was refreshed
afterward so `schema.sql` reflects the current live structure.

## 16. Database indexes: primary-key indexes versus foreign-key indexes

PostgreSQL automatically creates indexes for primary keys and unique
constraints. The inspected database has primary-key indexes on
`alert.a_id`, `patient.p_id`, `staff.s_id`,
`staff_patient_assignment.id`, and `vital_reading.r_id`, plus the unique
index on `staff.email`.

PostgreSQL does **not** automatically create an index on the referencing
side of a foreign key. In particular, there is currently no index on
`vital_reading.p_id` or the history-ordering combination. The index
choice and before/after measurement are reserved for Phase 1; no history
index has yet been added.

## 17. Vital-history performance baseline before indexing

A baseline was captured using `EXPLAIN (ANALYZE, BUFFERS)` against the
100,000-row benchmark dataset with a query matching the history
endpoint's ordering and `LIMIT 21`.

Observed output: - Execution time: `15.527 ms` - `vital_reading`
sequential scan examined the full table. - `1,000` rows matched the
selected patient and `99,000` were removed by the `p_id` filter. - The
matching rows were sorted using top-N heapsort before the first 21 were
returned. - The plan reported `Buffers: shared hit=743` for the main
scan/sort portion.

This is a local preliminary baseline, not a production latency claim.
The matching composite index and repeat measurement belong to Phase 1.
Any resume claim must use measured before/after results under documented
test conditions.

## 18. Benchmark seed script: bulk generation and safe modes

`scripts/seedBenchmark.js` generates synthetic benchmark patients and
readings with PostgreSQL `generate_series()` and bulk SQL rather than
issuing one query per reading. Default settings are 100 patients and
1,000 readings per patient (100,000 readings total). Synthetic readings
are test data only and are not clinically validated.

The script supports: - **Default dry-run mode:** creates rows inside a
transaction and rolls back. - `--commit`: persists generated benchmark
data. - `--reset --commit`: deliberately truncates the application's
five tables (`alert`, `vital_reading`, `staff_patient_assignment`,
`patient`, `staff`), restarts identities, and inserts the benchmark
dataset.

`--reset` without `--commit` is rejected. The reset mode is destructive
and intended only for a local development/test database; it removes
staff accounts, assignments, patients, readings, and alerts while
preserving table structures and schema. After reset, staff accounts and
assignments must be recreated before authenticated route tests.

Verified dry-run results: - 100 patients and 100,000 readings generated
successfully. - Latest observed reading-insert time: `611 ms`; total
elapsed time: `634 ms`. - A separate dry run reported `622 ms` for
reading insertion and `630 ms` total. - After rollback, the database
retained its original `6` patients, `12` readings, and `3` alerts.

The dataset was subsequently committed and verified: - `staff`: `0` -
`patient`: `100` - `staff_patient_assignment`: `0` - `vital_reading`:
`100,000` - `alert`: `0`

Insert timings are local measurements for this seed operation, not a
before/after optimization claim.

## 19. Centralized error handling

Controllers forward unexpected errors using `next(err)`. The centralized
error handler returns the error's `statusCode` when present and
otherwise returns `500` with a generic `Internal Server Error` message,
avoiding disclosure of unexpected internal error details.

`AppError` provides an error class that carries a `statusCode`.
PostgreSQL-specific error-code mapping has deliberately been deferred
rather than added without a defined handling policy.

## 20. Schema and repository hygiene

`schema.sql` was refreshed from the live PostgreSQL database using
`pg_dump --schema-only --no-owner --no-privileges`. The diff confirmed
the live `retracted` enum value, alert retraction fields and foreign
key, and `vital_reading.recorded_at TIMESTAMPTZ`. The refreshed
`schema.sql` was copied into place and verified identical to the
temporary dump.

`.gitignore` ignores `node_modules/`, `.env`, session-cookie files, and
the temporary `schema_updated.sql` export. `.env.example` was created
with placeholder values rather than real credentials. A temporary
`table_columns.txt` file was used during inspection and should be
removed after use.

The session configuration still has a development fallback secret. The
production-only `SESSION_SECRET` startup guard was discussed but
intentionally deferred until the hardening phase; do not treat it as
implemented.

## 21. Current implementation and roadmap status

**Implemented and verified** - Patient/staff assignment routes and
assignment history model. - Batch vital submission with transaction,
patient row lock, evaluation, flagging, and severity-based alert
creation. - Alert list/detail, acknowledge, resolve, and retract
handlers with assignment checks. - Retraction reason validation and
audit fields. - Vital-history cursor pagination, page-size validation,
assignment scoping, and `TIMESTAMPTZ` ordering. - Centralized Express
error handler and `AppError`. - Refreshed `schema.sql`, `.gitignore`
updates, `.env.example`, and a working benchmark seed script. - A
100,000-reading benchmark dataset and initial unindexed query
plan/timing.

**Still pending** - Finish Phase 0 checklist/documentation housekeeping
and remove temporary files. - Phase 1: migrations, repeatable index
creation, query-plan baselines for other hot queries, before/after index
measurements, API load tests (including many-patient and hot-patient
cases), and PostgreSQL pool tuning. - Recreate development staff
accounts and patient assignments after the intentional benchmark reset
before authenticated route tests. - Phase 2: `risk_rule` table, admin
GET/PUT endpoints, validation (`min < max`), and refactor
`evaluateReading` to receive configurable rules. - Later phases: Redis,
transactional outbox and RabbitMQ dispatch, WebSockets, frontend
integration, hardening, automated tests, Docker, CI/CD, deployment, and
final evidence packaging.

Do not claim pending items as complete. Performance and reliability
resume bullets must be based on measured results, with dataset size,
test conditions, and before/after metrics recorded.



## 22. Transactional outbox for reliable alert dispatch

Alert creation and notification dispatch are separate responsibilities.
The `alert` table represents the clinical alert and its lifecycle, while
the outbox records events that still need to be published to downstream
systems such as RabbitMQ.

**Decision:** use a separate transactional outbox table rather than
storing message-dispatch state directly on `alert`.

When an alert is created, the alert row and its corresponding outbox
event must be inserted in the same PostgreSQL transaction. This ensures
that either both are committed or neither is committed.

A background worker will read pending outbox events and publish them
to RabbitMQ. If RabbitMQ is unavailable, events remain persisted in
PostgreSQL and can be retried after service recovery.

**Why not store dispatch status on `alert`?** Keeping dispatch state
separate avoids coupling the clinical alert lifecycle to message
delivery. It also supports multiple events for one alert in the future,
such as alert creation, severity escalation, and resolution.

**Reliability guarantees and limitations:**
- A committed alert cannot be created without its corresponding outbox
  event.
- A failed database transaction cannot leave behind a committed outbox
  event for an alert that was rolled back.
- RabbitMQ publishing is performed outside the PostgreSQL transaction.
- Publishing may occur more than once if a worker crashes after
  publishing but before recording success; retries and idempotent
  processing must account for duplicates.
- RabbitMQ publisher confirms, durable queues, persistent messages,
  retry handling, and dead-letter handling will be configured as part
  of the dispatch implementation.

This decision improves recoverability of notification dispatch but
does not guarantee exactly-once delivery.

## 23. Relay failure semantics: broker unavailable vs broker rejected

I first considered counting every failed publish as an attempt (the original
relay). In testing, a ~50 s broker outage moved events to `failed` after 5
attempts and the worker never reconnected, which defeats the outbox.
I also considered retrying forever without counting.

**Decision:** classify failures. `BrokerUnavailableError` (no channel, channel
closed, confirm timeout) rolls back, leaves the row `pending`, and does not
touch `retry_count`. `BrokerRejectedError` (an explicit nack) counts as an
attempt, with backoff, and the event becomes `failed` after 5.

**Verified:** with the broker stopped for ~60 s, new events stayed `pending`
with `retry_count = 0` and were published after the relay reconnected.

**Trade-off:** a confirm timeout is ambiguous (the broker may have received
the message), so it is treated as unavailable and can cause a duplicate; the
consumer must be idempotent (entry 25). `failed` rows have no alerting or
requeue tooling yet.

## 24. Relay publishes inside its claim transaction, with a confirm timeout

I considered claim-then-publish (mark the row in-flight, commit, publish,
mark published). I rejected it because a relay that crashes mid-publish leaves
rows stuck in-flight and needs a lease/sweeper.

**Decision:** claim with `FOR UPDATE SKIP LOCKED`, publish inside the same
transaction with a 5 s confirm timeout, then mark published. `SKIP LOCKED`
lets several relays run safely.

**Trade-off:** each in-flight event holds a pooled connection and a row lock
for up to 5 s if the broker is slow. This corrects entry 22: publishing is
outside the alert-creation transaction, but inside the relay's claim
transaction.

## 25. Dispatch consumer: ack after commit, idempotency by unique key

I considered auto-ack (rejected: a crash loses the message) and a separate
`processed_events` table keyed by `event_id` (more general, one more write and
table).

**Decision:** manual ack only after the database commit. Idempotency comes from
`UNIQUE (alert_id, s_id)` with `INSERT ... ON CONFLICT DO NOTHING`; prefetch 5.

**Verified:** a duplicate delivery logged "0 new, 1 already recorded" and the
row count did not change.

**Trade-off:** this works because the effect is an insert. A future
non-idempotent effect (SMS, email) needs its own dedup key.

## 26. Retries: TTL retry queue and a dead-letter queue

I considered nack-and-requeue (redelivers immediately, a hot loop), an
in-process timer (lost on crash), and the delayed-message plugin (extra
dependency).

**Decision:** `patient.alerts.retry` has a 10 s message TTL and dead-letters
back into `patient.alerts`. An `x-retry-count` header counts trips; after 3
retries a message goes to `patient.alerts.dlq`. Messages that can never
succeed (bad JSON, unknown alert) go straight to the DLQ. The existing
`patient.alerts` queue arguments are unchanged.

**Verified:** with `alert_dispatch` renamed, a message failed 3 times at 10 s
intervals and succeeded after the table was restored.

**Trade-off:** the delay is fixed, not exponential, so the system rides out
only ~30 s of database trouble. The DLQ needs a replay procedure (re-insert
the outbox event; the consumer is idempotent) and monitoring, neither built.
Publishing to the retry queue then acking is not atomic; a crash in between
duplicates harmlessly.

## 27. Recipients are recorded at dispatch time in `alert_dispatch`

I considered computing recipients at read time from current assignments.

**Decision:** store one row per (alert, staff member) when the alert is
dispatched, so the record shows who was responsible then, even if assignments
change later. It also gives the dashboard something to catch up from and
`delivered_at` something to track.

**Open limitation:** a patient with no active assignee produces no rows and
only a log warning. I also made the consumer skip retracted alerts; that was
my assumption, not a decision I have reviewed.