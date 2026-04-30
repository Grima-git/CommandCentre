"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { SummaryResponse } from "@/app/api/renewals/summary/route";
import type { CallsSummaryResponse } from "@/app/api/calls/summary/route";
import type { HrSummaryResponse } from "@/app/api/hr/summary/route";

type OdinState = "idle" | "thinking" | "speaking";
type PendingSms = { toName?: string; to?: string; message: string };
type AddContactCommand = { name: string; phone: string };
type StatsSmsCommand = { toName: string; kind: "renewals" | "calls"; period: "today" | "week" | "month" | "ytd" };
type QuickAnswerIntent = {
  kind: "hr_off_today" | "hr_pending_leave" | "hr_summary" | "renewals" | "calls";
  period: "today" | "week" | "month" | "ytd";
};
type OdinAction =
  | ({ type: "sms" } & PendingSms)
  | ({ type: "stats_sms" } & StatsSmsCommand)
  | { type: "followup_sms"; toName: string }
  | { type: "answer"; answer: string };

const STARTERS = [
  "How are renewals performing today?",
  "Which advisor is leading this week?",
  "What's our finance penetration rate?",
  "Flag any urgent renewals coming up",
];

// ── Colour palettes per state (RGB tuples for smooth interpolation) ────────────
type RGB = [number, number, number];
interface Palette {
  branchA: RGB; branchMid: RGB; branchB: RGB;
  nodeWhite: RGB; nodeMid: RGB; nodeOuter: RGB;
  coreMid: RGB; coreOuter: RGB;
  pulseMid: RGB; pulseOuter: RGB;
  dust: RGB; atmo: RGB;
  speedMult: number; spawnRate: number;
}
const PALETTES: Record<OdinState, Palette> = {
  idle: {
    branchA: [100,245,255], branchMid: [117,118,255], branchB: [219,77,255],
    nodeWhite: [240,255,255], nodeMid: [125,247,255], nodeOuter: [143,82,255],
    coreMid: [125,247,255], coreOuter: [143,82,255],
    pulseMid: [125,247,255], pulseOuter: [143,82,255],
    dust: [155,108,255], atmo: [110,130,255],
    speedMult: 1, spawnRate: 0.48,
  },
  thinking: {
    branchA: [251,191,36], branchMid: [249,115,22], branchB: [239,68,68],
    nodeWhite: [255,245,200], nodeMid: [253,230,138], nodeOuter: [249,115,22],
    coreMid: [253,230,138], coreOuter: [249,115,22],
    pulseMid: [253,230,138], pulseOuter: [249,115,22],
    dust: [251,191,36], atmo: [249,115,22],
    speedMult: 2.8, spawnRate: 0.9,
  },
  speaking: {
    branchA: [52,211,153], branchMid: [6,182,212], branchB: [52,211,153],
    nodeWhite: [200,255,240], nodeMid: [52,211,153], nodeOuter: [6,182,212],
    coreMid: [52,211,153], coreOuter: [6,182,212],
    pulseMid: [52,211,153], pulseOuter: [6,182,212],
    dust: [52,211,153], atmo: [6,182,212],
    speedMult: 1.8, spawnRate: 0.65,
  },
};

// Helpers for interpolated palettes
function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t, a[2] + (b[2]-a[2])*t];
}
function lerpPalette(a: Palette, b: Palette, t: number): Palette {
  return {
    branchA:  lerpRGB(a.branchA,  b.branchA,  t), branchMid: lerpRGB(a.branchMid, b.branchMid, t), branchB:   lerpRGB(a.branchB,   b.branchB,   t),
    nodeWhite:lerpRGB(a.nodeWhite,b.nodeWhite, t), nodeMid:   lerpRGB(a.nodeMid,   b.nodeMid,   t), nodeOuter: lerpRGB(a.nodeOuter, b.nodeOuter, t),
    coreMid:  lerpRGB(a.coreMid,  b.coreMid,  t), coreOuter: lerpRGB(a.coreOuter, b.coreOuter, t),
    pulseMid: lerpRGB(a.pulseMid, b.pulseMid, t), pulseOuter:lerpRGB(a.pulseOuter,b.pulseOuter,t),
    dust:     lerpRGB(a.dust,     b.dust,     t), atmo:      lerpRGB(a.atmo,      b.atmo,      t),
    speedMult: a.speedMult + (b.speedMult - a.speedMult) * t,
    spawnRate: a.spawnRate + (b.spawnRate - a.spawnRate) * t,
  };
}
function rgba(c: RGB, a: number) { return `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`; }

// ── Canvas node/branch types ───────────────────────────────────────────────────
interface NNode { x:number; y:number; ox:number; oy:number; vx:number; vy:number; angle:number; ring:number; parent:NNode|null; size:number; glow:number; phase:number; pulse:number; }
interface NBranch { from:NNode; to:NNode; strength:number; width:number; alpha:number; phase:number; current:number; hueMix:number; cross?:boolean; }
interface NPulse { branch:NBranch; t:number; dir:number; speed:number; size:number; life:number; }
interface NDust { angle:number; r:number; size:number; alpha:number; phase:number; drift:number; }

