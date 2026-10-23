const VITAL_RANGES = {
    heart_rate:   { min: 20, max: 250 },
    bp_systolic:  { min: 50, max: 300 },
    bp_diastolic: { min: 20, max: 200 },
    spo2:         { min: 50, max: 100 },
    temperature:  { min: 25, max: 45 }
};

const VITAL_TYPES = Object.keys(VITAL_RANGES);

module.exports = { VITAL_RANGES, VITAL_TYPES };