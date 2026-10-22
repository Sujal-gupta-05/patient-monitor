const Joi = require("joi");

const historyQuerySchema = Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20)
}).unknown(true);

module.exports = (req, res, next) => {
    const {error, value} = historyQuerySchema.validate(req.query);

    if(error){
        return res.status(400).json({error: error.details[0].message});
    }
    req.validatedQuery = value;
    next();
}