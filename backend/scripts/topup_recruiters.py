"""
Top up recruiters to 10K without touching existing data.
Run from backend/ folder:
    python scripts/topup_recruiters.py
"""

import os
import random
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from faker import Faker
from app.core.security import hash_password
from app.db.mysql import SessionLocal
from app.models.company import Company
from app.models.recruiter import Recruiter

fake = Faker()
random.seed(99)


def make_unique_email(first: str, last: str) -> str:
    """Generate a guaranteed unique email using uuid suffix."""
    suffix = uuid.uuid4().hex[:8]
    return f"{first.lower()}.{last.lower()}.{suffix}@company.com"


def main():
    db = SessionLocal()
    try:
        current = db.query(Recruiter).count()
        needed = 10000 - current
        if needed <= 0:
            print(f"Already have {current} recruiters. Nothing to do.")
            return

        print(f"Current recruiters: {current}. Adding {needed} more...")
        companies = db.query(Company).all()
        if not companies:
            print("ERROR: No companies found. Run seed_data.py first.")
            return

        for i in range(needed):
            company = random.choice(companies)
            first = fake.first_name()
            last = fake.last_name()
            email = make_unique_email(first, last)

            r = Recruiter(
                company_id=company.company_id,
                first_name=first,
                last_name=last,
                email=email,
                password_hash=hash_password('Recruiter123!'),
                phone=fake.phone_number()[:30],
                role='recruiter',
            )
            db.add(r)

            if (i + 1) % 1000 == 0:
                db.commit()
                print(f"  {i + 1} recruiters added...")

        db.commit()
        print(f"Done! Total recruiters: {db.query(Recruiter).count()}")

    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        db.close()


if __name__ == '__main__':
    main()
