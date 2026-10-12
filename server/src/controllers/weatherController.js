import { pool } from '../config/db.js';
import { refreshExternalFeeds } from '../services/externalFeeds.js';

export async function getCurrentWeather(req, res) {
  try {
    const refreshed = await refreshExternalFeeds({
      force: req.query.refresh === '1',
    });

    const weatherFeed = refreshed.feeds?.weather;

    // Try reading from database if available
    try {
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

      if (result.rows.length > 0) {
        const row = result.rows[0];
        return res.json({
          source: row.source_name,
          sourceUpdatedAt: row.source_updated_at,
          receivedAt: row.received_at,
          location: row.data.location,
          current: row.data.current,
          status: weatherFeed?.status ?? 'online',
          error: weatherFeed?.error ?? null,
        });
      }
    } catch {
      // Database not connected, fall through to in-memory live feed
    }

    // Direct in-memory live feed
    if (weatherFeed?.data?.current) {
      return res.json({
        source: weatherFeed.name,
        sourceUpdatedAt: weatherFeed.data.current.last_updated,
        receivedAt: new Date().toISOString(),
        location: weatherFeed.data.location,
        current: weatherFeed.data.current,
        status: weatherFeed.status ?? 'online',
        error: weatherFeed.error ?? null,
      });
    }

    return res.status(404).json({
      message: 'No weather data is available yet.',
      status: weatherFeed?.status ?? 'error',
      error: weatherFeed?.error ?? null,
    });
  } catch (error) {
    console.error('Unable to retrieve weather data:', error);
    return res.status(500).json({
      message: 'Unable to retrieve weather data.',
    });
  }
}
