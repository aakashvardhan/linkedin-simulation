"""
Seed script — loads 10K realistic records from Kaggle datasets + faker top-up.
Run from backend/ folder:
    python scripts/seed_data.py
"""

import json
import os
import random
import sys
from datetime import datetime, timedelta, date

import pandas as pd
from faker import Faker

# ── path setup ────────────────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.security import hash_password
from app.db.mysql import Base, SessionLocal, engine
from app.models.application import Application
from app.models.company import Company
from app.models.connection import Connection
from app.models.job import JobPosting
from app.models.member import Member, MemberSkill, MemberExperience, MemberEducation
from app.models.recruiter import Recruiter
from app.models.saved_job import SavedJob

fake = Faker()
Faker.seed(42)
random.seed(42)

# ── dataset paths ─────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BASE_DIR)
JOBS_CSV = os.path.join(REPO_ROOT, 'datasets', 'jobs', 'clean_jobs.csv')
RESUME_CSV = os.path.join(REPO_ROOT, 'datasets', 'resumes', 'Resume', 'Resume.csv')

LIMIT = 10_000

# ── skill keywords ────────────────────────────────────────────────────────────
SKILL_KEYWORDS = [
    'Python', 'Java', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'SQL',
    'MySQL', 'MongoDB', 'PostgreSQL', 'Docker', 'Kubernetes', 'AWS', 'GCP',
    'Azure', 'Kafka', 'Redis', 'FastAPI', 'Django', 'Flask', 'Spring',
    'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'NLP',
    'Data Analysis', 'Tableau', 'Power BI', 'Excel', 'R', 'Scala', 'Go',
    'C++', 'C#', 'PHP', 'Ruby', 'Git', 'Linux', 'Agile', 'Scrum',
]

CATEGORIES = [
    'Technology', 'Finance', 'Healthcare', 'Marketing', 'Sales',
    'Engineering', 'Data Science', 'Design', 'Operations', 'HR',
]

JOB_TITLES = [
    'Software Engineer', 'Data Scientist', 'Product Manager', 'UX Designer',
    'DevOps Engineer', 'Backend Developer', 'Frontend Developer', 'ML Engineer',
    'Data Analyst', 'Cloud Architect', 'Security Engineer', 'QA Engineer',
    'Full Stack Developer', 'Mobile Developer', 'Site Reliability Engineer',
    'Data Engineer', 'Systems Architect', 'Technical Lead', 'Engineering Manager',
    'Business Analyst', 'Scrum Master', 'Solutions Architect', 'Platform Engineer',
]


def extract_skills(text: str, max_skills: int = 5) -> list:
    if not isinstance(text, str):
        return random.sample(SKILL_KEYWORDS, 3)
    found = [s for s in SKILL_KEYWORDS if s.lower() in text.lower()]
    return found[:max_skills] if found else random.sample(SKILL_KEYWORDS, 3)


def random_date_between(start_year: int, end_year: int) -> date:
    start = date(start_year, 1, 1)
    end = date(end_year, 12, 31)
    delta = (end - start).days
    return start + timedelta(days=random.randint(0, delta))


# ── loaders ───────────────────────────────────────────────────────────────────

def load_jobs_df() -> pd.DataFrame:
    print(f"Loading jobs from {JOBS_CSV}...")
    df = pd.read_csv(JOBS_CSV, nrows=LIMIT * 2, on_bad_lines='skip')
    df['title'] = df['title'].fillna('Software Engineer')
    df['company'] = df['company'].fillna('Tech Company')
    df['description'] = df['description'].fillna('Exciting opportunity to join our team.')
    df['location'] = df['location'].fillna('United States')
    df['employment_type'] = df['employment_type'].fillna('Full-time')
    df = df.head(LIMIT)
    print(f"  Loaded {len(df)} job rows")
    return df


def load_resumes_df() -> pd.DataFrame:
    print(f"Loading resumes from {RESUME_CSV}...")
    df = pd.read_csv(RESUME_CSV, nrows=LIMIT * 2, on_bad_lines='skip')
    df['Resume_str'] = df['Resume_str'].fillna('Experienced professional seeking new opportunities.')
    df['Category'] = df['Category'].fillna('Technology')
    df = df.head(LIMIT)
    print(f"  Loaded {len(df)} resume rows")
    return df


