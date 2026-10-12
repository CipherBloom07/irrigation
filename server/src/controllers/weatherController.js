import { pool } from '../config/db.js';
import { refreshExternalFeeds } from '../services/externalFeeds.js';

export async function getCurrentWeather(req, res) {
  try {
    // Refresh weather from the configured external source.
    // The service has its own short cache, so this does not
    // unnecessarily call the external API on every request.
    const refreshed = await refreshExternalFeeds({
      force: req.query.refresh === '1',
    });

    const result = await pool.query(`
      SELECT
        sr.data,
        sr.source_updated_at,
        sr.received_at,
        ds.name AS source_name
      FROM source_records sr
      JOIN data_sources ds ON ds.id = sr.source_id
      WHERE ds.key = 'weather'
        AND sr.record_type = 'weather'
      ORDER BY sr.received_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'No weather data is available yet.',
        status: refreshed.feeds.weather?.status ?? 'error',
        error: refreshed.feeds.weather?.error ?? null,
      });
    }

    const row = result.rows[0];

    return res.json({
      source: row.source_name,
      sourceUpdatedAt: row.source_updated_at,
      receivedAt: row.received_at,
      location: row.data.location,
      current: row.data.current,
      status: refreshed.feeds.weather?.status ?? 'error',
      error: refreshed.feeds.weather?.error ?? null,
    });
  } catch (error) {
    console.error('Unable to retrieve weather data:', error);

    return res.status(500).json({
      message: 'Unable to retrieve weather data.',
    });
  }
}