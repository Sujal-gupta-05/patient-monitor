const Joi = require('joi');

const VITAL_TYPES = [
    'heart_rate',
    'bp_systolic',
    'bp_diastolic',
    'spo2',
    'temperature'
];

const vitalsSchema = Joi.object({
    readings: Joi.array()
        .min(1)
        .max(VITAL_TYPES.length)
        .unique('vital_type')
        .items(
            Joi.object({
                vital_type: Joi.string()
                    .valid(...VITAL_TYPES)
                    .required(),

                value: Joi.number()
                    .when("vital_type", {
                        switch: [
                            {
                                is: "heart_rate",
                                then: Joi.number().min(20).max(250)
                            },
                            {
                                is: "bp_systolic",
                                then: Joi.number().min(50).max(300)
                            },
                            {
                                is: "bp_diastolic",
                                then: Joi.number().min(20).max(200)
                            },
                            {
                                is: "spo2",
                                then: Joi.number().min(50).max(100)
                            },
                            {
                                is: "temperature",
                                then: Joi.number().min(25).max(45)
                            },

                        ]
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