const Joi = require("joi");
const { VITAL_RANGES, VITAL_TYPES } = require("../constants/vitals");

function validateRiskRule(req, res, next) {
    const { vitalType } = req.params;

    if (!VITAL_TYPES.includes(vitalType)) {
        return res.status(400).json({ error: "Invalid vital type" });
    }

    const { min, max } = VITAL_RANGES[vitalType];
    const bound = Joi.number().min(min).max(max).required();

    const bodySchema = Joi.object({
        low_min: bound,    low_max: bound,
        medium_min: bound, medium_max: bound,
        high_min: bound,   high_max: bound
    });

    const { error, value: r } = bodySchema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    const nested =
    r.low_min < r.low_max &&
    r.medium_min < r.low_min && r.medium_max >= r.low_max &&
    r.high_min < r.medium_min && r.high_max >= r.medium_max;

if (!nested) {
    return res.status(400).json({
        error: "Bands must nest: high_min < medium_min < low_min < low_max <= medium_max <= high_max"
    });
}

next();
}

module.exports = validateRiskRule;