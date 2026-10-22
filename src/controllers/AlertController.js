const pool = require("../config/db.js");

module.exports.getAlerts = async(req, res, next) => {
    try{
        const {s_id} = req.user;

        const result = await pool.query("SELECT a.a_id, a.p_id, a.severity, a.status, p.name AS patient_name, vr.vital_type, vr.value FROM alert AS a JOIN patient AS p ON p.p_id = a.p_id JOIN vital_reading AS vr ON vr.r_id = a.r_id WHERE a.status IN ('pending', 'acknowledged') AND EXISTS ( SELECT 1 FROM staff_patient_assignment AS spa WHERE spa.s_id = $1 AND spa.p_id = a.p_id AND spa.unassigned_at IS NULL) ORDER BY a.created_at DESC",
            [s_id]
        );
        return res.status(200).json({alerts: result.rows});
    }
    catch(err){
        return next(err);
    }
};

module.exports.getAlertById = async(req, res, next) => {
    try{
        const {s_id} = req.user;
        const {id} = req.params;

        const result = await pool.query("SELECT a.a_id, a.p_id, a.r_id, a.severity, a.status, a.acknowledged_by, a.acknowledged_at, a.resolved_at, a.created_at, p.name AS patient_name, vr.vital_type, vr.value, vr.recorded_at FROM alert AS a JOIN patient AS p ON p.p_id = a.p_id JOIN vital_reading AS vr on vr.r_id = a.r_id WHERE a.a_id = $1 AND EXISTS (SELECT 1 FROM staff_patient_assignment AS spa WHERE spa.s_id = $2 AND spa.p_id = a.p_id AND spa.unassigned_at IS NULL)",
            [id, s_id]
        );

        if(result.rows.length === 0){
            return res.status(404).json({error: "Alert not found"});
        }

        return res.status(200).json({alert: result.rows[0]});
    }
    catch(err){
        return next(err);
    }
};

module.exports.acknowledgeAlert = async(req, res, next) => {
    try{
        const {id} = req.params;
        const {s_id} = req.user;
        
        const result = await pool.query("UPDATE alert AS a SET status = 'acknowledged', acknowledged_by = $2, acknowledged_at = NOW() WHERE a.a_id = $1 AND a.status = 'pending' AND EXISTS (SELECT 1 FROM staff_patient_assignment AS spa WHERE spa.s_id = $2 AND spa.p_id = a.p_id AND spa.unassigned_at IS NULL) RETURNING *",
            [id, s_id]
        );

        if(result.rows.length === 0){
            return res.status(404).json({error: "Alert not found or unavailable"});
        }
        return res.status(200).json({message: "Alert acknowledged successfully", alert: result.rows[0]});
        
    }
    catch(err){
        return next(err);
    }
};

module.exports.resolveAlert = async(req, res, next) => {
    try{
        const {id} = req.params;
        const {s_id} = req.user;

        const result = await pool.query("UPDATE alert AS a SET status = 'resolved', resolved_at = NOW() WHERE a.a_id = $1 AND a.status IN ('pending', 'acknowledged') AND EXISTS (SELECT 1 FROM staff_patient_assignment AS spa WHERE spa.p_id = a.p_id AND spa.s_id = $2 AND spa.unassigned_at IS NULL) RETURNING *",
            [id, s_id]
        );

        if(result.rows.length === 0){
            return res.status(404).json({error: "Alert not found or unavailable"})
        }
        return res.status(200).json({message: "Alert resolved successfully", alert: result.rows[0]});
    }
    catch(err){
        return next(err);
    }
};

module.exports.retractAlert = async(req, res, next) => {
    try{
        const {id} = req.params;
        const {s_id} = req.user;
        const {reason} = req.body;
        
        if(typeof reason !== "string" || !reason.trim()){
            return res.status(400).json({error: "Retraction reason is required"});
        }

        const result = await pool.query("UPDATE alert AS a SET status = 'retracted', retracted_by = $2, retracted_at = NOW(), retraction_reason = $3 WHERE a.a_id = $1 AND a.status IN ('pending', 'acknowledged') AND EXISTS (SELECT 1 FROM staff_patient_assignment AS spa WHERE spa.p_id = a.p_id AND spa.s_id = $2 AND spa.unassigned_at IS NULL) RETURNING *",
            [id, s_id, reason.trim()]
        );

        if(result.rows.length === 0){
            return res.status(404).json({error: "Alert not found or unavailable for retraction"});
        }

        return res.status(200).json({message: "Alert retracted successfully", alert: result.rows[0]});
    }
    catch(err){
        return next(err);
    }
}