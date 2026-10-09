import { useEffect, useRef } from "react";

type V = { x: number; y: number };
type Pose = Record<string, V>;

// Footballer striking the ball, normalized to the art box (x right, y down).
const POSE_A: Pose = {
  head: { x: 0.47, y: 0.17 },
  neck: { x: 0.46, y: 0.25 },
  shL: { x: 0.415, y: 0.285 },
  shR: { x: 0.505, y: 0.275 },
  hipL: { x: 0.405, y: 0.53 },
  hipR: { x: 0.465, y: 0.525 },
  elL: { x: 0.33, y: 0.31 },
  haL: { x: 0.25, y: 0.25 },
  elR: { x: 0.575, y: 0.355 },
  haR: { x: 0.635, y: 0.3 },
  knL: { x: 0.38, y: 0.69 },
  anL: { x: 0.355, y: 0.865 },
  toL: { x: 0.415, y: 0.885 },
  knR: { x: 0.5, y: 0.68 },
  anR: { x: 0.45, y: 0.82 },
  toR: { x: 0.49, y: 0.85 },
};

const POSE_B: Pose = {
  ...POSE_A,
  head: { x: 0.475, y: 0.175 },
  elL: { x: 0.32, y: 0.33 },
  haL: { x: 0.24, y: 0.28 },
  elR: { x: 0.58, y: 0.34 },
  haR: { x: 0.65, y: 0.27 },
  knR: { x: 0.56, y: 0.63 },
  anR: { x: 0.67, y: 0.72 },
  toR: { x: 0.72, y: 0.7 },
};

const BALL = { x: 0.775, y: 0.69, r: 0.05 };

const LIMBS: [string, string, number][] = [
  ["neck", "head", 0.012],
  ["shL", "elL", 0.018],
  ["elL", "haL", 0.014],
  ["shR", "elR", 0.018],
  ["elR", "haR", 0.014],
  ["hipL", "knL", 0.028],
  ["knL", "anL", 0.02],
  ["anL", "toL", 0.01],
  ["hipR", "knR", 0.028],
  ["knR", "anR", 0.02],
  ["anR", "toR", 0.01],
];

type Pt =
  | { kind: "limb"; a: string; b: string; t: number; off: number; ph: number; big: boolean }
  | { kind: "torso"; u: number; v: number; ph: number; big: boolean }
  | { kind: "head"; ang: number; rad: number; ph: number; big: boolean }
  | { kind: "ball"; ang: number; rad: number; ph: number; big: boolean };

