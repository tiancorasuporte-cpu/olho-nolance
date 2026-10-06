const STORAGE = "olho_pc_camera_keys";

/** cameraId (string) → tecla gravada (ex: "F8", "1", "Space") */
export type CameraHotkeys = Record<string, string>;

export function loadCameraHotkeys(): CameraHotkeys {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as CameraHotkeys;
  } catch {
    return {};
  }
}

export function saveCameraHotkeys(map: CameraHotkeys) {
  localStorage.setItem(STORAGE, JSON.stringify(map));
}

export function keyLabelFromEvent(e: KeyboardEvent): string {
  if (e.code === "Space") return "Space";
  if (e.key === " ") return "Space";
  if (e.key.length === 1) return e.key.toUpperCase();
  return e.key;
}

export function eventMatchesHotkey(e: KeyboardEvent, hotkey: string): boolean {
  if (!hotkey) return false;
  const pressed = keyLabelFromEvent(e);
  if (pressed === hotkey) return true;
  if (hotkey === "Space" && (e.code === "Space" || e.key === " ")) return true;
  return false;
}

/** Find camera id that owns this key (first match). */
export function cameraIdForHotkey(map: CameraHotkeys, e: KeyboardEvent): number | null {
  for (const [id, key] of Object.entries(map)) {
    if (eventMatchesHotkey(e, key)) {
      const n = Number(id);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}
