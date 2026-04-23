# Kaggle-aligned seed data (open datasets)

Seed JSON under `frontend/src/data/kaggle/` contains **synthetic rows** shaped like the public Kaggle collections below. Values are generated for local demo use and are **not** copied verbatim from any Kaggle download (keeps the repo lightweight and avoids bundling full CSVs).

## Primary references

| Topic | Kaggle dataset | URL |
|--------|----------------|-----|
| Job postings | LinkedIn Job 2023 | https://www.kaggle.com/datasets/rajatraj0502/linkedin-job-2023 |
| Job postings | LinkedIn Data Jobs Dataset | https://www.kaggle.com/datasets/joykimaiyo18/linkedin-data-jobs-dataset |
| Resumes / profiles | Resume Dataset | https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset |
| Graph / network (optional) | Graphs Social | https://www.kaggle.com/datasets/wolfram77/graphs-social |

## Using full Kaggle exports

1. Install Kaggle CLI and credentials (`~/.kaggle/kaggle.json`). Then run:
   `python scripts/kaggle_download_sample.py rajatraj0502/linkedin-job-2023`
2. Convert CSV rows to JSON with fields `jobs` / `posts` / `connections` (see `openSeedLoader.js` normalizers).
3. Host that JSON (or use a local static server) and set **`VITE_EXTRA_SEED_URL`** in `frontend/.env` so the app merges it on load.

## Open-source API data (no key, browser)

On startup the app also merges **DummyJSON** (`dummyjson.com`) users + quotes into jobs, connections, and feed posts. Disable with **`VITE_OPEN_SEED=false`** in `frontend/.env`.

## License

Check each dataset’s **Kaggle Data License** before redistribution. This repository only ships **small synthetic samples** plus links to the sources above.
