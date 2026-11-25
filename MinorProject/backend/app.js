const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// ── CORS ──────────────────────────────────────────────────
// In production the frontend and API are served from the SAME Vercel domain,
// so CORS is effectively a non-issue; we reflect the request origin so that
// local dev and any Vercel preview URLs also work without configuration.
app.use(cors({ origin: true, credentials: true }));

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
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ success: false, error: err.message });
});

module.exports = app;
