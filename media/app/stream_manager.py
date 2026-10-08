import logging
import queue
import subprocess
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Deque, Optional

from app.clip_queue import render_queue
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Browsers (mpegts.js) and the clip pipeline accept H.264 as delivered by the camera
COPYABLE_CODECS = {"h264"}

SNAPSHOT_TTL_SEC = 4
SNAPSHOT_WIDTH = 640

X264_LIVE = [
    "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency",
    "-profile:v", "main", "-pix_fmt", "yuv420p",
    "-g", "30", "-keyint_min", "30", "-sc_threshold", "0", "-bf", "0",
    "-crf", "23", "-maxrate", "4500k", "-bufsize", "2250k",
]


def probe_codec(rtsp_url: str) -> Optional[str]:
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error", "-rtsp_transport", "tcp",
                "-select_streams", "v:0", "-show_entries", "stream=codec_name",
                "-of", "default=noprint_wrappers=1:nokey=1", rtsp_url,
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )
        codec = (result.stdout or "").strip().splitlines()
        return codec[0].lower() if codec else None
    except Exception:
        return None


@dataclass
class StreamWorker:
    camera_id: int
    rtsp_url: str
    buffer_seconds: int = 30
    process: Optional[subprocess.Popen] = None
    started_at: Optional[datetime] = None
    status: str = "idle"
    error: Optional[str] = None
    mode: str = "unknown"  # copy | transcode
    codec: Optional[str] = None
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)
    _stop: threading.Event = field(default_factory=threading.Event, repr=False)
    _reader: Optional[threading.Thread] = field(default=None, repr=False)
    _watchdog: Optional[threading.Thread] = field(default=None, repr=False)
    _clients: list = field(default_factory=list, repr=False)
    _clients_lock: threading.Lock = field(default_factory=threading.Lock, repr=False)
    _recent: Deque[bytes] = field(default_factory=lambda: deque(maxlen=256), repr=False)
    _err_file: Optional[object] = field(default=None, repr=False)
    _snapshot: Optional[bytes] = field(default=None, repr=False)
    _snapshot_at: float = field(default=0.0, repr=False)
    _snapshot_lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    @property
    def buffer_dir(self) -> Path:
        return Path(settings.buffers_path) / str(self.camera_id)

    @property
    def ring_dir(self) -> Path:
        return self.buffer_dir / "ring"

    def start(self) -> None:
        with self._lock:
            self._stop_threads()
            self._stop = threading.Event()
            self._start_ffmpeg_locked()
            self._reader = threading.Thread(
                target=self._read_loop, name=f"ts-cam-{self.camera_id}", daemon=True
            )
            self._reader.start()
            self._watchdog = threading.Thread(
                target=self._watch_loop, name=f"watch-cam-{self.camera_id}", daemon=True
            )
            self._watchdog.start()

    def _stop_threads(self) -> None:
        self._stop.set()
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
        self.process = None
        if self._err_file is not None:
            try:
                self._err_file.close()
            except Exception:
                pass
            self._err_file = None
        if self._reader and self._reader.is_alive():
            self._reader.join(timeout=2)
        if self._watchdog and self._watchdog.is_alive():
            self._watchdog.join(timeout=2)

    def _video_args(self) -> list[str]:
        if settings.stream_mode == "transcode":
            self.mode = "transcode"
        elif settings.stream_mode == "copy":
            self.mode = "copy"
        else:
            if self.codec is None:
                self.codec = probe_codec(self.rtsp_url)
            # Unknown codec (probe failed): try copy; ffmpeg restarts if the camera is unreachable
            self.mode = "copy" if self.codec in COPYABLE_CODECS or self.codec is None else "transcode"
        return ["-c:v", "copy"] if self.mode == "copy" else X264_LIVE

    def _start_ffmpeg_locked(self) -> None:
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()

        self.buffer_dir.mkdir(parents=True, exist_ok=True)
        self.ring_dir.mkdir(parents=True, exist_ok=True)
        for p in self.ring_dir.glob("*"):
            try:
                p.unlink()
            except OSError:
                pass

        video = self._video_args()
        wrap = max(self.buffer_seconds + 10, 40)
        ring = str(self.ring_dir / "seg_%03d.ts")
        # One encode feeds both outputs via tee: live MPEG-TS on stdout + ring buffer
        # segments (cut on keyframes; ~1s with transcode, camera GOP with copy).
        tee = (
            "[f=mpegts:onfail=ignore]pipe\\:1|"
            f"[f=segment:segment_time=1:segment_wrap={wrap}:reset_timestamps=1]{ring}"
        )
        cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-rtsp_transport", "tcp",
            "-fflags", "nobuffer+genpts+discardcorrupt",
            "-flags", "low_delay",
            "-i", self.rtsp_url,
            "-map", "0:v:0", "-an", *video,
            "-f", "tee", tee,
        ]
        # Log ffmpeg errors to a file (stderr PIPE freezes the process)
        err_log = self.buffer_dir / "ffmpeg.log"
        self._err_file = open(err_log, "wb")
        self.process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=self._err_file,
            bufsize=0,
        )
        self.started_at = datetime.now(timezone.utc)
        self.status = "streaming"
        self.error = None
        self._recent.clear()
        logger.info(
            "Started stream camera=%s pid=%s mode=%s codec=%s",
            self.camera_id, self.process.pid, self.mode, self.codec,
        )

    def _broadcast(self, chunk: bytes) -> None:
        self._recent.append(chunk)
        with self._clients_lock:
            dead = []
            for q in self._clients:
                try:
                    q.put_nowait(chunk)
                except queue.Full:
                    try:
                        q.get_nowait()
                    except queue.Empty:
                        pass
                    try:
                        q.put_nowait(chunk)
                    except queue.Full:
                        dead.append(q)
            for q in dead:
                if q in self._clients:
                    self._clients.remove(q)

    def _read_loop(self) -> None:
        assert self.process and self.process.stdout
        try:
            while not self._stop.is_set():
                chunk = self.process.stdout.read(188 * 32)
                if not chunk:
                    break
                self._broadcast(chunk)
        except Exception:
            logger.exception("read loop ended camera=%s", self.camera_id)

    def _watch_loop(self) -> None:
        while not self._stop.wait(4):
            alive = self.process is not None and self.process.poll() is None
            if not alive:
                logger.warning("ffmpeg died camera=%s — restarting", self.camera_id)
                with self._lock:
                    if self._stop.is_set():
                        break
                    try:
                        self._start_ffmpeg_locked()
                        if not self._reader or not self._reader.is_alive():
                            self._reader = threading.Thread(
                                target=self._read_loop,
                                name=f"ts-cam-{self.camera_id}",
                                daemon=True,
                            )
                            self._reader.start()
                    except Exception as exc:
                        self.status = "error"
                        self.error = str(exc)

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=64)
        for chunk in list(self._recent):
            try:
                q.put_nowait(chunk)
            except queue.Full:
                break
        with self._clients_lock:
            self._clients.append(q)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self._clients_lock:
            if q in self._clients:
                self._clients.remove(q)

    def stop(self) -> None:
        with self._lock:
            self._stop_threads()
            self.status = "idle"
            with self._clients_lock:
                self._clients.clear()

    def is_alive(self) -> bool:
        return bool(self.process and self.process.poll() is None)

    def snapshot(self) -> Optional[bytes]:
        """Small JPEG of the latest buffered keyframe, cached so many viewers cost one decode."""
        with self._snapshot_lock:
            if self._snapshot and time.time() - self._snapshot_at < SNAPSHOT_TTL_SEC:
                return self._snapshot
            segments = sorted(self.ring_dir.glob("seg_*.ts"), key=lambda p: p.stat().st_mtime)
            # The newest segment is still being written; segments start on a keyframe
            source = segments[-2] if len(segments) >= 2 else (segments[-1] if segments else None)
            if source is None:
                return self._snapshot
            try:
                result = subprocess.run(
                    [
                        "ffmpeg", "-hide_banner", "-loglevel", "error",
                        "-i", str(source), "-frames:v", "1",
                        "-vf", f"scale={SNAPSHOT_WIDTH}:-2", "-q:v", "6",
                        "-f", "image2", "-c:v", "mjpeg", "pipe:1",
                    ],
                    capture_output=True,
                    timeout=10,
                )
                if result.returncode == 0 and result.stdout:
                    self._snapshot, self._snapshot_at = result.stdout, time.time()
            except Exception:
                logger.warning("snapshot failed camera=%s", self.camera_id)
            return self._snapshot

    def _select_segments(self, duration_sec: int) -> list[Path]:
        """Segments covering the last `duration_sec` (by mtime = segment end time)."""
        segments = sorted(self.ring_dir.glob("seg_*.ts"), key=lambda p: p.stat().st_mtime)
        if not segments:
            return []
        cutoff = time.time() - duration_sec - 1
        first = 0
        for i, seg in enumerate(segments):
            if seg.stat().st_mtime >= cutoff:
                first = i
                break
        else:
            first = len(segments) - 1
        return segments[first:]

    def extract_clip(
        self,
        clip_id: int,
        venue_id: int,
        duration_sec: int,
        top_image: Optional[str] = None,
        bottom_images: Optional[list[str]] = None,
    ) -> dict:
        """Snapshot the buffer now (fast stream copy) and queue the vertical render."""
        ended_at = datetime.now(timezone.utc)
        started_at = ended_at - timedelta(seconds=duration_sec)
        times = {"started_at": started_at.isoformat(), "ended_at": ended_at.isoformat()}
        out_dir = Path(settings.videos_path) / str(venue_id)
        out_dir.mkdir(parents=True, exist_ok=True)
        raw_path = out_dir / f"{clip_id}.raw.mp4"

        selected = self._select_segments(duration_sec)
        if not selected:
            return {
                "status": "failed",
                "error": "No buffer segments available yet — aguarde alguns segundos com a câmera ao vivo",
                "file_path": None,
                **times,
            }

        concat_list = self.buffer_dir / f"concat_{clip_id}.txt"
        with concat_list.open("w", encoding="utf-8") as f:
            for seg in selected:
                escaped = str(seg).replace("\\", "/").replace("'", "'\\''")
                f.write(f"file '{escaped}'\n")

        concat_cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "concat", "-safe", "0", "-i", str(concat_list),
            "-c", "copy", "-movflags", "+faststart",
            str(raw_path),
        ]
        try:
            result = subprocess.run(concat_cmd, capture_output=True, text=True, timeout=60)
        except Exception as exc:
            raw_path.unlink(missing_ok=True)
            return {"status": "failed", "error": str(exc), "file_path": None, **times}
        finally:
            concat_list.unlink(missing_ok=True)

        if result.returncode != 0 or not raw_path.is_file():
            raw_path.unlink(missing_ok=True)
            return {
                "status": "failed",
                "error": (result.stderr or "ffmpeg concat failed")[-500:],
                "file_path": None,
                **times,
            }

        render_queue.submit(
            {
                "clip_id": clip_id,
                "venue_id": venue_id,
                "duration_sec": duration_sec,
                "top_image": top_image,
                "bottom_images": bottom_images or [],
            }
        )
        return {"status": "processing", "file_path": None, "queue": render_queue.pending, **times}


