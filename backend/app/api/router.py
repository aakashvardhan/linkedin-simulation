from fastapi import APIRouter

from app.api.routes import connections, jobs, members

api_router = APIRouter()
api_router.include_router(members.router, tags=['Profile Service'])
api_router.include_router(jobs.router, tags=['Job Service'])
api_router.include_router(connections.router, tags=['Connection Service'])
