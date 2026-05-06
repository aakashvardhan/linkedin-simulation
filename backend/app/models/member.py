from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.mysql import Base


class Member(Base):
    __tablename__ = 'members'

    member_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    location_city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    location_state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    location_country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    headline: Mapped[str | None] = mapped_column(String(300), nullable=True)
    about: Mapped[str | None] = mapped_column(Text, nullable=True)
    profile_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    resume_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    connections_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    profile_views: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    skills: Mapped[list['MemberSkill']] = relationship(cascade='all, delete-orphan', back_populates='member')
    experiences: Mapped[list['MemberExperience']] = relationship(
        cascade='all, delete-orphan', back_populates='member'
    )
    education_entries: Mapped[list['MemberEducation']] = relationship(
        cascade='all, delete-orphan', back_populates='member'
    )


class MemberSkill(Base):
    __tablename__ = 'member_skills'

    skill_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(ForeignKey('members.member_id', ondelete='CASCADE'), nullable=False)
    skill_name: Mapped[str] = mapped_column(String(100), nullable=False)

    member: Mapped[Member] = relationship(back_populates='skills')


class MemberExperience(Base):
    __tablename__ = 'member_experience'

    exp_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(ForeignKey('members.member_id', ondelete='CASCADE'), nullable=False)
    company: Mapped[str] = mapped_column(String(200), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    start_date: Mapped[Date] = mapped_column(Date, nullable=False)
    end_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    member: Mapped[Member] = relationship(back_populates='experiences')


class MemberEducation(Base):
    __tablename__ = 'member_education'

    edu_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(ForeignKey('members.member_id', ondelete='CASCADE'), nullable=False)
    school: Mapped[str] = mapped_column(String(200), nullable=False)
    degree: Mapped[str] = mapped_column(String(100), nullable=False)
    field: Mapped[str | None] = mapped_column(String(100), nullable=True)
    start_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_year: Mapped[int | None] = mapped_column(Integer, nullable=True)

    member: Mapped[Member] = relationship(back_populates='education_entries')
