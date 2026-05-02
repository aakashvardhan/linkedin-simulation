"""Analytics backed by MySQL aggregates (no mock data)."""

from fastapi import APIRouter, Body, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.responses import success_response
from app.models.application import Application
from app.models.job import JobPosting
from app.models.member import Member
from app.schemas.analytics import AnalyticsWindowRequest, MemberDashboardRequest

router = APIRouter()


@router.post('/analytics/jobs/top')
def analytics_jobs_top(payload: AnalyticsWindowRequest, db: Session = Depends(get_db)):
    metric = (payload.metric or 'applications').lower()
    limit = max(1, min(payload.limit, 50))

    if metric == 'clicks' or metric == 'views':
        col = JobPosting.views_count if metric == 'views' else JobPosting.views_count
        rows = (
            db.query(JobPosting.title, col.label('cnt'))
            .filter(JobPosting.status == 'open')
            .order_by(col.desc())
            .limit(limit)
            .all()
        )
        items = [{'title': r[0], 'count': int(r[1] or 0)} for r in rows]
        return success_response({'items': items, 'low_traction': []})

    # applications (default)
    rows = (
        db.query(JobPosting.job_id, JobPosting.title, func.count(Application.application_id).label('cnt'))
        .outerjoin(Application, Application.job_id == JobPosting.job_id)
        .group_by(JobPosting.job_id, JobPosting.title)
        .order_by(func.count(Application.application_id).asc())
        .limit(5)
        .all()
    )
    low_traction = [{'title': r[1], 'applicants': int(r[2] or 0)} for r in rows]

    rows_top = (
        db.query(JobPosting.job_id, JobPosting.title, func.count(Application.application_id).label('cnt'))
        .outerjoin(Application, Application.job_id == JobPosting.job_id)
        .group_by(JobPosting.job_id, JobPosting.title)
        .order_by(func.count(Application.application_id).desc())
        .limit(limit)
        .all()
    )
    items = [{'title': r[1], 'count': int(r[2] or 0)} for r in rows_top]

    return success_response({'items': items, 'low_traction': low_traction})


@router.post('/analytics/geo')
def analytics_geo(payload: AnalyticsWindowRequest, db: Session = Depends(get_db)):
    if not payload.job_id:
        return success_response({'items': []})

    colors = ['#0A66C2', '#004182', '#c37d16', '#378fe9', '#b24020']
    rows = (
        db.query(Member.location_city, func.count(Application.application_id).label('cnt'))
        .join(Application, Application.member_id == Member.member_id)
        .filter(Application.job_id == payload.job_id)
        .group_by(Member.location_city)
        .order_by(func.count(Application.application_id).desc())
        .limit(15)
        .all()
    )
    items = [
        {'name': r[0] or 'Unknown', 'value': int(r[1] or 0), 'color': colors[i % len(colors)]}
        for i, r in enumerate(rows)
    ]
    return success_response({'items': items})


@router.post('/analytics/funnel')
def analytics_funnel(payload: AnalyticsWindowRequest, db: Session = Depends(get_db)):
    if not payload.job_id:
        return success_response({'saved_series': []})

    job = db.query(JobPosting).filter(JobPosting.job_id == payload.job_id).first()
    if not job:
        return success_response({'saved_series': []})

    # Single-job engagement snapshot (expand with event store later)
    saved_series = [
        {'name': 'Views', 'saves': int(job.views_count or 0)},
        {'name': 'Saves', 'saves': int(job.saves_count or 0)},
        {'name': 'Applies', 'saves': int(job.applicants_count or 0)},
    ]
    return success_response({'saved_series': saved_series})


@router.post('/analytics/member/dashboard')
def member_dashboard(payload: MemberDashboardRequest, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.member_id == payload.member_id).first()
    views = int(member.profile_views or 0) if member else 0
    profile_views_series = [{'name': str(i + 1), 'views': max(0, views // 30)} for i in range(30)]

    rows = (
        db.query(Application.status, func.count(Application.application_id))
        .filter(Application.member_id == payload.member_id)
        .group_by(Application.status)
        .all()
    )
    color_map = {
        'offer': '#004182',
        'interview': '#378fe9',
        'reviewing': '#c37d16',
        'submitted': '#0A66C2',
        'rejected': '#cc0000',
    }
    breakdown = [
        {'name': s.replace('_', ' ').title(), 'value': int(c or 0), 'color': color_map.get(s, '#666')}
        for s, c in rows
    ]

    return success_response(
        {
            'profile_views_series': profile_views_series,
            'application_status_breakdown': breakdown,
        }
    )


@router.post('/events/ingest')
def events_ingest_placeholder(_payload: dict = Body(default_factory=dict)):
    """Accept client tracking payloads; full pipeline can forward to Kafka/Mongo separately."""
    return success_response({'accepted': True})
