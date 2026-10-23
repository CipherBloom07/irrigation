// Ask Open-Meteo only for current fields used by the dashboard. Keeping this
// request small makes the feed quicker and reduces unrelated failure points.
const OPEN_METEO_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=-17.820738&longitude=31.076626&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,surface_pressure,weather_code&hourly=precipitation_probability&timezone=Africa%2FHarare&wind_speed_unit=kmh&forecast_days=1';

const OPEN_METEO_BACKUP_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=-17.820738&longitude=31.076626&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,surface_pressure,weather_code&timezone=Africa%2FHarare&wind_speed_unit=kmh&forecast_days=1';

function weatherCodeToText(code) {
  if (code === 0) return 'Clear sky';
  if (code === 1 || code === 2) return 'Mainly clear / partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'Rain showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Clear to partly cloudy';
}

function getChanceOfRain(payload) {
  const times = payload.hourly?.time;
  const probabilities = payload.hourly?.precipitation_probability;
  if (!Array.isArray(times) || !Array.isArray(probabilities) || times.length === 0) return null;

  const currentTime = String(payload.current?.time || '');
  let index = times.indexOf(currentTime);
  if (index < 0) {
    const currentMs = Date.parse(currentTime);
    let closest = Infinity;
    if (Number.isFinite(currentMs)) {
      times.forEach((time, i) => {
        const delta = Math.abs(Date.parse(time) - currentMs);
        if (Number.isFinite(delta) && delta < closest) {
          closest = delta;
          index = i;
        }
      });
    }
  }

  const value = index >= 0 ? probabilities[index] : null;
  return value == null || !Number.isFinite(Number(value)) ? null : Number(value);
}

async function requestOpenMeteo(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Open-Meteo returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    const current = payload?.current;
    if (!current || !Number.isFinite(Number(current.temperature_2m))) {
      throw new Error('Open-Meteo response did not contain current weather data');
    }

    const receivedAt = new Date().toISOString();
    return {
      source: 'Open-Meteo (live forecast)',
      sourceUpdatedAt: current.time || receivedAt,
      receivedAt,
      location: {
        name: 'Harare & Central Agro-Ecological Basin',
        region: 'Zimbabwe',
        country: 'Zimbabwe',
        lat: payload.latitude ?? -17.820738,
        lon: payload.longitude ?? 31.076626,
        tz_id: payload.timezone || 'Africa/Harare',
      },
      current: {
        last_updated: current.time || receivedAt,
        temp_c: current.temperature_2m ?? null,
        condition: {
          text: weatherCodeToText(Number(current.weather_code)),
          code: current.weather_code ?? null,
        },
        wind_kph: current.wind_speed_10m ?? null,
        pressure_mb: current.surface_pressure ?? null,
        humidity: current.relative_humidity_2m ?? null,
        chance_of_rain: getChanceOfRain(payload),
        precip_mm: current.precipitation ?? null,
      },
      status: 'online',
      error: null,
    };
  } catch (error) {
    throw error.name === 'AbortError'
      ? new Error('Open-Meteo request timed out after 7 seconds')
      : error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOpenMeteo() {
  let primaryError;
  try {
    return await requestOpenMeteo(OPEN_METEO_URL);
  } catch (error) {
    primaryError = error;
    console.warn('Primary Open-Meteo request failed; retrying with a minimal current-conditions request:', error.message);
  }

  try {
    // Keep a second request that does not depend on the hourly forecast block.
    // The banner can still show current conditions when rain probability is unavailable.
    const weather = await requestOpenMeteo(OPEN_METEO_BACKUP_URL);
    weather.current.chance_of_rain = null;
    weather.source = 'Open-Meteo (live current conditions; forecast fallback)';
    return weather;
  } catch (backupError) {
    throw new Error(`Open-Meteo unavailable (primary: ${primaryError.message}; fallback: ${backupError.message})`);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  }

  try {
    const weather = await fetchOpenMeteo();
    return res.status(200).json(weather);
  } catch (error) {
    console.error('Open-Meteo Vercel endpoint failed:', error);
    return res.status(503).json({
      status: 'error',
      message: 'Live weather is temporarily unavailable. Please retry shortly.',
      error: error.message || 'Open-Meteo request failed',
    });
  }
}
