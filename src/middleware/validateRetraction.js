const Joi = require("joi");

const schema = Joi.object({
    reason: Joi.string().trim().min(1).max(500).required()
});

module.exports = (req, res, next) => {
    const { error, value } = schema.validate(req.body);

    if (error) {
        return res.status(400).json({
            error: error.details[0].message
        });
    }

    req.body = value;
    return next();
};