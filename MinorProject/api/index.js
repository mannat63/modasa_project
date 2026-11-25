// Vercel serverless entry for the whole backend.
// All /api/* requests are routed here (see vercel.json). We ensure a cached
// MongoDB connection, then hand the request to the shared Express app.
const app = require('../backend/app');
const connectDB = require('../backend/db');

module.exports = async (req, res) => {
  try {
    await connectDB();
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ success: false, error: 'Database connection failed: ' + err.message }));
  }
  return app(req, res);
};
