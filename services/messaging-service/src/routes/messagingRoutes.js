const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/messagingController');

router.post('/threads/open',   controller.openThread);
router.post('/threads/get',    controller.getThread);
router.post('/threads/byUser', controller.threadsByUser);
router.post('/messages/send',  controller.sendMessage);
router.post('/messages/list',  controller.listMessages);
router.post('/messages/markRead', controller.markRead);

module.exports = router;