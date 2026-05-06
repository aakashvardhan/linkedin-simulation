from pydantic import BaseModel, Field


class ApplicationSubmitRequest(BaseModel):
    job_id: int
    member_id: int
    resume_url: str | None = None
    resume_text: str | None = None
    cover_letter: str | None = None


class ApplicationGetRequest(BaseModel):
    application_id: int


class ApplicationsByJobRequest(BaseModel):
    job_id: int
    page: int = 1
    page_size: int = 100


class ApplicationsByMemberRequest(BaseModel):
    member_id: int
    page: int = 1
    page_size: int = 100


class ApplicationUpdateStatusRequest(BaseModel):
    application_id: int
    recruiter_id: int
    status: str


class ApplicationAddNoteRequest(BaseModel):
    application_id: int
    recruiter_id: int
    note: str
