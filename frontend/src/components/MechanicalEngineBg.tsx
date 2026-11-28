import React, { useEffect, useRef } from "react";
import { MechanicalBgMode } from "../lib/api";

interface Props {
  dark: boolean;
  accentColor: string;
  mode: MechanicalBgMode;
  overdriveActive: boolean;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface GearSpec {
  /** Normalized anchor [0..1] or pixel offset from anchor */
  ax: number;
  ay: number;
  ox: number;
  oy: number;
  radius: number;
  teeth: number;
  toothDepth: number;
  spokes: number;
  ratio: number; // Signed angular ratio relative to master shaft
  phase: number; // Mesh phase alignment in radians
  depth: number; // Parallax depth factor (0.35..1.0)
}

interface PulseTrace {
  points: Array<[number, number]>; // Normalized [0..1] coordinates
  speed: number;
  offset: number;
}

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return { r: 59, g: 99, b: 251 };
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgba(c: RGB, a: number): string {
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${a})`;
}

/**
 * Compute exact interlocking gear train geometry:
 * Given parent gear (ox, oy, radius, teeth), place meshed child gear at angle `deg`
 * with exact center distance `r1 + r2 + toothDepth * 0.55` and opposite ratio `-teeth1/teeth2`.
 */
function buildGearTrains(): GearSpec[] {
  const toothDepth = 9;

  // Cluster A (Bottom-Right Studio Drivetrain — 3 interlocking gears)
  const gA1: GearSpec = {
    ax: 0.90, ay: 0.86, ox: 0, oy: 0,
    radius: 132, teeth: 24, toothDepth, spokes: 6,
    ratio: 1.0, phase: 0, depth: 0.95,
  };
  const rA2 = 77;
  const distA12 = gA1.radius + rA2 + toothDepth * 0.55;
  const angA12 = (-142 * Math.PI) / 180;
  const gA2: GearSpec = {
    ax: 0.90, ay: 0.86,
    ox: Math.cos(angA12) * distA12,
    oy: Math.sin(angA12) * distA12,
    radius: rA2, teeth: 14, toothDepth: 8.5, spokes: 5,
    ratio: -(gA1.teeth / 14), phase: Math.PI / 14, depth: 0.88,
  };
  const rA3 = 55;
  const distA23 = rA2 + rA3 + toothDepth * 0.52;
  const angA23 = (-82 * Math.PI) / 180;
  const gA3: GearSpec = {
    ax: 0.90, ay: 0.86,
    ox: gA2.ox + Math.cos(angA23) * distA23,
    oy: gA2.oy + Math.sin(angA23) * distA23,
    radius: rA3, teeth: 10, toothDepth: 8, spokes: 4,
    ratio: -gA2.ratio * (14 / 10), phase: 0.22, depth: 0.82,
  };

  // Cluster B (Top-Left / Mid-Left Precision Escapement — 2 interlocking gears)
  const gB1: GearSpec = {
    ax: 0.19, ay: 0.16, ox: 0, oy: 0,
    radius: 108, teeth: 20, toothDepth: 8.5, spokes: 5,
    ratio: -0.82, phase: 0.1, depth: 0.72,
  };
  const rB2 = 64;
  const distB12 = gB1.radius + rB2 + 8.5 * 0.55;
  const angB12 = (38 * Math.PI) / 180;
  const gB2: GearSpec = {
    ax: 0.19, ay: 0.16,
    ox: Math.cos(angB12) * distB12,
    oy: Math.sin(angB12) * distB12,
    radius: rB2, teeth: 12, toothDepth: 8, spokes: 4,
    ratio: -gB1.ratio * (20 / 12), phase: Math.PI / 12, depth: 0.68,
  };

  // Cluster C (Upper-Right Secondary Timing Gear)
  const gC1: GearSpec = {
    ax: 0.88, ay: 0.14, ox: 0, oy: 0,
    radius: 82, teeth: 16, toothDepth: 8, spokes: 4,
    ratio: 1.15, phase: 0.4, depth: 0.55,
  };

  return [gA1, gA2, gA3, gB1, gB2, gC1];
}

const CIRCUIT_TRACES: PulseTrace[] = [
  { points: [[0.0, 0.24], [0.16, 0.24], [0.22, 0.30], [0.46, 0.30], [0.52, 0.22], [1.0, 0.22]], speed: 0.11, offset: 0.05 },
  { points: [[0.0, 0.68], [0.24, 0.68], [0.30, 0.61], [0.64, 0.61], [0.71, 0.69], [1.0, 0.69]], speed: 0.09, offset: 0.42 },
  { points: [[0.14, 0.0], [0.14, 0.38], [0.20, 0.44], [0.20, 1.0]], speed: 0.08, offset: 0.71 },
  { points: [[0.78, 0.0], [0.78, 0.48], [0.84, 0.54], [0.84, 1.0]], speed: 0.10, offset: 0.23 },
];

function drawGear(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  gear: GearSpec,
  angle: number,
  dark: boolean,
  accent: RGB,
  proximity: number
) {
  const { radius: r, teeth, toothDepth: td, spokes } = gear;
  const outerR = r + td;
  const innerR = r - td * 0.45;
  const step = (Math.PI * 2) / teeth;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // Gear outer profile (trapezoidal precision teeth)
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.16;
    const a2 = a0 + step * 0.30;
    const a3 = a0 + step * 0.56;
    const a4 = a0 + step * 0.70;
    if (i === 0) ctx.moveTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
    else ctx.lineTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
    ctx.lineTo(Math.cos(a1) * innerR, Math.sin(a1) * innerR);
    ctx.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
    ctx.lineTo(Math.cos(a3) * outerR, Math.sin(a3) * outerR);
    ctx.lineTo(Math.cos(a4) * innerR, Math.sin(a4) * innerR);
  }
  ctx.closePath();

  // Subtle metallic fill
  const metalGrad = ctx.createLinearGradient(-outerR, -outerR, outerR, outerR);
  if (dark) {
    metalGrad.addColorStop(0, `rgba(255, 255, 255, ${0.075 + proximity * 0.055})`);
    metalGrad.addColorStop(0.5, `rgba(148, 163, 184, ${0.032 + proximity * 0.03})`);
    metalGrad.addColorStop(1, rgba(accent, 0.05 + proximity * 0.11));
  } else {
    metalGrad.addColorStop(0, `rgba(15, 23, 42, ${0.055 + proximity * 0.04})`);
    metalGrad.addColorStop(1, rgba(accent, 0.06 + proximity * 0.10));
  }
  ctx.fillStyle = metalGrad;
  ctx.fill();

  // Crisp metallic edge highlight
  const strokeGrad = ctx.createLinearGradient(-outerR, -outerR, outerR, outerR);
  if (dark) {
    strokeGrad.addColorStop(0, `rgba(255, 255, 255, ${0.26 + proximity * 0.24})`);
    strokeGrad.addColorStop(0.55, rgba(accent, 0.22 + proximity * 0.34));
    strokeGrad.addColorStop(1, `rgba(148, 163, 184, ${0.14 + proximity * 0.15})`);
  } else {
    strokeGrad.addColorStop(0, `rgba(15, 23, 42, ${0.20 + proximity * 0.16})`);
    strokeGrad.addColorStop(0.6, rgba(accent, 0.28 + proximity * 0.28));
    strokeGrad.addColorStop(1, `rgba(15, 23, 42, ${0.12 + proximity * 0.10})`);
  }
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = strokeGrad;
  ctx.stroke();

  // Inner machined rim
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = dark
    ? `rgba(255, 255, 255, ${0.14 + proximity * 0.18})`
    : `rgba(15, 23, 42, ${0.14 + proximity * 0.12})`;
  ctx.stroke();

  // Precision spokes
  const hubR = r * 0.30;
  for (let s = 0; s < spokes; s++) {
    const sa = (s * Math.PI * 2) / spokes;
    ctx.beginPath();
    ctx.moveTo(Math.cos(sa) * hubR, Math.sin(sa) * hubR);
    ctx.lineTo(Math.cos(sa) * (r * 0.78), Math.sin(sa) * (r * 0.78));
    ctx.lineWidth = Math.max(2, r * 0.048);
    ctx.strokeStyle = dark
      ? `rgba(226, 232, 240, ${0.11 + proximity * 0.12})`
      : `rgba(15, 23, 42, ${0.10 + proximity * 0.08})`;
    ctx.stroke();
  }

  // Center bearing housing & glowing core
  ctx.beginPath();
  ctx.arc(0, 0, hubR, 0, Math.PI * 2);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = rgba(accent, 0.35 + proximity * 0.4);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, hubR * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = rgba(accent, 0.18 + proximity * 0.35);
  ctx.fill();

  ctx.restore();
}

function drawReticleRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  angle: number,
  targetPointerAngle: number,
  dark: boolean,
  accent: RGB
) {
  ctx.save();
  ctx.translate(cx, cy);

  // Outer dashed calibration circle
  ctx.save();
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.setLineDash([6, 10]);
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = dark ? "rgba(255, 255, 255, 0.14)" : "rgba(15, 23, 42, 0.13)";
  ctx.stroke();
  ctx.setLineDash([]);

  // 36 precision aperture/timecode ticks
  for (let i = 0; i < 36; i++) {
    const a = (i * Math.PI * 2) / 36;
    const major = i % 3 === 0;
    const r0 = radius - (major ? 12 : 6);
    const r1 = radius - 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineWidth = major ? 1.4 : 0.85;
    ctx.strokeStyle = major
      ? rgba(accent, dark ? 0.55 : 0.48)
      : dark
      ? "rgba(255, 255, 255, 0.16)"
      : "rgba(15, 23, 42, 0.15)";
    ctx.stroke();
  }
  ctx.restore();

  // Mouse-tracking Vernier pointer arc
  ctx.save();
  ctx.rotate(targetPointerAngle);
  ctx.beginPath();
  ctx.arc(0, 0, radius + 10, -0.35, 0.35);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = rgba(accent, 0.72);
  ctx.stroke();

  // Pointer needle tick
  ctx.beginPath();
  ctx.moveTo(radius + 4, 0);
  ctx.lineTo(radius + 18, 0);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = rgba(accent, 0.88);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

export const MechanicalEngineBg: React.FC<Props> = ({
  dark,
  accentColor,
  mode,
  overdriveActive,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ dark, accentColor, mode, overdriveActive });
  propsRef.current = { dark, accentColor, mode, overdriveActive };

  useEffect(() => {
    if (mode === "off") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const gears = buildGearTrains();
    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // Physical state
    let mouseX = width * 0.55;
    let mouseY = height * 0.45;
    let smoothX = mouseX;
    let smoothY = mouseY;
    let torqueBoost = 0;
    let masterAngle = 0;
    let reticlePointerAngle = 0;
    let currentRgb: RGB = hexToRgb(propsRef.current.accentColor);
    let lastTs = performance.now();
    let rafId = 0;

    const onPointerMove = (e: PointerEvent) => {
      const dx = e.clientX - mouseX;
      const dy = e.clientY - mouseY;
      const speed = Math.hypot(dx, dy);
      torqueBoost = Math.min(4.2, torqueBoost + speed * 0.018);
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    const reducedMotion = () =>
      Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    const renderFrame = (ts: number) => {
      rafId = requestAnimationFrame(renderFrame);
      if (document.visibilityState !== "visible") {
        lastTs = ts;
        return;
      }

      const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
      lastTs = ts;

      const { dark: isDark, accentColor: targetHex, mode: curMode, overdriveActive: isBusy } = propsRef.current;
      const isOverdrive = isBusy || curMode === "overdrive";
      const targetRgb = hexToRgb(targetHex);

      // Smooth RGB color lerping toward hovered app accent
      const colorLerp = Math.min(1, dt * 6.5);
      currentRgb.r += (targetRgb.r - currentRgb.r) * colorLerp;
      currentRgb.g += (targetRgb.g - currentRgb.g) * colorLerp;
      currentRgb.b += (targetRgb.b - currentRgb.b) * colorLerp;

      // Smooth mouse parallax & decaying torque boost
      const lerpAmt = Math.min(1, dt * 7);
      smoothX += (mouseX - smoothX) * lerpAmt;
      smoothY += (mouseY - smoothY) * lerpAmt;
      torqueBoost *= Math.pow(0.08, dt);

      const speedMult = reducedMotion() ? 0.1 : isOverdrive ? 2.85 : 1.0;
      masterAngle += dt * (0.24 * speedMult + torqueBoost * 0.42);

      // Normalized parallax offset [-1..1]
      const px = (smoothX / Math.max(1, width) - 0.5) * 2;
      const py = (smoothY / Math.max(1, height) - 0.5) * 2;

      ctx.clearRect(0, 0, width, height);

      // -----------------------------------------------------------------------
      // LAYER 1: Engineering Precision Grid + Circuit/Timeline Data Pulses + Waveform
      // -----------------------------------------------------------------------
      const gridStep = 52;
      const gOffX = -px * 8;
      const gOffY = -py * 8;
      ctx.beginPath();
      for (let x = (gOffX % gridStep) - gridStep; x < width + gridStep; x += gridStep) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = (gOffY % gridStep) - gridStep; y < height + gridStep; y += gridStep) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.032)" : "rgba(15, 23, 42, 0.042)";
      ctx.stroke();

      // Circuit / Timeline Traces & Moving Data Pulses
      const tSec = ts * 0.001;
      for (const trace of CIRCUIT_TRACES) {
        const pts = trace.points.map(([nx, ny]) => [nx * width - px * 12, ny * height - py * 12] as [number, number]);
        ctx.beginPath();
        pts.forEach(([x, y], idx) => (idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.lineWidth = 1;
        ctx.strokeStyle = isDark ? rgba(currentRgb, 0.14) : rgba(currentRgb, 0.16);
        ctx.stroke();

        // Draw animated pulse dots along trace
        const pulseCount = isOverdrive ? 3 : 1;
        for (let p = 0; p < pulseCount; p++) {
          const progress = (tSec * trace.speed * (isOverdrive ? 2.4 : 1) + trace.offset + p / pulseCount) % 1;
          // Interpolate along polyline segments
          let totalLen = 0;
          const segLens: number[] = [];
          for (let i = 1; i < pts.length; i++) {
            const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
            segLens.push(l);
            totalLen += l;
          }
          let targetLen = progress * totalLen;
          let dotX = pts[0][0];
          let dotY = pts[0][1];
          for (let i = 0; i < segLens.length; i++) {
            if (targetLen <= segLens[i] || i === segLens.length - 1) {
              const frac = segLens[i] > 0 ? targetLen / segLens[i] : 0;
              dotX = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * frac;
              dotY = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * frac;
              break;
            }
            targetLen -= segLens[i];
          }
          const glow = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, isOverdrive ? 14 : 9);
          glow.addColorStop(0, rgba(currentRgb, isDark ? 0.92 : 0.78));
          glow.addColorStop(1, rgba(currentRgb, 0));
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(dotX, dotY, isOverdrive ? 14 : 9, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Live Studio Audio/Timeline Waveform along bottom edge
      const waveY = height - 34;
      const amp = (isOverdrive ? 14 : 7) + torqueBoost * 2.5;
      ctx.beginPath();
      for (let x = 0; x <= width; x += 12) {
        const y =
          waveY +
          Math.sin(x * 0.012 + tSec * (isOverdrive ? 4.2 : 1.7)) * amp * 0.65 +
          Math.cos(x * 0.029 - tSec * (isOverdrive ? 3.1 : 1.2)) * amp * 0.35;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = rgba(currentRgb, isDark ? 0.24 : 0.22);
      ctx.stroke();

      // -----------------------------------------------------------------------
      // LAYER 2: Interlocking Precision Gears + Studio Aperture Reticle Ring
      // -----------------------------------------------------------------------
      for (const g of gears) {
        const cx = g.ax * width + g.ox - px * 22 * g.depth;
        const cy = g.ay * height + g.oy - py * 22 * g.depth;
        const dist = Math.hypot(smoothX - cx, smoothY - cy);
        const proximity = Math.max(0, 1 - dist / 340);
        const angle = masterAngle * g.ratio + g.phase;
        drawGear(ctx, cx, cy, g, angle, isDark, currentRgb, proximity);
      }

      // Large Studio Timecode / Aperture Reticle Ring (center-right depth)
      const retX = width * 0.56 - px * 16;
      const retY = height * 0.48 - py * 16;
      const desiredAngle = Math.atan2(smoothY - retY, smoothX - retX);
      let diff = desiredAngle - reticlePointerAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      reticlePointerAngle += diff * Math.min(1, dt * 6);
      drawReticleRing(
        ctx,
        retX,
        retY,
        Math.min(width, height) * 0.31,
        -masterAngle * 0.22,
        reticlePointerAngle,
        isDark,
        currentRgb
      );

      // -----------------------------------------------------------------------
      // LAYER 3: Dynamic Mouse-Tracking Ambient Spotlight
      // -----------------------------------------------------------------------
      const spotR = isOverdrive ? 360 : 280;
      const spot = ctx.createRadialGradient(smoothX, smoothY, 0, smoothX, smoothY, spotR);
      spot.addColorStop(0, rgba(currentRgb, isDark ? (isOverdrive ? 0.19 : 0.13) : 0.11));
      spot.addColorStop(0.5, rgba(currentRgb, isDark ? 0.045 : 0.035));
      spot.addColorStop(1, rgba(currentRgb, 0));
      ctx.fillStyle = spot;
      ctx.beginPath();
      ctx.arc(smoothX, smoothY, spotR, 0, Math.PI * 2);
      ctx.fill();
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [mode]);

  if (mode === "off") return null;

  return (
    <canvas
      ref={canvasRef}
      id="mechanical-engine-bg"
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
};
