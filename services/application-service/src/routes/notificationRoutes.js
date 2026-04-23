const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/notificationController');

router.post('/get',      controller.getNotifications);
router.post('/markRead', controller.markRead);

module.exports = router;