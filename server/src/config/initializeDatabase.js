import { pool } from './db.js';
import { readLocalSchemes } from '../services/localSchemeStore.js';

const baselineSchemes = [
  ['IRR-ZIM-001', 'Nyanyadzi Irrigation Scheme', 412, 290, 420, 'Partially Functional', 'Chimanimani', 'Manicaland', 8, 'River', 'Green mealies, wheat', 'Mutare Market', 'High demand', 'Tendai Mutasa', null, 2018, null, JSON.stringify(['Inefficient, unreliable, and inequitable water delivery service', 'Rapid deterioration of infrastructure', 'Incapacitated to sustainably operate and maintain irrigation infrastructure', 'Difficulties accessing finances (loans & credits)'])],
  ['IRR-ZIM-002', 'Exchange Irrigation Scheme', 525, 480, 980, 'Fully Functional', 'Zhombe', 'Midlands', 14, 'Dam', 'Wheat, green mealies', 'GMB Kwekwe', 'High demand', 'Chipo Zhou', null, 2022, null, JSON.stringify(['Difficulties accessing finances (loans & credits)', 'Unsustainable plot sizes'])],
  ['IRR-ZIM-003', 'Tshovane Irrigation Scheme', 180, 110, 140, 'Under Rehabilitation', 'Chiredzi', 'Masvingo', 5, 'Borehole', 'Tomatoes, grain maize', 'Chiredzi Market', 'Incomplete', 'Tatenda Moyo', null, 2024, null, JSON.stringify(['Incapacitated to sustainably operate and maintain irrigation infrastructure', 'Lack of government policy on irrigation', 'Confusion on ownership of the irrigation scheme', 'Farmers are not committed to their projects'])],
  ['IRR-ZIM-004', 'Mubaira Solar Irrigation Scheme', 95, 95, 85, 'Fully Functional', 'Mhondoro-Ngezi', 'Mashonaland West', 2, 'Borehole', 'Wheat, green mealies', 'Harare Market', 'High demand', 'Rudo Moyo', null, 2021, null, JSON.stringify([])],
  ['IRR-ZIM-005', 'Silalatshani Irrigation Scheme', 850, 310, 853, 'Partially Functional', 'Insiza', 'Matabeleland South', 11, 'Dam', 'Potatoes, chilli, butternuts', 'Bulawayo Market', 'Moderate', 'Bhekinkosi Ncube', null, 2019, null, JSON.stringify(['Rapid deterioration of infrastructure', 'Inefficient, unreliable, and inequitable water delivery service', 'Incapacitated to sustainably operate and maintain irrigation infrastructure'])],
];

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      admin_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      csrf_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry
      ON admin_sessions(expires_at)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schemes (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      equipped_area NUMERIC NOT NULL DEFAULT 0,
      functional_area NUMERIC NOT NULL DEFAULT 0,
      beneficiaries INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Non-Functional',
      district TEXT NOT NULL
    )
  `);
  await pool.query(`
    ALTER TABLE schemes
      ADD COLUMN IF NOT EXISTS code TEXT,
      ADD COLUMN IF NOT EXISTS province TEXT,
      ADD COLUMN IF NOT EXISTS ward INTEGER,
      ADD COLUMN IF NOT EXISTS source TEXT,
      ADD COLUMN IF NOT EXISTS crop TEXT,
      ADD COLUMN IF NOT EXISTS market TEXT,
      ADD COLUMN IF NOT EXISTS market_analysis TEXT,
      ADD COLUMN IF NOT EXISTS officer TEXT,
      ADD COLUMN IF NOT EXISTS officer_phone TEXT,
      ADD COLUMN IF NOT EXISTS rehab INTEGER,
      ADD COLUMN IF NOT EXISTS asset_scores JSONB,
      ADD COLUMN IF NOT EXISTS risk_factors JSONB,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `)
    // Smart synchronization: trusted data sources
  await pool.query(`
    CREATE TABLE IF NOT EXISTS data_sources (
      id SERIAL PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      trust_level TEXT NOT NULL DEFAULT 'authoritative',
      endpoint TEXT,
      status TEXT NOT NULL DEFAULT 'not_configured',
      last_success_at TIMESTAMPTZ,
      last_attempt_at TIMESTAMPTZ,
      last_error TEXT,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Records every attempt to synchronize a trusted source
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_runs (
      id SERIAL PRIMARY KEY,
      source_id INTEGER NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'running',
      records_received INTEGER NOT NULL DEFAULT 0,
      records_saved INTEGER NOT NULL DEFAULT 0,
      error TEXT
    )
  `);

  // Stores the normalized information received from external sources
  await pool.query(`
    CREATE TABLE IF NOT EXISTS source_records (
      id BIGSERIAL PRIMARY KEY,
      source_id INTEGER NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
      record_key TEXT NOT NULL,
      record_type TEXT NOT NULL,
      data JSONB NOT NULL,
      source_updated_at TIMESTAMPTZ,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(source_id, record_key, record_type)
    )
  `);

  // Make source lookups fast
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_source_records_source
      ON source_records(source_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_source_records_type
      ON source_records(record_type)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sync_runs_source
      ON sync_runs(source_id)
  `);

  const feedSeeds = [
    ['weather', 'WeatherAPI current weather', 'weather', process.env.WEATHER_API_URL ?? null],
    ['telemetry', 'Irrigation telemetry sensors', 'telemetry', process.env.TELEMETRY_API_URL ?? null],
    ['satellite', 'Copernicus Sentinel-2 catalogue (global)', 'satellite', process.env.SATELLITE_GIS_API_URL || 'https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=Collection/Name%20eq%20%27SENTINEL-2%27&$orderby=ContentDate/Start%20desc&$top=10'],
    ['agronomy', 'GMB & local market feed', 'agronomy', process.env.AGRONOMY_API_URL ?? null],
    ['gmb', 'GMB official announcements (not structured prices)', 'agronomy', process.env.GMB_API_URL || 'https://gmbdura.co.zw/wp-json/wp/v2/posts?search=price&per_page=10&_fields=date,link,title,excerpt'],
    ['fao', 'FAO agriculture dataset', 'agriculture', process.env.FAO_API_URL ?? null],
    ['worldBank', 'World Bank agriculture dataset', 'agriculture', process.env.WORLD_BANK_API_URL || 'https://api.worldbank.org/v2/country/ZWE/indicator/AG.YLD.CREL.KG?format=json&per_page=100'],
  ];

  for (const [key, name, category, endpoint] of feedSeeds) {
    await pool.query(
      `INSERT INTO data_sources (key, name, category, endpoint, status, enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'not_configured', TRUE, NOW(), NOW())
       ON CONFLICT (key)
       DO UPDATE SET
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         endpoint = EXCLUDED.endpoint,
         updated_at = NOW()`,
      [key, name, category, endpoint],
    );
  }

  const result = await pool.query('SELECT COUNT(*)::integer AS count FROM schemes');
  if (result.rows[0].count === 0) {
    for (const row of baselineSchemes) {
      await pool.query(
        `INSERT INTO schemes
          (code, name, equipped_area, functional_area, beneficiaries, status, district, province, ward, source, crop, market, market_analysis, officer, officer_phone, rehab, asset_scores, risk_factors)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18::jsonb)`,
        row,
      );
    }
  }

  const localSchemes = await readLocalSchemes();
  for (const scheme of localSchemes ?? []) {
    await pool.query(
      `INSERT INTO schemes
        (code, name, equipped_area, functional_area, beneficiaries, status, district, province, ward, source, crop, market, market_analysis, officer, officer_phone, rehab, asset_scores, risk_factors)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18::jsonb
       WHERE NOT EXISTS (
         SELECT 1 FROM schemes WHERE code = $1 OR (name = $2 AND district = $7)
       )`,
      [
        scheme.code, scheme.name, scheme.equipped_area, scheme.functional_area,
        scheme.beneficiaries, scheme.status, scheme.district, scheme.province,
        scheme.ward, scheme.source, scheme.crop, scheme.market, scheme.market_analysis,
        scheme.officer, scheme.officer_phone, scheme.rehab,
        scheme.asset_scores ? JSON.stringify(scheme.asset_scores) : null,
        scheme.risk_factors ? JSON.stringify(scheme.risk_factors) : null,
      ],
    );
  }
}