function rnd(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function buildPoints(): Pt[] {
  const pts: Pt[] = [];
  const big = () => Math.random() < 0.14;
  for (const [a, b, thick] of LIMBS) {
    const n = Math.round(14 + thick * 500);
    for (let i = 0; i < n; i++) {
      pts.push({ kind: "limb", a, b, t: Math.random(), off: rnd(-thick, thick), ph: rnd(0, 6.28), big: big() });
    }
  }
  for (let i = 0; i < 70; i++) pts.push({ kind: "torso", u: Math.random(), v: Math.random(), ph: rnd(0, 6.28), big: big() });
  for (let i = 0; i < 28; i++)
    pts.push({ kind: "head", ang: rnd(0, 6.28), rad: Math.sqrt(Math.random()), ph: rnd(0, 6.28), big: big() });
  for (let i = 0; i < 34; i++)
    pts.push({ kind: "ball", ang: rnd(0, 6.28), rad: i < 20 ? 1 : Math.sqrt(Math.random()), ph: rnd(0, 6.28), big: big() });
  return pts;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Animated low-poly "plexus" athlete in the theme orange. */
export function SportsArt({ style }: { style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const pts = buildPoints();
    const streaks = Array.from({ length: 16 }, () => ({
      y0: rnd(0.12, 0.9),
      y1: rnd(0.3, 0.75),
      bend: rnd(-0.15, 0.15),
      t: Math.random(),
      speed: rnd(0.0025, 0.006),
    }));
    const dust = Array.from({ length: 46 }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: rnd(0.0003, 0.0012),
      r: rnd(0.6, 1.8),
      ph: rnd(0, 6.28),
    }));

    let w = 0;
    let h = 0;
    let raf = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Fit a 1.35:1 art box centered in the canvas.
    const box = () => {
      const bw = Math.min(w, h * 1.35);
      const bh = bw / 1.35;
      return { ox: (w - bw) / 2, oy: (h - bh) / 2, bw, bh };
    };

    const draw = (time: number) => {
      const s = time / 1000;
      const { ox, oy, bw, bh } = box();
      const P = (v: V) => ({ x: ox + v.x * bw, y: oy + v.y * bh });
      const k = reduced ? 0.5 : (1 - Math.cos(s * 1.6)) / 2;
      const ease = k * k * (3 - 2 * k);
      const pose: Record<string, V> = {};
      for (const key of Object.keys(POSE_A)) {
        pose[key] = P({ x: lerp(POSE_A[key].x, POSE_B[key].x, ease), y: lerp(POSE_A[key].y, POSE_B[key].y, ease) });
      }
      const ballC = P({ x: BALL.x + ease * 0.012, y: BALL.y - ease * 0.01 });
      const ballR = BALL.r * bw;
      const ballSpin = s * 0.8;

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      // Speed streaks flowing into the athlete
      for (const st of streaks) {
        if (!reduced) st.t = (st.t + st.speed) % 1;
        const a = { x: ox - bw * 0.05, y: oy + st.y0 * bh };
        const b = { x: ox + bw * 0.42, y: oy + st.y1 * bh };
        const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + st.bend * bh };
        ctx.strokeStyle = "rgba(255,107,0,0.10)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
        ctx.stroke();
        const t = st.t;
        const px = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x;
        const py = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y;
        glow(ctx, px, py, 2.2, 0.9 * Math.sin(t * Math.PI));
      }

      // Ball trail arcs
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = `rgba(255,140,40,${0.16 - i * 0.03})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(ballC.x - ballR * (1.6 + i * 0.5), ballC.y + ballR * 0.2, ballR * (1.2 + i * 0.45), -0.9, 0.5);
        ctx.stroke();
      }

      // Plexus points
      const pos: { x: number; y: number; big: boolean }[] = [];
      const torsoAt = (u: number, v: number) => {
        const top = { x: lerp(pose.shL.x, pose.shR.x, u), y: lerp(pose.shL.y, pose.shR.y, u) };
        const bot = { x: lerp(pose.hipL.x, pose.hipR.x, u), y: lerp(pose.hipL.y, pose.hipR.y, u) };
        const bulge = Math.sin(v * Math.PI) * 0.03 * bw * (u - 0.5);
        return { x: lerp(top.x, bot.x, v) + bulge, y: lerp(top.y, bot.y, v) };
      };
      for (const p of pts) {
        const wob = reduced ? 0 : Math.sin(s * 1.3 + p.ph) * 1.6;
        let x = 0;
        let y = 0;
        if (p.kind === "limb") {
          const a = pose[p.a];
          const b = pose[p.b];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          x = a.x + dx * p.t - (dy / len) * p.off * bw;
          y = a.y + dy * p.t + (dx / len) * p.off * bw;
        } else if (p.kind === "torso") {
          ({ x, y } = torsoAt(p.u, p.v));
        } else if (p.kind === "head") {
          const r = 0.042 * bw * p.rad;
          x = pose.head.x + Math.cos(p.ang) * r;
          y = pose.head.y + Math.sin(p.ang) * r * 1.15;
        } else {
          const r = ballR * p.rad;
          x = ballC.x + Math.cos(p.ang + ballSpin) * r;
          y = ballC.y + Math.sin(p.ang + ballSpin) * r;
        }
        pos.push({ x: x + wob, y: y + wob * 0.6, big: p.big });
      }

      const maxD = bw * 0.055;
      const maxD2 = maxD * maxD;
      ctx.lineWidth = 0.7;
      for (let i = 0; i < pos.length; i++) {
        const a = pos[i];
        for (let j = i + 1; j < pos.length; j++) {
          const b = pos[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > maxD2) continue;
          const alpha = 0.32 * (1 - d2 / maxD2);
          ctx.strokeStyle = `rgba(255,120,20,${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      for (const p of pos) {
        if (p.big) glow(ctx, p.x, p.y, 3.2, 0.95);
        else {
          ctx.fillStyle = "rgba(255,170,90,0.85)";
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Drifting dust
      for (const d of dust) {
        if (!reduced) {
          d.x += d.vx;
          if (d.x > 1.05) {
            d.x = -0.05;
            d.y = Math.random();
          }
        }
        const tw = 0.35 + 0.35 * Math.sin(s * 2 + d.ph);
        glow(ctx, d.x * w, d.y * h, d.r, tw);
      }

      // Floor glow
      const fy = oy + bh * 0.93;
      const g = ctx.createLinearGradient(ox, 0, ox + bw, 0);
      g.addColorStop(0, "rgba(255,107,0,0)");
      g.addColorStop(0.5, "rgba(255,120,20,0.55)");
      g.addColorStop(1, "rgba(255,107,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(ox, fy, bw, 2);

      ctx.globalCompositeOperation = "source-over";
      if (!reduced) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden style={{ width: "100%", height: "100%", display: "block", ...style }} />;
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number) {
  if (alpha <= 0.02) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
  g.addColorStop(0, `rgba(255,190,120,${alpha})`);
  g.addColorStop(0.25, `rgba(255,120,20,${alpha * 0.55})`);
  g.addColorStop(1, "rgba(255,107,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 5, 0, Math.PI * 2);
  ctx.fill();
}
