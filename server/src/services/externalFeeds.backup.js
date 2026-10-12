import 'dotenv/config';
const FEED_CACHE_MS = 60_000;

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
    name: 'Satellite GIS feed',
    category: 'satellite',
    env: 'SATELLITE_GIS_API_URL',
    token: 'SATELLITE_GIS_API_TOKEN',
  },

  {
    key: 'agronomy',
    name: 'GMB & local market feed',
    category: 'agronomy',
    env: 'AGRONOMY_API_URL',
    token: 'AGRONOMY_API_TOKEN',
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
  },
];

let cache;
let pendingRefresh;

async function fetchFeed(feed) {
  const url = process.env[feed.env];

  if (!url) {
    return {
      key: feed.key,
      name: feed.name,
      category: feed.category,
      status: 'not_configured',
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
      error: 'Feed URL must use HTTPS',
      data: null,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    if (feed.key === 'weather') {
      endpoint.searchParams.set('key', process.env[feed.token] ?? '');
      endpoint.searchParams.set('q', 'Bulawayo,Zimbabwe');
      endpoint.searchParams.set('aqi', 'no');
    }

    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',

        ...(feed.key !== 'weather' && process.env[feed.token]
          ? {
              Authorization: `Bearer ${process.env[feed.token]}`,
            }
          : {}),
      },

      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Feed returned HTTP ${response.status}`);
    }

    const payload = await response.json();

    if (!payload || typeof payload !== 'object') {
      throw new Error('Feed response must be JSON');
    }

    return {
      key: feed.key,
      name: feed.name,
      category: feed.category,
      status: 'online',
      data: Array.isArray(payload)
        ? payload
        : payload.data ?? payload,
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
      error: safeError,
      data: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function refreshExternalFeeds({ force = false } = {}) {
  if (
    !force &&
    cache &&
    Date.now() - cache.syncedAt < FEED_CACHE_MS
  ) {
    return cache;
  }

  if (pendingRefresh) {
    return pendingRefresh;
  }

  pendingRefresh = Promise.all(
    feedDefinitions.map(fetchFeed)
  )
    .then((feeds) => {
      cache = {
        syncedAt: Date.now(),
        lastSyncedAt: new Date().toISOString(),
        feeds: Object.fromEntries(
          feeds.map((feed) => [feed.key, feed])
        ),
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

  const records = Array.isArray(feed.data)
    ? feed.data
    : feed.data.schemes;

  if (!Array.isArray(records)) return null;

  if (
    !records.every(
      (record) =>
        record &&
        typeof record === 'object' &&
        !Array.isArray(record)
    )
  ) {
    return null;
  }

  const code = String(scheme.code ?? '');
  const id = String(scheme.id ?? '');
  const name = String(scheme.name ?? '')
    .trim()
    .toLowerCase();

  return (
    records.find(
      (record) =>
        (code && String(record.code ?? '') === code) ||
        (id && String(record.id ?? '') === id) ||
        (name &&
          String(record.name ?? '')
            .trim()
            .toLowerCase() === name)
    ) ?? null
  );
}