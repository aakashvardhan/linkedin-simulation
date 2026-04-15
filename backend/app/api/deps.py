from fastapi import Depends, HTTPException

from app.core.security import get_current_user
from app.db.mysql import get_db


__all__ = ['get_db', 'get_current_user', 'require_member_owner', 'require_recruiter_owner']


def require_member_owner(member_id: int, current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get('role') != 'member' or int(current_user.get('user_id')) != int(member_id):
        raise HTTPException(status_code=401, detail='Invalid or expired authentication token')
    return current_user


def require_recruiter_owner(recruiter_id: int, current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get('role') != 'recruiter' or int(current_user.get('user_id')) != int(recruiter_id):
        raise HTTPException(status_code=403, detail='Only the recruiter who posted this job can perform this action')
    return current_user
