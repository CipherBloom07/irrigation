import { pool } from '../config/db.js';
import { findFeedRecord, refreshExternalFeeds } from '../services/externalFeeds.js';
import { readLocalSchemes } from '../services/localSchemeStore.js';

const baselineSchemes = [
  { id: 1, code: 'IRR-ZIM-001', name: 'Nyanyadzi Irrigation Scheme', equipped_area: 412, functional_area: 290, beneficiaries: 420, status: 'Partially Functional', district: 'Chimanimani', province: 'Manicaland', ward: 8, source: 'River', crop: 'Green mealies, wheat', market: 'Mutare Market', market_analysis: 'High demand', officer: 'Tendai Mutasa', rehab: 2018, risk_factors: ['Inefficient, unreliable, and inequitable water delivery service', 'Rapid deterioration of infrastructure', 'Incapacitated to sustainably operate and maintain irrigation infrastructure', 'Difficulties accessing finances (loans & credits)'] },
  { id: 2, code: 'IRR-ZIM-002', name: 'Exchange Irrigation Scheme', equipped_area: 525, functional_area: 480, beneficiaries: 980, status: 'Fully Functional', district: 'Zhombe', province: 'Midlands', ward: 14, source: 'Dam', crop: 'Wheat, green mealies', market: 'GMB Kwekwe', market_analysis: 'High demand', officer: 'Chipo Zhou', rehab: 2022, risk_factors: ['Difficulties accessing finances (loans & credits)', 'Unsustainable plot sizes'] },
  { id: 3, code: 'IRR-ZIM-003', name: 'Tshovane Irrigation Scheme', equipped_area: 180, functional_area: 110, beneficiaries: 140, status: 'Under Rehabilitation', district: 'Chiredzi', province: 'Masvingo', ward: 5, source: 'Borehole', crop: 'Tomatoes, grain maize', market: 'Chiredzi Market', market_analysis: 'Incomplete', officer: 'Tatenda Moyo', rehab: 2024, risk_factors: ['Incapacitated to sustainably operate and maintain irrigation infrastructure', 'Lack of government policy on irrigation', 'Confusion on ownership of the irrigation scheme', 'Farmers are not committed to their projects'] },
  { id: 4, code: 'IRR-ZIM-004', name: 'Mubaira Solar Irrigation Scheme', equipped_area: 95, functional_area: 95, beneficiaries: 85, status: 'Fully Functional', district: 'Mhondoro-Ngezi', province: 'Mashonaland West', ward: 2, source: 'Borehole', crop: 'Wheat, green mealies', market: 'Harare Market', market_analysis: 'High demand', officer: 'Rudo Moyo', rehab: 2021, risk_factors: [] },
  { id: 5, code: 'IRR-ZIM-005', name: 'Silalatshani Irrigation Scheme', equipped_area: 850, functional_area: 310, beneficiaries: 853, status: 'Partially Functional', district: 'Insiza', province: 'Matabeleland South', ward: 11, source: 'Dam', crop: 'Potatoes, chilli, butternuts', market: 'Bulawayo Market', market_analysis: 'Moderate', officer: 'Bhekinkosi Ncube', rehab: 2019, risk_factors: ['Rapid deterioration of infrastructure', 'Inefficient, unreliable, and inequitable water delivery service', 'Incapacitated to sustainably operate and maintain irrigation infrastructure'] },
];

function standardStatus(status) {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (normalized === 'functional' || normalized === 'fully functional') return 'Fully Functional';
  if (normalized === 'needs attention' || normalized === 'partially functional') return 'Partially Functional';
  if (normalized === 'under rehabilitation') return 'Under Rehabilitation';
  if (normalized === 'non-functional' || normalized === 'nonfunctional') return 'Non-Functional';
  return status || 'Non-Functional';
}

function isDatabaseUnavailable(error) {
  const unavailableCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT']);
  return unavailableCodes.has(error.code)
    || (Array.isArray(error.errors) && error.errors.some(isDatabaseUnavailable));
}

function mergeConfiguredData(schemes, feeds) {
  return schemes.map((scheme) => {
    const gisRecord = findFeedRecord(feeds.satellite, scheme);
    const agronomyRecord = findFeedRecord(feeds.agronomy, scheme);
    const { water_source: gisSource, coordinates, ...gisFields } = gisRecord ?? {};
    const { crops, market_outlet: market, ...agronomyFields } = agronomyRecord ?? {};
    return {
      ...scheme,
      ...gisFields,
      ...agronomyFields,
      ...(gisSource && { source: gisSource }),
      ...(coordinates && { coordinates }),
      ...(crops && { crop: Array.isArray(crops) ? crops.join(', ') : crops }),
      ...(market && { market }),
      status: standardStatus(scheme.status),
    };
  });
}

