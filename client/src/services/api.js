const API_BASE = '/api';
let adminCsrfToken = null;

export const DASHBOARD_REFRESH_MS = 60 * 1000;

const refreshQuery = (force) => force ? '?refresh=1' : '';

export async function fetchSchemes({ signal, force = false } = {}) {
  const res = await fetch(
    `${API_BASE}/schemes${refreshQuery(force)}`,
    {
      cache: 'no-store',
      signal
    }
  );

  if (!res.ok) {
    throw new Error('Failed to fetch scheme data');
  }

  return res.json();
}

export async function createScheme(schemeData, { signal } = {}) {
  return mutateScheme(`${API_BASE}/schemes`, 'POST', schemeData, signal);
}

export async function updateScheme(id, schemeData, { signal } = {}) {
  return mutateScheme(`${API_BASE}/schemes/${encodeURIComponent(id)}`, 'PUT', schemeData, signal);
}

export async function deleteScheme(id, { signal } = {}) {
  const res = await fetch(`${API_BASE}/schemes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { 'X-CSRF-Token': adminCsrfToken || '' },
    signal,
  });
  if (!res.ok) throw await responseError(res, 'Failed to delete scheme');
}

async function mutateScheme(url, method, data, signal) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': adminCsrfToken || '',
    },
    body: JSON.stringify(data),
    signal,
  });
  if (!res.ok) throw await responseError(res, 'Scheme change failed');
  return res.json();
}

async function responseError(res, fallback) {
  const payload = await res.json().catch(() => ({}));
  return new Error(payload.error || fallback);
}

export async function fetchAdminStatus({ signal } = {}) {
  const res = await fetch(`${API_BASE}/admin/status`, {
    cache: 'no-store',
    credentials: 'same-origin',
    signal,
  });
  if (!res.ok) throw await responseError(res, 'Failed to read administrator status');
  const status = await res.json();
  adminCsrfToken = status.csrfToken || null;
  return status;
}

export async function loginAdmin(credentials, { signal } = {}) {
  return authenticateAdmin('/login', credentials, signal);
}

export async function setupAdmin(credentials, { signal } = {}) {
  return authenticateAdmin('/setup', credentials, signal);
}

async function authenticateAdmin(path, credentials, signal) {
  const res = await fetch(`${API_BASE}/admin${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
    signal,
  });
  if (!res.ok) throw await responseError(res, 'Administrator authentication failed');
  const result = await res.json();
  adminCsrfToken = result.csrfToken;
  return result;
}

export async function requestAdminPasswordReset(email, { signal } = {}) {
  const res = await fetch(`${API_BASE}/admin/forgot-password`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    signal,
  });
  if (!res.ok) throw await responseError(res, 'Unable to request a password reset');
  return res.json();
}

export async function resetAdminPassword(token, password, { signal } = {}) {
  const res = await fetch(`${API_BASE}/admin/reset-password`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
    signal,
  });
  if (!res.ok) throw await responseError(res, 'Unable to reset administrator password');
  return res.json();
}

export async function logoutAdmin({ signal } = {}) {
  const res = await fetch(`${API_BASE}/admin/logout`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'X-CSRF-Token': adminCsrfToken || '' },
    signal,
  });
  if (!res.ok) throw await responseError(res, 'Administrator sign-out failed');
  adminCsrfToken = null;
}

export async function fetchTelemetry({ signal, force = false } = {}) {
  const res = await fetch(
    `${API_BASE}/telemetry${refreshQuery(force)}`,
    {
      cache: 'no-store',
      signal
    }
  );

  if (!res.ok) {
    throw new Error('Failed to fetch telemetry');
  }

  return res.json();
}

export async function fetchWeather({ signal, force = false } = {}) {
  const res = await fetch(
    `${API_BASE}/weather${refreshQuery(force)}`,
    {
      cache: 'no-store',
      signal
    }
  );

  if (!res.ok) {
    const payload = await res.json();
    const error = new Error(payload.message || 'Failed to fetch weather');
    error.feedStatus = payload.status || 'error';
    throw error;
  }

  return res.json();
}
