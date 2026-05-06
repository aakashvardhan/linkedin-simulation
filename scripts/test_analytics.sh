#!/bin/bash
echo "=== Testing analytics service directly ==="
curl -s -X POST http://localhost:8006/analytics/recruiter/dashboard \
  -H "Content-Type: application/json" \
  -d '{"window_days":30}' | python3 -m json.tool 2>/dev/null | head -40

echo ""
echo "=== Testing via API gateway ==="
curl -s -X POST http://localhost:8080/api/analytics/recruiter/dashboard \
  -H "Content-Type: application/json" \
  -d '{"window_days":30}' | python3 -m json.tool 2>/dev/null | head -40

echo ""
echo "=== MongoDB event count ==="
docker exec linkedin-simulation-mongo-1 mongosh linkedin_simulation --quiet \
  --eval "print('Total events: ' + db.analytics_events.countDocuments()); print('application.submitted: ' + db.analytics_events.countDocuments({event_type:'application.submitted'})); print('job.viewed: ' + db.analytics_events.countDocuments({event_type:'job.viewed'}));"
