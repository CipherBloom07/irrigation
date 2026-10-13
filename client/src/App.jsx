import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, ChevronDown, CloudRain,
  Cloud, CloudSun, Database, Droplets, FileText, Gauge, Globe2, MapPin, Printer, Search, ShieldCheck,
  ShieldAlert, Snowflake, Sprout, Store, Sun, TrendingUp, Users, Wind, Wrench, Plus,
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import GisMap from './components/GisMap';
import AddSchemeModal from './components/AddSchemeModal';
import AdminAccessModal from './components/AdminAccessModal';
import PortalAssistant from './components/PortalAssistant';
import {
  DASHBOARD_REFRESH_MS,
  fetchSchemes,
  fetchTelemetry,
  fetchWeather,
  createScheme,
  updateScheme,
  deleteScheme,
  fetchAdminStatus,
  logoutAdmin,
} from './services/api';

const defaultSchemes = [
  { id: 1, code: 'IRR-ZIM-001', name: 'Nyanyadzi Irrigation Scheme', equipped_area: 412, functional_area: 290, beneficiaries: 420, status: 'Partially functional', district: 'Chimanimani', province: 'Manicaland', ward: 8, source: 'River', crop: 'Green mealies, wheat', market: 'Mutare Market', market_analysis: 'High demand', officer: 'Tendai Mutasa', rehab: 2018, risk_factors: ['Inefficient, unreliable, and inequitable water delivery service', 'Rapid deterioration of infrastructure', 'Incapacitated to sustainably operate and maintain irrigation infrastructure', 'Difficulties accessing finances (loans & credits)'] },
  { id: 2, code: 'IRR-ZIM-002', name: 'Exchange Irrigation Scheme', equipped_area: 525, functional_area: 480, beneficiaries: 980, status: 'Fully functional', district: 'Zhombe', province: 'Midlands', ward: 14, source: 'Dam', crop: 'Wheat, green mealies', market: 'GMB Kwekwe', market_analysis: 'High demand', officer: 'Chipo Zhou', rehab: 2022, risk_factors: ['Difficulties accessing finances (loans & credits)', 'Unsustainable plot sizes'] },
  { id: 3, code: 'IRR-ZIM-003', name: 'Tshovane Irrigation Scheme', equipped_area: 180, functional_area: 110, beneficiaries: 140, status: 'Under rehabilitation', district: 'Chiredzi', province: 'Masvingo', ward: 5, source: 'Borehole', crop: 'Tomatoes, grain maize', market: 'Chiredzi Market', market_analysis: 'Incomplete', officer: 'Tatenda Moyo', rehab: 2024, risk_factors: ['Incapacitated to sustainably operate and maintain irrigation infrastructure', 'Lack of government policy on irrigation', 'Confusion on ownership of the irrigation scheme', 'Farmers are not committed to their projects'] },
  { id: 4, code: 'IRR-ZIM-004', name: 'Mubaira Solar Irrigation Scheme', equipped_area: 95, functional_area: 95, beneficiaries: 85, status: 'Fully functional', district: 'Mhondoro-Ngezi', province: 'Mashonaland West', ward: 2, source: 'Borehole', crop: 'Wheat, green mealies', market: 'Harare Market', market_analysis: 'High demand', officer: 'Rudo Moyo', rehab: 2021, risk_factors: [] },
  { id: 5, code: 'IRR-ZIM-005', name: 'Silalatshani Irrigation Scheme', equipped_area: 850, functional_area: 310, beneficiaries: 853, status: 'Partially functional', district: 'Insiza', province: 'Matabeleland South', ward: 11, source: 'Dam', crop: 'Potatoes, chilli, butternuts', market: 'Bulawayo Market', market_analysis: 'Moderate', officer: 'Bhekinkosi Ncube', rehab: 2019, risk_factors: ['Rapid deterioration of infrastructure', 'Inefficient, unreliable, and inequitable water delivery service', 'Incapacitated to sustainably operate and maintain irrigation infrastructure'] },
];

function getRiskRows(schemes) {
  const counts = new Map();
  schemes.forEach((scheme) => {
    const factors = Array.isArray(scheme.risk_factors) ? scheme.risk_factors : [];
    factors.forEach((factor) => {
      const label = typeof factor === 'string' ? factor : factor.label || factor.name;
      if (!label) return;
      const current = counts.get(label) || { count: 0, schemes: [] };
      current.count += 1;
      current.schemes.push(`${scheme.name} — ${scheme.province}`);
      counts.set(label, current);
    });
  });
  return [...counts.entries()]
    .map(([label, details]) => [label, details.count, [...new Set(details.schemes)].join('; ')])
    .sort((a, b) => b[1] - a[1]);
}

function calculateRiskScore(scheme) {
  const equipped = Number(scheme.equipped_area) || 0;
  const functionalRatio = equipped ? Number(scheme.functional_area || 0) / equipped : 0;
  const status = String(scheme.status || '').toLowerCase();
  const statusPenalty = status.includes('non') ? 35 : status.includes('rehab') ? 20 : status.includes('partial') || status.includes('attention') ? 12 : 0;
  const factors = Array.isArray(scheme.risk_factors) ? scheme.risk_factors : [];
  const factorPenalty = factors.reduce((total, factor) => {
    const label = String(typeof factor === 'string' ? factor : factor.label || factor.name || '').toLowerCase();
    return total + (label.includes('financ') ? 8 : label.includes('policy') ? 8 : label.includes('infrastructure') ? 6 : 0);
  }, 0);
  const assets = scheme.asset_conditions || scheme.assets || {};
  const badAssets = Object.values(assets).filter((asset) => String(typeof asset === 'object' && asset ? asset.status || asset.rating : asset).toLowerCase().includes('bad')).length;
  return Math.max(0, Math.min(100, Math.round((1 - functionalRatio) * 35 + statusPenalty + factorPenalty + badAssets * 6)));
}

const infrastructureAssets = [
  ['headworks', 'HEADWORKS', 2],
  ['conveyance', 'CONVEYANCE', 3],
  ['night_storage_dam', 'NIGHT STORAGE DAM', 4],
  ['infield_system', 'INFIELD SYSTEM', 5],
  ['perimeter_fence', 'PERIMETER FENCE', 6],
  ['access_road', 'ACCESS ROAD', 7],
];
const chartColors = ['#16803c', '#0789c4', '#e87900', '#84cc16', '#7c2d12', '#7c3aed', '#e11d48', '#0e9ab7'];

function getCropFrequency(schemes) {
  const counts = new Map();
  schemes.forEach((scheme) => String(scheme.crop || '')
    .split(',')
    .map((crop) => crop.trim())
    .filter(Boolean)
    .forEach((crop) => counts.set(crop, (counts.get(crop) || 0) + 1)));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([crop, count], index) => [crop, count, chartColors[index % chartColors.length]]);
}

const Card = ({ children, className = '' }) => <section className={`portal-card ${className}`}>{children}</section>;
const PageHeading = ({ icon: Icon, title, description, action }) => (
  <div className="portal-page-heading">
    <div className="portal-page-title">
      <Icon size={27} strokeWidth={2.2} />
      <div><h2>{title}</h2><p>{description}</p></div>
    </div>
    {action}
  </div>
);
const PanelTitle = ({ icon: Icon, children, aside }) => (
  <div className="portal-panel-title"><h3><Icon size={19} />{children}</h3>{aside}</div>
);

function AnimatedNumber({ value, decimals = 0 }) {
  const [displayValue, setDisplayValue] = useState(value);
  const displayValueRef = useRef(value);

  useEffect(() => {
    const startValue = displayValueRef.current;
    if (startValue === value) return undefined;

    displayValueRef.current = value;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayValue(value);
      return undefined;
    }

    const startedAt = performance.now();
    let frameId;
    const update = (now) => {
      const progress = Math.min((now - startedAt) / 240, 1);
      const easedProgress = 1 - (1 - progress) ** 3;
      const nextValue = startValue + (value - startValue) * easedProgress;
      displayValueRef.current = nextValue;
      setDisplayValue(nextValue);
      if (progress < 1) {
        frameId = window.requestAnimationFrame(update);
      }
    };

    frameId = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frameId);
  }, [value]);

  return <>{new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(displayValue)}</>;
}

const flowSourceNodes = [
  { key: 'weather', label: 'Weather' },
  { key: 'satellite', label: 'Satellite catalogue' },
  { key: 'telemetry', label: 'Telemetry' },
  { key: 'agronomy', label: 'Market Data' },
];
const supportingSourceNodes = [
  { key: 'gmb', label: 'GMB Announcements' },
  { key: 'fao', label: 'FAO' },
  { key: 'worldBank', label: 'World Bank' },
];

function sourceStatusLabel(status) {
  if (status === 'online') return 'LIVE / ONLINE';
  if (status === 'partial') return 'PARTIAL';
  if (status === 'baseline') return 'BASELINE';
  if (status === 'not_configured') return 'NOT CONFIGURED';
  if (status === 'error') return 'ERROR / OFFLINE';
  return 'STATUS UNKNOWN';
}

