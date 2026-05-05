from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

from app.agents.resume_parser import parse_resume

app = FastAPI(title="Resume Parser Skill Service")


class ResumeParseRequest(BaseModel):
    resume_text: str


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/run")
async def run_skill(body: ResumeParseRequest) -> dict:
    return await parse_resume(body.resume_text)

