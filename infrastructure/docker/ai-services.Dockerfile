# ============================================================
# Smart Restaurant Campus — Python AI Services (FastAPI + uv)
# ============================================================

FROM ghcr.io/astral-sh/uv:python3.13-alpine AS base

# Install system deps (for native compilation if needed)
RUN apk add --no-cache \
    gcc \
    musl-dev \
    libffi-dev \
    openssl-dev \
    postgresql-dev

WORKDIR /app

# ============ STAGE 1: dependencies ============
FROM base AS deps

COPY apps/ai-services/pyproject.toml apps/ai-services/uv.lock* ./apps/ai-services/
WORKDIR /app/apps/ai-services

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

# ============ STAGE 2: app ============
FROM base AS app

WORKDIR /app/apps/ai-services

# Copy venv from deps stage
COPY --from=deps /app/apps/ai-services/.venv .venv

# Copy app code
COPY apps/ai-services/src ./src
COPY apps/ai-services/pyproject.toml ./

ENV PATH="/app/apps/ai-services/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Non-root user
RUN addgroup -S app && adduser -S -G app app \
    && chown -R app:app /app
USER app

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8001/health || exit 1

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "4"]
