import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Canonical feature flags. Defaults are applied when a row doesn't exist.
export const FEATURE_FLAGS = {
  photosPublicViewEnabled: { default: true, type: 'boolean' },
  schematicsPublicViewEnabled: { default: true, type: 'boolean' },
  photoApprovalEnabled: { default: true, type: 'boolean' },
  schematicApprovalEnabled: { default: true, type: 'boolean' },
};

const parseValue = (raw, type) => {
  if (type === 'boolean') return raw === 'true' || raw === '1';
  if (type === 'number') return Number(raw);
  return raw;
};

const stringifyValue = (value, type) => {
  if (type === 'boolean') return value ? 'true' : 'false';
  return String(value);
};

// In-memory cache so every request doesn't hit the DB. Invalidated on writes.
let cache = null;
let cacheAt = 0;
const CACHE_TTL_MS = 5_000;

export const invalidateSettingsCache = () => {
  cache = null;
  cacheAt = 0;
};

export const getAllSettings = async () => {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL_MS) return cache;

  const rows = await prisma.systemSetting.findMany();
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const resolved = {};
  for (const [key, meta] of Object.entries(FEATURE_FLAGS)) {
    resolved[key] = key in byKey
      ? parseValue(byKey[key], meta.type)
      : meta.default;
  }

  cache = resolved;
  cacheAt = now;
  return resolved;
};

export const getSetting = async (key) => {
  const all = await getAllSettings();
  return all[key];
};

export const setSetting = async (key, value, userId = null) => {
  const meta = FEATURE_FLAGS[key];
  if (!meta) throw new Error(`Unknown setting: ${key}`);

  const stringValue = stringifyValue(value, meta.type);
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value: stringValue, updatedById: userId },
    create: { key, value: stringValue, updatedById: userId },
  });
  invalidateSettingsCache();
};
