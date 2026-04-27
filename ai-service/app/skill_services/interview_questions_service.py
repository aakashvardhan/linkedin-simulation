from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

from app.agents.interview_question_generator import generate_interview_questions

app = FastAPI(title="Interview Question Generator Skill Service")


class InterviewQuestionsRequest(BaseModel):
    job: dict
    candidate: dict
    match: dict


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/run")
async def run_skill(body: InterviewQuestionsRequest) -> dict:
    return await generate_interview_questions(body.job, body.candidate, body.match)

