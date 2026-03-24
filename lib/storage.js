import fs from 'fs';
import path from 'path';
import { connectToDatabase } from '@/lib/db';
import { ProgressModel, UserModel } from '@/lib/models';

const DATA_PATH = path.join(process.cwd(), 'data', 'auth-progress.json');

function ensureStorageFile() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DATA_PATH)) {
    const initial = { users: [], progress: {}, sequence: 1 };
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

async function getMode() {
  try {
    await connectToDatabase();
    return process.env.MONGODB_URI ? 'mongodb' : 'json';
  } catch (_error) {
    return 'json';
  }
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

    return { statuses, storageMode: mode };
  }

  const db = readStorage();
  const statuses = db.progress[userId] || {};
  return { statuses, storageMode: mode };
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
