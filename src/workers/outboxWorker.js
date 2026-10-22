require("dotenv").config();

const pool = require("../config/db");
const { connectRabbitMQ } = require("../config/rabbitmq");

const POLL_INTERVAL_MS = 2000;
const MAX_EVENTS_PER_POLL = 10;
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 2000;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function publishAlert(channel, event) {
    channel.sendToQueue(
        "patient.alerts",
        Buffer.from(JSON.stringify(event.payload)),
        {
            persistent: true,
            contentType: "application/json",
            messageId: String(event.event_id)
        }
    );

    await channel.waitForConfirms();
}

async function recordFailure(event, error) {
    const retryCount = event.retry_count + 1;
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        if (retryCount >= MAX_ATTEMPTS) {
            await client.query(
                `UPDATE outbox
                 SET status = 'failed',
                     retry_count = $1,
                     next_attempt_at = NULL,
                     last_error = $2
                 WHERE event_id = $3`,
                [retryCount, error.message, event.event_id]
            );
        } else {
            const delayMs =
                BASE_BACKOFF_MS * (2 ** (retryCount - 1));

            await client.query(
                `UPDATE outbox
                 SET retry_count = $1,
                     next_attempt_at = NOW()
                         + ($2 * INTERVAL '1 millisecond'),
                     last_error = $3
                 WHERE event_id = $4`,
                [retryCount, delayMs, error.message, event.event_id]
            );
        }

        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

async function processNextEvent(channel) {
    let client;
    let event;

    try {
        client = await pool.connect();
        await client.query("BEGIN");

        const result = await client.query(`
            SELECT event_id, payload, retry_count
            FROM outbox
            WHERE status = 'pending'
              AND next_attempt_at <= NOW()
            ORDER BY event_id
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        `);

        if (result.rows.length === 0) {
            await client.query("COMMIT");
            return false;
        }

        event = result.rows[0];

        await publishAlert(channel, event);

        await client.query(
            `UPDATE outbox
             SET status = 'published',
                 published_at = NOW(),
                 next_attempt_at = NULL,
                 last_error = NULL
             WHERE event_id = $1`,
            [event.event_id]
        );

        await client.query("COMMIT");

        console.log("Published event:", event.event_id);
        return true;
    } catch (err) {
        if (client) {
            await client.query("ROLLBACK").catch(() => {});
        }

        console.error("Failed to publish event:", err.message);

        if (event) {
            try {
                await recordFailure(event, err);
            } catch (failureErr) {
                console.error("Failed to record retry:", failureErr.message);
            }
        }

        return false;
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function processBatch(channel) {
    for (let i = 0; i < MAX_EVENTS_PER_POLL; i++) {
        const foundEvent = await processNextEvent(channel);

        if (!foundEvent) {
            break;
        }
    }
}

async function startWorker() {
    try {
        const channel = await connectRabbitMQ();

        await channel.assertQueue("patient.alerts", {
            durable: true
        });

        console.log("Outbox worker started");

        while (true) {
            await processBatch(channel);
            await sleep(POLL_INTERVAL_MS);
        }
    } catch (err) {
        console.error("Outbox worker stopped:", err.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

startWorker();
