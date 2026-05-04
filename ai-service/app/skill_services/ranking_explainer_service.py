from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

from app.agents.ranking_explainer import explain_ranking

app = FastAPI(title="Ranking Explanation Skill Service")


class ExplainRequest(BaseModel):
    job: dict
    candidate: dict
    match: dict


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/run")
async def run_skill(body: ExplainRequest) -> dict:
    return await explain_ranking(body.job, body.candidate, body.match)

