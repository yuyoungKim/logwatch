const express = require('express');
const pool    = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const limit   = Math.min(parseInt(req.query.limit)  || 100, 500);
  const service  = req.query.service  || null;
  const severity = req.query.severity || null;

  const conditions = [];
  const values     = [];
  let   idx        = 1;

  if (service) {
    conditions.push(`service_name = $${idx++}`);
    values.push(service);
  }
  if (severity) {
    conditions.push(`severity = $${idx++}::log_severity`);
    values.push(severity);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit);

  const query = `
    SELECT id, timestamp, severity::text, service_name, message, request_id
    FROM   logs
    ${where}
    ORDER  BY timestamp DESC
    LIMIT  $${idx}
  `;

  try {
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error(JSON.stringify({ level: 'ERROR', msg: 'GET /api/logs', error: err.message }));
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
