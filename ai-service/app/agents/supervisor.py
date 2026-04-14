# Hiring Assistant — orchestrates the workflow
import json
import logging

from app.agents.job_matcher import compute_match_score
from app.agents.outreach_drafter import generate_outreach
from app.agents.resume_parser import parse_resume

logger = logging.getLogger(__name__)


async def run_hiring_workflow(task: dict, trace_id: str) -> dict:
    job = task.get("job", {})
    resume_text = task.get("resume_text", "")
    actor_id = task.get("actor_id", "")

    results = {
        "trace_id": trace_id,
        "actor_id": actor_id,
        "steps": [],
        "status": "in_progress",
    }

    # Step 1 — Parse resume
    try:
        logger.info("trace_id=%s step=resume_parser status=started", trace_id)
        parsed_resume = await parse_resume(resume_text)
        results["steps"].append(
            {
                "step": "resume_parsed",
                "status": "completed",
                "data": parsed_resume,
            }
        )
        logger.info("trace_id=%s step=resume_parser status=completed", trace_id)
    except json.JSONDecodeError as e:
        logger.error("trace_id=%s step=resume_parser error=%s", trace_id, str(e))
        results["steps"].append(
            {
                "step": "resume_parsed",
                "status": "failed",
                "error": "LLM returned invalid JSON",
            }
        )
        results["status"] = "failed"
        return results
    except Exception as e:
        logger.error("trace_id=%s step=resume_parser error=%s", trace_id, str(e))
        results["steps"].append(
            {
                "step": "resume_parsed",
                "status": "failed",
                "error": str(e),
            }
        )
        results["status"] = "failed"
        return results

    # Step 2 — Compute match score
    try:
        logger.info("trace_id=%s step=job_matcher status=started", trace_id)
        match = compute_match_score(job, parsed_resume)
        results["steps"].append(
            {
                "step": "match_scored",
                "status": "completed",
                "data": match,
            }
        )
        logger.info(
            "trace_id=%s step=job_matcher status=completed score=%s",
            trace_id,
            match.get("score"),
        )
    except Exception as e:
        logger.error("trace_id=%s step=job_matcher error=%s", trace_id, str(e))
        results["steps"].append(
            {
                "step": "match_scored",
                "status": "failed",
                "error": str(e),
            }
        )
        results["status"] = "failed"
        return results

    # Step 3 — Generate outreach draft (requires human approval)
    try:
        logger.info("trace_id=%s step=outreach_drafter status=started", trace_id)
        outreach = await generate_outreach(job, parsed_resume, match)
        results["steps"].append(
            {
                "step": "outreach_drafted",
                "status": "completed",
                "data": outreach,
            }
        )
        logger.info(
            "trace_id=%s step=outreach_drafter status=awaiting_approval", trace_id
        )
    except Exception as e:
        logger.error("trace_id=%s step=outreach_drafter error=%s", trace_id, str(e))
        results["steps"].append(
            {
                "step": "outreach_drafted",
                "status": "failed",
                "error": str(e),
            }
        )
        results["status"] = "failed"
        return results

    results["status"] = "awaiting_approval"
    return results
