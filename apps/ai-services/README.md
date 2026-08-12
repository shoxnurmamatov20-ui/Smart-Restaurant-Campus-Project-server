# Smart Restaurant Campus — AI Services (Python + FastAPI)

> AI/ML microservices for the Smart Restaurant Campus platform.
> Called by the Laravel API and, through it, by the Telegram bots.

## Stack

- **Python** 3.13+
- **uv** (package manager, NOT poetry/pip)
- **FastAPI** + Uvicorn (async web framework)
- **Pydantic v2** (data validation)
- **structlog** (structured logging)
- **SQLAlchemy** 2.0 async + asyncpg (Postgres)
- **Redis** (cache, queue, pub/sub)

## Endpoints

| Prefix            | Feature                                   | Serves                  | Status      |
| ----------------- | ----------------------------------------- | ----------------------- | ----------- |
| `/api/v1/chatbot` | AI menu assistant — taom tavsiyasi        | `menu_ai` bot, QR menu  | placeholder |
| `/api/v1/demand`  | Talab bashorati + prep-list               | Analytics, xarid rejasi | placeholder |
| `/api/v1/vision`  | Taom tanish, porsiya va gigiyena nazorati | Kitchen, HACCP          | placeholder |
| `/api/v1/reviews` | Mijoz fikrlari tahlili va haftalik digest | CRM, `review_watch` bot | placeholder |
| `/api/v1/face`    | Xodim davomati uchun yuz tanish           | Staff moduli            | placeholder |

Two rules these services follow:

1. **Never invent a dish.** The menu assistant only recommends items passed in
   the request, which Laravel has already filtered by the stop-list. A
   suggestion the kitchen cannot cook is worse than no suggestion.
2. **Face recognition is for staff only.** Guests are identified by phone
   through the loyalty programme; recognising a guest's face without consent is
   both a legal and a trust problem.

## Setup

```bash
# 1. Verify Python and uv
python --version    # 3.13+
uv --version

# 2. Install dependencies
uv sync

# 3. Prepare .env
cp .env.example .env

# 4. Run dev server
uv run uvicorn src.main:app --reload --port 8001
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

The base install is lean. Add feature-specific deps when implementing the
corresponding capability:

```bash
# Demand forecast
uv add scikit-learn lightgbm pandas numpy

# Food vision (plating + hygiene)
uv add opencv-python ultralytics pillow

# Staff face ID
uv add deepface onnxruntime

# Review sentiment (local models instead of an LLM call)
uv add sentence-transformers

# Charts for reports
uv add matplotlib plotly
```

## Folder structure

```
apps/ai-services/
├── src/
│   ├── __init__.py
│   ├── main.py                   # FastAPI app entrypoint
│   ├── core/
│   │   ├── config.py             # pydantic-settings
│   │   └── logging.py            # structlog
│   ├── api/v1/                   # API endpoints (versioned)
│   │   ├── __init__.py           # Router aggregation
│   │   ├── chatbot.py            # AI menu assistant
│   │   ├── demand_forecast.py    # Talab bashorati + prep-list
│   │   ├── food_vision.py        # Taom tanish, plating, gigiyena
│   │   ├── review_sentiment.py   # Fikr tahlili + digest
│   │   └── face_recognition.py   # Xodim davomati
│   ├── services/                 # Business logic
│   │   ├── llm/                  # Anthropic, OpenAI, Ollama
│   │   ├── nlp/                  # Text processing
│   │   ├── vision/               # Computer vision
│   │   └── ml/                   # Classical ML models
│   ├── models/                   # Pydantic models / DB models
│   └── utils/                    # Helpers
├── tests/                        # pytest tests
├── models_data/                  # Trained ML artifacts (gitignored)
├── pyproject.toml                # uv-managed deps + tool configs
├── uv.lock
├── .env.example
└── README.md
```

## Integration with Laravel

The Laravel API at `apps/api` calls these services for heavy ML work:

```
[Web / POS / Telegram bot] ──> [Laravel API] ──> [AI Services]
                                     │              (Python + ML)
                                     └──> Returns the AI result to the client
```

Laravel stays in the middle deliberately: it is the only component that knows
which restaurant a request belongs to, which dishes are sellable right now, and
what the guest is allergic to.

- AI services authenticate Laravel calls via a shared internal token
  (`LARAVEL_INTERNAL_TOKEN`).
- For long-running ML jobs, Laravel queues a job and the AI service calls back
  over Redis pub/sub.
