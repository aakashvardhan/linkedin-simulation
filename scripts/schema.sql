-- ═══════════════════════════════════════════════════════════════════════════
-- LinkedIn Simulation — Group 3  |  Distributed Systems Spring 2026
-- schema.sql — run ONCE against the shared MySQL instance
--
-- Usage (local):   mysql -u root -p linkedin_simulation < schema.sql
-- Usage (Docker):  mounted to /docker-entrypoint-initdb.d/schema.sql
--                  runs automatically on first container start
--
-- All 8 services connect to ONE database: linkedin_simulation
-- This file is idempotent — safe to run multiple times (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS linkedin_simulation
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE linkedin_simulation;

-- ─── companies ────────────────────────────────────────────────────────────────
-- Created first — recruiters and job_postings reference it.
CREATE TABLE IF NOT EXISTS companies (
  company_id   INT          NOT NULL AUTO_INCREMENT,
  name         VARCHAR(200) NOT NULL,
  industry     VARCHAR(100) DEFAULT NULL,
  size         VARCHAR(50)  DEFAULT NULL  COMMENT '1-10, 11-50, 51-200, 201-500, 500-1000, 1000+',
  logo_url     VARCHAR(500) DEFAULT NULL,
  created_at   DATETIME     NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── members ─────────────────────────────────────────────────────────────────
-- Core member (applicant) profile. Referenced by applications, connections, saved_jobs.
CREATE TABLE IF NOT EXISTS members (
  member_id         INT          NOT NULL AUTO_INCREMENT,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  email             VARCHAR(255) NOT NULL,
  password_hash     VARCHAR(255) NOT NULL              COMMENT 'bcrypt hash — never plaintext',
  phone             VARCHAR(30)  DEFAULT NULL,
  location_city     VARCHAR(100) DEFAULT NULL,
  location_state    VARCHAR(100) DEFAULT NULL,
  location_country  VARCHAR(100) DEFAULT NULL,
  headline          VARCHAR(300) DEFAULT NULL,
  about             TEXT         DEFAULT NULL,
  profile_photo_url VARCHAR(500) DEFAULT NULL,
  resume_url        VARCHAR(500) DEFAULT NULL,
  connections_count INT          NOT NULL DEFAULT 0,
  profile_views     INT          NOT NULL DEFAULT 0    COMMENT 'Legacy counter — analytics uses events collection',
  created_at        DATETIME     NOT NULL DEFAULT NOW(),
  updated_at        DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  PRIMARY KEY (member_id),
  UNIQUE KEY ux_member_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── member_skills ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS member_skills (
  skill_id   INT          NOT NULL AUTO_INCREMENT,
  member_id  INT          NOT NULL,
  skill_name VARCHAR(100) NOT NULL,
  PRIMARY KEY (skill_id),
  KEY idx_skills_member (member_id),
  CONSTRAINT fk_skills_member FOREIGN KEY (member_id)
    REFERENCES members (member_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── member_experience ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS member_experience (
  exp_id      INT          NOT NULL AUTO_INCREMENT,
  member_id   INT          NOT NULL,
  company     VARCHAR(200) NOT NULL,
  title       VARCHAR(200) NOT NULL,
  start_date  DATE         NOT NULL,
  end_date    DATE         DEFAULT NULL COMMENT 'NULL = current role',
  description TEXT         DEFAULT NULL,
  PRIMARY KEY (exp_id),
  KEY idx_exp_member (member_id),
  CONSTRAINT fk_exp_member FOREIGN KEY (member_id)
    REFERENCES members (member_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── member_education ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS member_education (
  edu_id     INT          NOT NULL AUTO_INCREMENT,
  member_id  INT          NOT NULL,
  school     VARCHAR(200) NOT NULL,
  degree     VARCHAR(100) NOT NULL,
  field      VARCHAR(100) DEFAULT NULL,
  start_year INT          DEFAULT NULL,
  end_year   INT          DEFAULT NULL COMMENT 'NULL = currently enrolled',
  PRIMARY KEY (edu_id),
  KEY idx_edu_member (member_id),
  CONSTRAINT fk_edu_member FOREIGN KEY (member_id)
    REFERENCES members (member_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── recruiters ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recruiters (
  recruiter_id  INT          NOT NULL AUTO_INCREMENT,
  company_id    INT          NOT NULL,
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone         VARCHAR(30)  DEFAULT NULL,
  role          VARCHAR(50)  NOT NULL DEFAULT 'recruiter',
  created_at    DATETIME     NOT NULL DEFAULT NOW(),
  PRIMARY KEY (recruiter_id),
  UNIQUE KEY ux_recruiter_email (email),
  KEY idx_recruiter_company (company_id),
  CONSTRAINT fk_recruiter_company FOREIGN KEY (company_id)
    REFERENCES companies (company_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── job_postings ────────────────────────────────────────────────────────────
-- M5 reads status from this table to validate open/closed before every application submit.
CREATE TABLE IF NOT EXISTS job_postings (
  job_id           INT          NOT NULL AUTO_INCREMENT,
  company_id       INT          NOT NULL,
  recruiter_id     INT          NOT NULL,
  title            VARCHAR(200) NOT NULL,
  description      TEXT         NOT NULL,
  seniority_level  VARCHAR(50)  DEFAULT NULL COMMENT 'Junior, Mid, Senior, Lead',
  employment_type  VARCHAR(50)  DEFAULT NULL COMMENT 'Full-time, Part-time, Contract',
  location         VARCHAR(200) DEFAULT NULL,
  work_mode        VARCHAR(20)  DEFAULT NULL COMMENT 'remote, hybrid, onsite',
  skills_required  TEXT         DEFAULT NULL COMMENT 'JSON array stored as text',
  salary_min       INT          DEFAULT NULL,
  salary_max       INT          DEFAULT NULL,
  status           ENUM('open','closed') NOT NULL DEFAULT 'open',
  posted_datetime  DATETIME     NOT NULL DEFAULT NOW(),
  views_count      INT          NOT NULL DEFAULT 0,
  applicants_count INT          NOT NULL DEFAULT 0,
  saves_count      INT          NOT NULL DEFAULT 0,
  closed_at        DATETIME     DEFAULT NULL,
  PRIMARY KEY (job_id),
  -- Composite index: job search filters by status + date
  KEY idx_jobs_status_date   (status, posted_datetime),
  KEY idx_jobs_company       (company_id),
  KEY idx_jobs_recruiter     (recruiter_id),
  KEY idx_jobs_location      (location),
  CONSTRAINT fk_job_company   FOREIGN KEY (company_id)   REFERENCES companies  (company_id)   ON DELETE RESTRICT,
  CONSTRAINT fk_job_recruiter FOREIGN KEY (recruiter_id) REFERENCES recruiters (recruiter_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── applications ────────────────────────────────────────────────────────────
-- Owned by M5. The UNIQUE KEY (job_id, member_id) is the primary duplicate guard.
-- The status ENUM enforces the state machine: submitted→reviewing→interview→offer|rejected
CREATE TABLE IF NOT EXISTS applications (
  application_id      INT          NOT NULL AUTO_INCREMENT,
  job_id              INT          NOT NULL,
  member_id           INT          NOT NULL,
  resume_url          VARCHAR(500) DEFAULT NULL,
  cover_letter        TEXT         DEFAULT NULL,
  status              ENUM('submitted','reviewing','interview','offer','rejected')
                      NOT NULL DEFAULT 'submitted',
  application_datetime DATETIME    NOT NULL DEFAULT NOW(),
  recruiter_notes     TEXT         DEFAULT NULL,
  updated_at          DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  PRIMARY KEY (application_id),
  -- UNIQUE prevents duplicate applications — maps to 409 Conflict in M5
  UNIQUE KEY ux_app (job_id, member_id),
  KEY idx_app_job    (job_id),
  KEY idx_app_member (member_id),
  KEY idx_app_status (status),
  CONSTRAINT fk_app_job    FOREIGN KEY (job_id)    REFERENCES job_postings (job_id)    ON DELETE RESTRICT,
  CONSTRAINT fk_app_member FOREIGN KEY (member_id) REFERENCES members     (member_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── connections ─────────────────────────────────────────────────────────────
-- Owned by M4. UNIQUE KEY prevents duplicate requests between the same pair.
CREATE TABLE IF NOT EXISTS connections (
  connection_id INT      NOT NULL AUTO_INCREMENT,
  requester_id  INT      NOT NULL,
  receiver_id   INT      NOT NULL,
  status        ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  requested_at  DATETIME NOT NULL DEFAULT NOW(),
  responded_at  DATETIME DEFAULT NULL,
  PRIMARY KEY (connection_id),
  -- Prevents user A from sending two requests to user B
  UNIQUE KEY ux_conn (requester_id, receiver_id),
  KEY idx_conn_requester (requester_id),
  KEY idx_conn_receiver  (receiver_id),
  CONSTRAINT fk_conn_requester FOREIGN KEY (requester_id) REFERENCES members (member_id) ON DELETE CASCADE,
  CONSTRAINT fk_conn_receiver  FOREIGN KEY (receiver_id)  REFERENCES members (member_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── saved_jobs ──────────────────────────────────────────────────────────────
-- Owned by M3. Tracks member bookmarks. Used by M6 analytics for save counts.
CREATE TABLE IF NOT EXISTS saved_jobs (
  save_id    INT      NOT NULL AUTO_INCREMENT,
  job_id     INT      NOT NULL,
  member_id  INT      NOT NULL,
  saved_at   DATETIME NOT NULL DEFAULT NOW(),
  PRIMARY KEY (save_id),
  UNIQUE KEY ux_save (job_id, member_id),
  KEY idx_save_member (member_id),
  KEY idx_save_job    (job_id),
  CONSTRAINT fk_save_job    FOREIGN KEY (job_id)    REFERENCES job_postings (job_id)    ON DELETE CASCADE,
  CONSTRAINT fk_save_member FOREIGN KEY (member_id) REFERENCES members     (member_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;