function SourceFlow({ sources = [] }) {
  const sourceByKey = new Map(sources.map((source) => [source.key, source]));
  const nodes = flowSourceNodes.map((node) => ({
    ...node,
    source: sourceByKey.get(node.key),
  }));
  const hasLiveSource = sources.some((source) => source.status === 'online');

  return <div className="portal-flow" aria-label="Smart Sync source flow to the irrigation intelligence dashboard">
    <div className="portal-flow-track">
      {nodes.map(({ key, label, source }, index) => {
        const status = source?.status || 'unknown';
        return <React.Fragment key={key}>
          <div className={`portal-flow-node flow-${status}`} aria-label={`${label}: ${sourceStatusLabel(status)}`}>
            <span className="portal-flow-node-type">{label}</span>
            <strong>{source?.name || label}</strong>
            <small>{sourceStatusLabel(status)}</small>
            {source?.error && <small className="portal-flow-error">{source.error}</small>}
          </div>
          <span
            className={`portal-flow-link${status === 'online' ? ' is-active' : ''}`}
            aria-hidden="true"
          >
            {index < nodes.length - 1 && <span className="portal-flow-arrow">›</span>}
          </span>
        </React.Fragment>;
      })}
      <div className="portal-flow-node portal-flow-intelligence">
        <span className="portal-flow-node-type">DECISION SUPPORT</span>
        <strong>Irrigation Intelligence Dashboard</strong>
        <small>{hasLiveSource ? 'Connected source data' : 'Awaiting live source data'}</small>
      </div>
    </div>
    <div className="portal-flow-support">
      <span>Additional registered feeds</span>
      {supportingSourceNodes.map(({ key, label }) => {
        const source = sourceByKey.get(key);
        const status = source?.status || 'unknown';
        return <span className={`portal-flow-chip flow-${status}`} key={key}>
          <i aria-hidden="true" />
          {label} · {sourceStatusLabel(status)}
        </span>;
      })}
    </div>
  </div>;
}

function MetricCard({ label, value, note, color = 'green', icon: Icon, className = '' }) {
  return <Card className={`portal-metric portal-metric-${color} ${className}`.trim()}>
    <div className="portal-metric-top"><span>{label}</span>{Icon && <Icon size={21} />}</div>
    <strong>{value}</strong>
    {note && <small>{note}</small>}
  </Card>;
}

function StatusTag({ children }) {
  const status = String(children || '').toLowerCase();
  const tone = status.includes('non-functional') ? 'bad' : status.includes('fully') || status === 'functional' ? 'good' : status.includes('rehab') ? 'warn' : 'partial';
  return <span className={`portal-status portal-status-${tone}`}>{children}</span>;
}

function weatherUpdatedLabel(weather) {
  if (!weather?.sourceUpdatedAt) return weather?.current?.last_updated || 'Update time unavailable';

  const updatedAt = new Date(weather.sourceUpdatedAt);
  if (!Number.isFinite(updatedAt.getTime())) return weather.current?.last_updated || 'Update time unavailable';

  try {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: weather.location?.tz_id,
    }).format(updatedAt);
  } catch {
    return updatedAt.toLocaleString('en-GB');
  }
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function getIrrigationGuidance(telemetry, weather) {
  const sensorFeed = telemetry.sources?.find((source) => source.key === 'telemetry');
  const weatherIsLive = weather?.status === 'online';
  const sensorsAreLive = sensorFeed?.status === 'online' && telemetry.mode === 'live';
  const soilMoisture = finiteNumber(telemetry.soil_moisture);
  const waterFlow = finiteNumber(telemetry.water_flow);
  const rainChance = finiteNumber(weather?.current?.chance_of_rain);
  const hasSoilMoisture = sensorsAreLive && soilMoisture !== undefined;
  const hasWaterFlow = sensorsAreLive && waterFlow !== undefined;
  const hasRainChance = weatherIsLive && rainChance !== undefined;

  if (!hasSoilMoisture && !hasWaterFlow) {
    return {
      state: 'WAITING FOR SENSOR DATA',
      tone: 'neutral',
      summary: 'Site-level irrigation guidance is unavailable because live field sensor readings are not confirmed.',
      detail: hasRainChance
        ? `Live weather reports a ${rainChance}% chance of rain. Use this as context only; it does not replace soil-moisture measurements.`
        : 'Connect an online telemetry feed to enable site-level decision support.',
      basis: hasRainChance ? 'Live weather · no verified field telemetry' : 'No verified live sensor inputs',
    };
  }

  if (hasWaterFlow && waterFlow <= 0) {
    return {
      state: 'CHECK WATER DELIVERY',
      tone: 'warning',
      summary: 'The live flow reading is at or below zero. Check the sensor and water-delivery system before changing irrigation schedules.',
      detail: hasSoilMoisture ? `Reported soil moisture: ${soilMoisture}%.` : 'A current soil-moisture reading is not available.',
      basis: 'Live telemetry',
    };
  }

  if (hasSoilMoisture && soilMoisture < 35) {
    const rainNote = hasRainChance && rainChance >= 70
      ? ` The live forecast also shows a ${rainChance}% chance of rain; verify field conditions before scheduling irrigation.`
      : '';
    return {
      state: 'FIELD REVIEW ADVISED',
      tone: 'warning',
      summary: `Reported soil moisture is ${soilMoisture}%, below the portal's 35% review trigger.${rainNote}`,
      detail: 'Ask the field operator to verify the sensor, crop stage, and root-zone conditions. No irrigation volume is inferred.',
      basis: `Live telemetry${hasRainChance ? ' + live weather' : ''}`,
    };
  }

  if (hasRainChance && rainChance >= 70) {
    return {
      state: 'REVIEW WEATHER BEFORE SCHEDULING',
      tone: 'caution',
      summary: `The live forecast reports a ${rainChance}% chance of rain. Review field conditions before making schedule changes.`,
      detail: hasSoilMoisture
        ? `Reported soil moisture: ${soilMoisture}%. Weather is contextual guidance, not a site-specific rainfall measurement.`
        : 'A current soil-moisture reading is not available.',
      basis: 'Live weather forecast',
    };
  }

  return {
    state: 'CONTINUE MONITORING',
    tone: 'good',
    summary: hasSoilMoisture
      ? `Reported soil moisture is ${soilMoisture}%, above the portal's 35% review trigger.`
      : 'Live flow is being reported; soil-moisture data is not available for a field-level assessment.',
    detail: 'Continue routine checks. Review triggers are not crop-stage-specific and do not automatically control irrigation.',
    basis: 'Live telemetry',
  };
}

function IrrigationAdvisor({ telemetry, weather, onViewTelemetry }) {
  const guidance = getIrrigationGuidance(telemetry, weather);
  return <section className={`portal-advisor advisor-${guidance.tone}`} aria-labelledby="irrigation-advisor-title">
    <div className="portal-advisor-mark" aria-hidden="true"><Droplets size={21} /></div>
    <div className="portal-advisor-content">
      <div className="portal-advisor-heading">
        <div><span>RULE-BASED DECISION SUPPORT</span><h3 id="irrigation-advisor-title">Irrigation decision support</h3></div>
        <strong className="portal-advisor-state"><i aria-hidden="true" />{guidance.state}</strong>
      </div>
      <p className="portal-advisor-summary">{guidance.summary}</p>
      <p className="portal-advisor-detail">{guidance.detail}</p>
      <div className="portal-advisor-footer"><span>Basis: {guidance.basis}</span><span>Operator review required · no automatic control</span></div>
    </div>
    <button className="portal-advisor-link" type="button" onClick={onViewTelemetry}>View telemetry <ArrowRight size={15} /></button>
  </section>;
}

