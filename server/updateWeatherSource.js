import { pool } from './src/config/db.js';

await pool.query(
  `UPDATE data_sources
   SET name = $1,
       category = $2,
       endpoint = $3,
       status = $4,
       updated_at = NOW()
   WHERE key = $5`,
  [
    'WeatherAPI current weather',
    'weather',
    'https://api.weatherapi.com/v1/current.json',
    'online',
    'weather'
  ]
);

console.log('Weather source updated successfully.');

await pool.end();