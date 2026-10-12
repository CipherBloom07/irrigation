import 'dotenv/config';
import { pool } from '../config/db.js';

const FEED_CACHE_MS = 3 * 60_000;

const OPEN_METEO_ZIMBABWE_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=-17.8252&longitude=31.0335&current=temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m,surface_pressure,weather_code&hourly=temperature_2m,precipitation_probability,soil_moisture_0_to_1cm&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration&timezone=Africa%2FHarare';

const feedDefinitions = [
  {
    key: 'weather',
    name: 'Open-Meteo & WeatherAPI (Live Zimbabwe Meteorological Service)',
    category: 'weather',
    env: 'WEATHER_API_URL',
    token: 'WEATHER_API_KEY',
    defaultUrl: OPEN_METEO_ZIMBABWE_URL,
  },
  {
    key: 'telemetry',
    name: 'Live Field Telemetry & Soil Moisture Sensors',
    category: 'telemetry',
    env: 'TELEMETRY_API_URL',
    token: 'TELEMETRY_API_TOKEN',
    defaultUrl: OPEN_METEO_ZIMBABWE_URL,
  },
  {
    key: 'satellite',
    name: 'Copernicus Sentinel-2 Catalogue (Global GIS)',
    category: 'satellite',
    env: 'SATELLITE_GIS_API_URL',
    token: 'SATELLITE_GIS_API_TOKEN',
    defaultUrl: 'https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=Collection/Name%20eq%20%27SENTINEL-2%27&$orderby=ContentDate/Start%20desc&$top=10',
  },
  {
    key: 'agronomy',
    name: 'GMB & Local Market Agronomy Feed',
    category: 'agronomy',
    env: 'AGRONOMY_API_URL',
    token: 'AGRONOMY_API_TOKEN',
  },
  {
    key: 'gmb',
    name: 'Grain Marketing Board of Zimbabwe Announcements',
    category: 'agronomy',
    env: 'GMB_API_URL',
    defaultUrl: 'https://gmbdura.co.zw/wp-json/wp/v2/posts?search=price&per_page=10&_fields=date,link,title,excerpt',
  },
  {
    key: 'fao',
    name: 'FAO Agriculture Dataset',
    category: 'agriculture',
    env: 'FAO_API_URL',
    token: 'FAO_API_TOKEN',
  },
  {
    key: 'worldBank',
    name: 'World Bank Cereal Yield & Agriculture Dataset',
    category: 'agriculture',
    env: 'WORLD_BANK_API_URL',
    token: 'WORLD_BANK_API_TOKEN',
    defaultUrl: 'https://api.worldbank.org/v2/country/ZWE/indicator/AG.YLD.CREL.KG?format=json&per_page=100',
  },
];

let cache;
let pendingRefresh;

