from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, get_db
from app.core.responses import success_response
from app.models.member import Member
from app.models.recruiter import Recruiter

router = APIRouter()


@router.get('/auth/me')
def auth_me(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    role = current_user.get('role')
    uid = int(current_user['user_id'])
    if role == 'member':
        m = db.query(Member).filter(Member.member_id == uid).first()
        if not m:
            raise HTTPException(status_code=404, detail='Member not found')
        return success_response(
            {
                'displayName': f'{m.first_name} {m.last_name}'.strip(),
                'email': m.email,
                'headline': m.headline or '',
                'id': m.member_id,
                'member_id': m.member_id,
            }
        )
    if role == 'recruiter':
        r = (
            db.query(Recruiter)
            .options(joinedload(Recruiter.company))
            .filter(Recruiter.recruiter_id == uid)
            .first()
        )
        if not r:
            raise HTTPException(status_code=404, detail='Recruiter not found')
        company_name = r.company.name if r.company else ''
        return success_response(
            {
                'displayName': f'{r.first_name} {r.last_name}'.strip(),
                'email': r.email,
                'headline': company_name or (r.role or ''),
                'id': r.recruiter_id,
                'recruiter_id': r.recruiter_id,
                'member_id': r.recruiter_id,
                'company_id': r.company_id,
                'company_name': company_name,
            }
        )
    raise HTTPException(status_code=401, detail='Unsupported token role')
