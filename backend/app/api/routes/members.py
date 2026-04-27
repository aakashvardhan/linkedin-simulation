import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, get_db, get_optional_user
from app.core.kafka import publisher
from app.core.redis import cache_delete, cache_get, cache_set
from app.core.responses import success_response
from app.core.security import create_access_token, hash_password, verify_password
from app.models.company import Company
from app.models.member import Member, MemberEducation, MemberExperience, MemberSkill
from app.models.recruiter import Recruiter
from app.schemas.member import (
    MemberCreateRequest,
    MemberDeleteRequest,
    MemberGetRequest,
    MemberLoginRequest,
    MemberSearchRequest,
    MemberUpdateRequest,
    RecruiterCreateRequest,
    RecruiterGetRequest,
    RecruiterLoginRequest,
)

router = APIRouter()
def _publish_profile_viewed(profile_owner_id: int, current_user: dict | None) -> None:
    viewer_id = str(current_user.get('user_id')) if current_user else 'anonymous'
    viewer_role = current_user.get('role', 'anonymous') if current_user else 'anonymous'
    
    # Time-bucketed idempotency key — per minute, prevents refresh inflation
    minute_bucket = datetime.now(timezone.utc).strftime('%Y%m%d%H%M')
    idempotency_key = hashlib.md5(
        f'{viewer_id}:{profile_owner_id}:{minute_bucket}'.encode()
    ).hexdigest()

    publisher.publish(
        topic='profile.viewed',
        actor_id=viewer_id,
        entity_type='member',
        entity_id=str(profile_owner_id),
        payload={'viewer_role': viewer_role},
        idempotency_key=idempotency_key,
    )

def _member_query(db: Session):
    return db.query(Member).options(
        joinedload(Member.skills),
        joinedload(Member.experiences),
        joinedload(Member.education_entries),
    )


def _replace_member_children(member: Member, skills: list[str] | None, experience: list | None, education: list | None) -> None:
    if skills is not None:
        member.skills = [MemberSkill(skill_name=skill.strip()) for skill in skills if skill and skill.strip()]
    if experience is not None:
        member.experiences = [
            MemberExperience(
                company=exp.company,
                title=exp.title,
                start_date=exp.start_date,
                end_date=exp.end_date,
                description=exp.description,
            )
            for exp in experience
        ]
    if education is not None:
        member.education_entries = [
            MemberEducation(
                school=edu.school,
                degree=edu.degree,
                field=edu.field,
                start_year=edu.start_year,
                end_year=edu.end_year,
            )
            for edu in education
        ]


def _member_data(member: Member) -> dict:
    return {
        'member_id': member.member_id,
        'first_name': member.first_name,
        'last_name': member.last_name,
        'email': member.email,
        'phone': member.phone,
        'location_city': member.location_city,
        'location_state': member.location_state,
        'location_country': member.location_country,
        'headline': member.headline,
        'about': member.about,
        'skills': [skill.skill_name for skill in member.skills],
        'experience': [
            {
                'company': exp.company,
                'title': exp.title,
                'start_date': exp.start_date,
                'end_date': exp.end_date,
                'description': exp.description,
            }
            for exp in member.experiences
        ],
        'education': [
            {
                'school': edu.school,
                'degree': edu.degree,
                'field': edu.field,
                'start_year': edu.start_year,
                'end_year': edu.end_year,
            }
            for edu in member.education_entries
        ],
        'profile_photo_url': member.profile_photo_url,
        'resume_url': member.resume_url,
        'connections_count': member.connections_count,
        'profile_views': member.profile_views,
        'created_at': member.created_at,
        'updated_at': member.updated_at,
    }


