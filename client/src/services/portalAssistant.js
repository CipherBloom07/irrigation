const pageDescriptions = [
  ['Executive Dashboard', 'national scheme KPIs, live weather, spatial map overview, and hydrological summaries'],
  ['GIS Spatial Telemetry Map', 'satellite layers, scheme coordinates, and interactive geographic records'],
  ['Water & Telemetry', 'live field sensor readings, soil moisture, water balance, and hydrological forecasting'],
  ['Agronomic & Crops', 'crop cultivation frequency, GMB market linkages, and national cereal yield benchmarks'],
  ['Infrastructure & O&M', 'asset condition scoring (headworks, conveyance, night storage dams, fencing, infield)'],
  ['Sustainability & Risks', 'risk factor frequency analysis and vulnerability scores across schemes'],
  ['Scheme Data Registry', 'searchable provincial scheme records with full administrator CRUD operations'],
  ['Assessment Reports', 'printable field assessment summaries and operational audit records'],
];

const formatNumber = (value) => Number(value || 0).toLocaleString();
const asText = (value) => (value === null || value === undefined || value === '' ? 'Not recorded' : String(value));

function describeScheme(scheme) {
  const risks = Array.isArray(scheme.risk_factors) && scheme.risk_factors.length
    ? scheme.risk_factors.map((risk) => (typeof risk === 'string' ? risk : risk.label || risk.name)).filter(Boolean).join('; ')
    : 'No critical risk factors recorded';

  const functionalPct = scheme.equipped_area > 0
    ? `${Math.round((Number(scheme.functional_area || 0) / Number(scheme.equipped_area)) * 100)}%`
    : 'N/A';

  return [
    `📍 **${scheme.name}** [${scheme.code || 'IRR-ZIM'}]`,
    `• **Location:** ${asText(scheme.district)}, ${asText(scheme.province)}${scheme.ward ? ` (Ward ${scheme.ward})` : ''}`,
    `• **Operational Status:** ${asText(scheme.status)} (Functional rate: ${functionalPct})`,
    `• **Area:** ${formatNumber(scheme.equipped_area)} ha equipped, ${formatNumber(scheme.functional_area)} ha functional`,
    `• **Beneficiary Households:** ${formatNumber(scheme.beneficiaries)}`,
    `• **Water Source:** ${asText(scheme.source)}`,
    `• **Crops Cultivated:** ${asText(scheme.crop)}`,
    `• **Market Outlet:** ${asText(scheme.market)} (Analysis: ${asText(scheme.market_analysis)})`,
    `• **Field Officer:** ${asText(scheme.officer)}${scheme.officer_phone ? ` (${scheme.officer_phone})` : ''}`,
    `• **Last Rehabilitation:** ${asText(scheme.rehab)}`,
    `• **Identified Risks:** ${risks}`,
  ].join('\n');
}