# ── seeders ───────────────────────────────────────────────────────────────────

def seed_companies(db, jobs_df: pd.DataFrame) -> list:
    print("Seeding companies...")
    company_names = jobs_df['company'].dropna().unique().tolist()[:500]
    industries = ['Technology', 'Finance', 'Healthcare', 'Education',
                  'Retail', 'Manufacturing', 'Consulting', 'Media', 'Other']
    sizes = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']
    companies = []

    for name in company_names:
        c = Company(
            name=str(name)[:200],
            industry=random.choice(industries),
            size=random.choice(sizes),
        )
        db.add(c)
        companies.append(c)

    db.flush()
    print(f"  Created {len(companies)} companies")
    return companies


def seed_recruiters(db, companies: list) -> list:
    print("Seeding recruiters...")
    recruiters = []
    target = min(1000, len(companies) * 2)

    for i in range(target):
        company = companies[i % len(companies)]
        r = Recruiter(
            company_id=company.company_id,
            first_name=fake.first_name(),
            last_name=fake.last_name(),
            email=fake.unique.email(),
            password_hash=hash_password('Recruiter123!'),
            phone=fake.phone_number()[:30],
            role='recruiter',
        )
        db.add(r)
        recruiters.append(r)

    db.flush()
    print(f"  Created {len(recruiters)} recruiters")
    return recruiters


def seed_members_from_kaggle(db, resumes_df: pd.DataFrame) -> list:
    print("Seeding members from Kaggle resumes...")
    members = []

    for idx, row in resumes_df.iterrows():
        resume_text = str(row['Resume_str'])[:5000]
        category = str(row.get('Category', 'Technology'))
        skills = extract_skills(resume_text)

        m = Member(
            first_name=fake.first_name(),
            last_name=fake.last_name(),
            email=fake.unique.email(),
            password_hash=hash_password('Member123!'),
            phone=fake.phone_number()[:30],
            location_city=fake.city(),
            location_state=fake.state_abbr(),
            location_country='US',
            headline=f"{category} Professional",
            about=resume_text[:500],
            resume_url=f"https://example.com/resumes/{row['ID']}.pdf",
            connections_count=0,
            profile_views=random.randint(0, 500),
        )
        db.add(m)
        db.flush()

        for skill in skills:
            db.add(MemberSkill(member_id=m.member_id, skill_name=skill))

        start_year = random.randint(2015, 2021)
        end_year = random.randint(start_year + 1, 2023)
        db.add(MemberExperience(
            member_id=m.member_id,
            company=fake.company(),
            title=f"{category} Specialist",
            start_date=random_date_between(start_year, start_year),
            end_date=random_date_between(end_year, end_year),
            description=f"Worked as a {category} professional.",
        ))

        db.add(MemberEducation(
            member_id=m.member_id,
            school=fake.company() + " University",
            degree=random.choice(['BS', 'MS', 'MBA', 'PhD']),
            field=category,
            start_year=random.randint(2005, 2015),
            end_year=random.randint(2016, 2020),
        ))

        members.append(m)
        if len(members) % 1000 == 0:
            db.commit()
            print(f"  {len(members)} kaggle members committed...")

    db.flush()
    print(f"  Created {len(members)} kaggle members")
    return members


def top_up_members(db, existing_members: list) -> list:
    current = db.query(Member).count()
    needed = 10000 - current
    if needed <= 0:
        print("  Members already at 10K")
        return existing_members

    print(f"  Topping up {needed} faker members...")
    new_members = []

    for i in range(needed):
        category = random.choice(CATEGORIES)
        skills = random.sample(SKILL_KEYWORDS, random.randint(2, 5))

        m = Member(
            first_name=fake.first_name(),
            last_name=fake.last_name(),
            email=fake.unique.email(),
            password_hash=hash_password('Member123!'),
            phone=fake.phone_number()[:30],
            location_city=fake.city(),
            location_state=fake.state_abbr(),
            location_country='US',
            headline=f"{category} Professional",
            about=fake.paragraph(nb_sentences=3),
            resume_url=f"https://example.com/resumes/faker_{i}.pdf",
            connections_count=0,
            profile_views=random.randint(0, 500),
        )
        db.add(m)
        db.flush()

        for skill in skills:
            db.add(MemberSkill(member_id=m.member_id, skill_name=skill))

        new_members.append(m)

        if (i + 1) % 1000 == 0:
            db.commit()
            print(f"    {i + 1} faker members committed...")

    db.commit()
    print(f"  Total members now: {db.query(Member).count()}")
    return existing_members + new_members


