import fs from 'fs';
import path from 'path';
import { connectToDatabase } from '@/lib/db';
import { getDefaultPlannerSettings } from '@/lib/planner';
import { PlannerSettingsModel, ProgressModel, UserModel } from '@/lib/models';

const DATA_PATH = path.join(process.cwd(), 'data', 'auth-progress.json');

class StorageUnavailableError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StorageUnavailableError';
    this.code = code;
  }
}

function ensureStorageFile() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DATA_PATH)) {
    const initial = { users: [], progress: {}, settings: {}, sequence: 1 };
    fs.writeFileSync(DATA_PATH, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function readStorage() {
  ensureStorageFile();
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

function writeStorage(payload) {
  ensureStorageFile();
  fs.writeFileSync(DATA_PATH, JSON.stringify(payload, null, 2), 'utf8');
}

function normalizeSettings(value) {
  const defaults = getDefaultPlannerSettings();
  const incoming = value && typeof value === 'object' ? value : {};

  const startDate = String(incoming.startDate || defaults.startDate).trim();
  const video = Number.parseInt(
    String(incoming.startVideoPosition || defaults.startVideoPosition),
    10,
  );
  const startVideoPosition =
    Number.isFinite(video) && video > 0 ? video : defaults.startVideoPosition;

  const startDsaTopicId = String(incoming.startDsaTopicId || '').trim();
  const aptitude = String(incoming.startAptitudeId || '').trim();
  const startAptitudeId = aptitude && aptitude !== 'none' ? aptitude : '';

  return {
    startDate,
    startVideoPosition,
    startDsaTopicId,
    startAptitudeId,
  };
}

async function getMode() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!process.env.MONGODB_URI) {
    if (isProduction) {
      throw new StorageUnavailableError(
        'MONGODB_MISSING',
        'MongoDB is required in production.',
      );
    }

    return 'json';
  }

  try {
    await connectToDatabase();
    return 'mongodb';
  } catch (_error) {
    if (isProduction) {
      throw new StorageUnavailableError(
        'MONGODB_UNREACHABLE',
        'MongoDB is unreachable in production.',
      );
    }

    return 'json';
  }
}

export function isStorageUnavailableError(error) {
  return error instanceof StorageUnavailableError;
}

export async function createUser(name, passwordHash) {
  const mode = await getMode();

  if (mode === 'mongodb') {
    const existing = await UserModel.findOne({ name }).lean();
    if (existing) {
      throw new Error('USER_EXISTS');
    }

    const created = await UserModel.create({ name, passwordHash });
    return { id: String(created._id), name: created.name, storageMode: mode };
  }

  const db = readStorage();
  const existing = db.users.find((user) => user.name === name);
  if (existing) {
    throw new Error('USER_EXISTS');
  }

  const id = `u${db.sequence}`;
  db.sequence += 1;
  db.users.push({
    id,
    name,
    passwordHash,
    createdAt: new Date().toISOString(),
  });
  db.progress[id] = db.progress[id] || {};
  writeStorage(db);

  return { id, name, storageMode: mode };
}

export async function findUserByName(name) {
  const mode = await getMode();

  if (mode === 'mongodb') {
    const user = await UserModel.findOne({ name }).lean();
    if (!user) {
      return null;
    }

    return {
      id: String(user._id),
      name: user.name,
      passwordHash: user.passwordHash,
      storageMode: mode,
    };
  }

  const db = readStorage();
  const user = db.users.find((entry) => entry.name === name);
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    passwordHash: user.passwordHash,
    storageMode: mode,
  };
}

export async function getProgressByUser(userId) {
  const mode = await getMode();

  if (mode === 'mongodb') {
    const docs = await ProgressModel.find(
      { userId },
      { dayKey: 1, status: 1, _id: 0 },
    ).lean();
    const statuses = {};

    for (const doc of docs) {
      statuses[doc.dayKey] = doc.status;
    }

    const settingsDoc = await PlannerSettingsModel.findOne({ userId }).lean();
    return {
      statuses,
      settings: normalizeSettings(settingsDoc || {}),
      storageMode: mode,
    };
  }

  const db = readStorage();
  const statuses = db.progress[userId] || {};
  db.settings = db.settings || {};

  return {
    statuses,
    settings: normalizeSettings(db.settings[userId] || {}),
    storageMode: mode,
  };
}

export async function setProgressForUser(userId, dayKey, status) {
  const mode = await getMode();

  if (mode === 'mongodb') {
    await ProgressModel.findOneAndUpdate(
      { userId, dayKey },
      { userId, dayKey, status },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return { ok: true, storageMode: mode };
  }

  const db = readStorage();
  db.progress[userId] = db.progress[userId] || {};
  db.progress[userId][dayKey] = status;
  writeStorage(db);
  return { ok: true, storageMode: mode };
}

export async function setPlannerSettingsForUser(userId, settings) {
  const mode = await getMode();
  const normalized = normalizeSettings(settings);

  if (mode === 'mongodb') {
    await PlannerSettingsModel.findOneAndUpdate(
      { userId },
      { userId, ...normalized },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return { settings: normalized, storageMode: mode };
  }

  const db = readStorage();
  db.settings = db.settings || {};
  db.settings[userId] = normalized;
  writeStorage(db);

  return { settings: normalized, storageMode: mode };
}
