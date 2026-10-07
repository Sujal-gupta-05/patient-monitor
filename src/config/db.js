const { Pool } = require('pg');
const dotenv = require("dotenv");
dotenv.config();

const connectionString = process.env.DATABASE_URL;

module.exports = new Pool({connectionString: connectionString});