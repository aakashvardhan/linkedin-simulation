#!/usr/bin/env python3
"""
Download a Kaggle dataset sample locally (not callable from the browser).

Setup:
  1. Create API credentials at https://www.kaggle.com/settings → API → Create New Token.
  2. Place kaggle.json in ~/.kaggle/kaggle.json (or set KAGGLE_USERNAME + KAGGLE_KEY).

Install:
  pip install kaggle

Usage:
  python scripts/kaggle_download_sample.py rajatraj0502/linkedin-job-2023

Files unzip under datasets/kaggle-downloads/<slug>/ — convert CSV rows to JSON for VITE_EXTRA_SEED_URL
or copy into frontend/src/data/kaggle/jobsSeed.json (see datasets/kaggle-seed/SOURCES.md).
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Download a Kaggle dataset via official CLI.")
    parser.add_argument("dataset", help="Slug, e.g. rajatraj0502/linkedin-job-2023")
    parser.add_argument(
        "-o",
        "--out",
        default="datasets/kaggle-downloads",
        help="Output directory",
    )
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    kaggle = shutil.which("kaggle")
    if kaggle:
        cmd = [kaggle, "datasets", "download", "-d", args.dataset, "-p", str(out), "--unzip"]
    else:
        cmd = [sys.executable, "-m", "kaggle", "datasets", "download", "-d", args.dataset, "-p", str(out), "--unzip"]
    print("Running:", " ".join(cmd))
    raise SystemExit(subprocess.call(cmd))


if __name__ == "__main__":
    main()
