import { pool } from "./src/config/db.js";

try {
  const result = await pool.query(`
    SELECT key, name, category, trust_level, status, last_success_at
    FROM data_sources
    ORDER BY id
  `);

  console.table(result.rows);
} catch (error) {
  console.error(error);
} finally {
  await pool.end();
}