// ── Neural canvas hook ─────────────────────────────────────────────────────────
function useNeuralCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  stateRef: React.RefObject<OdinState>,
) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    let nodes: NNode[] = [], branches: NBranch[] = [], pulses: NPulse[] = [], dust: NDust[] = [];
    let animId = 0, lastTime = 0;
    let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 0;

    const rand = (a: number, b: number) => Math.random() * (b - a) + a;
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    // Smoothly interpolated palette — updated each frame toward target state
    let activePal: Palette = { ...PALETTES.idle };
    const pal = () => activePal;

    function makeNode(angle: number, ring: number, parent: NNode | null = null): NNode {
      const org = Math.sin(angle * 3.2) * 0.035 + Math.sin(angle * 7.1) * 0.018;
      const r = R * clamp(ring + org + rand(-0.025, 0.025), 0.02, 1.08);
      const x = cx + Math.cos(angle) * r, y = cy + Math.sin(angle) * r;
      return { x, y, ox: x, oy: y, vx: 0, vy: 0, angle, ring, parent, size: rand(1.05, 2.9) * (1.25 - ring * 0.35), glow: rand(0.45, 1.05), phase: rand(0, Math.PI * 2), pulse: 0 };
    }

    function buildNetwork() {
      nodes = []; branches = []; pulses = []; dust = [];
      const core: NNode = { x: cx, y: cy, ox: cx, oy: cy, vx: 0, vy: 0, angle: 0, ring: 0, parent: null, size: 4.4, glow: 1.2, phase: 0, pulse: 0 };
      nodes.push(core);

      for (let s = 0; s < 42; s++) {
        const armAngle = (Math.PI * 2 * s) / 42 + rand(-0.045, 0.045);
        let prev = core, angle = armAngle;
        const steps = Math.floor(rand(6, 10));
        for (let i = 1; i <= steps; i++) {
          const ring = i / steps;
          angle += rand(-0.065, 0.065) * (0.45 + ring);
          const node = makeNode(angle, ring, prev);
          nodes.push(node);
          branches.push({ from: prev, to: node, strength: rand(0.45, 1), width: rand(0.45, 1.35) * (1.2 - ring * 0.3), alpha: rand(0.18, 0.48) * (1.08 - ring * 0.18), phase: rand(0, Math.PI * 2), current: 0, hueMix: rand(0, 1) });
          prev = node;
          if (i > 2 && Math.random() < (ring < 0.85 ? 0.58 : 0.34)) {
            let sp = prev, sa = angle + rand(-0.48, 0.48);
            for (let j = 0; j < Math.floor(rand(1, 4)); j++) {
              const sr = clamp(ring + (j + 1) * rand(0.055, 0.12), 0, 1.08);
              sa += rand(-0.11, 0.11);
              const side = makeNode(sa, sr, sp);
              nodes.push(side);
              branches.push({ from: sp, to: side, strength: rand(0.25, 0.75), width: rand(0.32, 0.95) * (1.16 - sr * 0.38), alpha: rand(0.12, 0.34), phase: rand(0, Math.PI * 2), current: 0, hueMix: rand(0, 1) });
              sp = side;
            }
          }
        }
      }

      const outer = nodes.filter(n => n.ring > 0.34);
      for (let i = 0; i < outer.length; i++) {
        for (let j = i + 1; j < outer.length; j++) {
          const a = outer[i], b = outer[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const ad = Math.abs(Math.atan2(Math.sin(a.angle - b.angle), Math.cos(a.angle - b.angle)));
          if (dist < R * 0.16 && ad < 0.32 && Math.random() < 0.16)
            branches.push({ from: a, to: b, strength: rand(0.12, 0.38), width: rand(0.18, 0.62), alpha: rand(0.045, 0.16), phase: rand(0, Math.PI * 2), current: 0, hueMix: rand(0, 1), cross: true });
        }
      }

      for (let i = 0; i < 140; i++) {
        const a = rand(0, Math.PI * 2), r = R * Math.sqrt(Math.random()) * 1.12;
        dust.push({ angle: a, r, size: rand(0.3, 1.25), alpha: rand(0.04, 0.32), phase: rand(0, Math.PI * 2), drift: rand(-0.00022, 0.00022) });
      }
    }

    function updatePhysics(time: number, dt: number) {
      const breathe = Math.sin(time * 0.0012) * 0.5 + 0.5;
      for (const n of nodes) {
        if (n.ring === 0) { n.x = cx + Math.sin(time * 0.0019) * 1.5; n.y = cy + Math.cos(time * 0.0013) * 1.5; n.pulse *= 0.92; continue; }
        const sw = Math.sin(n.phase + time * (0.00055 + n.ring * 0.00022)) * (1.2 + n.ring * 4.6);
        const bp = Math.sin(time * 0.0011 + n.phase) * (0.6 + n.ring * 2.4);
        const tx = n.ox + Math.cos(n.angle + Math.PI / 2) * sw + Math.cos(n.angle) * bp * (0.4 + breathe * 0.35);
        const ty = n.oy + Math.sin(n.angle + Math.PI / 2) * sw + Math.sin(n.angle) * bp * (0.4 + breathe * 0.35);
        n.vx = (n.vx + (tx - n.x) * 0.018) * 0.86; n.vy = (n.vy + (ty - n.y) * 0.018) * 0.86;
        n.x += n.vx * dt * 0.06; n.y += n.vy * dt * 0.06; n.pulse *= 0.91;
      }
      for (const b of branches) b.current *= 0.86;
    }

    function ptOn(b: NBranch, t: number) {
      const dx = b.to.x - b.from.x, dy = b.to.y - b.from.y, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const sag = (b.cross ? 4 : 10) * Math.sin(Math.PI * t) * Math.sin(b.phase);
      const wig = Math.sin(t * Math.PI * 2 + b.phase) * (b.cross ? 0.8 : 1.9);
      return { x: lerp(b.from.x, b.to.x, t) + nx * (sag + wig), y: lerp(b.from.y, b.to.y, t) + ny * (sag + wig) };
    }

    function drawBranch(b: NBranch) {
      const p = pal(), e = b.current, al = b.alpha + e * 0.58, w = b.width + e * 1.45;
      const p1 = ptOn(b, 0.33), p2 = ptOn(b, 0.66);
      const g = ctx.createLinearGradient(b.from.x, b.from.y, b.to.x, b.to.y);
      g.addColorStop(0, rgba(p.branchA, al * 0.85)); g.addColorStop(0.48, rgba(p.branchMid, al)); g.addColorStop(1, rgba(p.branchB, al * 0.78));
      ctx.save();
      ctx.beginPath(); ctx.moveTo(b.from.x, b.from.y); ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, b.to.x, b.to.y);
      ctx.strokeStyle = g; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.shadowColor = e > 0.08 ? rgba(p.nodeMid, 0.9) : rgba(p.nodeOuter, 0.42); ctx.shadowBlur = 4 + e * 16;
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 0.38 + e * 0.62; ctx.lineWidth = Math.max(0.32, w * 0.32);
      ctx.strokeStyle = rgba(p.nodeWhite, 0.28 + e * 0.5); ctx.stroke();
      ctx.restore();
    }

    function spawnPulse() {
      const p = pal();
      const live = branches.filter(b => !b.cross || Math.random() < 0.35);
      const br = live[Math.floor(rand(0, live.length))]; if (!br) return;
      const rev = Math.random() < 0.24;
      pulses.push({ branch: br, t: rev ? 1 : 0, dir: rev ? -1 : 1, speed: rand(0.0045, 0.012) * p.speedMult, size: rand(1.2, 2.8), life: 1 });
    }

    function drawPulse(pulse: NPulse) {
      const p = pal(), pt = ptOn(pulse.branch, pulse.t), gs = pulse.size * (8 + pulse.life * 5);
      const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, gs);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * pulse.life})`); g.addColorStop(0.18, rgba(p.pulseMid, 0.9 * pulse.life)); g.addColorStop(0.48, rgba(p.pulseOuter, 0.48 * pulse.life)); g.addColorStop(1, rgba(p.pulseOuter, 0));
      ctx.save(); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pt.x, pt.y, gs, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.95 * pulse.life})`; ctx.beginPath(); ctx.arc(pt.x, pt.y, pulse.size, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    function updatePulses() {
      const p = pal();
      if (Math.random() < p.spawnRate) spawnPulse();
      for (const pulse of pulses) {
        pulse.t += pulse.speed * pulse.dir;
        pulse.life = clamp(pulse.dir > 0 ? 1 - Math.max(0, pulse.t - 0.82) / 0.18 : 1 - Math.max(0, 0.18 - pulse.t) / 0.18, 0, 1);
        pulse.branch.current = Math.max(pulse.branch.current, 1 - Math.abs(pulse.t - 0.5) * 1.3);
        pulse.branch.from.pulse = Math.max(pulse.branch.from.pulse, pulse.branch.current * 0.55);
        pulse.branch.to.pulse = Math.max(pulse.branch.to.pulse, pulse.branch.current * 0.9);
      }
      pulses = pulses.filter(pl => pl.t >= -0.02 && pl.t <= 1.02 && pl.life > 0.02);
    }

    function drawNode(n: NNode, time: number) {
      const p = pal();
      const flicker = 0.62 + Math.sin(time * 0.0024 + n.phase) * 0.22 + Math.sin(time * 0.0061 + n.phase) * 0.08;
      const al = clamp(n.glow * flicker + n.pulse * 0.8, 0, 1.35), sz = n.size * (1 + n.pulse * 0.5);
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, sz * 8.5);
      g.addColorStop(0, `rgba(255,255,255,${0.88 * al})`); g.addColorStop(0.2, rgba(p.nodeMid, 0.65 * al)); g.addColorStop(0.55, rgba(p.nodeOuter, 0.26 * al)); g.addColorStop(1, rgba(p.nodeOuter, 0));
      ctx.save(); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, sz * 8.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(p.nodeWhite, 0.65 + n.pulse * 0.35); ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(0.6, sz * 0.72), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    function drawCore(time: number) {
      const p = pal();
      const beat = 0.5 + Math.sin(time * 0.0032) * 0.5, beat2 = 0.5 + Math.sin(time * 0.0073 + 1.8) * 0.5;
      const cR = R * (0.038 + beat * 0.006 + beat2 * 0.003);
      ctx.save(); ctx.translate(cx + Math.sin(time * 0.0019) * 1.5, cy + Math.cos(time * 0.0013) * 1.5);
      for (let i = 4; i >= 1; i--) {
        const r = cR * i * 2.3, g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, `rgba(255,255,255,${0.08 / i})`); g.addColorStop(0.25, rgba(p.coreMid, 0.12 / i)); g.addColorStop(0.62, rgba(p.coreOuter, 0.08 / i)); g.addColorStop(1, rgba(p.coreOuter, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      }
      const plasma = ctx.createRadialGradient(0, 0, 0, 0, 0, cR * 1.25);
      plasma.addColorStop(0, "rgba(255,255,255,1)"); plasma.addColorStop(0.22, rgba(p.nodeWhite, 0.95)); plasma.addColorStop(0.48, rgba(p.coreMid, 0.72)); plasma.addColorStop(0.78, rgba(p.coreOuter, 0.34)); plasma.addColorStop(1, rgba(p.coreOuter, 0));
      ctx.fillStyle = plasma; ctx.beginPath();
      for (let i = 0; i <= 44; i++) {
        const a = (Math.PI * 2 * i) / 44;
        const rip = 1 + Math.sin(a * 5 + time * 0.004) * 0.08 + Math.sin(a * 9 - time * 0.003) * 0.045;
        const r = cR * rip;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill(); ctx.restore();
    }

    function drawAtmosphere(time: number) {
      const p = pal();
      ctx.clearRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.25);
      glow.addColorStop(0, rgba(p.coreMid, 0.055)); glow.addColorStop(0.4, rgba(p.nodeOuter, 0.03)); glow.addColorStop(0.72, rgba(p.coreOuter, 0.018)); glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(time * 0.00006);
      for (let i = 0; i < 7; i++) {
        ctx.beginPath(); ctx.arc(0, 0, R * (0.36 + i * 0.105), 0, Math.PI * 2);
        ctx.strokeStyle = rgba(p.atmo, 0.028 + i * 0.009); ctx.lineWidth = i % 2 ? 0.7 : 1;
        ctx.setLineDash([18 + i * 8, 28 + i * 12]); ctx.lineDashOffset = -time * (0.012 + i * 0.004); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.restore();
      for (const d of dust) {
        d.angle += d.drift;
        const x = cx + Math.cos(d.angle) * d.r, y = cy + Math.sin(d.angle) * d.r;
        const twinkle = 0.45 + Math.sin(time * 0.0015 + d.phase) * 0.35;
        ctx.fillStyle = rgba(p.dust, d.alpha * twinkle); ctx.beginPath(); ctx.arc(x, y, d.size, 0, Math.PI * 2); ctx.fill();
      }
    }

    function resize() {
      if (!canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2; cy = H / 2; R = Math.min(W, H) * 0.42;
      buildNetwork();
    }

    function animate(time: number) {
      const dt = Math.min(32, time - lastTime || 16); lastTime = time;
      // Lerp activePal toward the target palette — ~700ms time constant for smooth 1-2s transition
      const lerpT = 1 - Math.exp(-dt / 700);
      activePal = lerpPalette(activePal, PALETTES[stateRef.current ?? "idle"], lerpT);
      updatePhysics(time, dt); updatePulses(); drawAtmosphere(time);
      const sorted = branches.slice().sort((a, b) => a.cross === b.cross ? a.alpha - b.alpha : a.cross ? -1 : 1);
      for (const b of sorted) drawBranch(b);
      for (const pulse of pulses) drawPulse(pulse);
      for (const n of nodes) drawNode(n, time);
      drawCore(time);
      animId = requestAnimationFrame(animate);
    }

    resize();
    animId = requestAnimationFrame(animate);
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ── Main component ─────────────────────────────────────────────────────────────
export function OdinInterface({ userName }: { userName: string }) {
  const [odinState, setOdinState] = useState<OdinState>("idle");
  const [input, setInput] = useState("");
  const [response, setResponse] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [stats, setStats] = useState<SummaryResponse | null>(null);
  const [showStarters, setShowStarters] = useState(true);
  const [pendingSms, setPendingSms] = useState<PendingSms | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<OdinState>("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { stateRef.current = odinState; }, [odinState]);
  useNeuralCanvas(canvasRef, stateRef);

  useEffect(() => {
    fetch("/api/renewals/summary?period=today")
      .then((r) => r.json())
      .then((d) => d.ok && setStats(d as SummaryResponse))
      .catch(() => {});
  }, []);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    const addContact = parseAddContactCommand(text);
    if (addContact) {
      await saveContact(addContact);
      return;
    }

    const quickAnswer = parseQuickAnswerIntent(text);
    if (quickAnswer) {
      await answerQuickly(quickAnswer);
      return;
    }

    const parsedAction = await parseServerAction(text);
    if (parsedAction?.type === "answer") {
      setInput("");
      setShowStarters(false);
      setPendingSms(null);
      setResponse(parsedAction.answer);
      setOdinState("idle");
      inputRef.current?.focus();
      return;
    }
    if (parsedAction?.type === "sms") {
      setInput("");
      setShowStarters(false);
      const smsDraft = { toName: parsedAction.toName, to: parsedAction.to, message: parsedAction.message };
      setPendingSms(smsDraft);
      setResponse(`Ready to text ${smsDraft.toName ?? smsDraft.to}: "${smsDraft.message}"`);
      return;
    }
    if (parsedAction?.type === "followup_sms") {
      setInput("");
      setShowStarters(false);
      const message = response.trim();
      if (!message || pendingSms) {
        setResponse("Give me the message to send, or ask for stats first.");
        return;
      }
      setPendingSms({ toName: parsedAction.toName, message });
      setResponse(`Ready to text ${parsedAction.toName}: "${message}"`);
      return;
    }

    const statsSms = parsedAction?.type === "stats_sms" ? parsedAction : parseStatsSmsCommand(text);
    if (statsSms) {
      await prepareStatsSms(statsSms);
      return;
    }

    const sms = parseSmsCommand(text);
    if (sms) {
      setInput("");
      setShowStarters(false);
      setPendingSms(sms);
      setResponse(`Ready to text ${sms.toName ?? sms.to}: "${sms.message}"`);
      return;
    }
    setInput(""); setShowStarters(false); setStreaming(true); setOdinState("thinking"); setResponse("");
    try {
      const res = await fetch("/api/ai-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: text.trim() }],
          mode: "lean",
          odinState,
        }),
      });
      if (!res.ok || !res.body) throw new Error("Request failed");
      setOdinState("speaking");
      const reader = res.body.getReader(), decoder = new TextDecoder();
      let buffer = "", full = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6); if (payload === "[DONE]") break;
          try { const { text: t } = JSON.parse(payload); if (t) { full += t; setResponse(full); } } catch { /* skip */ }
        }
      }
    } catch { setResponse("I'm having trouble reaching the data source. Please try again."); }
    finally { setStreaming(false); setOdinState("idle"); inputRef.current?.focus(); }
  }

  async function parseServerAction(text: string): Promise<OdinAction | null> {
    try {
      const res = await fetch("/api/odin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = (await res.json()) as { ok?: boolean; action?: OdinAction | null };
      return json.ok ? json.action ?? null : null;
    } catch {
      return null;
    }
  }

  async function answerQuickly(intent: QuickAnswerIntent) {
    setInput("");
    setShowStarters(false);
    setPendingSms(null);
    setStreaming(true);
    setOdinState("thinking");
    setResponse("");
    try {
      const answer =
        intent.kind.startsWith("hr_")
          ? await getHrAnswer(intent.kind)
          : intent.kind === "renewals"
          ? await getRenewalsAnswer(intent.period)
          : await getCallsAnswer(intent.period);
      setResponse(answer);
    } catch {
      setResponse("I could not reach that data source just now.");
    } finally {
      setStreaming(false);
      setOdinState("idle");
      inputRef.current?.focus();
    }
  }

  async function saveContact(contact: AddContactCommand) {
    setInput("");
    setShowStarters(false);
    setStreaming(true);
    setOdinState("thinking");
    setResponse(`Adding ${contact.name}...`);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contact),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; contact?: { name: string; phone: string } };
      if (!res.ok || !json.ok || !json.contact) throw new Error(json.error ?? "Could not add contact");
      setResponse(`Saved ${json.contact.name} as ${json.contact.phone}.`);
    } catch (e) {
      setResponse((e as Error).message);
    } finally {
      setStreaming(false);
      setOdinState("idle");
      inputRef.current?.focus();
    }
  }

  async function prepareStatsSms(command: StatsSmsCommand) {
    setInput("");
    setShowStarters(false);
    setStreaming(true);
    setOdinState("thinking");
    setResponse(`Preparing ${command.kind} stats for ${command.toName}...`);
    try {
      const res = await fetch("/api/odin/stats-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; toName?: string; message?: string };
      if (!res.ok || !json.ok || !json.message || !json.toName) {
        throw new Error(json.error ?? "Could not prepare stats text");
      }
      setPendingSms({ toName: json.toName, message: json.message });
      setResponse(`Ready to text ${json.toName}: "${json.message}"`);
    } catch (e) {
      setResponse((e as Error).message);
    } finally {
      setStreaming(false);
      setOdinState("idle");
      inputRef.current?.focus();
    }
  }

  async function confirmSms() {
    if (!pendingSms || streaming) return;
    setStreaming(true);
    setOdinState("thinking");
    setResponse(`Sending text to ${pendingSms.toName ?? pendingSms.to}...`);
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingSms),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "SMS failed");
      setResponse(`Text sent to ${pendingSms.toName ?? pendingSms.to}.`);
      setPendingSms(null);
    } catch (e) {
      setResponse((e as Error).message);
    } finally {
      setStreaming(false);
      setOdinState("idle");
      inputRef.current?.focus();
    }
  }

  function cancelSms() {
    setPendingSms(null);
    setResponse("Text cancelled.");
    inputRef.current?.focus();
  }

  const isActive = odinState !== "idle";
  const stateLabel = odinState === "idle" ? "STANDBY" : odinState === "thinking" ? "PROCESSING" : "RESPONDING";
  const statusColor = odinState === "thinking" ? "#fbbf24" : odinState === "speaking" ? "#34d399" : "#73f7ff";

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "#02030d" }}>
      {/* Canvas fills the main space */}
      <div className="relative flex-1 min-h-0">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

        {/* Status — top */}
        <div className="absolute top-5 inset-x-0 z-10 flex justify-center pointer-events-none">
          <div className="flex items-center gap-2 text-[10px] tracking-[0.35em] font-mono" style={{ color: "rgba(226,244,255,0.6)" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: statusColor, transition: "background-color 1.4s ease" }} />
            OD1N &nbsp;·&nbsp; {stateLabel} &nbsp;·&nbsp;{" "}
            {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </div>
        </div>

        {/* Content — bottom overlay */}
        <div className="absolute bottom-0 inset-x-0 z-10 pb-6 flex flex-col items-center gap-4 px-8">
          {odinState === "thinking" && !response && (
            <p className="text-[11px] font-mono tracking-widest animate-pulse" style={{ color: "#fbbf24" }}>
              PROCESSING REQUEST…
            </p>
          )}

          {response && (
            <div className="max-w-2xl animate-fade-in flex flex-col items-center gap-3">
              <p className="text-sm leading-relaxed text-center" style={{ color: "rgba(200,240,255,0.88)" }}>
                {response}
                {streaming && (
                  <span className="inline-block w-[2px] h-[14px] ml-0.5 align-middle" style={{ backgroundColor: statusColor, animation: "cursor-blink 1s ease-in-out infinite" }} />
                )}
              </p>
              {pendingSms && !streaming && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={confirmSms}
                    className="px-4 py-2 rounded-full text-xs font-semibold transition-colors"
                    style={{ background: "rgba(52,211,153,0.16)", border: "1px solid rgba(52,211,153,0.35)", color: "rgba(210,255,235,0.95)" }}
                  >
                    Send text
                  </button>
                  <button
                    onClick={cancelSms}
                    className="px-4 py-2 rounded-full text-xs font-semibold transition-colors"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(115,247,255,0.16)", color: "rgba(226,244,255,0.62)" }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {!response && odinState === "idle" && stats && (
            <div className="flex gap-3 animate-fade-in flex-wrap justify-center">
              <StatChip label="Policies Today" value={String(stats.totalPolicies)} />
              <StatChip label="GWP" value={formatCurrency(stats.gwp)} />
              <StatChip label="Avg Premium" value={formatCurrency(stats.avgPremium)} />
              <StatChip label="Net Earn" value={formatCurrency(stats.netEarn)} />
            </div>
          )}

          {showStarters && !streaming && (
            <div className="flex flex-wrap gap-2 justify-center max-w-xl animate-fade-in">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-[11px] px-3 py-1.5 rounded-full transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(115,247,255,0.18)", color: "rgba(226,244,255,0.6)" }}
                  onMouseEnter={(e) => { const el = e.currentTarget; el.style.borderColor = "rgba(115,247,255,0.5)"; el.style.color = "rgba(226,244,255,0.95)"; }}
                  onMouseLeave={(e) => { const el = e.currentTarget; el.style.borderColor = "rgba(115,247,255,0.18)"; el.style.color = "rgba(226,244,255,0.6)"; }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Input bar */}
      <div className="relative z-10 px-8 pb-7 pt-4" style={{ background: "#02030d", borderTop: "1px solid rgba(115,247,255,0.07)" }}>
        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="flex gap-3 items-center max-w-2xl mx-auto rounded-full px-5 py-3"
          style={{ background: "rgba(115,247,255,0.04)", border: `1px solid ${isActive ? "rgba(115,247,255,0.35)" : "rgba(115,247,255,0.14)"}`, transition: "border-color 0.5s ease" }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(input); } }}
            placeholder={`Ask OD1N anything, ${userName.split(" ")[0]}…`}
            disabled={streaming}
            className="flex-1 bg-transparent text-sm outline-none disabled:opacity-40"
            style={{ color: "rgba(226,244,255,0.9)", caretColor: "#73f7ff" }}
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-30"
            style={{ background: "rgba(115,247,255,0.12)", border: "1px solid rgba(115,247,255,0.25)", transition: "background 1.4s ease" }}
          >
            {streaming
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: statusColor }} />
              : <Send className="w-3.5 h-3.5" style={{ color: "#73f7ff" }} />}
          </button>
        </form>
        <p className="text-center text-[9px] mt-2 tracking-[0.4em] font-mono" style={{ color: "rgba(115,247,255,0.18)" }}>
          ODIN INTELLIGENCE NETWORK · COMMAND CENTRE v1
        </p>
      </div>
    </div>
  );
}

