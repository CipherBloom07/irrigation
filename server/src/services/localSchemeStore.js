import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultStorePath = fileURLToPath(new URL('../../data/schemes.json', import.meta.url));
let writeQueue = Promise.resolve();

const baselineSchemes = [
  { id: 1, code: 'IRR-ZIM-001', name: 'Nyanyadzi Irrigation Scheme', equipped_area: 412, functional_area: 290, beneficiaries: 420, status: 'Partially Functional', district: 'Chimanimani', province: 'Manicaland', ward: 8, source: 'River', crop: 'Green mealies, wheat', market: 'Mutare Market', market_analysis: 'High demand', officer: 'Tendai Mutasa', rehab: 2018, risk_factors: ['Inefficient, unreliable, and inequitable water delivery service', 'Rapid deterioration of infrastructure', 'Incapacitated to sustainably operate and maintain irrigation infrastructure', 'Difficulties accessing finances (loans & credits)'] },
  { id: 2, code: 'IRR-ZIM-002', name: 'Exchange Irrigation Scheme', equipped_area: 525, functional_area: 480, beneficiaries: 980, status: 'Fully Functional', district: 'Zhombe', province: 'Midlands', ward: 14, source: 'Dam', crop: 'Wheat, green mealies', market: 'GMB Kwekwe', market_analysis: 'High demand', officer: 'Chipo Zhou', rehab: 2022, risk_factors: ['Difficulties accessing finances (loans & credits)', 'Unsustainable plot sizes'] },
  { id: 3, code: 'IRR-ZIM-003', name: 'Tshovane Irrigation Scheme', equipped_area: 180, functional_area: 110, beneficiaries: 140, status: 'Under Rehabilitation', district: 'Chiredzi', province: 'Masvingo', ward: 5, source: 'Borehole', crop: 'Tomatoes, grain maize', market: 'Chiredzi Market', market_analysis: 'Incomplete', officer: 'Tatenda Moyo', rehab: 2024, risk_factors: ['Incapacitated to sustainably operate and maintain irrigation infrastructure', 'Lack of government policy on irrigation', 'Confusion on ownership of the irrigation scheme', 'Farmers are not committed to their projects'] },
  { id: 4, code: 'IRR-ZIM-004', name: 'Mubaira Solar Irrigation Scheme', equipped_area: 95, functional_area: 95, beneficiaries: 85, status: 'Fully Functional', district: 'Mhondoro-Ngezi', province: 'Mashonaland West', ward: 2, source: 'Borehole', crop: 'Wheat, green mealies', market: 'Harare Market', market_analysis: 'High demand', officer: 'Rudo Moyo', rehab: 2021, risk_factors: [] },
  { id: 5, code: 'IRR-ZIM-005', name: 'Silalatshani Irrigation Scheme', equipped_area: 850, functional_area: 310, beneficiaries: 853, status: 'Partially Functional', district: 'Insiza', province: 'Matabeleland South', ward: 11, source: 'Dam', crop: 'Potatoes, chilli, butternuts', market: 'Bulawayo Market', market_analysis: 'Moderate', officer: 'Bhekinkosi Ncube', rehab: 2019, risk_factors: ['Rapid deterioration of infrastructure', 'Inefficient, unreliable, and inequitable water delivery service', 'Incapacitated to sustainably operate and maintain irrigation infrastructure'] },
];

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
    if (error.code === 'ENOENT') {
      await writeSchemesToDisk(baselineSchemes);
      return baselineSchemes;
    }
    throw error;
  }

  try {
    const schemes = JSON.parse(contents);
    if (!Array.isArray(schemes)) {
      return baselineSchemes;
    }
    return schemes;
  } catch {
    return baselineSchemes;
  }
}

async function writeSchemesToDisk(schemes) {
  const destination = storePath();
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(schemes, null, 2)}\n`, { encoding: 'utf8' });
  await rename(temporary, destination);
}

export function appendLocalScheme(scheme) {
  const operation = writeQueue.then(async () => {
    const schemes = await readLocalSchemes();
    const nextId = schemes.reduce((largest, entry) => Math.max(largest, Number(entry.id) || 0), 0) + 1;
    const record = {
      ...scheme,
      id: nextId,
      code: scheme.code || `IRR-ZIM-${String(nextId).padStart(3, '0')}`,
      updated_at: new Date().toISOString(),
    };
    const updated = [record, ...schemes];
    await writeSchemesToDisk(updated);
    return record;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export function updateLocalScheme(id, schemeUpdates) {
  const operation = writeQueue.then(async () => {
    const schemes = await readLocalSchemes();
    const index = schemes.findIndex((s) => Number(s.id) === Number(id));
    if (index === -1) {
      throw new Error('Scheme was not found.');
    }
    const existing = schemes[index];
    const updatedRecord = {
      ...existing,
      ...schemeUpdates,
      id: existing.id,
      code: existing.code || `IRR-ZIM-${String(existing.id).padStart(3, '0')}`,
      updated_at: new Date().toISOString(),
    };
    schemes[index] = updatedRecord;
    await writeSchemesToDisk(schemes);
    return updatedRecord;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export function deleteLocalScheme(id) {
  const operation = writeQueue.then(async () => {
    const schemes = await readLocalSchemes();
    const index = schemes.findIndex((s) => Number(s.id) === Number(id));
    if (index === -1) {
      throw new Error('Scheme was not found.');
    }
    schemes.splice(index, 1);
    await writeSchemesToDisk(schemes);
    return true;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}
