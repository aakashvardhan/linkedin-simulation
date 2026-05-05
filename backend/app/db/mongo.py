from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import OperationFailure

from app.core.config import get_settings

settings = get_settings()
client = MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=4000)
db = client[settings.mongo_db]


def _key_dict(index_keys: list[tuple[str, int]]) -> dict[str, int]:
    return dict(index_keys)


def _drop_indexes_same_keys_different_name(events, index_keys: list[tuple[str, int]], intended_name: str) -> None:
    """Mongo auto-names indexes (e.g. event_type_1_timestamp_-1); recreating with a custom name raises code 85."""
    want = _key_dict(index_keys)
    try:
        for idx in list(events.list_indexes()):
            name = idx.get('name')
            if not name or name == '_id_':
                continue
            got = dict(idx.get('key') or {})
            if got == want and name != intended_name:
                events.drop_index(name)
    except Exception:
        pass


def _create_index_reconcile(events, index_keys: list[tuple[str, int]], **opts: object) -> None:
    name = str(opts.get('name', ''))
    if not name:
        raise ValueError('create_index requires name= for reconcile logic')
    _drop_indexes_same_keys_different_name(events, index_keys, name)
    try:
        events.create_index(index_keys, **opts)
    except OperationFailure as exc:
        if getattr(exc, 'code', None) == 85:
            _drop_indexes_same_keys_different_name(events, index_keys, name)
            events.create_index(index_keys, **opts)
        else:
            raise


def ensure_mongo_indexes() -> bool:
    """Create Mongo indexes when MongoDB is reachable; return False if Mongo is down."""
    try:
        client.admin.command('ping')
    except Exception:
        return False
    events = db['events']
    _create_index_reconcile(
        events,
        [('idempotency_key', ASCENDING)],
        unique=True,
        name='ux_event_idempotency',
    )
    _create_index_reconcile(
        events,
        [('event_type', ASCENDING), ('timestamp', DESCENDING)],
        name='idx_event_type_time',
    )
    _create_index_reconcile(
        events,
        [('entity_type', ASCENDING), ('entity_id', ASCENDING), ('timestamp', DESCENDING)],
        name='idx_event_entity',
    )
    _create_index_reconcile(
        events,
        [('actor_id', ASCENDING), ('event_type', ASCENDING), ('timestamp', DESCENDING)],
        name='idx_event_actor',
    )
    return True
