import 'dotenv/config';
import { pool } from '../config/db.js';

const FEED_CACHE_MS = 5 * 60_000;

const feedDefinitions = [
  {
    key: 'weather',
    name: 'WeatherAPI current weather',
    category: 'weather',
    env: 'WEATHER_API_URL',
    token: 'WEATHER_API_KEY',
  },
  {
    key: 'telemetry',
    name: 'Irrigation telemetry sensors',
    category: 'telemetry',
    env: 'TELEMETRY_API_URL',
    token: 'TELEMETRY_API_TOKEN',
  },
  {
    key: 'satellite',
    name: 'Copernicus Sentinel-2 catalogue (global)',
    category: 'satellite',
    env: 'SATELLITE_GIS_API_URL',
    token: 'SATELLITE_GIS_API_TOKEN',
    defaultUrl: 'https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=Collection/Name%20eq%20%27SENTINEL-2%27&$orderby=ContentDate/Start%20desc&$top=10',
  },
  {
    key: 'agronomy',
    name: 'GMB & local market feed',
    category: 'agronomy',
    env: 'AGRONOMY_API_URL',
    token: 'AGRONOMY_API_TOKEN',
  },
  {
    key: 'gmb',
    name: 'GMB official announcements (not structured prices)',
    category: 'agronomy',
    env: 'GMB_API_URL',
    defaultUrl: 'https://gmbdura.co.zw/wp-json/wp/v2/posts?search=price&per_page=10&_fields=date,link,title,excerpt',
  },
  {
    key: 'fao',
    name: 'FAO agriculture dataset',
    category: 'agriculture',
    env: 'FAO_API_URL',
    token: 'FAO_API_TOKEN',
  },
  {
    key: 'worldBank',
    name: 'World Bank agriculture dataset',
    category: 'agriculture',
    env: 'WORLD_BANK_API_URL',
    token: 'WORLD_BANK_API_TOKEN',
    defaultUrl: 'https://api.worldbank.org/v2/country/ZWE/indicator/AG.YLD.CREL.KG?format=json&per_page=100',
  },
];

let cache;
let pendingRefresh;

function weatherSourceUpdatedAt(record) {
  const value = record.current?.last_updated;
  if (typeof value !== 'string') return null;

  const absolute = new Date(value);
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) && Number.isFinite(absolute.getTime())) {
    return absolute.toISOString();
  }

  const localTime = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  const timeZone = record.location?.tz_id;
  if (!localTime || typeof timeZone !== 'string') return null;

  const [, year, month, day, hour, minute, second = '0'] = localTime;
  const parts = [year, month, day, hour, minute, second].map(Number);
  const [yyyy, mm, dd, hh, minutes, ss] = parts;
  const localAsUtc = Date.UTC(yyyy, mm - 1, dd, hh, minutes, ss);
  const checkedDate = new Date(localAsUtc);
  if (
    checkedDate.getUTCFullYear() !== yyyy
    || checkedDate.getUTCMonth() !== mm - 1
    || checkedDate.getUTCDate() !== dd
    || checkedDate.getUTCHours() !== hh
    || checkedDate.getUTCMinutes() !== minutes
    || checkedDate.getUTCSeconds() !== ss
  ) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  let timestamp = localAsUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const zonedParts = Object.fromEntries(
      formatter.formatToParts(new Date(timestamp))
        .filter(({ type }) => type !== 'literal')
        .map(({ type, value: partValue }) => [type, Number(partValue)]),
    );
    const zonedAsUtc = Date.UTC(
      zonedParts.year,
      zonedParts.month - 1,
      zonedParts.day,
      zonedParts.hour,
      zonedParts.minute,
      zonedParts.second,
    );
    const adjustment = localAsUtc - zonedAsUtc;
    timestamp += adjustment;
    if (adjustment === 0) return new Date(timestamp).toISOString();
  }

  return null;
}

