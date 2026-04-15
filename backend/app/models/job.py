from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.mysql import Base


class JobPosting(Base):
    __tablename__ = 'job_postings'

    job_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(ForeignKey('companies.company_id'), nullable=False, index=True)
    recruiter_id: Mapped[int] = mapped_column(ForeignKey('recruiters.recruiter_id'), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    seniority_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    employment_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    work_mode: Mapped[str | None] = mapped_column(String(20), nullable=True)
    skills_required: Mapped[str | None] = mapped_column(Text, nullable=True)
    salary_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(Enum('open', 'closed', name='job_status'), default='open', nullable=False)
    posted_datetime: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    views_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    applicants_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    saves_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    company: Mapped['Company'] = relationship(back_populates='jobs')
    recruiter: Mapped['Recruiter'] = relationship(back_populates='jobs')
