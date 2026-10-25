const amqp = require("amqplib");

const QUEUE = "patient.alerts";
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30000;

let connection = null;
let channel = null;
let connecting = false;
let closing = false;

// Broker unreachable / channel died: nothing is wrong with the event.
class BrokerUnavailableError extends Error {}
// Broker explicitly refused the message (nack): the event itself was rejected.
class BrokerRejectedError extends Error {}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function describe(err) {
    if (err.message) return err.message;
    if (err.code) return err.code;
    if (err.errors && err.errors.length) return describe(err.errors[0]);
    return String(err);
}

async function openOnce() {
    const conn = await amqp.connect(process.env.RABBITMQ_URL);

    try {
        // An 'error' event with no listener would crash the whole process.
        conn.on("error", err => console.error("[rabbit] connection error:", describe(err)));
        conn.on("close", () => {
            console.warn("[rabbit] connection closed");
            connection = null;
            channel = null;
            if (!closing) connectWithRetry();
        });

        const ch = await conn.createConfirmChannel();
        ch.on("error", err => console.error("[rabbit] channel error:", describe(err)));
        ch.on("close", () => {
            channel = null;
            // Channel died but the connection is alive: drop the connection so the
            // 'close' handler above rebuilds everything.
            if (!closing && connection) connection.close().catch(() => {});
        });

        // Idempotent: safe to run on every (re)connect.
        await ch.assertQueue(QUEUE, { durable: true });

        connection = conn;
        channel = ch;
    } catch (err) {
        conn.close().catch(() => {});
        throw err;
    }
}

async function connectWithRetry() {
    if (connecting) return;
    connecting = true;

    let delay = RECONNECT_MIN_MS;

    while (!closing) {
        try {
            await openOnce();
            console.log("[rabbit] connected");
            break;
        } catch (err) {
            console.error(`[rabbit] connect failed: ${describe(err)}; retrying in ${delay}ms`);
            await sleep(delay);
            delay = Math.min(delay * 2, RECONNECT_MAX_MS);
        }
    }

    connecting = false;
}

function connectRabbitMQ() {
    return connectWithRetry();
}

function isBrokerReady() {
    return channel !== null;
}

// Publishes one message and resolves only after the broker confirms it.
function publishToQueue(queue, buffer, options, timeoutMs = 5000) {
    if (!channel) {
        return Promise.reject(new BrokerUnavailableError("no channel"));
    }

    const ch = channel;

    return new Promise((resolve, reject) => {
        // No confirm in time = outcome unknown. Treat as unavailable
        // (may cause a duplicate later, never a loss).
        const timer = setTimeout(
            () => reject(new BrokerUnavailableError("confirm timeout")),
            timeoutMs
        );

        try {
            ch.sendToQueue(queue, buffer, options, err => {
                clearTimeout(timer);

                if (!err) return resolve();

                if (err.message === "message nacked") {
                    return reject(new BrokerRejectedError(err.message));
                }

                // e.g. 'channel closed' while waiting for the confirm
                reject(new BrokerUnavailableError(err.message));
            });
        } catch (err) {
            clearTimeout(timer);
            reject(new BrokerUnavailableError(err.message));
        }
    });
}

function stopReconnecting() {
    closing = true;
}

async function closeRabbitMQ() {
    closing = true;
    try { if (channel) await channel.close(); } catch (_) {}
    try { if (connection) await connection.close(); } catch (_) {}
}

module.exports = {
    connectRabbitMQ,
    isBrokerReady,
    publishToQueue,
    stopReconnecting,
    closeRabbitMQ,
    BrokerUnavailableError,
    BrokerRejectedError
};