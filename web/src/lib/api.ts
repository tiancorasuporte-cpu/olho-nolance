/**
 * Production build: API and media are proxied by the web server under /api and /media on the
 * same origin (works on LAN IP, localhost and behind the Cloudflare Tunnel / HTTPS).
 * Vite dev server: talk to the services directly.
 */
function resolvePublicUrl(envUrl: string | undefined, prefix: string, port: number): string {
  if (!import.meta.env.DEV && typeof window !== "undefined") {
    return `${window.location.origin}${prefix}`;
  }
  return envUrl || `http://localhost:${port}`;
}

export const API_URL = resolvePublicUrl(import.meta.env.VITE_API_URL as string | undefined, "/api", 8000);
export const MEDIA_URL = resolvePublicUrl(import.meta.env.VITE_MEDIA_URL as string | undefined, "/media", 8001);

export type Role = "superadmin" | "admin" | "operator" | "player";

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  operator: "Operador",
  player: "Participante",
};

export type User = {
  id: number;
  username: string;
  name: string;
  email: string | null;
  email_verified: boolean;
  role: Role;
  active: boolean;
  venue_ids: number[];
};

export type Venue = {
  id: number;
  name: string;
  city: string | null;
  description: string | null;
  active: boolean;
  created_at: string;
};

export type Camera = {
  id: number;
  venue_id: number;
  name: string;
  rtsp_url: string;
  status: string;
  buffer_seconds: number;
  active: boolean;
  created_at: string;
  live_url: string | null;
};

export type Clip = {
  id: number;
  camera_id: number;
  venue_id: number;
  triggered_by_user_id: number | null;
  triggered_by_device_id: number | null;
  source: string;
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number;
  file_path: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  download_url: string | null;
  camera_name: string | null;
  venue_name: string | null;
};

export type Device = {
  id: number;
  label: string;
  venue_id: number | null;
  camera_id: number | null;
  token_prefix: string;
  active: boolean;
  created_at: string;
  token?: string | null;
};

export function clipStatusMessage(status: string): string {
  if (status === "processing") return "registrado, gerando o vídeo…";
  if (status === "ready") return "pronto";
  if (status === "failed") return "falhou";
  return status;
}

export type AppSettings = {
  /** 0 = nunca apagar */
  clip_retention_days: number;
};

export type EmailSettings = {
  host: string;
  smtp_port: number;
  imap_port: number;
  username: string;
  from_email: string;
  from_name: string;
  use_ssl: boolean;
  configured: boolean;
  password_set: boolean;
};

export type AdPlacement = "top" | "bottom";

export const AD_PLACEMENT_LABELS: Record<AdPlacement, string> = {
  top: "Faixa superior (1080×240)",
  bottom: "Faixa inferior (patrocinadores)",
};

