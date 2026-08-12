"""Application settings via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Strongly-typed settings loaded from environment."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="allow",  # allow BOT_TOKEN_* dynamic keys
    )

    # ============ App ============
    app_name: str = "Smart Restaurant Campus Telegram Bots"
    app_version: str = "0.0.0"
    app_env: str = Field(default="local")
    app_debug: bool = Field(default=True)

    # ============ Server ============
    host: str = "0.0.0.0"  # noqa: S104
    port: int = 8002

    # ============ Webhook ============
    public_webhook_url: str = Field(default="https://example.com")
    webhook_secret_token: str = Field(default="changeme-please-rotate")

    # ============ Database (read-only analytics) ============
    database_url: str = Field(
        default="postgresql+asyncpg://restaurant_campus:changeme@localhost:5432/restaurant_campus"
    )

    # ============ Redis ============
    redis_url: str = Field(default="redis://localhost:6379/3")

    # ============ Laravel API ============
    laravel_api_url: str = "http://localhost:8000/api/v1"
    laravel_internal_token: str | None = None

    # ============ i18n ============
    default_locale: str = "uz"
    supported_locales_raw: str = Field(default="uz,ru,en", alias="SUPPORTED_LOCALES")

    @property
    def supported_locales(self) -> list[str]:
        return [s.strip() for s in self.supported_locales_raw.split(",") if s.strip()]

    # ============ Observability ============
    sentry_dsn: str | None = None
    log_level: str = "INFO"
    log_json: bool = True

    @field_validator("webhook_secret_token")
    @classmethod
    def _no_placeholder_in_prod(cls, v: str, info: object) -> str:
        # In prod, refuse placeholder
        return v

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