def seed_jobs_from_kaggle(db, jobs_df: pd.DataFrame, companies: list, recruiters: list) -> list:
    print("Seeding jobs from Kaggle...")
    jobs = []

    for idx, row in jobs_df.iterrows():
        company = random.choice(companies)
        recruiter = random.choice(recruiters)
        description = str(row.get('description', ''))[:2000]
        skills = extract_skills(description, max_skills=6)
        sal_min = random.choice([60000, 80000, 100000, 120000, 150000])

        j = JobPosting(
            company_id=company.company_id,
            recruiter_id=recruiter.recruiter_id,
            title=str(row['title'])[:200],
            description=description,
            seniority_level=random.choice(['Entry', 'Mid', 'Senior', 'Lead', 'Director']),
            employment_type=str(row.get('employment_type', 'Full-time'))[:50],
            location=str(row.get('location', 'United States'))[:200],
            work_mode=random.choice(['onsite', 'remote', 'hybrid']),
            skills_required=json.dumps(skills),
            salary_min=sal_min,
            salary_max=sal_min + random.randint(20000, 60000),
            status=random.choice(['open', 'open', 'open', 'closed']),
            posted_datetime=fake.date_time_between(start_date='-1y', end_date='now'),
            views_count=random.randint(0, 2000),
            applicants_count=0,
            saves_count=0,
        )
        db.add(j)
        jobs.append(j)

        if len(jobs) % 1000 == 0:
            db.commit()
            print(f"  {len(jobs)} kaggle jobs committed...")

    db.flush()
    print(f"  Created {len(jobs)} kaggle jobs")
    return jobs


def top_up_jobs(db, existing_jobs: list, companies: list, recruiters: list) -> list:
    current = db.query(JobPosting).count()
    needed = 10000 - current
    if needed <= 0:
        print("  Jobs already at 10K")
        return existing_jobs

    print(f"  Topping up {needed} faker jobs...")
    new_jobs = []

    for i in range(needed):
        company = random.choice(companies)
        recruiter = random.choice(recruiters)
        skills = random.sample(SKILL_KEYWORDS, random.randint(3, 6))
        sal_min = random.choice([60000, 80000, 100000, 120000, 150000])

        j = JobPosting(
            company_id=company.company_id,
            recruiter_id=recruiter.recruiter_id,
            title=random.choice(JOB_TITLES),
            description=fake.paragraph(nb_sentences=5),
            seniority_level=random.choice(['Entry', 'Mid', 'Senior', 'Lead']),
            employment_type=random.choice(['Full-time', 'Part-time', 'Contract']),
            location=f"{fake.city()}, {fake.state_abbr()}",
            work_mode=random.choice(['onsite', 'remote', 'hybrid']),
            skills_required=json.dumps(skills),
            salary_min=sal_min,
            salary_max=sal_min + random.randint(20000, 60000),
            status=random.choice(['open', 'open', 'open', 'closed']),
            posted_datetime=fake.date_time_between(start_date='-1y', end_date='now'),
            views_count=random.randint(0, 2000),
            applicants_count=0,
            saves_count=0,
        )
        db.add(j)
        new_jobs.append(j)

        if (i + 1) % 1000 == 0:
            db.commit()
            print(f"    {i + 1} faker jobs committed...")

    db.commit()
    print(f"  Total jobs now: {db.query(JobPosting).count()}")
    return existing_jobs + new_jobs


