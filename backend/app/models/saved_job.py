from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.mysql import Base


class SavedJob(Base):
    __tablename__ = 'saved_jobs'
    __table_args__ = (UniqueConstraint('job_id', 'member_id', name='ux_save'),)

    save_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(ForeignKey('job_postings.job_id', ondelete='CASCADE'), nullable=False)
    member_id: Mapped[int] = mapped_column(ForeignKey('members.member_id', ondelete='CASCADE'), nullable=False)
    saved_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    job: Mapped['JobPosting'] = relationship('JobPosting', lazy='joined')
