import { createHash, timingSafeEqual } from 'node:crypto';
import { pool } from '../config/db.js';
import { findLocalAdminSession } from '../services/localAdminStore.js';

export const ADMIN_SESSION_COOKIE = 'irrig_admin_session';
export const ADMIN_CSRF_COOKIE = 'irrig_admin_csrf';

export function hashToken(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function getCookie(req, name) {
  const cookieHeader = req.headers.cookie || '';
  for (const entry of cookieHeader.split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0 || entry.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(entry.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function setAdminCookies(res, sessionToken, csrfToken, secure) {
  const secureFlag = secure ? '; Secure' : '';
  const age = 60 * 60 * 8;
  res.append('Set-Cookie', `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(sessionToken)}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${age}${secureFlag}`);
  res.append('Set-Cookie', `${ADMIN_CSRF_COOKIE}=${encodeURIComponent(csrfToken)}; Path=/api; SameSite=Lax; Max-Age=${age}${secureFlag}`);
}

export function clearAdminCookies(res, secure) {
  const secureFlag = secure ? '; Secure' : '';
  res.append('Set-Cookie', `${ADMIN_SESSION_COOKIE}=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`);
  res.append('Set-Cookie', `${ADMIN_CSRF_COOKIE}=; Path=/api; SameSite=Lax; Max-Age=0${secureFlag}`);
}

export async function requireAdmin(req, res, next) {
  const sessionToken = getCookie(req, ADMIN_SESSION_COOKIE);
  if (!sessionToken) return res.status(401).json({ error: 'Administrator sign-in is required.' });

  const tokenHash = hashToken(sessionToken);

  try {
    const result = await pool.query(
      `SELECT s.csrf_hash, a.id, a.email
       FROM admin_sessions s
       JOIN admin_users a ON a.id = s.admin_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
      [tokenHash],
    );
    if (result.rows.length) {
      req.admin = { id: result.rows[0].id, email: result.rows[0].email };
      req.adminCsrfHash = result.rows[0].csrf_hash;
      return next();
    }
  } catch (error) {
    // Database might be down, try local fallback session
  }

  const localSession = await findLocalAdminSession(tokenHash);
  if (localSession) {
    req.admin = localSession.admin;
    req.adminCsrfHash = localSession.csrf_hash;
    return next();
  }

  clearAdminCookies(res, req.secure);
  return res.status(401).json({ error: 'Administrator session is invalid or expired. Please sign in again.' });
}

export function requireCsrf(req, res, next) {
  const csrfToken = req.get('x-csrf-token') || getCookie(req, ADMIN_CSRF_COOKIE);
  if (!csrfToken || !safeEqual(hashToken(csrfToken), req.adminCsrfHash)) {
    return res.status(403).json({ error: 'CSRF token is missing or invalid.' });
  }
  return next();
}
