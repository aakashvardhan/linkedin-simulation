from pydantic import BaseModel, Field


class JobCreateRequest(BaseModel):
    recruiter_id: int
    company_id: int
    title: str
    description: str
    seniority_level: str | None = None
    employment_type: str | None = None
    location: str | None = None
    work_mode: str | None = None
    skills_required: list[str] = Field(default_factory=list)
    salary_min: int | None = None
    salary_max: int | None = None


class JobGetRequest(BaseModel):
    job_id: int


class JobUpdateRequest(BaseModel):
    job_id: int
    recruiter_id: int
    title: str | None = None
    description: str | None = None
    seniority_level: str | None = None
    employment_type: str | None = None
    location: str | None = None
    work_mode: str | None = None
    skills_required: list[str] | None = None
    salary_min: int | None = None
    salary_max: int | None = None


class JobSearchRequest(BaseModel):
    keyword: str | None = None
    location: str | None = None
    employment_type: str | None = None
    work_mode: str | None = None
    seniority_level: str | None = None
    skills: list[str] = Field(default_factory=list)
    salary_min: int | None = None
    status: str | None = None
    sort_by: str = 'posted_datetime'
    sort_order: str = 'desc'
    page: int = 1
    page_size: int = 20


class JobCloseRequest(BaseModel):
    job_id: int
    recruiter_id: int


class JobsByRecruiterRequest(BaseModel):
    recruiter_id: int
    status: str | None = None
    page: int = 1
    page_size: int = 20


class JobSaveRequest(BaseModel):
    job_id: int
    member_id: int


class JobsSavedByMemberRequest(BaseModel):
    member_id: int
    page: int = 1
    page_size: int = 20
