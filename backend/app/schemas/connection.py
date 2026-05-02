from pydantic import BaseModel


class ConnectionRequestCreate(BaseModel):
    requester_id: int
    receiver_id: int


class ConnectionActionRequest(BaseModel):
    request_id: int
    receiver_id: int


class ConnectionListRequest(BaseModel):
    user_id: int
    page: int = 1
    page_size: int = 20


class MutualConnectionsRequest(BaseModel):
    user_id: int
    other_id: int


class PendingConnectionsRequest(BaseModel):
    user_id: int
    page: int = 1
    page_size: int = 20
