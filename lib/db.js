import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!global.mongooseConnection) {
  global.mongooseConnection = { conn: null, promise: null };
}

export async function connectToDatabase() {
  if (!MONGODB_URI) {
    console.warn(
      '[db] MONGODB_URI is not set. Falling back to file storage mode.',
    );
    return null;
  }

  if (global.mongooseConnection.conn) {
    return global.mongooseConnection.conn;
  }

  if (!global.mongooseConnection.promise) {
    global.mongooseConnection.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
    });
  }

  try {
    global.mongooseConnection.conn = await global.mongooseConnection.promise;
    return global.mongooseConnection.conn;
  } catch (error) {
    global.mongooseConnection.promise = null;
    console.error('[db] Failed to connect to MongoDB', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
