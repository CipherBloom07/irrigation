// Route every nested /api/* request through the same Express handler.
// This is required for /api/admin/login, /api/admin/status, and reset routes.
export { default } from './index.js';
