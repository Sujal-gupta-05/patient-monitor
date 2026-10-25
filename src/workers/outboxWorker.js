require("dotenv").config();

const pool = require("../config/db");
const {
    connectRabbitMQ,
    isBrokerReady,
    publishToQueue,
    stopReconnecting,
    closeRabbitMQ,
    BrokerUnavailableError
} = require("../config/rabbitmq");

const QUEUE = "patient.alerts";
const IDLE_POLL_MS = 1000;
const BROKER_DOWN_POLL_MS = 3000;
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 2000;

let running = true;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// An idle pg client erroring (e.g. DB restart) would otherwise crash the process.
pool.on("error", err => console.error("[pg] idle client error:", err.message));

async function recordFailure(event, error) {
    const retryCount = event.retry_count + 1;

    if (retryCount >= MAX_ATTEMPTS) {
        await pool.query(
            `UPDATE outbox
             SET status = 'failed', retry_count = $1, last_error = $2
             WHERE event_id = $3`,
            [retryCount, error.message, event.event_id]
        );
        return;
    }

    const delayMs = BASE_BACKOFF_MS * (2 ** (retryCount - 1));

    await pool.query(
        `UPDATE outbox
         SET retry_count = $1,
             next_attempt_at = NOW() + ($2 * INTERVAL '1 millisecond'),
             last_error = $3
         WHERE event_id = $4`,
        [retryCount, delayMs, error.message, event.event_id]
    );
}

// Returns: "published" | "rejected" | "idle" | "broker_down" | "error"
async function processNextEvent() {
    // Don't even claim a row if we can't publish it.
    if (!isBrokerReady()) return "broker_down";

    const client = await pool.connect();
    let event;

    try {
        await client.query("BEGIN");

        const { rows } = await client.query(`
            SELECT event_id, payload, retry_count
            FROM outbox
            WHERE status = 'pending' AND next_attempt_at <= NOW()
            ORDER BY event_id
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        `);

        if (rows.length === 0) {
            await client.query("COMMIT");
            return "idle";
        }

        event = rows[0];

        await publishToQueue(
            QUEUE,
            Buffer.from(JSON.stringify(event.payload)),
            {
                persistent: true,
                contentType: "application/json",
                messageId: String(event.event_id)
            }
        );

        await client.query(
            `UPDATE outbox
             SET status = 'published', published_at = NOW(), last_error = NULL
             WHERE event_id = $1`,
            [event.event_id]
        );
        await client.query("COMMIT");

        console.log("Published event:", event.event_id);
        return "published";
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});

        // Broker trouble is not the event's fault: row stays pending, retry_count untouched.
        if (err instanceof BrokerUnavailableError) {
            console.warn("Broker unavailable, will retry:", err.message);
            return "broker_down";
        }

        // Neither an event problem nor a broker problem (e.g. the DB failed).
        if (!event) {
            console.error("Relay DB error:", err.message);
            return "error";
        }

        // The broker explicitly rejected this event: count the attempt.
        console.error("Event rejected:", event.event_id, err.message);
        try {
            await recordFailure(event, err);
        } catch (failureErr) {
            console.error("Failed to record failure:", failureErr.message);
        }
        return "rejected";
    } finally {
        client.release();
    }
}

async function runLoop() {
    while (running) {
        let outcome;

        try {
            outcome = await processNextEvent();
        } catch (err) {
            console.error("Relay iteration error:", err.message);
            outcome = "error";
        }

        // More work may be waiting: go again without sleeping.
        if (outcome === "published" || outcome === "rejected") continue;

        await sleep(outcome === "broker_down" ? BROKER_DOWN_POLL_MS : IDLE_POLL_MS);
    }
}

function shutdown(signal) {
    console.log(`${signal} received, stopping after the current event...`);
    running = false;
    stopReconnecting();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function start() {
    await connectRabbitMQ();
    console.log("Outbox relay started");

    await runLoop();

    await closeRabbitMQ();
    await pool.end();
    console.log("Outbox relay stopped");
}

start().catch(err => {
    console.error("Relay crashed:", err);
    process.exitCode = 1;
});