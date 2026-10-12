import { promisify } from 'node:util';
import {
  randomBytes,
  scrypt as scryptCallback,
} from 'node:crypto';
import { pool } from '../config/db.js';
import {
  ADMIN_SESSION_COOKIE,
  clearAdminCookies,
  getCookie,
  hashToken,
  safeEqual,
  setAdminCookies,
} from '../middleware/adminAuth.js';

const scrypt = promisify(scryptCallback);
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isSecureRequest(req) {
  return req.secure;
}

function validEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_PATTERN.test(email);
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 128;
}

async function authenticate(email, password) {
  const result = await pool.query(
    'SELECT id, email, password_hash, password_salt FROM admin_users WHERE email = $1',
    [email],
  );
  const user = result.rows[0];
  const salt = user?.password_salt ?? randomBytes(16).toString('hex');
  const expected = user?.password_hash ?? (await scrypt('invalid-password', salt, 64)).toString('hex');
  const actual = (await scrypt(password, salt, 64)).toString('hex');
  if (!safeEqual(actual, expected) || !user) return null;
  return { id: user.id, email: user.email };
}

async function createSession(adminId, res, secure) {
  const sessionToken = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await pool.query('DELETE FROM admin_sessions WHERE expires_at <= NOW()');
  await pool.query(
    `INSERT INTO admin_sessions (token_hash, admin_id, csrf_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [hashToken(sessionToken), adminId, hashToken(csrfToken), expiresAt],
  );
  setAdminCookies(res, sessionToken, csrfToken, secure);
  return csrfToken;
}

export async function getAdminStatus(req, res) {
  try {
    const countResult = await pool.query('SELECT COUNT(*)::integer AS count FROM admin_users');
    const sessionToken = getCookie(req, ADMIN_SESSION_COOKIE);
    const sessionResult = sessionToken
      ? await pool.query(
          `SELECT a.id, a.email, s.csrf_hash
           FROM admin_sessions s
           JOIN admin_users a ON a.id = s.admin_id
           WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
          [hashToken(sessionToken)],
        )
      : { rows: [] };
    const admin = sessionResult.rows[0];
    let csrfToken = null;
    if (admin) {
      const cookieToken = getCookie(req, 'irrig_admin_csrf');
      if (cookieToken && safeEqual(hashToken(cookieToken), admin.csrf_hash)) {
        csrfToken = cookieToken;
      }
    }
    return res.json({
      setupRequired: countResult.rows[0].count === 0,
      admin: admin ? { email: admin.email } : null,
      csrfToken,
    });
  } catch (error) {
    console.error('Unable to read administrator status:', error.message);
    return res.status(503).json({ error: 'Administrator authentication is temporarily unavailable.' });
  }
}

export async function bootstrapAdmin(req, res) {
  const bootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
  const providedToken = req.body?.bootstrapToken;
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body?.password;
  if (!bootstrapToken) {
    return res.status(503).json({ error: 'Administrator setup has not been enabled by the operator.' });
  }
  if (!safeEqual(providedToken, bootstrapToken)) {
    return res.status(403).json({ error: 'Setup authorization failed.' });
  }
  if (!validEmail(email) || !validPassword(password)) {
    return res.status(400).json({ error: 'Enter a valid email and a password of at least 12 characters.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [76103921]);
    const countResult = await client.query('SELECT COUNT(*)::integer AS count FROM admin_users');
    if (countResult.rows[0].count !== 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Administrator setup has already been completed.' });
    }
    const salt = randomBytes(16).toString('hex');
    const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
    const result = await client.query(
      `INSERT INTO admin_users (email, password_hash, password_salt)
       VALUES ($1, $2, $3)
       RETURNING id, email`,
      [email, passwordHash, salt],
    );
    await client.query('COMMIT');
    const csrfToken = await createSession(result.rows[0].id, res, isSecureRequest(req));
    return res.status(201).json({ admin: { email: result.rows[0].email }, csrfToken });
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError) => {
      console.error('Unable to roll back administrator setup:', rollbackError.message);
    });
    console.error('Unable to create initial administrator:', error.message);
    return res.status(500).json({ error: 'Initial administrator setup failed.' });
  } finally {
    client.release();
  }
}

export async function loginAdmin(req, res) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body?.password;
  if (!validEmail(email) || typeof password !== 'string' || password.length > 128) {
    return res.status(400).json({ error: 'Enter a valid email and password.' });
  }

  try {
    const admin = await authenticate(email, password);
    if (!admin) return res.status(401).json({ error: 'Email or password is incorrect.' });
    await pool.query(
      'DELETE FROM admin_sessions WHERE admin_id = $1 AND expires_at <= NOW()',
      [admin.id],
    );
    const csrfToken = await createSession(admin.id, res, isSecureRequest(req));
    return res.json({ admin: { email: admin.email }, csrfToken });
  } catch (error) {
    console.error('Administrator sign-in failed:', error.message);
    return res.status(503).json({ error: 'Administrator sign-in is temporarily unavailable.' });
  }
}

export async function logoutAdmin(req, res) {
  const sessionToken = getCookie(req, ADMIN_SESSION_COOKIE);
  try {
    if (sessionToken) {
      await pool.query('DELETE FROM admin_sessions WHERE token_hash = $1', [hashToken(sessionToken)]);
    }
    clearAdminCookies(res, isSecureRequest(req));
    return res.status(204).end();
  } catch (error) {
    console.error('Administrator sign-out failed:', error.message);
    return res.status(503).json({ error: 'Administrator sign-out failed.' });
  }
}