export const getSchemes = async (req, res) => {
  let schemes;
  try {
    const result = await pool.query('SELECT * FROM schemes ORDER BY id ASC');
    schemes = result.rows.length ? result.rows : await readLocalSchemes() ?? baselineSchemes;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      console.error('Unable to read the scheme registry:', error);
      return res.status(500).json({ error: 'The scheme registry could not be read.' });
    }
    console.warn('PostgreSQL is unavailable; reading the local scheme store.');
    try {
      schemes = await readLocalSchemes() ?? baselineSchemes;
    } catch (storeError) {
      console.error('Unable to read the local scheme store:', storeError);
      return res.status(500).json({ error: 'The local scheme store could not be read.' });
    }
  }

  const refreshed = await refreshExternalFeeds({ force: req.query.refresh === '1' });
  res.json(mergeConfiguredData(schemes, refreshed.feeds));
};

function validateScheme(input) {
  const {
    name, equipped_area, functional_area, beneficiaries, status, district, province,
    ward, source, crop, market, market_analysis, officer, officer_phone, rehab,
    asset_scores, risk_factors,
  } = input ?? {};
  const equipped = Number(equipped_area);
  const functional = Number(functional_area);
  const beneficiaryCount = Number(beneficiaries);
  const allowedStatuses = ['Fully Functional', 'Partially Functional', 'Under Rehabilitation', 'Non-Functional'];
  const normalizedStatus = standardStatus(status);
  if (typeof name !== 'string' || typeof district !== 'string' || typeof province !== 'string'
      || !name.trim() || !district.trim() || !province.trim()) {
    return { error: 'Scheme name, province, and district are required.' };
  }
  const numericInput = (value) => typeof value === 'number' || typeof value === 'string' && value.trim() !== '';
  if (!numericInput(equipped_area) || !numericInput(functional_area)
      || !Number.isFinite(equipped) || equipped <= 0
      || !Number.isFinite(functional) || functional < 0 || functional > equipped) {
    return { error: 'Area values must be valid, and functional area cannot exceed equipped area.' };
  }
  if (!numericInput(beneficiaries) || !Number.isInteger(beneficiaryCount) || beneficiaryCount < 0) {
    return { error: 'Beneficiaries must be a non-negative whole number.' };
  }
  if (!allowedStatuses.includes(normalizedStatus)) {
    return { error: 'Select a supported scheme status.' };
  }
  if (officer_phone && !/^[+()\d\s.-]{7,25}$/.test(String(officer_phone))) {
    return { error: 'Enter a valid officer phone number.' };
  }
  const wardNumber = ward === null || ward === '' || ward === undefined ? null : Number(ward);
  const rehabYear = rehab === null || rehab === '' || rehab === undefined ? null : Number(rehab);
  const optionalText = [
    ['water source', source, 120],
    ['crops', crop, 1000],
    ['market outlet', market, 250],
    ['market analysis', market_analysis, 1000],
    ['field officer', officer, 200],
    ['officer phone', officer_phone, 25],
  ];
  const invalidText = optionalText.find(([, value, maximum]) => value !== null && value !== undefined && (typeof value !== 'string' || value.length > maximum));
  if (name.trim().length > 200 || district.trim().length > 120 || province.trim().length > 120 || invalidText) {
    return { error: invalidText ? `The ${invalidText[0]} field is too long or invalid.` : 'Scheme name, district, or province is too long.' };
  }
  if (wardNumber !== null && (!Number.isInteger(wardNumber) || wardNumber < 1)) {
    return { error: 'Ward must be a positive whole number.' };
  }
  if (wardNumber !== null && !numericInput(ward)) return { error: 'Ward must be a positive whole number.' };
  if (rehabYear !== null && (!Number.isInteger(rehabYear) || rehabYear < 1900 || rehabYear > 2200)) {
    return { error: 'Rehabilitation year must be valid.' };
  }
  if (rehabYear !== null && !numericInput(rehab)) return { error: 'Rehabilitation year must be valid.' };
  if (asset_scores !== null && asset_scores !== undefined && (typeof asset_scores !== 'object' || Array.isArray(asset_scores))) {
    return { error: 'Asset ratings must be a structured object.' };
  }
  if (risk_factors !== null && risk_factors !== undefined && (!Array.isArray(risk_factors) || risk_factors.length > 100)) {
    return { error: 'Risk factors must be a list of at most 100 items.' };
  }

  return { scheme: {
    name: String(name).trim(),
    equipped_area: equipped,
    functional_area: functional,
    beneficiaries: beneficiaryCount,
    status: normalizedStatus,
    district: String(district).trim(),
    province: String(province).trim(),
    ward: wardNumber,
    source: source ? String(source).trim() : null,
    crop: crop ? String(crop).trim() : null,
    market: market ? String(market).trim() : null,
    market_analysis: market_analysis ? String(market_analysis).trim() : null,
    officer: officer ? String(officer).trim() : null,
    officer_phone: officer_phone ? String(officer_phone).trim() : null,
    rehab: rehabYear,
    asset_scores: asset_scores ?? null,
    risk_factors: risk_factors ?? null,
  } };
}

