from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import OperationFailure

from app.core.config import get_settings

settings = get_settings()
client = MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=4000)
db = client[settings.mongo_db]


def ensure_mongo_indexes() -> bool:
    """Create Mongo indexes when MongoDB is reachable; return False if Mongo is down."""
    try:
        client.admin.command('ping')
    except Exception:
        return False
    
    events = db['events']
    
    # Create indexes - skip if they already exist with different names
    try:
        events.create_index([('idempotency_key', ASCENDING)], unique=True, name='ux_event_idempotency')
    except OperationFailure as e:
        if e.code != 85:  # 85 = IndexOptionsConflict
            raise
        print(f"[WARN] Index ux_event_idempotency conflict: {e}")
    
    try:
        events.create_index([('event_type', ASCENDING), ('timestamp', DESCENDING)], name='idx_event_type_time')
    except OperationFailure as e:
        if e.code != 85:
            raise
        print(f"[WARN] Index idx_event_type_time conflict: {e}")
    
    try:
        events.create_index(
            [('entity_type', ASCENDING), ('entity_id', ASCENDING), ('timestamp', DESCENDING)],
            name='idx_event_entity',
        )
    except OperationFailure as e:
        if e.code != 85:
            raise
        print(f"[WARN] Index idx_event_entity conflict: {e}")
    
    try:
        events.create_index(
            [('actor_id', ASCENDING), ('event_type', ASCENDING), ('timestamp', DESCENDING)],
            name='idx_event_actor',
        )
    except OperationFailure as e:
        if e.code != 85:
            raise
        print(f"[WARN] Index idx_event_actor conflict: {e}")
    
    return True
