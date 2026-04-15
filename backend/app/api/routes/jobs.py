import json
from datetime import datetime, timezone

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user, get_db
from app.core.kafka import publisher
from app.core.responses import success_response
from app.models.company import Company
from app.models.job import JobPosting
from app.models.member import Member
from app.models.recruiter import Recruiter
from app.models.saved_job import SavedJob
from app.schemas.job import (
    JobCloseRequest,
    JobCreateRequest,
    JobGetRequest,
    JobSaveRequest,
    JobSearchRequest,
    JobsByRecruiterRequest,
    JobsSavedByMemberRequest,
    JobUpdateRequest,
)

router = APIRouter()


def _job_details(job: JobPosting) -> dict:
    recruiter_name = None
    company_name = None
    if job.recruiter:
        recruiter_name = f'{job.recruiter.first_name} {job.recruiter.last_name}'
    if job.company:
        company_name = job.company.name
    return {
        'job_id': job.job_id,
        'company_id': job.company_id,
        'company_name': company_name,
        'recruiter_id': job.recruiter_id,
        'recruiter_name': recruiter_name,
        'title': job.title,
        'description': job.description,
        'seniority_level': job.seniority_level,
        'employment_type': job.employment_type,
        'location': job.location,
        'work_mode': job.work_mode,
        'skills_required': json.loads(job.skills_required or '[]'),
        'salary_min': job.salary_min,
        'salary_max': job.salary_max,
        'posted_datetime': job.posted_datetime,
        'status': job.status,
        'views_count': job.views_count,
        'applicants_count': job.applicants_count,
        'saves_count': job.saves_count,
        'closed_at': job.closed_at,
    }


