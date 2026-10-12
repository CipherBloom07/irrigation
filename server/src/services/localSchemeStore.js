import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultStorePath = fileURLToPath(new URL('../../data/schemes.json', import.meta.url));
let writeQueue = Promise.resolve();

function storePath() {
  return process.env.SCHEME_STORE_PATH
    ? path.resolve(process.env.SCHEME_STORE_PATH)
    : defaultStorePath;
}

export async function readLocalSchemes() {
  let contents;
  try {
    contents = await readFile(storePath(), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }

  const schemes = JSON.parse(contents);
  if (!Array.isArray(schemes) || schemes.some((scheme) => !scheme || typeof scheme !== 'object' || Array.isArray(scheme))) {
    throw new Error('The local scheme store must contain a JSON array of scheme records.');
  }
  return schemes;
}

export function appendLocalScheme(scheme, baselineSchemes) {
  const operation = writeQueue.then(async () => {
    const schemes = await readLocalSchemes() ?? baselineSchemes;
    const id = schemes.reduce((largest, entry) => Math.max(largest, Number(entry.id) || 0), 0) + 1;
    const record = { ...scheme, id, code: `IRR-ZIM-${String(id).padStart(3, '0')}` };
    const destination = storePath();
    const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;

    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(temporary, `${JSON.stringify([...schemes, record], null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, destination);
    return record;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}
