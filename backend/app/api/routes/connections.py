from datetime import datetime, timezone

from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user, get_db
from app.core.kafka import publisher
from app.core.responses import success_response
from app.models.connection import Connection
from app.models.member import Member
from app.models.recruiter import Recruiter
from app.schemas.connection import (
    ConnectionActionRequest,
    ConnectionListRequest,
    ConnectionRequestCreate,
    ConnectionWithdrawRequest,
    MutualConnectionsRequest,
    PendingConnectionsRequest,
)

router = APIRouter()


def _lookup_participant(db: Session, user_id: int, user_type: str = 'member') -> dict | None:
    """Look up a display name from the correct table based on user_type."""
    if user_type == 'recruiter':
        recruiter = db.query(Recruiter).filter(Recruiter.recruiter_id == user_id).first()
        if recruiter:
            return {'first_name': recruiter.first_name, 'last_name': recruiter.last_name, 'headline': ''}
        return None
    member = db.query(Member).filter(Member.member_id == user_id).first()
    if member:
        return {'first_name': member.first_name, 'last_name': member.last_name, 'headline': getattr(member, 'headline', '')}
    return None


def _connected_ids(db: Session, user_id: int, user_type: str) -> set[tuple]:
    """Return set of (other_id, other_type) tuples for accepted connections of this user."""
    rows = (
        db.query(Connection)
        .filter(
            Connection.status == 'accepted',
            or_(
                and_(Connection.requester_id == user_id, Connection.requester_type == user_type),
                and_(Connection.receiver_id == user_id, Connection.receiver_type == user_type),
            ),
        )
        .all()
    )
    connected: set[tuple] = set()
    for row in rows:
        if row.requester_id == user_id and row.requester_type == user_type:
            connected.add((row.receiver_id, row.receiver_type))
        else:
            connected.add((row.requester_id, row.requester_type))
    return connected


def _auth_check(current_user: dict, expected_user_id: int):
    """Verify that the JWT user_id matches the expected_user_id."""
    try:
        jwt_uid = int(current_user.get('user_id', -1))
    except (TypeError, ValueError):
        jwt_uid = -1
    if jwt_uid != expected_user_id:
        raise HTTPException(status_code=401, detail='Invalid or expired authentication token')


