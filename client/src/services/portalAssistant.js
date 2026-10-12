const pageDescriptions = [
  ['Executive Dashboard', 'national scheme KPIs, live weather, map overview, and operational summaries'],
  ['GIS Spatial Telemetry Map', 'the scheme map and available geographic records'],
  ['Water & Telemetry', 'water measurements, field sensor status, and historical context'],
  ['Agronomic & Crops', 'scheme crops, market information, and national agriculture context'],
  ['Infrastructure & O&M', 'irrigation assets and maintenance condition records'],
  ['Sustainability & Risks', 'scheme risk factors and operational risk summaries'],
  ['Scheme Data Registry', 'searchable scheme records and administrator CRUD controls'],
  ['Assessment Reports', 'expandable scheme assessments and printable reports'],
];

const formatNumber = (value) => Number(value || 0).toLocaleString();
const asText = (value) => (value === null || value === undefined || value === '' ? 'Not recorded' : String(value));

function describeScheme(scheme) {
  const risks = Array.isArray(scheme.risk_factors) && scheme.risk_factors.length
    ? scheme.risk_factors.map((risk) => typeof risk === 'string' ? risk : risk.label || risk.name).filter(Boolean).join('; ')
    : 'No recorded risk factors';
  return [
    `${scheme.name}${scheme.code ? ` (${scheme.code})` : ''}`,
    `Location: ${asText(scheme.district)}, ${asText(scheme.province)}${scheme.ward ? `, Ward ${scheme.ward}` : ''}.`,
    `Status: ${asText(scheme.status)}.`,
    `Equipped area: ${asText(scheme.equipped_area)} ha; functional area: ${asText(scheme.functional_area)} ha; beneficiaries: ${asText(scheme.beneficiaries)}.`,
    `Water source: ${asText(scheme.source)}. Crops: ${asText(scheme.crop)}. Market: ${asText(scheme.market)}.`,
    `Recorded risks: ${risks}.`,
  ].join(' ');
}

function matchSchemes(question, schemes) {
  const normalized = question.toLocaleLowerCase();
  const exactMatches = schemes.filter((scheme) =>
    [scheme.name, scheme.code].some((value) => value && normalized.includes(String(value).toLocaleLowerCase()))
  );
  if (exactMatches.length) return exactMatches;

  const terms = normalized.match(/[\p{L}\p{N}-]{3,}/gu) || [];
  const ignored = new Set(['what', 'where', 'when', 'which', 'does', 'about', 'show', 'tell', 'give', 'have', 'with', 'from', 'this', 'that', 'scheme', 'schemes', 'irrigation', 'please', 'current', 'status', 'list', 'all', 'names', 'of', 'the']);
  const usefulTerms = [...new Set(terms.filter((term) => !ignored.has(term)))];
  if (!usefulTerms.length) return [];

  return schemes
    .map((scheme) => {
      const searchable = [scheme.name, scheme.code, scheme.district, scheme.province, scheme.officer]
        .filter(Boolean).join(' ').toLocaleLowerCase();
      return { scheme, score: usefulTerms.reduce((score, term) => score + (searchable.includes(term) ? 1 : 0), 0) };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ scheme }) => scheme);
}

