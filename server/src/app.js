import express from 'express';
import cors from 'cors';
import https from 'node:https';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeDatabase } from './config/initializeDatabase.js';
import weatherRoutes from './routes/weatherRoutes.js';
import telemetryRoutes from './routes/telemetryRoutes.js';
import schemeRoutes from './routes/schemeRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

const API_BASE = '/api';
export const DASHBOARD_REFRESH_MS = 60 * 1000;
const LOCAL_CERT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../certs');

const refreshQuery = (force) => (force ? '?refresh=1' : '');

export async function fetchSchemes({ signal, force = false } = {}) {
  const res = await fetch(`${API_BASE}/schemes${refreshQuery(force)}`, {
    cache: 'no-store',
    signal,
  });

  if (!res.ok) throw new Error('Failed to fetch scheme data');
  return res.json();
}

export async function createScheme(schemeData, { signal } = {}) {
  const res = await fetch(`${API_BASE}/schemes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(schemeData),
    signal,
  });

  if (!res.ok) throw new Error('Failed to create scheme');
  return res.json();
}

export async function fetchTelemetry({ signal, force = false } = {}) {
  const res = await fetch(`${API_BASE}/telemetry${refreshQuery(force)}`, {
    cache: 'no-store',
    signal,
  });

  if (!res.ok) throw new Error('Failed to fetch telemetry');
  return res.json();
}

export async function fetchWeather({ signal, force = false } = {}) {
  const res = await fetch(`${API_BASE}/weather${refreshQuery(force)}`, {
    cache: 'no-store',
    signal,
  });

  if (!res.ok) throw new Error('Failed to fetch weather');
  return res.json();
}

export const app = express();
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

app.use(cors({
  origin(origin, callback) {
    const configuredOrigins = (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const localDevelopmentOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
    if (!origin || configuredOrigins.includes(origin) || (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production') && localDevelopmentOrigin.test(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

app.get(`${API_BASE}/health`, (req, res) => {
  res.json({ ok: true, status: 'healthy' });
});

app.use(`${API_BASE}/weather`, weatherRoutes);
app.use(`${API_BASE}/telemetry`, telemetryRoutes);
app.use(`${API_BASE}/admin`, adminRoutes);
app.use(`${API_BASE}/schemes`, schemeRoutes);

app.use((error, req, res, next) => {
  const status = Number(error.status || error.statusCode);
  if (status >= 400 && status < 500) {
    return res.status(status).json({ error: status === 400 ? 'Request body is invalid.' : 'Request could not be processed.' });
  }
  console.error('Unhandled API error:', error);
  return res.status(500).json({ error: 'Internal server error' });
});

function getHttpsOptions() {
  const certPath = process.env.HTTPS_CERT_PATH || path.join(LOCAL_CERT_DIR, 'localhost.pem');
  const keyPath = process.env.HTTPS_KEY_PATH || path.join(LOCAL_CERT_DIR, 'localhost-key.pem');

  const certConfigured = Boolean(process.env.HTTPS_CERT_PATH);
  const keyConfigured = Boolean(process.env.HTTPS_KEY_PATH);
  const localCertificateExists = fs.existsSync(certPath) && fs.existsSync(keyPath);

  if (!certConfigured && !keyConfigured && !localCertificateExists) {
    return null;
  }

  if (!certConfigured && keyConfigured || certConfigured && !keyConfigured) {
    throw new Error('Set both HTTPS_CERT_PATH and HTTPS_KEY_PATH, or neither.');
  }

  return {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
}

export async function startServer() {
  try {
    await initializeDatabase();
  } catch (error) {
    console.warn('Database initialization failed; continuing with in-memory/fallback mode:', error.message);
  }

  const port = Number(process.env.PORT || 5000);
  const httpsOptions = getHttpsOptions();

  return new Promise((resolve) => {
    const server = httpsOptions
      ? https.createServer(httpsOptions, app).listen(port, () => {
          console.log(`Irrigation API listening on https://localhost:${port}`);
          resolve(server);
        })
      : app.listen(port, () => {
          console.log(`Irrigation API listening on http://localhost:${port}`);
          resolve(server);
        });
  });
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  startServer();
}