// Local development entry point.
// (On Vercel the app is served by ../api/index.js instead of this file.)
const app = require('./app');
const connectDB = require('./db');

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => {
      console.log(`🚛 WasteRoute AI backend running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
