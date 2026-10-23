const API_BASE = '/api';
let adminCsrfToken = null;

export const DASHBOARD_REFRESH_MS = 60 * 1000;

const refreshQuery = (force) => force ? '?refresh=1' : '';

export async function fetchSchemes({ signal, force = false } = {}) {
  const res = await fetch(
    `${API_BASE}/schemes${refreshQuery(force)}`,
    { cache: 'no-store', signal }
  );
  if (!res.ok) throw new Error('Failed to fetch scheme data');
  return res.json();
}

export async function createScheme(schemeData, { signal } = {}) {
  return mutateScheme(`${API_BASE}/schemes`, 'POST', schemeData, signal);
}
export async function updateScheme(id, schemeData, { signal } = {}) {
  return mutateScheme(`${API_BASE}/schemes/${encodeURIComponent(id)}`, 'PUT', schemeData, signal);
}
export async function deleteScheme(id, { signal } = {}) {
  const res = await fetch(`${API_BASE}/schemes/${encodeURIComponent(id)}`, {
    method: 'DELETE', credentials: 'same-origin',
    headers: { 'X-CSRF-Token': adminCsrfToken || '' }, signal,
  });
  if (!res.ok) throw await responseError(res, 'Failed to delete scheme');
}
async function mutateScheme(url, method, data, signal) {
  const res = await fetch(url, {
    method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': adminCsrfToken || '' },
    body: JSON.stringify(data), signal,
  });
  if (!res.ok) throw await responseError(res, 'Scheme change failed');
  return res.json();
}
async function responseError(res, fallback) {
  const contentType = res.headers.get('content-type') || '';
  const rawBody = await res.text().catch(() => '');
  let payload = {};
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      // Avoid displaying HTML or server internals in the UI.
    }
  }

  if (typeof payload.error === 'string' && payload.error.trim()) {
    return new Error(payload.error);
  }
  if (typeof payload.message === 'string' && payload.message.trim()) {
    return new Error(payload.message);
  }

  if (!contentType.includes('application/json')) {
    const responseKind = contentType.includes('text/html')
      ? 'The server returned an HTML page instead of an API response'
      : 'The server returned an unexpected response format';
    return new Error(`${responseKind} (HTTP ${res.status}). This usually indicates an API routing or deployment issue; refresh the page and try again.`);
  }

  return new Error(`${fallback} (HTTP ${res.status}).`);
}
export async function fetchAdminStatus({ signal } = {}) {
  const res = await fetch(`${API_BASE}/admin/status`, { cache: 'no-store', credentials: 'same-origin', signal });
  if (!res.ok) throw await responseError(res, 'Failed to read administrator status');
  const status = await res.json();
  adminCsrfToken = status.csrfToken || null;
  return status;
}
export async function loginAdmin(credentials, { signal } = {}) {
  return authenticateAdmin('/login', credentials, signal);
}
export async function setupAdmin(credentials, { signal } = {}) {
  return authenticateAdmin('/setup', credentials, signal);
}
async function authenticateAdmin(path, credentials, signal) {
  const res = await fetch(`${API_BASE}/admin${path}`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials), signal,
  });
  if (!res.ok) throw await responseError(res, 'Administrator authentication failed');
  const result = await res.json();
  adminCsrfToken = result.csrfToken;
  return result;
}
export async function requestAdminPasswordReset(email, { signal } = {}) {
  const res = await fetch(`${API_BASE}/admin/forgot-password`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }), signal,
  });
  if (!res.ok) throw await responseError(res, 'Unable to request a password reset');
  return res.json();
}
export async function resetAdminPassword(token, password, { signal } = {}) {
  const res = await fetch(`${API_BASE}/admin/reset-password`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }), signal,
  });
  if (!res.ok) throw await responseError(res, 'Unable to reset administrator password');
  return res.json();
}
export async function logoutAdmin({ signal } = {}) {
  const res = await fetch(`${API_BASE}/admin/logout`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'X-CSRF-Token': adminCsrfToken || '' }, signal,
  });
  if (!res.ok) throw await responseError(res, 'Administrator sign-out failed');
  adminCsrfToken = null;
}
export async function fetchTelemetry({ signal, force = false } = {}) {
  const res = await fetch(`${API_BASE}/telemetry${refreshQuery(force)}`, { cache: 'no-store', signal });
  if (!res.ok) throw new Error('Failed to fetch telemetry');
  return res.json();
}

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast?latitude=-17.820738&longitude=31.076626&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,surface_pressure,weather_code&hourly=precipitation_probability&timezone=Africa%2FHarare';

