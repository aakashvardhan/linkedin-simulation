from datetime import datetime

from sqlalchemy import DateTime, Enum, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.mysql import Base


class Connection(Base):
    __tablename__ = 'connections'
    __table_args__ = (UniqueConstraint('requester_id', 'requester_type', 'receiver_id', 'receiver_type', name='ux_conn'),)

    connection_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    requester_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    requester_type: Mapped[str] = mapped_column(String(10), nullable=False, default='member')
    receiver_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    receiver_type: Mapped[str] = mapped_column(String(10), nullable=False, default='member')
    status: Mapped[str] = mapped_column(
        Enum('pending', 'accepted', 'rejected', name='connection_status'), default='pending', nullable=False
    )
    requested_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    responded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
