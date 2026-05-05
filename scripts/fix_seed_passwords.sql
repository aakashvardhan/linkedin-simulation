-- Fix passwords when MySQL was first initialized with old placeholder hashes.
-- Recruiters: Recruiter123!   Members: Member123!
-- Run from repo root (cmd):
--   docker compose exec -T mysql mysql -uroot -plinkedin_pass linkedin_simulation < scripts\fix_seed_passwords.sql

USE linkedin_simulation;

UPDATE recruiters
SET password_hash = '$2b$12$QL9i9kDj3g9da9ORkshCDu4UCnsN4tmNE/3ILmsiIctbzRtMT0ki6'
WHERE email IN ('carol@testcorp.com', 'dave@testcorp.com');

UPDATE members
SET password_hash = '$2b$12$KQEmKmuGMD2Cy0CVD4p7COuSq5NEVNIiaIIq268dm33FZVblP165e'
WHERE email IN ('alice@test.com', 'bob@test.com');
