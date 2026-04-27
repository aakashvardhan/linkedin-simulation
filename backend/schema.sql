CREATE DATABASE IF NOT EXISTS linkedin_simulation;
USE linkedin_simulation;

CREATE TABLE IF NOT EXISTS members (
    member_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(30) NULL,
    location_city VARCHAR(100) NULL,
    location_state VARCHAR(100) NULL,
    location_country VARCHAR(100) NULL,
    headline VARCHAR(300) NULL,
    about TEXT NULL,
    profile_photo_url VARCHAR(500) NULL,
    resume_url VARCHAR(500) NULL,
    connections_count INT DEFAULT 0,
    profile_views INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS member_skills (
    skill_id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    skill_name VARCHAR(100) NOT NULL,
    INDEX idx_member_skills_member (member_id),
    CONSTRAINT fk_member_skills_member FOREIGN KEY (member_id)
        REFERENCES members(member_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS member_experience (
    exp_id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    company VARCHAR(200) NOT NULL,
    title VARCHAR(200) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NULL,
    description TEXT NULL,
    INDEX idx_member_experience_member (member_id),
    CONSTRAINT fk_member_experience_member FOREIGN KEY (member_id)
        REFERENCES members(member_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS member_education (
    edu_id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    school VARCHAR(200) NOT NULL,
    degree VARCHAR(100) NOT NULL,
    field VARCHAR(100) NULL,
    start_year INT NULL,
    end_year INT NULL,
    INDEX idx_member_education_member (member_id),
    CONSTRAINT fk_member_education_member FOREIGN KEY (member_id)
        REFERENCES members(member_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS companies (
    company_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    industry VARCHAR(100) NULL,
    size VARCHAR(50) NULL,
    logo_url VARCHAR(500) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recruiters (
    recruiter_id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(30) NULL,
    role VARCHAR(50) DEFAULT 'recruiter',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_recruiters_company FOREIGN KEY (company_id)
        REFERENCES companies(company_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS job_postings (
    job_id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    recruiter_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    seniority_level VARCHAR(50) NULL,
    employment_type VARCHAR(50) NULL,
    location VARCHAR(200) NULL,
    work_mode VARCHAR(20) NULL,
    skills_required TEXT NULL,
    salary_min INT NULL,
    salary_max INT NULL,
    status ENUM('open', 'closed') DEFAULT 'open',
    posted_datetime DATETIME DEFAULT CURRENT_TIMESTAMP,
    views_count INT DEFAULT 0,
    applicants_count INT DEFAULT 0,
    saves_count INT DEFAULT 0,
    closed_at DATETIME NULL,
    INDEX idx_jobs_status_date (status, posted_datetime),
    INDEX idx_jobs_company (company_id),
    INDEX idx_jobs_recruiter (recruiter_id),
    INDEX idx_jobs_location (location),
    CONSTRAINT fk_jobs_company FOREIGN KEY (company_id)
        REFERENCES companies(company_id) ON DELETE RESTRICT,
    CONSTRAINT fk_jobs_recruiter FOREIGN KEY (recruiter_id)
        REFERENCES recruiters(recruiter_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS connections (
    connection_id INT AUTO_INCREMENT PRIMARY KEY,
    requester_id INT NOT NULL,
    receiver_id INT NOT NULL,
    status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    responded_at DATETIME NULL,
    UNIQUE KEY ux_conn (requester_id, receiver_id),
    INDEX idx_connections_requester (requester_id),
    INDEX idx_connections_receiver (receiver_id),
    CONSTRAINT fk_connections_requester FOREIGN KEY (requester_id)
        REFERENCES members(member_id) ON DELETE CASCADE,
    CONSTRAINT fk_connections_receiver FOREIGN KEY (receiver_id)
        REFERENCES members(member_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS saved_jobs (
    save_id INT AUTO_INCREMENT PRIMARY KEY,
    job_id INT NOT NULL,
    member_id INT NOT NULL,
    saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY ux_save (job_id, member_id),
    CONSTRAINT fk_saved_jobs_job FOREIGN KEY (job_id)
        REFERENCES job_postings(job_id) ON DELETE CASCADE,
    CONSTRAINT fk_saved_jobs_member FOREIGN KEY (member_id)
        REFERENCES members(member_id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS applications (
    application_id INT AUTO_INCREMENT PRIMARY KEY,
    job_id INT NOT NULL,
    member_id INT NOT NULL,
    resume_url VARCHAR(500) NULL,
    cover_letter TEXT NULL,
    status ENUM('submitted', 'reviewing', 'interview', 'offer', 'rejected') DEFAULT 'submitted',
    application_datetime DATETIME DEFAULT CURRENT_TIMESTAMP,
    recruiter_notes TEXT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY ux_app (job_id, member_id),
    INDEX idx_app_job (job_id),
    INDEX idx_app_member (member_id),
    INDEX idx_app_status (status),
    CONSTRAINT fk_app_job FOREIGN KEY (job_id)
        REFERENCES job_postings(job_id) ON DELETE CASCADE,
    CONSTRAINT fk_app_member FOREIGN KEY (member_id)
        REFERENCES members(member_id) ON DELETE CASCADE
);