export function answerPortalQuestion(question, {
  schemes = [],
  telemetry = {},
  weather = null,
  admin = null,
  currentPage = '',
} = {}) {
  const query = question.trim().toLocaleLowerCase();
  if (!query) return 'Enter a question about the irrigation portal.';

  if (/\b(list|all|names of)\b/.test(query) && /\b(scheme|schemes|registry)\b/.test(query)) {
    return schemes.length
      ? `Schemes in the current registry:\n${schemes.map((scheme) => `${scheme.name} — ${asText(scheme.district)}, ${asText(scheme.province)} — ${asText(scheme.status)}`).join('\n')}`
      : 'The scheme registry is empty or has not loaded yet.';
  }

  if (/\b(how many|count|number of)\b/.test(query) && /\b(functional|rehabilitation|non-functional|partially)\b/.test(query)) {
    const selected = schemes.filter((scheme) => {
      const status = String(scheme.status || '').toLocaleLowerCase();
      if (/\bfully functional\b/.test(query)) return status.includes('fully functional');
      if (/\bnon-functional\b/.test(query)) return status.includes('non-functional');
      if (/\brehabilitation\b/.test(query)) return status.includes('rehabilitation');
      if (/\bpartially\b/.test(query)) return status.includes('partial');
      return status.includes('functional');
    });
    return `${selected.length} of ${schemes.length} schemes currently match that status in the registry.${selected.length ? ` ${selected.map((scheme) => scheme.name).join(', ')}.` : ''}`;
  }

  if (/\b(water source|source of water|water sources)\b/.test(query)) {
    return schemes.length
      ? `Recorded water sources: ${schemes.map((scheme) => `${scheme.name}: ${asText(scheme.source)}`).join('; ')}`
      : 'No scheme water-source records are currently available.';
  }

  const matchingSchemes = matchSchemes(query, schemes);
  if (matchingSchemes.length) {
    return matchingSchemes.map(describeScheme).join('\n\n');
  }

  if (/\b(weather|temperature|forecast|rain|rainfall|humidity|wind|pressure|sunny|condition)\b/.test(query)) {
    if (!weather?.current) return 'Weather data is not available in the portal right now. Check the dashboard refresh and the WeatherAPI source status.';
    const current = weather.current;
    const place = weather.location?.name || weather.location || 'the configured weather location';
    const updated = current.last_updated || weather.sourceUpdatedAt || 'update time not supplied';
    return `${place}: ${asText(current.condition?.text)}, ${asText(current.temp_c)}°C. Humidity ${asText(current.humidity)}%; wind ${asText(current.wind_kph)} km/h; pressure ${asText(current.pressure_mb)} mb; chance of rain ${asText(current.chance_of_rain)}%. Weather provider: ${asText(weather.source)}. Provider update: ${updated}.`;
  }

  if (/\b(telemetry|soil|moisture|flow|sensor|water reading|field reading)\b/.test(query)) {
    const sources = Array.isArray(telemetry.sources) ? telemetry.sources : [];
    const sensorFeed = sources.find((source) => /telemetry|sensor/i.test(source.name || ''));
    const liveSensor = sensorFeed?.status === 'online';
    const readings = [
      `Soil moisture: ${asText(telemetry.soil_moisture)}`,
      `Water flow: ${asText(telemetry.water_flow)}`,
      `Temperature: ${asText(telemetry.temperature)}`,
      `Rainfall: ${asText(telemetry.rainfall)}`,
    ].join('; ');
    return `Telemetry status: ${asText(telemetry.status || 'BASELINE')}. ${readings}. ${liveSensor ? 'The configured sensor feed reports online readings.' : 'Field sensor values are not confirmed live and must be treated as survey baseline/context, not current field measurements.'}`;
  }

  if (/\b(feed|feeds|source|sources|sync|synchroni[sz]e|online|offline|live data|data status)\b/.test(query)) {
    const sources = Array.isArray(telemetry.sources) ? telemetry.sources : [];
    if (!sources.length) return 'The portal has not supplied source-status details yet. Check the dashboard after its next successful sync.';
    return `Feed status: ${sources.map((source) => `${asText(source.name)} — ${String(source.status || 'unknown').toUpperCase()}`).join('; ')}. LIVE/ONLINE indicates a reporting provider; BASELINE data is not live, and unconfigured or errored sources are not presented as live.`;
  }

  if (/\b(admin|administrator|crud|create|edit|delete|manage|add scheme|registry permissions)\b/.test(query)) {
    return admin
      ? `You are signed in as ${admin.email}. In Scheme Data Registry, use Add Scheme to create records and the row-level Edit/Delete controls to update or remove them. These writes are authorized by the server and require the active administrator session.`
      : 'Scheme records can be viewed publicly. To create, edit, or delete them, an administrator must sign in using the Admin sign in control. First-time setup requires the operator-configured one-time bootstrap token; no default credentials are provided.';
  }

  if (/\b(how many|number of|total|portfolio|overview|dashboard|beneficiar|hectare|area)\b/.test(query)) {
    const functional = schemes.filter((scheme) => /fully functional/i.test(scheme.status || '')).length;
    const totalArea = schemes.reduce((sum, scheme) => sum + Number(scheme.equipped_area || 0), 0);
    const workingArea = schemes.reduce((sum, scheme) => sum + Number(scheme.functional_area || 0), 0);
    const beneficiaries = schemes.reduce((sum, scheme) => sum + Number(scheme.beneficiaries || 0), 0);
    return `The registry currently contains ${formatNumber(schemes.length)} schemes. ${formatNumber(functional)} are marked fully functional. Recorded equipped area totals ${formatNumber(totalArea)} ha, with ${formatNumber(workingArea)} ha functional and ${formatNumber(beneficiaries)} beneficiaries. These figures reflect the records currently loaded in the portal.`;
  }

  if (/\b(crop|crops|market|maize|wheat|agronom)\b/.test(query)) {
    const crops = schemes.map((scheme) => `${scheme.name}: ${asText(scheme.crop)} (market: ${asText(scheme.market)})`);
    return crops.length ? `Crop and market information in the scheme registry:\n${crops.join('\n')}` : 'No crop or market records are currently available.';
  }

  if (/\b(risk|risks|challenge|vulnerab|sustainab|alert)\b/.test(query)) {
    const risks = schemes.flatMap((scheme) => (Array.isArray(scheme.risk_factors) ? scheme.risk_factors : [])
      .map((risk) => ({ name: typeof risk === 'string' ? risk : risk.label || risk.name, scheme: scheme.name }))
      .filter((risk) => risk.name));
    if (!risks.length) return 'No scheme risk factors are recorded in the data currently loaded.';
    return `Recorded scheme risks: ${risks.map((risk) => `${risk.name} (${risk.scheme})`).join('; ')}`;
  }

  if (/\b(page|pages|where|find|navigate|section|report|map|gis|infrastructure)\b/.test(query)) {
    return `Available pages: ${pageDescriptions.map(([page, description]) => `${page} — ${description}`).join('; ')}. You are currently viewing ${currentPage || 'the portal'}. Use the left navigation to switch pages.`;
  }

  return 'I can answer questions using the portal’s current scheme registry, weather, telemetry/feed status, crops, risks, administration, maps, infrastructure, and reports. I do not have a connected general-purpose AI service, so I will not invent an answer when the portal data does not contain it. Try asking about a scheme name, weather, sensor status, feed sync, registry totals, crops, or administrator access.';
}
