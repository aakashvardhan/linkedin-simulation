#!/usr/bin/env python3
"""
Load bundled demo CSVs into MySQL (stdlib csv only; no pandas).

CSV layout matches scripts/seed_data.py expectations:
  - datasets/jobs/clean_jobs.csv → title, company, description, location, employment_type
  - datasets/resumes/Resume/Resume.csv → ID, Resume_str, Category

Run from repo:
  cd backend && PYTHONPATH=. python3 scripts/ingest_demo_data.py

Replace real Kaggle exports by dropping files at the same paths (keep headers compatible).
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.security import hash_password
from app.db.mysql import Base, SessionLocal, engine
from app.models.company import Company
from app.models.job import JobPosting
from app.models.member import Member, MemberSkill
from app.models.recruiter import Recruiter

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
JOBS_CSV = os.path.join(REPO_ROOT, 'datasets', 'jobs', 'clean_jobs.csv')
RESUME_CSV = os.path.join(REPO_ROOT, 'datasets', 'resumes', 'Resume', 'Resume.csv')

SKILL_KEYWORDS = [
    'Python',
    'Java',
    'JavaScript',
    'TypeScript',
    'React',
    'Node.js',
    'SQL',
    'MySQL',
    'MongoDB',
    'PostgreSQL',
    'Docker',
    'AWS',
    'GCP',
    'Azure',
    'Kafka',
    'Redis',
    'FastAPI',
    'Django',
    'PyTorch',
    'Machine Learning',
    'Data Analysis',
    'Tableau',
    'Go',
    'Kubernetes',
    'Swift',
    'Terraform',
]


def extract_skills(text: str, max_skills: int = 5) -> list[str]:
    if not text:
        return random.sample(SKILL_KEYWORDS, min(3, len(SKILL_KEYWORDS)))
    found = [s for s in SKILL_KEYWORDS if s.lower() in text.lower()]
    return found[:max_skills] if found else random.sample(SKILL_KEYWORDS, min(3, len(SKILL_KEYWORDS)))


def slug(s: str) -> str:
    x = re.sub(r'[^a-z0-9]+', '-', (s or '').lower()).strip('-')
    return (x[:40] or 'co')


def recruiter_for_company(db, company: Company) -> Recruiter:
    r = db.query(Recruiter).filter(Recruiter.company_id == company.company_id).first()
    if r:
        return r
    r = Recruiter(
        company_id=company.company_id,
        first_name='Talent',
        last_name='Team',
        email=f'recruiter.{slug(company.name)}.{company.company_id}@ingest.local',
        password_hash=hash_password('Recruiter123!'),
        phone=None,
        role='recruiter',
    )
    db.add(r)
    db.flush()
    return r


def get_or_create_company(db, name: str, industry: str | None = None) -> Company:
    name_clean = (name or 'Company')[:200]
    c = db.query(Company).filter(Company.name == name_clean).first()
    if c:
        return c
    c = Company(
        name=name_clean,
        industry=industry or random.choice(['Technology', 'Finance', 'Healthcare', 'Consulting']),
        size=random.choice(['51-200', '201-500', '501-1000', '1000+']),
    )
    db.add(c)
    db.flush()
    return c


def ingest_jobs(db, path: str, limit: int) -> int:
    if not os.path.isfile(path):
        print(f'[skip] Jobs CSV missing: {path}')
        return 0
    inserted = 0
    with open(path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            if i >= limit:
                break
            title = (row.get('title') or 'Role').strip()[:200]
            company_name = (row.get('company') or 'Company').strip()[:200]
            description = (row.get('description') or 'See posting for details.').strip()[:8000]
            location = (row.get('location') or '').strip()[:200] or None
            emp = (row.get('employment_type') or 'Full-time').strip()[:50]

            company = get_or_create_company(db, company_name)
            rec = recruiter_for_company(db, company)

            exists = (
                db.query(JobPosting)
                .filter(JobPosting.company_id == company.company_id, JobPosting.title == title)
                .first()
            )
            if exists:
                continue

            skills = extract_skills(description, 6)
            sal_min = random.choice([85000, 100000, 120000, 140000])
            job = JobPosting(
                company_id=company.company_id,
                recruiter_id=rec.recruiter_id,
                title=title,
                description=description,
                seniority_level=random.choice(['Mid', 'Senior', 'Lead']),
                employment_type=emp,
                location=location,
                work_mode=random.choice(['remote', 'hybrid', 'onsite']),
                skills_required=json.dumps(skills),
                salary_min=sal_min,
                salary_max=sal_min + random.randint(15000, 45000),
                status='open',
                posted_datetime=datetime.now(timezone.utc),
                views_count=random.randint(0, 500),
                applicants_count=0,
                saves_count=0,
            )
            db.add(job)
            inserted += 1
    return inserted


def ingest_resumes(db, path: str, limit: int) -> int:
    if not os.path.isfile(path):
        print(f'[skip] Resume CSV missing: {path}')
        return 0
    inserted = 0
    with open(path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            if i >= limit:
                break
            rid = str(row.get('ID') or i).strip()
            text = (row.get('Resume_str') or '').strip()[:5000]
            category = (row.get('Category') or 'Technology').strip()[:100]
            email = f'resume.{rid}@ingest.local'
            if db.query(Member).filter(Member.email == email).first():
                continue
            skills = extract_skills(text, 5)
            m = Member(
                first_name='Candidate',
                last_name=f'R{rid}',
                email=email,
                password_hash=hash_password('Member123!'),
                phone=None,
                location_city=random.choice(['San Jose', 'Austin', 'Boston', 'Seattle', 'Remote']),
                location_state='CA',
                location_country='USA',
                headline=f'{category} professional',
                about=text[:2000],
                resume_url=None,
                connections_count=0,
                profile_views=random.randint(0, 100),
            )
            db.add(m)
            db.flush()
            for s in skills:
                db.add(MemberSkill(member_id=m.member_id, skill_name=s))
            inserted += 1
    return inserted


def main() -> None:
    p = argparse.ArgumentParser(description='Ingest bundled jobs + resume CSVs into MySQL.')
    p.add_argument('--jobs', type=int, default=500, help='Max job rows to read from CSV')
    p.add_argument('--members', type=int, default=500, help='Max resume rows to read from CSV')
    p.add_argument('--jobs-csv', default=JOBS_CSV, help='Path to jobs CSV')
    p.add_argument('--resume-csv', default=RESUME_CSV, help='Path to resume CSV')
    args = p.parse_args()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        nj = ingest_jobs(db, args.jobs_csv, args.jobs)
        nm = ingest_resumes(db, args.resume_csv, args.members)
        db.commit()
        print(f'Ingest complete: +{nj} jobs, +{nm} members (from resume rows).')
        print(f'  Jobs file:   {args.jobs_csv}')
        print(f'  Resume file: {args.resume_csv}')
    except Exception as e:
        db.rollback()
        print(f'ERROR: {e}')
        raise
    finally:
        db.close()


if __name__ == '__main__':
    main()