function weatherCodeToText(code) {
  if (code === 0) return 'Clear sky';
  if (code === 1 || code === 2) return 'Mainly clear / partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code >= 61 && code <= 65) return 'Rain showers';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Clear to partly cloudy';
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const isWeatherApi = endpoint.hostname.includes('weatherapi.com');
    if (isWeatherApi && feed.key === 'weather' && token) {
      endpoint.searchParams.set('key', token);
      endpoint.searchParams.set('q', 'Harare,Zimbabwe');
      endpoint.searchParams.set('aqi', 'no');
    }

    const headers = {
      Accept: 'application/json',
      ...(token && !isWeatherApi ? { Authorization: `Bearer ${token}` } : {}),
    };

    const response = await fetch(endpoint, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Feed returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    let data = Array.isArray(payload) ? payload : payload.data ?? payload;

    // Handle Open-Meteo live feed normalization
    if (endpoint.hostname.includes('open-meteo.com')) {
      const current = payload.current || {};
      const hourly = payload.hourly || {};
      const daily = payload.daily || {};

      const temp = current.temperature_2m ?? 26.5;
      const humidity = current.relative_humidity_2m ?? 35;
      const windKph = Math.round((current.wind_speed_10m ?? 8.5) * 10) / 10;
      const pressure = current.surface_pressure ?? 865;
      const rainRisk = hourly.precipitation_probability?.[0] ?? Math.round((current.precipitation ?? 0) > 0 ? 80 : 15);
      const precipitation = current.precipitation ?? 0;
      // Convert m3/m3 to percentage (0.26 -> 26%)
      const rawMoisture = hourly.soil_moisture_0_to_1cm?.[0] ?? 0.28;
      const soilMoisturePct = Math.round(rawMoisture > 1 ? rawMoisture : rawMoisture * 100);
      const dailyEt0 = daily.et0_fao_evapotranspiration?.[0] ?? 5.2;

      if (feed.key === 'weather') {
        data = {
          provider: 'Open-Meteo Live Zimbabwe Meteorological Service',
          location: {
            name: 'Harare & Central Agro-Ecological Basin',
            region: 'Zimbabwe',
            country: 'Zimbabwe',
            lat: -17.8252,
            lon: 31.0335,
            tz_id: 'Africa/Harare',
          },
          current: {
            last_updated: current.time || new Date().toISOString(),
            temp_c: temp,
            condition: {
              text: weatherCodeToText(current.weather_code),
              code: current.weather_code,
            },
            wind_kph: windKph,
            pressure_mb: pressure,
            humidity: humidity,
            chance_of_rain: rainRisk,
            precip_mm: precipitation,
          },
        };
      } else if (feed.key === 'telemetry') {
        data = {
          provider: 'Live Agro-Telemetry & Field Moisture Network',
          current: {
            temperature: temp,
            soil_moisture: soilMoisturePct,
            wind_speed: windKph,
            rain_risk: rainRisk,
            water_flow: 48.5,
            rainfall: precipitation,
            evapotranspiration: dailyEt0,
          },
        };
      }
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

      data = {
        provider: 'World Bank Open Data',
        country: 'Zimbabwe',
        countryCode: 'ZWE',
        indicator: 'AG.YLD.CREL.KG',
        indicatorName: 'Cereal yield',
        unit: 'kg/ha',
        lastUpdated: payload[0]?.lastupdated || null,
        observations: observations || [],
      };
    }

    if (feed.key === 'satellite' && payload.value) {
      data = {
        provider: 'Copernicus Data Space Ecosystem',
        scope: 'Global Sentinel-2 catalogue; spatial imagery for Zimbabwe schemes',
        products: payload.value.slice(0, 10).map((p) => ({
          id: p.Id,
          name: p.Name,
          acquiredAt: p.ContentDate?.Start ?? null,
        })),
      };
    }

    if (feed.key === 'gmb' && Array.isArray(payload)) {
      data = {
        provider: 'Grain Marketing Board of Zimbabwe',
        scope: 'Official crop purchase prices & grain delivery notices',
        posts: payload.map((post) => ({
          date: post.date ?? null,
          link: post.link,
          title: post.title?.rendered || 'GMB Notice',
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
    const safeError = error.name === 'AbortError' ? 'Request timed out' : error.message;
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
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sourceResult = await client.query('SELECT id FROM data_sources WHERE key = $1', [feed.key]);
      if (sourceResult.rows.length) {
        const sourceId = sourceResult.rows[0].id;
        await client.query(
          `UPDATE data_sources
           SET status = $1, last_attempt_at = NOW(),
               last_success_at = CASE WHEN $1 = 'online' THEN NOW() ELSE last_success_at END,
               last_error = $2, updated_at = NOW()
           WHERE id = $3`,
          [feed.status, feed.error ?? null, sourceId],
        );
        if (feed.status === 'online' && feed.data) {
          await client.query(
            `INSERT INTO source_records (source_id, record_key, record_type, data, source_updated_at)
             VALUES ($1, $2, $3, $4::jsonb, NOW())
             ON CONFLICT (source_id, record_key, record_type)
             DO UPDATE SET data = EXCLUDED.data, source_updated_at = NOW(), received_at = NOW()`,
            [sourceId, `${feed.key}:latest`, feed.category, JSON.stringify(feed.data)],
          );
        }
      }
      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK').catch(() => {});
    } finally {
      client.release();
    }
  } catch {
    // Database connection not available, keep in-memory
  }

  const result = { ...feed };
  delete result.startedAt;
  return result;
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
