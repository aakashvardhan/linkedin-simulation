from pydantic import BaseModel


class AnalyticsWindowRequest(BaseModel):
    window: str = 'month'
    job_id: int | None = None
    metric: str = 'applications'
    limit: int = 10


class MemberDashboardRequest(BaseModel):
    member_id: int
    window: str = '30d'
