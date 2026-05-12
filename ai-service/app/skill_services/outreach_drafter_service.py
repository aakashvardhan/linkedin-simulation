from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

from app.agents.outreach_drafter import generate_outreach

app = FastAPI(title="Outreach Drafter Skill Service")


class OutreachRequest(BaseModel):
    job: dict
    candidate: dict
    match: dict


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/run")
async def run_skill(body: OutreachRequest) -> dict:
    return await generate_outreach(body.job, body.candidate, body.match)

