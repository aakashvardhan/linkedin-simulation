const express        = require('express');
const analyticsRoutes = require('./routes/analyticsRoutes');
const errorHandler   = require('./middleware/errorHandler');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'success', data: { service: 'analytics-service' }});
});

app.use('/', analyticsRoutes);
app.use(errorHandler);

module.exports = app;