function parseSmsCommand(text: string): PendingSms | null {
  const simple = text.trim().match(/^(?:(?:hey\s+)?od(?:i|1)n[,\s]+)?(?:text|sms|message|send)(?:\s+(?:a\s+)?(?:text|sms|message))?(?:\s+to)?\s+(.+?)\s+(.+)$/i);
  if (simple?.[1] && simple[2]) {
    const recipient = simple[1].trim();
    const message = simple[2].trim();
    if (/^(?:07\d{9}|447\d{9})$/.test(recipient.replace(/\s+/g, ""))) {
      return { to: recipient, message };
    }
  }

  const match = text.trim().match(/^(?:(?:hey\s+)?od(?:i|1)n[,\s]+)?(?:please\s+)?send\s+(?:a\s+)?(?:text|sms)\s+to\s+(.+?)\s+(?:saying|that says|with(?: the)? message)\s+(.+)$/i);
  if (!match) return null;
  const recipient = match[1]?.trim();
  const message = match[2]?.trim();
  if (!recipient || !message) return null;
  if (/^(?:07\d{9}|447\d{9})$/.test(recipient.replace(/\s+/g, ""))) {
    return { to: recipient, message };
  }
  return { toName: recipient, message };
}

function parseAddContactCommand(text: string): AddContactCommand | null {
  const match = text.trim().match(/^(?:(?:hey\s+)?od(?:i|1)n[,\s]+)?(?:please\s+)?add\s+(?:a\s+)?contact\s+(.+?)\s+(?:as|with(?: the)? number|number)\s+(\+?\d[\d\s]+)$/i);
  if (!match) return null;
  const name = match[1]?.trim();
  const phone = match[2]?.trim();
  if (!name || !phone) return null;
  return { name, phone };
}

