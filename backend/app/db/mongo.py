from pymongo import ASCENDING, DESCENDING, MongoClient

from app.core.config import get_settings

settings = get_settings()
client = MongoClient(settings.mongo_uri)
db = client[settings.mongo_db]


def ensure_mongo_indexes() -> bool:
    """Create MongoDB indexes. Returns True if successful, False otherwise."""
    try:
        events = db['events']
        events.create_index([('idempotency_key', ASCENDING)], unique=True, name='ux_event_idempotency')
        events.create_index([('event_type', ASCENDING), ('timestamp', DESCENDING)], name='idx_event_type_time')
        events.create_index(
            [('entity_type', ASCENDING), ('entity_id', ASCENDING), ('timestamp', DESCENDING)],
            name='idx_event_entity',
        )
        events.create_index(
            [('actor_id', ASCENDING), ('event_type', ASCENDING), ('timestamp', DESCENDING)],
            name='idx_event_actor',
        )
        # Test connection by pinging
        client.admin.command('ping')
        print("[INFO] MongoDB initialized successfully")
        return True
    except Exception as e:
        print(f"[ERROR] MongoDB initialization failed: {e}")
        return False
