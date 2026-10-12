import { pool } from './src/config/db.js';

const result = await pool.query(`
  SELECT
    sr.id,
    sr.record_key,
    sr.record_type,
    sr.source_updated_at,
    sr.received_at,
    sr.data
  FROM source_records sr
  JOIN data_sources ds ON ds.id = sr.source_id
  WHERE ds.key = 'weather'
  ORDER BY sr.received_at DESC
  LIMIT 5
`);

console.dir(result.rows, { depth: 10 });

await pool.end();