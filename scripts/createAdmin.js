require("dotenv").config();
const bcrypt = require("bcrypt");
const pool = require("../src/config/db");


async function main() {
    const [name, email, password, ward = "Administration"] = process.argv.slice(2);

    if (!name || !email || !password || password.length < 8) {
        console.error('Usage: node scripts/createAdmin.js "Name" email password(min 8) [ward]');
        process.exitCode = 1;
        return;
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
        `INSERT INTO staff (name, email, password, role, ward)
         VALUES ($1, $2, $3, 'admin', $4)
         RETURNING s_id, email, role`,
        [name, email, hash, ward]
    );
    console.log("Created admin:", result.rows[0]);
}

main()
    .catch(err => { console.error("Failed:", err.message); process.exitCode = 1; })
    .finally(() => pool.end());