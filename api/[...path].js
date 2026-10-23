import handler from './index.js';

// Vercel catch-all functions can receive the route suffix without the /api
// filesystem prefix. Express mounts every endpoint under /api, so restore
// that prefix when Vercel supplies only the suffix. Keep already-prefixed
// URLs unchanged and preserve any query string.
export default function catchAllApiHandler(req, res) {
  const url = req.url || '/';
  if (!url.startsWith('/api/')) {
    req.url = url === '/'
      ? '/api'
      : `/api${url.startsWith('/') ? '' : '/'}${url}`;
  }
  return handler(req, res);
}
