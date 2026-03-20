const express = require('express');
const pool    = require('../db');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const [sevResult, anomResult, svcResult] = await Promise.all([
      pool.query(`
        SELECT severity::text AS severity, COUNT(*)::int AS count
        FROM   logs
        WHERE  timestamp > NOW() - INTERVAL '1 hour'
        GROUP  BY severity
      `),
      pool.query(`
        SELECT COUNT(*)::int AS count
        FROM   anomalies
        WHERE  detected_at > NOW() - INTERVAL '1 hour'
      `),
      pool.query(`
        SELECT DISTINCT service_name
        FROM   logs
        WHERE  timestamp > NOW() - INTERVAL '5 minutes'
      `),
    ]);

    const severity_counts = {};
    for (const row of sevResult.rows) {
      severity_counts[row.severity] = row.count;
    }

    res.json({
      severity_counts,
      anomaly_count_1h: anomResult.rows[0].count,
      active_services:  svcResult.rows.map((r) => r.service_name),
    });
  } catch (err) {
    console.error(JSON.stringify({ level: 'ERROR', msg: 'GET /api/stats', error: err.message }));
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
