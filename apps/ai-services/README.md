# CAMPUS AI Services (Python + FastAPI)

> AI/ML microservices for the CAMPUS Smart Campus Platform.
> Called by the Laravel API for AI-heavy operations.

## Stack

- **Python** 3.13+
- **uv** (package manager, NOT poetry/pip)
- **FastAPI** + Uvicorn (async web framework)
- **Pydantic v2** (data validation)
- **structlog** (structured logging)
- **SQLAlchemy** 2.0 async + asyncpg (Postgres)
- **Redis** (cache, queue, pub/sub)

## Planned AI features

| Feature | Module spec | Status |
|---------|-------------|--------|
| **Antiplagiat** | Modul 13 (Phase 2) | placeholder |
| **AI Chatbot** | Modul 27 (Phase 2) | placeholder |
| **Dropout Prediction** | Modul 28 (Phase 2) | placeholder |
| **Face Recognition** | Modul 21 (Phase 2) | placeholder |
| **Sentiment Analysis** | Modul 6 (Phase 1) | TBD |

## Setup

```bash
# 1. Verify Python and uv
python --version    # 3.13+
uv --version

# 2. Install dependencies
uv sync

# 3. Activate venv (or use uv run)
.venv\Scripts\activate     # Windows
source .venv/bin/activate  # macOS/Linux

# 4. Prepare .env
cp .env.example .env

# 5. Run dev server
uv run uvicorn src.main:app --reload --port 8001
# or
fastapi dev src/main.py --port 8001
```

## URLs

- App: http://localhost:8001
- API docs (Swagger): http://localhost:8001/docs
- API docs (Redoc): http://localhost:8001/redoc
- Health: http://localhost:8001/health
- Metrics (Prometheus): http://localhost:8001/metrics

## Testing & quality

```bash
uv run pytest              # Run tests
uv run pytest --cov=src    # With coverage
uv run ruff check src/     # Lint
uv run ruff format src/    # Format
uv run mypy src/           # Type check
```

## Adding optional dependencies

The base install is lean. Add feature-specific deps when implementing the corresponding module:

```bash
# Antiplagiat (modul 13)
uv add sentence-transformers faiss-cpu

# Face recognition (modul 21)
uv add opencv-python face-recognition deepface

# ML / Dropout prediction (modul 28)
uv add scikit-learn pandas numpy matplotlib

# OCR (EDMS modul 4)
uv add pytesseract pillow

# Charts
uv add matplotlib plotly
```

## Folder structure

```
apps/ai-services/
├── src/
│   ├── __init__.py
│   ├── main.py              # FastAPI app entrypoint
│   ├── core/
│   │   ├── config.py        # pydantic-settings
│   │   └── logging.py       # structlog
│   ├── api/v1/              # API endpoints (versioned)
│   │   ├── __init__.py      # Router aggregation
│   │   ├── chatbot.py       # (planned)
│   │   ├── antiplagiat.py   # (planned)
│   │   └── ...
│   ├── services/            # Business logic
│   │   ├── llm/             # OpenAI, Anthropic, Ollama
│   │   ├── nlp/             # Text processing
│   │   ├── vision/          # Computer vision
│   │   └── ml/              # Classical ML models
│   ├── models/              # Pydantic models / DB models
│   └── utils/               # Helpers
├── tests/                   # pytest tests
├── models_data/             # Trained ML artifacts (gitignored)
├── pyproject.toml           # uv-managed deps + tool configs
├── uv.lock                  # Generated lockfile
├── .env.example
└── README.md
```

## Integration with Laravel

The Laravel API at `apps/api` calls these AI services for heavy ML work:

```
[Web/Admin/Mobile] ──> [Laravel API] ──> [AI Services]
                              │             (Python + ML)
                              └──> Returns AI result to client
```

- AI services authenticate Laravel calls via shared internal token (`LARAVEL_INTERNAL_TOKEN`)
- For long-running ML jobs, Laravel queues a job and AI services callback via Redis pub/sub
