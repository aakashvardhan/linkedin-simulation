## Datasets (jobs + resumes)

Use at least one **jobs** dataset and one **resume** dataset in your data pipeline.

### Bundled Kaggle-style demo seeds (frontend)

Small **synthetic** JSON samples (not full CSVs) live in `frontend/src/data/kaggle/` and load into the React mock context. Source links and license notes: **`kaggle-seed/SOURCES.md`**.

### Jobs datasets
- LinkedIn Job 2023 (Kaggle): `https://www.kaggle.com/datasets/rajatraj0502/linkedin-job-2023`
- LinkedIn Data Jobs Dataset (Kaggle): `https://www.kaggle.com/datasets/joykimaiyo18/linkedin-data-jobs-dataset`

### Resume datasets
- Resume Dataset (Kaggle): `https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset`
- Resume Classification Dataset for NLP (Kaggle): `https://www.kaggle.com/datasets/hassnainzaidi/resume-classification-dataset-for-nlp`

### Optional connections/graph dataset (extra credit)
- SNAP social network datasets: `https://snap.stanford.edu/data/`
- Graphs Social (Kaggle mirror): `https://www.kaggle.com/datasets/wolfram77/graphs-social`

### How to use (suggested)
- **Jobs**: load CSV → normalize fields → write to **MySQL** `jobs` table (indexed by title/location/company).
- **Resumes**: load text/PDF → extract fields (skills/education/years) → store raw + extracted to **MongoDB** (unstructured) and extracted summary to **MySQL** (for matching).

> Tip: If you can’t upload Kaggle files into the repo, keep them external and document the exact download + import steps in your final report.

