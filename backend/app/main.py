from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import get_settings
from app.db.mongo import ensure_mongo_indexes
from app.db.mysql import Base, engine
from app.models import (
    Company,
    Connection,
    JobPosting,
    Member,
    MemberEducation,
    MemberExperience,
    MemberSkill,
    Recruiter,
    SavedJob,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_create_schema:
        Base.metadata.create_all(bind=engine)
    mongo_ready = ensure_mongo_indexes()
    if not mongo_ready:
        print("[WARN] App started without MongoDB. M3/M4 MySQL APIs will still work.")
        yield


app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)
app.include_router(api_router)


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    message = exc.detail if isinstance(exc.detail, str) else 'Request failed'
    return JSONResponse(
        status_code=exc.status_code,
        content={'status': 'error', 'error': {'code': exc.status_code, 'message': message}},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {'msg': 'Invalid request'}
    return JSONResponse(
        status_code=400,
        content={'status': 'error', 'error': {'code': 400, 'message': str(first.get('msg', 'Invalid request'))}},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={'status': 'error', 'error': {'code': 500, 'message': str(exc) or 'Internal server error'}},
    )


@app.get('/health')
def health_check():
    return {'status': 'ok', 'service': settings.app_name}
