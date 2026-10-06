import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.retention import retention_loop
from app.routers import ads, auth, cameras, clips, devices, settings as settings_router, users, venues
from app.schema_bootstrap import ensure_schema
from app.schemas import HealthOut
from app.stream_restore import restore_active_streams, stream_watchdog_loop


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_schema()
    stop = asyncio.Event()
    # give media a moment after compose up
    await asyncio.sleep(2)
    try:
        await restore_active_streams()
    except Exception:
        pass
    tasks = [
        asyncio.create_task(stream_watchdog_loop(stop)),
        asyncio.create_task(retention_loop(stop)),
    ]
    yield
    stop.set()
    for task in tasks:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


settings = get_settings()
app = FastAPI(title="Olho no Lance API", version="1.0.0", lifespan=lifespan)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(venues.router)
app.include_router(cameras.router)
app.include_router(clips.router)
app.include_router(devices.router)
app.include_router(ads.router)
app.include_router(settings_router.router)


@app.get("/health", response_model=HealthOut)
def health():
    return HealthOut(status="ok", service="api")
