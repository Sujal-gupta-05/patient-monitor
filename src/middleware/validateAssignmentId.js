const Joi = require("joi");

const assignmentIdSchema = Joi.object({
    assignmentId: Joi.number().integer().positive().required()
}).unknown(true);

function validateAssignmentId(req, res, next) {
    const { error } = assignmentIdSchema.validate(req.params);

    if (error) {
        return res.status(400).json({error: error.details[0].message});
    }

    next();
}

module.exports = validateAssignmentId;