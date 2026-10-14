// Vercel's filesystem is read-only except /tmp, so the JSON fallback stores
// must live there when no PostgreSQL DATABASE_URL is configured.
process.env.SCHEME_STORE_PATH ||= '/tmp/irrigation/schemes.json';
process.env.ADMIN_STORE_PATH ||= '/tmp/irrigation/admin_store.json';
// Vercel's edge overwrites forwarded headers, so trusting one proxy hop is safe
// and lets req.secure detect HTTPS for Secure admin cookies.
process.env.TRUST_PROXY ||= '1';

const { app } = await import('../server/src/app.js');

export default app;
