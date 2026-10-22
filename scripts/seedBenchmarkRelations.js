
const bcrypt = require("bcrypt");
const pool = require("../src/config/db");

const STAFF_COUNT = 10;
const BENCHMARK_PASSWORD = "BenchmarkOnly123!";

async function seedBenchmarkRelations() {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // Only use patients created by the benchmark seed.
    const patientsResult = await client.query(`
      SELECT p_id
      FROM patient
      WHERE name LIKE 'BENCH_PATIENT_%'
      ORDER BY p_id
    `);

    const patientIds = patientsResult.rows.map((row) => row.p_id);

    if (patientIds.length === 0) {
      throw new Error(
        "No benchmark patients found. Run the benchmark patient seed first."
      );
    }

    // Create or reuse deterministic benchmark staff accounts.
    const staffIds = [];
    const hashedPassword = await bcrypt.hash(BENCHMARK_PASSWORD, 10);

    for (let i = 1; i <= STAFF_COUNT; i++) {
      const email = `benchmark.staff${i}@example.test`;
      const role = i <= 7 ? "nurse" : "doctor";

      const result = await client.query(
        `
        INSERT INTO staff (name, email, password, role, ward)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (email)
        DO UPDATE SET email = EXCLUDED.email
        RETURNING s_id
        `,
        [
          `Benchmark Staff ${i}`,
          email,
          hashedPassword,
          role,
          "BENCH_WARD",
        ]
      );

      staffIds.push(result.rows[0].s_id);
    }

    // Distribute patients across staff. Every patient gets one active assignment.
    let insertedAssignments = 0;

    for (let i = 0; i < patientIds.length; i++) {
      const pId = patientIds[i];
      const sId = staffIds[i % staffIds.length];

      const result = await client.query(
        `
        INSERT INTO staff_patient_assignment (s_id, p_id)
        SELECT $1, $2
        WHERE NOT EXISTS (
          SELECT 1
          FROM staff_patient_assignment
          WHERE s_id = $1
            AND p_id = $2
            AND unassigned_at IS NULL
        )
        RETURNING id
        `,
        [sId, pId]
      );

      insertedAssignments += result.rowCount;
    }

    await client.query("COMMIT");
    transactionStarted = false;

    console.log(`Benchmark patients found: ${patientIds.length}`);
    console.log(`Benchmark staff created/reused: ${staffIds.length}`);
    console.log(`New active assignments inserted: ${insertedAssignments}`);
    console.log("Existing vital readings were not modified.");
    console.log(
      "Benchmark password for these dedicated accounts: " +
        BENCHMARK_PASSWORD
    );
  } catch (err) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Benchmark relationship seed failed:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seedBenchmarkRelations();
