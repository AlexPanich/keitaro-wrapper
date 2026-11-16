from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.routing import Match, Mount
from starlette.types import Scope

from app.api.router import api_router
from app.core.config import settings
from app.core.errors import register_error_handlers


class FrontendMount(Mount):
    """Раздача собранного фронта на ``/``, которая не перехватывает пути ``/api``.

    Обычный ``Mount("/")`` полностью совпадает с любым путём и забирает себе, например,
    ``DELETE /api/campaigns``: вместо 405 с ``Allow`` от API ответил бы ``StaticFiles``.
    """

    def matches(self, scope: Scope) -> tuple[Match, Scope]:
        path = scope.get("path", "")
        if path == "/api" or path.startswith("/api/"):
            return Match.NONE, {}
        return super().matches(scope)


def create_app(frontend_dir: Path | None = None) -> FastAPI:
    """Приложение с API под ``/api``; фронт раздаётся, если ``frontend_dir`` существует."""
    app = FastAPI(title="Keitaro Wrapper")
    app.include_router(api_router)
    register_error_handlers(app)
    if frontend_dir is not None and frontend_dir.exists():
        app.router.routes.append(
            FrontendMount("/", app=StaticFiles(directory=frontend_dir, html=True), name="frontend")
        )
    return app


app = create_app(settings.frontend_dir)
