const express = require('express');
const pool    = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const limit   = Math.min(parseInt(req.query.limit) || 50, 200);
  const service = req.query.service || null;

  const conditions = [];
  const values     = [];
  let   idx        = 1;

  if (service) {
    conditions.push(`service_name = $${idx++}`);
    values.push(service);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit);

  const query = `
    SELECT id, log_id::text, score, detected_at, summary,
           window_start, window_end, service_name
    FROM   anomalies
    ${where}
    ORDER  BY detected_at DESC
    LIMIT  $${idx}
  `;

  try {
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error(JSON.stringify({ level: 'ERROR', msg: 'GET /api/anomalies', error: err.message }));
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
