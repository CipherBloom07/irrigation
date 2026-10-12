import { pool } from '../config/db.js';
import { findFeedRecord, refreshExternalFeeds } from '../services/externalFeeds.js';
import {
  readLocalSchemes,
  appendLocalScheme,
  updateLocalScheme,
  deleteLocalScheme,
} from '../services/localSchemeStore.js';

function standardStatus(status) {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (normalized === 'functional' || normalized === 'fully functional') return 'Fully Functional';
  if (normalized === 'needs attention' || normalized === 'partially functional') return 'Partially Functional';
  if (normalized === 'under rehabilitation') return 'Under Rehabilitation';
  if (normalized === 'non-functional' || normalized === 'nonfunctional') return 'Non-Functional';
  return status || 'Non-Functional';
}

function mergeConfiguredData(schemes, feeds) {
  return schemes.map((scheme) => {
    const gisRecord = feeds?.satellite ? findFeedRecord(feeds.satellite, scheme) : null;
    const agronomyRecord = feeds?.agronomy ? findFeedRecord(feeds.agronomy, scheme) : null;
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
    schemes = result.rows.length ? result.rows : await readLocalSchemes();
  } catch (error) {
    schemes = await readLocalSchemes();
  }

  const refreshed = await refreshExternalFeeds({ force: req.query.refresh === '1' }).catch(() => ({ feeds: {} }));
  res.json(mergeConfiguredData(schemes, refreshed?.feeds || {}));
};

async function getSchemeById(id) {
  try {
    const result = await pool.query('SELECT * FROM schemes WHERE id = $1', [id]);
    if (result.rows.length) return result.rows[0];
  } catch (error) {
    // fallback
  }
  const local = await readLocalSchemes();
  return local.find((s) => Number(s.id) === Number(id)) || null;
}

function validateScheme(input) {
  const {
    name, equipped_area, functional_area, beneficiaries, status, district, province,
    ward, source, crop, market, market_analysis, officer, officer_phone, rehab,
    asset_scores, risk_factors,
  } = input ?? {};
  const equipped = Number(equipped_area);
  const functional = Number(functional_area);
  const beneficiaryCount = Number(beneficiaries);
  const normalizedStatus = standardStatus(status);

  if (typeof name !== 'string' || typeof district !== 'string' || typeof province !== 'string'
      || !name.trim() || !district.trim() || !province.trim()) {
    return { error: 'Scheme name, province, and district are required.' };
  }
  const numericInput = (value) => typeof value === 'number' || (typeof value === 'string' && value.trim() !== '');
  if (!numericInput(equipped_area) || !numericInput(functional_area)
      || !Number.isFinite(equipped) || equipped <= 0
      || !Number.isFinite(functional) || functional < 0 || functional > equipped) {
    return { error: 'Area values must be valid, and functional area cannot exceed equipped area.' };
  }
  if (!numericInput(beneficiaries) || !Number.isInteger(beneficiaryCount) || beneficiaryCount < 0) {
    return { error: 'Beneficiaries must be a non-negative whole number.' };
  }
  const wardNumber = ward === null || ward === '' || ward === undefined ? null : Number(ward);
  const rehabYear = rehab === null || rehab === '' || rehab === undefined ? null : Number(rehab);

  return { scheme: {
    name: String(name).trim(),
    equipped_area: equipped,
    functional_area: functional,
    beneficiaries: beneficiaryCount,
    status: normalizedStatus,
    district: String(district).trim(),
    province: String(province).trim(),
    ward: wardNumber,
    source: source ? String(source).trim() : 'Dam',
    crop: crop ? String(crop).trim() : null,
    market: market ? String(market).trim() : null,
    market_analysis: market_analysis ? String(market_analysis).trim() : null,
    officer: officer ? String(officer).trim() : null,
    officer_phone: officer_phone ? String(officer_phone).trim() : null,
    rehab: rehabYear,
    asset_scores: asset_scores ?? null,
    risk_factors: Array.isArray(risk_factors) ? risk_factors : [],
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
    }
    await client.query('COMMIT');
    if (result && result.rows.length) {
      return res.status(id === null ? 201 : 200).json(result.rows[0]);
    }
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.warn('PostgreSQL unavailable for scheme write; saving to local scheme store:', error.message);
  } finally {
    client?.release();
  }

  // Resilient fallback to local storage
  try {
    if (id === null) {
      const created = await appendLocalScheme(scheme);
      return res.status(201).json(created);
    } else {
      const updated = await updateLocalScheme(id, scheme);
      return res.status(200).json(updated);
    }
  } catch (storeError) {
    console.error('Local scheme store error:', storeError);
    return res.status(500).json({ error: 'Unable to save scheme changes.' });
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

  const existing = await getSchemeById(id);
  if (!existing) {
    return res.status(404).json({ error: 'Scheme was not found in the registry.' });
  }

  // Merge existing fields with incoming updates
  const merged = {
    ...existing,
    ...req.body,
  };

  const validation = validateScheme(merged);
  if (validation.error) return res.status(400).json({ error: validation.error });
  return saveScheme(validation.scheme, res, id);
};

export const deleteScheme = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Scheme ID is invalid.' });

  let deleted = false;
  try {
    const result = await pool.query('DELETE FROM schemes WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length) deleted = true;
  } catch (error) {
    console.warn('PostgreSQL delete fallback to local store:', error.message);
  }

  try {
    await deleteLocalScheme(id);
    deleted = true;
  } catch (storeError) {
    if (!deleted) {
      return res.status(404).json({ error: 'Scheme was not found in the registry.' });
    }
  }

  return res.status(204).end();
};
