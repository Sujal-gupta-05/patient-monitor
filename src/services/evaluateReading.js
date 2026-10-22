
function isOutside(value, min, max) {
    return value < min || value > max;
}

function evaluateReading(vitalType, value, rule) {
    if (!rule || rule.vital_type !== vitalType) {
        return null;
    }

    if (isOutside(value, Number(rule.high_min), Number(rule.high_max))) {
        return "high";
    }

    if (isOutside(value, Number(rule.medium_min), Number(rule.medium_max))) {
        return "medium";
    }

    if (isOutside(value, Number(rule.low_min), Number(rule.low_max))) {
        return "low";
    }

    return null;
}

module.exports = { evaluateReading };
