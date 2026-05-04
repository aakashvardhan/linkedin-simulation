const express = require('express');
const router = express.Router();
const applicationController = require('../controllers/applicationController');

router.get('/benchmark-pair', applicationController.benchmarkPair);

router.post('/submit',       applicationController.submit);
router.post('/get',          applicationController.get);
router.post('/byJob',        applicationController.byJob);
router.post('/byMember',     applicationController.byMember);
router.post('/updateStatus', applicationController.updateStatus);
router.post('/addNote',      applicationController.addNote);

module.exports = router;