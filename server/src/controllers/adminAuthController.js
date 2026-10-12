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
import {
  getLocalAdminCount,
  findLocalAdminByEmail,
  createLocalAdminUser,
  createLocalAdminSession,
  deleteLocalAdminSession,
} from '../services/localAdminStore.js';

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
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}

function isDatabaseUnavailable(error) {
  if (!error) return false;
  const unavailableCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', '28P01', '3D000']);
  return unavailableCodes.has(error.code)
    || (Array.isArray(error.errors) && error.errors.some(isDatabaseUnavailable))
    || error.message?.includes('connect')
    || error.message?.includes('timeout');
}

async function authenticate(email, password) {
  try {
    const result = await pool.query(
      'SELECT id, email, password_hash, password_salt FROM admin_users WHERE email = $1',
      [email],
    );
    const user = result.rows[0];
    if (user) {
      const salt = user.password_salt;
      const expected = user.password_hash;
      const actual = (await scrypt(password, salt, 64)).toString('hex');
      if (safeEqual(actual, expected)) {
        return { id: user.id, email: user.email };
      }
    }
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
  }

  // Fallback to local store
  const localUser = await findLocalAdminByEmail(email);
  if (!localUser) return null;
  const actual = (await scrypt(password, localUser.password_salt, 64)).toString('hex');
  if (safeEqual(actual, localUser.password_hash)) {
    return { id: localUser.id, email: localUser.email };
  }
  return null;
}

async function createSession(adminId, res, secure) {
  const sessionToken = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  try {
    await pool.query('DELETE FROM admin_sessions WHERE expires_at <= NOW()');
    await pool.query(
      `INSERT INTO admin_sessions (token_hash, admin_id, csrf_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [hashToken(sessionToken), adminId, hashToken(csrfToken), expiresAt],
    );
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    await createLocalAdminSession(hashToken(sessionToken), adminId, hashToken(csrfToken), expiresAt);
  }

  setAdminCookies(res, sessionToken, csrfToken, secure);
  return csrfToken;
}

export async function getAdminStatus(req, res) {
  try {
    let adminCount = 0;
    try {
      const countResult = await pool.query('SELECT COUNT(*)::integer AS count FROM admin_users');
      adminCount = countResult.rows[0]?.count ?? 0;
    } catch (dbError) {
      adminCount = await getLocalAdminCount();
    }

    const sessionToken = getCookie(req, ADMIN_SESSION_COOKIE);
    let admin = null;
    let csrfToken = null;

    if (sessionToken) {
      const tokenHash = hashToken(sessionToken);
      try {
        const sessionResult = await pool.query(
          `SELECT a.id, a.email, s.csrf_hash
           FROM admin_sessions s
           JOIN admin_users a ON a.id = s.admin_id
           WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
          [tokenHash],
        );
        if (sessionResult.rows.length) {
          admin = { email: sessionResult.rows[0].email };
          const cookieToken = getCookie(req, 'irrig_admin_csrf');
          if (cookieToken && safeEqual(hashToken(cookieToken), sessionResult.rows[0].csrf_hash)) {
            csrfToken = cookieToken;
          }
        }
      } catch (dbError) {
        // Fallback check
        const { findLocalAdminSession } = await import('../services/localAdminStore.js');
        const localSession = await findLocalAdminSession(tokenHash);
        if (localSession) {
          admin = { email: localSession.admin.email };
          const cookieToken = getCookie(req, 'irrig_admin_csrf');
          if (cookieToken && safeEqual(hashToken(cookieToken), localSession.csrf_hash)) {
            csrfToken = cookieToken;
          }
        }
      }
    }

    return res.json({
      setupRequired: adminCount === 0,
      admin,
      csrfToken,
    });
  } catch (error) {
    console.error('Unable to read administrator status:', error.message);
    return res.json({
      setupRequired: true,
      admin: null,
      csrfToken: null,
    });
  }
}

export async function bootstrapAdmin(req, res) {
  const bootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
  const providedToken = req.body?.bootstrapToken;
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body?.password;

  // If operator configured a bootstrap token, enforce it; otherwise allow first-time setup directly
  if (bootstrapToken && !safeEqual(providedToken, bootstrapToken)) {
    return res.status(403).json({ error: 'Setup authorization token is invalid.' });
  }

  if (!validEmail(email) || !validPassword(password)) {
    return res.status(400).json({ error: 'Enter a valid email address and a password with at least 8 characters.' });
  }

  const salt = randomBytes(16).toString('hex');
  const passwordHash = (await scrypt(password, salt, 64)).toString('hex');

  let adminId = null;
  let adminEmail = email;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const countResult = await client.query('SELECT COUNT(*)::integer AS count FROM admin_users');
      if (countResult.rows[0].count !== 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Administrator setup has already been completed. Please log in.' });
      }
      const result = await client.query(
        `INSERT INTO admin_users (email, password_hash, password_salt)
         VALUES ($1, $2, $3)
         RETURNING id, email`,
        [email, passwordHash, salt],
      );
      await client.query('COMMIT');
      adminId = result.rows[0].id;
      adminEmail = result.rows[0].email;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (dbError) {
    console.warn('Postgres unavailable during admin setup, using local fallback store:', dbError.message);
    const count = await getLocalAdminCount();
    if (count !== 0) {
      return res.status(409).json({ error: 'Administrator setup has already been completed. Please log in.' });
    }
    const created = await createLocalAdminUser(email, passwordHash, salt);
    adminId = created.id;
    adminEmail = created.email;
  }

  const csrfToken = await createSession(adminId, res, isSecureRequest(req));
  return res.status(201).json({ admin: { email: adminEmail }, csrfToken });
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

    try {
      await pool.query(
        'DELETE FROM admin_sessions WHERE admin_id = $1 AND expires_at <= NOW()',
        [admin.id],
      );
    } catch {}

    const csrfToken = await createSession(admin.id, res, isSecureRequest(req));
    return res.json({ admin: { email: admin.email }, csrfToken });
  } catch (error) {
    console.error('Administrator sign-in failed:', error.message);
    return res.status(500).json({ error: 'Administrator sign-in failed. Please try again.' });
  }
}

export async function logoutAdmin(req, res) {
  const sessionToken = getCookie(req, ADMIN_SESSION_COOKIE);
  try {
    if (sessionToken) {
      const tokenHash = hashToken(sessionToken);
      try {
        await pool.query('DELETE FROM admin_sessions WHERE token_hash = $1', [tokenHash]);
      } catch {}
      await deleteLocalAdminSession(tokenHash).catch(() => {});
    }
    clearAdminCookies(res, isSecureRequest(req));
    return res.status(204).end();
  } catch (error) {
    console.error('Administrator sign-out failed:', error.message);
    return res.status(500).json({ error: 'Administrator sign-out failed.' });
  }
}