function weatherCodeToText(code) {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'Rain showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Weather conditions';
}

async function fetchBrowserWeather(signal) {
  const response = await fetch(OPEN_METEO_URL, { cache: 'no-store', headers: { Accept: 'application/json' }, signal });
  if (!response.ok) throw new Error(`Open-Meteo returned HTTP ${response.status}`);
  const payload = await response.json();
  const current = payload?.current;
  if (!current || !Number.isFinite(Number(current.temperature_2m))) {
    throw new Error('Open-Meteo returned an invalid current-weather response');
  }
  const times = payload.hourly?.time || [];
  const probabilities = payload.hourly?.precipitation_probability || [];
  let rainChance = null;
  if (times.length && probabilities.length) {
    const target = Date.parse(current.time);
    let closestIndex = -1;
    let closestDelta = Infinity;
    times.forEach((time, index) => {
      const delta = Math.abs(Date.parse(time) - target);
      if (Number.isFinite(delta) && delta < closestDelta) {
        closestDelta = delta;
        closestIndex = index;
      }
    });
    if (closestIndex >= 0 && probabilities[closestIndex] != null) rainChance = Number(probabilities[closestIndex]);
  }
  const receivedAt = new Date().toISOString();
  return {
    source: 'Open-Meteo live (browser fallback)',
    sourceUpdatedAt: current.time || receivedAt,
    receivedAt,
    location: {
      name: 'Harare & Central Agro-Ecological Basin',
      region: 'Zimbabwe',
      country: 'Zimbabwe',
      lat: payload.latitude ?? -17.8252,
      lon: payload.longitude ?? 31.0335,
      tz_id: payload.timezone || 'Africa/Harare',
    },
    current: {
      last_updated: current.time || receivedAt,
      temp_c: current.temperature_2m ?? null,
      condition: { text: weatherCodeToText(Number(current.weather_code)), code: current.weather_code ?? null },
      wind_kph: current.wind_speed_10m ?? null,
      pressure_mb: current.surface_pressure ?? null,
      humidity: current.relative_humidity_2m ?? null,
      chance_of_rain: Number.isFinite(rainChance) ? rainChance : null,
      precip_mm: current.precipitation ?? null,
    },
    status: 'online',
    error: null,
  };
}

export async function fetchWeather({ signal, force = false } = {}) {
  // The deployed Vercel project builds the client as a static Vite site; it does
  // not run the Express server automatically. Fetch Open-Meteo directly in
  // production so a missing /api/weather rewrite cannot take the weather panel offline.
  if (import.meta.env.PROD) {
    return fetchBrowserWeather(signal);
  }

  let apiError;
  try {
    const res = await fetch(`${API_BASE}/weather${refreshQuery(force)}`, {
      cache: 'no-store',
      signal,
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      const error = new Error(payload.message || `Weather endpoint failed (HTTP ${res.status})`);
      error.feedStatus = payload.status || 'error';
      throw error;
    }
    const weather = await res.json();
    if (weather?.current && Number.isFinite(Number(weather.current.temp_c))) return weather;
    apiError = new Error('Weather endpoint returned incomplete data');
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    apiError = error;
  }

  // Local development can still use the Express API, with a browser fallback.
  try {
    return await fetchBrowserWeather(signal);
  } catch (fallbackError) {
    console.error('Both server and browser weather requests failed:', { apiError, fallbackError });
    fallbackError.feedStatus = apiError?.feedStatus || 'error';
    throw fallbackError;
  }
}