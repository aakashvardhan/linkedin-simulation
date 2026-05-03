FROM python:3.11-slim

WORKDIR /app

# Install system dependencies needed by sentence-transformers + HEALTHCHECK curl
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

RUN groupadd --system app \
    && useradd --system -g app -d /app --shell /usr/sbin/nologin appuser \
    && chown -R appuser:app /app

# Expose FastAPI port
EXPOSE 8000

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -f http://127.0.0.1:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]