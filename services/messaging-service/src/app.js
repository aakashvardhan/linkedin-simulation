const express = require('express');
const messagingRoutes = require('./routes/messagingRoutes');
const errorHandler    = require('./middleware/errorHandler');

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'success', data: { service: 'messaging-service' }, error: null });
});

app.use('/', messagingRoutes);

app.use(errorHandler);

module.exports = app;