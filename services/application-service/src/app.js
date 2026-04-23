const express              = require('express');
const applicationRoutes    = require('./routes/applicationRoutes');
const notificationRoutes   = require('./routes/notificationRoutes');
const errorHandler         = require('./middleware/errorHandler');

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'success', data: { service: 'application-service' }, error: null });
});

app.use('/applications',  applicationRoutes);
app.use('/notifications', notificationRoutes);

app.use(errorHandler);

module.exports = app;