async function saveScheme(scheme, res, id = null) {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    let result;
    if (id === null) {
      const nextId = await client.query("SELECT nextval(pg_get_serial_sequence('schemes', 'id')) AS id");
      const nextSchemeId = nextId.rows[0].id;
      const code = `IRR-ZIM-${String(nextSchemeId).padStart(3, '0')}`;
      result = await client.query(
        `INSERT INTO schemes
          (id, code, name, equipped_area, functional_area, beneficiaries, status, district, province, ward, source, crop, market, market_analysis, officer, officer_phone, rehab, asset_scores, risk_factors, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19::jsonb, NOW())
         RETURNING *`,
        [
          nextSchemeId, code, scheme.name, scheme.equipped_area, scheme.functional_area,
          scheme.beneficiaries, scheme.status, scheme.district, scheme.province, scheme.ward,
          scheme.source, scheme.crop, scheme.market, scheme.market_analysis, scheme.officer,
          scheme.officer_phone, scheme.rehab,
          scheme.asset_scores ? JSON.stringify(scheme.asset_scores) : null,
          scheme.risk_factors ? JSON.stringify(scheme.risk_factors) : null,
        ],
      );
    } else {
      result = await client.query(
        `UPDATE schemes
         SET name = $1, equipped_area = $2, functional_area = $3, beneficiaries = $4,
             status = $5, district = $6, province = $7, ward = $8, source = $9,
             crop = $10, market = $11, market_analysis = $12, officer = $13,
             officer_phone = $14, rehab = $15, asset_scores = $16::jsonb,
             risk_factors = $17::jsonb, updated_at = NOW()
         WHERE id = $18
         RETURNING *`,
        [
          scheme.name, scheme.equipped_area, scheme.functional_area, scheme.beneficiaries,
          scheme.status, scheme.district, scheme.province, scheme.ward, scheme.source,
          scheme.crop, scheme.market, scheme.market_analysis, scheme.officer,
          scheme.officer_phone, scheme.rehab,
          scheme.asset_scores ? JSON.stringify(scheme.asset_scores) : null,
          scheme.risk_factors ? JSON.stringify(scheme.risk_factors) : null, id,
        ],
      );
      if (!result.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Scheme was not found.' });
      }
    }
    await client.query('COMMIT');
    return res.status(id === null ? 201 : 200).json(result.rows[0]);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch((rollbackError) => console.error('Unable to roll back scheme mutation:', rollbackError.message));
    if (isDatabaseUnavailable(error)) return res.status(503).json({ error: 'PostgreSQL is unavailable; scheme changes were not saved.' });
    console.error('Unable to persist the irrigation scheme:', error);
    return res.status(500).json({ error: 'The scheme could not be saved to the registry.' });
  } finally {
    client?.release();
  }
}

export const createScheme = async (req, res) => {
  const validation = validateScheme(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });
  return saveScheme(validation.scheme, res);
};

export const updateScheme = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Scheme ID is invalid.' });
  const validation = validateScheme(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });
  return saveScheme(validation.scheme, res, id);
};

export const deleteScheme = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Scheme ID is invalid.' });
  try {
    const result = await pool.query('DELETE FROM schemes WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Scheme was not found.' });
    return res.status(204).end();
  } catch (error) {
    if (isDatabaseUnavailable(error)) return res.status(503).json({ error: 'PostgreSQL is unavailable; the scheme was not deleted.' });
    console.error('Unable to delete irrigation scheme:', error);
    return res.status(500).json({ error: 'The scheme could not be deleted.' });
  }
};