function parseStatsSmsCommand(text: string): StatsSmsCommand | null {
  const cleaned = text.trim().replace(/^(?:hey\s+)?od(?:i|1)n[,\s]+/i, "");
  const patterns = [
    /^(?:can\s+you\s+)?send\s+(.+?)\s+(?:the\s+)?(renewal|renewals|call|calls)\s+stats(?:\s+for\s+(today|this week|week|this month|month|ytd|year to date))?$/i,
    /^(?:can\s+you\s+)?send\s+(?:the\s+)?(renewal|renewals|call|calls)\s+stats(?:\s+for\s+(today|this week|week|this month|month|ytd|year to date))?\s+to\s+(.+?)$/i,
    /^(?:can\s+you\s+)?text\s+(.+?)\s+(?:the\s+)?(renewal|renewals|call|calls)\s+stats(?:\s+for\s+(today|this week|week|this month|month|ytd|year to date))?$/i,
  ];

  let toName = "";
  let rawKind = "";
  let rawPeriod = "today";

  const directMatch = cleaned.match(patterns[0]);
  if (directMatch) {
    toName = directMatch[1]?.trim() ?? "";
    rawKind = directMatch[2]?.toLowerCase() ?? "";
    rawPeriod = (directMatch[3] ?? "today").toLowerCase();
  } else {
    const toMatch = cleaned.match(patterns[1]);
    if (toMatch) {
      rawKind = toMatch[1]?.toLowerCase() ?? "";
      rawPeriod = (toMatch[2] ?? "today").toLowerCase();
      toName = toMatch[3]?.trim() ?? "";
    } else {
      const textMatch = cleaned.match(patterns[2]);
      if (!textMatch) return null;
      toName = textMatch[1]?.trim() ?? "";
      rawKind = textMatch[2]?.toLowerCase() ?? "";
      rawPeriod = (textMatch[3] ?? "today").toLowerCase();
    }
  }

  if (!toName || !rawKind) return null;

  const kind = rawKind.startsWith("call") ? "calls" : "renewals";
  const period =
    rawPeriod === "this week" || rawPeriod === "week" ? "week" :
    rawPeriod === "this month" || rawPeriod === "month" ? "month" :
    rawPeriod === "ytd" || rawPeriod === "year to date" ? "ytd" :
    "today";

  return { toName, kind, period };
}