function ExecutiveDashboard({ schemes, telemetry, weather, weatherRefreshError, onViewRegistry, setActiveTab }) {
  const equipped = schemes.reduce((total, scheme) => total + Number(scheme.equipped_area || 0), 0);
  const functional = schemes.reduce((total, scheme) => total + Number(scheme.functional_area || 0), 0);
  const beneficiaries = schemes.reduce((total, scheme) => total + Number(scheme.beneficiaries || 0), 0);
  const fullyFunctional = schemes.filter((scheme) => scheme.status.toLowerCase().includes('fully')).length;
  const attentionSchemes = schemes.filter((scheme) => !scheme.status.toLowerCase().includes('fully'));
  const sensorFeedIsLive = telemetry.sources?.some((source) => source.key === 'telemetry' && source.status === 'online');
  const weatherFeedIsLive = weather?.status === 'online';
  const soilMoisture = finiteNumber(telemetry.soil_moisture);
  const waterFlow = finiteNumber(telemetry.water_flow);
  const rainChance = finiteNumber(weather?.current?.chance_of_rain);
  const urgentTelemetry = Boolean(
    (sensorFeedIsLive && ((soilMoisture !== undefined && soilMoisture < 35) || (waterFlow !== undefined && waterFlow <= 0)))
    || (weatherFeedIsLive && rainChance !== undefined && rainChance >= 70),
  );
  const condition = weather?.current?.condition?.text;
  const temperature = weather?.current?.temp_c;
  const weatherStatus = weatherRefreshError
    ? weather ? 'STALE · REFRESH ERROR'
      : weatherRefreshError === 'not_configured' ? 'NOT CONFIGURED'
        : 'ERROR / OFFLINE'
    : weather?.status === 'online' ? 'LIVE'
      : weather?.status === 'not_configured' ? 'NOT CONFIGURED'
        : weather ? 'ERROR / OFFLINE'
          : 'WAITING FOR WEATHER';
  const conditionLabel = String(condition || '').toLowerCase();
  const WeatherIcon = conditionLabel.includes('rain')
    ? CloudRain
    : conditionLabel.includes('snow')
      ? Snowflake
      : conditionLabel.includes('cloud') || conditionLabel.includes('overcast')
        ? Cloud
        : conditionLabel.includes('sun')
          ? Sun
          : CloudSun;
  const weatherMetrics = [
    [Droplets, 'HUMIDITY', weather?.current?.humidity, '%'],
    [Wind, 'WIND SPEED', weather?.current?.wind_kph, ' km/h'],
    [Gauge, 'PRESSURE', weather?.current?.pressure_mb, ' mb'],
    rainChance !== undefined && rainChance !== null
      ? [CloudRain, 'RAIN CHANCE', rainChance, '%']
      : [CloudRain, 'PRECIPITATION', weather?.current?.precip_mm, ' mm'],
  ];
  return <>
    <PageHeading icon={BarChart3} title="Government Executive Dashboard Overview" description="National High-Level Telemetry & Operational Summary for Zimbabwe Smallholder Schemes" action={<div className="portal-heading-actions">{(attentionSchemes.length > 0 || urgentTelemetry) && <button className="portal-alert-summary" onClick={() => setActiveTab('Sustainability & Risks')}><AlertTriangle size={15} />{urgentTelemetry ? 'Telemetry alert' : `${attentionSchemes.length} schemes need attention`}</button>}<button className="portal-button portal-button-primary" onClick={onViewRegistry}>View Full Registry <ArrowRight size={17} /></button></div>} />
    <div className="portal-climate">
      <div className="portal-weather">
        <div className="portal-weather-icon"><WeatherIcon size={35} strokeWidth={1.7} aria-hidden="true" /></div><div><div className="portal-eyebrow">{weather?.location?.name || 'Zimbabwe'} WEATHER <span className="live-pill">{weatherStatus}</span></div><strong>{temperature ?? '—'}{temperature !== undefined && temperature !== null ? '°C' : ''} <span>{condition || 'Conditions unavailable'}</span></strong><p>{weatherRefreshError === 'not_configured' ? 'Weather provider is not configured. ' : weatherRefreshError ? weather ? 'Refresh failed; showing the last stored observation. ' : 'Weather data is unavailable. ' : weather?.error ? `${weather.error} · ` : ''}{weather?.source || 'Open-Meteo'} · Updated {weatherUpdatedLabel(weather)}</p></div>
      </div>
      <div className="portal-climate-metrics">
        {weatherMetrics.map(([Icon, label, value, unit]) => <div className="portal-climate-stat" key={label}><span><Icon size={14} />{label}</span><strong>{value === undefined || value === null ? '—' : `${value}${unit}`}</strong><small>{weather?.location?.country || 'WeatherAPI current conditions'}</small></div>)}
      </div>
    </div>
    <IrrigationAdvisor telemetry={telemetry} weather={weather} onViewTelemetry={() => setActiveTab('Water & Telemetry')} />
    <div className="portal-kpis">
      <div className="portal-kpi"><div className="portal-kpi-icon green"><Sprout size={23} /></div><span>TOTAL EQUIPPED AREA</span><strong><AnimatedNumber value={equipped} /> <small>Ha</small></strong><em>Across {schemes.length} registered schemes</em></div>
      <div className="portal-kpi"><div className="portal-kpi-icon blue"><Droplets size={23} /></div><span>FUNCTIONAL AREA</span><strong><AnimatedNumber value={functional} /> <small>Ha</small></strong><em className="blue-tag">{(functional / Math.max(equipped, 1) * 100).toFixed(1)}% Active &nbsp; gravity & solar</em><div className="portal-progress-ring" style={{ '--progress': `${functional / Math.max(equipped, 1) * 100}%` }}>{(functional / Math.max(equipped, 1) * 100).toFixed(1)}%</div></div>
      <div className="portal-kpi"><div className="portal-kpi-icon orange"><Users size={23} /></div><span>SMALLHOLDER BENEFICIARIES</span><strong><AnimatedNumber value={beneficiaries} /></strong><em className="orange-tag">Registered farmers</em></div>
      <div className="portal-kpi"><div className="portal-kpi-icon mint"><ShieldCheck size={23} /></div><span>FULLY FUNCTIONAL RATE</span><strong><AnimatedNumber value={fullyFunctional / Math.max(schemes.length, 1) * 100} decimals={1} />%</strong><em className="green-tag">{fullyFunctional} of {schemes.length} Schemes</em><div className="portal-kpi-line"><i style={{ '--progress': `${fullyFunctional / Math.max(schemes.length, 1) * 100}%`, width: `${fullyFunctional / Math.max(schemes.length, 1) * 100}%` }} /></div></div>
    </div>
    <GisMap schemes={schemes} dashboard onOpenMap={() => setActiveTab('GIS Spatial Telemetry Map')} />
    <div className="portal-grid-two">
    <Card><PanelTitle icon={BarChart3}>Equipped Area by Province (Ha)</PanelTitle><ProvinceAreaChart schemes={schemes} /></Card>
    <Card><PanelTitle icon={Droplets}>Primary Water Source Distribution</PanelTitle><DonutChart schemes={schemes} /></Card>
    </div>
    <Card><PanelTitle icon={Activity} aside={<span className="portal-muted">{telemetry.monthly_data_mode === 'live' ? 'Live provider series' : 'Seasonal baseline · representative pattern'}</span>}>Annual Hydrological Cycle — Rainfall vs Evapotranspiration vs Irrigation Demand (mm)</PanelTitle><TrendChart telemetry={telemetry} /></Card>
  </>;
}

function SimpleBars({ values, max = 100 }) {
  if (!values.length) return <p className="portal-chart-empty">No reported data is available for this chart.</p>;
  return <div className="portal-bars">{values.map(([label, value, color]) => <div className="portal-bar-item" key={label}><div className="portal-bar-value">{value}</div><i style={{ height: `${value / max * 100}%`, background: color }} /><span>{label}</span></div>)}</div>;
}

function ProvinceAreaChart({ schemes }) {
  const colors = ['#16803c', '#0789c4', '#e87900', '#84cc16', '#7c2d12', '#7c3aed', '#e11d48', '#0e9ab7'];
  const totals = new Map();
  schemes.forEach((scheme) => totals.set(scheme.province || 'Not reported', (totals.get(scheme.province || 'Not reported') || 0) + Number(scheme.equipped_area || 0)));
  const values = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([name, value], index) => [name.replace('Matabeleland ', 'Mat '), value, colors[index % colors.length]]);
  return <SimpleBars values={values} max={Math.max(...values.map(([, value]) => value), 1) * 1.15} />;
}

function DonutChart({ schemes }) {
  const colors = { dam: '#0789c4', river: '#16803c', borehole: '#e87900' };
  const totals = new Map();
  schemes.forEach((scheme) => {
    const rawSource = String(scheme.source || '').trim();
    const source = rawSource
      ? rawSource.charAt(0).toUpperCase() + rawSource.slice(1).toLowerCase()
      : 'Not reported';
    totals.set(source, (totals.get(source) || 0) + 1);
  });
  const values = [...totals.entries()];
  const total = values.reduce((sum, [, count]) => sum + count, 0);
  let offset = 0;
  const circumference = 2 * Math.PI * 72;
  return <div className="portal-donut-wrap">
    {total ? <div className="portal-donut-visual">
      <svg className="portal-donut" viewBox="0 0 200 200" role="img" aria-label={`Water-source distribution across ${total} schemes`}>
        <circle className="portal-donut-track" cx="100" cy="100" r="72" />
        {values.map(([source, count]) => {
          const length = count / total * circumference;
          const color = colors[source.toLowerCase()] || '#7c3aed';
          const segment = <circle
            className="portal-donut-segment"
            key={source}
            cx="100"
            cy="100"
            r="72"
            stroke={color}
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-offset}
          />;
          offset += length;
          return segment;
        })}
      </svg>
      <div className="portal-donut-center"><strong>{total}</strong><span>SCHEMES</span></div>
    </div> : <p className="portal-chart-empty">No schemes to summarize.</p>}
    <div className="portal-donut-legend">{values.map(([source, count]) => <span key={source}><i style={{ background: colors[source.toLowerCase()] || '#7c3aed' }} />{source} <b>{Math.round(count / total * 100)}%</b></span>)}</div>
  </div>;
}