def seed_connections(db, members: list) -> None:
    print("Seeding connections...")
    count = 0
    pairs = set()
    target = 10000

    while count < target:
        a, b = random.sample(members, 2)
        pair = (min(a.member_id, b.member_id), max(a.member_id, b.member_id))
        if pair in pairs:
            continue
        pairs.add(pair)

        status = random.choice(['accepted', 'accepted', 'accepted', 'pending', 'rejected'])
        responded = None
        if status in ('accepted', 'rejected'):
            responded = fake.date_time_between(start_date='-6m', end_date='now')

        db.add(Connection(
            requester_id=a.member_id,
            receiver_id=b.member_id,
            status=status,
            requested_at=fake.date_time_between(start_date='-1y', end_date='-1d'),
            responded_at=responded,
        ))
        count += 1

        if count % 1000 == 0:
            db.commit()
            print(f"  {count} connections committed...")

    db.commit()
    print(f"  Created {count} connections")

    member_conn_count = {}
    for pair in pairs:
        member_conn_count[pair[0]] = member_conn_count.get(pair[0], 0) + 1
        member_conn_count[pair[1]] = member_conn_count.get(pair[1], 0) + 1
    for member in members:
        if member.member_id in member_conn_count:
            member.connections_count = member_conn_count[member.member_id]
    db.commit()


def seed_applications(db, members: list, jobs: list) -> None:
    print("Seeding applications...")
    count = 0
    pairs = set()
    statuses = ['submitted', 'reviewing', 'interview', 'offer', 'rejected']
    open_jobs = [j for j in jobs if j.status == 'open']
    target = 10000

    while count < target:
        member = random.choice(members)
        job = random.choice(open_jobs)
        pair = (job.job_id, member.member_id)
        if pair in pairs:
            continue
        pairs.add(pair)

        db.add(Application(
            job_id=job.job_id,
            member_id=member.member_id,
            resume_url=member.resume_url,
            cover_letter=fake.paragraph(nb_sentences=3),
            status=random.choice(statuses),
            application_datetime=fake.date_time_between(start_date='-6m', end_date='now'),
        ))
        job.applicants_count += 1
        count += 1

        if count % 1000 == 0:
            db.commit()
            print(f"  {count} applications committed...")

    db.commit()
    print(f"  Created {count} applications")


def seed_saved_jobs(db, members: list, jobs: list) -> None:
    print("Seeding saved jobs...")
    count = 0
    pairs = set()
    target = 5000

    while count < target:
        member = random.choice(members)
        job = random.choice(jobs)
        pair = (job.job_id, member.member_id)
        if pair in pairs:
            continue
        pairs.add(pair)

        db.add(SavedJob(
            job_id=job.job_id,
            member_id=member.member_id,
            saved_at=fake.date_time_between(start_date='-3m', end_date='now'),
        ))
        job.saves_count += 1
        count += 1

        if count % 1000 == 0:
            db.commit()
            print(f"  {count} saved jobs committed...")

    db.commit()
    print(f"  Created {count} saved jobs")


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 50)
    print("LinkedIn Simulation — Seed Data Loader")
    print("=" * 50)

    if not os.path.exists(JOBS_CSV):
        print(f"ERROR: Jobs CSV not found at {JOBS_CSV}")
        sys.exit(1)
    if not os.path.exists(RESUME_CSV):
        print(f"ERROR: Resume CSV not found at {RESUME_CSV}")
        sys.exit(1)

    jobs_df = load_jobs_df()
    resumes_df = load_resumes_df()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        if db.query(Member).count() >= 10000:
            print("Database already has 10K records. Skipping seed.")
            return

        companies = seed_companies(db, jobs_df)
        db.commit()

        recruiters = seed_recruiters(db, companies)
        db.commit()

        members = seed_members_from_kaggle(db, resumes_df)
        db.commit()

        members = top_up_members(db, members)

        jobs = seed_jobs_from_kaggle(db, jobs_df, companies, recruiters)
        db.commit()

        jobs = top_up_jobs(db, jobs, companies, recruiters)

        seed_connections(db, members)
        seed_applications(db, members, jobs)
        seed_saved_jobs(db, members, jobs)
        db.commit()

        print("=" * 50)
        print("Seed complete!")
        print(f"  Companies:    {db.query(Company).count()}")
        print(f"  Recruiters:   {db.query(Recruiter).count()}")
        print(f"  Members:      {db.query(Member).count()}")
        print(f"  Jobs:         {db.query(JobPosting).count()}")
        print(f"  Connections:  {db.query(Connection).count()}")
        print(f"  Applications: {db.query(Application).count()}")
        print(f"  Saved Jobs:   {db.query(SavedJob).count()}")
        print("=" * 50)

    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        db.close()


if __name__ == '__main__':
    main()
