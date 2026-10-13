import { refreshExternalFeeds } from '../services/externalFeeds.js';

const baseline = {
  temperature: 25.8,
  soil_moisture: 66,
  wind_speed: 13.2,
  rain_risk: 10,
  water_flow: 46.1,
  rainfall: 1.2,
  evapotranspiration: 4.8,
  monthly_rainfall: [170, 155, 132, 94, 52, 28, 25, 32, 55, 90, 128, 158],
  monthly_evapotranspiration: [45, 57, 72, 91, 108, 124, 138, 145, 142, 125, 96, 65],
  status: 'BASELINE',
  data_source: 'Water Survey Baseline 2026',
};

function valuesFrom(feed) {
  if (!feed?.data) return {};
  const data = feed.data;
  const values = data.current ?? data.observations ?? data.telemetry ?? data.weather ?? data;
  return values && typeof values === 'object' && !Array.isArray(values) ? values : {};
}

function numericValue(data, minimum, maximum, ...keys) {
  for (const key of keys) {
    if (data[key] === null || data[key] === undefined || data[key] === '' || typeof data[key] === 'boolean') continue;
    const value = Number(data[key]);
    if (Number.isFinite(value) && value >= minimum && value <= maximum) return value;
  }
  return undefined;
}

function monthlyValues(value) {
  if (!Array.isArray(value) || value.length !== 12) return undefined;
  const values = value.map((item) => {
    if (item === null || item === undefined || item === '' || typeof item === 'boolean') return NaN;
    return Number(item);
  });
  return values.every((item) => Number.isFinite(item) && item >= 0 && item <= 5000)
    ? values
    : undefined;
}

export const getTelemetry = async (req, res) => {
  const refreshed = await refreshExternalFeeds({ force: req.query.refresh === '1' });
  const sensorValues = valuesFrom(refreshed.feeds.telemetry);
  const weatherValues = valuesFrom(refreshed.feeds.weather);
  const temperature = numericValue(weatherValues, -90, 60, 'temperature', 'temperature_c', 'temp_c');
  const soilMoisture = numericValue(sensorValues, 0, 100, 'soil_moisture', 'soilMoisture');
  const sensorWind = numericValue(sensorValues, 0, 200, 'wind_speed', 'windSpeed');
  const weatherWind = numericValue(weatherValues, 0, 200, 'wind_speed', 'windSpeed', 'wind_kph');
  const rainRisk = numericValue(weatherValues, 0, 100, 'rain_risk', 'rain_probability', 'chance_of_rain');
  const waterFlow = numericValue(sensorValues, 0, 1_000_000, 'water_flow', 'flow_rate');
  const rainfall = numericValue(weatherValues, 0, 5000, 'rainfall', 'rainfall_mm', 'precip_mm');
  const evapotranspiration = numericValue(weatherValues, 0, 100, 'evapotranspiration', 'et0', 'evapotranspiration_mm');
  const validSensorFields = [soilMoisture, sensorWind, waterFlow].filter((value) => value !== undefined);
  const validWeatherFields = [temperature, weatherWind, rainRisk, rainfall, evapotranspiration].filter((value) => value !== undefined);
  const validLiveFields = validSensorFields.length + validWeatherFields.length;
  const liveMonthlyRainfall = monthlyValues(weatherValues.monthly_rainfall);
  const liveMonthlyEvapotranspiration = monthlyValues(weatherValues.monthly_evapotranspiration);
  const liveMonthlyIrrigationDemand =
    monthlyValues(sensorValues.monthly_irrigation_demand)
    ?? monthlyValues(weatherValues.monthly_irrigation_demand);
  const hasLiveMonthlyData = Boolean(
    liveMonthlyRainfall || liveMonthlyEvapotranspiration || liveMonthlyIrrigationDemand,
  );
  const feedsForTelemetry = [
    { feed: refreshed.feeds.telemetry, validCount: validSensorFields.length, expectedCount: 3 },
    { feed: refreshed.feeds.weather, validCount: validWeatherFields.length, expectedCount: 5 },
  ];
  const telemetryFeeds = new Set(feedsForTelemetry.filter(({ validCount }) => validCount > 0).map(({ feed }) => feed?.key));
  const sources = Object.values(refreshed.feeds).map(({ data, ...feed }) => {
    const telemetryFeed = feedsForTelemetry.find(({ feed: candidate }) => candidate?.key === feed.key);
    if (feed.key === 'satellite') {
      return {
        ...feed,
        scope: data?.scope ?? null,
        latestProduct: data?.products?.[0] ?? null,
      };
    }
    if (feed.key === 'gmb') {
      return {
        ...feed,
        scope: data?.scope ?? null,
        announcementCount: data?.posts?.length ?? 0,
      };
    }
    if (!telemetryFeed || feed.status !== 'online') return feed;
    if (telemetryFeed.validCount === 0) {
      return { ...feed, status: 'error', error: 'No supported valid measurements; baseline readings are used.' };
    }
    if (telemetryFeed.validCount < telemetryFeed.expectedCount) {
      return { ...feed, status: 'partial', error: 'Some readings are missing or invalid; baseline values fill those fields.' };
    }
    return feed;
  });
  const merged = {
    ...baseline,
    temperature: temperature ?? baseline.temperature,
    soil_moisture: soilMoisture ?? baseline.soil_moisture,
    wind_speed: weatherWind ?? sensorWind ?? baseline.wind_speed,
    rain_risk: rainRisk ?? baseline.rain_risk,
    water_flow: waterFlow ?? baseline.water_flow,
    rainfall: rainfall ?? baseline.rainfall,
    evapotranspiration: evapotranspiration ?? baseline.evapotranspiration,
    monthly_rainfall: liveMonthlyRainfall ?? baseline.monthly_rainfall,
    monthly_evapotranspiration: liveMonthlyEvapotranspiration ?? baseline.monthly_evapotranspiration,
    monthly_irrigation_demand: liveMonthlyIrrigationDemand,
    monthly_data_mode: hasLiveMonthlyData ? 'live' : 'baseline',
    agriculture_context: refreshed.feeds.worldBank?.data?.provider === 'World Bank Open Data'
      ? refreshed.feeds.worldBank.data
      : null,
    gmb_announcements: refreshed.feeds.gmb?.data?.posts ?? [],
    sources,
    mode: validSensorFields.length ? 'live' : 'baseline',
    status: validSensorFields.length
      ? (validSensorFields.length === 3 ? 'ONLINE' : 'PARTIAL')
      : 'BASELINE',
    data_source: validSensorFields.length
      ? feedsForTelemetry.filter(({ feed }) => feed?.key === 'telemetry' && telemetryFeeds.has(feed?.key)).map(({ feed }) => feed.name).join(', ')
      : baseline.data_source,
    last_synced_at: refreshed.lastSyncedAt,
  };

  const effectiveRainfall = merged.rainfall * 0.75;
  merged.demand_forecast = Math.max(0, merged.evapotranspiration - effectiveRainfall);
  merged.irrigation_demand = merged.demand_forecast;
  merged.forecast_method = 'ET₀ minus 75% effective rainfall; planning estimate, not an allocation instruction';
  const providedSecurityIndex = numericValue(sensorValues, 0, 100, 'water_security_pct');
  if (providedSecurityIndex !== undefined) {
    merged.water_security_pct = Math.max(0, Math.min(100, providedSecurityIndex));
  }
  res.json(merged);
};
