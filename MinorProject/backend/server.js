const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// ── CORS ─────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://localhost:4173',  // Vite preview
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Render healthcheck, etc.)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json());

// ── Health / root ─────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'Backend running successfully',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    routes: [
      '/api/trucks',
      '/api/zones',
      '/api/ai',
      '/api/simulation',
      '/api/reports',
      '/api/drivers',
      '/api/flags',
      '/api/audit',
    ],
  });
});

// ── Route files ───────────────────────────────────────────
const trucksRouter     = require('./routes/trucks');
const zonesRouter      = require('./routes/zones');
const aiRouter         = require('./routes/helper');
const reportsRouter    = require('./routes/reports');
const driversRouter    = require('./routes/drivers');
const simulationRouter = require('./routes/simulation');

app.use('/api/trucks',      trucksRouter);
app.use('/api/zones',       zonesRouter);
app.use('/api/ai',          aiRouter);
app.use('/api/simulation',  simulationRouter);
app.use('/api',             reportsRouter);   // /api/reports/*, /api/audit
app.use('/api',             driversRouter);   // /api/drivers/*, /api/flags/*

// ── 404 fallback ──────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.path}` });
});

// ── Global error handler ──────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ success: false, error: err.message });
});

// ── MongoDB connection ─────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/municipal-waste')
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

// ── Start server ──────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚛 WasteRoute AI backend running on port ${PORT}`);
  console.log(`   CORS allows: ${allowedOrigins.join(', ')}`);
});
