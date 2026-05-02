from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.kafka import publisher
from app.core.redis import cache_delete, cache_delete_pattern
from app.core.responses import success_response
from app.models.application import Application
from app.models.job import JobPosting
from app.models.member import Member
from app.schemas.application import (
    ApplicationAddNoteRequest,
    ApplicationGetRequest,
    ApplicationSubmitRequest,
    ApplicationsByJobRequest,
    ApplicationsByMemberRequest,
    ApplicationUpdateStatusRequest,
)

router = APIRouter()

_ALLOWED_STATUS = {'submitted', 'reviewing', 'interview', 'offer', 'rejected'}


def _application_row(app: Application, member: Member | None) -> dict:
    m = member
    name = f'{m.first_name} {m.last_name}'.strip() if m else 'Member'
    summary = (app.cover_letter or '')[:1200] or ''
    return {
        'application_id': app.application_id,
        'job_id': app.job_id,
        'member_id': app.member_id,
        'name': name,
        'email': m.email if m else '',
        'headline': m.headline if m else '',
        'resume_url': app.resume_url,
        'resume_summary': summary,
        'cover_letter': app.cover_letter,
        'status': app.status,
        'application_datetime': app.application_datetime,
        'recruiter_notes': app.recruiter_notes,
    }


@router.post('/applications/submit', status_code=201)
def submit_application(
    payload: ApplicationSubmitRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('role') != 'member' or int(current_user.get('user_id')) != payload.member_id:
        raise HTTPException(status_code=401, detail='Invalid or expired authentication token')

    job = db.query(JobPosting).filter(JobPosting.job_id == payload.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail='Job not found')
    if job.status != 'open':
        raise HTTPException(status_code=400, detail='This job is closed and does not accept applications')

    member = db.query(Member).filter(Member.member_id == payload.member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail='Member not found')

    cover = (payload.cover_letter or '').strip()
    resume_txt = (payload.resume_text or '').strip()
    if resume_txt:
        cover = f'{cover}\n\n--- Resume ---\n{resume_txt}'.strip() if cover else resume_txt

    app = Application(
        job_id=payload.job_id,
        member_id=payload.member_id,
        resume_url=payload.resume_url,
        cover_letter=cover or None,
        status='submitted',
    )
    db.add(app)
    try:
        job.applicants_count = (job.applicants_count or 0) + 1
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail='Already applied to this job') from exc

    db.refresh(app)
    cache_delete(f'job:{payload.job_id}')
    cache_delete_pattern('jobs:search:*')

    publisher.publish(
        topic='application.submitted',
        actor_id=str(payload.member_id),
        entity_type='application',
        entity_id=str(app.application_id),
        payload={'job_id': payload.job_id, 'member_id': payload.member_id, 'application_id': app.application_id},
    )

    return success_response(
        {
            'application_id': app.application_id,
            'job_id': app.job_id,
            'member_id': app.member_id,
            'status': app.status,
            'application_datetime': app.application_datetime,
        }
    )


@router.post('/applications/get')
def get_application(
    payload: ApplicationGetRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    app = db.query(Application).filter(Application.application_id == payload.application_id).first()
    if not app:
        raise HTTPException(status_code=404, detail='Application not found')

    role = current_user.get('role')
    uid = int(current_user.get('user_id'))
    job = db.query(JobPosting).filter(JobPosting.job_id == app.job_id).first()
    if role == 'member' and app.member_id != uid:
        raise HTTPException(status_code=403, detail='Not allowed')
    if role == 'recruiter' and (not job or job.recruiter_id != uid):
        raise HTTPException(status_code=403, detail='Not allowed')

    member = db.query(Member).filter(Member.member_id == app.member_id).first()
    return success_response(_application_row(app, member))


@router.post('/applications/byJob')
def applications_by_job(
    payload: ApplicationsByJobRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('role') != 'recruiter':
        raise HTTPException(status_code=403, detail='Only recruiters can list job applications')

    job = db.query(JobPosting).filter(JobPosting.job_id == payload.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail='Job not found')
    if int(current_user.get('user_id')) != job.recruiter_id:
        raise HTTPException(status_code=403, detail='You can only view applications for your own jobs')

    q = db.query(Application).filter(Application.job_id == payload.job_id)
    total = q.count()
    page = max(payload.page, 1)
    page_size = max(payload.page_size, 1)
    rows = q.order_by(Application.application_datetime.desc()).offset((page - 1) * page_size).limit(page_size).all()

    out = []
    for app in rows:
        member = db.query(Member).filter(Member.member_id == app.member_id).first()
        out.append(_application_row(app, member))

    return success_response(
        {'applications': out, 'total_count': total, 'page': page, 'page_size': page_size}
    )


@router.post('/applications/byMember')
def applications_by_member(
    payload: ApplicationsByMemberRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('role') != 'member' or int(current_user.get('user_id')) != payload.member_id:
        raise HTTPException(status_code=401, detail='Invalid or expired authentication token')

    q = db.query(Application).filter(Application.member_id == payload.member_id)
    total = q.count()
    page = max(payload.page, 1)
    page_size = max(payload.page_size, 1)
    rows = q.order_by(Application.application_datetime.desc()).offset((page - 1) * page_size).limit(page_size).all()

    out = []
    for app in rows:
        member = db.query(Member).filter(Member.member_id == app.member_id).first()
        out.append(_application_row(app, member))

    return success_response(
        {'applications': out, 'total_count': total, 'page': page, 'page_size': page_size}
    )


@router.post('/applications/updateStatus')
def update_application_status(
    payload: ApplicationUpdateStatusRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('role') != 'recruiter' or int(current_user.get('user_id')) != payload.recruiter_id:
        raise HTTPException(status_code=403, detail='Only the owning recruiter can update status')

    if payload.status not in _ALLOWED_STATUS:
        raise HTTPException(status_code=400, detail='Invalid status')

    app = db.query(Application).filter(Application.application_id == payload.application_id).first()
    if not app:
        raise HTTPException(status_code=404, detail='Application not found')

    job = db.query(JobPosting).filter(JobPosting.job_id == app.job_id).first()
    if not job or job.recruiter_id != payload.recruiter_id:
        raise HTTPException(status_code=403, detail='Not allowed')

    app.status = payload.status
    app.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(app)

    return success_response(
        {'application_id': app.application_id, 'status': app.status, 'updated_at': app.updated_at}
    )


@router.post('/applications/addNote')
def add_application_note(
    payload: ApplicationAddNoteRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('role') != 'recruiter' or int(current_user.get('user_id')) != payload.recruiter_id:
        raise HTTPException(status_code=403, detail='Only the owning recruiter can add notes')

    app = db.query(Application).filter(Application.application_id == payload.application_id).first()
    if not app:
        raise HTTPException(status_code=404, detail='Application not found')

    job = db.query(JobPosting).filter(JobPosting.job_id == app.job_id).first()
    if not job or job.recruiter_id != payload.recruiter_id:
        raise HTTPException(status_code=403, detail='Not allowed')

    app.recruiter_notes = (payload.note or '').strip() or None
    app.updated_at = datetime.now(timezone.utc)
    db.commit()

    return success_response({'application_id': app.application_id, 'updated': True})
