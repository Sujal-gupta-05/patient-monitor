const Joi = require('joi');
const { VITAL_RANGES, VITAL_TYPES } = require('../constants/vitals');

const vitalsSchema = Joi.object({
    readings: Joi.array()
        .min(1)
        .max(VITAL_TYPES.length)
        .unique('vital_type')
        .items(
            Joi.object({
                vital_type: Joi.string().valid(...VITAL_TYPES).required(),

                value: Joi.number()
                    .when('vital_type', {
                        switch: VITAL_TYPES.map(type => ({
                            is: type,
                            then: Joi.number()
                                .min(VITAL_RANGES[type].min)
                                .max(VITAL_RANGES[type].max)
                        }))
                    })
                    .required()
            })
        )
        .required()
});


function validateVitals(req, res, next) {
    const { error } = vitalsSchema.validate(req.body);

    if (error) {
        return res.status(400).json({error: error.details[0].message});
    }

    next();
}

module.exports = validateVitals;