function TrendChart({ telemetry = {} }) {
  const monthly = telemetry.monthly || {};
  const rainfall = telemetry.monthly_rainfall || monthly.rainfall || [170, 155, 132, 94, 52, 28, 25, 32, 55, 90, 128, 158];
  const evapotranspiration = telemetry.monthly_evapotranspiration || monthly.evapotranspiration || [45, 57, 72, 91, 108, 124, 138, 145, 142, 125, 96, 65];
  const irrigationDemand = telemetry.monthly_irrigation_demand || monthly.irrigation_demand || rainfall.map((value, index) => Math.max(0, evapotranspiration[index] * 1.15 - value * 0.55));
  const series = [rainfall, evapotranspiration, irrigationDemand];
  const maximum = Math.max(200, ...series.flat().map(Number).filter(Number.isFinite));
  const makePath = (values) => values.map((value, index) => `${index === 0 ? 'M' : 'L'}${50 + index * (830 / Math.max(values.length - 1, 1))} ${215 - (Number(value) / maximum * 180)}`).join(' ');
  const forecast = telemetry.demand_forecast ?? Math.max(0, Number(telemetry.evapotranspiration ?? 4.8) - Number(telemetry.rainfall ?? 1.2) * 0.75).toFixed(1);
  return <div className="portal-trend"><svg viewBox="0 0 900 260" role="img" aria-label="Annual rainfall, evapotranspiration, and irrigation demand trend">
    <defs><linearGradient id="trend-demand" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#43a047" stopOpacity=".24" /><stop offset="1" stopColor="#43a047" stopOpacity="0" /></linearGradient></defs>
    {[50, 105, 160, 215].map((y) => <path key={y} d={`M50 ${y} H880`} stroke="#e7edf0" strokeWidth="1" />)}
    <path d={`${makePath(irrigationDemand)} L880 215 H50 Z`} fill="url(#trend-demand)" />
    <path d={makePath(rainfall)} fill="none" stroke="#0288d1" strokeWidth="3" />
    <path d={makePath(evapotranspiration)} fill="none" stroke="#f57c00" strokeDasharray="6 4" strokeWidth="2.5" />
    <path d={makePath(irrigationDemand)} fill="none" stroke="#43a047" strokeWidth="3" />
    {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => <text key={m} x={50 + i * 75} y="246">{m}</text>)}
  </svg><div className="portal-chart-legend"><span><i className="blue-dot" />Rainfall</span><span><i className="orange-dot" />Evapotranspiration</span><span><i className="green-dot" />Irrigation demand</span><span className="portal-forecast">Forecast: {forecast} mm/day (ET₀ − effective rainfall)</span></div></div>;
}

function GisPage({ schemes }) {
  return <><PageHeading icon={MapPin} title="National GIS Spatial Telemetry & Satellite Mapping" description="Interactive irrigation scheme locations, operational status, and spatial telemetry across Zimbabwe" /><GisMap schemes={schemes} expanded /></>;
}

function WaterPage({ telemetry, schemes }) {
  const equippedArea = schemes.reduce((total, scheme) => total + Number(scheme.equipped_area || 0), 0);
  const functionalArea = schemes.reduce((total, scheme) => total + Number(scheme.functional_area || 0), 0);
  const coverage = equippedArea ? functionalArea / equippedArea * 100 : 0;
  const moisture = Number(telemetry.soil_moisture ?? 66);
  const telemetryFeed = telemetry.sources?.find((source) => source.key === 'telemetry');
  const weatherFeed = telemetry.sources?.find((source) => source.key === 'weather');
  const waterFlowIsLive = telemetryFeed?.status === 'online';
  const soilMoistureIsLive = waterFlowIsLive && Number.isFinite(Number(telemetry.soil_moisture));
  const weatherReadingsAvailable = ['online', 'partial'].includes(weatherFeed?.status);
  const securityIndex = telemetry.water_security_pct !== undefined
    ? Number(telemetry.water_security_pct).toFixed(1)
    : Number(coverage * 0.6 + moisture * 0.4).toFixed(1);
  const values = [
    ['SOIL MOISTURE', `${telemetry.soil_moisture ?? 66}%`, soilMoistureIsLive ? 'Live field-sensor reading' : 'Baseline planning value · no live field sensor', Droplets, 'green'],
    ['WATER FLOW', `${telemetry.water_flow ?? 46.1} m³/s`, waterFlowIsLive ? 'Live monitored throughput' : 'Baseline planning value', Activity, 'blue'],
    ['WIND SPEED', `${telemetry.wind_speed ?? 13.2} km/h`, weatherReadingsAvailable ? 'Live weather-provider reading' : 'Baseline planning value', Wind, 'orange'],
    ['RAIN RISK 24H', `${telemetry.rain_risk ?? 10}%`, weatherReadingsAvailable ? 'Live weather-provider forecast' : 'Baseline planning value', CloudRain, 'violet'],
    ['WATER SECURITY INDEX', `${securityIndex}%`, telemetry.water_security_pct !== undefined ? 'Provider-reported index' : soilMoistureIsLive ? 'Estimate from scheme area + live moisture' : 'Estimate includes baseline moisture · not a live index', ShieldCheck, 'green'],
  ];
  return <>
    <PageHeading icon={Droplets} title="Water Resources, Telemetry & Hydrology Monitoring" description="Reported telemetry with baseline planning values clearly identified" />
    <p className="portal-data-note" role="status">{telemetry.mode === 'live' ? `${telemetry.status === 'ONLINE' ? 'LIVE / ONLINE' : 'PARTIAL · some fields use baseline values'} · ${telemetry.data_source || 'Connected sources'}` : 'BASELINE · no live telemetry measurements are available'}</p>
    <div className="portal-kpis portal-kpis-four">{values.map(([label, value, note, Icon, color]) => <MetricCard key={label} label={label} value={value} note={note} icon={Icon} color={color} className={label === 'WATER FLOW' && waterFlowIsLive ? 'portal-metric-flow-live' : ''} />)}</div>
    <div className="portal-grid-two">
      <Card><PanelTitle icon={BarChart3}>Equipped Area by Province (Ha)</PanelTitle><ProvinceAreaChart schemes={schemes} /></Card>
      <Card><PanelTitle icon={Droplets}>Primary Water Source Distribution</PanelTitle><DonutChart schemes={schemes} /></Card>
    </div>
    <Card><PanelTitle icon={Activity} aside={<span className="portal-muted">{telemetry.monthly_data_mode === 'live' ? 'Live provider series' : 'Zimbabwe seasonal baseline · representative pattern'}</span>}>Annual Hydrological Cycle — Rainfall vs Evapotranspiration vs Irrigation Demand (mm)</PanelTitle><TrendChart telemetry={telemetry} /></Card>
    <div className="portal-grid-two">
      <Card><PanelTitle icon={Droplets}>Water Management Compliance</PanelTitle><HorizontalBars rows={schemes.map((scheme) => [scheme.name, scheme.equipped_area ? Math.round(Number(scheme.functional_area) / Number(scheme.equipped_area) * 100) : 0])} color="blue" /></Card>
      <Card><PanelTitle icon={Database}>Regional Telemetry & Scheme Registry</PanelTitle><SchemeTable schemes={schemes.slice(0, 4)} compact /></Card>
    </div>
    <Card className="portal-sync-card">
      <PanelTitle icon={Globe2} aside={<span className="portal-muted">Smart Sync · source status from the latest API response</span>}>Trusted Data Feed Status</PanelTitle>
      <SourceFlow sources={telemetry.sources || []} />
      <div className="portal-source-list">{(telemetry.sources || []).map((source) => <div key={source.key} className={`source-card source-card-${source.status}`}>
        <i className={`source-${source.status}`} />
        <span><strong>{source.name}</strong><small>{source.scope || (source.status === 'online' ? 'Connected · synchronized' : source.status === 'partial' || source.status === 'error' ? source.error : source.status === 'baseline' ? 'Using labeled baseline values' : 'Connect an authorized provider endpoint to enable live sync')}{source.latestProduct?.acquiredAt ? ` · Latest catalogue item ${new Date(source.latestProduct.acquiredAt).toLocaleString()}` : ''}</small></span>
        <b>{sourceStatusLabel(source.status)}</b>
      </div>)}</div>
      <p className="portal-data-note">{telemetry.data_source || 'Water Survey Baseline 2026'} · Updated {telemetry.last_synced_at ? new Date(telemetry.last_synced_at).toLocaleString() : 'not yet synchronized'}</p>
    </Card>
  </>;
}

