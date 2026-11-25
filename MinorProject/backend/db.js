const mongoose = require('mongoose');

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/municipal-waste';

/**
 * Cached MongoDB connection.
 *
 * On serverless (Vercel) the same process is reused across warm invocations,
 * so we must NOT open a new connection every request. We cache the connection
 * (and the in-flight promise) on the global object so it survives between calls.
 */
let cached = global.__wasterouteMongoose;
if (!cached) cached = global.__wasterouteMongoose = { conn: null, promise: null };

async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(URI, { bufferCommands: false, serverSelectionTimeoutMS: 8000 })
      .then((m) => m);
  }
  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null; // allow a retry on the next request
    throw err;
  }
  return cached.conn;
}

module.exports = connectDB;
