const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/analyticsController');

router.post('/events/ingest',                 controller.ingest);
router.post('/analytics/jobs/top',            controller.topJobs);
router.post('/analytics/funnel',              controller.funnel);
router.post('/analytics/geo',                 controller.geo);
router.post('/analytics/member/dashboard',    controller.memberDashboard);
router.post('/analytics/recruiter/dashboard', controller.recruiterDashboard);

module.exports = router;