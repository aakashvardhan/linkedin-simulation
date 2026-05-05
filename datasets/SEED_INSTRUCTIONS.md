# LinkedIn Simulation - 10K Dataset Seed Instructions

## Database Overview
- **10,000 members** with MongoDB GridFS resumes
- **10,000 recruiters**
- **500 companies**
- **10,000 job postings**
- **10,000 applications**
- **10,000 connections** 
- **5,000 saved jobs**

## Quick Start

### 1. Load MySQL Data
```bash
# From project root
docker exec -i $(docker compose ps mysql -q) mysql -uroot -plinkedin_pass linkedin_simulation < datasets/linkedin_simulation_seed.sql
```

### 2. Load MongoDB Resumes
```bash
# Seed 10K resumes to MongoDB GridFS (cycles through 1,706 PDFs)
python3 backend/scripts/seed_resumes_gridfs.py

# Update MySQL resume URLs to match GridFS file IDs
python3 backend/scripts/update_mysql_resume_urls.py
```

### 3. Verify Seeding
```bash
# Check MySQL counts
docker exec $(docker compose ps mysql -q) mysql -uroot -plinkedin_pass -D linkedin_simulation -e "
SELECT 
  'members' as table_name, COUNT(*) as count FROM members
UNION ALL SELECT 'recruiters', COUNT(*) FROM recruiters
UNION ALL SELECT 'companies', COUNT(*) FROM companies
UNION ALL SELECT 'job_postings', COUNT(*) FROM job_postings
UNION ALL SELECT 'applications', COUNT(*) FROM applications
UNION ALL SELECT 'connections', COUNT(*) FROM connections
UNION ALL SELECT 'saved_jobs', COUNT(*) FROM saved_jobs;"

# Check MongoDB resumes
docker exec $(docker compose ps mongo -q) mongosh linkedin_simulation --quiet --eval "db.resumes.files.countDocuments({})"
```

## Architecture Notes

- **MySQL**: Stores all relational data (members, jobs, applications, etc.)
- **MongoDB GridFS**: Stores 10K resume PDFs
- **Resume URL Format**: `mongodb://resumes/member_XXXXXX`
- **Cyclic Resume Pattern**: 1,706 unique PDFs are reused across 10K members

## Source Data
- Resume PDFs: `datasets/resumes/data/data/` (1,706 PDFs organized by job category)
- Generated using Kaggle datasets + Faker library for realistic data

## Troubleshooting

**If MySQL tables are empty after loading:**
```bash
# Check if database exists
docker exec $(docker compose ps mysql -q) mysql -uroot -plinkedin_pass -e "SHOW DATABASES;"

# Recreate database if needed
docker exec $(docker compose ps mysql -q) mysql -uroot -plinkedin_pass -e "DROP DATABASE IF EXISTS linkedin_simulation; CREATE DATABASE linkedin_simulation;"

# Reload seed data
docker exec -i $(docker compose ps mysql -q) mysql -uroot -plinkedin_pass linkedin_simulation < datasets/linkedin_simulation_seed.sql
```

**If MongoDB resumes are missing:**
```bash
# Clear and reseed
docker exec $(docker compose ps mongo -q) mongosh linkedin_simulation --eval "db.resumes.files.deleteMany({}); db.resumes.chunks.deleteMany({});"
python3 backend/scripts/seed_resumes_gridfs.py
python3 backend/scripts/update_mysql_resume_urls.py
```

## Regenerating Seed Data from Scratch

If you need to regenerate the seed data (instead of using the SQL file):

### 1. Download Kaggle Datasets
The seed script uses two Kaggle datasets:
- Jobs: `datasets/jobs/clean_jobs.csv` (LinkedIn Job 2023 dataset)
- Resumes: `datasets/resumes/Resume/Resume.csv` (Resume dataset)

Place these CSVs in the locations above, then run:

```bash
python3 backend/scripts/seed_data.py
```

This will:
- Load real job data from Kaggle
- Load real resume data from Kaggle  
- Top up to 10K using Faker
- Create connections, applications, saved jobs
- Generate the full relational dataset

### 2. Export to SQL
After running seed_data.py, capture it:
```bash
./scripts/generate_seed_sql.sh
```