@router.post('/jobs/create', status_code=status.HTTP_201_CREATED)
def create_job(
    payload: JobCreateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('role') != 'recruiter':
        raise HTTPException(status_code=403, detail='Only recruiters can create job postings')
    if int(current_user.get('user_id')) != payload.recruiter_id:
        raise HTTPException(status_code=403, detail='Only recruiters can create job postings')

    company = db.query(Company).filter(Company.company_id == payload.company_id).first()
    recruiter = db.query(Recruiter).filter(Recruiter.recruiter_id == payload.recruiter_id).first()
    if not company or not recruiter:
        raise HTTPException(status_code=404, detail='Recruiter or company not found')

    job = JobPosting(
        company_id=payload.company_id,
        recruiter_id=payload.recruiter_id,
        title=payload.title,
        description=payload.description,
        seniority_level=payload.seniority_level,
        employment_type=payload.employment_type,
        location=payload.location,
        work_mode=payload.work_mode,
        skills_required=json.dumps(payload.skills_required),
        salary_min=payload.salary_min,
        salary_max=payload.salary_max,
        status='open',
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return success_response(
        {
            'job_id': job.job_id,
            'title': job.title,
            'company_id': job.company_id,
            'recruiter_id': job.recruiter_id,
            'status': job.status,
            'posted_datetime': job.posted_datetime,
        }
    )


@router.post('/jobs/get')
def get_job(payload: JobGetRequest, db: Session = Depends(get_db)):
    job = db.query(JobPosting).join(Company).join(Recruiter).filter(JobPosting.job_id == payload.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail='Job not found')

    job.views_count += 1
    db.commit()
    db.refresh(job)
    publisher.publish(
        topic='job.viewed',
        actor_id='anonymous',
        entity_type='job',
        entity_id=str(job.job_id),
        payload={'job_id': job.job_id},
    )
    return success_response(_job_details(job))


@router.post('/jobs/update')
def update_job(
    payload: JobUpdateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('role') != 'recruiter' or int(current_user.get('user_id')) != payload.recruiter_id:
        raise HTTPException(status_code=403, detail='You can only update jobs that you posted')

    job = db.query(JobPosting).filter(JobPosting.job_id == payload.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail='Job not found')
    if job.recruiter_id != payload.recruiter_id:
        raise HTTPException(status_code=403, detail='You can only update jobs that you posted')

    updated_fields: list[str] = []
    for field in ['title', 'description', 'seniority_level', 'employment_type', 'location', 'work_mode', 'salary_min', 'salary_max']:
        value = getattr(payload, field)
        if value is not None:
            setattr(job, field, value)
            updated_fields.append(field)
    if payload.skills_required is not None:
        job.skills_required = json.dumps(payload.skills_required)
        updated_fields.append('skills_required')

    if not updated_fields:
        raise HTTPException(status_code=400, detail='Invalid input: no valid fields provided for update')

    db.commit()
    db.refresh(job)
    return success_response({'job_id': job.job_id, 'updated_fields': updated_fields, 'updated_at': datetime.now(timezone.utc)})


@router.post('/jobs/search')
def search_jobs(payload: JobSearchRequest, db: Session = Depends(get_db)):
    query = db.query(JobPosting).join(Company)
    if payload.keyword:
        term = f'%{payload.keyword}%'
        query = query.filter(or_(JobPosting.title.ilike(term), JobPosting.description.ilike(term)))
    if payload.location:
        query = query.filter(JobPosting.location.ilike(f'%{payload.location}%'))
    if payload.employment_type:
        query = query.filter(JobPosting.employment_type == payload.employment_type)
    if payload.work_mode:
        query = query.filter(JobPosting.work_mode == payload.work_mode)
    if payload.seniority_level:
        query = query.filter(JobPosting.seniority_level == payload.seniority_level)
    if payload.skills:
        for skill in payload.skills:
            query = query.filter(JobPosting.skills_required.ilike(f'%{skill}%'))
    if payload.salary_min is not None:
        query = query.filter(JobPosting.salary_min >= payload.salary_min)
    if payload.status:
        query = query.filter(JobPosting.status == payload.status)

    sort_col = JobPosting.posted_datetime if payload.sort_by != 'views_count' else JobPosting.views_count
    sort_expr = sort_col.desc() if payload.sort_order.lower() != 'asc' else sort_col.asc()
    total_count = query.count()
    page = max(payload.page, 1)
    page_size = max(payload.page_size, 1)
    jobs = query.order_by(sort_expr).offset((page - 1) * page_size).limit(page_size).all()

    return success_response(
        {
            'jobs': [
                {
                    'job_id': job.job_id,
                    'title': job.title,
                    'company_name': job.company.name if job.company else None,
                    'location': job.location,
                    'work_mode': job.work_mode,
                    'employment_type': job.employment_type,
                    'seniority_level': job.seniority_level,
                    'salary_min': job.salary_min,
                    'salary_max': job.salary_max,
                    'posted_datetime': job.posted_datetime,
                    'applicants_count': job.applicants_count,
                    'views_count': job.views_count,
                }
                for job in jobs
            ],
            'total_count': total_count,
            'page': page,
            'page_size': page_size,
            'total_pages': (total_count + page_size - 1) // page_size,
        }
    )


@router.post('/jobs/close')
def close_job(
    payload: JobCloseRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('role') != 'recruiter' or int(current_user.get('user_id')) != payload.recruiter_id:
        raise HTTPException(status_code=403, detail='You can only close jobs that you posted')

    job = db.query(JobPosting).filter(JobPosting.job_id == payload.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail='Job not found')
    if job.recruiter_id != payload.recruiter_id:
        raise HTTPException(status_code=403, detail='You can only close jobs that you posted')
    if job.status == 'closed':
        raise HTTPException(status_code=400, detail='This job posting is already closed')

    job.status = 'closed'
    job.closed_at = datetime.now(timezone.utc)
    db.commit()
    return success_response({'job_id': job.job_id, 'status': job.status, 'closed_at': job.closed_at})


@router.post('/jobs/byRecruiter')
def jobs_by_recruiter(payload: JobsByRecruiterRequest, db: Session = Depends(get_db)):
    recruiter = db.query(Recruiter).filter(Recruiter.recruiter_id == payload.recruiter_id).first()
    if not recruiter:
        raise HTTPException(status_code=404, detail='Recruiter not found')

    query = db.query(JobPosting).filter(JobPosting.recruiter_id == payload.recruiter_id)
    if payload.status:
        query = query.filter(JobPosting.status == payload.status)
    total_count = query.count()
    page = max(payload.page, 1)
    page_size = max(payload.page_size, 1)
    jobs = query.order_by(JobPosting.posted_datetime.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return success_response(
        {
            'jobs': [
                {
                    'job_id': job.job_id,
                    'title': job.title,
                    'status': job.status,
                    'posted_datetime': job.posted_datetime,
                    'applicants_count': job.applicants_count,
                    'views_count': job.views_count,
                    'saves_count': job.saves_count,
                }
                for job in jobs
            ],
            'total_count': total_count,
            'page': page,
            'page_size': page_size,
        }
    )


@router.post('/jobs/save')
def save_job(
    payload: JobSaveRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('role') != 'member' or int(current_user.get('user_id')) != payload.member_id:
        raise HTTPException(status_code=401, detail='Invalid or expired authentication token')

    job = db.query(JobPosting).filter(JobPosting.job_id == payload.job_id).first()
    member = db.query(Member).filter(Member.member_id == payload.member_id).first()
    if not job or not member:
        raise HTTPException(status_code=404, detail='Job not found')

    saved = SavedJob(job_id=payload.job_id, member_id=payload.member_id)
    db.add(saved)
    try:
        job.saves_count += 1
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail='You have already saved this job') from exc
    db.refresh(saved)
    publisher.publish(
        topic='job.saved',
        actor_id=str(payload.member_id),
        entity_type='job',
        entity_id=str(payload.job_id),
        payload={'job_id': payload.job_id, 'member_id': payload.member_id},
    )
    return success_response({'job_id': payload.job_id, 'member_id': payload.member_id, 'saved': True, 'saved_at': saved.saved_at})


@router.post('/jobs/savedByMember')
def saved_by_member(payload: JobsSavedByMemberRequest, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.member_id == payload.member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail='Member not found')
    query = db.query(SavedJob).join(JobPosting).join(Company).filter(SavedJob.member_id == payload.member_id)
    total_count = query.count()
    page = max(payload.page, 1)
    page_size = max(payload.page_size, 1)
    rows = query.order_by(SavedJob.saved_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return success_response(
        {
            'jobs': [
                {
                    'job_id': row.job_id,
                    'title': db.query(JobPosting).filter(JobPosting.job_id == row.job_id).first().title,
                    'company_name': db.query(JobPosting).filter(JobPosting.job_id == row.job_id).first().company.name,
                    'location': db.query(JobPosting).filter(JobPosting.job_id == row.job_id).first().location,
                    'posted_datetime': db.query(JobPosting).filter(JobPosting.job_id == row.job_id).first().posted_datetime,
                    'saved_at': row.saved_at,
                }
                for row in rows
            ],
            'total_count': total_count,
            'page': page,
            'page_size': page_size,
        }
    )
