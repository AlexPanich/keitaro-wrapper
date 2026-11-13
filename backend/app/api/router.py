from fastapi import APIRouter

from app.api.routes import campaigns, health, keitaro

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(keitaro.router)
api_router.include_router(campaigns.router)