function parseQuickAnswerIntent(text: string): QuickAnswerIntent | null {
  const cleaned = text.trim().replace(/^(?:hey\s+)?od(?:i|1)n[,\s]+/i, "").toLowerCase();
  const period = getPeriod(cleaned);

  const asksOff =
    /\b(?:who|who's|whos|anyone|people|staff|employees|team)\b/.test(cleaned) &&
    /\b(?:off|out|ooo|holiday|leave|absent|absence|annual leave)\b/.test(cleaned);
  if (asksOff) return { kind: "hr_off_today", period };

  const asksPendingLeave =
    /\b(?:pending|awaiting|requested|requests?)\b/.test(cleaned) &&
    /\b(?:leave|holiday|absence|annual leave)\b/.test(cleaned);
  if (asksPendingLeave) return { kind: "hr_pending_leave", period };

  const asksHr =
    /\b(?:hr|headcount|staff|employees|people|team cover|teams)\b/.test(cleaned) &&
    /\b(?:summary|stats|figures|numbers|headcount|cover|how many|show)\b/.test(cleaned);
  if (asksHr) return { kind: "hr_summary", period };

  const asksRenewals =
    /\b(?:renewal|renewals)\b/.test(cleaned) &&
    /\b(?:stat|stats|summary|figures|numbers|performance|doing|how are|today|week|month|ytd)\b/.test(cleaned);
  if (asksRenewals) return { kind: "renewals", period };

  const asksCalls =
    /\b(?:call|calls|phone|pbx)\b/.test(cleaned) &&
    /\b(?:stat|stats|summary|figures|numbers|performance|doing|how are|today|week|month|ytd)\b/.test(cleaned);
  if (asksCalls) return { kind: "calls", period };

  return null;
}

function getPeriod(text: string): "today" | "week" | "month" | "ytd" {
  if (/\b(?:ytd|year to date)\b/.test(text)) return "ytd";
  if (/\b(?:this month|month)\b/.test(text)) return "month";
  if (/\b(?:this week|week|weekly)\b/.test(text)) return "week";
  return "today";
}

function periodLabel(period: "today" | "week" | "month" | "ytd"): string {
  if (period === "week") return "this week";
  if (period === "month") return "this month";
  if (period === "ytd") return "YTD";
  return "today";
}

async function getHrAnswer(kind: QuickAnswerIntent["kind"]): Promise<string> {
  const res = await fetch("/api/hr/summary");
  if (!res.ok) throw new Error("HR unavailable");
  const data = (await res.json()) as HrSummaryResponse;

  if (kind === "hr_off_today") {
    if (data.outToday.length === 0) return "Nobody is showing as out of office today.";
    const names = data.outToday.slice(0, 8).map((row) => row.employeeName);
    const extra = data.outToday.length > names.length ? `, plus ${data.outToday.length - names.length} more` : "";
    return `Out of office today: ${names.join(", ")}${extra}.`;
  }

  if (kind === "hr_pending_leave") {
    if (data.pendingLeave === 0) return "There are no pending leave requests showing in Sage HR.";
    const names = data.recentRequests
      .filter((row) => /pending|awaiting|requested/i.test(row.status))
      .slice(0, 8)
      .map((row) => row.employeeName);
    const list = names.length ? `: ${names.join(", ")}` : "";
    return `${data.pendingLeave} pending leave request${data.pendingLeave === 1 ? "" : "s"}${list}.`;
  }

  const teams = data.teams
    .slice(0, 4)
    .map((team) => `${team.team} ${team.headcount}`)
    .join(", ");
  return `HR summary: ${data.headcount} employees, ${data.offToday} out today, ${data.pendingLeave} pending leave requests. Largest teams: ${teams}.`;
}

async function getRenewalsAnswer(period: "today" | "week" | "month" | "ytd"): Promise<string> {
  const res = await fetch(`/api/renewals/summary?period=${period}`);
  if (!res.ok) throw new Error("Renewals unavailable");
  const data = (await res.json()) as SummaryResponse;
  return `Renewals ${periodLabel(period)}: ${data.renewedPolicies} renewed, ${formatCurrency(data.gwp)} GWP, ${formatCurrency(data.netEarn)} net earn, avg premium ${formatCurrency(data.avgPremium)}, finance penetration ${Math.round(data.financePenPct)}%.`;
}

async function getCallsAnswer(period: "today" | "week" | "month" | "ytd"): Promise<string> {
  const mapped = period === "ytd" ? "month" : period;
  const res = await fetch(`/api/calls/summary?period=${mapped}`);
  if (!res.ok) throw new Error("Calls unavailable");
  const data = (await res.json()) as CallsSummaryResponse;
  return `Calls ${periodLabel(period)}: ${data.totalCalls} New-Renewals calls, avg wait ${formatSeconds(data.avgWaitSec)}, avg duration ${formatSeconds(data.avgDurationSec)}, longest wait ${formatSeconds(data.longestWaitSec)}.`;
}

function formatSeconds(seconds: number): string {
  if (seconds <= 0) return "0s";
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return minutes ? `${minutes}m ${secs}s` : `${secs}s`;
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl" style={{ background: "rgba(115,247,255,0.05)", border: "1px solid rgba(115,247,255,0.12)" }}>
      <span className="text-[10px] tracking-wide" style={{ color: "rgba(115,247,255,0.55)" }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: "rgba(226,244,255,0.9)" }}>{value}</span>
    </div>
  );
}
