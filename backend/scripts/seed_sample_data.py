from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.mysql import Base, SessionLocal, engine
from app.models.company import Company
from app.models.member import Member, MemberSkill
from app.models.recruiter import Recruiter


def seed(db: Session) -> None:
    if db.query(Company).count() == 0:
        company = Company(name='Tachyon Labs', industry='Software', size='201-500')
        db.add(company)
        db.flush()

        recruiter = Recruiter(
            company_id=company.company_id,
            first_name='Riya',
            last_name='Shah',
            email='riya.shah@tachyonlabs.example',
            password_hash=hash_password('Recruiter123!'),
            phone='+1-408-555-1000',
            role='recruiter',
        )
        db.add(recruiter)

    if db.query(Member).count() == 0:
        ava = Member(
            first_name='Ava',
            last_name='Patel',
            email='ava.patel@example.com',
            password_hash=hash_password('Member123!'),
            phone='+1-408-555-0199',
            location_city='San Jose',
            location_state='CA',
            location_country='USA',
            headline='Data Analyst',
            about='Experienced analytics professional with SQL and Python expertise.',
        )
        ava.skills = [MemberSkill(skill_name='SQL'), MemberSkill(skill_name='Python'), MemberSkill(skill_name='Tableau')]
        db.add(ava)

        leo = Member(
            first_name='Leo',
            last_name='Kim',
            email='leo.kim@example.com',
            password_hash=hash_password('Member123!'),
            phone='+1-408-555-0200',
            location_city='San Jose',
            location_state='CA',
            location_country='USA',
            headline='Backend Engineer',
            about='Builds distributed systems with Kafka and Python.',
        )
        leo.skills = [MemberSkill(skill_name='Python'), MemberSkill(skill_name='Kafka'), MemberSkill(skill_name='FastAPI')]
        db.add(leo)

    db.commit()


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed(db)
        print('Sample data inserted successfully.')
    finally:
        db.close()


if __name__ == '__main__':
    main()
