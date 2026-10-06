"""Vertical (Stories/Status) clip rendering, run in a background queue.

The 30s snapshot is cut synchronously when the button is pressed (the ring buffer
moves on); only the heavy 1080x1920 re-encode is queued. Jobs are persisted as
`{clip_id}.job.json` next to the raw file so they survive a media restart.
"""

import json
import logging
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path
from typing import Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Instagram Stories / WhatsApp Status: 9:16
OUT_W, OUT_H, OUT_FPS = 1080, 1920, 30
TOP_BAR_H = 240
BOTTOM_BAR_H = 360
ACCENT_LINE_H = 6
BAR_PADDING = 16
BAR_COLOR = "0x0a0a0a"
ACCENT_COLOR = "0xff6b00"
WATERMARK_PATH = Path(__file__).parent / "assets" / "watermark.png"
WATERMARK_W = 240
WATERMARK_MARGIN = 24
WATERMARK_OPACITY = 0.75

CPU_ENCODE = [
    "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high", "-level", "4.1",
    "-crf", "21", "-maxrate", "4M", "-bufsize", "8M",
]
NVENC_ENCODE = [
    "-c:v", "h264_nvenc", "-preset", "p4", "-profile:v", "high", "-level", "4.1",
    "-rc", "vbr", "-cq", "23", "-b:v", "3500k", "-maxrate", "4M", "-bufsize", "8M",
]


@lru_cache
def nvenc_available() -> bool:
    if settings.clip_encoder == "cpu":
        return False
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error",
                "-f", "lavfi", "-i", "color=c=black:s=320x240:d=0.2",
                "-c:v", "h264_nvenc", "-f", "null", "-",
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        ok = result.returncode == 0
    except Exception:
        ok = False
    if settings.clip_encoder == "nvenc" and not ok:
        logger.warning("CLIP_ENCODER=nvenc but NVENC is not usable — falling back to CPU")
    return ok


def encoder_name() -> str:
    return "nvenc" if nvenc_available() else "cpu"


def probe_duration(path: Path) -> float:
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(path),
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return float((result.stdout or "").strip() or "0") or 0.0
    except Exception:
        return 0.0


def _ad_file(name: Optional[str]) -> Optional[Path]:
    if not name:
        return None
    candidate = Path(settings.ads_path) / Path(name).name
    return candidate if candidate.is_file() else None


def render_vertical(
    src: Path,
    dest: Path,
    top_path: Optional[Path],
    bottom_paths: list[Path],
    clip_seconds: int,
    use_nvenc: bool,
) -> subprocess.CompletedProcess:
    """1080x1920: [top banner] + video (center crop) + [sponsor bar] + watermark.

    Images are single-frame inputs (no -loop) held with eof_action=repeat — looping
    image inputs made ffmpeg hang.
    """
    available = probe_duration(src) or float(clip_seconds)
    duration = min(available, float(clip_seconds))
    skip = max(available - duration, 0.0)
    W, H = OUT_W, OUT_H
    top_h = TOP_BAR_H if top_path else 0
    bottom_h = BOTTOM_BAR_H if bottom_paths else 0
    video_h = H - top_h - bottom_h

    inputs = ["-ss", f"{skip:.3f}", "-i", str(src)]
    base = (
        f"[0:v]fps={OUT_FPS},scale={W}:{video_h}:force_original_aspect_ratio=increase,"
        f"crop={W}:{video_h},setsar=1,"
        f"pad={W}:{H}:0:{top_h}:color={BAR_COLOR}"
    )
    if bottom_h:
        base += f",drawbox=x=0:y={H - bottom_h}:w={W}:h={ACCENT_LINE_H}:color={ACCENT_COLOR}:t=fill"
    if top_h:
        base += f",drawbox=x=0:y={top_h - ACCENT_LINE_H}:w={W}:h={ACCENT_LINE_H}:color={ACCENT_COLOR}:t=fill"
    chains = [base + "[base]"]

    overlays: list[tuple[int, str, str]] = []
    idx = 1
    if top_path:
        inputs += ["-i", str(top_path)]
        box_h = top_h - ACCENT_LINE_H - 2 * BAR_PADDING
        chains.append(
            f"[{idx}:v]scale={W - 2 * BAR_PADDING}:{box_h}:force_original_aspect_ratio=decrease[img{idx}]"
        )
        overlays.append((idx, "(W-w)/2", f"({top_h - ACCENT_LINE_H}-h)/2"))
        idx += 1
    if bottom_paths:
        slot_w = W // len(bottom_paths)
        bar_y = H - bottom_h + ACCENT_LINE_H
        box_h = bottom_h - ACCENT_LINE_H - 2 * BAR_PADDING
        for i, path in enumerate(bottom_paths):
            inputs += ["-i", str(path)]
            chains.append(
                f"[{idx}:v]scale={slot_w - 2 * BAR_PADDING}:{box_h}:"
                f"force_original_aspect_ratio=decrease[img{idx}]"
            )
            overlays.append((idx, f"{i * slot_w}+({slot_w}-w)/2", f"{bar_y}+({bottom_h - ACCENT_LINE_H}-h)/2"))
            idx += 1
    if WATERMARK_PATH.is_file():
        inputs += ["-i", str(WATERMARK_PATH)]
        chains.append(
            f"[{idx}:v]scale={WATERMARK_W}:-1,format=rgba,colorchannelmixer=aa={WATERMARK_OPACITY}[img{idx}]"
        )
        overlays.append((idx, str(WATERMARK_MARGIN), str(top_h + WATERMARK_MARGIN)))
        idx += 1

    last = "base"
    for n, (img_idx, x, y) in enumerate(overlays):
        out = f"v{n}"
        chains.append(f"[{last}][img{img_idx}]overlay=x={x}:y={y}:eof_action=repeat[{out}]")
        last = out
    chains.append(f"[{last}]format=yuv420p[out]")

    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        *inputs,
        "-filter_complex", ";".join(chains),
        "-map", "[out]",
        *(NVENC_ENCODE if use_nvenc else CPU_ENCODE),
        "-pix_fmt", "yuv420p", "-an",
        "-t", f"{duration:.3f}",
        "-movflags", "+faststart",
        str(dest),
    ]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=300)


