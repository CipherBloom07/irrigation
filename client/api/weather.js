const WEATHER_URL = new URL('https://api.open-meteo.com/v1/forecast');
WEATHER_URL.search = new URLSearchParams({
  latitude: '-17.8252',
  longitude: '31.0335',
  current: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,surface_pressure,weather_code',
  hourly: 'precipitation_probability',
  timezone: 'Africa/Harare',
}).toString();

function describeWeather(code) {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'Rain showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Weather conditions unavailable';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(WEATHER_URL, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Open-Meteo returned HTTP ${response.status}`);

    const payload = await response.json();
    const current = payload?.current;
    if (!current || !Number.isFinite(Number(current.temperature_2m))) {
      throw new Error('Open-Meteo response did not include current temperature');
    }

    const times = payload.hourly?.time || [];
    const probabilities = payload.hourly?.precipitation_probability || [];
    const targetTime = Date.parse(current.time || '');
    let nearest = -1;
    let nearestDelta = Infinity;
    times.forEach((time, index) => {
      const delta = Math.abs(Date.parse(time) - targetTime);
      if (Number.isFinite(delta) && delta < nearestDelta) {
        nearest = index;
        nearestDelta = delta;
      }
    });
    const probability = nearest >= 0 ? probabilities[nearest] : null;
    const receivedAt = new Date().toISOString();

    return res.status(200).json({
      source: 'Open-Meteo (live)',
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
        condition: {
          text: describeWeather(Number(current.weather_code)),
          code: current.weather_code ?? null,
        },
        wind_kph: current.wind_speed_10m ?? null,
        pressure_mb: current.surface_pressure ?? null,
        humidity: current.relative_humidity_2m ?? null,
        chance_of_rain: probability == null ? null : Number(probability),
        precip_mm: current.precipitation ?? null,
      },
      status: 'online',
      error: null,
    });
  } catch (error) {
    console.error('Weather API route failed:', error);
    return res.status(503).json({
      status: 'error',
      message: 'Live weather is temporarily unavailable. Please retry shortly.',
      error: error.name === 'AbortError' ? 'Open-Meteo request timed out' : (error.message || 'Weather request failed'),
    });
  } finally {
    clearTimeout(timeout);
  }
}
