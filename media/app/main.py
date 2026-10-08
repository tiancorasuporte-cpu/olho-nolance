import asyncio
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from app.clip_queue import encoder_name, render_queue
from app.config import get_settings
from app.stream_manager import manager

settings = get_settings()
app = FastAPI(title="Olho no Lance Media", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_internal(x_internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token")):
    if x_internal_token != settings.media_internal_token:
        raise HTTPException(status_code=401, detail="Invalid internal token")


class StartStreamIn(BaseModel):
    camera_id: int
    rtsp_url: str
    buffer_seconds: int = 30


class StopStreamIn(BaseModel):
    camera_id: int


class ClipIn(BaseModel):
    camera_id: int
    clip_id: int
    duration_sec: int = 30
    venue_id: int
    # Relative filenames under ADS_PATH (e.g. "abc123.png")
    top_image: Optional[str] = None
    bottom_images: list[str] = []


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "media",
        "clip_encoder": encoder_name(),
        "render_queue": render_queue.pending,
        "streams": {w.camera_id: {"mode": w.mode, "codec": w.codec} for w in manager.all()},
    }


@app.on_event("startup")
def recover_render_jobs():
    render_queue.recover()


@app.post("/internal/streams/start")
def start_stream(body: StartStreamIn, _: None = Depends(require_internal)):
    try:
        worker = manager.start(body.camera_id, body.rtsp_url, body.buffer_seconds)
        return {
            "camera_id": body.camera_id,
            "status": worker.status,
            "live_path": f"/live/{body.camera_id}/stream.ts",
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/internal/streams/stop")
def stop_stream(body: StopStreamIn, _: None = Depends(require_internal)):
    manager.stop(body.camera_id)
    return {"camera_id": body.camera_id, "status": "idle"}


@app.get("/internal/streams/{camera_id}")
def stream_status(camera_id: int, _: None = Depends(require_internal)):
    worker = manager.get(camera_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Stream not found")
    return {
        "camera_id": camera_id,
        "status": worker.status if worker.is_alive() else "idle",
        "error": worker.error,
        "mode": worker.mode,
        "codec": worker.codec,
        "live_path": f"/live/{camera_id}/stream.ts",
    }


@app.post("/internal/clip")
def create_clip(body: ClipIn, _: None = Depends(require_internal)):
    return manager.extract_clip(
        body.camera_id,
        body.clip_id,
        body.venue_id,
        body.duration_sec,
        top_image=body.top_image,
        bottom_images=body.bottom_images,
    )


@app.get("/live/{camera_id}/status")
def live_status(camera_id: int):
    worker = manager.get(camera_id)
    running = bool(worker and worker.is_alive())
    return {
        "camera_id": camera_id,
        "running": running,
        "status": worker.status if worker else "idle",
        "error": worker.error if worker else None,
    }


@app.get("/live/{camera_id}/snapshot.jpg")
async def live_snapshot(camera_id: int):
    worker = manager.get(camera_id)
    if not worker or not worker.is_alive():
        raise HTTPException(status_code=404, detail="Stream not running")
    image = await asyncio.to_thread(worker.snapshot)
    if not image:
        raise HTTPException(status_code=503, detail="Snapshot not available yet")
    return Response(
        content=image,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"},
    )


@app.get("/live/{camera_id}/stream.ts")
async def live_mpegts(camera_id: int, request: Request):
    worker = manager.get(camera_id)
    if not worker or not worker.is_alive():
        raise HTTPException(status_code=404, detail="Stream not running")

    q = worker.subscribe()

    async def generate():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    chunk = await asyncio.to_thread(q.get, True, 10)
                except Exception:
                    continue
                if chunk:
                    yield chunk
        finally:
            worker.unsubscribe(q)

    return StreamingResponse(
        generate(),
        media_type="video/mp2t",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


Path(settings.buffers_path).mkdir(parents=True, exist_ok=True)
Path(settings.videos_path).mkdir(parents=True, exist_ok=True)
Path(settings.ads_path).mkdir(parents=True, exist_ok=True)
