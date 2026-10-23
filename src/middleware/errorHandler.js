const AppError = require("../utils/AppError");

const PG_ERRORS = {
    "22P02": [400, "Invalid input value"],        // bad enum / bad number text
    "23505": [409, "Resource already exists"],    // unique violation
    "23503": [409, "Operation conflicts with related data"], // foreign key
    "23514": [400, "Value violates a data constraint"]       // CHECK
};

module.exports = (err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err instanceof AppError) {
        return res.status(err.statusCode || 500).json({ error: err.message });
    }

    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ error: "Malformed JSON body" });
    }

    if (err.code && PG_ERRORS[err.code]) {
        const [status, message] = PG_ERRORS[err.code];
        return res.status(status).json({ error: message });
    }

    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
};