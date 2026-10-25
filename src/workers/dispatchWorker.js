require("dotenv").config();
const pool = require("../config/db");

const {
    connectRabbitMQ,
    onReady,
    publishToQueue,
    stopReconnecting,
    closeRabbitMQ
} = require("../config/rabbitmq");


const ALERT_QUEUE = "patient.alerts";
const RETRY_QUEUE = "patient.alerts.retry";
const DLQ_QUEUE = "patient.alerts.dlq";

const PREFETCH = 5;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10000;

pool.on("error", err => console.error("[pg] idle client error:", err.message));

// A message that can never succeed (bad JSON, unknown alert): retrying is pointless.
class PoisonError extends Error {}

function validate(payload) {
    if (!payload || !Number.isInteger(payload.alert_id)) {
        throw new PoisonError("payload has no integer alert_id");
    }
}

async function dispatchAlert(alertId) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const alertResult = await client.query(
            "SELECT a_id, p_id, status FROM alert WHERE a_id = $1",
            [alertId]
        );

        if (alertResult.rows.length === 0) {
            throw new PoisonError(`alert ${alertId} does not exist`);
        }

        const alert = alertResult.rows[0];

        if (alert.status === "retracted") {
            await client.query("COMMIT");
            console.log(`Alert ${alertId} was retracted, nothing to dispatch`);
            return;
        }

        const assignees = await client.query(
            `SELECT s.s_id
             FROM staff_patient_assignment spa
             JOIN staff s ON s.s_id = spa.s_id
             WHERE spa.p_id = $1
               AND spa.unassigned_at IS NULL
               AND s.role IN ('nurse', 'doctor')`,
            [alert.p_id]
        );

        if (assignees.rows.length === 0) {
            await client.query("COMMIT");
            console.warn(`Alert ${alertId}: patient ${alert.p_id} has no active assignee`);
            return;
        }

        const staffIds = assignees.rows.map(r => r.s_id);

        const inserted = await client.query(
            `INSERT INTO alert_dispatch (alert_id, s_id)
             SELECT $1, UNNEST($2::int[])
             ON CONFLICT (alert_id, s_id) DO NOTHING`,
            [alertId, staffIds]
        );

        await client.query("COMMIT");

        console.log(
            `Alert ${alertId}: ${inserted.rowCount} new dispatch(es), ` +
            `${staffIds.length - inserted.rowCount} already recorded`
        );
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

// ack/nack throw if the channel died meanwhile; the broker then redelivers, which is safe.
function safely(fn) {
    try { fn(); } catch (err) { console.warn("ack/nack failed:", err.message); }
}

async function handleFailure(ch, msg, err) {
    const headers = msg.properties.headers || {};
    const retries = headers["x-retry-count"] || 0;
    const isPoison = err instanceof PoisonError || err instanceof SyntaxError;
    const toDlq = isPoison || retries >= MAX_RETRIES;

    const target = toDlq ? DLQ_QUEUE : RETRY_QUEUE;

    try {
        await publishToQueue(target, msg.content, {
            persistent: true,
            contentType: "application/json",
            messageId: msg.properties.messageId,
            headers: {
                "x-retry-count": toDlq ? retries : retries + 1,
                "x-error": String(err.message).slice(0, 500)
            }
        });

        console.error(
            toDlq
                ? `Message ${msg.properties.messageId} -> DLQ: ${err.message}`
                : `Message ${msg.properties.messageId} -> retry ${retries + 1}/${MAX_RETRIES}: ${err.message}`
        );

        safely(() => ch.ack(msg));
    } catch (publishErr) {
        // Could not park the message anywhere: give it back to the broker.
        console.error("Could not reroute message:", publishErr.message);
        safely(() => ch.nack(msg, false, true));
    }
}

async function handleMessage(ch, msg) {
    if (msg === null) return; // consumer cancelled by the broker

    try {
        const payload = JSON.parse(msg.content.toString());
        validate(payload);
        await dispatchAlert(payload.alert_id);
        safely(() => ch.ack(msg));
    } catch (err) {
        await handleFailure(ch, msg, err);
    }
}

// Runs on every (re)connect: declare topology, then start consuming.
async function setup(ch) {
    await ch.assertQueue(ALERT_QUEUE, { durable: true });

    // Expired retry messages are dead-lettered back onto the main queue.
    await ch.assertQueue(RETRY_QUEUE, {
        durable: true,
        arguments: {
            "x-message-ttl": RETRY_DELAY_MS,
            "x-dead-letter-exchange": "",
            "x-dead-letter-routing-key": ALERT_QUEUE
        }
    });

    await ch.assertQueue(DLQ_QUEUE, { durable: true });

    await ch.prefetch(PREFETCH);
    await ch.consume(ALERT_QUEUE, msg => handleMessage(ch, msg), { noAck: false });

    console.log("Dispatch worker consuming", ALERT_QUEUE);
}

async function shutdown(signal) {
    console.log(`${signal} received, shutting down...`);
    stopReconnecting();
    await closeRabbitMQ(); // unacked messages go back to the queue
    await pool.end();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

onReady(setup);
connectRabbitMQ().catch(err => {
    console.error("Dispatch worker crashed:", err);
    process.exitCode = 1;
});