"""Application configuration via pydantic-settings."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ============ App ============
    app_name: str = "Smart Restaurant Campus AI Services"
    app_version: str = "0.0.0"
    app_env: str = Field(default="local")          # local | staging | production
    app_debug: bool = Field(default=True)

    # ============ Server ============
    host: str = "0.0.0.0"  # noqa: S104  # container-bound
    port: int = 8001

    # ============ CORS ============
    cors_allowed_origins: list[str] = Field(
        default=["http://localhost:3000", "http://localhost:3001"]
    )

    # ============ Database ============
    database_url: str = Field(
        default="postgresql+asyncpg://restaurant_campus:changeme@localhost:5432/restaurant_campus"
    )

    # ============ Redis ============
    redis_url: str = Field(default="redis://localhost:6379/2")

    # ============ AI providers ============
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    ai_default_model: str = "claude-sonnet-4-6"
    ai_fallback_model: str = "gpt-4o-mini"

    # ============ Laravel API (for callbacks) ============
    laravel_api_url: str = "http://localhost:8000/api/v1"
    laravel_internal_token: str | None = None

    # ============ Observability ============
    sentry_dsn: str | None = None
    log_level: str = "INFO"
    log_json: bool = True

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()


settings = get_settings()
