const express = require('express');
const cors = require('cors');

const logsRouter      = require('./routes/logs');
const anomaliesRouter = require('./routes/anomalies');
const statsRouter     = require('./routes/stats');
const streamRouter    = require('./routes/stream');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/logs',      logsRouter);
app.use('/api/anomalies', anomaliesRouter);
app.use('/api/stats',     statsRouter);
app.use('/api/stream',    streamRouter);

app.listen(PORT, () => {
  console.log(JSON.stringify({ level: 'INFO', msg: 'logwatch-server started', port: PORT }));
});
