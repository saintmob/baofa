import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAudio, type FireworkBurstKind } from './hooks/useAudio';
import { useHandTracking } from './hooks/useHandTracking';
import { AnimatePresence, motion } from 'motion/react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { LegacyFireworkScene } from './components/Visuals/LegacyFireworkScene';
import { ParticleScene } from './components/Visuals/ParticleScene';
import * as THREE from 'three';
import { db, handleFirestoreError, isFirebaseConfigured, OperationType } from './lib/firebase';
import { createShowControlClient, type ControlCommand } from './lib/showControlClient';
import { APP_PORT, BAOFA_NATIVE_URL } from './lib/runtimeConfig';
import { fetchScreenState, type ScreenPresentation, type ScreenRoute } from './lib/screenRoutes';
import { doc, getDocFromServer, onSnapshot, setDoc } from 'firebase/firestore';
import { Activity, Camera, CameraOff, ExternalLink, LayoutGrid, MonitorCog, Music2, Route, Sparkles, Volume2, VolumeX } from 'lucide-react';
import {
  DEFAULT_SCREEN_ID,
  MASTER_SCREEN,
  SCREEN_LAYOUT_ITEMS,
  SHOW_SCREEN_LAYOUT_ITEMS,
  STAGE_BOUNDS,
  getNearestScreenId,
  getScreenDisplayId,
  getScreenWorldPointData,
  isKnownScreenId,
  type ScreenLayoutItem,
} from './screenLayout';

const GESTURE_CONFIRM_MS = 5000;
const GESTURE_RETREAT_MS = 1400;
const GESTURE_FADE_MS = 520;
const STALE_TREE_STATE_MS = 30000;
const TREE_COLOR_RAMP_MS = 4500;
const TREE_BRIGHT_HOLD_MS = 11000;
const TREE_FADE_MS = 8500;
const STANDBY_PROMPT_DELAY_MS = 5500;
const ROUND_STANDBY_PROMPT_DELAY_MS = 2000;

function getScreenWorldPoint(id: string) {
  const point = getScreenWorldPointData(id);
  return new THREE.Vector3(point.x, point.y, point.z);
}

function getStageRect(rect: DOMRect) {
  const aspect = STAGE_BOUNDS.width / STAGE_BOUNDS.height;
  const maxWidth = rect.width * 0.94;
  const maxHeight = rect.height * 0.82;
  const width = Math.min(maxWidth, maxHeight * aspect);
  const height = width / aspect;

  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2 + 18,
    width,
    height,
  };
}

function getScreenFromPointer(clientX: number, clientY: number, rect: DOMRect, fallback: string) {
  const stage = getStageRect(rect);
  if (
    clientX < stage.left ||
    clientX > stage.left + stage.width ||
    clientY < stage.top ||
    clientY > stage.top + stage.height
  ) {
    return fallback;
  }

  const col = ((clientX - stage.left) / stage.width) * STAGE_BOUNDS.width;
  const row = ((clientY - stage.top) / stage.height) * STAGE_BOUNDS.height;

  return getNearestScreenId(col, row, fallback);
}

function createShowControlClientId(screenId: string) {
  return `baofa-${screenId}-${createIdFragment()}`;
}

function normalizeScreenOccupancyId(value: string | null | undefined) {
  if (!value) return '';
  return value === 'MASTER' ? 'A1' : value;
}

const effectModes: Array<{ mode: 'idle' | 'interaction' | 'flow' | 'climax'; label: string; intensity: number }> = [
  { mode: 'idle', label: 'CALM / 静止', intensity: 0.08 },
  { mode: 'flow', label: 'FLOW / 流动', intensity: 0.42 },
  { mode: 'interaction', label: 'PULSE / 互动', intensity: 0.72 },
  { mode: 'climax', label: 'CLIMAX / 高潮', intensity: 1 },
];

const createIdFragment = () => {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? uuid.slice(0, 8) : Math.random().toString(36).slice(2, 10);
};

function getLayoutStyle(screen: ScreenLayoutItem): React.CSSProperties {
  const width = screen.width ?? 0.78;
  const height = screen.height ?? 0.52;

  return {
    left: `${(screen.col / STAGE_BOUNDS.width) * 100}%`,
    top: `${(screen.row / STAGE_BOUNDS.height) * 100}%`,
    width: `${(width / STAGE_BOUNDS.width) * 100}%`,
    height: `${(height / STAGE_BOUNDS.height) * 100}%`,
    transform: `translate(-50%, -50%) rotate(${screen.rotate ?? 0}deg)`,
  };
}

function getInitialScreenId() {
  const screenMatch = window.location.pathname.match(/^\/screen\/([^/]+)/);
  const routeScreenId = screenMatch ? decodeURIComponent(screenMatch[1]) : '';
  if (isKnownScreenId(routeScreenId)) return routeScreenId;
  const saved = localStorage.getItem('baofa-screen-id');
  return isKnownScreenId(saved) ? saved! : DEFAULT_SCREEN_ID;
}

type WebGLStats = {
  fps: number;
  frameMs: number;
  calls: number;
  triangles: number;
  points: number;
  lines: number;
  geometries: number;
  textures: number;
  pixelRatio: number;
  viewport: string;
};

type TreePhase = 'idle' | 'growing' | 'bright' | 'fading';
type VisualMode = 'tree' | 'firework';
type TreeControlMode = 'manual' | 'auto';
type FireworkPanelBurstKind = FireworkBurstKind | 'giant';

const AUTO_FISH_PATH = ['A1', 'B2', 'B3', 'B4', 'B5', 'D2', 'D1', 'L1', 'E1', 'R2', 'F1'];
const AUTO_REVEAL_MS = 10000;
const AUTO_FISH_DURATION_MS = 36000;
const AUTO_FISH_GATHER_FRACTION = 0.2;
const AUTO_END_BLACKOUT_MS = 3000;
const AUTO_MUSIC_PLAYBACK_RATE = 1;
const AUTO_FIREWORK_DURATION_MS = 20000;
const STANDBY_WAKE_GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'L', 'R'] as const;
const STANDBY_WAKE_STEP_MS = 520;
const STANDBY_WAKE_HOLD_MS = 2500;
const STANDBY_WAKE_TOTAL_MS = STANDBY_WAKE_GROUPS.length * STANDBY_WAKE_STEP_MS + STANDBY_WAKE_HOLD_MS;

function getStandbyWakeGroup(id: string) {
  if (id === 'MASTER') return 'A';
  const first = id[0]?.toUpperCase();
  return STANDBY_WAKE_GROUPS.includes(first as (typeof STANDBY_WAKE_GROUPS)[number]) ? first : 'A';
}

function getStandbyWakeDelay(id: string) {
  const group = getStandbyWakeGroup(id);
  return STANDBY_WAKE_GROUPS.indexOf(group as (typeof STANDBY_WAKE_GROUPS)[number]) * STANDBY_WAKE_STEP_MS;
}

function getScreenLayout(id: string) {
  return id === 'A1' || id === 'MASTER'
    ? MASTER_SCREEN
    : SCREEN_LAYOUT_ITEMS.find((item) => item.id === id) ?? MASTER_SCREEN;
}

function getFishRoutePoint(id: string, role: 'center' | 'entry' | 'exit' = 'center') {
  const screen = getScreenLayout(id);
  const width = screen.width ?? 0.78;
  const height = screen.height ?? 0.52;

  if (role === 'entry') {
    return {
      col: screen.col + width / 2 + 0.95,
      row: screen.row - height / 2 - 0.72,
    };
  }

  if (role === 'exit') {
    return {
      col: screen.col - width / 2 - 0.95,
      row: screen.row + height / 2 + 0.72,
    };
  }

  return { col: screen.col, row: screen.row };
}

function getFishStagePosition(progress: number) {
  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  const travelProgress = clamped;
  const route = [
    getFishRoutePoint('A1', 'entry'),
    ...AUTO_FISH_PATH.map((screen) => getFishRoutePoint(screen)),
    getFishRoutePoint('F1', 'exit'),
  ];
  const segmentCount = route.length - 1;
  const scaled = travelProgress * segmentCount;
  const index = Math.min(segmentCount - 1, Math.floor(scaled));
  const local = scaled - index;
  const eased = local < 0.5 ? 2 * local * local : 1 - Math.pow(-2 * local + 2, 2) / 2;
  const from = route[index];
  const to = route[index + 1];
  const dx = to.col - from.col;
  const dy = to.row - from.row;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const normalX = -dy / length;
  const normalY = dx / length;
  const wave =
    Math.sin(travelProgress * Math.PI * 4.2 + index * 0.9) * 0.16 +
    Math.sin(travelProgress * Math.PI * 9.5 + index * 1.7) * 0.07;
  const driftCol =
    Math.sin(travelProgress * Math.PI * 2.1) * 0.07 +
    Math.sin(travelProgress * Math.PI * 6.2 + index) * 0.035;

  return {
    col: THREE.MathUtils.lerp(from.col, to.col, eased) + normalX * wave + driftCol,
    row: THREE.MathUtils.lerp(from.row, to.row, eased) + normalY * wave + Math.sin(travelProgress * Math.PI * 7.5 + index) * 0.055,
    angle: Math.atan2(dy + normalY * wave, dx + normalX * wave) * 180 / Math.PI,
  };
}

function getAutoFishScreenRevealProgress(id: string) {
  const screenId = id === 'MASTER' ? 'A1' : id;
  const index = AUTO_FISH_PATH.indexOf(screenId);
  if (index < 0) return null;
  const travelLeaveProgress = index >= AUTO_FISH_PATH.length - 1 ? 1 : (index + 1) / (AUTO_FISH_PATH.length - 1);
  return AUTO_FISH_GATHER_FRACTION + travelLeaveProgress * (1 - AUTO_FISH_GATHER_FRACTION);
}

function getFishPosition(progress: number, screenId: string, isOverview: boolean) {
  if (isOverview) {
    const stage = getFishStagePosition(progress);
    return {
      x: (stage.col / STAGE_BOUNDS.width) * 100,
      y: (stage.row / STAGE_BOUNDS.height) * 100,
      angle: stage.angle,
      visible: true,
    };
  }

  const stage = getFishStagePosition(progress);
  const screen = getScreenLayout(screenId);
  const width = screen.width ?? 0.78;
  const height = screen.height ?? 0.52;
  const localX = ((stage.col - (screen.col - width / 2)) / width) * 100;
  const localY = ((stage.row - (screen.row - height / 2)) / height) * 100;
  const isGathering = progress < AUTO_FISH_GATHER_FRACTION;
  const margin = isGathering || progress > 0.88 ? 170 : 34;

  return {
    x: localX,
    y: localY,
    angle: stage.angle - (screen.rotate ?? 0),
    visible:
      (!isGathering || screen.id === 'A1') &&
      localX >= -margin &&
      localX <= 100 + margin &&
      localY >= -margin &&
      localY <= 100 + margin,
  };
}

