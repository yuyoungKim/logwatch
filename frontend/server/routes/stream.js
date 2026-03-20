const express = require('express');
const pool    = require('../db');

const router = express.Router();

// SSE endpoint — streams new logs and anomalies to the client every 3 s.
router.get('/', async (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  // Heartbeat keeps the connection alive through proxies.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Start cursors 5 s in the past so the client gets a brief history
  // on first connect rather than waiting for the next event.
  let logCursor     = new Date(Date.now() - 5000);
  let anomalyCursor = new Date(Date.now() - 5000);

  const poll = async () => {
    try {
      const [logsResult, anomResult] = await Promise.all([
        pool.query(
          `SELECT id, timestamp, severity::text, service_name, message, request_id, created_at
           FROM   logs
           WHERE  created_at > $1
           ORDER  BY created_at ASC
           LIMIT  50`,
          [logCursor],
        ),
        pool.query(
          `SELECT id, log_id::text, score, detected_at, summary,
                  window_start, window_end, service_name
           FROM   anomalies
           WHERE  detected_at > $1
           ORDER  BY detected_at ASC
           LIMIT  20`,
          [anomalyCursor],
        ),
      ]);

      for (const row of logsResult.rows) send('log', row);
      if (logsResult.rows.length > 0) {
        logCursor = logsResult.rows.at(-1).created_at;
      }

      for (const row of anomResult.rows) send('anomaly', row);
      if (anomResult.rows.length > 0) {
        anomalyCursor = anomResult.rows.at(-1).detected_at;
      }
    } catch (err) {
      console.error(JSON.stringify({ level: 'ERROR', msg: 'SSE poll', error: err.message }));
    }
  };

  await poll();
  const interval = setInterval(poll, 3000);

  req.on('close', () => {
    clearInterval(interval);
    clearInterval(heartbeat);
  });
});

module.exports = router;
