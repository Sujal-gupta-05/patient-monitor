
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const shouldCommit = process.argv.includes("--commit");
const shouldReset = process.argv.includes("--reset");

async function seedBenchmark() {
  let client;
  let transactionStarted = false;

  try {
    if (shouldReset && !shouldCommit) {
      throw new Error("--reset requires --commit");
    }

    const patientCount = Number(process.env.BENCHMARK_PATIENTS || 100);
    const readingsPerPatient = Number(
      process.env.BENCHMARK_READINGS_PER_PATIENT || 1000
    );

    if (
      !Number.isSafeInteger(patientCount) ||
      patientCount < 1 ||
      !Number.isSafeInteger(readingsPerPatient) ||
      readingsPerPatient < 1 ||
      !Number.isSafeInteger(patientCount * readingsPerPatient)
    ) {
      throw new Error("Benchmark counts must be positive safe integers");
    }

    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is missing from .env");
    }

    const totalReadings = patientCount * readingsPerPatient;

    console.log(`Mode: ${shouldCommit ? "COMMIT" : "DRY RUN"}`);
    console.log(`Reset existing data: ${shouldReset}`);
    console.log(`Benchmark patients: ${patientCount}`);
    console.log(`Target readings: ${totalReadings}`);

    client = await pool.connect();

    const start = Date.now();

    await client.query("BEGIN");
    transactionStarted = true;

    // Destructive reset: only runs with --reset --commit.
    if (shouldReset) {
      await client.query(`
        TRUNCATE TABLE
          alert,
          vital_reading,
          staff_patient_assignment,
          patient,
          staff
        RESTART IDENTITY CASCADE
      `);

      console.log("Existing application data cleared.");
    }

    // Generate benchmark patients.
    const patients = await client.query(
      `
      INSERT INTO patient (name, dob, ward, bed, status)
      SELECT
        'BENCH_PATIENT_' || g,
        DATE '1980-01-01' + (g % 12000)::integer,
        'BENCH_WARD',
        'B-' || g,
        'admitted'
      FROM generate_series(1, $1::integer) AS g
      RETURNING p_id
      `,
      [patientCount]
    );

    console.log(`Inserted ${patients.rowCount} benchmark patients.`);

    // Generate readings in one database query.
    const readingStart = Date.now();

    const readings = await client.query(
      `
      INSERT INTO vital_reading
        (p_id, vital_type, value, is_flagged, recorded_at)
      SELECT
        p.p_id,
        v.vital_type,
        v.value,
        false,
        NOW() - (g.reading_no * INTERVAL '1 minute')
      FROM unnest($1::integer[]) AS p(p_id)
      CROSS JOIN generate_series(1, $2::integer) AS g(reading_no)
      CROSS JOIN LATERAL (
        SELECT
          CASE (g.reading_no % 5)
            WHEN 0 THEN 'heart_rate'
            WHEN 1 THEN 'bp_systolic'
            WHEN 2 THEN 'bp_diastolic'
            WHEN 3 THEN 'spo2'
            ELSE 'temperature'
          END::vital_type_enum AS vital_type,
          CASE (g.reading_no % 5)
            WHEN 0 THEN 60 + (g.reading_no % 61)
            WHEN 1 THEN 100 + (g.reading_no % 41)
            WHEN 2 THEN 60 + (g.reading_no % 31)
            WHEN 3 THEN 92 + (g.reading_no % 9)
            ELSE 36 + ((g.reading_no % 40)::numeric / 10)
          END::numeric(5,2) AS value
      ) AS v
      `,
      [
        patients.rows.map((patient) => patient.p_id),
        readingsPerPatient,
      ]
    );

    console.log(
      `Inserted ${readings.rowCount} readings in ${
        Date.now() - readingStart
      } ms.`
    );

    if (shouldCommit) {
      await client.query("COMMIT");
      transactionStarted = false;
      console.log("Benchmark data committed.");
    } else {
      await client.query("ROLLBACK");
      transactionStarted = false;
      console.log("Dry run complete. No changes were retained.");
    }

    console.log(`Total elapsed time: ${Date.now() - start} ms.`);
  } catch (err) {
    if (client && transactionStarted) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Benchmark seed failed:", err.message);
    process.exitCode = 1;
  } finally {
    if (client) {
      client.release();
    }

    await pool.end();
  }
}

seedBenchmark();