async function fetchFeed(feed) {
  const startedAt = new Date().toISOString();
  const url = process.env[feed.env] || feed.defaultUrl;
  const token = process.env[feed.token];

  if (!url) {
    return {
      key: feed.key,
      name: feed.name,
      category: feed.category,
      status: 'not_configured',
      startedAt,
      error: 'Feed is not configured',
      data: null,
    };
  }

  let endpoint;

  try {
    endpoint = new URL(url);
  } catch {
    return {
      key: feed.key,
      name: feed.name,
      category: feed.category,
      status: 'error',
      startedAt,
      error: 'Feed URL is invalid',
      data: null,
    };
  }

  if (endpoint.protocol !== 'https:') {
    return {
      key: feed.key,
      name: feed.name,
      category: feed.category,
      status: 'error',
      startedAt,
      error: 'Feed URL must use HTTPS',
      data: null,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    if (feed.key === 'weather') {
      endpoint.searchParams.set('key', token ?? '');
      endpoint.searchParams.set('q', 'Bulawayo,Zimbabwe');
      endpoint.searchParams.set('aqi', 'no');
    }

    const headers = {
      Accept: 'application/json',
      ...(feed.key !== 'weather' && token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const response = await fetch(endpoint, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Feed returned HTTP ${response.status}`);
    }

    const payload = await response.json();

    if (!payload || typeof payload !== 'object') {
      throw new Error('Feed response must be JSON');
    }

    let data = Array.isArray(payload) ? payload : payload.data ?? payload;

    if (
      feed.key === 'weather'
      && (!data?.location || typeof data.location !== 'object'
        || !data?.current || typeof data.current !== 'object')
    ) {
      throw new Error('Weather response did not include location and current conditions');
    }

    if (feed.key === 'worldBank' && !process.env[feed.env]) {
      const rows = Array.isArray(payload) && Array.isArray(payload[1]) ? payload[1] : null;
      const observations = rows
        ?.filter((row) => row?.countryiso3code === 'ZWE'
          && row?.indicator?.id === 'AG.YLD.CREL.KG'
          && /^\d{4}$/.test(String(row.date))
          && row.value !== null
          && row.value !== undefined
          && Number.isFinite(Number(row.value)))
        .map((row) => ({
          year: Number(row.date),
          value: Number(row.value),
          unit: 'kg/ha',
        }))
        .sort((left, right) => right.year - left.year);

      if (!observations?.length) {
        throw new Error('World Bank response contained no valid Zimbabwe cereal-yield observations');
      }

      data = {
        provider: 'World Bank Open Data',
        country: 'Zimbabwe',
        countryCode: 'ZWE',
        indicator: 'AG.YLD.CREL.KG',
        indicatorName: 'Cereal yield',
        unit: 'kg/ha',
        lastUpdated: /^\d{4}-\d{2}-\d{2}$/.test(String(payload[0]?.lastupdated))
          ? payload[0].lastupdated
          : null,
        observations,
      };
    }

    if (feed.key === 'satellite') {
      const products = payload.value;
      if (!Array.isArray(products)) {
        throw new Error('Copernicus response did not include a product catalogue');
      }
      data = {
        provider: 'Copernicus Data Space Ecosystem',
        scope: 'Global Sentinel-2 catalogue; not filtered to irrigation schemes',
        products: products
          .filter((product) => product && typeof product.Id === 'string' && typeof product.Name === 'string')
          .map((product) => ({
            id: product.Id,
            name: product.Name,
            acquiredAt: product.ContentDate?.Start ?? null,
            footprint: product.GeoFootprint ?? null,
          })),
      };
    }

    if (feed.key === 'gmb') {
      if (!Array.isArray(payload)) {
        throw new Error('GMB response did not include an announcements list');
      }
      data = {
        provider: 'Grain Marketing Board of Zimbabwe',
        scope: 'Official announcements; article prices may be published as images',
        posts: payload
          .filter((post) => post && typeof post.link === 'string' && post.title?.rendered)
          .map((post) => ({
            date: post.date ?? null,
            link: post.link,
            title: post.title.rendered,
            excerpt: String(post.excerpt?.rendered ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
          })),
      };
    }

    return {
      key: feed.key,
      name: feed.name,
      category: feed.category,
      status: 'online',
      startedAt,
      data,
    };
  } catch (error) {
    const safeError =
      error.name === 'AbortError'
        ? 'Request timed out'
        : error instanceof TypeError
          ? 'Network request failed'
          : error.message;

    console.error(`Unable to sync ${feed.name}: ${safeError}`);

    return {
      key: feed.key,
      name: feed.name,
      category: feed.category,
      status: 'error',
      startedAt,
      error: safeError,
      data: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function persistFeed(feed) {
  const client = await pool.connect();
  const records = feed.status === 'online' && feed.data ? [feed.data] : [];
  let sourceId;
  let recordsSaved = 0;

  try {
    await client.query('BEGIN');

    const sourceResult = await client.query(
      `SELECT id
       FROM data_sources
       WHERE key = $1`,
      [feed.key],
    );
    if (sourceResult.rows.length === 0) {
      throw new Error(`No data source is registered for ${feed.key}`);
    }

    sourceId = sourceResult.rows[0].id;
    await client.query(
      `UPDATE data_sources
       SET status = $1,
           last_attempt_at = NOW(),
           last_success_at = CASE
             WHEN $1 = 'online' THEN NOW()
             ELSE last_success_at
           END,
           last_error = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [feed.status, feed.error ?? null, sourceId],
    );

    const syncRunResult = await client.query(
      `INSERT INTO sync_runs
        (source_id, started_at, status, records_received, error)
       VALUES
        ($1, $2, 'running', $3, $4)
       RETURNING id`,
      [sourceId, feed.startedAt, records.length, feed.error ?? null],
    );
    const syncRunId = syncRunResult.rows[0].id;

    for (const record of records) {
      const recordKey =
        feed.key === 'weather'
          ? `${record.location?.name ?? 'unknown'}:${record.location?.country ?? 'unknown'}`
          : feed.key === 'worldBank' && feed.data.countryCode && feed.data.indicator
            ? `${feed.data.countryCode}:${feed.data.indicator}`
          : feed.key === 'satellite'
            ? 'copernicus:sentinel-2:latest-catalogue'
          : feed.key === 'gmb'
            ? 'gmb:official-price-announcements'
          : `${feed.key}:${Date.now()}`;

      const sourceUpdatedAt =
        feed.key === 'weather'
          ? weatherSourceUpdatedAt(record)
          : feed.key === 'worldBank' && /^\d{4}-\d{2}-\d{2}$/.test(String(record.lastUpdated))
            ? new Date(`${record.lastUpdated}T00:00:00Z`).toISOString()
          : null;

      const normalizedData =
        feed.key === 'weather'
          ? {
              provider: 'WeatherAPI',
              location: record.location ?? null,
              current: record.current ?? null,
            }
          : record;

      await client.query(
        `INSERT INTO source_records
          (source_id, record_key, record_type, data, source_updated_at)
         VALUES
          ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT (source_id, record_key, record_type)
         DO UPDATE SET
           data = EXCLUDED.data,
           source_updated_at = EXCLUDED.source_updated_at,
           received_at = NOW()`,
        [
          sourceId,
          recordKey,
          feed.category,
          JSON.stringify(normalizedData),
          sourceUpdatedAt,
        ],
      );
      recordsSaved += 1;
    }

    await client.query(
      `UPDATE sync_runs
       SET completed_at = NOW(),
           status = $1,
           records_saved = $2,
           error = $3
       WHERE id = $4`,
      [
        feed.status === 'online' ? 'success' : 'failed',
        recordsSaved,
        feed.error ?? null,
        syncRunId,
      ],
    );
    await client.query('COMMIT');

    console.info(
      `External feed sync completed: ${feed.key} status=${feed.status} received=${records.length} saved=${recordsSaved}`,
    );
    const persistedFeed = { ...feed };
    delete persistedFeed.startedAt;
    return persistedFeed;
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError) => {
      console.error(`Unable to roll back ${feed.key} sync transaction:`, rollbackError.message);
    });

    const message = `Persistence failed: ${error.message}`;
    if (sourceId !== undefined) {
      await pool.query(
        `UPDATE data_sources
         SET status = 'error',
             last_attempt_at = NOW(),
             last_error = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [message, sourceId],
      );
      await pool.query(
        `INSERT INTO sync_runs
          (source_id, started_at, completed_at, status,
           records_received, records_saved, error)
         VALUES
          ($1, $2, NOW(), 'failed', $3, 0, $4)`,
        [sourceId, feed.startedAt, records.length, message],
      );
    }

    console.error(`Unable to persist ${feed.key} feed sync: ${error.message}`);
    const failedFeed = { ...feed, status: 'error', error: message };
    delete failedFeed.startedAt;
    return failedFeed;
  } finally {
    client.release();
  }
}

export async function refreshExternalFeeds({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.syncedAt < FEED_CACHE_MS) {
    return cache;
  }

  if (pendingRefresh) {
    return pendingRefresh;
  }

  pendingRefresh = Promise.all(feedDefinitions.map(fetchFeed))
    .then(async (fetchedFeeds) => {
      const feeds = [];
      for (const feed of fetchedFeeds) {
        feeds.push(await persistFeed(feed));
      }

      const syncedAt = new Date().toISOString();

      cache = {
        syncedAt: Date.now(),
        lastSyncedAt: syncedAt,
        feeds: Object.fromEntries(feeds.map((feed) => [feed.key, feed])),
      };

      return cache;
    })
    .finally(() => {
      pendingRefresh = null;
    });

  return pendingRefresh;
}

export function findFeedRecord(feed, scheme) {
  if (!feed?.data) return null;

  const records = Array.isArray(feed.data) ? feed.data : feed.data.schemes;
  if (!Array.isArray(records)) return null;

  if (!records.every((record) => record && typeof record === 'object' && !Array.isArray(record))) {
    return null;
  }

  const code = String(scheme.code ?? '');
  const id = String(scheme.id ?? '');
  const name = String(scheme.name ?? '').trim().toLowerCase();

  return (
    records.find(
      (record) =>
        (code && String(record.code ?? '') === code) ||
        (id && String(record.id ?? '') === id) ||
        (name && String(record.name ?? '').trim().toLowerCase() === name),
    ) ?? null
  );
}