function AgronomyPage({ schemes, telemetry }) {
  const cropFrequency = useMemo(() => getCropFrequency(schemes).slice(0, 8), [schemes]);
  const cropReported = schemes.filter((scheme) => String(scheme.crop || '').trim()).length;
  const marketReported = schemes.filter((scheme) => scheme.market && !/incomplete|missing/i.test(scheme.market_analysis || '')).length;
  const agriculturePhotos = [
    { image: 'field-landscape.jpg', alt: 'Mature wheat growing across an open field', title: 'Cereal production', detail: 'Wheat and staple crop systems' },
    { image: 'golden-field.jpg', alt: 'Sunrise over a cultivated agricultural field', title: 'Working landscapes', detail: 'Agriculture across the seasons' },
    { image: 'crop-seedlings.jpg', alt: 'Young crop seedlings growing in prepared soil', title: 'Crop establishment', detail: 'Early growth and field preparation' },
  ];
  return <>
    <PageHeading icon={Sprout} title="Agronomic Productivity & Crop Systems" description="Crop performance, farmer market access, and seasonal production monitoring" />
    <div className="portal-highlight-grid">
      <div className="portal-highlight"><span><Sprout size={20} /></span><div><strong>Crop records</strong><small>{cropReported} of {schemes.length} schemes report crop information</small></div></div>
      <div className="portal-highlight"><span><Store size={20} /></span><div><strong>Market channels</strong><small>{marketReported} of {schemes.length} schemes have market information</small></div></div>
      <div className="portal-highlight"><span><BarChart3 size={20} /></span><div><strong>Crop mix</strong><small>{cropFrequency.length} reported crop types in this view</small></div></div>
    </div>
    <section className="portal-agri-gallery" aria-label="Illustrative agriculture photography">
      <div className="portal-agri-gallery-heading">
        <div><span>FIELD NOTES</span><h3>Agriculture in focus</h3></div>
        <p>Illustrative photography · not scheme-specific imagery</p>
      </div>
      <div className="portal-agri-gallery-grid">
        {agriculturePhotos.map((photo, index) => <figure className="portal-agri-photo" key={photo.image} style={{ '--photo-delay': `${index * 75}ms` }}>
          <img src={`/agriculture/${photo.image}`} alt={photo.alt} loading="lazy" decoding="async" width="960" height="640" />
          <span className="portal-agri-photo-tag">AGRICULTURE</span>
          <figcaption><strong>{photo.title}</strong><span>{photo.detail}</span></figcaption>
        </figure>)}
      </div>
      <a className="portal-agri-photo-credit" href="https://unsplash.com/license" target="_blank" rel="noreferrer">Photography: Unsplash</a>
    </section>
    <AgricultureBenchmark telemetry={telemetry} />
    <GmbAnnouncements telemetry={telemetry} />
    <Card><PanelTitle icon={Sprout}>Crop mix by registered scheme</PanelTitle><div className="portal-crop-grid">{cropFrequency.map(([crop, count]) => <div className="portal-crop" key={crop}><span aria-hidden="true"><Sprout size={19} strokeWidth={1.8} /></span><strong>{crop}</strong><em>{count} {count === 1 ? 'scheme' : 'schemes'}</em></div>)}</div></Card>
    <div className="portal-grid-two">
      <Card><PanelTitle icon={TrendingUp}>Crop Cultivation Frequency</PanelTitle><SimpleBars values={cropFrequency.map(([crop, count, color]) => [crop, count, color])} max={Math.max(1, schemes.length)} /></Card>
      <Card><PanelTitle icon={Activity} aside={<span className="portal-muted">{telemetry.monthly_data_mode === 'live' ? 'Live provider series' : 'Seasonal baseline · representative pattern'}</span>}>Seasonal water-demand context</PanelTitle><TrendChart telemetry={telemetry} /></Card>
    </div>
    <Card><PanelTitle icon={Database}>Per-Scheme Agronomic Profile</PanelTitle><SchemeTable schemes={schemes} crops /></Card>
  </>;
}

function AgricultureBenchmark({ telemetry }) {
  const context = telemetry.agriculture_context;
  const source = telemetry.sources?.find((item) => item.key === 'worldBank');
  const observations = Array.isArray(context?.observations)
    ? context.observations.filter((item) => Number.isInteger(item.year) && Number.isFinite(item.value))
    : [];
  const history = observations.slice(0, 8).reverse();
  const latest = observations[0];

  return <Card className="portal-benchmark-card">
    <PanelTitle icon={TrendingUp} aside={<span className={`portal-benchmark-status status-${source?.status || 'unknown'}`}>{source?.status === 'online' ? 'ONLINE' : source?.status === 'error' ? 'UNAVAILABLE' : source?.status === 'not_configured' ? 'NOT CONFIGURED' : 'NO DATA'}</span>}>
      National crop-production benchmark
    </PanelTitle>
    {latest ? <>
      <div className="portal-benchmark-latest"><strong>{latest.value.toLocaleString()} <small>kg/ha</small></strong><span>Zimbabwe cereal yield · {latest.year}</span></div>
      <SimpleBars values={history.map((item) => [String(item.year), item.value, '#56846a'])} max={Math.max(...history.map((item) => item.value), 1) * 1.12} />
      <p className="portal-benchmark-note">Annual national indicator from {context.provider}. This historical context is not a live scheme measurement or irrigation prescription.{context.lastUpdated ? ` Dataset updated ${context.lastUpdated}.` : ''}</p>
    </> : <p className="portal-benchmark-note" role="status">
      {source?.status === 'error'
        ? 'The World Bank source could not be reached. No historical benchmark is shown.'
        : 'No verified World Bank observations are available yet. The benchmark will appear after a successful source sync.'}
    </p>}
  </Card>;
}

function GmbAnnouncements({ telemetry }) {
  const source = telemetry.sources?.find((item) => item.key === 'gmb');
  const posts = Array.isArray(telemetry.gmb_announcements) ? telemetry.gmb_announcements : [];

  return <Card>
    <PanelTitle icon={Store} aside={<span className={`portal-benchmark-status status-${source?.status || 'unknown'}`}>{sourceStatusLabel(source?.status)}</span>}>
      GMB official announcements
    </PanelTitle>
    {posts.length ? <div className="portal-gmb-announcements">{posts.map((post) => <article key={post.link}>
      <a href={post.link} target="_blank" rel="noreferrer">{post.title}</a>
      <time dateTime={post.date}>{post.date ? new Date(post.date).toLocaleDateString() : 'Date not supplied'}</time>
      {post.excerpt && <p>{post.excerpt}</p>}
    </article>)}</div> : <p className="portal-benchmark-note" role="status">
      {source?.status === 'error' ? 'The official GMB announcements service could not be reached.' : 'No GMB announcements are available from the public feed yet.'}
    </p>}
    <p className="portal-benchmark-note">Official GMB notices only. Announced producer prices may be embedded in images and are not extracted as verified market-price records.</p>
  </Card>;
}

function HorizontalBars({ rows, color = 'rose' }) {
  return <div className={`portal-horizontal-bars ${color}`}>{rows.map(([label, value], index) => <div className="portal-horizontal-row" key={label}><span>{label}</span><div><i style={{ width: `${value}%` }} /></div><b>{value}%</b></div>)}</div>;
}

function InfrastructurePage({ schemes }) {
  const rows = schemes.map((scheme) => {
    const supplied = scheme.asset_conditions || scheme.assets || {};
    const getAsset = (key) => {
      const value = supplied[key] ?? supplied[key.replaceAll('_', ' ')] ?? 'Not reported';
      return typeof value === 'object' && value !== null ? value.status || value.rating || 'Not rated' : value;
    };
    return {
      scheme,
      values: infrastructureAssets.map(([key]) => getAsset(key)),
      fund: supplied.om_fund ?? supplied.om_fund_compliance ?? 'Not reported',
    };
  });
  const assetGauges = infrastructureAssets.slice(0, 4).map(([key, label]) => {
    const values = rows.map(({ values: ratings }) => {
      const status = String(ratings[infrastructureAssets.findIndex(([assetKey]) => assetKey === key)]).toLowerCase();
      return status === 'good' ? 100 : status === 'moderate' ? 50 : status === 'bad' || status.includes('poor') ? 0 : null;
    }).filter(Number.isFinite);
    const percent = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    const goodCount = values.filter((value) => value === 100).length;
    return [label, percent, goodCount, values.length];
  });
  return <>
    <PageHeading icon={Wrench} title="Infrastructure Health Audit & O&M Fund Compliance" description="Engineering asset rating, headworks functionality, Night Storage Dam audit, and maintenance fund status" />
    <div className="portal-gauges">{assetGauges.map(([label, value, goodCount, ratedCount]) => <Card key={label}><span>{label}</span><div className="portal-gauge" style={{ '--gauge': `${(value ?? 0) * 3.6}deg` }}><strong>{value === null ? '—' : `${value}%`}</strong></div><small>{ratedCount ? `${goodCount}/${ratedCount} rated Good` : 'No ratings reported'}</small></Card>)}</div>
    <Card><PanelTitle icon={Database}>National Engineering Asset Condition Heatmap</PanelTitle><div className="portal-table-scroll"><table className="portal-table portal-heatmap"><thead><tr>{['SCHEME', 'HEADWORKS', 'CONVEYANCE', 'NIGHT STORAGE DAM', 'INFIELD SYSTEM', 'PERIMETER FENCE', 'ACCESS ROAD', 'O&M FUND', 'LAST REHAB'].map((cell) => <th key={cell}>{cell}</th>)}</tr></thead><tbody>{rows.map(({ scheme, values, fund }) => <tr key={scheme.id}><td><strong>{scheme.name}</strong><small>{scheme.province}</small></td>{[...values, fund, scheme.rehab || '—'].map((cell, index) => <td key={`${scheme.id}-${index}`}><span className={`heat-${String(cell).toLowerCase().replace('/', '-')}`}>{cell}</span></td>)}</tr>)}</tbody></table></div></Card>
    <div className="portal-grid-two">
      <Card><PanelTitle icon={BarChart3}>Infrastructure Functionality Matrix</PanelTitle><StackedBars schemes={schemes} /></Card>
      <Card><PanelTitle icon={ShieldAlert}>Top Sustainability & Risk Factors</PanelTitle><HorizontalBars rows={getRiskRows(schemes).slice(0, 5).map(([label, count]) => [label, schemes.length ? count / schemes.length * 100 : 0])} /></Card>
      <Card><PanelTitle icon={Sprout}>Crop Cultivation Frequency</PanelTitle><SimpleBars values={getCropFrequency(schemes).slice(0, 6)} max={Math.max(schemes.length, 1)} /></Card>
      <Card><PanelTitle icon={TrendingUp}>Multi-Scheme Performance Radar</PanelTitle><RadarChart schemes={schemes} /></Card>
    </div>
  </>;
}

