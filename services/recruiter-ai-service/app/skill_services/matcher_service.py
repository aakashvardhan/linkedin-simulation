from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

from app.agents.job_matcher import compute_match_score

app = FastAPI(title="Job-Candidate Matcher Skill Service")


class MatcherRequest(BaseModel):
    job: dict
    candidate: dict


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/run")
async def run_skill(body: MatcherRequest) -> dict:
    return compute_match_score(body.job, body.candidate)

