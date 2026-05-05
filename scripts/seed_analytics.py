"""
Seed MongoDB analytics_events from existing MySQL data.
Run inside the api-backend container:
  docker exec -i api-backend python /tmp/seed_analytics.py
"""
import os, uuid, json, random
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from sqlalchemy import create_engine, text
from urllib.parse import quote_plus

# ── connections ──────────────────────────────────────────────────────────────
MYSQL_USER = os.getenv('MYSQL_USER', 'root')
MYSQL_PASS = quote_plus(os.getenv('MYSQL_PASSWORD', 'linkedin_pass'))
MYSQL_HOST = os.getenv('MYSQL_HOST', 'mysql')
MYSQL_PORT = os.getenv('MYSQL_PORT', '3306')
MYSQL_DB   = os.getenv('MYSQL_DB', 'linkedin_simulation')
MONGO_URI  = os.getenv('MONGO_URI', 'mongodb://mongo:27017')
MONGO_DB   = os.getenv('MONGO_DB', 'linkedin_simulation')

engine = create_engine(f'mysql+pymysql://{MYSQL_USER}:{MYSQL_PASS}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DB}')
mongo  = MongoClient(MONGO_URI)[MONGO_DB]
col    = mongo['events']  # EventLog Mongoose model uses 'events' collection

def now_minus(days=0, hours=0):
    return datetime.now(timezone.utc) - timedelta(days=days, hours=hours)

events = []
seen_keys = set(doc['idempotency_key'] for doc in col.find({}, {'idempotency_key': 1}))

def add(evt):
    k = evt['idempotency_key']
    if k not in seen_keys:
        seen_keys.add(k)
        events.append(evt)

with engine.connect() as conn:
    # ── application.submitted events (drives top-jobs, geo, funnel charts) ──
    rows = conn.execute(text("""
        SELECT a.application_id, a.job_id, a.member_id, j.recruiter_id,
               a.status, a.application_datetime,
               m.location_city, m.location_state
        FROM applications a
        JOIN job_postings j ON a.job_id = j.job_id
        LEFT JOIN members m ON a.member_id = m.member_id
    """)).fetchall()

    for r in rows:
        ts = r.application_datetime or now_minus(random.randint(0, 29))
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        add({
            'event_type':      'application.submitted',
            'trace_id':        str(uuid.uuid4()),
            'timestamp':       ts,
            'actor_id':        str(r.member_id),
            'entity_type':     'application',
            'entity_id':       str(r.application_id),
            'payload': {
                'application_id': str(r.application_id),
                'job_id':        str(r.job_id),
                'recruiter_id':  str(r.recruiter_id),
                'member_id':     str(r.member_id),
                'location_city': r.location_city or 'Unknown',
                'location_state':r.location_state or 'Unknown',
                'status':        r.status or 'submitted',
            },
            'idempotency_key': f'seed-app-{r.application_id}',
            'kafka_topic':     'seed',
            'kafka_partition': None,
        })

    # ── job.viewed events (drives clicks-per-job chart) ─────────────────────
    jobs = conn.execute(text("""
        SELECT j.job_id, j.recruiter_id, j.title
        FROM job_postings j
        WHERE j.status = 'open'
        LIMIT 200
    """)).fetchall()

    for j in jobs:
        views = random.randint(5, 80)
        for v in range(views):
            days_ago = random.randint(0, 29)
            add({
                'event_type':      'job.viewed',
                'trace_id':        str(uuid.uuid4()),
                'timestamp':       now_minus(days=days_ago, hours=random.randint(0, 23)),
                'actor_id':        str(random.randint(1, 500)),
                'entity_type':     'job',
                'entity_id':       str(j.job_id),
                'payload': {
                    'job_id':       str(j.job_id),
                    'recruiter_id': str(j.recruiter_id),
                    'job_title':    j.title,
                },
                'idempotency_key': f'seed-view-{j.job_id}-{v}',
                'kafka_topic':     'seed',
                'kafka_partition': None,
            })

    # ── job.saved events (drives saves-per-day chart) ────────────────────────
    for j in random.sample(list(jobs), min(50, len(jobs))):
        saves = random.randint(1, 15)
        for s in range(saves):
            days_ago = random.randint(0, 29)
            add({
                'event_type':      'job.saved',
                'trace_id':        str(uuid.uuid4()),
                'timestamp':       now_minus(days=days_ago, hours=random.randint(0, 23)),
                'actor_id':        str(random.randint(1, 500)),
                'entity_type':     'job',
                'entity_id':       str(j.job_id),
                'payload': {
                    'job_id':       str(j.job_id),
                    'recruiter_id': str(j.recruiter_id),
                },
                'idempotency_key': f'seed-save-{j.job_id}-{s}',
                'kafka_topic':     'seed',
                'kafka_partition': None,
            })

if events:
    result = col.insert_many(events, ordered=False)
    print(f'Inserted {len(result.inserted_ids)} analytics events.')
else:
    print('No new events to insert (all already seeded).')

print(f'Total events in collection: {col.count_documents({})}')
