# Team Setup Guide - LinkedIn Simulation Testing
**How to Load and Test the Complete Integrated Database**

---

## 🎯 What's Integrated

Your testing environment now includes:
- ✅ **MySQL**: 10,000 members, 10,000 jobs, 10,000 applications
- ✅ **MongoDB**: 10,000 resume PDFs in GridFS, events collection
- ✅ **MySQL ↔ MongoDB**: Fully linked via resume URLs
- ✅ **Redis**: Caching layer
- ✅ **Kafka**: Event streaming
- ✅ **All microservices**: Backend, application, messaging, analytics, recruiter-assistant

---

## 🚀 Quick Start (15 Minutes)

### **Step 1: Pull Latest Code**

```bash
# Clone (if first time)
git clone https://github.com/aakashvardhan/linkedin-simulation.git
cd linkedin-simulation

# Or pull latest (if already cloned)
git checkout feature/full-stack-integration
git pull origin feature/full-stack-integration
```

### **Step 2: Start Docker Services**

```bash
# Start all services
docker compose up -d

# Wait 2-3 minutes for all to become healthy
docker compose ps

# All 11 services should show (healthy)
```

### **Step 3: Verify Database is Loaded**

The SQL seed data loads automatically via `docker-compose.yml`. Verify:

```bash
# Check MySQL data
docker exec mysql mysql -uroot -plinkedin_pass linkedin_simulation -e \
  "SELECT COUNT(*) as members FROM members;"
# Expected: 10000

docker exec mysql mysql -uroot -plinkedin_pass linkedin_simulation -e \
  "SELECT COUNT(*) as jobs FROM job_postings;"
# Expected: 10000
```

### **Step 4: Load Resume PDFs into MongoDB**

**This step is REQUIRED - resumes are NOT auto-loaded:**

```bash
# Install Python dependencies
pip3 install pymongo

# Run resume seeding script
python3 backend/scripts/seed_resumes_gridfs.py

# Wait ~2-3 minutes for completion
# You'll see: "✅ Complete! Resume files: 10000"

# Update MySQL to point to MongoDB resumes
python3 backend/scripts/update_mysql_resume_urls.py

# You'll see: "✅ Updated 10000 member resume URLs"
```

### **Step 5: Verify Integration**

```bash
# Check MySQL → MongoDB linkage
docker exec mysql mysql -uroot -plinkedin_pass linkedin_simulation -e \
  "SELECT member_id, first_name, resume_url FROM members LIMIT 3;"

# Expected output:
# member_id | first_name | resume_url
# 1         | Alexis     | mongodb://resumes/member_000001
# 2         | Juan       | mongodb://resumes/member_000002
# 3         | Martha     | mongodb://resumes/member_000003

# Check MongoDB has the files
docker exec mongo mongosh linkedin_simulation --eval \
  "db['resumes.files'].countDocuments()"

# Expected: 10000
```

### **Step 6: Access the Application**

**Open in browser:**
- Frontend: http://localhost:3000
- API Gateway: http://localhost:8090
- API Backend: http://localhost:8010

---

## 🧪 Testing Database Integration

### **Test 1: View Member with Resume**

**Frontend Test:**
1. Go to http://localhost:3000
2. Navigate to Members/Profiles
3. Click on any member
4. You should see resume information

**API Test:**
```bash
curl -X POST http://localhost:8010/members/get \
  -H "Content-Type: application/json" \
  -d '{"member_id": 1}'
```

Expected response includes:
```json
{
  "member_id": 1,
  "first_name": "Alexis",
  "resume_url": "mongodb://resumes/member_000001",
  ...
}
```

### **Test 2: Retrieve Resume PDF from MongoDB**

**Check if resume exists:**
```bash
docker exec mongo mongosh linkedin_simulation --eval "
  db['resumes.files'].findOne(
    {_id: 'member_000001'}, 
    {_id: 1, filename: 1, length: 1, 'metadata.member_id': 1}
  )
"
```

Expected:
```javascript
{
  _id: 'member_000001',
  filename: '10554236.pdf',
  length: 48278,
  metadata: { member_id: 1 }
}
```

### **Test 3: Job Application Flow (End-to-End)**

