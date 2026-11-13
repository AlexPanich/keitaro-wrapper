from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import settings
from app.services.keitaro import KeitaroError

app = FastAPI(title="Keitaro Wrapper")
app.include_router(api_router)


@app.exception_handler(KeitaroError)
async def keitaro_error_handler(_: Request, exc: KeitaroError) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": "Keitaro API error", "keitaro": exc.detail})


@app.exception_handler(NotImplementedError)
async def not_implemented_handler(_: Request, __: NotImplementedError) -> JSONResponse:
    return JSONResponse(status_code=501, content={"detail": "Not implemented yet"})


if settings.frontend_dir.exists():
    app.mount("/", StaticFiles(directory=settings.frontend_dir, html=True), name="frontend")