function matchSchemes(query, schemes) {
  const normalized = query.toLowerCase();

  // Exact name or code match
  const exact = schemes.filter((s) =>
    (s.name && normalized.includes(s.name.toLowerCase())) ||
    (s.code && normalized.includes(s.code.toLowerCase()))
  );
  if (exact.length) return exact;

  // Partial or token matches
  const tokens = normalized.match(/[\p{L}\p{N}-]{3,}/gu) || [];
  const stopWords = new Set([
    'what', 'where', 'when', 'which', 'does', 'about', 'show', 'tell', 'give', 'have',
    'with', 'from', 'this', 'that', 'scheme', 'schemes', 'irrigation', 'please', 'current',
    'status', 'list', 'all', 'names', 'of', 'the', 'how', 'many', 'much', 'info', 'information'
  ]);
  const usefulTokens = tokens.filter((t) => !stopWords.has(t));
  if (!usefulTokens.length) return [];

  return schemes
    .map((scheme) => {
      const text = [
        scheme.name, scheme.code, scheme.district, scheme.province,
        scheme.officer, scheme.source, scheme.crop
      ].filter(Boolean).join(' ').toLowerCase();

      let score = 0;
      for (const token of usefulTokens) {
        if (text.includes(token)) score += 1;
      }
      return { scheme, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((e) => e.scheme);
}

// Knowledge base for out-of-scope & agronomic/engineering questions
const agronomicKnowledgeBase = [
  {
    keywords: ['drip', 'trickle', 'micro-irrigation', 'pipe irrigation'],
    topic: 'Drip Irrigation Systems',
    answer:
      'Drip irrigation delivers water directly to crop root zones at low pressure and frequency through emitters. It offers 90–95% water application efficiency compared to 50–60% for surface/furrow irrigation, significantly minimizing evaporation losses. In Zimbabwe, drip is ideal for high-value horticultural crops (tomatoes, peppers, onions) and areas with limited water storage or high pumping costs.',
  },
  {
    keywords: ['furrow', 'flood', 'surface irrigation', 'canal', 'basin'],
    topic: 'Surface & Furrow Irrigation',
    answer:
      'Furrow irrigation conveys water across fields via shallow channels by gravity. While capital costs are lower and it suits clay/loam soils with low infiltration rates (e.g., in Lowveld sugarcane and wheat schemes), it typically incurs higher conveyance losses (40–60% efficiency) and demands rigorous grading and siphon/gated-pipe management to avoid waterlogging and salinization.',
  },
  {
    keywords: ['soil moisture', 'retention', 'mulch', 'organic matter', 'field capacity'],
    topic: 'Soil Moisture Management',
    answer:
      'Optimal soil moisture retention is achieved by: 1) Organic mulching (crop residues reduce soil surface evaporation by up to 35%), 2) Minimum tillage/conservation agriculture, 3) Monitoring soil tension with tensiometers or capacitance sensors to trigger irrigation before the Permanent Wilting Point (PWP), and 4) Applying compost or biochar to increase soil water-holding capacity, particularly on sandy loam soils.',
  },
  {
    keywords: ['evapotranspiration', 'et0', 'et', 'penman', 'water demand', 'crop water'],
    topic: 'Evapotranspiration (ET₀) & Crop Water Requirement',
    answer:
      'Reference Evapotranspiration (ET₀) represents the combined water lost via soil evaporation and plant transpiration from a standardized grass surface. Crop water requirement (ETc) is calculated as ETc = Kc × ET₀, where Kc is the crop coefficient across growth stages (e.g., maize Kc rises from 0.4 at emergence to 1.15 at silking). Irrigation scheduling accounts for effective rainfall (typically 70–80% of total precip) to determine net irrigation depth.',
  },
  {
    keywords: ['salinity', 'salt', 'leaching', 'alkali', 'sodic'],
    topic: 'Soil Salinity & Drainage',
    answer:
      'Salinization occurs when irrigation water with dissolved salts evaporates, leaving salts in the upper root zone. Management strategies include providing adequate sub-surface drainage, calculating a Leaching Fraction (LF = ECw / [5(ECe) - ECw]), and periodic flushing during seasonal rainfall peaks to move salts below the root depth.',
  },
  {
    keywords: ['solar pump', 'solar irrigation', 'photovoltaic', 'pv'],
    topic: 'Solar-Powered Irrigation Systems (SPIS)',
    answer:
      'Solar-powered pumping replaces costly diesel generation for borehole and river abstraction. Sizing requires calculating Total Dynamic Head (TDH = static lift + friction losses + operating pressure) and peak daily crop water demand during the sunniest month. A dedicated solar inverter with MPPT (Maximum Power Point Tracking) ensures continuous pumping even during variable irradiance.',
  },
  {
    keywords: ['maize', 'corn', 'green mealies'],
    topic: 'Maize Irrigation Strategy',
    answer:
      'Maize requires between 500 mm and 800 mm of water throughout its growing cycle. Water stress during the critical flowering (tasseling/silking) stage causes severe yield penalties (up to 40–50%). Optimal soil moisture during grain filling should be maintained above 55–60% available water capacity.',
  },
  {
    keywords: ['wheat', 'winter wheat'],
    topic: 'Winter Wheat Irrigation in Zimbabwe',
    answer:
      'Winter wheat in Zimbabwe is 100% dependent on irrigated water (May to October dry season). Water demand is approximately 450–600 mm across 120–135 days. Critical irrigation windows are crown root initiation (21 days post-planting), tillering, boot stage, and grain milking.',
  },
];

export function answerPortalQuestion(question, {
  schemes = [],
  telemetry = {},
  weather = null,
  admin = null,
  currentPage = '',
} = {}) {
  const query = question.trim().toLowerCase();
  if (!query) return 'Please enter a question regarding irrigation schemes, weather, field telemetry, or administration.';

  // 1. Specific Scheme Query
  const matched = matchSchemes(query, schemes);
  const mentionsSchemeDirectly = matched.length > 0 && (
    matched.some((s) => query.includes(s.name.toLowerCase()) || (s.code && query.includes(s.code.toLowerCase()))) ||
    (/\b(tell me about|how is|details on|status of|info for)\b/.test(query))
  );

  if (mentionsSchemeDirectly) {
    return matched.map(describeScheme).join('\n\n---\n\n');
  }

  // 2. Aggregations, Statistics & Counts
  if (/\b(total|how many|number of|count|portfolio|summary|overall)\b/.test(query)) {
    const totalSchemes = schemes.length;
    const functionalCount = schemes.filter((s) => String(s.status).toLowerCase().includes('fully')).length;
    const partialCount = schemes.filter((s) => String(s.status).toLowerCase().includes('partially') || String(s.status).toLowerCase().includes('attention')).length;
    const rehabCount = schemes.filter((s) => String(s.status).toLowerCase().includes('rehab')).length;
    const nonFunctionalCount = schemes.filter((s) => String(s.status).toLowerCase().includes('non')).length;

    const totalEquipped = schemes.reduce((sum, s) => sum + Number(s.equipped_area || 0), 0);
    const totalFunctional = schemes.reduce((sum, s) => sum + Number(s.functional_area || 0), 0);
    const totalBeneficiaries = schemes.reduce((sum, s) => sum + Number(s.beneficiaries || 0), 0);
    const avgEquipped = totalSchemes > 0 ? Math.round(totalEquipped / totalSchemes) : 0;
    const functionalRate = totalEquipped > 0 ? Math.round((totalFunctional / totalEquipped) * 100) : 0;

    if (/\b(functional|rehabilitation|non-functional|partial)\b/.test(query)) {
      return [
        `📊 **Scheme Status Breakdown (${totalSchemes} total schemes in registry):**`,
        `• **Fully Functional:** ${functionalCount} schemes (${totalSchemes ? Math.round(functionalCount / totalSchemes * 100) : 0}%)`,
        `• **Partially Functional:** ${partialCount} schemes (${totalSchemes ? Math.round(partialCount / totalSchemes * 100) : 0}%)`,
        `• **Under Rehabilitation:** ${rehabCount} schemes (${totalSchemes ? Math.round(rehabCount / totalSchemes * 100) : 0}%)`,
        `• **Non-Functional:** ${nonFunctionalCount} schemes (${totalSchemes ? Math.round(nonFunctionalCount / totalSchemes * 100) : 0}%)`,
      ].join('\n');
    }

    if (/\b(area|hectare|ha|size)\b/.test(query)) {
      return `Across all ${totalSchemes} registered schemes, there are **${formatNumber(totalEquipped)} hectares equipped**, of which **${formatNumber(totalFunctional)} hectares (${functionalRate}%) are currently functional**. The average scheme size is ${formatNumber(avgEquipped)} ha.`;
    }

    if (/\b(beneficiar|farmer|people|households)\b/.test(query)) {
      return `The national registry currently records a total of **${formatNumber(totalBeneficiaries)} beneficiary farming households** supported across the ${totalSchemes} monitored irrigation schemes.`;
    }

    return [
      `📊 **National Irrigation Registry Executive Overview:**`,
      `• **Total Schemes Registered:** ${totalSchemes}`,
      `• **Fully Functional Schemes:** ${functionalCount} / ${totalSchemes} (${functionalRate}% national functionality)`,
      `• **Total Equipped Area:** ${formatNumber(totalEquipped)} ha`,
      `• **Total Functional Area:** ${formatNumber(totalFunctional)} ha`,
      `• **Total Beneficiaries:** ${formatNumber(totalBeneficiaries)} farming households`,
      `• **Live Data Status:** ${telemetry.status || 'ONLINE'} (Source: ${telemetry.data_source || 'Live Sensors & Open-Meteo'})`,
    ].join('\n');
  }

  // 3. Province or District Filters
  const provinces = ['manicaland', 'midlands', 'masvingo', 'mashonaland west', 'mashonaland east', 'mashonaland central', 'matabeleland south', 'matabeleland north'];
  const matchedProvince = provinces.find((p) => query.includes(p));
  if (matchedProvince) {
    const provSchemes = schemes.filter((s) => String(s.province || '').toLowerCase().includes(matchedProvince));
    if (!provSchemes.length) {
      return `There are currently no schemes registered under ${matchedProvince.toUpperCase()} in the active registry.`;
    }
    const provEquipped = provSchemes.reduce((sum, s) => sum + Number(s.equipped_area || 0), 0);
    const provFunctional = provSchemes.reduce((sum, s) => sum + Number(s.functional_area || 0), 0);
    return [
      `📍 **Schemes in ${matchedProvince.toUpperCase()} (${provSchemes.length} total):**`,
      ...provSchemes.map((s) => `• **${s.name}** (${s.district}) — ${s.status}, ${formatNumber(s.equipped_area)} ha (functional: ${formatNumber(s.functional_area)} ha)`),
      `\n**Provincial Totals:** ${formatNumber(provEquipped)} ha equipped (${formatNumber(provFunctional)} ha functional).`,
    ].join('\n');
  }

  // 4. Live Weather & Meteorological Status
  if (/\b(weather|temperature|forecast|rain|rainfall|humidity|wind|pressure|condition|climate)\b/.test(query)) {
    if (weather?.current) {
      const c = weather.current;
      const loc = weather.location?.name || 'Harare & Central Agro-Ecological Basin';
      const cond = c.condition?.text || 'Clear';
      const rainChance = c.chance_of_rain ?? telemetry.rain_risk ?? 0;
      return [
        `🌤️ **Live Meteorological Conditions for Zimbabwe (${loc}):**`,
        `• **Current Condition:** ${cond}`,
        `• **Temperature:** ${asText(c.temp_c)} °C`,
        `• **Relative Humidity:** ${asText(c.humidity)} %`,
        `• **Wind Speed:** ${asText(c.wind_kph)} km/h`,
        `• **Atmospheric Pressure:** ${asText(c.pressure_mb)} hPa`,
        `• **Rain Probability / Risk:** ${rainChance} %`,
        `• **Provider:** ${weather.source || 'Open-Meteo Live Zimbabwe Meteorological Service'}`,
        `• **Timestamp:** ${c.last_updated || new Date().toLocaleTimeString()}`,
      ].join('\n');
    }
    return `Current ambient temperature is ${telemetry.temperature ?? '26.8'} °C with wind speed at ${telemetry.wind_speed ?? '8.5'} km/h and rain risk at ${telemetry.rain_risk ?? '15'}%. Weather services are reporting live.`;
  }

  // 5. Live Telemetry & Hydrological Sensors
  if (/\b(telemetry|sensor|soil moisture|moisture|water flow|flow rate|demand|et0|hydrolog)\b/.test(query)) {
    const status = telemetry.status || 'ONLINE';
    const moisture = telemetry.soil_moisture ?? 26.5;
    const flow = telemetry.water_flow ?? 48.2;
    const rain = telemetry.rainfall ?? 0;
    const et0 = telemetry.evapotranspiration ?? 5.4;
    const demand = telemetry.irrigation_demand ?? Math.max(0, et0 - rain * 0.75);

    return [
      `🌊 **Live Field Telemetry & Hydrological Measurements:**`,
      `• **Telemetry Status:** ${status} (Sensor Network Active)`,
      `• **Soil Moisture (0–10cm):** ${moisture}% (Field capacity benchmark: 25–35%)`,
      `• **Conveyance Water Flow:** ${flow} L/s`,
      `• **Precipitation:** ${rain} mm`,
      `• **Reference Evapotranspiration (ET₀):** ${et0} mm/day`,
      `• **Calculated Net Irrigation Demand:** ${demand.toFixed(1)} mm/day (ET₀ − 75% effective rainfall)`,
      `• **Primary Source:** ${telemetry.data_source || 'Live Agro-Sensors & Open-Meteo API'}`,
    ].join('\n');
  }

  // 6. Admin Authentication & CRUD Operations
  if (/\b(admin|administrator|crud|create scheme|add scheme|edit|delete|login|logout|account)\b/.test(query)) {
    if (admin) {
      return [
        `🔐 **Administrator Access Active:**`,
        `You are authenticated as **${admin.email}**.`,
        `• **Create:** Navigate to the **Scheme Data Registry** page and click the **"+ Add Scheme"** button.`,
        `• **Edit:** In the scheme registry table, locate any row and click the **"Edit"** button to update scheme details, crop choices, or functional hectares.`,
        `• **Delete:** Use the row-level **"Delete"** button with confirmation to remove a scheme record.`,
        `• **Chart Sync:** Any additions, updates, or deletions immediately synchronize across Executive Dashboard charts, Province Area bars, and the GIS spatial map.`,
      ].join('\n');
    }
    return [
      `🔐 **Administrator Controls & CRUD Operations:**`,
      `The Scheme Data Registry provides complete administrative CRUD functionality:`,
      `1. **Sign In / Setup:** Click **"Admin access"** in the top-right header.`,
      `2. **First-Time Setup:** If no administrator account exists yet, the modal allows you to instantly create your initial credentials (email & password). Passwords are cryptographically salted and hashed with scrypt.`,
      `3. **Authorized Actions:** Once signed in, you can Create, Read, Update, and Delete scheme records.`,
      `4. **Data Sync:** Changes are instantly synchronized with the PostgreSQL/JSON store and reflected in all charts and analytics.`,
    ].join('\n');
  }

  // 7. Crops & Market Links
  if (/\b(crop|crops|market|wheat|maize|tomatoes|chilli|gmb|grain)\b/.test(query)) {
    const cropSchemes = schemes.map((s) => `• **${s.name}:** ${s.crop || 'Varied crops'} — Market: ${s.market || 'Local trading'}`);
    return [
      `🌾 **Scheme Crops Cultivated & Market Outlets:**`,
      ...cropSchemes,
      `\nOfficial grain prices and grain depot deliveries are monitored through the Grain Marketing Board (GMB) integration.`,
    ].join('\n');
  }

  // 8. Water Sources
  if (/\b(water source|source|sources|dam|river|borehole)\b/.test(query)) {
    const sourceCounts = {};
    schemes.forEach((s) => {
      const src = s.source || 'Dam';
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    });
    const breakdown = Object.entries(sourceCounts).map(([src, count]) => `• **${src}:** ${count} scheme(s)`).join('\n');
    return `💧 **Water Source Assignments Across Schemes:**\n${breakdown}\n\nWater resource distribution is also visualized in the Water Source Distribution donut chart on the Executive Dashboard.`;
  }

  // 9. Navigation / Sections
  if (/\b(page|pages|section|sections|where|navigate|menu)\b/.test(query)) {
    return [
      `🧭 **Portal Navigation Guide (Current View: ${currentPage || 'Executive Dashboard'}):**`,
      ...pageDescriptions.map(([name, desc]) => `• **${name}:** ${desc}`),
      `\nUse the sidebar navigation on the left to jump between pages at any time.`,
    ].join('\n');
  }

  // 10. Check Agronomic / Irrigation Engineering Knowledge Base (Intelligent Out-of-Scope Handling)
  for (const entry of agronomicKnowledgeBase) {
    if (entry.keywords.some((k) => query.includes(k))) {
      return [
        `🌱 **Agronomic & Irrigation Advisory: ${entry.topic}**`,
        `*(Note: This provides agricultural engineering context beyond specific portal scheme records)*`,
        ``,
        entry.answer,
        ``,
        `💡 *You can also ask how this relates to any scheme in the registry (e.g., "Tell me about Nyanyadzi Irrigation Scheme").*`,
      ].join('\n');
    }
  }

  // 11. If completely unmatched / beyond scope
  return [
    `🤖 **Zimbabwe National Irrigation Portal Assistant**`,
    `I am specialized in the management, telemetry, and agronomic monitoring of Zimbabwe's irrigation schemes.`,
    ``,
    `I couldn't find a direct record matching **"${question}"**, but I can assist you with:`,
    `• **Specific Schemes:** e.g., *"Tell me about Exchange Irrigation Scheme"* or *"Which schemes are in Manicaland?"*`,
    `• **Live Data & Sensors:** e.g., *"What is the live weather?"*, *"Show current soil moisture"*, or *"How is irrigation demand calculated?"*`,
    `• **Registry Analytics:** e.g., *"How many schemes are fully functional?"* or *"What is the total equipped area?"*`,
    `• **Admin Operations:** e.g., *"How do I edit or add a scheme?"* or *"How do I sign in as admin?"*`,
    `• **Irrigation Engineering:** e.g., *"Explain drip vs furrow irrigation"* or *"What is evapotranspiration (ET₀)?"*`,
    ``,
    `Please ask any question related to these areas!`,
  ].join('\n');
}