```bash
# 1. Submit application
curl -X POST http://localhost:8004/applications/submit \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": 1,
    "member_id": 1,
    "resume_url": "mongodb://resumes/member_000001",
    "cover_letter": "I am interested in this position"
  }'

# 2. Verify Kafka event was created
docker exec mongo mongosh linkedin_simulation --eval \
  "db.events.findOne({event_type: 'application.submitted'})"

# 3. Check application in MySQL
docker exec mysql mysql -uroot -plinkedin_pass linkedin_simulation -e \
  "SELECT * FROM applications ORDER BY application_id DESC LIMIT 1;"
```

### **Test 4: Search Members by Skills**

```bash
curl -X POST http://localhost:8010/members/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Python", "limit": 5}'
```

Should return members with Python skills.

### **Test 5: View Job Postings**

```bash
curl -X POST http://localhost:8010/jobs/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Software Engineer", "limit": 5}'
```

Should return matching jobs.

---

## 📊 Database Schema Reference

### **MySQL Tables**

**members** (10,000 records)
```sql
member_id, first_name, last_name, email, 
resume_url (→ MongoDB GridFS),
location_city, location_state, headline
```

**job_postings** (10,000 records)
```sql
job_id, company_id, recruiter_id, title, 
description, location, status, posted_datetime
```

**applications** (10,000 records)
```sql
application_id, job_id, member_id, 
status, resume_url, application_datetime
```

**companies** (1,000 records)
```sql
company_id, name, industry, size
```

**connections** (10,000 records)
```sql
member_id_1, member_id_2, status, requested_at
```

### **MongoDB Collections**

**resumes.files** (10,000 GridFS file metadata)
```javascript
{
  _id: "member_000001",
  filename: "10554236.pdf",
  length: 48278,
  uploadDate: ISODate(...),
  metadata: {
    member_id: 1,
    source_path: "datasets/resumes/data/...",
    source_index: 0
  }
}
```

**resumes.chunks** (10,000 GridFS binary chunks)
```javascript
{
  files_id: "member_000001",
  n: 0,
  data: Binary(...)
}
```

**events** (Kafka event stream)
```javascript
{
  event_type: "job.viewed",
  actor_id: "1",
  entity_id: "123",
  timestamp: ISODate(...),
  payload: {...}
}
```

---

## 🔍 Frontend Testing Checklist

### **Homepage**
- [ ] Page loads at http://localhost:3000
- [ ] Navigation menu works
- [ ] User can see featured jobs

### **Job Search**
- [ ] Search for "Software Engineer"
- [ ] Results display with company names
- [ ] Can click on job to view details
- [ ] Job details show all information

### **Member Profiles**
- [ ] Can search for members
- [ ] Member profiles display
- [ ] **CRITICAL**: Resume URL shows as `mongodb://resumes/member_XXXXXX`
- [ ] Skills, experience, education display

### **Job Applications**
- [ ] Can apply to a job
- [ ] Application confirmation appears
- [ ] Application shows in "My Applications"

### **Messaging**
- [ ] Can open message thread
- [ ] Can send message
- [ ] Message appears in thread

---

## 🐛 Troubleshooting

### **Issue: No resumes showing in frontend**

**Problem:** MongoDB resumes weren't loaded

**Solution:**
```bash
# Run resume seeding
python3 backend/scripts/seed_resumes_gridfs.py

# Update MySQL URLs
python3 backend/scripts/update_mysql_resume_urls.py

# Verify
docker exec mongo mongosh linkedin_simulation --eval \
  "db['resumes.files'].countDocuments()"
# Should return: 10000
```

### **Issue: Services won't start**

**Problem:** Ports already in use

**Solution:**
```bash
# Stop all containers
docker compose down

# Check what's using ports
lsof -ti:3000,8090,8010 | xargs kill -9

# Restart
docker compose up -d
```

### **Issue: Database is empty**

**Problem:** Seed data didn't load

**Solution:**
```bash
# Check if SQL file exists
ls -la datasets/linkedin_simulation_seed.sql

# Manually load SQL data
docker exec -i mysql mysql -uroot -plinkedin_pass linkedin_simulation \
  < datasets/linkedin_simulation_seed.sql

# Verify
docker exec mysql mysql -uroot -plinkedin_pass linkedin_simulation -e \
  "SELECT COUNT(*) FROM members;"
```