class RenderQueue:
    def __init__(self) -> None:
        self._executor: Optional[ThreadPoolExecutor] = None
        self._lock = threading.Lock()
        self._pending = 0

    def _pool(self) -> ThreadPoolExecutor:
        with self._lock:
            if self._executor is None:
                workers = settings.clip_render_workers or (3 if nvenc_available() else 2)
                self._executor = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="render")
                logger.info("Render queue: %s workers, encoder=%s", workers, encoder_name())
            return self._executor

    @property
    def pending(self) -> int:
        return self._pending

    @staticmethod
    def job_path(venue_id: int, clip_id: int) -> Path:
        return Path(settings.videos_path) / str(venue_id) / f"{clip_id}.job.json"

    def submit(self, job: dict) -> None:
        self.job_path(job["venue_id"], job["clip_id"]).write_text(json.dumps(job), encoding="utf-8")
        with self._lock:
            self._pending += 1
        self._pool().submit(self._run, job)

    def recover(self) -> None:
        """Re-queue jobs left behind by a restart."""
        for job_file in Path(settings.videos_path).glob("*/*.job.json"):
            try:
                job = json.loads(job_file.read_text(encoding="utf-8"))
            except Exception:
                job_file.unlink(missing_ok=True)
                continue
            logger.info("Recovering render job clip=%s", job.get("clip_id"))
            with self._lock:
                self._pending += 1
            self._pool().submit(self._run, job)

    def _run(self, job: dict) -> None:
        clip_id, venue_id = job["clip_id"], job["venue_id"]
        out_dir = Path(settings.videos_path) / str(venue_id)
        raw_path = out_dir / f"{clip_id}.raw.mp4"
        out_path = out_dir / f"{clip_id}.mp4"
        status, error = "ready", None
        try:
            if not raw_path.is_file():
                status, error = "failed", "Arquivo bruto do lance não encontrado"
            else:
                top = _ad_file(job.get("top_image"))
                bottom = [p for p in (_ad_file(n) for n in job.get("bottom_images") or []) if p]
                use_nvenc = nvenc_available()
                result = render_vertical(raw_path, out_path, top, bottom, job["duration_sec"], use_nvenc)
                if use_nvenc and result.returncode != 0:
                    logger.warning("NVENC render failed clip=%s, retrying on CPU", clip_id)
                    result = render_vertical(raw_path, out_path, top, bottom, job["duration_sec"], False)
                if result.returncode != 0 or not out_path.is_file():
                    status, error = "failed", (result.stderr or "ffmpeg render failed")[-500:]
        except Exception as exc:
            status, error = "failed", str(exc)
        finally:
            raw_path.unlink(missing_ok=True)
            self.job_path(venue_id, clip_id).unlink(missing_ok=True)
            with self._lock:
                self._pending -= 1

        self._notify(
            clip_id,
            {
                "status": status,
                "file_path": f"{venue_id}/{clip_id}.mp4" if status == "ready" else None,
                "error_message": error,
            },
        )

    def _notify(self, clip_id: int, body: dict) -> None:
        url = f"{settings.api_internal_url}/clips/{clip_id}/status"
        headers = {"X-Internal-Token": settings.media_internal_token}
        for attempt in range(5):
            try:
                r = httpx.patch(url, json=body, headers=headers, timeout=15)
                if r.status_code < 500:
                    if r.status_code >= 400:
                        logger.warning("API rejected status for clip=%s: %s", clip_id, r.text[:200])
                    return
            except Exception as exc:
                logger.warning("Notify API failed clip=%s attempt=%s: %s", clip_id, attempt + 1, exc)
            time.sleep(3 * (attempt + 1))


render_queue = RenderQueue()
