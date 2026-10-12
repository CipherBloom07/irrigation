import { pool } from './src/config/db.js';

const result = await pool.query(
  "SELECT id, key, name, category, status, endpoint FROM data_sources WHERE key = $1",
  ['weather']
);

console.table(result.rows);

await pool.end();