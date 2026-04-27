from datetime import datetime
from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Text, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.mysql import Base


class Application(Base):
    __tablename__ = 'applications'

    application_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(ForeignKey('job_postings.job_id', ondelete='CASCADE'), nullable=False)
    member_id: Mapped[int] = mapped_column(ForeignKey('members.member_id', ondelete='CASCADE'), nullable=False)
    resume_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cover_letter: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum('submitted', 'reviewing', 'interview', 'offer', 'rejected'),
        default='submitted',
    )
    application_datetime: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    recruiter_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
