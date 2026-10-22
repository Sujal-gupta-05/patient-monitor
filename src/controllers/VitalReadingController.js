const pool = require("../config/db.js");
const { evaluateReading } = require("../services/evaluateReading.js");

const severityRank = {
    low: 1,
    medium: 2,
    high: 3
};

module.exports.createVitalReading = async (req, res, next) => {
    let client = null;
    try {
        client = await pool.connect();
        const { id } = req.params;
        const { s_id } = req.user;
        const { readings } = req.body;

        await client.query("BEGIN");

        const assigned = await client.query(
            `SELECT id
             FROM staff_patient_assignment
             WHERE s_id = $1
               AND p_id = $2
               AND unassigned_at IS NULL`,
            [s_id, id]
        );

        if (assigned.rows.length === 0) {
            const exists = await client.query(
                "SELECT p_id FROM patient WHERE p_id = $1",
                [id]
            );

            await client.query("ROLLBACK");

            if (exists.rows.length === 0) {
                return res.status(404).json({
                    error: "Patient not found"
                });
            }

            return res.status(403).json({
                error: "You are not assigned to this patient"
            });
        }

        const rulesResult = await client.query(
            "SELECT * FROM risk_rule"
        );
        
        const riskRules = new Map(
            rulesResult.rows.map(rule => [rule.vital_type, rule])
        );
        

        // Serialize vital ingestion for this patient.
        // This prevents concurrent requests from independently
        // creating duplicate alerts for the same escalation.
        await client.query(
            "SELECT p_id FROM patient WHERE p_id = $1 FOR UPDATE",
            [id]
        );

        const types = readings.map(r => r.vital_type);
        const values = readings.map(r => r.value);

        const result = await client.query(
            `INSERT INTO vital_reading (p_id, vital_type, value)
             SELECT $1::int, *
             FROM unnest(
                 $2::vital_type_enum[],
                 $3::numeric[]
             )
             RETURNING *`,
            [id, types, values]
        );

        const alerts = [];

        for (const reading of result.rows) {
            const rule = riskRules.get(reading.vital_type);

            const severity = evaluateReading(
                reading.vital_type,
                Number(reading.value),
                rule
            );

            if (!severity) {
                continue;
            }

            await client.query(
                `UPDATE vital_reading
                 SET is_flagged = true
                 WHERE r_id = $1`,
                [reading.r_id]
            );

            // Find open alerts for this patient and vital type.
            const existingAlerts = await client.query(
                `SELECT a.a_id, a.severity
                 FROM alert AS a
                 JOIN vital_reading AS vr
                   ON vr.r_id = a.r_id
                 WHERE a.p_id = $1
                   AND vr.vital_type = $2
                   AND a.status IN ('pending', 'acknowledged')`,
                [reading.p_id, reading.vital_type]
            );

            // Find the highest severity among existing open alerts.
            const highestSeverity = existingAlerts.rows.reduce(
                (highest, alert) => {
                    if (
                        severityRank[alert.severity] >
                        severityRank[highest]
                    ) {
                        return alert.severity;
                    }

                    return highest;
                },
                "low"
            );

            // Create an alert only if severity has increased.
            if (
                existingAlerts.rows.length > 0 &&
                severityRank[severity] <= severityRank[highestSeverity]
            ) {
                continue;
            }

            const alertResult = await client.query(
                `INSERT INTO alert (r_id, p_id, severity)
                 VALUES ($1, $2, $3)
                 RETURNING *`,
                [reading.r_id, reading.p_id, severity]
            );

            const newAlert = alertResult.rows[0];

            await client.query(
                `INSERT INTO outbox (a_id, payload)
                 VALUES ($1, $2)`,
                [
                    newAlert.a_id,
                    JSON.stringify({
                        alert_id: newAlert.a_id,
                        patient_id: newAlert.p_id,
                        reading_id: newAlert.r_id,
                        severity: newAlert.severity
                    })
                ]
            );
            
            alerts.push(newAlert);
            
        }

        
        // Fetch the final persisted state of the readings.
        const updatedReadings = await client.query(
            `SELECT *
             FROM vital_reading
             WHERE r_id = ANY($1::int[])
             ORDER BY r_id`,
            [result.rows.map(reading => reading.r_id)]
        );

        await client.query("COMMIT");

        return res.status(201).json({
            readings: updatedReadings.rows,
            alerts
        });

    } catch (err) {
        //this statement might throw an error execution might not reach next so use try catch
        if(client){  //because if pool.connect fails client is null
            try{
                await client.query("ROLLBACK");
            }
            catch(rollbackErr){
                console.error("Rollback failed : ", rollbackErr)
            }
        }
       
        return next(err);
        
    } finally {
        if(client){
            client.release();
        }
    }
};


module.exports.getVitalHistory = async(req, res, next) => {
    try{
        const {id} = req.params;
        const { s_id } = req.user

    let before = null;

        const { limit } = req.validatedQuery;
        try{
            before = req.query.before? JSON.parse(req.query.before) : null;
        }
        catch{
            return res.status(400).json({error: "Invalid Pagination cursor"});
        }
        
        const assigned = await pool.query(
            "SELECT 1 FROM staff_patient_assignment WHERE s_id = $1 AND p_id = $2 AND unassigned_at IS NULL",
            [s_id, id]
        );

        if(assigned.rows.length === 0){
            const exists = await pool.query(
                "SELECT 1 FROM patient WHERE p_id = $1",
                [id]
            );

            if(exists.rows.length === 0){
                return res.status(404).json({error: "Patient not found"});
            }

            return res.status(403).json({error: "You are not assigned to this patient"});
        }

        const params = [id];

        let sql = "SELECT * FROM vital_reading WHERE p_id = $1";

        if(before != null){
            params.push(before.recordedAt, before.rId);

            sql += " AND (recorded_at, r_id) < ($2, $3)";
        }

        sql += ` ORDER BY recorded_at DESC, r_id DESC LIMIT $${params.length + 1}`
        params.push(limit + 1);

        const result = await pool.query(sql, params);

        const hasMore = result.rows.length > limit;
        const readings = result.rows.slice(0, limit);

        const lastReading = readings[readings.length - 1];

        const nextCursor = hasMore ? {
            recordedAt: lastReading.recorded_at,
            rId: lastReading.r_id
        }
        : null;
        return res.status(200).json({readings, hasMore, nextCursor});
    }
    catch(err){
        return next(err);
    }
}