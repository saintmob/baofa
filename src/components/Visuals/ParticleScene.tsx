import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  DEFAULT_SCREEN_ID,
  SCREEN_LAYOUT,
  getScreenWorldPointData,
  layoutToWorldPoint,
} from '../../screenLayout';

interface ParticleSceneProps {
  audioData: Float32Array;
  interactionPoint: THREE.Vector3 | null;
  mode: 'idle' | 'interaction' | 'flow' | 'climax';
  intensity: number;
  screenId?: string;
  treeGrowth?: number;
  gestureActive?: boolean;
  pulseSource?: string;
  pulseTime?: number;
  isStarted?: boolean;
  isPaused?: boolean;
}

function getScreenCenter(screenId = DEFAULT_SCREEN_ID) {
  if (screenId === 'OVERVIEW') {
    return { x: 0, y: 0 };
  }

  return getScreenWorldPointData(screenId);
}

function createGlyphTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '24px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const glyphs = ['0', '1', 'A', 'F', 'X', 'Y', '+', '#', '/', '*'];
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const glyph = glyphs[(x + y * 3) % glyphs.length];
      ctx.fillText(glyph, x * 32 + 16, y * 32 + 16);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export const ParticleScene: React.FC<ParticleSceneProps> = ({
  audioData,
  interactionPoint,
  mode,
  intensity,
  screenId = DEFAULT_SCREEN_ID,
  treeGrowth = 0,
  gestureActive = false,
  pulseSource,
  pulseTime,
  isStarted,
  isPaused
}) => {
  const pointsRef = useRef<THREE.Points>(null);
  const leafRef = useRef<THREE.Points>(null);
  const mistRef = useRef<THREE.Points>(null);
  const ambientRef = useRef<THREE.Points>(null);
  const energyRef = useRef<THREE.Points>(null);
  const pollenRef = useRef<THREE.Points>(null);
  const glyphRef = useRef<THREE.Points>(null);
  const contourRef = useRef<THREE.LineSegments>(null);
  const branchLineRef = useRef<THREE.LineSegments>(null);
  const fiberRef = useRef<THREE.LineSegments>(null);
  const rootFiberRef = useRef<THREE.LineSegments>(null);
  const squareFieldRef = useRef<THREE.InstancedMesh>(null);
  const idleBlockRefs = useRef<Array<THREE.InstancedMesh | null>>([]);
  const meshRef = useRef<THREE.Group>(null);
  const ripplePhaseRef = useRef(0);
  const count = 34000;
  const leafCount = 19000;
  const mistCount = 76000;
  const energyCount = 6200;
  const pollenCount = 9800;
  const glyphCount = 1900;
  const idleBlockCount = 2600;
  const shardCount = 90;
  const opacityRef = useRef(0);
  const colorRef = useRef(new THREE.Color("#22d3ee"));
  const squareMatrixObject = useMemo(() => new THREE.Object3D(), []);
  const { viewport } = useThree();
  const screenCenter = getScreenCenter(screenId);
  const isOverviewScreen = screenId === 'OVERVIEW';
  const singleScreenScale = {
    x: (viewport.width / 11.2) * 1.08,
    y: (viewport.height / 6.8) * 1.08,
    z: 0.9,
  };
  const sceneScale = isOverviewScreen
    ? { x: 0.36, y: 0.36, z: 0.36 }
    : singleScreenScale;
  const scenePosition = isOverviewScreen
    ? [-screenCenter.x, -screenCenter.y, 0]
    : [-screenCenter.x * sceneScale.x, -screenCenter.y * sceneScale.y, 0];
  const previewDensity = isOverviewScreen ? 0.34 : 1;
  const previewBrightness = isOverviewScreen ? 0.34 : 1;
  const glyphTexture = useMemo(() => createGlyphTexture(), []);
  const screenCenters = useMemo(() => Object.entries(SCREEN_LAYOUT).map(([id, layout]) => {
    const point = layoutToWorldPoint(layout);
    return {
      id,
      layout,
      point: new THREE.Vector3(point.x, point.y, point.z),
    };
  }), []);

  const [positions, initialPositions, growthOrder, particleColors] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const init = new Float32Array(count * 3);
    const order = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const palette = [
      new THREE.Color("#d9f99d"),
      new THREE.Color("#bef264"),
      new THREE.Color("#fef08a"),
      new THREE.Color("#ffffff"),
      new THREE.Color("#4ade80"),
      new THREE.Color("#7dd3fc"),
    ];
    const trunkCenterOffsetX = -0.35;
    const branchPaths = Array.from({ length: 54 }).map((_, index) => {
      const side = index % 2 === 0 ? 1 : -1;
      const base = 0.33 + Math.random() * 0.55;
      const reach = 6 + Math.random() * 17;
      const lift = 1.2 + Math.random() * 6;
      const droop = 1.2 + Math.random() * 6;
      const fork = Math.random() > 0.62 ? 1 : 0;
      const start = new THREE.Vector3(
        trunkCenterOffsetX + Math.sin(base * 15) * 0.8 + (Math.random() - 0.5) * 0.7,
        -15 + base * 28,
        (Math.random() - 0.5) * 1.5
      );
      const points = [
        start,
        start.clone().add(new THREE.Vector3(side * reach * 0.22, lift * 0.7, (Math.random() - 0.5) * 2.4)),
        start.clone().add(new THREE.Vector3(side * reach * 0.58, lift - droop * 0.2 + Math.sin(index) * 1.2, (Math.random() - 0.5) * 4.2)),
        start.clone().add(new THREE.Vector3(side * reach * (0.9 + fork * 0.18), lift - droop, (Math.random() - 0.5) * 5.2)),
      ];
      return {
        curve: new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.72),
        base,
        width: 0.82 + (1 - base) * 0.85,
      };
    });

    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const isTrunk = t < 0.42;
      const isBranch = t >= 0.42 && t < 0.88;
      let x = 0;
      let y = -15;
      let z = 0;
      let colorMix = 0;

      if (isTrunk) {
        const h = Math.random();
        const width = 0.32 + (1 - h) * 1.55;
        const twist = h * 16 + Math.random() * 1.8;
        x = trunkCenterOffsetX + Math.sin(twist) * (0.2 + h * 0.42) + (Math.random() - 0.5) * width;
        y = -15 + h * 29;
        z = Math.cos(twist * 0.82) * (0.18 + h * 0.55) + (Math.random() - 0.5) * (0.75 + h * 0.7);
        order[i] = h * 0.72;
        colorMix = h;
      } else if (isBranch) {
        const path = branchPaths[Math.floor(Math.random() * branchPaths.length)];
        const reach = Math.pow(Math.random(), 0.64);
        const point = path.curve.getPoint(reach);
        const tangent = path.curve.getTangent(reach);
        const normal = new THREE.Vector3(-tangent.y, tangent.x, tangent.z * 0.25).normalize();
        const thickness = (1 - reach) * path.width + 0.12;
        const jitter = Math.pow(Math.random(), 0.7) * thickness;
        x = point.x + normal.x * (Math.random() - 0.5) * jitter + Math.sin(reach * 24 + i) * 0.32;
        y = point.y + normal.y * (Math.random() - 0.5) * jitter + Math.cos(reach * 17 + i) * 0.22;
        z = point.z + (Math.random() - 0.5) * (0.8 + reach * 3.7);
        order[i] = path.base * 0.7 + reach * 0.3;
        colorMix = 0.45 + reach * 0.55;
      } else {
        const path = branchPaths[Math.floor(Math.random() * branchPaths.length)];
        const tip = path.curve.getPoint(1);
        const crown = Math.pow(Math.random(), 0.62);
        const angle = Math.random() * Math.PI * 2;
        const radius = 0.8 + crown * (2.4 + Math.random() * 4.4);
        x = tip.x + Math.cos(angle) * radius + Math.sin(i * 0.71) * 0.7;
        y = tip.y + Math.sin(angle) * radius * 0.58 + Math.random() * 2.2;
        z = tip.z + (Math.random() - 0.5) * (2 + crown * 5);
        order[i] = 0.7 + Math.random() * 0.3;
        colorMix = 0.78 + Math.random() * 0.22;
      }
      
      pos[i * 3] = init[i * 3] = x;
      pos[i * 3 + 1] = init[i * 3 + 1] = y;
      pos[i * 3 + 2] = init[i * 3 + 2] = z;
      const hot = Math.random();
      const color = hot > 0.94
        ? palette[3]
        : hot > 0.86
          ? palette[5]
        : palette[Math.floor(Math.min(palette.length - 1, colorMix * (palette.length - 1)))].clone().lerp(palette[2], Math.random() * 0.28);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    return [pos, init, order, colors];
  }, [count]);

  const [leafPositions, leafOrder, leafColors] = useMemo(() => {
    const pos = new Float32Array(leafCount * 3);
    const order = new Float32Array(leafCount);
    const colors = new Float32Array(leafCount * 3);
    for (let i = 0; i < leafCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.pow(Math.random(), 0.5) * 21;
      const sideBias = Math.sin(angle * 3) * 1.8;
      pos[i * 3] = Math.cos(angle) * radius + sideBias;
      pos[i * 3 + 1] = 1 + Math.sin(angle) * radius * 0.32 + Math.random() * 17;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10;
      order[i] = 0.52 + Math.random() * 0.48;
      const color = new THREE.Color(Math.random() > 0.58 ? "#fef08a" : "#86efac").lerp(new THREE.Color("#ffffff"), Math.random() * 0.22);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    return [pos, order, colors];
  }, [leafCount]);

  const mistPositions = useMemo(() => {
    const pos = new Float32Array(mistCount * 3);
    const screens = Object.values(SCREEN_LAYOUT);
    const particlesPerScreen = Math.ceil(mistCount / screens.length);
    const gridCols = 80;
    const gridRows = Math.ceil(particlesPerScreen / gridCols);
    for (let i = 0; i < mistCount; i++) {
      const screen = screens[i % screens.length];
      const localIndex = Math.floor(i / screens.length);
      const gridX = localIndex % gridCols;
      const gridY = Math.floor(localIndex / gridCols) % gridRows;
      const offsetX = ((gridX + Math.random()) / gridCols - 0.5) * 11.2;
      const offsetY = ((gridY + Math.random()) / gridRows - 0.5) * 6.8;
      const point = layoutToWorldPoint(screen);
      pos[i * 3] = point.x + offsetX;
      pos[i * 3 + 1] = point.y + offsetY;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 14;
    }
    return pos;
  }, [mistCount]);

  const squareData = useMemo(() => {
    const squares: Array<{
      position: THREE.Vector3;
      rotation: THREE.Euler;
      scale: number;
      drift: THREE.Vector3;
      phase: number;
      speed: number;
      screen: { col: number; row: number };
    }> = [];
    const squaresPerScreen = 72;
    const squareCols = 14;
    const squareRows = Math.ceil(squaresPerScreen / squareCols);
    Object.values(SCREEN_LAYOUT).forEach((screen) => {
      for (let i = 0; i < squaresPerScreen; i++) {
        const gridX = i % squareCols;
        const gridY = Math.floor(i / squareCols) % squareRows;
        const offsetX = ((gridX + 0.2 + Math.random() * 0.6) / squareCols - 0.5) * 10.4;
        const offsetY = ((gridY + 0.2 + Math.random() * 0.6) / squareRows - 0.5) * 6.4;
        const point = layoutToWorldPoint(screen);
        squares.push({
          position: new THREE.Vector3(
            point.x + offsetX,
            point.y + offsetY,
            (Math.random() - 0.5) * 6
          ),
          rotation: new THREE.Euler(0, 0, Math.random() * Math.PI),
          scale: 0.055 + Math.random() * 0.04,
          drift: new THREE.Vector3(
            0.18 + Math.random() * 0.42,
            0.14 + Math.random() * 0.36,
            0.12 + Math.random() * 0.3
          ),
          phase: Math.random() * Math.PI * 2,
          speed: 0.65 + Math.random() * 1.15,
          screen,
        });
      }
    });
    return squares;
  }, []);

  const idleBlockData = useMemo(() => {
    const blocks: Array<{
      position: THREE.Vector3;
      rotation: THREE.Euler;
      scale: number;
      drift: THREE.Vector3;
      spin: THREE.Vector3;
      phase: number;
      speed: number;
      colorGroup: number;
    }> = [];
    for (let i = 0; i < idleBlockCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.pow(Math.random(), 0.68);
      blocks.push({
        position: new THREE.Vector3(
          Math.cos(angle) * radius * 31 + (Math.random() - 0.5) * 3.8,
          Math.sin(angle) * radius * 17 + (Math.random() - 0.5) * 2.4,
          (Math.random() - 0.5) * 8
        ),
        rotation: new THREE.Euler(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        ),
        scale: 0.018 + Math.random() * 0.022,
        drift: new THREE.Vector3(
          0.12 + Math.random() * 0.24,
          0.08 + Math.random() * 0.18,
          0.1 + Math.random() * 0.22
        ),
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 1.8,
          (Math.random() - 0.5) * 1.9,
          (Math.random() - 0.5) * 2.4
        ),
        phase: Math.random() * Math.PI * 2,
        speed: 0.46 + Math.random() * 1.05,
        colorGroup: i % 5,
      });
    }
    return blocks;
  }, [idleBlockCount]);

  const [energyPositions, energyInitial, energyOrder] = useMemo(() => {
    const pos = new Float32Array(energyCount * 3);
    const init = new Float32Array(energyCount * 3);
    const order = new Float32Array(energyCount);
    const trunkCenterOffsetX = 0.18;
    for (let i = 0; i < energyCount; i++) {
      const t = i / energyCount;
      const lane = i % 9;
      const side = lane % 2 === 0 ? 1 : -1;
      const strand = lane - 4;
      const y = -15 + t * 31;
      const flare = Math.pow(t, 1.25) * 10;
      const x = trunkCenterOffsetX + Math.sin(t * 18 + lane * 0.9) * (0.5 + t * 1.5) + side * flare * Math.max(0, t - 0.42) + strand * 0.08;
      const z = Math.cos(t * 14 + lane) * (0.5 + t * 2.4);
      pos[i * 3] = init[i * 3] = x;
      pos[i * 3 + 1] = init[i * 3 + 1] = y;
      pos[i * 3 + 2] = init[i * 3 + 2] = z;
      order[i] = t;
    }
    return [pos, init, order];
  }, [energyCount]);

  const [pollenPositions, pollenOrder] = useMemo(() => {
    const pos = new Float32Array(pollenCount * 3);
    const order = new Float32Array(pollenCount);
    const f1Center = layoutToWorldPoint(SCREEN_LAYOUT.F1);
    for (let i = 0; i < pollenCount; i++) {
      if (i < 5200) {
        const x = f1Center.x + (Math.random() - 0.5) * 8.8;
        const localX = x - f1Center.x;
        const normalized = Math.abs(localX) / 4.4;
        const bandCenter = f1Center.y - 2.58 + Math.max(0, 1 - normalized * normalized) * 0.12;
        pos[i * 3] = x + (Math.random() - 0.5) * 0.1;
        pos[i * 3 + 1] = bandCenter + (Math.random() - 0.5) * 0.88;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 3.2;
        order[i] = 0.015 + Math.random() * 0.12;
      } else {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.pow(Math.random(), 0.45) * 22;
        pos[i * 3] = Math.cos(angle) * radius;
        pos[i * 3 + 1] = -2 + Math.random() * 22;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 12;
        order[i] = 0.38 + Math.random() * 0.62;
      }
    }
    return [pos, order];
  }, [pollenCount]);

  const [glyphPositions, glyphOrder] = useMemo(() => {
    const pos = new Float32Array(glyphCount * 3);
    const order = new Float32Array(glyphCount);
    for (let i = 0; i < glyphCount; i++) {
      const t = Math.random();
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.5 + Math.pow(Math.random(), 0.55) * (t > 0.45 ? 18 : 6);
      pos[i * 3] = Math.cos(angle) * radius + Math.sin(t * 20) * 0.8;
      pos[i * 3 + 1] = -14 + Math.pow(t, 0.82) * 30;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
      order[i] = t;
    }
    return [pos, order];
  }, [glyphCount]);

  const [branchLinePositions, branchLineOrder] = useMemo(() => {
    const segments = 180;
    const pos = new Float32Array(segments * 2 * 3);
    const order = new Float32Array(segments);
    for (let i = 0; i < segments; i++) {
      const branchBase = 0.15 + Math.random() * 0.75;
      const reach = 0.18 + Math.random() * 0.82;
      const side = Math.random() > 0.5 ? 1 : -1;
      const y0 = -15 + branchBase * 29;
      const x0 = Math.sin(branchBase * 11) * 0.8;
      const x1 = x0 + side * reach * (4 + branchBase * 15);
      const y1 = y0 + reach * (3 + branchBase * 3) - Math.pow(reach, 1.4) * 4;
      const z = (Math.random() - 0.5) * 3;
      const ix = i * 6;
      pos[ix] = x0;
      pos[ix + 1] = y0;
      pos[ix + 2] = z;
      pos[ix + 3] = x1;
      pos[ix + 4] = y1;
      pos[ix + 5] = z + (Math.random() - 0.5) * 2;
      order[i] = branchBase + reach * 0.16;
    }
    return [pos, order];
  }, []);

  const [contourPositions, contourOrder] = useMemo(() => {
    const rings = 10;
    const steps = 64;
    const pos = new Float32Array(rings * steps * 2 * 3);
    const order = new Float32Array(rings * steps);
    let cursor = 0;
    for (let r = 0; r < rings; r++) {
      const y = -12 + r * 2.2;
      const width = 2.5 + Math.sin(r * 0.7) * 0.8 + r * 1.2;
      const height = 0.5 + r * 0.24;
      for (let s = 0; s < steps; s++) {
        const a0 = (s / steps) * Math.PI * 2;
        const a1 = ((s + 1) / steps) * Math.PI * 2;
        pos[cursor++] = Math.cos(a0) * width;
        pos[cursor++] = y + Math.sin(a0) * height;
        pos[cursor++] = Math.sin(a0) * 1.2;
        pos[cursor++] = Math.cos(a1) * width;
        pos[cursor++] = y + Math.sin(a1) * height;
        pos[cursor++] = Math.sin(a1) * 1.2;
        order[r * steps + s] = r / rings;
      }
    }
    return [pos, order];
  }, []);

  const [fiberPositions, fiberOrder, fiberColors] = useMemo(() => {
    const segmentCount = 19000;
    const pos = new Float32Array(segmentCount * 2 * 3);
    const order = new Float32Array(segmentCount);
    const colors = new Float32Array(segmentCount * 2 * 3);
    const trunkCenterOffsetX = -0.35;
    let segment = 0;

    const addSegment = (a: THREE.Vector3, b: THREE.Vector3, grow: number, color: THREE.Color) => {
      if (segment >= segmentCount) return;
      const ix = segment * 6;
      pos[ix] = a.x;
      pos[ix + 1] = a.y;
      pos[ix + 2] = a.z;
      pos[ix + 3] = b.x;
      pos[ix + 4] = b.y;
      pos[ix + 5] = b.z;
      order[segment] = grow;
      colors[ix] = colors[ix + 3] = color.r;
      colors[ix + 1] = colors[ix + 4] = color.g;
      colors[ix + 2] = colors[ix + 5] = color.b;
      segment++;
    };

    const addSmoothStrand = (points: THREE.Vector3[], growStart: number, growEnd: number, samples: number, color: THREE.Color) => {
      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.42);
      let previous = curve.getPoint(0);
      for (let sample = 1; sample <= samples; sample++) {
        const t = sample / samples;
        const next = curve.getPoint(t);
        addSegment(previous, next, THREE.MathUtils.lerp(growStart, growEnd, t), color);
        previous = next;
      }
    };

    for (let strand = 0; strand < 760; strand++) {
      const type = Math.random();
      const branchSide = Math.random() > 0.5 ? 1 : -1;
      const baseT = Math.random();
      const points: THREE.Vector3[] = [];
      let growStart = 0;
      let growEnd = 1;

      if (type < 0.34) {
        const t = Math.random();
        const start = new THREE.Vector3(
          trunkCenterOffsetX + (Math.random() - 0.5) * (1.2 + (1 - t) * 3.4) + Math.sin(t * 9) * 0.8,
          -16 + t * 23,
          (Math.random() - 0.5) * 2.1
        );
        const length = 3.4 + Math.random() * 5.2;
        growStart = Math.max(0.04, (start.y + 16) / 31);
        growEnd = Math.min(1, growStart + length / 31);
        points.push(
          start,
          start.clone().add(new THREE.Vector3(Math.sin(baseT * 7) * 0.5, length * 0.32, Math.cos(baseT * 5) * 0.22)),
          start.clone().add(new THREE.Vector3(Math.sin(baseT * 9 + 1.4) * 0.68, length * 0.68, Math.sin(baseT * 6) * 0.28)),
          start.clone().add(new THREE.Vector3(Math.sin(baseT * 11 + 0.8) * 0.52, length, Math.cos(baseT * 8) * 0.18))
        );
      } else if (type < 0.7) {
        const t = 0.34 + Math.random() * 0.56;
        const start = new THREE.Vector3(
          trunkCenterOffsetX + Math.sin(t * 8) * 0.9 + (Math.random() - 0.5) * 1.2,
          -15 + t * 28,
          (Math.random() - 0.5) * 2.4
        );
        const reach = 4.2 + Math.random() * 9.5;
        const lift = 1.8 + Math.random() * 3.2;
        growStart = Math.max(0.04, (start.y + 16) / 31);
        growEnd = Math.min(1, growStart + 0.18 + Math.random() * 0.22);
        points.push(
          start,
          start.clone().add(new THREE.Vector3(branchSide * reach * 0.28, lift * 0.45, Math.sin(baseT * 6) * 0.55)),
          start.clone().add(new THREE.Vector3(branchSide * reach * 0.68, lift * 0.82 - 0.5, Math.cos(baseT * 5) * 0.9)),
          start.clone().add(new THREE.Vector3(branchSide * reach, lift - Math.random() * 1.6, Math.sin(baseT * 9) * 1.1))
        );
      } else {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.pow(Math.random(), 0.7) * 14;
        const start = new THREE.Vector3(
          trunkCenterOffsetX + Math.cos(angle) * radius,
          1.5 + Math.random() * 14,
          Math.sin(angle) * 2.2
        );
        const sweep = 2.2 + Math.random() * 6.5;
        growStart = Math.max(0.04, (start.y + 16) / 31);
        growEnd = Math.min(1, growStart + 0.12 + Math.random() * 0.2);
        points.push(
          start,
          start.clone().add(new THREE.Vector3(Math.cos(angle + 0.6) * sweep * 0.35, Math.random() * 1.2 - 0.4, Math.sin(angle + 0.6) * 0.7)),
          start.clone().add(new THREE.Vector3(Math.cos(angle + 1.1) * sweep * 0.72, Math.random() * 1.5 - 0.6, Math.sin(angle + 1.1) * 1.0)),
          start.clone().add(new THREE.Vector3(Math.cos(angle + 1.5) * sweep, Math.random() * 1.4 - 0.7, Math.sin(angle + 1.5) * 1.2))
        );
      }

      const strandColor = new THREE.Color(
        strand % 13 === 0
          ? "#22d3ee"
          : strand % 17 === 0
            ? "#38bdf8"
            : strand % 7 === 0
              ? "#bef264"
              : strand % 5 === 0
                ? "#fef08a"
                : strand % 11 === 0
                  ? "#86efac"
                  : "#ffffff"
      );
      addSmoothStrand(points, growStart, growEnd, 10 + Math.floor(Math.random() * 8), strandColor);
    }

    const addScreenBranch = (targetId: string, branchSide: -1 | 1, baseY: number, copies: number) => {
      const targetLayout = SCREEN_LAYOUT[targetId];
      if (!targetLayout) return;
      const target = layoutToWorldPoint(targetLayout);
      for (let copy = 0; copy < copies; copy++) {
        const wobble = 0.7 + Math.random() * 1.5;
        const phase = Math.random() * Math.PI * 2;
        const start = new THREE.Vector3(
          trunkCenterOffsetX + Math.sin(baseY * 0.48 + copy) * 0.7 + (Math.random() - 0.5) * 0.8,
          baseY + (Math.random() - 0.5) * 1.0,
          (Math.random() - 0.5) * 1.4
        );
        const end = new THREE.Vector3(
          target.x + (Math.random() - 0.5) * 2.6,
          target.y + (Math.random() - 0.5) * 2.0,
          (Math.random() - 0.5) * 2.8
        );
        const controlLift = targetId.startsWith('C') ? 2.8 : 0.8;
        const branchColor = new THREE.Color(
          copy % 9 === 0 ? "#22d3ee" : copy % 11 === 0 ? "#38bdf8" : copy % 4 === 0 ? "#bef264" : copy % 3 === 0 ? "#fef08a" : "#ffffff"
        );
        addSmoothStrand(
          [
            start,
            start.clone().lerp(end, 0.2).add(new THREE.Vector3(
              branchSide * (1.2 + Math.sin(phase) * wobble),
              controlLift + Math.random() * 1.8,
              (Math.random() - 0.5) * 2.2
            )),
            start.clone().lerp(end, 0.42).add(new THREE.Vector3(
              branchSide * (3.2 + Math.cos(phase * 0.7) * wobble * 1.4),
              Math.sin(phase + copy * 0.43) * 1.35 + Math.random() * 1.1,
              (Math.random() - 0.5) * 3.2
            )),
            start.clone().lerp(end, 0.64).add(new THREE.Vector3(
              branchSide * (1.4 + Math.sin(phase * 1.3) * wobble * 1.8),
              Math.cos(phase + copy * 0.31) * 1.6 - 0.4 + Math.random() * 1.0,
              (Math.random() - 0.5) * 3.6
            )),
            start.clone().lerp(end, 0.82).add(new THREE.Vector3(
              branchSide * (2.8 + Math.cos(phase * 1.6) * wobble),
              Math.sin(phase * 0.9 + copy) * 1.1 + Math.random() * 0.9 - 0.5,
              (Math.random() - 0.5) * 2.4
            )),
            end,
          ],
          0.28 + Math.random() * 0.18,
          0.86 + Math.random() * 0.12,
          34 + Math.floor(Math.random() * 12),
          branchColor
        );
      }
    };

    addScreenBranch('C1', -1, 5.6, 16);
    addScreenBranch('C2', -1, 4.2, 14);
    addScreenBranch('G1', -1, 1.2, 14);
    addScreenBranch('G2', -1, -1.2, 12);
    addScreenBranch('H1', 1, 1.2, 14);
    addScreenBranch('H2', 1, -1.2, 12);

    return [pos, order, colors];
  }, []);

  const [rootFiberPositions, rootFiberOrder, rootFiberColors] = useMemo(() => {
    const segmentCount = 9000;
    const pos = new Float32Array(segmentCount * 2 * 3);
    const order = new Float32Array(segmentCount);
    const colors = new Float32Array(segmentCount * 2 * 3);
    const f1Center = layoutToWorldPoint(SCREEN_LAYOUT.F1);
    let segment = 0;

    const addSegment = (a: THREE.Vector3, b: THREE.Vector3, grow: number, color: THREE.Color) => {
      if (segment >= segmentCount) return;
      const ix = segment * 6;
      pos[ix] = a.x;
      pos[ix + 1] = a.y;
      pos[ix + 2] = a.z;
      pos[ix + 3] = b.x;
      pos[ix + 4] = b.y;
      pos[ix + 5] = b.z;
      order[segment] = grow;
      colors[ix] = colors[ix + 3] = color.r;
      colors[ix + 1] = colors[ix + 4] = color.g;
      colors[ix + 2] = colors[ix + 5] = color.b;
      segment++;
    };

    const addSmoothStrand = (points: THREE.Vector3[], growStart: number, growEnd: number, samples: number, color: THREE.Color) => {
      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.45);
      let previous = curve.getPoint(0);
      for (let sample = 1; sample <= samples; sample++) {
        const t = sample / samples;
        const next = curve.getPoint(t);
        addSegment(previous, next, THREE.MathUtils.lerp(growStart, growEnd, t), color);
        previous = next;
      }
    };

    for (let strand = 0; strand < 430; strand++) {
      const side = Math.random() > 0.5 ? 1 : -1;
      const reach = 7 + Math.random() * 14.5;
      const startX = (Math.random() - 0.5) * 4.2;
      const endX = side * reach;
      const arch = 0.45 + Math.random() * 1.45;
      const baseY = f1Center.y - 3.55 + Math.random() * 0.7;
      const depth = (Math.random() - 0.5) * 1.4;
      const start = new THREE.Vector3(startX, baseY + arch * 0.65, (Math.random() - 0.5) * 1.2);
      const strandColor = new THREE.Color(strand % 10 === 0 ? "#22d3ee" : strand % 14 === 0 ? "#38bdf8" : strand % 4 === 0 ? "#fef08a" : strand % 3 === 0 ? "#bef264" : "#ecfccb");
      addSmoothStrand(
        [
          start,
          new THREE.Vector3(
            THREE.MathUtils.lerp(startX, endX, 0.28),
            baseY + arch * (0.85 + Math.random() * 0.32) + Math.sin(strand * 0.31) * 0.16,
            depth * 0.25
          ),
          new THREE.Vector3(
            THREE.MathUtils.lerp(startX, endX, 0.62),
            baseY + arch * (0.62 + Math.random() * 0.3) + Math.cos(strand * 0.23) * 0.18,
            depth * 0.7
          ),
          new THREE.Vector3(
            endX,
            baseY + Math.random() * 0.42 - 0.28,
            depth
          ),
        ],
        0.02,
        0.2,
        14 + Math.floor(Math.random() * 8),
        strandColor
      );
    }

    for (let strand = 0; strand < 130; strand++) {
      const width = 20 + Math.random() * 6;
      const yBase = f1Center.y - 3.2 + Math.random() * 0.45;
      const lift = 0.28 + Math.random() * 0.62;
      const z = (Math.random() - 0.5) * 1.1;
      const strandColor = new THREE.Color(strand % 8 === 0 ? "#22d3ee" : strand % 12 === 0 ? "#38bdf8" : strand % 4 === 0 ? "#fef08a" : "#ecfccb");
      addSmoothStrand(
        [
          new THREE.Vector3(-width, yBase + Math.random() * 0.35, z),
          new THREE.Vector3(-width * 0.46, yBase + lift * 0.88, z + (Math.random() - 0.5) * 0.6),
          new THREE.Vector3(0, yBase + lift + Math.random() * 0.42, z + (Math.random() - 0.5) * 0.8),
          new THREE.Vector3(width * 0.46, yBase + lift * 0.88, z + (Math.random() - 0.5) * 0.6),
          new THREE.Vector3(width, yBase + Math.random() * 0.35, z),
        ],
        0.04,
        0.22,
        24 + Math.floor(Math.random() * 8),
        strandColor
      );
    }

    return [pos, order, colors];
  }, []);

  const shardData = useMemo(() => {
    return Array.from({ length: shardCount }).map(() => ({
      position: new THREE.Vector3(
        (Math.random() - 0.5) * 42,
        -15 + Math.random() * 31,
        (Math.random() - 0.5) * 10
      ),
      rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
      scale: 0.05 + Math.random() * 0.1,
      speed: 0.1 + Math.random() * 0.5
    }));
  }, [shardCount]);

  useFrame((state, delta) => {
    if (isPaused) return;
    
    const time = state.clock.getElapsedTime();
    if (interactionPoint && mode === 'interaction') {
      ripplePhaseRef.current = Math.min(1, ripplePhaseRef.current + delta * 1.25);
    } else {
      ripplePhaseRef.current = 0;
    }
    const growth = THREE.MathUtils.clamp(treeGrowth, 0, 1);
    const visibleGrowth = growth;
    const interactionPreview = mode === 'interaction' ? 0.11 : 0;
    const renderGrowth = Math.max(visibleGrowth, interactionPreview);
    const idleMist = visibleGrowth <= 0.001 ? Math.min(1, 0.58 + intensity * 0.42) : visibleGrowth;
    const sourceLayout = pulseSource ? SCREEN_LAYOUT[pulseSource] : null;
    const pulseAge = pulseTime ? (Date.now() - pulseTime) / 1000 : 99;
    const tempoPalette = [
      new THREE.Color("#22d3ee"),
      new THREE.Color("#38bdf8"),
      new THREE.Color("#6366f1"),
      new THREE.Color("#8b5cf6"),
      new THREE.Color("#ec4899"),
      new THREE.Color("#f97316"),
      new THREE.Color("#bef264"),
      new THREE.Color("#ffffff"),
    ];
    const tempoLevel = THREE.MathUtils.clamp(intensity, 0, 1) * (tempoPalette.length - 1);
    const tempoIndex = Math.min(tempoPalette.length - 2, Math.floor(tempoLevel));
    const tempoColor = tempoPalette[tempoIndex].clone().lerp(tempoPalette[tempoIndex + 1], tempoLevel - tempoIndex);
    const bloomPhase = visibleGrowth > 0.985 ? THREE.MathUtils.smoothstep(intensity, 0.48, 0.98) : 0;
    const bloomColor = tempoColor.clone().lerp(new THREE.Color("#ffffff"), 0.18);
    const particleSurge = 1 + bloomPhase * 0.42;
    
    // Update appearance stats
    if (pointsRef.current) {
      const mat = pointsRef.current.material as THREE.PointsMaterial;

      // Opacity logic: home screen is dark unless interaction
      if (gestureActive || (mode === 'interaction' && visibleGrowth > 0.001)) {
        opacityRef.current = 0.72 + (intensity * 0.2);
      } else if (mode === 'climax') {
        opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, 0.6 + (intensity * 0.4), 0.05);
      } else if (mode === 'flow') {
        opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, 0.4 + (intensity * 0.3), 0.05);
      } else {
        const targetOpacity = renderGrowth > 0 ? (0.04 + renderGrowth * 0.5) : 0;
        opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, targetOpacity, 0.03);
      }

      mat.opacity = opacityRef.current * previewBrightness;
      mat.visible = opacityRef.current > 0.0001;

      // Color Spectrum Shift 
      const c1 = new THREE.Color("#4ade80");
      const c2 = new THREE.Color("#bef264");
      const c3 = new THREE.Color("#fef08a");
      const c4 = new THREE.Color("#ffffff");
      if (intensity < 0.4) {
        colorRef.current.copy(c1).lerp(c2, intensity / 0.4);
      } else if (intensity < 0.8) {
        colorRef.current.copy(c2).lerp(c3, (intensity - 0.4) / 0.4);
      } else {
        colorRef.current.copy(c3).lerp(c4, (intensity - 0.8) / 0.2);
      }
      mat.color.copy(c4).lerp(bloomColor, bloomPhase * 0.88);
      
      // Sync shard appearance with stronger emissive sync
      if (leafRef.current) {
        const leafMat = leafRef.current.material as THREE.PointsMaterial;
        leafMat.opacity = Math.min(0.98, opacityRef.current * (0.5 + visibleGrowth * 0.58 + bloomPhase * 0.32)) * previewBrightness;
        leafMat.color.copy(new THREE.Color("#ffffff")).lerp(bloomColor, bloomPhase * 0.82);
        leafRef.current.geometry.setDrawRange(0, Math.floor(leafCount * Math.min(1, visibleGrowth * particleSurge) * previewDensity));
      }

      if (mistRef.current) {
        const mistMat = mistRef.current.material as THREE.PointsMaterial;
        mistMat.opacity = Math.min(0.62, 0.16 + idleMist * 0.36 + intensity * 0.22 + interactionPreview * 0.25) * (isOverviewScreen ? 0.58 : 1);
        mistMat.size = (0.05 + Math.max(idleMist, interactionPreview) * 0.07 + intensity * 0.06) * (isOverviewScreen ? 0.74 : 1);
        mistMat.color.copy(tempoColor);
        mistRef.current.geometry.setDrawRange(0, Math.floor(mistCount * Math.max(idleMist, interactionPreview) * (isOverviewScreen ? 0.46 : 1)));
      }

      if (energyRef.current) {
        const energyMat = energyRef.current.material as THREE.PointsMaterial;
        energyMat.opacity = Math.min(1, 0.24 + intensity * 0.9 + bloomPhase * 0.34 + (gestureActive ? 0.25 : 0)) * previewBrightness;
        energyMat.size = (0.035 + intensity * 0.08 + bloomPhase * 0.045 + (gestureActive ? 0.03 : 0)) * (isOverviewScreen ? 0.72 : 1);
        energyMat.color.copy(bloomColor);
        energyRef.current.geometry.setDrawRange(0, Math.floor(energyCount * Math.min(1, visibleGrowth * particleSurge) * previewDensity));
      }

      if (pollenRef.current) {
        const pollenMat = pollenRef.current.material as THREE.PointsMaterial;
        pollenMat.opacity = Math.min(0.9, 0.08 + visibleGrowth * 0.58 + intensity * 0.16 + bloomPhase * 0.28) * (isOverviewScreen ? 0.3 : 1);
        pollenMat.size = (0.06 + intensity * 0.065 + bloomPhase * 0.035) * (isOverviewScreen ? 0.58 : 1);
        pollenMat.color.copy(bloomColor);
        pollenRef.current.geometry.setDrawRange(0, Math.floor(pollenCount * Math.min(1, visibleGrowth * particleSurge) * (isOverviewScreen ? 0.28 : 1)));
      }

      if (glyphRef.current) {
        const glyphMat = glyphRef.current.material as THREE.PointsMaterial;
        glyphMat.opacity = Math.min(0.24, 0.025 + visibleGrowth * 0.09 + bloomPhase * 0.09) * (isOverviewScreen ? 0.5 : 1);
        glyphMat.size = 0.042 + intensity * 0.045 + bloomPhase * 0.026;
        glyphMat.color.copy(bloomColor);
        glyphRef.current.geometry.setDrawRange(0, Math.floor(glyphCount * Math.min(1, visibleGrowth * particleSurge) * previewDensity));
      }

      if (branchLineRef.current) {
        const branchMat = branchLineRef.current.material as THREE.LineBasicMaterial;
        branchMat.color.copy(bloomColor);
        branchMat.opacity = Math.min(0.58, visibleGrowth * 0.22 + intensity * 0.06 + bloomPhase * 0.32) * previewBrightness;
        branchLineRef.current.geometry.setDrawRange(0, Math.floor((branchLinePositions.length / 3) * visibleGrowth * previewDensity));
      }

      if (contourRef.current) {
        const contourMat = contourRef.current.material as THREE.LineBasicMaterial;
        contourMat.color.copy(bloomColor);
        contourMat.opacity = Math.min(0.28, visibleGrowth * 0.08 + intensity * 0.025 + bloomPhase * 0.17) * previewBrightness;
        contourRef.current.geometry.setDrawRange(0, Math.floor((contourPositions.length / 3) * visibleGrowth * previewDensity));
      }

      if (fiberRef.current) {
        const fiberMat = fiberRef.current.material as THREE.LineBasicMaterial;
        fiberMat.color.copy(new THREE.Color("#ffffff")).lerp(bloomColor, bloomPhase);
        fiberMat.opacity = visibleGrowth > 0.001 ? Math.min(0.98, 0.2 + visibleGrowth * 0.48 + intensity * 0.2 + bloomPhase * 0.24) * (isOverviewScreen ? 0.38 : 1) : 0;
        fiberRef.current.geometry.setDrawRange(0, Math.floor((fiberPositions.length / 3) * visibleGrowth * previewDensity));
      }

      if (rootFiberRef.current) {
        const rootMat = rootFiberRef.current.material as THREE.LineBasicMaterial;
        rootMat.color.copy(new THREE.Color("#ffffff")).lerp(bloomColor, bloomPhase);
        rootMat.opacity = visibleGrowth > 0.001 ? Math.min(0.88, 0.16 + visibleGrowth * 0.44 + intensity * 0.14 + bloomPhase * 0.22) * (isOverviewScreen ? 0.38 : 1) : 0;
        rootFiberRef.current.geometry.setDrawRange(0, Math.floor((rootFiberPositions.length / 3) * visibleGrowth * previewDensity));
      }

      if (meshRef.current) {
        meshRef.current.visible = visibleGrowth > 0.001 && opacityRef.current > 0.01;
        meshRef.current.children.forEach((child) => {
          const m = child as THREE.Mesh;
          const mMat = m.material as THREE.MeshStandardMaterial;
          mMat.color.copy(colorRef.current);
          mMat.emissive.copy(colorRef.current);
          mMat.emissiveIntensity = 0.5 + intensity * 4 + bloomPhase * 2.6;
          mMat.opacity = opacityRef.current * 0.2 * visibleGrowth * previewBrightness;
        });
      }
    }
    
    if (pointsRef.current) {
      const posAttr = pointsRef.current.geometry.attributes.position;
      const mat = pointsRef.current.material as THREE.PointsMaterial;

      const activeCount = visibleGrowth > 0.001 ? Math.floor(count * Math.min(1, renderGrowth * particleSurge) * previewDensity) : 0;
      pointsRef.current.geometry.setDrawRange(0, Math.max(0, activeCount));

      mat.size = (0.018 + (intensity * 0.055) + bloomPhase * 0.025 + (gestureActive ? 0.025 : 0)) * (isOverviewScreen ? 0.72 : 1);

      for (let i = 0; i < count; i++) {
        const ix = i * 3;
        const iy = i * 3 + 1;
        const iz = i * 3 + 2;

        const audioIdx = i % audioData.length;
        const audioValue = Math.abs(audioData[audioIdx]) * 3.0;
        const reveal = THREE.MathUtils.smoothstep(visibleGrowth + 0.03, growthOrder[i], growthOrder[i] + 0.12);
        const pulse = (gestureActive ? 0.032 : 0.012) + audioValue * 0.01;
        
        // Before the tree grows, a click on one screen propagates through every screen area.
        if (mode === 'interaction' && visibleGrowth <= 0.001 && sourceLayout) {
          screenCenters.forEach(({ layout, point }) => {
            const delay = (Math.abs(layout.col - sourceLayout.col) + Math.abs(layout.row - sourceLayout.row)) * 0.07;
            const phase = THREE.MathUtils.clamp((pulseAge - delay) / 0.78, 0, 1);
            if (phase <= 0 || phase >= 1) return;

            const dx = posAttr.array[ix] - point.x;
            const dy = posAttr.array[iy] - point.y;
            const dz = posAttr.array[iz] - point.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist <= 0.001 || dist >= 5.2) return;

            const rings = [
              { radius: 0.85 + phase * 1.25, width: 0.48, power: 0.055 },
              { radius: 2.0 + phase * 1.35, width: 0.62, power: 0.04 },
              { radius: 3.25 + phase * 1.1, width: 0.78, power: 0.028 },
            ];
            const force = rings.reduce((total, ring) => {
              const band = Math.max(0, 1 - Math.abs(dist - ring.radius) / ring.width);
              return total + band * band * ring.power;
            }, 0) * (0.9 + intensity);

            posAttr.array[ix] += (dx / dist) * force;
            posAttr.array[iy] += (dy / dist) * force;
            posAttr.array[iz] += (dz / dist) * force;
          });
        } else if (interactionPoint && (mode === 'interaction' || mode === 'climax')) {
          const dx = posAttr.array[ix] - interactionPoint.x;
          const dy = posAttr.array[iy] - interactionPoint.y;
          const dz = posAttr.array[iz] - (interactionPoint.z || 0);
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > 0.001 && dist < 8) {
            const force = (8 - dist) * 0.22 * (0.8 + intensity);
            posAttr.array[ix] += (dx / dist) * force;
            posAttr.array[iy] += (dy / dist) * force;
            posAttr.array[iz] += (dz / dist) * force;
          }
        }

        const lerpFactor = mode === 'interaction' ? (0.01 / (1 + intensity)) : 0.045;
        posAttr.array[ix] += (initialPositions[ix] - posAttr.array[ix]) * lerpFactor;
        posAttr.array[iy] += (initialPositions[iy] - posAttr.array[iy]) * lerpFactor;
        posAttr.array[iz] += (initialPositions[iz] - posAttr.array[iz]) * lerpFactor;

        const heightOrder = growthOrder[i];
        const flow = ((time * (0.09 + intensity * 0.16) + heightOrder * 1.8 + (i % 17) * 0.013) % 1) - 0.5;
        const upperBurst = Math.max(0, heightOrder - 0.62) * 2.6;
        const breathe = Math.sin(time * 0.42 + heightOrder * 8) * (0.018 + visibleGrowth * 0.045);
        posAttr.array[ix] += Math.sin(time * 0.55 + initialPositions[iz] + heightOrder * 12) * pulse * reveal;
        posAttr.array[iy] += (Math.cos(time * 0.45 + initialPositions[ix]) * pulse + flow * 0.18) * reveal;
        posAttr.array[iz] += Math.cos(time * 0.5 + initialPositions[ix] * 0.4) * pulse * 0.65 * reveal;
        posAttr.array[ix] += initialPositions[ix] * breathe * upperBurst;
        posAttr.array[iz] += initialPositions[iz] * breathe * upperBurst;
      }
      posAttr.needsUpdate = true;
    }

    if (squareFieldRef.current) {
      const mesh = squareFieldRef.current;
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.color.copy(tempoColor);
      material.opacity = Math.min(0.95, 0.34 + intensity * 0.22 + bloomPhase * 0.22);

      squareData.forEach((data, i) => {
        let pulse = 0;

        if (mode === 'interaction' && visibleGrowth <= 0.001 && sourceLayout) {
          const distance = Math.abs(data.screen.col - sourceLayout.col) + Math.abs(data.screen.row - sourceLayout.row);
          const delayed = THREE.MathUtils.clamp((pulseAge - distance * 0.07) / 0.75, 0, 1);
          pulse = Math.sin(delayed * Math.PI) * 0.9;
        }

        const freePower = 0.75 + intensity * 1.4 + pulse * 1.15;
        const sway = Math.sin(time * data.speed + data.phase);
        const lift = Math.cos(time * (data.speed * 0.82) + data.phase * 1.37);
        const float = Math.sin(time * (data.speed * 0.56) + data.phase * 0.71);
        squareMatrixObject.position.set(
          data.position.x + sway * data.drift.x * freePower + Math.sin(time * 0.24 + i * 0.19) * data.drift.x * 0.55,
          data.position.y + lift * data.drift.y * freePower + Math.cos(time * 0.2 + i * 0.23) * data.drift.y * 0.42,
          data.position.z + float * data.drift.z * freePower
        );
        squareMatrixObject.rotation.set(
          0,
          0,
          data.rotation.z + time * (0.65 + data.speed * 0.45 + pulse * 1.1) + Math.cos(time * 1.2 + i) * 0.18
        );
        squareMatrixObject.scale.setScalar(data.scale * (1.08 + intensity * 0.34 + bloomPhase * 0.22 + pulse * 1.25));
        squareMatrixObject.updateMatrix();
        mesh.setMatrixAt(i, squareMatrixObject.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }

    const idleBlockPalette = [
      new THREE.Color("#2dd4bf"),
      new THREE.Color("#22d3ee"),
      new THREE.Color("#bef264"),
      new THREE.Color("#38bdf8"),
      new THREE.Color("#c084fc"),
    ];
    idleBlockRefs.current.forEach((mesh, groupIndex) => {
      if (!mesh) return;
      const material = mesh.material as THREE.MeshBasicMaterial;
      const idlePresence = visibleGrowth <= 0.001 && mode !== 'flow' && mode !== 'climax' ? 1 : 0;
      const interactionBoost = mode === 'interaction' ? 1 : 0;
      material.color
        .copy(idleBlockPalette[groupIndex])
        .lerp(tempoColor, Math.min(0.44, intensity * 0.24 + interactionBoost * 0.3))
        .lerp(new THREE.Color("#ecfeff"), groupIndex === 0 ? 0.18 : 0.06);
      material.opacity = (0.38 + intensity * 0.1) * idlePresence * (isOverviewScreen ? 0.44 : 1);
      material.visible = material.opacity > 0.001;

      let instanceIndex = 0;
      idleBlockData.forEach((data) => {
        if (data.colorGroup !== groupIndex) return;
        const pulse = 0.9 + Math.sin(time * (1.15 + data.speed) + data.phase) * 0.22 + interactionBoost * 0.14;
        squareMatrixObject.position.set(
          data.position.x + Math.sin(time * data.speed + data.phase) * data.drift.x,
          data.position.y + Math.cos(time * data.speed * 0.74 + data.phase) * data.drift.y,
          data.position.z + Math.sin(time * data.speed * 0.52 + data.phase * 1.4) * data.drift.z
        );
        squareMatrixObject.rotation.set(
          data.rotation.x + time * data.speed * data.spin.x + Math.sin(time * 0.71 + data.phase) * 0.55,
          data.rotation.y + time * data.speed * data.spin.y + Math.cos(time * 0.63 + data.phase * 1.2) * 0.5,
          data.rotation.z + time * data.speed * data.spin.z + Math.sin(time * 0.83 + data.phase * 0.7) * 0.65
        );
        squareMatrixObject.scale.setScalar(data.scale * pulse * (isOverviewScreen ? 0.62 : 0.82));
        squareMatrixObject.updateMatrix();
        mesh.setMatrixAt(instanceIndex, squareMatrixObject.matrix);
        instanceIndex++;
      });
      mesh.instanceMatrix.needsUpdate = true;
    });

    if (energyRef.current) {
      const posAttr = energyRef.current.geometry.attributes.position;
      for (let i = 0; i < energyCount; i++) {
        const ix = i * 3;
        const t = energyOrder[i];
        const wave = Math.sin(time * (1.6 + intensity) + t * 34 + (i % 9)) * (0.12 + intensity * 0.3);
        const lift = ((time * (0.14 + intensity * 0.22) + t) % 1) * 1.35;
        posAttr.array[ix] = energyInitial[ix] + wave;
        posAttr.array[ix + 1] = energyInitial[ix + 1] + lift;
        posAttr.array[ix + 2] = energyInitial[ix + 2] + Math.cos(time + t * 19) * 0.14;
      }
      posAttr.needsUpdate = true;
    }

    if (mistRef.current) {
      mistRef.current.position.set(
        Math.sin(time * 0.08) * (1.6 + intensity * 1.2),
        Math.cos(time * 0.07) * (0.95 + intensity * 0.75),
        0
      );
      mistRef.current.rotation.z = Math.sin(time * 0.06) * 0.035;
    }

    if (pollenRef.current) {
      const posAttr = pollenRef.current.geometry.attributes.position;
      for (let i = 0; i < pollenCount; i++) {
        const ix = i * 3;
        const float = 0.004 + pollenOrder[i] * 0.006;
        posAttr.array[ix] += Math.sin(time * 0.8 + i) * float;
        posAttr.array[ix + 1] += Math.cos(time * 0.7 + i * 0.3) * float;
      }
      posAttr.needsUpdate = true;
    }

    if (glyphRef.current) {
      const posAttr = glyphRef.current.geometry.attributes.position;
      for (let i = 0; i < glyphCount; i++) {
        const ix = i * 3;
        const shimmer = 0.003 + glyphOrder[i] * 0.004;
        posAttr.array[ix] += Math.sin(time * 0.9 + glyphOrder[i] * 31) * shimmer;
        posAttr.array[ix + 1] += Math.cos(time * 0.65 + i * 0.17) * shimmer;
      }
      posAttr.needsUpdate = true;
    }

    if (meshRef.current) {
      meshRef.current.children.forEach((child, i) => {
        const mesh = child as THREE.Mesh;
        mesh.rotation.x += 0.01 * (1 + intensity);
        mesh.rotation.z += 0.005 * (1 + intensity);
        mesh.position.y += Math.sin(time + i) * 0.0015;
      });
    }
  });

  return (
    <group position={scenePosition as [number, number, number]} scale={[sceneScale.x, sceneScale.y, sceneScale.z]}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={count}
            array={positions}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            count={count}
            array={particleColors}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.035}
          color="#ffffff"
          vertexColors
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation={true}
        />
      </points>

      <points ref={leafRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={leafCount}
            array={leafPositions}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            count={leafCount}
            array={leafColors}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.055}
          color="#ffffff"
          vertexColors
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation={true}
        />
      </points>

      <points ref={mistRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={mistCount}
            array={mistPositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={1.4}
          color="#5eead4"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation={false}
        />
      </points>

      <instancedMesh ref={squareFieldRef} args={[undefined, undefined, squareData.length]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color="#5eead4"
          transparent
          opacity={0.34}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          wireframe
        />
      </instancedMesh>

      {["#2dd4bf", "#22d3ee", "#bef264", "#38bdf8", "#c084fc"].map((color, index) => (
        <instancedMesh
          key={`idle-block-${color}`}
          ref={(mesh) => {
            idleBlockRefs.current[index] = mesh;
          }}
          args={[undefined, undefined, Math.ceil(idleBlockData.length / 5)]}
        >
          <boxGeometry args={[1, 1, 0.34]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthTest={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </instancedMesh>
      ))}

      <points ref={energyRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={energyCount}
            array={energyPositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.045}
          color="#fef08a"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation={true}
        />
      </points>

      <points ref={pollenRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={pollenCount}
            array={pollenPositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.07}
          color="#ecfccb"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation={true}
        />
      </points>

      <points ref={glyphRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={glyphCount}
            array={glyphPositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.1}
          color="#e0f2fe"
          map={glyphTexture ?? undefined}
          transparent
          opacity={0}
          alphaTest={0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation={true}
        />
      </points>

      <lineSegments ref={branchLineRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={branchLinePositions.length / 3}
            array={branchLinePositions}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color="#fef9c3"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      <lineSegments ref={contourRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={contourPositions.length / 3}
            array={contourPositions}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color="#86efac"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      <lineSegments ref={fiberRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={fiberPositions.length / 3}
            array={fiberPositions}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            count={fiberColors.length / 3}
            array={fiberColors}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color="#ffffff"
          vertexColors
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      <lineSegments ref={rootFiberRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={rootFiberPositions.length / 3}
            array={rootFiberPositions}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            count={rootFiberColors.length / 3}
            array={rootFiberColors}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color="#ecfccb"
          vertexColors
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      <group ref={meshRef}>
        {shardData.map((data, i) => (
          <mesh key={i} position={data.position} rotation={data.rotation} scale={data.scale}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial 
              color="#bef264" 
              emissive="#bef264" 
              emissiveIntensity={1} 
              transparent 
              opacity={0} 
            />
          </mesh>
        ))}
      </group>
    </group>
  );
};
