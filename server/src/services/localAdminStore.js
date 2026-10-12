import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultAdminStorePath = fileURLToPath(new URL('../../data/admin_store.json', import.meta.url));
let writeQueue = Promise.resolve();

function storePath() {
  return process.env.ADMIN_STORE_PATH
    ? path.resolve(process.env.ADMIN_STORE_PATH)
    : defaultAdminStorePath;
}

async function readStore() {
  try {
    const raw = await readFile(storePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { users: [], sessions: [] };
    }
    return { users: [], sessions: [] };
  }
}

async function writeStore(data) {
  const destination = storePath();
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8' });
  await rename(temporary, destination);
}

export async function getLocalAdminCount() {
  const store = await readStore();
  return store.users.length;
}

export async function findLocalAdminByEmail(email) {
  const store = await readStore();
  const normalized = String(email || '').trim().toLowerCase();
  return store.users.find((u) => u.email.toLowerCase() === normalized) || null;
}

export async function findLocalAdminById(id) {
  const store = await readStore();
  return store.users.find((u) => String(u.id) === String(id)) || null;
}

export async function createLocalAdminUser(email, passwordHash, passwordSalt) {
  const operation = writeQueue.then(async () => {
    const store = await readStore();
    const normalized = String(email || '').trim().toLowerCase();
    if (store.users.some((u) => u.email.toLowerCase() === normalized)) {
      throw new Error('An administrator with this email already exists.');
    }
    const nextId = store.users.reduce((max, u) => Math.max(max, Number(u.id) || 0), 0) + 1;
    const user = {
      id: nextId,
      email: normalized,
      password_hash: passwordHash,
      password_salt: passwordSalt,
      created_at: new Date().toISOString(),
    };
    store.users.push(user);
    await writeStore(store);
    return user;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function createLocalAdminSession(tokenHash, adminId, csrfHash, expiresAt) {
  const operation = writeQueue.then(async () => {
    const store = await readStore();
    const now = Date.now();
    // Clean expired
    store.sessions = store.sessions.filter((s) => new Date(s.expires_at).getTime() > now);
    const session = {
      token_hash: tokenHash,
      admin_id: adminId,
      csrf_hash: csrfHash,
      expires_at: expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt,
      created_at: new Date().toISOString(),
    };
    store.sessions.push(session);
    await writeStore(store);
    return session;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function findLocalAdminSession(tokenHash) {
  const store = await readStore();
  const now = Date.now();
  const session = store.sessions.find((s) => s.token_hash === tokenHash && new Date(s.expires_at).getTime() > now);
  if (!session) return null;
  const user = store.users.find((u) => String(u.id) === String(session.admin_id));
  if (!user) return null;
  return {
    ...session,
    admin: { id: user.id, email: user.email },
  };
}

export async function deleteLocalAdminSession(tokenHash) {
  const operation = writeQueue.then(async () => {
    const store = await readStore();
    store.sessions = store.sessions.filter((s) => s.token_hash !== tokenHash);
    await writeStore(store);
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}
