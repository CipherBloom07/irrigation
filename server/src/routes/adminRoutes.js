import express from 'express';
import {
  bootstrapAdmin,
  getAdminStatus,
  loginAdmin,
  logoutAdmin,
} from '../controllers/adminAuthController.js';
import { requireAdmin, requireCsrf } from '../middleware/adminAuth.js';
import { requestAdminPasswordReset, resetAdminPassword } from '../controllers/adminPasswordResetController.js';

const router = express.Router();
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

function limitAuthenticationAttempts(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  if (attempts.size > 1000) {
    for (const [address, entry] of attempts) {
      if (now - entry.startedAt > WINDOW_MS) attempts.delete(address);
    }
  }
  const current = attempts.get(key);
  if (!current || now - current.startedAt > WINDOW_MS) {
    attempts.set(key, { startedAt: now, count: 1 });
    return next();
  }
  if (current.count >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many authentication attempts. Try again later.' });
  }
  current.count += 1;
  return next();
}

router.get('/status', getAdminStatus);
router.post('/setup', limitAuthenticationAttempts, bootstrapAdmin);
router.post('/login', limitAuthenticationAttempts, loginAdmin);
router.post('/forgot-password', limitAuthenticationAttempts, requestAdminPasswordReset);
router.post('/reset-password', limitAuthenticationAttempts, resetAdminPassword);
router.post('/logout', requireAdmin, requireCsrf, logoutAdmin);

export default router;
