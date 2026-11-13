from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://keitaro:keitaro@localhost:5432/keitaro_wrapper"

    keitaro_base_url: str = ""
    keitaro_api_key: str = ""
    keitaro_timeout: float = 15.0

    keitaro_default_domain_id: int | None = None
    keitaro_default_group_id: int | None = None
    keitaro_default_traffic_source_id: int | None = None

    fallback_redirect_url: str = "https://www.google.com"

    frontend_dir: Path = ROOT_DIR / "frontend"


settings = Settings()
