import { promisify } from 'node:util';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { pool } from '../config/db.js';
import { hashToken } from '../middleware/adminAuth.js';

const scrypt = promisify(scryptCallback);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const genericMessage = 'If an administrator account exists for that email, password-reset instructions will be sent shortly.';

function validEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_PATTERN.test(email);
}

export async function requestAdminPasswordReset(req, res) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  // Always return the same response to avoid revealing registered administrator emails.
  if (!validEmail(email)) return res.json({ message: genericMessage });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ADMIN_RESET_FROM_EMAIL;
  const appBaseUrl = process.env.APP_BASE_URL;
  if (!apiKey || !from || !appBaseUrl || (process.env.NODE_ENV === 'production' && !appBaseUrl.startsWith('https://'))) {
    console.warn('Admin password reset email is not configured. Set RESEND_API_KEY, ADMIN_RESET_FROM_EMAIL, and APP_BASE_URL.');
    return res.json({ message: genericMessage });
  }

  try {
    const result = await pool.query('SELECT id, email FROM admin_users WHERE email = $1', [email]);
    const admin = result.rows[0];
    if (!admin) return res.json({ message: genericMessage });

    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    await pool.query('DELETE FROM admin_password_resets WHERE admin_id = $1 OR expires_at <= NOW()', [admin.id]);
    await pool.query(
      'INSERT INTO admin_password_resets (token_hash, admin_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'30 minutes\')',
      [tokenHash, admin.id],
    );

    const resetUrl = new URL('/', appBaseUrl);
    resetUrl.searchParams.set('adminReset', token);
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [admin.email],
        subject: 'Reset your Irrigation Portal administrator password',
        text: `A password reset was requested for your Irrigation Portal administrator account. Open this one-time link within 30 minutes: ${resetUrl.toString()}\n\nIf you did not request this, you can ignore this email.`,
      }),
    });

    if (!emailResponse.ok) {
      await pool.query('DELETE FROM admin_password_resets WHERE token_hash = $1', [tokenHash]).catch(() => {});
      console.error('Password reset email provider returned status', emailResponse.status);
    }
  } catch (error) {
    // Keep the response generic even if the account store or email provider is unavailable.
    console.error('Unable to process administrator password reset:', error.message);
  }

  return res.json({ message: genericMessage });
}

export async function resetAdminPassword(req, res) {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const password = req.body?.password;
  if (token.length < 32 || token.length > 256 || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'The reset link is invalid or expired. Request a new one.' });
  }

  try {
    const tokenHash = hashToken(token);
    const result = await pool.query(
      `SELECT admin_id FROM admin_password_resets
       WHERE token_hash = $1 AND expires_at > NOW()`,
      [tokenHash],
    );
    const reset = result.rows[0];
    if (!reset) return res.status(400).json({ error: 'The reset link is invalid or expired. Request a new one.' });

    const salt = randomBytes(16).toString('hex');
    const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
    await pool.query('BEGIN');
    try {
      await pool.query(
        'UPDATE admin_users SET password_hash = $1, password_salt = $2 WHERE id = $3',
        [passwordHash, salt, reset.admin_id],
      );
      await pool.query('DELETE FROM admin_sessions WHERE admin_id = $1', [reset.admin_id]);
      await pool.query('DELETE FROM admin_password_resets WHERE admin_id = $1', [reset.admin_id]);
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK').catch(() => {});
      throw error;
    }
    return res.json({ message: 'Password updated. Sign in with your new password.' });
  } catch (error) {
    console.error('Unable to reset administrator password:', error.message);
    return res.status(500).json({ error: 'Unable to reset the password right now. Please try again.' });
  }
}