@router.post('/members/create', status_code=status.HTTP_201_CREATED)
def create_member(payload: MemberCreateRequest, db: Session = Depends(get_db)):
    member = Member(
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=str(payload.email),
        password_hash=hash_password(payload.password),
        phone=payload.phone,
        location_city=payload.location_city,
        location_state=payload.location_state,
        location_country=payload.location_country,
        headline=payload.headline,
        about=payload.about,
        profile_photo_url=payload.profile_photo_url,
        resume_url=payload.resume_url,
    )
    _replace_member_children(member, payload.skills, payload.experience, payload.education)
    db.add(member)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail='A member with this email already exists') from exc
    db.refresh(member)
    return success_response(
        {
            'member_id': member.member_id,
            'email': member.email,
            'first_name': member.first_name,
            'last_name': member.last_name,
            'created_at': member.created_at,
        }
    )


@router.post('/members/get')
def get_member(
    payload: MemberGetRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_optional_user),
):
    cache_key = f'member:{payload.member_id}'
    cached = cache_get(cache_key)
    if cached:
        # Still publish view event even on cache hit
        _publish_profile_viewed(payload.member_id, current_user)
        return cached

    member = _member_query(db).filter(Member.member_id == payload.member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail='Member not found')

    member.profile_views = (member.profile_views or 0) + 1
    db.commit()
    db.refresh(member)

    _publish_profile_viewed(payload.member_id, current_user)

    response = success_response(_member_data(member))
    cache_set(cache_key, response, ttl=300)
    return response

@router.post('/members/update')
def update_member(
    payload: MemberUpdateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('role') != 'member' or int(current_user.get('user_id')) != payload.member_id:
        raise HTTPException(status_code=401, detail='Invalid or expired authentication token')

    member = _member_query(db).filter(Member.member_id == payload.member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail='Member not found')

    updated_fields: list[str] = []
    field_names = [
        'first_name', 'last_name', 'phone', 'location_city', 'location_state', 'location_country',
        'headline', 'about', 'profile_photo_url', 'resume_url'
    ]
    for field in field_names:
        value = getattr(payload, field)
        if value is not None:
            setattr(member, field, value)
            updated_fields.append(field)

    if payload.email is not None:
        member.email = str(payload.email)
        updated_fields.append('email')
    if payload.password is not None:
        member.password_hash = hash_password(payload.password)
        updated_fields.append('password')
    if payload.skills is not None or payload.experience is not None or payload.education is not None:
        _replace_member_children(member, payload.skills, payload.experience, payload.education)
        if payload.skills is not None:
            updated_fields.append('skills')
        if payload.experience is not None:
            updated_fields.append('experience')
        if payload.education is not None:
            updated_fields.append('education')

    if not updated_fields:
        raise HTTPException(status_code=400, detail='Invalid input: no valid fields provided for update')

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail='A member with this email already exists') from exc
    db.refresh(member)
    cache_delete(f'member:{payload.member_id}')
    return success_response(
        {
            'member_id': member.member_id,
            'updated_fields': updated_fields,
            'updated_at': member.updated_at,
        }
    )


