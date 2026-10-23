// Vercel's filesystem is read-only except /tmp, so the JSON fallback stores
// must live there when no PostgreSQL DATABASE_URL is configured.
process.env.SCHEME_STORE_PATH ||= '/tmp/irrigation/schemes.json';
process.env.ADMIN_STORE_PATH ||= '/tmp/irrigation/admin_store.json';
// Vercel's edge overwrites forwarded headers, so trusting one proxy hop is safe
// and lets req.secure detect HTTPS for Secure admin cookies.
process.env.TRUST_PROXY ||= '1';

const [{ app }, { initializeDatabase }] = await Promise.all([
  import('../server/src/app.js'),
  import('../server/src/config/initializeDatabase.js'),
]);

// Vercel serverless functions do not call startServer(), so initialize the
// PostgreSQL schema on the first request in each warm function instance.
let databaseInitialization;
async function handler(req, res) {
  try {
    if (!databaseInitialization) {
      databaseInitialization = initializeDatabase().catch((error) => {
        databaseInitialization = null;
        throw error;
      });
    }
    await databaseInitialization;
  } catch (error) {
    // Keep the local JSON fallback available when PostgreSQL is unreachable.
    console.warn('Database initialization failed; using fallback where supported:', error.message);
  }
  return app(req, res);
}

export default handler;