### **Issue: "Cannot connect to database"**

**Problem:** Services not healthy yet

**Solution:**
```bash
# Check service status
docker compose ps

# Wait for all to show (healthy)
# Infrastructure takes ~60 seconds
# Backends take ~30 more seconds

# Check logs if stuck
docker compose logs api-backend
```

---

## 📝 Testing Scenarios

### **Scenario 1: Job Seeker Journey**

1. **Search for jobs** → `POST /jobs/search`
2. **View job details** → `POST /jobs/get` (triggers `job.viewed` event)
3. **Submit application** → `POST /applications/submit` (triggers `application.submitted` event)
4. **Check application status** → `POST /applications/list`
5. **Verify events in MongoDB** → `db.events.find()`

### **Scenario 2: Recruiter Workflow**

1. **Login as recruiter** → `POST /auth/login`
2. **View applicants** → `POST /applications/list`
3. **Review resumes** → Resume URLs point to MongoDB GridFS
4. **Update application status** → `POST /applications/update`
5. **Send message to candidate** → `POST /messages/send`

### **Scenario 3: Analytics Dashboard**

1. **View top jobs** → `POST /analytics/jobs/top`
2. **Check application funnel** → `POST /analytics/funnel`
3. **Geographic distribution** → `POST /analytics/geo`
4. **Member dashboard** → `POST /analytics/member/dashboard`

---

## 🔗 API Endpoints Reference

### **Members (api-backend:8010)**
```bash
POST /members/search    # Search members
POST /members/get       # Get member by ID
```

### **Jobs (api-backend:8010)**
```bash
POST /jobs/search       # Search jobs
POST /jobs/get          # Get job by ID
POST /jobs/create       # Create job (recruiter only)
```

### **Applications (application-service:8004)**
```bash
POST /applications/submit     # Submit application
POST /applications/list       # List applications
POST /applications/update     # Update status
```

### **Messaging (messaging-service:8005)**
```bash
POST /threads/open           # Create thread
POST /messages/send          # Send message
POST /messages/list          # List messages
```

### **Analytics (analytics-service:8006)**
```bash
POST /analytics/jobs/top          # Top jobs by metric
POST /analytics/funnel            # Application funnel
POST /analytics/member/dashboard  # Member analytics
```

---

## ✅ Verification Checklist

Before starting your tests, verify:

- [ ] All 11 Docker services are (healthy)
- [ ] MySQL has 10,000 members
- [ ] MySQL has 10,000 jobs
- [ ] MongoDB has 10,000 resume files
- [ ] MySQL resume URLs format: `mongodb://resumes/member_XXXXXX`
- [ ] Frontend loads at http://localhost:3000
- [ ] API Gateway responds at http://localhost:8090
- [ ] Can submit a test application
- [ ] Kafka events appear in MongoDB `events` collection

**Run full verification:**
```bash
bash << 'VERIFY'
echo "=== Service Health ==="
docker compose ps | grep -E "healthy|unhealthy"

echo -e "\n=== MySQL Data ==="
docker exec mysql mysql -uroot -plinkedin_pass linkedin_simulation -e \
  "SELECT 
    (SELECT COUNT(*) FROM members) as members,
    (SELECT COUNT(*) FROM job_postings) as jobs,
    (SELECT COUNT(*) FROM applications) as applications;"

echo -e "\n=== MongoDB Data ==="
docker exec mongo mongosh linkedin_simulation --eval \
  "printjson({
    resume_files: db['resumes.files'].countDocuments(),
    events: db.events.countDocuments()
  })"

echo -e "\n=== Frontend Test ==="
curl -s http://localhost:3000 > /dev/null && echo "✅ Frontend OK" || echo "❌ Frontend FAIL"

echo -e "\n=== API Test ==="
curl -s http://localhost:8010/health > /dev/null && echo "✅ Backend OK" || echo "❌ Backend FAIL"

echo -e "\n✅ All checks complete!"
VERIFY
```

---