function StackedBars({ schemes }) {
  const labels = infrastructureAssets.slice(0, 5);
  if (!schemes.length) return <p className="portal-chart-empty">No scheme data is available for this chart.</p>;
  return <div className="portal-stacked">{labels.map(([key, label], index) => {
    const records = schemes.map((scheme) => {
      const supplied = scheme.asset_conditions || scheme.assets || {};
      const rating = supplied[key] ?? supplied[key.replaceAll('_', ' ')] ?? '';
      return String(typeof rating === 'object' && rating ? rating.status || rating.rating : rating).toLowerCase();
    });
    const good = records.filter((rating) => rating === 'good').length;
    const moderate = records.filter((rating) => rating === 'moderate').length;
    const bad = records.filter((rating) => rating === 'bad' || rating.includes('poor')).length;
    const unreported = schemes.length - good - moderate - bad;
    const total = schemes.length;
    return <div key={key}><div className="portal-stack"><i title={`${good} good`} style={{ height: `${good / total * 100}%` }} /><i title={`${moderate} moderate`} style={{ height: `${moderate / total * 100}%` }} /><i title={`${bad} poor`} style={{ height: `${bad / total * 100}%` }} /><i title={`${unreported} not reported`} style={{ height: `${unreported / total * 100}%` }} /></div><small>{label.replace('NIGHT STORAGE DAM', 'Storage NSD').replace('PERIMETER ', '')}</small></div>;
  })}</div>;
}

function RadarChart({ schemes }) {
  const axes = ['Headworks', 'Conveyance', 'Water security', 'O&M fund', 'Market'];
  const palette = ['#43a047', '#0288d1', '#f57c00'];
  const comparisons = schemes.flatMap((scheme) => {
    const provided = scheme.asset_scores;
    const values = Array.isArray(provided) ? provided : provided && axes.map((axis) => Number(provided[axis.toLowerCase().replaceAll(' ', '_')]));
    return values?.length === axes.length && values.every(Number.isFinite)
      ? [{ name: scheme.name.replace(' Irrigation Scheme', '').replace(' Solar', ''), values }]
      : [];
  }).slice(0, 3);
  const point = (value, index) => {
    const angle = (Math.PI * 2 * index / axes.length) - Math.PI / 2;
    const radius = value * 0.72;
    return `${150 + Math.cos(angle) * radius},${136 + Math.sin(angle) * radius}`;
  };
  if (!comparisons.length) return <p className="portal-chart-empty">No verified asset scores have been reported for the selected schemes.</p>;
  return <div className="portal-radar"><svg viewBox="0 0 300 270" role="img" aria-label="Asset performance comparison for schemes with reported scores">
    {[25, 50, 75, 100].map((scale) => <polygon key={scale} points={axes.map((_, index) => point(scale, index)).join(' ')} fill="none" stroke="#dce4eb" />)}
    {axes.map((axis, index) => <line key={axis} x1="150" y1="136" x2={point(105, index).split(',')[0]} y2={point(105, index).split(',')[1]} stroke="#dce4eb" />)}
    {comparisons.map(({ name, values }, index) => <polygon key={name} points={axes.map((_, axis) => point(Number(values[axis]) || 0, axis)).join(' ')} fill={palette[index]} fillOpacity=".12" stroke={palette[index]} strokeWidth="2" />)}
    {axes.map((axis, index) => {
      const [x, y] = point(116, index).split(',');
      return <text className="radar-svg-label" key={axis} x={x} y={y}>{axis}</text>;
    })}
  </svg><div className="portal-radar-legend">{comparisons.map(({ name }, index) => <span key={name}><i style={{ background: palette[index] }} />{name}</span>)}</div></div>;
}

