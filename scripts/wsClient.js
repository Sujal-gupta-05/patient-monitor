const WebSocket = require("ws");

const [email, password] = process.argv.slice(2);

async function main() {
    const res = await fetch("http://localhost:8080/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
        console.error("login failed:", res.status);
        process.exit(1);
    }

    const cookie = res.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
    const ws = new WebSocket("ws://localhost:8080/ws", { headers: { Cookie: cookie } });

    ws.on("open", () => console.log("connected"));
    ws.on("message", data => console.log("<-", data.toString()));
    ws.on("close", () => { console.log("closed"); process.exit(0); });
    ws.on("unexpected-response", (req, r) => { console.log("rejected:", r.statusCode); process.exit(0); });
}

main();