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
from app.schemas.connection import (
    ConnectionActionRequest,
    ConnectionListRequest,
    ConnectionRequestCreate,
    MutualConnectionsRequest,
    PendingConnectionsRequest,
)

router = APIRouter()


def _connected_member_ids(db: Session, user_id: int) -> set[int]:
    rows = (
        db.query(Connection)
        .filter(
            Connection.status == 'accepted',
            or_(Connection.requester_id == user_id, Connection.receiver_id == user_id),
        )
        .all()
    )
    connected: set[int] = set()
    for row in rows:
        connected.add(row.receiver_id if row.requester_id == user_id else row.requester_id)
    return connected


@router.post('/connections/request', status_code=status.HTTP_201_CREATED)
def request_connection(
    payload: ConnectionRequestCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('role') != 'member' or int(current_user.get('user_id')) != payload.requester_id:
        raise HTTPException(status_code=401, detail='Invalid or expired authentication token')
    if payload.requester_id == payload.receiver_id:
        raise HTTPException(status_code=400, detail='Cannot send connection request to yourself')

    requester = db.query(Member).filter(Member.member_id == payload.requester_id).first()
    receiver = db.query(Member).filter(Member.member_id == payload.receiver_id).first()
    if not requester or not receiver:
        raise HTTPException(status_code=404, detail='Member not found')

    existing = (
        db.query(Connection)
        .filter(
            or_(
                and_(Connection.requester_id == payload.requester_id, Connection.receiver_id == payload.receiver_id),
                and_(Connection.requester_id == payload.receiver_id, Connection.receiver_id == payload.requester_id),
            )
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail='Connection request already exists between these users')

    connection = Connection(requester_id=payload.requester_id, receiver_id=payload.receiver_id, status='pending')
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
    if current_user.get('role') != 'member' or int(current_user.get('user_id')) != payload.receiver_id:
        raise HTTPException(status_code=401, detail='Invalid or expired authentication token')

    connection = db.query(Connection).filter(Connection.connection_id == payload.request_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail='Connection request not found')
    if connection.receiver_id != payload.receiver_id:
        raise HTTPException(status_code=401, detail='Invalid or expired authentication token')
    if connection.status != 'pending':
        raise HTTPException(status_code=400, detail='Connection request is not in pending status')

    requester = db.query(Member).filter(Member.member_id == connection.requester_id).first()
    receiver = db.query(Member).filter(Member.member_id == connection.receiver_id).first()
    connection.status = 'accepted'
    connection.responded_at = datetime.now(timezone.utc)
    if requester:
        requester.connections_count += 1
    if receiver:
        receiver.connections_count += 1
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
    if current_user.get('role') != 'member' or int(current_user.get('user_id')) != payload.receiver_id:
        raise HTTPException(status_code=401, detail='Invalid or expired authentication token')

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
    if current_user.get('role') != 'member' or int(current_user.get('user_id')) != payload.user_id:
        raise HTTPException(status_code=401, detail='Invalid or expired authentication token')

    user = db.query(Member).filter(Member.member_id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='Member not found')

    query = db.query(Connection).filter(
        Connection.status == 'accepted',
        or_(Connection.requester_id == payload.user_id, Connection.receiver_id == payload.user_id),
    )
    total_count = query.count()
    page = max(payload.page, 1)
    page_size = max(payload.page_size, 1)
    rows = query.order_by(Connection.responded_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    connections = []
    for row in rows:
        other_id = row.receiver_id if row.requester_id == payload.user_id else row.requester_id
        other = db.query(Member).filter(Member.member_id == other_id).first()
        if not other:
            continue
        connections.append(
            {
                'connection_id': row.connection_id,
                'member_id': other.member_id,
                'first_name': other.first_name,
                'last_name': other.last_name,
                'headline': other.headline,
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
    if current_user.get('role') != 'member' or int(current_user.get('user_id')) != payload.user_id:
        raise HTTPException(status_code=401, detail='Invalid or expired authentication token')
    query = db.query(Connection).filter(Connection.receiver_id == payload.user_id, Connection.status == 'pending')
    total_count = query.count()
    page = max(payload.page, 1)
    page_size = max(payload.page_size, 1)
    rows = query.order_by(Connection.requested_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    requests = []
    for row in rows:
        requester = db.query(Member).filter(Member.member_id == row.requester_id).first()
        if not requester:
            continue
        requests.append(
            {
                'request_id': row.connection_id,
                'requester_id': requester.member_id,
                'first_name': requester.first_name,
                'last_name': requester.last_name,
                'headline': requester.headline,
                'created_at': row.requested_at,
            }
        )
    return success_response({'requests': requests, 'total_count': total_count, 'page': page, 'page_size': page_size})


@router.post('/connections/mutual')
def mutual_connections(payload: MutualConnectionsRequest, db: Session = Depends(get_db)):
    first = db.query(Member).filter(Member.member_id == payload.user_id).first()
    second = db.query(Member).filter(Member.member_id == payload.other_id).first()
    if not first or not second:
        raise HTTPException(status_code=404, detail='Member not found')
    mutual_ids = _connected_member_ids(db, payload.user_id).intersection(_connected_member_ids(db, payload.other_id))
    mutual_people = db.query(Member).filter(Member.member_id.in_(mutual_ids)).all() if mutual_ids else []
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