export type Ad = {
  id: number;
  title: string;
  file_path: string;
  venue_id: number | null;
  camera_id: number | null;
  duration_sec: number;
  placement: AdPlacement;
  sort_order: number;
  active: boolean;
  created_at: string;
  image_url: string | null;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  login: (username: string, password: string) =>
    request<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  register: (body: { name: string; email: string; password: string }) =>
    request<{ message: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  confirmEmail: (body: { email: string; code: string }) =>
    request<{ access_token: string }>("/auth/confirm", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  forgotPassword: (email: string) =>
    request<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (body: { email: string; code: string; password: string }) =>
    request<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  me: () => request<User>("/auth/me"),
  venues: {
    list: () => request<Venue[]>("/venues"),
    create: (body: { name: string; city?: string; description?: string }) =>
      request<Venue>("/venues", { method: "POST", body: JSON.stringify(body) }),
    update: (id: number, body: Partial<Venue>) =>
      request<Venue>(`/venues/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: number) => request<{ ok: boolean }>(`/venues/${id}`, { method: "DELETE" }),
  },
  cameras: {
    list: (venueId?: number) =>
      request<Camera[]>(`/cameras${venueId ? `?venue_id=${venueId}` : ""}`),
    create: (body: {
      venue_id: number;
      name: string;
      rtsp_url: string;
      buffer_seconds?: number;
      start_stream?: boolean;
    }) => request<Camera>("/cameras", { method: "POST", body: JSON.stringify(body) }),
    update: (id: number, body: Partial<Camera>) =>
      request<Camera>(`/cameras/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    start: (id: number) => request<Camera>(`/cameras/${id}/start`, { method: "POST" }),
    stop: (id: number) => request<Camera>(`/cameras/${id}/stop`, { method: "POST" }),
    remove: (id: number) => request<{ ok: boolean }>(`/cameras/${id}`, { method: "DELETE" }),
  },
  clips: {
    list: (params?: Record<string, string | number | undefined>) => {
      const q = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== "") q.set(k, String(v));
        });
      }
      const qs = q.toString();
      return request<Clip[]>(`/clips${qs ? `?${qs}` : ""}`);
    },
    create: (camera_id: number) =>
      request<Clip>("/clips", {
        method: "POST",
        body: JSON.stringify({ camera_id, source: "web" }),
      }),
    downloadUrl: (id: number) => `${API_URL}/clips/${id}/download`,
    videoUrl: (id: number) =>
      `${API_URL}/clips/${id}/video?access_token=${encodeURIComponent(localStorage.getItem("token") || "")}`,
  },
  users: {
    list: () => request<User[]>("/users"),
    create: (body: {
      username: string;
      password: string;
      name: string;
      email?: string;
      role: Role;
      venue_ids?: number[];
    }) => request<User>("/users", { method: "POST", body: JSON.stringify(body) }),
    update: (id: number, body: Partial<User> & { password?: string }) =>
      request<User>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: number) => request<{ ok: boolean }>(`/users/${id}`, { method: "DELETE" }),
  },
  devices: {
    list: () => request<Device[]>("/devices"),
    create: (body: { label: string; venue_id?: number; camera_id?: number }) =>
      request<Device>("/devices", { method: "POST", body: JSON.stringify(body) }),
    revoke: (id: number) => request<{ ok: boolean }>(`/devices/${id}/revoke`, { method: "PATCH" }),
    remove: (id: number) => request<{ ok: boolean }>(`/devices/${id}`, { method: "DELETE" }),
  },
  settings: {
    get: () => request<AppSettings>("/settings"),
    update: (body: AppSettings) =>
      request<AppSettings & { removed_clips: number }>("/settings", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    getEmail: () => request<EmailSettings>("/settings/email"),
    updateEmail: (body: {
      host: string;
      smtp_port: number;
      imap_port: number;
      username: string;
      password?: string;
      from_email: string;
      from_name: string;
      use_ssl: boolean;
    }) =>
      request<EmailSettings>("/settings/email", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    testImap: () =>
      request<{ message: string }>("/settings/email/test-imap", { method: "POST" }),
    testSmtp: () =>
      request<{ message: string }>("/settings/email/test-smtp", { method: "POST" }),
  },
  ads: {
    list: (params?: { active_only?: boolean; venue_id?: number }) => {
      const q = new URLSearchParams();
      if (params?.active_only) q.set("active_only", "true");
      if (params?.venue_id != null) q.set("venue_id", String(params.venue_id));
      const qs = q.toString();
      return request<Ad[]>(`/ads${qs ? `?${qs}` : ""}`);
    },
    create: async (body: {
      title: string;
      file: File;
      duration_sec?: number;
      placement?: AdPlacement;
      venue_id?: number | null;
      camera_id?: number | null;
      sort_order?: number;
    }) => {
      const form = new FormData();
      form.append("title", body.title);
      form.append("file", body.file);
      form.append("duration_sec", String(body.duration_sec ?? 8));
      form.append("placement", body.placement ?? "bottom");
      form.append("sort_order", String(body.sort_order ?? 0));
      if (body.venue_id != null) form.append("venue_id", String(body.venue_id));
      if (body.camera_id != null) form.append("camera_id", String(body.camera_id));
      const res = await fetch(`${API_URL}/ads`, {
        method: "POST",
        headers: { ...authHeaders() },
        body: form,
      });
      if (!res.ok) {
        let detail = res.statusText;
        try {
          const j = await res.json();
          detail = j.detail || JSON.stringify(j);
        } catch {
          /* ignore */
        }
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      return res.json() as Promise<Ad>;
    },
    update: (id: number, body: Partial<Ad>) =>
      request<Ad>(`/ads/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: number) => request<{ ok: boolean }>(`/ads/${id}`, { method: "DELETE" }),
    imageUrl: (id: number) => {
      const token = localStorage.getItem("token");
      // browser <img> can't set Authorization; use query token fallback via fetch blob would be heavier —
      // we serve with auth header via authenticated fetch in slideshow using blob URLs, OR
      // pass token as query for img tags.
      return `${API_URL}/ads/${id}/image?access_token=${encodeURIComponent(token || "")}`;
    },
  },
};

export function liveUrl(camera: Camera): string | null {
  if (!camera.live_url && camera.status !== "streaming") return null;
  const path = camera.live_url || `/live/${camera.id}/stream.ts`;
  return `${MEDIA_URL}${path}`;
}

export function snapshotUrl(camera: Camera): string | null {
  if (!camera.live_url && camera.status !== "streaming") return null;
  return `${MEDIA_URL}/live/${camera.id}/snapshot.jpg`;
}
