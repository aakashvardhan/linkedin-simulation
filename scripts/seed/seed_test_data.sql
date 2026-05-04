-- ═══════════════════════════════════════════════════════════════════════════
-- LinkedIn Simulation — Group 3  |  Spring 2026
-- seed_test_data.sql — run ONCE before executing test_e2e.js
--
-- Usage (local):   mysql -u root -p linkedin_simulation < seed_test_data.sql
-- Usage (Docker):  docker exec -i <mysql_container> mysql -u root -p linkedin_simulation < seed_test_data.sql
--
-- Safe to re-run — uses INSERT IGNORE throughout.
-- ═══════════════════════════════════════════════════════════════════════════

USE linkedin_simulation;

-- ─── Company (required by recruiters + job_postings FK) ──────────────────────
INSERT IGNORE INTO companies (company_id, name, industry, size)
VALUES (1, 'Test Corp', 'Technology', '51-200');

-- ─── Members (IDs 1 and 2 — used by test_e2e.js) ─────────────────────────────
-- password_hash is a bcrypt placeholder — fine for testing
INSERT IGNORE INTO members
  (member_id, first_name, last_name, email, password_hash, phone,
   location_city, location_state, location_country)
VALUES
  (1, 'Alice', 'Applicant', 'alice@test.com', '$2b$12$bCRYgThcjbfPDIP.8H1o5uvlmjZTjIuyfqeBhptu1htlNiuaaYnyu', '555-0001',
   'San Jose', 'CA', 'USA'),
  (2, 'Bob',   'Applicant', 'bob@test.com',   '$2b$12$bCRYgThcjbfPDIP.8H1o5uvlmjZTjIuyfqeBhptu1htlNiuaaYnyu',   '555-0002',
   'San Jose', 'CA', 'USA');

-- ─── Recruiters (IDs 1 and 2 — used by test_e2e.js) ──────────────────────────
INSERT IGNORE INTO recruiters
  (recruiter_id, company_id, first_name, last_name, email, password_hash, role)
VALUES
  (1, 1, 'Carol', 'Recruiter', 'carol@testcorp.com', '$2b$12$bCRYgThcjbfPDIP.8H1o5uvlmjZTjIuyfqeBhptu1htlNiuaaYnyu', 'recruiter'),
  (2, 1, 'Dave',  'Recruiter', 'dave@testcorp.com',  '$2b$12$bCRYgThcjbfPDIP.8H1o5uvlmjZTjIuyfqeBhptu1htlNiuaaYnyu',  'recruiter');

-- ─── Job Postings ─────────────────────────────────────────────────────────────
-- job_id=1 → status='open'   (used by submit, byJob, duplicate, byMember tests)
-- job_id=2 → status='closed' (used by "apply to closed job → 400" test)
INSERT IGNORE INTO job_postings
  (job_id, company_id, recruiter_id, title, description,
   employment_type, location, work_mode, status)
VALUES
  (1, 1, 1, 'Software Engineer',      'Test job open',   'Full-time', 'San Jose, CA', 'hybrid', 'open'),
  (2, 1, 1, 'Senior Product Manager', 'Test job closed', 'Full-time', 'Remote',       'remote', 'closed');

-- ─── Verify ───────────────────────────────────────────────────────────────────
SELECT 'companies' AS tbl, COUNT(*) AS row_count FROM companies  WHERE company_id  = 1
UNION ALL
SELECT 'members',           COUNT(*)        FROM members    WHERE member_id   IN (1, 2)
UNION ALL
SELECT 'recruiters',        COUNT(*)        FROM recruiters WHERE recruiter_id IN (1, 2)
UNION ALL
SELECT 'job_postings',      COUNT(*)        FROM job_postings WHERE job_id    IN (1, 2);