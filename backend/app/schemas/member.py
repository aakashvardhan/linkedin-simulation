from datetime import date

from pydantic import BaseModel, EmailStr, Field


class MemberExperienceIn(BaseModel):
    company: str
    title: str
    start_date: date
    end_date: date | None = None
    description: str | None = None


class MemberEducationIn(BaseModel):
    school: str
    degree: str
    field: str | None = None
    start_year: int | None = None
    end_year: int | None = None


class MemberCreateRequest(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    password: str
    phone: str | None = None
    location_city: str | None = None
    location_state: str | None = None
    location_country: str | None = None
    headline: str | None = None
    about: str | None = None
    experience: list[MemberExperienceIn] = Field(default_factory=list)
    education: list[MemberEducationIn] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    profile_photo_url: str | None = None
    resume_url: str | None = None


class MemberGetRequest(BaseModel):
    member_id: int


class MemberUpdateRequest(BaseModel):
    member_id: int
    first_name: str | None = None
    last_name: str | None = None
    email: EmailStr | None = None
    password: str | None = None
    phone: str | None = None
    location_city: str | None = None
    location_state: str | None = None
    location_country: str | None = None
    headline: str | None = None
    about: str | None = None
    experience: list[MemberExperienceIn] | None = None
    education: list[MemberEducationIn] | None = None
    skills: list[str] | None = None
    profile_photo_url: str | None = None
    resume_url: str | None = None


class MemberDeleteRequest(BaseModel):
    member_id: int


class MemberSearchRequest(BaseModel):
    keyword: str | None = None
    skills: list[str] = Field(default_factory=list)
    location_city: str | None = None
    location_state: str | None = None
    page: int = 1
    page_size: int = 20


class MemberLoginRequest(BaseModel):
    email: EmailStr
    password: str


class RecruiterCreateRequest(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    password: str
    phone: str | None = None
    company_name: str
    company_industry: str | None = None
    company_size: str | None = None
    role: str = 'recruiter'


class RecruiterGetRequest(BaseModel):
    recruiter_id: int


class RecruiterSearchRequest(BaseModel):
    keyword: str | None = None
    page: int = 1
    page_size: int = 20


class RecruiterLoginRequest(BaseModel):
    email: EmailStr
    password: str
