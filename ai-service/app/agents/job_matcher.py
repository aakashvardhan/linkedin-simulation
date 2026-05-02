# Skill: embedding-based match score

# The final score is a weighted blend — 60% semantic similarity from embeddings,
# 40% exact skills overlap — giving both meaning-aware matching and keyword precision.
from sentence_transformers import SentenceTransformer, util

_model = SentenceTransformer("all-MiniLM-L6-v2")


def compute_match_score(job: dict, candidate: dict) -> dict:
    raw_job_skills = job.get("skills_required", []) or []
    raw_cand_skills = candidate.get("skills", []) or []
    job_skills = [str(x) for x in raw_job_skills if x is not None]
    cand_skills = [str(x) for x in raw_cand_skills if x is not None]

    job_text = (
        f"{job.get('title', '')} {job.get('description', '')} {' '.join(job_skills)}"
    )
    cand_text = f"{candidate.get('current_title', '')} {' '.join(cand_skills)}"

    emb_job = _model.encode(job_text, convert_to_tensor=True)
    emb_cand = _model.encode(cand_text, convert_to_tensor=True)
    semantic_score = float(util.cos_sim(emb_job, emb_cand))

    job_skills_set = {s.lower() for s in job_skills}
    cand_skills_set = {s.lower() for s in cand_skills}
    overlap = len(job_skills_set & cand_skills_set) / max(len(job_skills_set), 1)

    final_score = round(0.6 * semantic_score + 0.4 * overlap, 3)
    matched_skills = list(job_skills_set & cand_skills_set)

    return {
        "score": final_score,
        "semantic_score": round(semantic_score, 3),
        "skills_overlap": matched_skills,
        "overlap_ratio": round(overlap, 3),
    }