function AutoFishSchool({ active, progress, screenId, isOverview }: { active: boolean; progress: number; screenId: string; isOverview: boolean }) {
  const position = getFishPosition(progress, screenId, isOverview);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastDrawTimeRef = useRef(0);

  useEffect(() => {
    if (!active || !position.visible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const now = performance.now();
    if (now - lastDrawTimeRef.current < 32) return;
    lastDrawTimeRef.current = now;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = 1;
    const pixelWidth = Math.floor(width * dpr);
    const pixelHeight = Math.floor(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const schoolWidth = width * 0.66;
    const schoolHeight = height * 0.62;
    const centerX = width * position.x / 100;
    const centerY = height * position.y / 100;
    const schoolScale = isOverview ? 1.52 : 1.84;
    const entryOpacity = THREE.MathUtils.smoothstep(progress, 0.015, 0.13);
    const exitOpacity = 1 - THREE.MathUtils.smoothstep(progress, 0.9, 1);
    const fishOpacity = entryOpacity * exitOpacity;
    const tailOpacity = THREE.MathUtils.smoothstep(progress, 0.04, 0.16) * exitOpacity;
    const vortexBreath = 0.82 + Math.sin(progress * Math.PI * 6) * 0.18;
    const contraction = 1 - THREE.MathUtils.smoothstep(Math.sin(progress * Math.PI * 4) * 0.5 + 0.5, 0.56, 1) * 0.18;
    const scaleX = schoolWidth / 900;
    const scaleY = schoolHeight / 600;
    const angle = position.angle * Math.PI / 180;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);
    ctx.globalAlpha = fishOpacity;
    ctx.shadowColor = 'rgba(34,211,238,0.32)';
    ctx.shadowBlur = 28;

    ctx.globalCompositeOperation = 'lighter';

    for (let index = 0; index < 72; index += 1) {
      const phase = progress * 46 + index * 0.77;
      const spiral = index * 0.38 + progress * Math.PI * 7;
      const radius = (80 + (index % 38) * 9 + Math.sin(phase) * 24) * contraction;
      const x = (Math.cos(spiral) * radius - progress * 460 + (index % 9) * 44) * scaleX * 0.92;
      const y = (Math.sin(spiral * 0.72) * radius * 0.46 + Math.cos(phase * 0.4) * 54) * scaleY * vortexBreath;
      const glow = THREE.MathUtils.clamp(0.24 + Math.sin(phase * 1.3) * 0.2, 0.08, 0.48);
      ctx.globalAlpha = tailOpacity * glow;
      ctx.fillStyle = 'rgba(207,250,254,0.72)';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.7, (0.9 + (index % 4) * 0.42) * Math.min(scaleX, scaleY)), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowColor = 'rgba(125,249,255,0.5)';

    const batches = [
      { delay: 0, fishStart: 0, fishCount: 32, particleStart: 0, particleCount: 64, laneOffset: -0.16, scale: 1.02 },
      { delay: 0.032, fishStart: 32, fishCount: 28, particleStart: 64, particleCount: 58, laneOffset: 0.14, scale: 0.96 },
      { delay: 0.064, fishStart: 60, fishCount: 24, particleStart: 122, particleCount: 58, laneOffset: 0.36, scale: 0.9 },
    ];

    batches.forEach((batch, batchIndex) => {
      const batchProgress = THREE.MathUtils.clamp((progress - batch.delay) / (1 - batch.delay), 0, 1);
      const batchPresence = THREE.MathUtils.smoothstep(progress, batch.delay, batch.delay + 0.038) * (1 - THREE.MathUtils.smoothstep(progress, 0.9, 1));
      if (batchPresence <= 0.001) return;

      for (let p = 0; p < batch.particleCount; p += 1) {
        const index = batch.particleStart + p;
        const lane = index % 32;
        const band = Math.floor(index / 32);
        const flow = (batchProgress * 520 + index * 13.7) % 280;
        const curlX = Math.sin(batchProgress * 21 + lane * 0.72 + band * 1.9) * 38 + Math.cos(batchProgress * 15 + index * 0.31) * 22;
        const curlY = Math.cos(batchProgress * 19 + lane * 0.64 + band * 1.5) * 34 + Math.sin(batchProgress * 17 + index * 0.27) * 18;
        const vortex = Math.sin(batchProgress * Math.PI * 5 + index * 0.12) * 0.5 + 0.5;
        const x = (-flow - band * 42 + Math.sin(index * 1.43 + batchProgress * 22) * 32 + curlX * vortex + batch.laneOffset * 120) * schoolScale * contraction * scaleX;
        const y = (Math.sin(lane * 0.73 + band * 1.2 + batchProgress * 18) * (62 + band * 20) + Math.cos(index * 0.41) * 20 + curlY * vortex + batch.laneOffset * 72) * schoolScale * vortexBreath * scaleY;
        const size = (1.25 + (index % 5) * 0.5) * Math.min(scaleX, scaleY);
        const sparkle = THREE.MathUtils.clamp(0.42 + Math.sin(batchProgress * 55 + index * 0.91) * 0.28, 0.08, 0.76);

        ctx.globalAlpha = tailOpacity * sparkle * batchPresence;
        ctx.fillStyle = index % 7 === 0 ? 'rgba(236,254,255,0.9)' : 'rgba(103,232,249,0.72)';
        ctx.shadowBlur = index % 7 === 0 ? 18 : 10;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.8, size), 0, Math.PI * 2);
        ctx.fill();
      }

      for (let local = 0; local < batch.fishCount; local += 1) {
        const index = batch.fishStart + local;
        const ring = Math.floor(local / 16) + batchIndex;
        const lane = local % 24;
        const drift = Math.sin(batchProgress * 8.5 + ring * 1.7) * 30 + Math.cos(batchProgress * 5.2 + index * 0.47) * 15;
        const scatterX = Math.sin(index * 2.37) * 18 + Math.cos(index * 0.83) * 12;
        const scatterY = Math.cos(index * 1.91) * 16 + Math.sin(index * 0.61) * 10;
        const theta = lane * 0.56 + ring * 1.27 + batchProgress * 9;
        const curlX = Math.sin(theta + Math.sin(batchProgress * 6 + index) * 0.9) * (42 + ring * 6) + Math.cos(batchProgress * 20 + index * 0.33) * 18;
        const curlY = Math.cos(theta * 0.92 + batchProgress * 4.7) * (36 + ring * 8) + Math.sin(batchProgress * 18 + index * 0.41) * 16;
        const avoidX = (Math.sin(index * 12.989 + batchProgress * 7.2) + Math.sin(index * 4.73 + batchProgress * 13)) * (13 + ring * 2);
        const avoidY = (Math.cos(index * 9.233 + batchProgress * 6.4) + Math.sin(index * 6.11 + batchProgress * 9.6)) * (11 + ring * 2);
        const dart = Math.sin(batchProgress * 36 + index * 1.19) * 20 + Math.cos(batchProgress * 28 + lane * 0.7) * 14;
        const schoolX = (-ring * 56 + Math.cos(lane * 0.64 + ring * 1.31) * (112 - ring * 2) + Math.sin(batchProgress * 16 + index * 0.77) * 42 + drift + scatterX + dart + curlX + avoidX + batch.laneOffset * 150) * schoolScale * contraction * batch.scale;
        const schoolY = (Math.sin(lane * 0.76 + ring * 0.69) * (82 + ring * 24) + Math.sin(batchProgress * 18 + index) * 38 + scatterY + Math.cos(batchProgress * 31 + index * 0.53) * 16 + curlY + avoidY + batch.laneOffset * 80) * schoolScale * vortexBreath * batch.scale;
        const x = schoolX * scaleX;
        const y = schoolY * scaleY;
        const shimmer = THREE.MathUtils.clamp(0.62 + Math.sin(batchProgress * 46 + index * 1.41) * 0.24 + (index % 5) * 0.04, 0.28, 1);
        const fishLength = (36 + (index % 6) * 5.4) * Math.min(scaleX, scaleY) * batch.scale;
        const fishHeight = (9.6 + (index % 5) * 1.42) * Math.min(scaleX, scaleY) * batch.scale;
        const tailLength = (26 + (index % 7) * 4.8) * Math.min(scaleX, scaleY) * batch.scale;
        const swimPhase = batchProgress * 132 + index * 0.93;
        const speedSync = 0.84 + Math.sin(batchProgress * Math.PI * 5 + ring) * 0.16;
        const tailWag = Math.sin(swimPhase * speedSync) * (42 + (index % 4) * 6.8);
        const bodyWave = Math.sin(swimPhase * 0.88) * 11.5;
        const fishAngle = (Math.sin(batchProgress * 18 + index * 0.91) * 18 + (index % 3 - 1) * 8 + bodyWave + curlY * 0.055) * Math.PI / 180;
        const finWave = Math.sin(swimPhase * 1.16 + index) * 10 * Math.PI / 180;
        const bodyY = Math.sin(swimPhase * 0.62) * 2.8 * Math.min(scaleX, scaleY);

      ctx.save();
      ctx.translate(x, y + bodyY);
      ctx.rotate(fishAngle);
      ctx.globalAlpha = fishOpacity * shimmer * batchPresence;

      ctx.globalAlpha = fishOpacity * THREE.MathUtils.clamp(shimmer * 0.24, 0.06, 0.22) * batchPresence;
      ctx.shadowBlur = 18;
      const bodyGlow = ctx.createRadialGradient(-fishLength * 0.04, 0, fishHeight * 0.22, -fishLength * 0.04, 0, fishLength * 0.98);
      bodyGlow.addColorStop(0, 'rgba(236,254,255,0.22)');
      bodyGlow.addColorStop(0.34, 'rgba(125,249,255,0.14)');
      bodyGlow.addColorStop(0.72, 'rgba(34,211,238,0.045)');
      bodyGlow.addColorStop(1, 'rgba(14,165,233,0)');
      ctx.fillStyle = bodyGlow;
      ctx.beginPath();
      ctx.ellipse(-fishLength * 0.12, 0, fishLength * 1.35, fishHeight * 2.1, 0, 0, Math.PI * 2);
      ctx.fill();

      const tailAngle = tailWag * Math.PI / 180;
      ctx.save();
      ctx.translate(-fishLength * 0.48, Math.sin(swimPhase) * fishHeight * 0.3);
      ctx.rotate(tailAngle * 1.12);
      ctx.globalAlpha = fishOpacity * THREE.MathUtils.clamp(shimmer * 0.72, 0.2, 0.72) * batchPresence;
      ctx.shadowBlur = 9;
      ctx.fillStyle = 'rgba(125,249,255,0.52)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-fishHeight * 1.45, -fishHeight * 0.95);
      ctx.lineTo(-fishHeight * 1.18, 0);
      ctx.lineTo(-fishHeight * 1.45, fishHeight * 0.95);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.globalAlpha = tailOpacity * fishOpacity * 0.11 * batchPresence;
      const plume = ctx.createRadialGradient(-fishLength * 0.72, 0, 0, -fishLength * 0.72, 0, tailLength * 1.25);
      plume.addColorStop(0, 'rgba(125,249,255,0.34)');
      plume.addColorStop(0.45, 'rgba(34,211,238,0.16)');
      plume.addColorStop(1, 'rgba(8,145,178,0)');
      ctx.fillStyle = plume;
      ctx.beginPath();
      ctx.ellipse(-fishLength * 0.9, 0, tailLength * 1.15, fishHeight * 1.1, tailAngle * 0.35, 0, Math.PI * 2);
      ctx.fill();

      for (let speck = 0; speck < 1; speck += 1) {
        const speckPhase = swimPhase + speck * 2.11;
        ctx.globalAlpha = fishOpacity * THREE.MathUtils.clamp(shimmer * (0.26 + speck * 0.06), 0.08, 0.36) * batchPresence;
        ctx.shadowBlur = 8;
        ctx.fillStyle = speck % 2 === 0 ? 'rgba(236,254,255,0.82)' : 'rgba(125,249,255,0.62)';
        ctx.beginPath();
        ctx.arc(
          -fishLength * 0.08 + Math.sin(speckPhase) * fishLength * 0.22,
          Math.cos(speckPhase * 0.82) * fishHeight * 0.58,
          Math.max(0.8, fishHeight * (0.07 + speck * 0.018)),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      ctx.globalAlpha = fishOpacity * shimmer * batchPresence;
      ctx.shadowBlur = 7;
      const bodyGradient = ctx.createLinearGradient(-fishLength * 0.45, 0, fishLength * 0.5, 0);
      bodyGradient.addColorStop(0, 'rgba(103,232,249,0.05)');
      bodyGradient.addColorStop(0.25, 'rgba(125,249,255,0.42)');
      bodyGradient.addColorStop(0.62, 'rgba(240,253,250,0.9)');
      bodyGradient.addColorStop(0.84, 'rgba(255,255,255,0.98)');
      bodyGradient.addColorStop(1, 'rgba(125,249,255,0.13)');
      ctx.fillStyle = bodyGradient;
      ctx.beginPath();
      ctx.moveTo(-fishLength * 0.5, 0);
      ctx.bezierCurveTo(-fishLength * 0.38, -fishHeight * 0.95, fishLength * 0.22, -fishHeight * 0.78, fishLength * 0.52, 0);
      ctx.bezierCurveTo(fishLength * 0.2, fishHeight * 0.85, -fishLength * 0.38, fishHeight * 0.95, -fishLength * 0.5, 0);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = fishOpacity * THREE.MathUtils.clamp(shimmer * 0.48, 0.16, 0.5) * batchPresence;
      ctx.shadowBlur = 5;
      ctx.fillStyle = 'rgba(125,249,255,0.46)';
      ctx.save();
      ctx.translate(fishLength * 0.02, fishHeight * 0.48);
      ctx.rotate(0.5 + finWave);
      ctx.beginPath();
      ctx.moveTo(0, -fishHeight * 0.15);
      ctx.lineTo(fishLength * 0.34, 0);
      ctx.lineTo(0, fishHeight * 0.58);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.globalAlpha = fishOpacity * THREE.MathUtils.clamp(shimmer * 0.86, 0.28, 0.86) * batchPresence;
      ctx.shadowBlur = 12;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(-fishLength * 0.02 + Math.sin(index) * 4, Math.cos(index * 1.7) * fishHeight * 0.24, Math.max(1.4, fishHeight * 0.16), 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = fishOpacity * THREE.MathUtils.clamp(shimmer * 0.9, 0.36, 0.95) * batchPresence;
      ctx.shadowBlur = 5;
      ctx.fillStyle = 'rgba(4,47,46,0.92)';
      ctx.beginPath();
      ctx.arc(fishLength * 0.34, -fishHeight * 0.16, Math.max(1.6, fishHeight * 0.14), 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      }
    });

    const bloomGradient = ctx.createRadialGradient(0, 0, 20, 0, 0, Math.max(schoolWidth, schoolHeight) * 0.58);
    bloomGradient.addColorStop(0, 'rgba(125,249,255,0.1)');
    bloomGradient.addColorStop(0.45, 'rgba(34,211,238,0.045)');
    bloomGradient.addColorStop(1, 'rgba(14,165,233,0)');
    ctx.globalAlpha = fishOpacity * 0.9;
    ctx.shadowBlur = 0;
    ctx.fillStyle = bloomGradient;
    ctx.fillRect(-schoolWidth * 0.7, -schoolHeight * 0.7, schoolWidth * 1.4, schoolHeight * 1.4);

    ctx.restore();
  }, [active, isOverview, position.angle, position.visible, position.x, position.y, progress]);

  if (!active || !position.visible) return null;

  return (
    <div className="fixed inset-0 z-30 pointer-events-none overflow-hidden" data-auto-fish-school>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full transition-opacity duration-700"
        data-auto-fish-body
        style={{
          opacity: THREE.MathUtils.smoothstep(progress, 0.015, 0.13) * (1 - THREE.MathUtils.smoothstep(progress, 0.9, 1)),
        }}
      />
    </div>
  );
}

function AutoStandbyWakeOverlay({
  active,
  wakeKey,
  screenId,
  isOverview,
  isMaster,
}: {
  active: boolean;
  wakeKey: number;
  screenId: string;
  isOverview: boolean;
  isMaster: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const startedAt = performance.now();
    let frameId = 0;

    const render = (now: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.35);
      const pixelWidth = Math.floor(width * dpr);
      const pixelHeight = Math.floor(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      const elapsed = now - startedAt;
      const drawScreenGlow = (screen: ScreenLayoutItem, alphaScale = 1) => {
        const delay = getStandbyWakeDelay(screen.id);
        const local = THREE.MathUtils.clamp((elapsed - delay) / 2600, 0, 1);
        if (local <= 0 || local >= 1) return;

        const widthRatio = screen.width ?? 0.78;
        const heightRatio = screen.height ?? 0.52;
        const x = (screen.col / STAGE_BOUNDS.width) * width;
        const y = (screen.row / STAGE_BOUNDS.height) * height;
        const w = (widthRatio / STAGE_BOUNDS.width) * width;
        const h = (heightRatio / STAGE_BOUNDS.height) * height;
        const peak = local < 0.22 ? local / 0.22 : 1 - (local - 0.22) / 0.78;
        const sustain = 0.18 + Math.sin(local * Math.PI) * 0.72;
        const alpha = THREE.MathUtils.clamp(Math.max(peak, sustain * 0.55) * alphaScale, 0, 0.95);
        const rotate = (screen.rotate ?? 0) * Math.PI / 180;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotate);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(34,211,238,0.12)';
        ctx.strokeStyle = 'rgba(236,254,255,0.46)';
        ctx.lineWidth = 1;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.strokeRect(-w / 2, -h / 2, w, h);

        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) * 1.15);
        glow.addColorStop(0, 'rgba(236,254,255,0.58)');
        glow.addColorStop(0.45, 'rgba(34,211,238,0.2)');
        glow.addColorStop(1, 'rgba(14,165,233,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(-w * 1.4, -h * 1.8, w * 2.8, h * 3.6);
        ctx.restore();
      };

      if (isOverview) {
        SHOW_SCREEN_LAYOUT_ITEMS.forEach((screen) => drawScreenGlow(screen));
        const veilAlpha = Math.max(0, 1 - elapsed / STANDBY_WAKE_TOTAL_MS) * 0.16;
        if (veilAlpha > 0.001) {
          const veil = ctx.createRadialGradient(width * 0.5, height * 0.5, 0, width * 0.5, height * 0.5, Math.max(width, height) * 0.56);
          veil.addColorStop(0, `rgba(125,249,255,${veilAlpha})`);
          veil.addColorStop(1, 'rgba(14,165,233,0)');
          ctx.globalAlpha = 1;
          ctx.fillStyle = veil;
          ctx.fillRect(0, 0, width, height);
        }
      } else {
        const screen = isMaster ? MASTER_SCREEN : getScreenLayout(screenId);
        drawScreenGlow(screen, 1.15);
      }

      if (elapsed < STANDBY_WAKE_TOTAL_MS + 600) {
        frameId = requestAnimationFrame(render);
      }
    };

    frameId = requestAnimationFrame(render);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [active, isMaster, isOverview, screenId, wakeKey]);

  if (!active) return null;

  return (
    <div
      key={wakeKey}
      className="pointer-events-none fixed inset-0 z-[11] overflow-hidden"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

function WebGLDebugProbe({ onStats }: { onStats: (stats: WebGLStats) => void }) {
  const { gl, size } = useThree();
  const lastSampleRef = useRef(performance.now());
  const frameCountRef = useRef(0);
  const frameMsRef = useRef(0);

  useEffect(() => {
    const previousAutoReset = gl.info.autoReset;
    gl.info.autoReset = false;
    gl.info.reset();

    return () => {
      gl.info.autoReset = previousAutoReset;
      gl.info.reset();
    };
  }, [gl]);

  useFrame((_, delta) => {
    frameCountRef.current += 1;
    frameMsRef.current += delta * 1000;

    const now = performance.now();
    if (now - lastSampleRef.current < 500) return;

    const elapsed = now - lastSampleRef.current;
    const frames = frameCountRef.current;
    const info = gl.info;

    onStats({
      fps: Math.round((frames * 1000) / elapsed),
      frameMs: Number((frameMsRef.current / Math.max(1, frames)).toFixed(1)),
      calls: Math.round(info.render.calls / Math.max(1, frames)),
      triangles: Math.round(info.render.triangles / Math.max(1, frames)),
      points: Math.round(info.render.points / Math.max(1, frames)),
      lines: Math.round(info.render.lines / Math.max(1, frames)),
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      pixelRatio: Number(gl.getPixelRatio().toFixed(2)),
      viewport: `${size.width}x${size.height}`,
    });

    gl.info.reset();
    frameCountRef.current = 0;
    frameMsRef.current = 0;
    lastSampleRef.current = now;
  });

  return null;
}

export default function App() {
  const screenMatch = window.location.pathname.match(/^\/screen\/([^/]+)/);
  const routeScreenId = screenMatch ? decodeURIComponent(screenMatch[1]) : '';
  const isLocalPreview = ['localhost', '127.0.0.1', ''].includes(window.location.hostname) || window.location.port === String(APP_PORT);
  const {
    isStarted,
    addRandomSampleLayer,
    triggerScaleNote,
    triggerFireworkBurst,
    fadeToSingleLayer,
    updateTreeLayers,
    restartTreeMusic,
    fadeTreeMusic,
    stopAllLayers,
    startAudio,
    setMusicEvolution,
    evolution,
    getAudioData,
    useSampleLibrary,
    setUseSampleLibrary
  } = useAudio();
  const { isHandOpen, openHandCount, hasHandDetected, isCameraActive, cameraError, startCamera, stopCamera } = useHandTracking();
  const [audioData, setAudioData] = useState(new Float32Array(1024));
  const [interactionPoint, setInteractionPoint] = useState<THREE.Vector3 | null>(null);
  const [fireworkScratchPoint, setFireworkScratchPoint] = useState<THREE.Vector3 | null>(null);
  const [mode, setMode] = useState<'idle' | 'interaction' | 'flow' | 'climax'>('idle');
  const [intensity, setIntensity] = useState(0.08);
  const [screenId, setScreenId] = useState(getInitialScreenId);
  const [isMaster, setIsMaster] = useState(() => localStorage.getItem('baofa-role') === 'master');
  const [isOverview, setIsOverview] = useState(() => localStorage.getItem('baofa-view') === 'overview');
  const [visualMode, setVisualMode] = useState<VisualMode>('tree');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [treeControlMode, setTreeControlMode] = useState<TreeControlMode>('manual');
  const [fireworkControlMode, setFireworkControlMode] = useState<TreeControlMode>('manual');
  const [fireworkState, setFireworkState] = useState<'standby' | 'launching' | 'resetting'>('standby');
  const [autoSceneOpacity, setAutoSceneOpacity] = useState(1);
  const [autoBlackout, setAutoBlackout] = useState(false);
  const [standbyWakeActive, setStandbyWakeActive] = useState(false);
  const [standbyWakeKey, setStandbyWakeKey] = useState(0);
  const [autoFishActive, setAutoFishActive] = useState(false);
  const [autoFishProgress, setAutoFishProgress] = useState(0);
  const [showScreenPanel, setShowScreenPanel] = useState(() => isLocalPreview);
  const [treeGrowth, setTreeGrowth] = useState(0);
  const [gestureActive, setGestureActive] = useState(false);
  const [treeTriggered, setTreeTriggered] = useState(false);
  const [gestureProgress, setGestureProgress] = useState(0);
  const [showGestureProgress, setShowGestureProgress] = useState(false);
  const [gestureStartPending, setGestureStartPending] = useState(false);
  const [gestureRoundLocked, setGestureRoundLocked] = useState(false);
  const [, setStandbyPromptReady] = useState(true);
  const [screenPulse, setScreenPulse] = useState<{ source: string; timestamp: number } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'error' | 'connecting'>('connecting');
  const [showControlStatus, setShowControlStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [showWebGLDebug, setShowWebGLDebug] = useState(false);
  const [hideForcedWebGLDebug, setHideForcedWebGLDebug] = useState(false);
  const [webglStats, setWebglStats] = useState<WebGLStats | null>(null);
  const [screenRoute, setScreenRoute] = useState<ScreenRoute | null>(null);
  const [screenRoutes, setScreenRoutes] = useState<Record<string, ScreenRoute>>({});
  const [screenPresentation, setScreenPresentation] = useState<ScreenPresentation>({
    autoRedirect: true,
    showDebug: isLocalPreview,
    showMenu: isLocalPreview,
  });
  const [screenRouteError, setScreenRouteError] = useState('');
  const intensityRef = useRef(0.08);
  const lastClickTimeRef = useRef(0);
  const fireworkClickStreakRef = useRef(0);
  const treeGrowthRef = useRef(0);
  const treeTriggeredRef = useRef(false);
  const treeCompletedAtRef = useRef<number | null>(null);
  const treeBrightAtRef = useRef<number | null>(null);
  const treeFadingRef = useRef(false);
  const treePhaseRef = useRef<TreePhase>('idle');
  const treeControllerRef = useRef(false);
  const gestureProgressRef = useRef(0);
  const gestureCompletedRef = useRef(false);
  const gestureRoundLockedRef = useRef(false);
  const gestureNeedsReleaseRef = useRef(false);
  const gestureInputArmedRef = useRef(false);
  const lastFrameTimeRef = useRef<number | null>(null);
  const gestureStartTimeoutRef = useRef<number | null>(null);
  const standbyPromptTimeoutRef = useRef<number | null>(null);
  const fireworkScratchTimeoutRef = useRef<number | null>(null);
  const autoTimelineTimersRef = useRef<number[]>([]);
  const autoTreeActiveRef = useRef(false);
  const autoFireworkActiveRef = useRef(false);
  const audioAutoStartAllowedRef = useRef(true);
  const autoFishStartedAtRef = useRef<number | null>(null);
  const standbyWakeTimerRef = useRef<number | null>(null);
  const staleTreeResetRef = useRef(false);
  const evolutionRef = useRef(evolution);
  const lastSyncTimeRef = useRef<number>(Date.now());
  const requestRef = useRef<number>(null);
  const showControlRef = useRef<ReturnType<typeof createShowControlClient> | null>(null);
  const showControlClientIdRef = useRef<string | null>(null);
  if (!showControlClientIdRef.current) {
    showControlClientIdRef.current = createShowControlClientId(screenId);
  }
  const showControlCommandRef = useRef<(command: ControlCommand) => void>(() => undefined);
  const useSampleLibraryRef = useRef(useSampleLibrary);
  const refreshScreenState = useCallback(async (signal?: AbortSignal) => {
    try {
      const { routes, presentation } = await fetchScreenState(signal);
      setScreenRoutes(routes);
      setScreenRoute(isKnownScreenId(routeScreenId) ? routes[routeScreenId] || null : null);
      setScreenPresentation(presentation);
      setScreenRouteError('');
    } catch (error) {
      if (signal?.aborted) return;
      setScreenRouteError(error instanceof Error ? error.message : String(error));
    }
  }, [routeScreenId]);

  useEffect(() => {
    useSampleLibraryRef.current = useSampleLibrary;
    if (!useSampleLibrary) {
      stopAllLayers();
    }
  }, [stopAllLayers, useSampleLibrary]);

  const checkConnection = useCallback(async () => {
    if (!db) {
      setConnectionStatus('error');
      return;
    }
    try {
      await getDocFromServer(doc(db, 'global', 'state'));
      setConnectionStatus('connected');
    } catch {
      setConnectionStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!db) {
      setConnectionStatus('error');
      return;
    }

    checkConnection();
    const unsub = onSnapshot(doc(db, 'global', 'state'), (snapshot) => {
      if (!snapshot.exists()) return;
      setConnectionStatus('connected');
      const data = snapshot.data();
      const remoteTreePhase: TreePhase =
        data.treePhase === 'growing' || data.treePhase === 'bright' || data.treePhase === 'fading'
          ? data.treePhase
          : data.treeGrowth > 0.01
            ? 'growing'
            : 'idle';
      const remoteTreeActive = remoteTreePhase === 'growing' || remoteTreePhase === 'bright' || remoteTreePhase === 'fading';
      const ignoreRemoteTreeState = treeControllerRef.current && treeTriggeredRef.current && remoteTreeActive;

      if (typeof data.evolution === 'number' && !ignoreRemoteTreeState) {
        evolutionRef.current = data.evolution;
        setMusicEvolution(data.evolution);
      }
      if (data.mode && !ignoreRemoteTreeState) setMode(data.mode);
      if (typeof data.intensity === 'number' && !ignoreRemoteTreeState) {
        intensityRef.current = data.intensity;
        setIntensity(data.intensity);
      }
      if (typeof data.treeGrowth === 'number') {
        const hasRemoteTreePhase =
          data.treePhase === 'growing' || data.treePhase === 'bright' || data.treePhase === 'fading' || data.treePhase === 'idle';
        const lastInteractionTime = typeof data.lastInteraction?.timestamp === 'number' ? data.lastInteraction.timestamp : 0;
        const isRemoteActiveRound = hasRemoteTreePhase && remoteTreeActive;
        const isStaleTreeState =
          data.treeGrowth > 0.01 &&
          !isRemoteActiveRound &&
          lastInteractionTime > 0 &&
          Date.now() - lastInteractionTime > STALE_TREE_STATE_MS;

        if (isStaleTreeState && !staleTreeResetRef.current) {
          staleTreeResetRef.current = true;
          gestureProgressRef.current = 0;
          gestureCompletedRef.current = false;
          gestureRoundLockedRef.current = false;
          gestureNeedsReleaseRef.current = false;
          gestureInputArmedRef.current = false;
          treeGrowthRef.current = 0;
          treeTriggeredRef.current = false;
          treeCompletedAtRef.current = null;
          treeBrightAtRef.current = null;
          treeFadingRef.current = false;
          treePhaseRef.current = 'idle';
          treeControllerRef.current = false;
          autoTreeActiveRef.current = false;
          if (treeControlMode === 'auto') {
            setAutoSceneOpacity(0);
            setAutoBlackout(true);
          }
          intensityRef.current = 0.08;
          evolutionRef.current = 0;
          setTreeGrowth(0);
          setTreeTriggered(false);
          setGestureActive(false);
          setGestureProgress(0);
          setShowGestureProgress(false);
          setGestureStartPending(false);
          setGestureRoundLocked(false);
          setStandbyPromptReady(true);
          setIntensity(0.08);
          setMusicEvolution(0);
          stopAllLayers();
          setMode('idle');
          syncToFirebase({ treeGrowth: 0, treePhase: 'idle', gestureActive: false, intensity: 0.08, evolution: 0, mode: 'idle' });
          return;
        }

        if (ignoreRemoteTreeState) return;

        staleTreeResetRef.current = data.treeGrowth <= 0.01 ? false : staleTreeResetRef.current;
        treeGrowthRef.current = data.treeGrowth;
        setTreeGrowth(data.treeGrowth);
        treeTriggeredRef.current = data.treeGrowth > 0.01;
        setTreeTriggered(data.treeGrowth > 0.01);
        const keepLocalFading = treeFadingRef.current && data.treeGrowth > 0.01 && remoteTreePhase !== 'idle';
        treePhaseRef.current = keepLocalFading ? 'fading' : remoteTreePhase;
        treeFadingRef.current = keepLocalFading || remoteTreePhase === 'fading';
        if (remoteTreePhase === 'idle' || (data.treeGrowth < 0.99 && remoteTreePhase !== 'fading')) {
          treeCompletedAtRef.current = null;
          treeBrightAtRef.current = null;
        }
      }
      if (typeof data.gestureActive === 'boolean') setGestureActive(data.gestureActive);
      if (data.lastInteraction && data.lastInteraction.timestamp > lastSyncTimeRef.current) {
        lastSyncTimeRef.current = data.lastInteraction.timestamp;
        setInteractionPoint(new THREE.Vector3(data.lastInteraction.x, data.lastInteraction.y, data.lastInteraction.z));
      }
      if (data.screenPulse && typeof data.screenPulse.timestamp === 'number') {
        const source = isKnownScreenId(data.screenPulse.source) ? data.screenPulse.source : DEFAULT_SCREEN_ID;
        setScreenPulse({ source, timestamp: data.screenPulse.timestamp });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'global/state');
    });

    return () => unsub();
  }, [checkConnection, setMusicEvolution, stopAllLayers]);

  const syncToFirebase = useCallback(async (updates: any) => {
    if (!db) return;
    try {
      await setDoc(doc(db, 'global', 'state'), updates, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'global/state');
    }
  }, []);

  const clearAutoTimeline = useCallback(() => {
    autoTimelineTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    autoTimelineTimersRef.current = [];
    autoTreeActiveRef.current = false;
    autoFireworkActiveRef.current = false;
    autoFishStartedAtRef.current = null;
    setAutoFishActive(false);
    setAutoFishProgress(0);
  }, []);

  const stopStandbyWake = useCallback(() => {
    if (standbyWakeTimerRef.current) {
      window.clearTimeout(standbyWakeTimerRef.current);
      standbyWakeTimerRef.current = null;
    }
    setStandbyWakeActive(false);
  }, []);

  const startStandbyWake = useCallback(() => {
    if (standbyWakeTimerRef.current) window.clearTimeout(standbyWakeTimerRef.current);
    setStandbyWakeKey((value) => value + 1);
    setStandbyWakeActive(true);
    standbyWakeTimerRef.current = window.setTimeout(() => {
      standbyWakeTimerRef.current = null;
      setStandbyWakeActive(false);
    }, STANDBY_WAKE_TOTAL_MS + 900);
  }, []);

  const scheduleStandbyPrompt = useCallback((delayMs = STANDBY_PROMPT_DELAY_MS, armGestureInput = true) => {
    gestureInputArmedRef.current = armGestureInput;
    setStandbyPromptReady(false);
    if (standbyPromptTimeoutRef.current) window.clearTimeout(standbyPromptTimeoutRef.current);
    standbyPromptTimeoutRef.current = window.setTimeout(() => {
      standbyPromptTimeoutRef.current = null;
      setStandbyPromptReady(true);
    }, delayMs);
  }, []);

  const startGestureGrowth = useCallback(() => {
    if (treeTriggeredRef.current) return;
    const treeBasePoint = getScreenWorldPoint('F1');
    gestureProgressRef.current = 0;
    gestureCompletedRef.current = false;
    gestureRoundLockedRef.current = true;
    gestureNeedsReleaseRef.current = false;
    setGestureProgress(0);
    setShowGestureProgress(false);
    setGestureStartPending(false);
    setGestureRoundLocked(true);
    treeCompletedAtRef.current = null;
    treeBrightAtRef.current = null;
    treeFadingRef.current = false;
    treePhaseRef.current = 'growing';
    treeControllerRef.current = true;
    treeTriggeredRef.current = true;
    treeGrowthRef.current = Math.max(treeGrowthRef.current, 0.08);
    setTreeTriggered(true);
    setTreeGrowth(treeGrowthRef.current);
    setGestureActive(true);
    setMode('flow');
    intensityRef.current = Math.max(intensityRef.current, 0.72);
    syncToFirebase({
      treeGrowth: treeGrowthRef.current,
      treePhase: treePhaseRef.current,
      gestureActive: true,
      intensity: intensityRef.current,
      mode: 'flow',
      lastInteraction: { x: treeBasePoint.x, y: treeBasePoint.y, z: treeBasePoint.z, timestamp: Date.now() },
    });
  }, [syncToFirebase]);

  const animate = useCallback(() => {
    const now = performance.now();
    const deltaMs = lastFrameTimeRef.current === null ? 16.67 : Math.min(80, now - lastFrameTimeRef.current);
    lastFrameTimeRef.current = now;

    setAudioData(getAudioData());

    const handGestureActive = isCameraActive && hasHandDetected && isHandOpen && openHandCount > 0;
    if (gestureNeedsReleaseRef.current && !handGestureActive) {
      gestureNeedsReleaseRef.current = false;
    }
    const manualTreeGestureInput = visualMode === 'tree' && treeControlMode === 'manual';
    const handGestureEligible = handGestureActive && (gestureInputArmedRef.current || manualTreeGestureInput) && !gestureNeedsReleaseRef.current;
    if (!treeTriggeredRef.current && !gestureCompletedRef.current && !gestureRoundLockedRef.current) {
      const direction = handGestureEligible ? 1 : -1;
      const duration = handGestureEligible ? GESTURE_CONFIRM_MS : GESTURE_RETREAT_MS;
      const nextProgress = THREE.MathUtils.clamp(
        gestureProgressRef.current + direction * (deltaMs / duration),
        0,
        1
      );

      if (handGestureEligible || nextProgress > 0) {
        setShowGestureProgress(true);
      } else if (gestureProgressRef.current > 0) {
        setShowGestureProgress(false);
      }

      if (Math.abs(nextProgress - gestureProgressRef.current) > 0.001 || nextProgress === 0 || nextProgress === 1) {
        gestureProgressRef.current = nextProgress;
        setGestureProgress(nextProgress);
        if (soundEnabled && nextProgress > 0) {
          fadeToSingleLayer(nextProgress);
        }
      }

      if (nextProgress >= 1) {
        gestureCompletedRef.current = true;
        gestureRoundLockedRef.current = true;
        setGestureStartPending(true);
        setGestureRoundLocked(true);
        setShowGestureProgress(false);
        if (gestureStartTimeoutRef.current) window.clearTimeout(gestureStartTimeoutRef.current);
        gestureStartTimeoutRef.current = window.setTimeout(() => {
          gestureStartTimeoutRef.current = null;
          startGestureGrowth();
        }, GESTURE_FADE_MS);
      }
    }

    if (treeTriggeredRef.current && treeControllerRef.current) {
      if (treeFadingRef.current) {
        treeGrowthRef.current = Math.max(0, treeGrowthRef.current - deltaMs / TREE_FADE_MS);
        intensityRef.current = Math.max(0.08, intensityRef.current - deltaMs / TREE_FADE_MS);
        evolutionRef.current = Math.max(0, evolutionRef.current - deltaMs / TREE_FADE_MS);
        setMusicEvolution(evolutionRef.current);
        if (soundEnabled && audioAutoStartAllowedRef.current) {
          updateTreeLayers(treeGrowthRef.current, evolutionRef.current, true);
        }
        if (treeGrowthRef.current <= 0.001) {
          treeGrowthRef.current = 0;
          treeTriggeredRef.current = false;
          treeCompletedAtRef.current = null;
          treeBrightAtRef.current = null;
          treeFadingRef.current = false;
          treePhaseRef.current = 'idle';
          treeControllerRef.current = false;
          intensityRef.current = 0.08;
          evolutionRef.current = 0;
          setMusicEvolution(0);
          stopAllLayers();
          setTreeTriggered(false);
          setGestureActive(false);
          gestureRoundLockedRef.current = false;
          setGestureRoundLocked(false);
          gestureNeedsReleaseRef.current = false;
          gestureInputArmedRef.current = false;
          setMode('idle');
          syncToFirebase({ treeGrowth: 0, treePhase: 'idle', gestureActive: false, intensity: 0.08, evolution: 0, mode: 'idle' });
          if (treeControlMode === 'auto') {
            setAutoSceneOpacity(0);
            setAutoBlackout(true);
            const endBlackoutTimer = window.setTimeout(() => {
              setTreeControlMode('manual');
              setAutoBlackout(false);
              setAutoSceneOpacity(1);
              scheduleStandbyPrompt(0, false);
            }, AUTO_END_BLACKOUT_MS);
            autoTimelineTimersRef.current.push(endBlackoutTimer);
          } else {
            scheduleStandbyPrompt(ROUND_STANDBY_PROMPT_DELAY_MS, false);
          }
        }
      } else {
        const speed = autoTreeActiveRef.current
          ? 0.0018
          : 0.01 + (handGestureActive ? openHandCount * 0.009 : 0.004);
        treeGrowthRef.current = Math.min(1, treeGrowthRef.current + speed);
        if (treeGrowthRef.current >= 1) {
          treeCompletedAtRef.current ??= Date.now();
          intensityRef.current = Math.min(1, intensityRef.current + 0.01);
          evolutionRef.current = Math.min(1, evolutionRef.current + 0.004);
          setMusicEvolution(evolutionRef.current);
          if (soundEnabled && audioAutoStartAllowedRef.current) {
            updateTreeLayers(treeGrowthRef.current, evolutionRef.current, false);
          }

          const completedElapsed = Date.now() - treeCompletedAtRef.current;
          const colorRampMs = autoTreeActiveRef.current ? 7000 : TREE_COLOR_RAMP_MS;
          if (
            (intensityRef.current >= 0.995 && evolutionRef.current >= 0.995) ||
            completedElapsed > colorRampMs
          ) {
            treeBrightAtRef.current ??= Date.now();
            treePhaseRef.current = 'bright';
          }

          const brightHoldMs = autoTreeActiveRef.current ? 5500 : TREE_BRIGHT_HOLD_MS;
          if (treeBrightAtRef.current && Date.now() - treeBrightAtRef.current > brightHoldMs) {
            treeFadingRef.current = true;
            treePhaseRef.current = 'fading';
            setMode('flow');
            if (autoTreeActiveRef.current && soundEnabled && audioAutoStartAllowedRef.current) {
              fadeTreeMusic(TREE_FADE_MS / 1000);
            }
          }
        } else {
          treePhaseRef.current = 'growing';
          if (soundEnabled && audioAutoStartAllowedRef.current) {
            updateTreeLayers(treeGrowthRef.current, evolutionRef.current, false);
          }
        }
      }
      setTreeGrowth(treeGrowthRef.current);
    }

    if (treeControllerRef.current || !treeTriggeredRef.current) {
      const manualTreeGestureInput = visualMode === 'tree' && treeControlMode === 'manual';
      setGestureActive(treeFadingRef.current ? false : handGestureActive && (gestureInputArmedRef.current || manualTreeGestureInput || treeTriggeredRef.current));
      const floor = treeFadingRef.current ? 0.02 : treeGrowthRef.current > 0 ? 0.12 + treeGrowthRef.current * 0.18 : 0.02;
      intensityRef.current = treeFadingRef.current ? intensityRef.current : Math.max(floor, intensityRef.current - 0.006);
      setIntensity(intensityRef.current);
    }

    if (autoFishStartedAtRef.current !== null) {
      const nextProgress = THREE.MathUtils.clamp((performance.now() - autoFishStartedAtRef.current) / AUTO_FISH_DURATION_MS, 0, 1);
      setAutoFishProgress(nextProgress);
      if (nextProgress >= 1) {
        autoFishStartedAtRef.current = null;
        setAutoFishActive(false);
      }
    }

    if (soundEnabled && audioAutoStartAllowedRef.current && visualMode === 'tree' && !treeControllerRef.current) {
      updateTreeLayers(treeGrowthRef.current, evolutionRef.current, treeFadingRef.current);
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [fadeToSingleLayer, fadeTreeMusic, getAudioData, hasHandDetected, isCameraActive, isHandOpen, openHandCount, scheduleStandbyPrompt, setMusicEvolution, soundEnabled, startGestureGrowth, stopAllLayers, syncToFirebase, treeControlMode, updateTreeLayers, visualMode]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [animate]);

  useEffect(() => {
    return () => {
      if (gestureStartTimeoutRef.current) window.clearTimeout(gestureStartTimeoutRef.current);
      if (standbyPromptTimeoutRef.current) window.clearTimeout(standbyPromptTimeoutRef.current);
      if (fireworkScratchTimeoutRef.current) window.clearTimeout(fireworkScratchTimeoutRef.current);
      if (standbyWakeTimerRef.current) window.clearTimeout(standbyWakeTimerRef.current);
      clearAutoTimeline();
    };
  }, [clearAutoTimeline, setVisualMode]);

  useEffect(() => {
    if (!treeTriggered || !treeControllerRef.current) return;
    const id = window.setInterval(() => {
      syncToFirebase({
        treeGrowth: treeGrowthRef.current,
        treePhase: treePhaseRef.current,
        gestureActive,
        intensity: intensityRef.current,
        evolution: evolutionRef.current,
        mode: 'flow',
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [gestureActive, syncToFirebase, treeTriggered]);

  useEffect(() => {
    localStorage.setItem('baofa-screen-id', screenId);
  }, [screenId]);

  useEffect(() => {
    if (!isKnownScreenId(routeScreenId)) return;
    setScreenId(routeScreenId);
    setIsMaster(false);
    setIsOverview(false);
  }, [routeScreenId]);

  useEffect(() => {
    const controller = new AbortController();
    let timer = 0;

    const loadRoute = async () => {
      await refreshScreenState(controller.signal);
      if (!controller.signal.aborted) {
        timer = window.setTimeout(loadRoute, 2000);
      }
    };

    void loadRoute();

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [refreshScreenState]);

  useEffect(() => {
    if (!isKnownScreenId(routeScreenId)) return;
    if (!screenRoute || screenRoute.owner === 'baofa' || !screenPresentation.autoRedirect) return;
    if (screenRoute.owner === 'vj' && screenRoute.url) {
      const targetUrl = screenRoute.url;
      window.location.replace(targetUrl);
    }
  }, [routeScreenId, screenPresentation.autoRedirect, screenRoute]);

  useEffect(() => {
    localStorage.setItem('baofa-role', isOverview ? 'overview' : 'screen');
  }, [isOverview]);

  useEffect(() => {
    localStorage.setItem('baofa-view', isOverview ? 'overview' : 'screen');
  }, [isOverview]);

  useEffect(() => {
    if (visualMode !== 'firework') return;
    stopAllLayers();
    setMusicEvolution(0);
    evolutionRef.current = 0;
  }, [setMusicEvolution, stopAllLayers, visualMode]);

  const resetTreeGrowth = (allowAudioStart = true) => {
    const shouldRestartAuto = treeControlMode === 'auto';
    clearAutoTimeline();
    stopStandbyWake();
    if (!shouldRestartAuto) {
      setTreeControlMode('manual');
      setAutoBlackout(false);
      setAutoSceneOpacity(1);
    } else {
      setAutoBlackout(true);
      setAutoSceneOpacity(0);
    }
    if (gestureStartTimeoutRef.current) {
      window.clearTimeout(gestureStartTimeoutRef.current);
      gestureStartTimeoutRef.current = null;
    }
    gestureProgressRef.current = 0;
    gestureCompletedRef.current = false;
    gestureRoundLockedRef.current = false;
    gestureNeedsReleaseRef.current = false;
    gestureInputArmedRef.current = false;
    treeGrowthRef.current = 0;
    treeTriggeredRef.current = false;
    treeCompletedAtRef.current = null;
    treeBrightAtRef.current = null;
    treeFadingRef.current = false;
    treePhaseRef.current = 'idle';
    treeControllerRef.current = false;
    intensityRef.current = 0.08;
    evolutionRef.current = 0;
    setTreeGrowth(0);
    setTreeTriggered(false);
    setGestureActive(false);
    setGestureProgress(0);
    setShowGestureProgress(false);
    setGestureStartPending(false);
    setGestureRoundLocked(false);
    setStandbyPromptReady(true);
    setIntensity(0.08);
    setMusicEvolution(0);
    stopAllLayers();
    setMode('idle');
    syncToFirebase({ treeGrowth: 0, treePhase: 'idle', gestureActive: false, intensity: 0.08, evolution: 0, mode: 'idle' });
    if (shouldRestartAuto) {
      window.setTimeout(() => {
        void startAutoTreeShow(allowAudioStart);
      }, 260);
    }
  };

  const applyEffectMode = (nextMode: 'idle' | 'interaction' | 'flow' | 'climax', nextIntensity: number) => {
    const clampedIntensity = Math.max(0, Math.min(1, nextIntensity));
    intensityRef.current = clampedIntensity;
    setIntensity(clampedIntensity);
    setVisualMode('tree');
    setMode(nextMode);
    if (nextMode !== 'idle') {
      treeTriggeredRef.current = true;
      treeGrowthRef.current = Math.max(treeGrowthRef.current, nextMode === 'climax' ? 0.82 : 0.24);
      setTreeTriggered(true);
      setTreeGrowth(treeGrowthRef.current);
    }
    syncToFirebase({
      mode: nextMode,
      visualMode: 'tree',
      intensity: clampedIntensity,
      treeGrowth: treeGrowthRef.current,
      gestureActive,
    });
  };

  const handleScreenChange = (id: string) => {
    if (!isKnownScreenId(id)) return;
    const nextScreenId = normalizeScreenOccupancyId(id) || id;
    setScreenId(nextScreenId);
    setIsMaster(false);
    setIsOverview(false);
  };

  const openOverviewRoute = useCallback(() => {
    localStorage.setItem('baofa-view', 'overview');
    setIsOverview(true);
    setIsMaster(false);
    window.location.assign('/');
  }, []);

  const openScreenRoute = useCallback(async (id: string) => {
    const route = screenRoutes[id];
    if (!route?.url) return;

    const currentScreenId = !isOverview ? normalizeScreenOccupancyId(screenId) || screenId : null;
    if (currentScreenId) {
      try {
        const state = await fetchScreenState();
        const occupiedClient = Object.values(state.clients).find((client) =>
          client.module === 'interaction' &&
          client.status === 'online' &&
          client.id !== showControlClientIdRef.current &&
          normalizeScreenOccupancyId(client.screenId) === normalizeScreenOccupancyId(id)
        );
        if (occupiedClient?.id) {
          showControlRef.current?.sendCommand({
            module: 'interaction',
            target: occupiedClient.id,
            command: 'setScreen',
            value: currentScreenId,
            issuedBy: showControlClientIdRef.current || 'baofa-screen',
          });
        }
      } catch {
        // If occupancy lookup fails, continue with the navigation. The route still resolves.
      }
    }

    localStorage.setItem('baofa-view', 'screen');
    setIsOverview(false);
    setIsMaster(false);
    window.location.assign(route.url);
  }, [isOverview, screenId, screenRoutes]);

  const triggerAutoPulse = useCallback((sourceScreen: string, power: number) => {
    const point = getScreenWorldPoint(sourceScreen);
    const timestamp = Date.now();
    const nextIntensity = Math.min(1, Math.max(intensityRef.current, 0.28 + power * 0.58));
    const nextEvolution = Math.min(0.52, evolutionRef.current + 0.028 + power * 0.022);

    intensityRef.current = nextIntensity;
    evolutionRef.current = nextEvolution;
    setIntensity(nextIntensity);
    setMusicEvolution(nextEvolution);
    setInteractionPoint(point);
    setScreenPulse({ source: sourceScreen, timestamp });
    setMode('interaction');
    window.setTimeout(() => {
      if (!autoTreeActiveRef.current) {
        setInteractionPoint(null);
        setMode('idle');
      }
    }, 1250);
    syncToFirebase({
      lastInteraction: { x: point.x, y: point.y, z: point.z, timestamp },
      screenPulse: { source: sourceScreen, timestamp },
      intensity: nextIntensity,
      evolution: nextEvolution,
      mode: 'interaction',
    });
  }, [setMusicEvolution, syncToFirebase]);

  const triggerFireworkAt = useCallback(async (
    point: THREE.Vector3,
    kind: FireworkBurstKind,
    sourceScreen = screenId,
    keepAliveMs = 650,
    allowAudioStart = true
  ) => {
    const timestamp = Date.now();
    const power = kind === 'large' ? 1 : kind === 'medium' ? 0.72 : 0.44;
    const nextIntensity = Math.min(1, Math.max(intensityRef.current, 0.2 + power * 0.8));
    const nextEvolution = Math.min(1, Math.max(evolutionRef.current, power));

    if (soundEnabled && allowAudioStart) {
      await triggerFireworkBurst(kind);
    }

    intensityRef.current = nextIntensity;
    evolutionRef.current = nextEvolution;
    setIntensity(nextIntensity);
    setMusicEvolution(nextEvolution);
    setInteractionPoint(point);
    setFireworkScratchPoint(point);
    setMode(kind === 'large' ? 'climax' : 'interaction');
    setScreenPulse({ source: sourceScreen, timestamp });
    if (fireworkScratchTimeoutRef.current) window.clearTimeout(fireworkScratchTimeoutRef.current);
    fireworkScratchTimeoutRef.current = window.setTimeout(() => {
      fireworkScratchTimeoutRef.current = null;
      setFireworkScratchPoint(null);
    }, Math.min(260, keepAliveMs));
    window.setTimeout(() => {
      if (!autoFireworkActiveRef.current) {
        setInteractionPoint(null);
        setMode('idle');
      }
    }, keepAliveMs);

    syncToFirebase({
      lastInteraction: { x: point.x, y: point.y, z: point.z, timestamp },
      screenPulse: { source: sourceScreen, timestamp },
      intensity: nextIntensity,
      evolution: nextEvolution,
      mode: kind === 'large' ? 'climax' : 'interaction',
      visualMode: 'firework',
    });
  }, [screenId, setMusicEvolution, soundEnabled, syncToFirebase, triggerFireworkBurst]);

  const triggerFireworkPanelBurst = useCallback((kind: FireworkPanelBurstKind) => {
    if (fireworkControlMode === 'auto') return;
    setFireworkState('launching');
    setVisualMode('firework');

    const sourceScreen = isOverview ? 'F1' : screenId;
    const center = new THREE.Vector3(0, 0, 0);
    const schedule = (delay: number, x: number, y: number, burstKind: FireworkBurstKind, keepAliveMs = 760) => {
      window.setTimeout(() => {
        void triggerFireworkAt(new THREE.Vector3(x, y, 0), burstKind, sourceScreen, keepAliveMs);
      }, delay);
    };

    if (kind === 'small') {
      schedule(0, center.x, center.y, 'small', 680);
      return;
    }

    if (kind === 'medium') {
      [
        [-0.55, 0.24],
        [0.2, -0.16],
        [0.72, 0.18],
      ].forEach(([x, y], index) => schedule(index * 130, x, y, 'medium', 760));
      return;
    }

    if (kind === 'large') {
      [
        [-1.2, 0.74],
        [-0.35, 0.14],
        [0.52, -0.32],
        [1.36, 0.4],
        [0.1, 0.9],
        [-0.72, -0.56],
      ].forEach(([x, y], index) => schedule(index * 115, x, y, 'large', 980));
      return;
    }

    [
      [-2.3, 1.15],
      [-1.55, 0.35],
      [-0.8, -0.42],
      [0, 0.62],
      [0.82, -0.18],
      [1.65, 0.5],
      [2.45, -0.72],
      [1.1, 1.42],
      [-0.15, -1.22],
      [-1.25, 1.78],
    ].forEach(([x, y], index) => schedule(index * 105, x, y, 'large', 1120));
  }, [fireworkControlMode, isOverview, screenId, setVisualMode, triggerFireworkAt]);

  const startAutoFireworkShow = useCallback(async (allowAudioStart = true) => {
    clearAutoTimeline();
    audioAutoStartAllowedRef.current = allowAudioStart;
    stopStandbyWake();
    setVisualMode('firework');
    setFireworkControlMode('auto');
    setFireworkState('launching');
    setTreeControlMode('manual');
    autoTreeActiveRef.current = false;
    autoFireworkActiveRef.current = true;
    fireworkClickStreakRef.current = 0;
    intensityRef.current = 0.16;
    evolutionRef.current = 0;
    setIntensity(0.16);
    setMusicEvolution(0);
    setInteractionPoint(null);
    setFireworkScratchPoint(null);
    setMode('idle');
    setAutoBlackout(true);
    setAutoSceneOpacity(0);
    setAutoFishActive(false);
    setAutoFishProgress(0);
    autoFishStartedAtRef.current = null;
    stopAllLayers();

    if (soundEnabled && allowAudioStart) {
      await startAudio().catch(() => undefined);
    }

    syncToFirebase({ visualMode: 'firework', mode: 'idle', intensity: 0.16, evolution: 0, fireworkState: 'launching' });

    const revealTimer = window.setTimeout(() => {
      setAutoBlackout(false);
      setAutoSceneOpacity(1);
    }, 260);
    autoTimelineTimersRef.current.push(revealTimer);

    const screenIds = SHOW_SCREEN_LAYOUT_ITEMS.map((screen) => screen.id);
    const shuffledScreenIds = [...screenIds].sort(() => Math.random() - 0.5);
    const firstWave = shuffledScreenIds.map((screen, index) => ({
      t: 300 + index * (AUTO_FIREWORK_DURATION_MS * 0.42 / Math.max(1, shuffledScreenIds.length)),
      screen,
      kind: (['small', 'medium', 'large'] as FireworkBurstKind[])[index % 3],
    }));
    const extraBursts = Array.from({ length: 18 }, (_, index) => {
      const screen = screenIds[Math.floor(Math.random() * screenIds.length)];
      const kindPool: FireworkBurstKind[] = index % 7 === 0 ? ['large', 'large', 'medium'] : ['small', 'medium', 'large'];
      return {
        t: 1500 + Math.random() * (AUTO_FIREWORK_DURATION_MS - 1700),
        screen,
        kind: kindPool[Math.floor(Math.random() * kindPool.length)],
      };
    });
    const randomPlan = [...firstWave, ...extraBursts]
      .sort((a, b) => a.t - b.t)
      .map(({ t, screen, kind }) => {
        const center = getScreenWorldPoint(screen);
        const spread = screen === 'A1' ? 2.4 : 4.2;
        const x = center.x + (Math.random() - 0.5) * spread * 2;
        const y = center.y + (Math.random() - 0.5) * spread * 1.4;
        return { t, screen, kind, point: new THREE.Vector3(x, y, 0) };
      });

    randomPlan.forEach(({ t, screen, kind, point }) => {
      const timer = window.setTimeout(() => {
        void triggerFireworkAt(point, kind, screen, kind === 'large' ? 920 : 620, allowAudioStart);
      }, AUTO_REVEAL_MS + t);
      autoTimelineTimersRef.current.push(timer);
    });

    const endTimer = window.setTimeout(() => {
      autoFireworkActiveRef.current = false;
      setInteractionPoint(null);
      setFireworkScratchPoint(null);
      setMode('idle');
      setFireworkState('standby');
      intensityRef.current = 0.08;
      evolutionRef.current = 0;
      setIntensity(0.08);
      setMusicEvolution(0);
      stopAllLayers();
      setAutoSceneOpacity(0);
      setAutoBlackout(true);
      setVisualMode('firework');
      syncToFirebase({ visualMode: 'firework', mode: 'idle', intensity: 0.08, evolution: 0, fireworkState: 'standby' });
      const blackoutTimer = window.setTimeout(() => {
        setFireworkControlMode('manual');
        setAutoBlackout(false);
        setAutoSceneOpacity(1);
      }, AUTO_END_BLACKOUT_MS);
      autoTimelineTimersRef.current.push(blackoutTimer);
    }, AUTO_REVEAL_MS + AUTO_FIREWORK_DURATION_MS);
    autoTimelineTimersRef.current.push(endTimer);
  }, [clearAutoTimeline, screenId, setFireworkState, setMusicEvolution, setVisualMode, soundEnabled, startAudio, stopAllLayers, stopStandbyWake, syncToFirebase, triggerFireworkAt]);

  const startAutoTreeShow = useCallback(async (allowAudioStart = true) => {
    clearAutoTimeline();
    audioAutoStartAllowedRef.current = allowAudioStart;
    setVisualMode('tree');
    setTreeControlMode('auto');
    setFireworkControlMode('manual');
    treeGrowthRef.current = 0;
    treeTriggeredRef.current = false;
    treeCompletedAtRef.current = null;
    treeBrightAtRef.current = null;
    treeFadingRef.current = false;
    treePhaseRef.current = 'idle';
    treeControllerRef.current = false;
    autoTreeActiveRef.current = false;
    setAutoBlackout(true);
    setAutoSceneOpacity(0);
    setAutoFishActive(false);
    setAutoFishProgress(0);
    autoFishStartedAtRef.current = null;
    gestureProgressRef.current = 0;
    gestureCompletedRef.current = false;
    gestureRoundLockedRef.current = false;
    gestureNeedsReleaseRef.current = false;
    gestureInputArmedRef.current = false;
    intensityRef.current = 0.14;
    evolutionRef.current = 0;
    setTreeGrowth(0);
    setTreeTriggered(false);
    setGestureActive(false);
    setGestureProgress(0);
    setShowGestureProgress(false);
    setGestureStartPending(false);
    setGestureRoundLocked(false);
    setIntensity(0.14);
    setMusicEvolution(0);
    setMode('idle');
    setInteractionPoint(null);
    setScreenPulse(null);

    if (soundEnabled && allowAudioStart) {
      await startAudio();
      restartTreeMusic(false, AUTO_MUSIC_PLAYBACK_RATE);
      updateTreeLayers(0, 0, false);
    }

    syncToFirebase({ treeGrowth: 0, treePhase: 'idle', gestureActive: false, intensity: 0.14, evolution: 0, mode: 'idle', visualMode: 'tree' });

    const revealTimer = window.setTimeout(() => {
      setAutoBlackout(false);
      setAutoSceneOpacity(1);
    }, 260);
    autoTimelineTimersRef.current.push(revealTimer);

    const fishTimer = window.setTimeout(() => {
      autoFishStartedAtRef.current = performance.now();
      setAutoFishProgress(0);
      setAutoFishActive(true);
    }, AUTO_REVEAL_MS);
    autoTimelineTimersRef.current.push(fishTimer);

    const pathPulses = AUTO_FISH_PATH.flatMap((screen, index) => {
      const travelLeaveProgress = index >= AUTO_FISH_PATH.length - 1 ? 1 : (index + 1) / (AUTO_FISH_PATH.length - 1);
      const leaveProgress = AUTO_FISH_GATHER_FRACTION + travelLeaveProgress * (1 - AUTO_FISH_GATHER_FRACTION);
      const at = AUTO_REVEAL_MS + leaveProgress * AUTO_FISH_DURATION_MS + 220;
      const power = Math.min(1, 0.5 + index * 0.052);
      return index === 4 || index === 9 || index === AUTO_FISH_PATH.length - 1
        ? [
            { at, screen, power },
            { at: at + 320, screen, power: Math.min(1, power + 0.18) },
          ]
        : [{ at, screen, power }];
    });

    const pulses = pathPulses.sort((a, b) => a.at - b.at);

    pulses.forEach(({ at, screen, power }) => {
      const timer = window.setTimeout(() => triggerAutoPulse(screen, power), at);
      autoTimelineTimersRef.current.push(timer);
    });

    const growTimer = window.setTimeout(() => {
      const treeBasePoint = getScreenWorldPoint('F1');
      autoTreeActiveRef.current = true;
      treeControllerRef.current = true;
      treeTriggeredRef.current = true;
      treeGrowthRef.current = 0.08;
      treePhaseRef.current = 'growing';
      intensityRef.current = 0.72;
      evolutionRef.current = Math.max(evolutionRef.current, 0.2);
      setTreeTriggered(true);
      setTreeGrowth(treeGrowthRef.current);
      setGestureActive(true);
      setMode('flow');
      setInteractionPoint(null);
      setMusicEvolution(evolutionRef.current);
      if (soundEnabled && audioAutoStartAllowedRef.current) {
        updateTreeLayers(treeGrowthRef.current, evolutionRef.current, false);
      }
      syncToFirebase({
        treeGrowth: treeGrowthRef.current,
        treePhase: treePhaseRef.current,
        gestureActive: true,
        intensity: intensityRef.current,
        evolution: evolutionRef.current,
        mode: 'flow',
        lastInteraction: { x: treeBasePoint.x, y: treeBasePoint.y, z: treeBasePoint.z, timestamp: Date.now() },
      });
    }, AUTO_REVEAL_MS + AUTO_FISH_DURATION_MS + 2500);
    autoTimelineTimersRef.current.push(growTimer);
  }, [clearAutoTimeline, restartTreeMusic, setMusicEvolution, soundEnabled, startAudio, syncToFirebase, triggerAutoPulse, updateTreeLayers]);

  const setManualTreeControl = useCallback(() => {
    clearAutoTimeline();
    stopStandbyWake();
    setTreeControlMode('manual');
    setAutoBlackout(false);
    setAutoSceneOpacity(1);
  }, [clearAutoTimeline, stopStandbyWake]);

  const setManualFireworkControl = useCallback(() => {
    clearAutoTimeline();
    stopStandbyWake();
    setFireworkControlMode('manual');
    setVisualMode('firework');
    setFireworkState('standby');
    setAutoBlackout(false);
    setAutoSceneOpacity(1);
    autoFireworkActiveRef.current = false;
  }, [clearAutoTimeline, stopStandbyWake]);

  const handleSplashPointerDown = async (e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    audioAutoStartAllowedRef.current = true;

    const canStartIdleRound =
      treeGrowthRef.current <= 0 &&
      !treeTriggeredRef.current &&
      !gestureStartPending &&
      !gestureRoundLockedRef.current;
    if (canStartIdleRound) {
      scheduleStandbyPrompt(STANDBY_PROMPT_DELAY_MS, true);
    }

    if (soundEnabled && visualMode === 'tree') {
      await startAudio();
      updateTreeLayers(treeGrowthRef.current, evolutionRef.current, treeFadingRef.current);
    }

    if (visualMode === 'tree' && treeControlMode === 'auto') return;
    if (visualMode === 'firework' && fireworkControlMode === 'auto') return;

    const treeViewingOnly =
      visualMode === 'tree' &&
      (treeTriggeredRef.current || gestureProgressRef.current > 0 || showGestureProgress || gestureStartPending || gestureRoundLockedRef.current);
    if (treeViewingOnly) return;

    const sourceScreen = isOverview ? getScreenFromPointer(e.clientX, e.clientY, rect, screenId) : screenId;
    const pointerPoint = new THREE.Vector3(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
      0
    ).multiplyScalar(14);
    const point = visualMode === 'firework'
      ? pointerPoint
      : treeTriggeredRef.current
      ? new THREE.Vector3(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
          0
        ).multiplyScalar(14)
      : getScreenWorldPoint(sourceScreen);

    const now = Date.now();
    const gap = now - lastClickTimeRef.current;
    lastClickTimeRef.current = now;

    if (visualMode === 'firework') {
      fireworkClickStreakRef.current = gap < 260 ? fireworkClickStreakRef.current + 1 : 1;
      const burstKind: FireworkPanelBurstKind = fireworkClickStreakRef.current >= 10
        ? 'giant'
        : fireworkClickStreakRef.current >= 6
        ? 'large'
        : fireworkClickStreakRef.current >= 3
          ? 'medium'
          : 'small';
      if (burstKind === 'giant') {
        triggerFireworkPanelBurst('giant');
      } else {
        await triggerFireworkAt(point, burstKind, sourceScreen, burstKind === 'large' ? 980 : 680);
      }
      return;
    }

    if (soundEnabled && useSampleLibraryRef.current) {
      await addRandomSampleLayer();
    } else if (soundEnabled) {
      stopAllLayers();
      await triggerScaleNote();
    }
    setInteractionPoint(point);
    setMode('interaction');
    setScreenPulse({ source: sourceScreen, timestamp: Date.now() });

    const tempoBoost = gap < 180 ? 0.62 : gap < 320 ? 0.5 : gap < 520 ? 0.36 : gap < 780 ? 0.26 : 0.18;
    const newIntensity = treeTriggeredRef.current ? intensityRef.current : Math.min(1, intensityRef.current + tempoBoost);
    const newEvolution = treeTriggeredRef.current ? evolutionRef.current : Math.min(1, evolutionRef.current + 0.025);
    intensityRef.current = newIntensity;
    evolutionRef.current = newEvolution;
    setMusicEvolution(newEvolution);

    syncToFirebase({
      lastInteraction: { x: point.x, y: point.y, z: point.z, timestamp: now },
      screenPulse: { source: sourceScreen, timestamp: now },
      intensity: newIntensity,
      evolution: newEvolution,
      mode: treeTriggeredRef.current ? 'flow' : 'interaction',
    });
  };

  const handleSplashPointerMove = (e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const point = new THREE.Vector3(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
      0
    ).multiplyScalar(14);

    if (visualMode === 'firework') {
      setFireworkScratchPoint(point);
      if (fireworkScratchTimeoutRef.current) window.clearTimeout(fireworkScratchTimeoutRef.current);
      fireworkScratchTimeoutRef.current = window.setTimeout(() => {
        fireworkScratchTimeoutRef.current = null;
        setFireworkScratchPoint(null);
      }, 120);
    }
    if (mode !== 'interaction') return;
    setInteractionPoint(point);
  };

  const handleSplashPointerUp = () => {
    setTimeout(() => {
      setInteractionPoint(null);
      setMode(treeTriggeredRef.current ? 'flow' : 'idle');
    }, 650);
  };

  const applyShowControlCommand = useCallback((command: ControlCommand) => {
    if (command.module && command.module !== 'interaction' && command.module !== 'show') return;
    const value = command.value;

    if ((command.command === 'setMode' || command.command === 'setInteractionMode') && typeof value === 'string') {
      if (value === 'idle' || value === 'interaction' || value === 'flow' || value === 'climax') {
        clearAutoTimeline();
        setTreeControlMode('manual');
        setFireworkControlMode('manual');
        setFireworkState('standby');
        setAutoBlackout(false);
        setAutoSceneOpacity(1);
        const preset = effectModes.find((effect) => effect.mode === value);
        if (preset) {
          applyEffectMode(preset.mode, preset.intensity);
        }
      }
    } else if (command.command === 'setIntensity' && typeof value === 'number') {
      const next = Math.max(0, Math.min(1, value));
      intensityRef.current = next;
      setIntensity(next);
      syncToFirebase({ intensity: next });
    } else if (command.command === 'resetTree') {
      resetTreeGrowth(false);
    } else if (command.command === 'setVisualMode' && typeof value === 'string') {
      if (value === 'tree' || value === 'firework') {
        clearAutoTimeline();
        setTreeControlMode('manual');
        setFireworkControlMode('manual');
        setFireworkState('standby');
        setAutoBlackout(false);
        setAutoSceneOpacity(1);
        setVisualMode(value);
      }
    } else if (command.command === 'setFireworkState' && typeof value === 'string') {
      if (value === 'standby') {
        clearAutoTimeline();
        setManualFireworkControl();
        setMode('idle');
        setIntensity(0.08);
        setMusicEvolution(0);
        setInteractionPoint(null);
        setFireworkScratchPoint(null);
        stopAllLayers();
      } else if (value === 'launching') {
        clearAutoTimeline();
        void startAutoFireworkShow(true);
      } else if (value === 'resetting') {
        clearAutoTimeline();
        setFireworkState('resetting');
        setFireworkControlMode('manual');
        setAutoBlackout(false);
        setAutoSceneOpacity(1);
        autoFireworkActiveRef.current = false;
        setVisualMode('firework');
        setMode('idle');
        setIntensity(0.08);
        setMusicEvolution(0);
        setInteractionPoint(null);
        setFireworkScratchPoint(null);
        stopAllLayers();
        syncToFirebase({ visualMode: 'firework', mode: 'idle', intensity: 0.08, evolution: 0, fireworkState: 'resetting' });
        window.setTimeout(() => {
          setFireworkState('standby');
          syncToFirebase({ visualMode: 'firework', mode: 'idle', intensity: 0.08, evolution: 0, fireworkState: 'standby' });
        }, 260);
      }
    } else if (command.command === 'setScreen' && typeof value === 'string' && isKnownScreenId(value)) {
      if (command.target === showControlClientIdRef.current || command.target === screenId) {
        handleScreenChange(value);
      }
    } else if (command.command === 'setScreenAutoRedirect') {
      setScreenPresentation((prev) => ({
        ...prev,
        autoRedirect: typeof value === 'boolean' ? value : Boolean(value),
      }));
    } else if (command.command === 'setScreenMenuVisible') {
      setScreenPresentation((prev) => ({
        ...prev,
        showMenu: typeof value === 'boolean' ? value : Boolean(value),
      }));
    } else if (command.command === 'setScreenDebugVisible') {
      setScreenPresentation((prev) => ({
        ...prev,
        showDebug: typeof value === 'boolean' ? value : Boolean(value),
      }));
    } else if (command.command === 'setScreenPresentation' && value && typeof value === 'object') {
      const presentation = value as Partial<ScreenPresentation>;
      setScreenPresentation((prev) => ({
        autoRedirect: typeof presentation.autoRedirect === 'boolean' ? presentation.autoRedirect : prev.autoRedirect,
        showDebug: typeof presentation.showDebug === 'boolean' ? presentation.showDebug : prev.showDebug,
        showMenu: typeof presentation.showMenu === 'boolean' ? presentation.showMenu : prev.showMenu,
      }));
    } else if (command.command === 'setScreenOwner' || command.command === 'setScreenRoutePreset') {
      void refreshScreenState();
    } else if (command.command === 'pulseScreen') {
      const source = typeof value === 'string' && isKnownScreenId(value)
        ? value
        : isKnownScreenId(command.target)
          ? command.target
          : screenId;
      const timestamp = Date.now();
      setScreenPulse({ source, timestamp });
      syncToFirebase({ screenPulse: { source, timestamp } });
    }
  }, [
    applyEffectMode,
    clearAutoTimeline,
    handleScreenChange,
    refreshScreenState,
    resetTreeGrowth,
    screenId,
    setFireworkState,
    setAutoBlackout,
    setAutoSceneOpacity,
    setFireworkControlMode,
    setFireworkScratchPoint,
    setIntensity,
    setInteractionPoint,
    setMode,
    setMusicEvolution,
    setManualFireworkControl,
    setTreeControlMode,
    setVisualMode,
    startAutoFireworkShow,
    stopAllLayers,
    syncToFirebase
  ]);

  showControlCommandRef.current = applyShowControlCommand;

  useEffect(() => {
    showControlRef.current = createShowControlClient({
      module: 'interaction',
      clientId: showControlClientIdRef.current,
      role: isOverview ? 'overview' : 'screen',
      capabilities: ['module.statePatch', 'control.command', 'interaction.topology', 'interaction.pulse'],
      onStatus: setShowControlStatus,
      onCommand: (command) => showControlCommandRef.current(command),
    });

    return () => showControlRef.current?.close();
  }, []);

  useEffect(() => {
    showControlRef.current?.publishState({
      status: 'online',
      screenTopology: SHOW_SCREEN_LAYOUT_ITEMS.map((screen) => screen.id),
      screenRegistry: SHOW_SCREEN_LAYOUT_ITEMS.map((screen, index) => ({
        id: screen.id,
        label: `Screen ${getScreenDisplayId(screen.id)}`,
        enabled: true,
        physicalIndex: index + 1,
      })),
      screenId,
      role: isOverview ? 'overview' : 'screen',
      overview: isOverview,
      mode,
      intensity,
      treeGrowth,
      gestureActive,
      lastInteraction: interactionPoint
        ? { x: interactionPoint.x, y: interactionPoint.y, z: interactionPoint.z, timestamp: Date.now() }
        : null,
      screenPulse,
      audioStarted: isStarted,
      firebaseStatus: connectionStatus,
      visualMode,
      fireworkState,
      useSampleLibrary,
      screenPresentation: {
        autoRedirect: screenPresentation.autoRedirect,
        showMenu: screenPresentation.showMenu,
        showDebug: screenPresentation.showDebug,
      },
    });
  }, [
    connectionStatus,
    gestureActive,
    interactionPoint,
    intensity,
    isMaster,
    isOverview,
    isStarted,
    mode,
    screenId,
    screenPulse,
    screenRoute,
    treeGrowth,
    fireworkState,
    screenPresentation.autoRedirect,
    screenPresentation.showDebug,
    screenPresentation.showMenu,
    useSampleLibrary,
    visualMode,
  ]);

  const handGestureActive = isCameraActive && hasHandDetected && isHandOpen && openHandCount > 0;
  const shouldShowMenu = screenPresentation.showMenu || isLocalPreview;
  const debugEnabled = (screenPresentation.showDebug && !hideForcedWebGLDebug) || (shouldShowMenu && showWebGLDebug);
  const autoFishScreenId = isOverview ? 'OVERVIEW' : screenId;
  const focusedScreenId = isOverview ? 'OVERVIEW' : screenId;
  const autoFishStage = autoFishActive ? getFishStagePosition(autoFishProgress) : null;
  const activeControlMode = visualMode === 'firework' ? fireworkControlMode : treeControlMode;
  const currentTreeLabel = effectModes.find((effect) => effect.mode === mode)?.label ?? 'CALM / 静止';
  const fireworkStateLabel =
    fireworkState === 'launching'
      ? 'LAUNCHING / 燃放'
      : fireworkState === 'resetting'
        ? 'RESETTING / 重置'
        : 'STANDBY / 待机';
  const treeAutoActive = visualMode === 'tree' && treeControlMode === 'auto';
  const isAutoScreenFrameVisible = (id: string) => {
    if (!treeAutoActive) return true;
    const revealProgress = getAutoFishScreenRevealProgress(id);
    return revealProgress === null || autoFishProgress >= revealProgress;
  };

  if (isKnownScreenId(routeScreenId) && screenRoute?.owner === 'vj') {
    const targetUrl = screenRoute.url;

    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#02040a] px-8 text-white">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <Route size={34} className="text-cyan-200/70" />
          <div>
            <div className="text-sm font-mono uppercase tracking-[0.24em] text-white/80">Screen routed to VJ / 已路由到 VJ</div>
            <div className="mt-2 text-xs font-mono uppercase tracking-[0.18em] text-white/45">{routeScreenId}</div>
          </div>
          <a
            href={targetUrl}
            className="inline-flex h-10 items-center gap-2 rounded border border-cyan-300/30 bg-cyan-300/10 px-4 text-[10px] font-mono uppercase tracking-widest text-cyan-100 hover:bg-cyan-300 hover:text-black"
          >
            <ExternalLink size={14} />
            Open VJ screen / 打开 VJ 屏
          </a>
          {screenPresentation.autoRedirect && targetUrl && (
            <div className="text-[9px] font-mono uppercase tracking-widest text-white/35">
              Redirecting automatically / 自动跳转中
            </div>
          )}
          {screenPresentation.autoRedirect && !targetUrl && (
            <div className="text-[9px] font-mono uppercase tracking-widest text-amber-200/50">Route URL unavailable</div>
          )}
          {screenRouteError && <div className="text-[9px] font-mono uppercase tracking-widest text-amber-200/50">Route fetch error</div>}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-[#02040a] cursor-default overflow-hidden select-none"
      onPointerDown={handleSplashPointerDown}
      onPointerMove={handleSplashPointerMove}
      onPointerUp={handleSplashPointerUp}
    >
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          opacity: autoBlackout ? 0 : autoSceneOpacity,
          transition: activeControlMode === 'auto'
            ? autoBlackout ? 'none' : `opacity ${AUTO_REVEAL_MS}ms ease`
            : 'opacity 600ms ease',
        }}
      >
        <Canvas camera={{ position: [0, 0, 15], fov: 60 }} dpr={1} gl={{ antialias: false, powerPreference: 'high-performance' }}>
          <ambientLight intensity={0.45} />
          {visualMode === 'firework' ? (
            <LegacyFireworkScene
              audioData={audioData}
              interactionPoint={interactionPoint}
              scratchPoint={fireworkScratchPoint}
              mode={evolution > 0.8 ? 'climax' : mode}
              intensity={intensity}
              isPaused={false}
            />
          ) : (
            <ParticleScene
              audioData={audioData}
              interactionPoint={interactionPoint}
              mode={evolution > 0.8 ? 'climax' : mode}
              intensity={intensity}
              screenId={focusedScreenId}
              treeGrowth={treeGrowth}
              gestureActive={gestureActive}
              pulseSource={screenPulse?.source}
              pulseTime={screenPulse?.timestamp}
              autoFishStage={autoFishStage}
              autoFishProgress={autoFishProgress}
              autoFishRevealActive={treeAutoActive}
              isStarted={treeGrowth > 0 || mode === 'interaction'}
              isPaused={false}
            />
          )}
          {debugEnabled && <WebGLDebugProbe onStats={setWebglStats} />}
          <EffectComposer>
            <Bloom
              intensity={isOverview ? 0.48 + intensity * 0.72 : 1.45 + intensity * 2.35}
              luminanceThreshold={isOverview ? 0.28 : 0.08}
              luminanceSmoothing={0.9}
            />
          </EffectComposer>
        </Canvas>
      </div>

      {isOverview && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div
            className="relative w-[min(94vw,118vh)] border border-cyan-300/20 bg-black/10"
            style={{ aspectRatio: `${STAGE_BOUNDS.width} / ${STAGE_BOUNDS.height}` }}
          >
            {isAutoScreenFrameVisible(MASTER_SCREEN.id) && (
              <div
                className="absolute rounded-sm border border-emerald-300/35 bg-emerald-300/[0.035] text-[9px] font-mono tracking-widest text-emerald-100/80"
                style={getLayoutStyle(MASTER_SCREEN)}
              >
                <span className="absolute left-2 top-2">{getScreenDisplayId(MASTER_SCREEN.id)}</span>
                <span className="absolute bottom-2 right-2">大屏幕</span>
              </div>
            )}
            {SCREEN_LAYOUT_ITEMS.map((screen) => (
              isAutoScreenFrameVisible(screen.id) ? (
                <div
                  key={`overview-${screen.id}`}
                  className="absolute rounded-sm border border-cyan-300/20 bg-cyan-300/[0.025]"
                  style={getLayoutStyle(screen)}
                >
                  <span className="absolute left-1.5 top-1 text-[9px] font-mono tracking-widest text-cyan-100/65">{getScreenDisplayId(screen.id)}</span>
                </div>
              ) : null
            ))}
          </div>
        </div>
      )}

      <AutoStandbyWakeOverlay
        active={standbyWakeActive && visualMode === 'tree'}
        wakeKey={standbyWakeKey}
        screenId={screenId}
        isOverview={isOverview}
        isMaster={isMaster}
      />

      <div className="absolute inset-0 z-20 flex pointer-events-none">
        <AnimatePresence>
          {showGestureProgress && !treeTriggered && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: GESTURE_FADE_MS / 1000, ease: 'easeOut' }}
              className="absolute inset-x-6 top-1/2 mx-auto flex w-[min(520px,calc(100vw-3rem))] -translate-y-1/2 flex-col items-center gap-3"
            >
              <div className="w-full overflow-hidden rounded border border-cyan-200/25 bg-black/45 p-1 shadow-[0_0_28px_rgba(34,211,238,0.16)] backdrop-blur-md">
                <div className="h-2.5 overflow-hidden rounded-sm bg-white/10">
                  <div
                    className="h-full rounded-sm bg-gradient-to-r from-cyan-200 via-emerald-200 to-white shadow-[0_0_18px_rgba(125,249,232,0.65)]"
                    style={{ width: `${Math.round(gestureProgress * 100)}%` }}
                  />
                </div>
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-100/75">
                Hold palm steady {Math.round(gestureProgress * 100)}%
              </div>
            </motion.div>
        )}
      </AnimatePresence>

        {shouldShowMenu && (
        <div className="absolute top-6 left-6 pointer-events-auto" onPointerDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => isCameraActive ? stopCamera() : startCamera()}
            className={`p-3 rounded-full border transition-all duration-500 backdrop-blur-md ${isCameraActive ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400' : 'border-white/10 bg-white/5 text-white/40 hover:border-white/20 hover:bg-white/10'}`}
            title="Camera gesture control"
          >
            {isCameraActive ? <Camera size={18} /> : <CameraOff size={18} />}
          </button>
          <button
            onClick={() => setShowScreenPanel((value) => !value)}
            className={`ml-3 p-3 rounded-full border transition-all duration-500 backdrop-blur-md ${showScreenPanel ? 'border-cyan-300/45 bg-cyan-300/12 text-cyan-100' : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:bg-white/10'}`}
            title="Screen routing"
            aria-pressed={showScreenPanel}
          >
            <MonitorCog size={18} />
          </button>
          <button
            onClick={() => {
              if (debugEnabled) {
                setShowWebGLDebug(false);
                setHideForcedWebGLDebug(true);
              } else {
                setHideForcedWebGLDebug(false);
                setShowWebGLDebug(true);
              }
            }}
            className={`ml-3 p-3 rounded-full border transition-all duration-500 backdrop-blur-md ${debugEnabled ? 'border-amber-300/50 bg-amber-300/15 text-amber-100' : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:bg-white/10'}`}
            title="WebGL debug"
          >
            <Activity size={18} />
          </button>
          <button
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              const next = !useSampleLibraryRef.current;
              useSampleLibraryRef.current = next;
              setUseSampleLibrary(next);
              if (!next) {
                stopAllLayers();
              }
            }}
            className={`ml-3 inline-flex h-[44px] items-center gap-2 rounded-full border px-3 font-mono text-[9px] uppercase tracking-[0.18em] transition-all duration-500 backdrop-blur-md ${
              useSampleLibrary
                ? 'border-emerald-300/45 bg-emerald-300/12 text-emerald-100'
                : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:bg-white/10'
            }`}
            title={useSampleLibrary ? 'Sample library sound on' : 'Scale note sound on'}
            aria-pressed={useSampleLibrary}
          >
            <Music2 size={15} />
            {useSampleLibrary ? 'Sample' : 'Scale'}
          </button>
          <button
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              audioAutoStartAllowedRef.current = true;
              if (visualMode === 'firework') {
                if (fireworkControlMode === 'auto') {
                  setManualFireworkControl();
                } else {
                  void startAutoFireworkShow();
                }
                return;
              }

              if (treeControlMode === 'auto') {
                setManualTreeControl();
              } else {
                void startAutoTreeShow();
              }
            }}
            className={`ml-3 inline-flex h-[44px] items-center rounded-full border px-4 font-mono text-[9px] uppercase tracking-[0.18em] transition-all duration-500 backdrop-blur-md ${
              activeControlMode === 'auto'
                ? 'border-cyan-200/60 bg-cyan-200/18 text-cyan-50 shadow-[0_0_22px_rgba(34,211,238,0.28)]'
                : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:bg-white/10'
            }`}
            title={activeControlMode === 'auto' ? 'Automation on' : 'Automation off'}
            aria-pressed={activeControlMode === 'auto'}
          >
            {activeControlMode === 'auto' ? 'Auto' : 'Manual'}
          </button>
          <button
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setSoundEnabled((value) => {
                const next = !value;
                if (!next) {
                  stopAllLayers();
                } else if (visualMode === 'tree') {
                  audioAutoStartAllowedRef.current = true;
                  void startAudio().then(() => {
                    updateTreeLayers(treeGrowthRef.current, evolutionRef.current, treeFadingRef.current);
                  });
                }
                return next;
              });
            }}
            className={`ml-3 p-3 rounded-full border transition-all duration-500 backdrop-blur-md ${
              soundEnabled
                ? 'border-cyan-300/45 bg-cyan-300/12 text-cyan-100'
                : 'border-white/10 bg-white/5 text-white/40 hover:border-white/20 hover:bg-white/10'
            }`}
            title={soundEnabled ? 'All sound on' : 'All sound off'}
            aria-pressed={soundEnabled}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          {isCameraActive && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="mt-3 px-3 py-1 bg-black/40 border border-white/10 rounded font-mono text-[8px] uppercase tracking-widest text-white/60"
            >
              System / 系统: {hasHandDetected ? (openHandCount > 0 ? `Palm open x${openHandCount} / 手掌展开 ${openHandCount}` : 'Closed / 暂停') : 'Searching hand / 搜索手部'}
            </motion.div>
          )}
          {cameraError && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="mt-3 max-w-[260px] px-3 py-2 bg-red-950/50 border border-red-400/20 rounded font-mono text-[9px] leading-relaxed tracking-wider text-red-100/80"
            >
              {cameraError}. Allow camera access in the browser address bar, then click the camera button again. / 请在浏览器地址栏允许摄像头权限，然后再次点击摄像头按钮。
            </motion.div>
          )}
        </div>
        )}

      <AutoFishSchool active={autoFishActive} progress={autoFishProgress} screenId={autoFishScreenId} isOverview={isOverview} />
      {activeControlMode === 'auto' && (
        <div
          className="fixed inset-0 z-40 pointer-events-none bg-black"
          style={{
            opacity: autoBlackout ? 1 : 1 - autoSceneOpacity,
            transition: autoBlackout ? 'none' : `opacity ${AUTO_REVEAL_MS}ms ease`,
          }}
        />
      )}

        <AnimatePresence>
          {shouldShowMenu && showScreenPanel && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="absolute top-6 right-6 w-[380px] max-w-[calc(100vw-2rem)] pointer-events-auto rounded border border-white/10 bg-black/55 p-4 backdrop-blur-xl"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-white/70">Screen Routing / 屏幕排序</div>
                  <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.16em] text-cyan-300/60">
                    {isOverview ? 'All Screens Preview / 全屏预览' : `Display ${getScreenDisplayId(screenId)} / 显示屏 ${getScreenDisplayId(screenId)}`}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={openOverviewRoute}
                    className={`h-9 px-3 rounded border text-[10px] font-mono uppercase tracking-widest transition flex items-center gap-2 ${isOverview ? 'border-emerald-300/50 bg-emerald-300/15 text-emerald-100' : 'border-white/10 bg-white/5 text-white/45'}`}
                    aria-label="Overview"
                  >
                    <LayoutGrid size={14} />
                    Overview / 总览
                  </button>
                </div>
              </div>

              <div
                className="relative mt-4 rounded border border-white/10 bg-white/[0.025]"
                style={{ aspectRatio: `${STAGE_BOUNDS.width} / ${STAGE_BOUNDS.height}` }}
              >
                <button
                  onClick={() => openScreenRoute('A1')}
                  className={`absolute rounded-sm border px-2 text-[9px] font-mono uppercase tracking-widest transition ${!isOverview && normalizeScreenOccupancyId(screenId) === 'A1' ? 'border-emerald-300/45 bg-emerald-300/15 text-emerald-100' : 'border-white/10 bg-white/[0.04] text-white/45 hover:text-white/80'}`}
                  style={getLayoutStyle(MASTER_SCREEN)}
                >
                  {getScreenDisplayId('A1')}
                </button>
                {SCREEN_LAYOUT_ITEMS.map((screen) => (
                  <button
                    key={screen.id}
                    onClick={() => openScreenRoute(screen.id)}
                    className={`absolute rounded-sm border text-[10px] font-mono transition ${!isMaster && !isOverview && screenId === screen.id ? 'border-cyan-300 bg-cyan-300/15 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.25)]' : 'border-white/10 bg-white/[0.04] text-white/45 hover:text-white/80 hover:border-white/20'}`}
                    style={getLayoutStyle(screen)}
                  >
                    {getScreenDisplayId(screen.id)}
                  </button>
                ))}
              </div>

              <div className="mt-3 rounded border border-white/10 bg-white/[0.025] px-3 py-2 text-[9px] font-mono uppercase tracking-[0.16em] text-white/50">
                <div className="flex items-center justify-between gap-3">
                  <span>Native baofa / 原生屏</span>
                  <span className="text-cyan-200/70">{BAOFA_NATIVE_URL}</span>
                </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span>VJ external / 外部 VJ</span>
                <span className="text-cyan-200/70 break-all">{screenRoutes[screenId]?.url || 'Route URL unavailable'}</span>
              </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="space-y-2 rounded border border-white/10 bg-white/[0.025] px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[9px] font-mono uppercase tracking-[0.22em] text-white/55">Mode / 模式</div>
                      <div className="mt-1 text-[9px] font-mono uppercase tracking-[0.16em] text-cyan-300/55">
                        {visualMode === 'firework' ? 'Fireworks / 烟花' : 'Tree / 树'}
                      </div>
                    </div>
                    <div className="segmented-control" aria-label="Mode switch">
                      <button
                        type="button"
                        className={visualMode === 'tree' ? 'selected' : ''}
                        onClick={() => setVisualMode('tree')}
                      >
                        Tree
                      </button>
                      <button
                        type="button"
                        className={visualMode === 'firework' ? 'selected' : ''}
                        onClick={() => setVisualMode('firework')}
                      >
                        Fireworks
                      </button>
                    </div>
                  </div>
                </div>

                {visualMode === 'tree' ? (
                  <div className="space-y-2 rounded border border-white/10 bg-white/[0.025] px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[9px] font-mono uppercase tracking-[0.22em] text-white/55">Tree / 树控制</div>
                        <div className="mt-1 text-[9px] font-mono uppercase tracking-[0.16em] text-cyan-300/55">{currentTreeLabel}</div>
                      </div>
                      <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-[9px] font-mono uppercase tracking-[0.16em] text-cyan-100/80">
                        {currentTreeLabel}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {effectModes.map((effect) => (
                        <button
                          key={effect.mode}
                          onClick={() => applyEffectMode(effect.mode, effect.intensity)}
                          className={`h-10 rounded border px-3 text-[10px] font-mono uppercase tracking-widest transition ${
                            mode === effect.mode
                              ? 'border-cyan-300/55 bg-cyan-300/15 text-cyan-100'
                              : 'border-white/10 bg-white/5 text-white/45 hover:border-white/20 hover:text-white/80'
                          }`}
                        >
                          {effect.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          resetTreeGrowth();
                        }}
                      >
                        Reset tree / 重置树
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 rounded border border-white/10 bg-white/[0.025] px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[9px] font-mono uppercase tracking-[0.22em] text-white/55">Fireworks / 烟花控制</div>
                        <div className="mt-1 text-[9px] font-mono uppercase tracking-[0.16em] text-fuchsia-300/55">{fireworkStateLabel}</div>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-[9px] font-mono uppercase tracking-[0.16em] ${
                        fireworkState === 'launching'
                          ? 'border-fuchsia-200/60 bg-fuchsia-300/12 text-fuchsia-50'
                          : fireworkState === 'resetting'
                            ? 'border-amber-200/60 bg-amber-300/12 text-amber-50'
                            : 'border-white/10 bg-white/5 text-white/55'
                      }`}>
                        {fireworkStateLabel}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        className={fireworkState === 'standby' ? 'selected' : ''}
                        onClick={() => {
                          clearAutoTimeline();
                          setManualFireworkControl();
                          setMode('idle');
                          setIntensity(0.08);
                          setMusicEvolution(0);
                          setInteractionPoint(null);
                          setFireworkScratchPoint(null);
                          stopAllLayers();
                          setFireworkState('standby');
                        }}
                      >
                        Standby / 待机
                      </button>
                      <button
                        type="button"
                        className={fireworkState === 'launching' ? 'selected' : ''}
                        onClick={() => void startAutoFireworkShow()}
                      >
                        Launch / 燃放
                      </button>
                      <button
                        type="button"
                        className={fireworkState === 'resetting' ? 'selected' : ''}
                        onClick={() => {
                          clearAutoTimeline();
                          setFireworkState('resetting');
                          setFireworkControlMode('manual');
                          setAutoBlackout(false);
                          setAutoSceneOpacity(1);
                          autoFireworkActiveRef.current = false;
                          setMode('idle');
                          setIntensity(0.08);
                          setMusicEvolution(0);
                          setInteractionPoint(null);
                          setFireworkScratchPoint(null);
                          stopAllLayers();
                          syncToFirebase({ visualMode: 'firework', mode: 'idle', intensity: 0.08, evolution: 0, fireworkState: 'resetting' });
                          window.setTimeout(() => {
                            setFireworkState('standby');
                            syncToFirebase({ visualMode: 'firework', mode: 'idle', intensity: 0.08, evolution: 0, fireworkState: 'standby' });
                          }, 260);
                        }}
                      >
                        Reset / 重置
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 h-1 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-cyan-300 transition-all duration-300" style={{ width: `${Math.round((visualMode === 'firework' ? intensity : treeGrowth) * 100)}%` }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {connectionStatus === 'error' && (
        <div className="absolute bottom-4 right-4 text-[8px] font-mono text-red-500/40 uppercase tracking-widest animate-pulse pointer-events-none">
          {isFirebaseConfigured ? 'Sync Offline / 同步离线' : 'Sync Disabled / 同步未启用'}
        </div>
      )}

      <AnimatePresence>
        {debugEnabled && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-6 left-6 z-50 w-[280px] max-w-[calc(100vw-3rem)] pointer-events-auto rounded border border-amber-300/20 bg-black/65 p-4 font-mono text-[10px] uppercase tracking-[0.18em] text-white/65 backdrop-blur-xl"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-amber-100/90">
                <Activity size={14} />
                <span>WebGL Debug / 调试</span>
              </div>
              {screenPresentation.showDebug && !hideForcedWebGLDebug && (
                <span className="rounded border border-amber-300/20 px-2 py-1 text-[9px] text-amber-100/65">
                  4300
                </span>
              )}
              <button
                onClick={() => {
                  setShowWebGLDebug(false);
                  setHideForcedWebGLDebug(true);
                }}
                className="rounded border border-white/10 px-2 py-1 text-[9px] text-white/45 hover:border-white/20 hover:text-white/80"
              >
                Off
              </button>
            </div>

            {webglStats ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <span>FPS</span><span className="text-right text-cyan-100">{webglStats.fps}</span>
                <span>Frame</span><span className="text-right text-cyan-100">{webglStats.frameMs}ms</span>
                <span>Calls</span><span className="text-right text-cyan-100">{webglStats.calls}</span>
                <span>Triangles</span><span className="text-right text-cyan-100">{webglStats.triangles.toLocaleString()}</span>
                <span>Points</span><span className="text-right text-cyan-100">{webglStats.points.toLocaleString()}</span>
                <span>Lines</span><span className="text-right text-cyan-100">{webglStats.lines.toLocaleString()}</span>
                <span>Geometry</span><span className="text-right text-cyan-100">{webglStats.geometries}</span>
                <span>Textures</span><span className="text-right text-cyan-100">{webglStats.textures}</span>
                <span>DPR</span><span className="text-right text-cyan-100">{webglStats.pixelRatio}</span>
                <span>Viewport</span><span className="text-right text-cyan-100">{webglStats.viewport}</span>
              </div>
            ) : (
              <div className="text-white/35">Collecting render stats / 正在采样</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {(shouldShowMenu || screenPresentation.showDebug) && (
      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-2 pointer-events-none z-50">
        <div className={`px-3 py-1.5 rounded-full text-[10px] font-mono tracking-widest uppercase transition-all duration-500 border ${
          showControlStatus === 'connected' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-gray-900/50 border-white/5 text-white/30'
        }`}>
          Show API / 总控: {showControlStatus}
        </div>
        <div className={`px-3 py-1.5 rounded-full text-[10px] font-mono tracking-widest uppercase transition-all duration-500 border ${
          isCameraActive ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-gray-900/50 border-white/5 text-white/20'
        }`}>
          {isCameraActive ? (
            <span className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${hasHandDetected ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'bg-gray-600'}`} />
              Motion / 手势: {hasHandDetected ? (openHandCount > 0 ? `Open x${openHandCount} / 展开 ${openHandCount}` : 'Paused / 暂停') : 'Scanning / 扫描中'}
            </span>
          ) : (
            `${isOverview ? 'Overview / 总览' : `${getScreenDisplayId(screenId)} / 显示屏`} / Camera Offline / 摄像头离线`
          )}
        </div>
      </div>
      )}
    </div>
  );
}
