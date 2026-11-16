from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://keitaro:keitaro@localhost:5432/keitaro_wrapper"

    keitaro_base_url: str = ""
    keitaro_api_key: str = ""

    keitaro_default_domain_id: int | None = None
    keitaro_default_group_id: int | None = None
    keitaro_default_traffic_source_id: int | None = None

    @field_validator(
        "keitaro_default_domain_id",
        "keitaro_default_group_id",
        "keitaro_default_traffic_source_id",
        mode="before",
    )
    @classmethod
    def _empty_id_is_none(cls, value: object) -> object:
        """Пустой ``KEITARO_DEFAULT_*_ID=`` в .env — «не выбрано»."""
        if isinstance(value, str) and not value.strip():
            return None
        return value

    fallback_redirect_url: str = "https://www.google.com"

    frontend_dir: Path = ROOT_DIR / "frontend" / "dist"


settings = Settings()