@router.post('/members/delete')
def delete_member(
    payload: MemberDeleteRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('role') != 'member' or int(current_user.get('user_id')) != payload.member_id:
        raise HTTPException(status_code=401, detail='Invalid or expired authentication token')

    member = db.query(Member).filter(Member.member_id == payload.member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail='Member not found')
    db.delete(member)
    db.commit()
    cache_delete(f'member:{payload.member_id}')
    return success_response({'member_id': payload.member_id, 'deleted': True})


@router.post('/members/search')
def search_members(payload: MemberSearchRequest, db: Session = Depends(get_db)):
    query = db.query(Member).outerjoin(MemberSkill)
    if payload.keyword:
        term = f'%{payload.keyword}%'
        query = query.filter(
            or_(
                Member.first_name.ilike(term),
                Member.last_name.ilike(term),
                Member.headline.ilike(term),
                Member.about.ilike(term),
            )
        )
    if payload.skills:
        query = query.filter(MemberSkill.skill_name.in_(payload.skills))
    if payload.location_city:
        query = query.filter(Member.location_city.ilike(f'%{payload.location_city}%'))
    if payload.location_state:
        query = query.filter(Member.location_state.ilike(f'%{payload.location_state}%'))

    query = query.distinct(Member.member_id)
    total_count = query.count()
    page = max(payload.page, 1)
    page_size = max(payload.page_size, 1)
    members = query.order_by(Member.member_id.asc()).offset((page - 1) * page_size).limit(page_size).all()

    data = {
        'members': [
            {
                'member_id': member.member_id,
                'first_name': member.first_name,
                'last_name': member.last_name,
                'headline': member.headline,
                'location_city': member.location_city,
                'skills': [skill.skill_name for skill in member.skills],
                'connections_count': member.connections_count,
            }
            for member in members
        ],
        'total_count': total_count,
        'page': page,
        'page_size': page_size,
        'total_pages': (total_count + page_size - 1) // page_size,
    }
    return success_response(data)


@router.post('/members/login')
def login_member(payload: MemberLoginRequest, db: Session = Depends(get_db)):
    member = _member_query(db).filter(Member.email == str(payload.email)).first()
    if not member or not verify_password(payload.password, member.password_hash):
        raise HTTPException(status_code=401, detail='Invalid email or password')
    token = create_access_token(member.member_id, 'member')
    return success_response(
        {
            'member_id': member.member_id,
            'first_name': member.first_name,
            'last_name': member.last_name,
            'email': member.email,
            'token': token,
            'role': 'member',
        }
    )


@router.post('/recruiters/create', status_code=status.HTTP_201_CREATED)
def create_recruiter(payload: RecruiterCreateRequest, db: Session = Depends(get_db)):
    company = Company(name=payload.company_name, industry=payload.company_industry, size=payload.company_size)
    db.add(company)
    db.flush()
    recruiter = Recruiter(
        company_id=company.company_id,
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=str(payload.email),
        password_hash=hash_password(payload.password),
        phone=payload.phone,
        role=payload.role,
    )
    db.add(recruiter)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail='A recruiter with this email already exists') from exc
    db.refresh(recruiter)
    return success_response(
        {
            'recruiter_id': recruiter.recruiter_id,
            'company_id': recruiter.company_id,
            'email': recruiter.email,
            'first_name': recruiter.first_name,
            'last_name': recruiter.last_name,
            'created_at': recruiter.created_at,
        }
    )


@router.post('/recruiters/get')
def get_recruiter(payload: RecruiterGetRequest, db: Session = Depends(get_db)):
    recruiter = db.query(Recruiter).join(Company).filter(Recruiter.recruiter_id == payload.recruiter_id).first()
    if not recruiter:
        raise HTTPException(status_code=404, detail='Recruiter not found')
    return success_response(
        {
            'recruiter_id': recruiter.recruiter_id,
            'first_name': recruiter.first_name,
            'last_name': recruiter.last_name,
            'email': recruiter.email,
            'company_id': recruiter.company_id,
            'company_name': recruiter.company.name,
            'company_industry': recruiter.company.industry,
            'company_size': recruiter.company.size,
            'role': recruiter.role,
            'created_at': recruiter.created_at,
        }
    )


@router.post('/recruiters/login')
def login_recruiter(payload: RecruiterLoginRequest, db: Session = Depends(get_db)):
    recruiter = db.query(Recruiter).join(Company).filter(Recruiter.email == str(payload.email)).first()
    if not recruiter or not verify_password(payload.password, recruiter.password_hash):
        raise HTTPException(status_code=401, detail='Invalid email or password')
    token = create_access_token(recruiter.recruiter_id, 'recruiter')
    return success_response(
        {
            'recruiter_id': recruiter.recruiter_id,
            'first_name': recruiter.first_name,
            'last_name': recruiter.last_name,
            'email': recruiter.email,
            'company_id': recruiter.company_id,
            'company_name': recruiter.company.name,
            'token': token,
            'role': 'recruiter',
        }
    )