class StreamManager:
    def __init__(self) -> None:
        self._workers: dict[int, StreamWorker] = {}
        self._lock = threading.Lock()

    def start(self, camera_id: int, rtsp_url: str, buffer_seconds: int = 30) -> StreamWorker:
        with self._lock:
            existing = self._workers.get(camera_id)
            if existing and existing.is_alive() and existing.rtsp_url == rtsp_url:
                return existing
            if existing:
                existing.stop()
            worker = StreamWorker(
                camera_id=camera_id,
                rtsp_url=rtsp_url,
                buffer_seconds=buffer_seconds,
            )
            worker.start()
            self._workers[camera_id] = worker
            return worker

    def stop(self, camera_id: int) -> None:
        with self._lock:
            worker = self._workers.pop(camera_id, None)
        if worker:
            worker.stop()

    def get(self, camera_id: int) -> Optional[StreamWorker]:
        return self._workers.get(camera_id)

    def all(self) -> list[StreamWorker]:
        return list(self._workers.values())

    def extract_clip(
        self,
        camera_id: int,
        clip_id: int,
        venue_id: int,
        duration_sec: int,
        top_image: Optional[str] = None,
        bottom_images: Optional[list[str]] = None,
    ) -> dict:
        worker = self.get(camera_id)
        if not worker:
            return {"status": "failed", "error": "Camera stream not running", "file_path": None}
        return worker.extract_clip(
            clip_id, venue_id, duration_sec, top_image=top_image, bottom_images=bottom_images
        )


manager = StreamManager()
