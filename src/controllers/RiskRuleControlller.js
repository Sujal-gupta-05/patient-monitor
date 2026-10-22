const pool = require("../config/db.js");

module.exports.getRiskRules = async(req, res, next) => {
    try{
        const result = await pool.query("SELECT vital_type, low_min, low_max, medium_min, medium_max, high_min, high_max, updated_by, updated_at FROM risk_rule ORDER BY vital_type");
        return res.status(200).json({count: result.rows.length, rules: result.rows});
    }
    catch(err){
        return next(err);
    }
};


module.exports.updateRiskRule = async(req, res, next) => {
    try{
        const { vitalType } = req.params;

        const {
            low_min,
            low_max,
            medium_min,
            medium_max,
            high_min,
            high_max
        } = req.body;

        const result = await pool.query("UPDATE risk_rule SET low_min = $1, low_max = $2, medium_min = $3, medium_max = $4, high_min = $5, high_max = $6, updated_by = $7, updated_at = NOW() WHERE vital_type = $8 RETURNING *",
            [low_min, low_max, medium_min, medium_max, high_min, high_max, req.user.s_id, vitalType]
        );

        if(result.rows.length === 0){
            return res.status(404).json({error: "Risk rule not found"});
        }
        return res.status(200).json({message: "Risk rule updated successfully", rule: result.rows[0]});
    }
    catch(err){
        return next(err);
    }
};