@router.post('/connections/request', status_code=status.HTTP_201_CREATED)
def request_connection(
    payload: ConnectionRequestCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _auth_check(current_user, payload.requester_id)
    requester_type = current_user.get('role', 'member')  # 'member' or 'recruiter' from JWT
    receiver_type = payload.receiver_type  # passed by frontend

    if payload.requester_id == payload.receiver_id and requester_type == receiver_type:
        raise HTTPException(status_code=400, detail='Cannot send connection request to yourself')

    if _lookup_participant(db, payload.requester_id, requester_type) is None:
        raise HTTPException(status_code=404, detail='Requester not found')
    if _lookup_participant(db, payload.receiver_id, receiver_type) is None:
        raise HTTPException(status_code=404, detail='Receiver not found')

    existing = (
        db.query(Connection)
        .filter(
            or_(
                and_(
                    Connection.requester_id == payload.requester_id, Connection.requester_type == requester_type,
                    Connection.receiver_id == payload.receiver_id, Connection.receiver_type == receiver_type,
                ),
                and_(
                    Connection.requester_id == payload.receiver_id, Connection.requester_type == receiver_type,
                    Connection.receiver_id == payload.requester_id, Connection.receiver_type == requester_type,
                ),
            )
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail='Connection request already exists between these users')

    connection = Connection(
        requester_id=payload.requester_id, requester_type=requester_type,
        receiver_id=payload.receiver_id, receiver_type=receiver_type,
        status='pending',
    )
    db.add(connection)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail='Connection request already exists between these users') from exc
    db.refresh(connection)

    publisher.publish(
        topic='connection.requested',
        actor_id=str(payload.requester_id),
        entity_type='connection',
        entity_id=str(connection.connection_id),
        payload={'request_id': connection.connection_id, 'requester_id': payload.requester_id, 'receiver_id': payload.receiver_id},
    )
    return success_response(
        {
            'request_id': connection.connection_id,
            'requester_id': connection.requester_id,
            'receiver_id': connection.receiver_id,
            'status': connection.status,
            'created_at': connection.requested_at,
        }
    )


@router.post('/connections/accept')
def accept_connection(
    payload: ConnectionActionRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _auth_check(current_user, payload.receiver_id)

    connection = db.query(Connection).filter(Connection.connection_id == payload.request_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail='Connection request not found')
    if connection.receiver_id != payload.receiver_id:
        raise HTTPException(status_code=401, detail='Invalid or expired authentication token')
    if connection.status != 'pending':
        raise HTTPException(status_code=400, detail='Connection request is not in pending status')

    connection.status = 'accepted'
    connection.responded_at = datetime.now(timezone.utc)
    # Increment connections_count only for Member participants
    requester_member = db.query(Member).filter(Member.member_id == connection.requester_id).first()
    receiver_member = db.query(Member).filter(Member.member_id == connection.receiver_id).first()
    if requester_member:
        requester_member.connections_count += 1
    if receiver_member:
        receiver_member.connections_count += 1
    db.commit()
    return success_response(
        {
            'request_id': connection.connection_id,
            'status': 'accepted',
            'connection_id': connection.connection_id,
            'connected_at': connection.responded_at,
        }
    )


@router.post('/connections/reject')
def reject_connection(
    payload: ConnectionActionRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _auth_check(current_user, payload.receiver_id)

    connection = db.query(Connection).filter(Connection.connection_id == payload.request_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail='Connection request not found')
    if connection.receiver_id != payload.receiver_id:
        raise HTTPException(status_code=401, detail='Invalid or expired authentication token')
    if connection.status != 'pending':
        raise HTTPException(status_code=400, detail='Connection request is not in pending status')

    connection.status = 'rejected'
    connection.responded_at = datetime.now(timezone.utc)
    db.commit()
    return success_response({'request_id': connection.connection_id, 'status': 'rejected'})


@router.post('/connections/list')
def list_connections(
    payload: ConnectionListRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _auth_check(current_user, payload.user_id)
    user_type = current_user.get('role', 'member')

    query = db.query(Connection).filter(
        Connection.status == 'accepted',
        or_(
            and_(Connection.requester_id == payload.user_id, Connection.requester_type == user_type),
            and_(Connection.receiver_id == payload.user_id, Connection.receiver_type == user_type),
        ),
    )
    total_count = query.count()
    page = max(payload.page, 1)
    page_size = max(payload.page_size, 1)
    rows = query.order_by(Connection.responded_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    connections = []
    for row in rows:
        if row.requester_id == payload.user_id and row.requester_type == user_type:
            other_id, other_type = row.receiver_id, row.receiver_type
        else:
            other_id, other_type = row.requester_id, row.requester_type
        info = _lookup_participant(db, other_id, other_type)
        if not info:
            continue
        connections.append(
            {
                'connection_id': row.connection_id,
                'member_id': other_id,
                'user_type': other_type,
                'first_name': info['first_name'],
                'last_name': info['last_name'],
                'headline': info['headline'],
                'connected_at': row.responded_at,
            }
        )
    return success_response(
        {
            'connections': connections,
            'total_count': total_count,
            'page': page,
            'page_size': page_size,
            'total_pages': (total_count + page_size - 1) // page_size,
        }
    )


@router.post('/connections/pending')
def pending_connections(
    payload: PendingConnectionsRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _auth_check(current_user, payload.user_id)
    user_type = current_user.get('role', 'member')
    query = db.query(Connection).filter(
        Connection.receiver_id == payload.user_id,
        Connection.receiver_type == user_type,
        Connection.status == 'pending',
    )
    total_count = query.count()
    page = max(payload.page, 1)
    page_size = max(payload.page_size, 1)
    rows = query.order_by(Connection.requested_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    requests = []
    for row in rows:
        info = _lookup_participant(db, row.requester_id, row.requester_type)
        if not info:
            continue
        requests.append(
            {
                'request_id': row.connection_id,
                'requester_id': row.requester_id,
                'requester_type': row.requester_type,
                'first_name': info['first_name'],
                'last_name': info['last_name'],
                'headline': info['headline'],
                'created_at': row.requested_at,
            }
        )
    return success_response({'requests': requests, 'total_count': total_count, 'page': page, 'page_size': page_size})


@router.post('/connections/sent')
def sent_connections(
    payload: PendingConnectionsRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Outbound pending requests sent by this user (member or recruiter)."""
    _auth_check(current_user, payload.user_id)
    user_type = current_user.get('role', 'member')
    query = db.query(Connection).filter(
        Connection.requester_id == payload.user_id,
        Connection.requester_type == user_type,
        Connection.status == 'pending',
    )
    total_count = query.count()
    page = max(payload.page, 1)
    page_size = max(payload.page_size, 1)
    rows = query.order_by(Connection.requested_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    requests = []
    for row in rows:
        info = _lookup_participant(db, row.receiver_id, row.receiver_type)
        if not info:
            continue
        requests.append({
            'request_id': row.connection_id,
            'receiver_id': row.receiver_id,
            'receiver_type': row.receiver_type,
            'first_name': info['first_name'],
            'last_name': info['last_name'],
            'headline': info['headline'],
            'created_at': row.requested_at,
        })
    return success_response({'requests': requests, 'total_count': total_count, 'page': page, 'page_size': page_size})


@router.post('/connections/withdraw')
def withdraw_connection(
    payload: ConnectionWithdrawRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Cancel an outbound pending connection request sent by the current user."""
    _auth_check(current_user, payload.requester_id)
    requester_type = current_user.get('role', 'member')

    connection = db.query(Connection).filter(
        Connection.connection_id == payload.request_id,
        Connection.requester_id == payload.requester_id,
        Connection.requester_type == requester_type,
        Connection.status == 'pending',
    ).first()

    if not connection:
        raise HTTPException(status_code=404, detail='Pending connection request not found')

    db.delete(connection)
    db.commit()
    return success_response({'request_id': payload.request_id, 'status': 'withdrawn'})


@router.post('/connections/mutual')
def mutual_connections(payload: MutualConnectionsRequest, db: Session = Depends(get_db)):
    # Try both types for a best-effort lookup without requiring type info in this endpoint
    user_type = 'member'
    other_type = 'member'
    mutual_pairs = _connected_ids(db, payload.user_id, user_type).intersection(
        _connected_ids(db, payload.other_id, other_type)
    )
    member_ids = {pid for pid, ptype in mutual_pairs if ptype == 'member'}
    mutual_people = db.query(Member).filter(Member.member_id.in_(member_ids)).all() if member_ids else []
    return success_response(
        {
            'mutual_connections': [
                {
                    'member_id': person.member_id,
                    'first_name': person.first_name,
                    'last_name': person.last_name,
                    'headline': person.headline,
                }
                for person in mutual_people
            ],
            'count': len(mutual_people),
        }
    )
