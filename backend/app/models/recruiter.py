from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.mysql import Base


class Recruiter(Base):
    __tablename__ = 'recruiters'

    recruiter_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(ForeignKey('companies.company_id'), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default='recruiter')
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    company: Mapped['Company'] = relationship(back_populates='recruiters')
    jobs: Mapped[list['JobPosting']] = relationship(back_populates='recruiter')