function SustainabilityPage({ schemes }) {
  const challenges = getRiskRows(schemes);
  const portfolioRisk = schemes.length ? Math.round(schemes.reduce((total, scheme) => total + calculateRiskScore(scheme), 0) / schemes.length) : 0;
  const highRiskCount = schemes.filter((scheme) => calculateRiskScore(scheme) >= 50).length;
  const financingCount = schemes.filter((scheme) => (Array.isArray(scheme.risk_factors) ? scheme.risk_factors : []).some((factor) => String(typeof factor === 'string' ? factor : factor.label || '').toLowerCase().includes('financ'))).length;
  const missingMarketCount = schemes.filter((scheme) => !scheme.market || /incomplete|missing/i.test(scheme.market_analysis || '')).length;
  return <>
    <PageHeading icon={ShieldAlert} title="Sustainability & Operational Risk Assessment" description="Strategic bottleneck analysis, climate risk vulnerability, and institutional sustainability priorities" />
    <div className="portal-registry-summary">{[['PORTFOLIO RISK SCORE', `${portfolioRisk}/100`], ['HIGH-RISK SCHEMES', `${highRiskCount} of ${schemes.length}`], ['FINANCING FLAGS', financingCount], ['MISSING MARKET STRATEGIES', missingMarketCount]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className="portal-risk-grid">{challenges.slice(0, 8).map(([risk, count, affected], index) => {
      const severity = count >= 3 ? 'high' : count >= 2 ? 'warning' : 'normal';
      return <div className={`portal-risk-card risk-${severity}`} key={risk}><AlertTriangle size={22} /><div><b>Risk Factor #{index + 1} · {count}/{schemes.length} schemes</b><strong>{risk}</strong><small><MapPin size={12} aria-hidden="true" />{affected}</small></div></div>;
    })}</div>
    <Card><PanelTitle icon={TrendingUp}>Challenge Frequency Analysis</PanelTitle><div className="portal-challenges">{challenges.map(([risk, count]) => <div key={risk}><div><b>{risk}</b><strong>{count}/{schemes.length} ({schemes.length ? Math.round(count / schemes.length * 100) : 0}%)</strong></div><i><span style={{ width: `${schemes.length ? count / schemes.length * 100 : 0}%` }} /></i></div>)}</div></Card>
    <Card><PanelTitle icon={ShieldAlert}>Scheme Risk Scores & Contributing Factors</PanelTitle><div className="portal-risk-scores">{schemes.map((scheme) => <div key={scheme.id}><div><strong>{scheme.name}</strong><span>{scheme.risk_factors?.slice(0, 2).join(' · ') || 'No recorded risk factors'}</span></div><b className={calculateRiskScore(scheme) >= 50 ? 'high' : 'moderate'}>{calculateRiskScore(scheme)} / 100</b></div>)}</div></Card>
  </>;
}

function SchemeTable({ schemes, crops = false, compact = false, admin = null, onEdit, onDelete }) {
  return <div className="portal-table-scroll"><table className="portal-table"><thead><tr>
    {(crops ? ['SCHEME', 'PROVINCE', 'CROPS CULTIVATED', 'MARKET OUTLET', 'MARKET ANALYSIS'] : ['SCHEME NAME', 'PROVINCE', 'DISTRICT', ...(compact ? [] : ['EQUIPPED AREA']), ...(compact ? [] : ['FUNCTIONAL AREA']), 'STATUS', 'WATER SOURCE', ...(compact ? [] : ['OFFICER CONTACT']), ...(admin ? ['ADMIN ACTIONS'] : [])]).map((cell) => <th key={cell}>{cell}</th>)}
  </tr></thead><tbody>{schemes.map((scheme, index) => crops
    ? <tr key={scheme.id ?? index}><td><strong>{scheme.name}</strong></td><td>{scheme.province || '—'}</td><td>{scheme.crop || 'Not reported'}</td><td>{scheme.market || 'Not reported'}</td><td><span className={`portal-market-status ${scheme.market_analysis?.toLowerCase().includes('incomplete') || !scheme.market ? 'incomplete' : ''}`}>{scheme.market_analysis || 'Missing strategy'}</span></td></tr>
    : <tr key={scheme.id ?? index}><td><strong>{scheme.name}</strong><small>{scheme.code}</small></td><td>{scheme.province || '—'}</td><td>{scheme.district}</td>{!compact && <td>{scheme.equipped_area} Ha</td>}{!compact && <td>{scheme.functional_area} Ha</td>}<td><StatusTag>{scheme.status}</StatusTag></td><td>{scheme.source || 'Dam'}</td>{!compact && <td>{scheme.officer_phone ? <a className="portal-phone-link" href={`tel:${scheme.officer_phone}`}>{scheme.officer || scheme.officer_phone}</a> : <span>{scheme.officer || 'Contact not supplied'}</span>}</td>}{admin && <td><div className="portal-admin-row-actions"><button type="button" onClick={() => onEdit(scheme)}>Edit</button><button type="button" className="danger" onClick={() => onDelete(scheme)}>Delete</button></div></td>}</tr>)}</tbody></table></div>;
}

function RegistryPage({ schemes, admin, onAdd, onEdit, onDelete }) {
  const [province, setProvince] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const provinces = [...new Set(schemes.map((scheme) => scheme.province).filter(Boolean))].sort();
  const statuses = [...new Set(schemes.map((scheme) => scheme.status).filter(Boolean))].sort();
  const sources = [...new Set(schemes.map((scheme) => scheme.source).filter(Boolean))].sort();
  const filtered = schemes.filter((scheme) => (!province || scheme.province === province) && (!status || scheme.status === status) && (!source || scheme.source === source));
  return <>
    <PageHeading icon={Database} title="National Irrigation Scheme Registry" description="Verified scheme records, operational classifications, and water resource assignments" action={admin && <button type="button" className="portal-button portal-button-primary" onClick={onAdd}><Plus size={17} /> Add scheme</button>} />
    <Card className="portal-registry-intro"><div><b>National Irrigation Schemes</b><p>Water Survey Baseline 2026 · Provincial & district registry</p></div><span>{schemes.length} SCHEMES</span></Card>
    <div className="portal-registry-summary">{[['TOTAL SCHEMES', schemes.length], ['FULLY FUNCTIONAL', `${schemes.filter((s) => s.status.toLowerCase().includes('fully')).length} / ${schemes.length}`], ['EQUIPPED AREA', `${schemes.reduce((n, s) => n + Number(s.equipped_area || 0), 0).toLocaleString()} Ha`], ['BENEFICIARIES', schemes.reduce((n, s) => n + Number(s.beneficiaries || 0), 0).toLocaleString()]].map(([a,b]) => <div key={a}><span>{a}</span><strong>{b}</strong></div>)}</div>
    <Card><PanelTitle icon={Database} aside={<span className="portal-muted">{admin ? 'Admin CRUD enabled · Create, view, edit & delete' : 'Read-only registry'} · Showing {filtered.length} of {schemes.length}</span>}>Scheme Registry Records</PanelTitle><div className="portal-registry-filters">{[['Province', province, setProvince, provinces], ['Status', status, setStatus, statuses], ['Water source', source, setSource, sources]].map(([label, value, setter, options]) => <label key={label}>{label}<select value={value} onChange={(event) => setter(event.target.value)}><option value="">All {label.toLowerCase()}s</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>)}</div><SchemeTable schemes={filtered} admin={admin} onEdit={onEdit} onDelete={onDelete} /></Card>
  </>;
}

function AssessmentPage({ schemes }) {
  const [openReports, setOpenReports] = useState([]);
  const [query, setQuery] = useState('');
  const toggle = (id) => setOpenReports((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  const printReports = () => window.print();
  return <>
    <PageHeading icon={FileText} title="Scheme Assessment Reports" description="Detailed per-scheme field assessment printable reports — Water Survey Baseline 2026" action={<button className="portal-button portal-button-primary" onClick={printReports}><Printer size={17} /> Print All Reports</button>} />
    <div className="portal-report-kpis">{[['TOTAL SCHEMES', schemes.length, 'neutral'], ['FULLY FUNCTIONAL', `${schemes.filter((s) => s.status.toLowerCase().includes('fully')).length} / ${schemes.length}`, 'green'], ['TOTAL AREA (HA)', schemes.reduce((n, s) => n + Number(s.equipped_area || 0), 0).toLocaleString(), 'blue'], ['BENEFICIARIES', schemes.reduce((n, s) => n + Number(s.beneficiaries || 0), 0).toLocaleString(), 'orange']].map(([label, value, tone]) => <div className={`report-kpi ${tone}`} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <label className="portal-report-search"><Search size={18} /><input value={query} placeholder="Search reports by scheme name, province, or district..." onChange={(event) => setQuery(event.target.value)} /></label>
    <AssessmentList schemes={schemes} openReports={openReports} toggle={toggle} query={query} />
  </>;
}

function AssessmentList({ schemes, openReports, toggle, query }) {
  const matches = schemes.filter((scheme) => `${scheme.name} ${scheme.province} ${scheme.district}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="portal-assessment-list">{matches.map((scheme) => {
    const expanded = openReports.includes(scheme.id);
    return <article className="portal-assessment" key={scheme.id}>
      <div className="portal-assessment-head"><div className="portal-scheme-thumb">{scheme.name.includes('Solar') ? <Sun size={24} /> : <Sprout size={24} />}</div><div className="portal-assessment-name"><span>{scheme.code}</span><StatusTag>{scheme.status}</StatusTag><h3>{scheme.name}</h3><p><MapPin size={14} /> {scheme.province} • {scheme.district} • Ward {scheme.ward}</p></div><button className="portal-expand" onClick={() => toggle(scheme.id)}>{expanded ? 'Collapse' : 'Expand'} <ChevronDown size={16} className={expanded ? 'rotate' : ''} /></button></div>
      <div className="portal-assessment-stats">{[['EQUIPPED AREA', `${scheme.equipped_area} Ha`], ['FUNCTIONAL AREA', `${scheme.functional_area} Ha`], ['BENEFICIARIES', scheme.beneficiaries], ['WATER SOURCE', scheme.source]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      {expanded && <div className="portal-report-details"><h4>Field Assessment Summary</h4><p><b>Operational status:</b> {scheme.status}. The scheme serves farmers in {scheme.district}, {scheme.province}, with {scheme.functional_area} hectares currently functional out of {scheme.equipped_area} hectares equipped.</p><div><span>Functional rate</span><b>{Math.round(scheme.functional_area / scheme.equipped_area * 100)}%</b></div><div><span>Water source</span><b>{scheme.source}</b></div><div><span>Last rehabilitation</span><b>{scheme.rehab}</b></div></div>}
    </article>;
  })}<div className="portal-report-meta"><b>Report Generated:</b> 02/10/2026, 09:31:12 &nbsp;|&nbsp; <b>Data Source:</b> Water Survey Baseline 2026 &nbsp;|&nbsp; <b>Authority:</b> Ministry of Lands, Agriculture, Fisheries, Water & Rural Development — Government of Zimbabwe</div></div>;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('Executive Dashboard');
  const [search, setSearch] = useState('');
  const [schemes, setSchemes] = useState(defaultSchemes);
  const [telemetry, setTelemetry] = useState({});
  const [weather, setWeather] = useState(null);
  const [weatherRefreshError, setWeatherRefreshError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingScheme, setEditingScheme] = useState(null);
  const [adminModalOpen, setAdminModalOpen] = useState(() => new URLSearchParams(window.location.search).has('adminReset'));
  const [adminStatus, setAdminStatus] = useState({ setupRequired: false, admin: null });
  const [notice, setNotice] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [sourceStatuses, setSourceStatuses] = useState([]);
  const syncInProgress = useRef(false);
  const forceRefreshRequested = useRef(false);
  const schemeMutationVersion = useRef(0);
  const refreshDashboard = useCallback(async ({ force = false } = {}) => {
    if (syncInProgress.current) {
      if (force) forceRefreshRequested.current = true;
      return;
    }
    syncInProgress.current = true;
    const schemeVersionAtStart = schemeMutationVersion.current;
    setIsSyncing(true);
    try {
      const [schemeResult, telemetryResult, weatherResult] = await Promise.allSettled([
        fetchSchemes({ force }),
        fetchTelemetry({ force }),
        fetchWeather({ force })
      ]);
      let allFeedsAvailable = false;
      if (schemeResult.status === 'fulfilled' && Array.isArray(schemeResult.value) && schemeResult.value.length
          && schemeVersionAtStart === schemeMutationVersion.current) {
        setSchemes(schemeResult.value);
      } else if (schemeResult.status === 'rejected') {
        console.error('Unable to load irrigation scheme records:', schemeResult.reason);
        setNotice('Live scheme service is unavailable. Showing the latest available survey records.');
      }
      if (telemetryResult.status === 'fulfilled') {
        setTelemetry(telemetryResult.value);
        setSourceStatuses(Array.isArray(telemetryResult.value.sources) ? telemetryResult.value.sources : []);
        setLastSyncedAt(telemetryResult.value.last_synced_at || new Date().toISOString());
        const feeds = telemetryResult.value.sources || [];
        const unavailable = feeds.filter((source) => ['error', 'not_configured'].includes(source.status));
        const partial = feeds.filter((source) => source.status === 'partial');
        allFeedsAvailable = feeds.length > 0 && feeds.every((source) => source.status === 'online');
        if (telemetryResult.value.mode === 'baseline') {
          const noFeedsConfigured = feeds.length > 0 && feeds.every((source) => source.status === 'not_configured');
          setNotice(noFeedsConfigured
            ? 'No live external feeds are configured. Showing the labeled survey baseline until data sources are connected.'
            : 'No usable live telemetry measurements are available. Showing baseline values; check source status below.');
        } else if (partial.length || unavailable.length) {
          const details = [
            partial.length && `Limited measurements: ${partial.map((source) => source.name).join(', ')}`,
            unavailable.length && `Unavailable feeds: ${unavailable.map((source) => source.name).join(', ')}`,
          ].filter(Boolean).join('. ');
          setNotice(`Partial source sync. ${details}.`);
        }
      } else {
        console.error('Unable to load irrigation telemetry:', telemetryResult.reason);
        setNotice('Live telemetry is unavailable. Showing the latest available survey readings.');
      }
      if (weatherResult.status === 'fulfilled') {
        setWeather(weatherResult.value);
        setWeatherRefreshError(false);
      } else {
        console.error('Unable to load weather:', weatherResult.reason);
        setWeatherRefreshError(weatherResult.reason?.feedStatus ?? 'error');
      }

      if (allFeedsAvailable && schemeResult.status === 'fulfilled' && telemetryResult.status === 'fulfilled') setNotice('');
    } finally {
      syncInProgress.current = false;
      setIsSyncing(false);
      if (forceRefreshRequested.current) {
        forceRefreshRequested.current = false;
        void refreshDashboard({ force: true });
      }
    }
  }, []);
  useEffect(() => {
    let active = true;
    fetchAdminStatus().then((status) => {
      if (active) setAdminStatus(status);
    }).catch((error) => {
      console.error('Unable to read administrator status:', error);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    void refreshDashboard();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshDashboard();
    }, DASHBOARD_REFRESH_MS);
    const resumeSync = () => {
      if (document.visibilityState === 'visible') void refreshDashboard({ force: true });
    };
    const recoverOnline = () => void refreshDashboard({ force: true });
    document.addEventListener('visibilitychange', resumeSync);
    window.addEventListener('online', recoverOnline);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', resumeSync);
      window.removeEventListener('online', recoverOnline);
    };
  }, [refreshDashboard]);
  useEffect(() => { document.title = `${activeTab} | AgriTech GOV`; }, [activeTab]);
  const filteredSchemes = useMemo(() => schemes.filter((scheme) => `${scheme.name} ${scheme.district} ${scheme.province || ''} ${scheme.officer || ''}`.toLowerCase().includes(search.trim().toLowerCase())), [schemes, search]);
  const addScheme = async (form) => {
    try {
      const created = await createScheme(form);
      schemeMutationVersion.current += 1;
      setSchemes((current) => [created, ...current]);
      setNotice('Scheme created in the shared registry.');
      setIsModalOpen(false);
    } catch (error) {
      console.error('Unable to save irrigation scheme to the registry:', error);
      throw error;
    }
  };
  const editScheme = async (form) => {
    if (!editingScheme) return;
    try {
      const updated = await updateScheme(editingScheme.id, form);
      schemeMutationVersion.current += 1;
      setSchemes((current) => current.map((scheme) => scheme.id === updated.id ? updated : scheme));
      setNotice('Scheme changes saved to the shared registry.');
      setEditingScheme(null);
    } catch (error) {
      console.error('Unable to update irrigation scheme:', error);
      throw error;
    }
  };
  const removeScheme = async (scheme) => {
    if (!window.confirm(`Delete ${scheme.name} from the shared scheme registry? This cannot be undone.`)) return;
    try {
      await deleteScheme(scheme.id);
      schemeMutationVersion.current += 1;
      setSchemes((current) => current.filter((item) => item.id !== scheme.id));
      setNotice(`${scheme.name} was deleted from the shared registry.`);
    } catch (error) {
      console.error('Unable to delete irrigation scheme:', error);
      setNotice(`Unable to delete ${scheme.name}: ${error.message}`);
    }
  };
  const signOutAdmin = async () => {
    try {
      await logoutAdmin();
      setAdminStatus((current) => ({ ...current, admin: null }));
      setNotice('Administrator signed out.');
    } catch (error) {
      console.error('Unable to sign out administrator:', error);
      setNotice(`Unable to sign out: ${error.message}`);
    }
  };
  const openAdminAccess = async () => {
    try {
      setAdminStatus(await fetchAdminStatus());
    } catch (error) {
      console.error('Unable to refresh administrator status:', error);
      setNotice(`Administrator service unavailable: ${error.message}`);
    }
    setAdminModalOpen(true);
  };
  const exportCSV = () => {
    const columns = ['Code', 'Name', 'Province', 'District', 'Equipped Area (Ha)', 'Functional Area (Ha)', 'Functional Coverage (%)', 'Beneficiaries', 'Status', 'Water Source', 'Crops', 'Market Outlet', 'Market Analysis', 'Officer', 'Officer Phone'];
    const rows = schemes.map((scheme) => [
      scheme.code, scheme.name, scheme.province, scheme.district, scheme.equipped_area,
      scheme.functional_area,
      scheme.equipped_area ? (Number(scheme.functional_area) / Number(scheme.equipped_area) * 100).toFixed(1) : 0,
      scheme.beneficiaries, scheme.status, scheme.source, scheme.crop, scheme.market,
      scheme.market_analysis, scheme.officer, scheme.officer_phone,
    ].map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','));
    const blob = new Blob([[columns.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'zimbabwe-irrigation-schemes.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const reset = () => { setSearch(''); setNotice(''); setActiveTab('Executive Dashboard'); setSchemes(defaultSchemes); };
  const telemetryStatus = telemetry.status || 'BASELINE';
  const gisOnline = sourceStatuses.some((source) => source.status === 'online' && /gis|satellite/i.test(source.name));
  const page = {
    'Executive Dashboard': (
      <ExecutiveDashboard
        schemes={filteredSchemes}
        telemetry={telemetry}
        weather={weather}
        weatherRefreshError={weatherRefreshError}
        onViewRegistry={() => setActiveTab('Scheme Data Registry')}
        setActiveTab={setActiveTab}
      />
    ),
    'GIS Spatial Telemetry Map': <GisPage schemes={filteredSchemes} />,
    'Water & Telemetry': <WaterPage schemes={filteredSchemes} telemetry={telemetry} />,
    'Agronomic & Crops': <AgronomyPage schemes={filteredSchemes} telemetry={telemetry} />,
    'Infrastructure & O&M': <InfrastructurePage schemes={filteredSchemes} />,
    'Sustainability & Risks': <SustainabilityPage schemes={filteredSchemes} />,
    'Scheme Data Registry': <RegistryPage schemes={filteredSchemes} admin={adminStatus.admin} onAdd={() => setIsModalOpen(true)} onEdit={setEditingScheme} onDelete={removeScheme} />,
    'Assessment Reports': <AssessmentPage schemes={filteredSchemes} />,
  }[activeTab];
  return <div className="portal-shell">
    <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} schemeCount={schemes.length} />
    <div className="portal-workspace">
      <Header search={search} setSearch={setSearch} onAddClick={() => setIsModalOpen(true)} onExportCSV={exportCSV} onReset={reset} schemeCount={schemes.length} isSyncing={isSyncing} lastSyncedAt={lastSyncedAt} telemetryStatus={telemetryStatus} gisOnline={gisOnline} onRefresh={() => refreshDashboard({ force: true })} admin={adminStatus.admin} onAdminClick={openAdminAccess} onAdminLogout={signOutAdmin} />
      <main className={`portal-main${activeTab === 'Executive Dashboard' ? ' portal-main-dashboard' : ''}`}>
        <div className="portal-page-transition" key={activeTab}>
          {notice && <div className="portal-notice" role="status">{notice}</div>}
          {page}
          <footer className="portal-footer"><span>© 2026 Government of Zimbabwe • Ministry of Lands, Agriculture, Fisheries, Water & Rural Development</span><strong>National Irrigation Portal v2.0</strong><strong>Water Survey Baseline</strong></footer>
        </div>
      </main>
    </div>
    <AddSchemeModal open={isModalOpen || Boolean(editingScheme)} onClose={() => { setIsModalOpen(false); setEditingScheme(null); }} onSubmit={editingScheme ? editScheme : addScheme} scheme={editingScheme} />
    <AdminAccessModal open={adminModalOpen} setupRequired={adminStatus.setupRequired} onClose={() => setAdminModalOpen(false)} onAuthenticated={(admin) => {
      setAdminStatus({ setupRequired: false, admin });
      setNotice(`Signed in as ${admin.email}. Scheme registry editing is enabled.`);
    }} />
    <PortalAssistant context={{ schemes, telemetry, weather, admin: adminStatus.admin, currentPage: activeTab }} />
  </div>;
}
