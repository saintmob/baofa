import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

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

const SCREEN_LAYOUT: Record<string, { col: number; row: number }> = {
  MASTER: { col: 2.5, row: -1 },
  A1: { col: 0, row: 0 },
  B1: { col: 1, row: 0 },
  C1: { col: 2, row: 0 },
  D1: { col: 3, row: 0 },
  E1: { col: 4, row: 0 },
  F1: { col: 5, row: 0 },
  B2: { col: 1, row: 1 },
  C2: { col: 2, row: 1 },
  D2: { col: 3, row: 1 },
  E2: { col: 4, row: 1 },
  C3: { col: 2, row: 2 },
  D3: { col: 3, row: 2 },
  C4: { col: 2, row: 3 },
  D4: { col: 3, row: 3 },
  C5: { col: 2, row: 4 },
  D5: { col: 3, row: 4 },
};

function getScreenCenter(screenId = 'C5') {
  if (screenId === 'OVERVIEW') {
    return { x: 0, y: 0 };
  }

  const layout = SCREEN_LAYOUT[screenId] ?? SCREEN_LAYOUT.C5;
  return {
    x: (layout.col - 2.5) * 12,
    y: (2 - layout.row) * 7,
  };
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
  screenId = 'C5',
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
  const squareFieldRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Group>(null);
  const ripplePhaseRef = useRef(0);
  const count = 38000;
  const leafCount = 28000;
  const mistCount = 140000;
  const energyCount = 7000;
  const pollenCount = 4500;
  const glyphCount = 2500;
  const shardCount = 90;
  const opacityRef = useRef(0);
  const colorRef = useRef(new THREE.Color("#22d3ee"));
  const screenCenter = getScreenCenter(screenId);
  const sceneScale = screenId === 'OVERVIEW' ? 0.36 : 0.9;
  const glyphTexture = useMemo(() => createGlyphTexture(), []);
  const screenCenters = useMemo(() => Object.entries(SCREEN_LAYOUT).map(([id, layout]) => ({
    id,
    layout,
    point: new THREE.Vector3((layout.col - 2.5) * 12, (2 - layout.row) * 7, 0),
  })), []);

  const [positions, initialPositions, growthOrder] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const init = new Float32Array(count * 3);
    const order = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const isTrunk = t < 0.46;
      const isBranch = t >= 0.46 && t < 0.82;
      let x = 0;
      let y = -15;
      let z = 0;

      if (isTrunk) {
        const h = Math.random();
        const width = 0.55 + (1 - h) * 2.4;
        x = Math.sin(h * 13 + Math.random() * 1.5) * (0.35 + h * 0.7) + (Math.random() - 0.5) * width;
        y = -15 + h * 29;
        z = (Math.random() - 0.5) * (1.5 + h * 0.9);
        order[i] = h * 0.72;
      } else if (isBranch) {
        const branchBase = 0.22 + Math.random() * 0.72;
        const side = Math.random() > 0.5 ? 1 : -1;
        const reach = Math.pow(Math.random(), 0.72);
        const branchLength = 5 + branchBase * 15;
        const droop = Math.pow(reach, 1.5) * (1.5 + Math.random() * 2.8);
        x = side * reach * branchLength + Math.sin(reach * 8 + branchBase * 5) * 0.8;
        y = -15 + branchBase * 28 + reach * (2.2 + branchBase * 2.8) - droop;
        z = (Math.random() - 0.5) * (2 + reach * 4);
        order[i] = branchBase * 0.76 + reach * 0.22;
      } else {
        const crown = Math.random();
        const angle = Math.random() * Math.PI * 2;
        const radius = 5 + Math.random() * 17;
        x = Math.cos(angle) * radius * (0.9 + crown * 0.5);
        y = 3 + Math.sin(angle) * radius * 0.34 + Math.random() * 13;
        z = (Math.random() - 0.5) * 8;
        order[i] = 0.58 + Math.random() * 0.42;
      }
      
      pos[i * 3] = init[i * 3] = x;
      pos[i * 3 + 1] = init[i * 3 + 1] = y;
      pos[i * 3 + 2] = init[i * 3 + 2] = z;
    }
    return [pos, init, order];
  }, [count]);

  const [leafPositions, leafOrder] = useMemo(() => {
    const pos = new Float32Array(leafCount * 3);
    const order = new Float32Array(leafCount);
    for (let i = 0; i < leafCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.pow(Math.random(), 0.55) * 18;
      const sideBias = Math.sin(angle * 3) * 1.8;
      pos[i * 3] = Math.cos(angle) * radius + sideBias;
      pos[i * 3 + 1] = 1.5 + Math.sin(angle) * radius * 0.28 + Math.random() * 16;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 9;
      order[i] = 0.48 + Math.random() * 0.52;
    }
    return [pos, order];
  }, [leafCount]);

  const [mistPositions, mistOrder] = useMemo(() => {
    const pos = new Float32Array(mistCount * 3);
    const order = new Float32Array(mistCount);
    const screens = Object.values(SCREEN_LAYOUT);
    for (let i = 0; i < mistCount; i++) {
      let screen = screens[i % screens.length];
      if (i % 8 === 0) screen = SCREEN_LAYOUT.C5;
      if (i % 8 === 4) screen = SCREEN_LAYOUT.D5;
      pos[i * 3] = (screen.col - 2.5) * 12 + (Math.random() - 0.5) * 11.2;
      pos[i * 3 + 1] = (2 - screen.row) * 7 + (Math.random() - 0.5) * 6.8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 14;
      order[i] = Math.random();
    }
    return [pos, order];
  }, [mistCount]);

  const squareData = useMemo(() => {
    const squares: Array<{ position: THREE.Vector3; rotation: THREE.Euler; scale: number; screen: { col: number; row: number } }> = [];
    Object.values(SCREEN_LAYOUT).forEach((screen) => {
      const extra = screen === SCREEN_LAYOUT.C5 || screen === SCREEN_LAYOUT.D5 ? 130 : 32;
      for (let i = 0; i < 64 + extra; i++) {
        squares.push({
          position: new THREE.Vector3(
            (screen.col - 2.5) * 12 + (Math.random() - 0.5) * 10.4,
            (2 - screen.row) * 7 + (Math.random() - 0.5) * 6.4,
            (Math.random() - 0.5) * 6
          ),
          rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
          scale: (screen === SCREEN_LAYOUT.C5 || screen === SCREEN_LAYOUT.D5 ? 0.16 : 0.1) + Math.random() * 0.08,
          screen,
        });
      }
    });
    return squares;
  }, []);

  const [energyPositions, energyInitial, energyOrder] = useMemo(() => {
    const pos = new Float32Array(energyCount * 3);
    const init = new Float32Array(energyCount * 3);
    const order = new Float32Array(energyCount);
    for (let i = 0; i < energyCount; i++) {
      const t = i / energyCount;
      const lane = i % 9;
      const side = lane % 2 === 0 ? 1 : -1;
      const strand = lane - 4;
      const y = -15 + t * 31;
      const flare = Math.pow(t, 1.25) * 10;
      const x = Math.sin(t * 18 + lane * 0.9) * (0.5 + t * 1.5) + side * flare * Math.max(0, t - 0.42) + strand * 0.08;
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
    for (let i = 0; i < pollenCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.pow(Math.random(), 0.45) * 22;
      pos[i * 3] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = -2 + Math.random() * 22;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 12;
      order[i] = 0.38 + Math.random() * 0.62;
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
    const segments = 320;
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
    const rings = 14;
    const steps = 96;
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

  const [fiberPositions, fiberOrder] = useMemo(() => {
    const segmentCount = 26000;
    const pos = new Float32Array(segmentCount * 2 * 3);
    const order = new Float32Array(segmentCount);
    let segment = 0;

    const addSegment = (a: THREE.Vector3, b: THREE.Vector3, grow: number) => {
      if (segment >= segmentCount) return;
      const ix = segment * 6;
      pos[ix] = a.x;
      pos[ix + 1] = a.y;
      pos[ix + 2] = a.z;
      pos[ix + 3] = b.x;
      pos[ix + 4] = b.y;
      pos[ix + 5] = b.z;
      order[segment] = grow;
      segment++;
    };

    for (let strand = 0; strand < 1150; strand++) {
      const type = Math.random();
      const steps = 8 + Math.floor(Math.random() * 22);
      const branchSide = Math.random() > 0.5 ? 1 : -1;
      const baseT = Math.random();
      let p: THREE.Vector3;
      let direction: THREE.Vector3;

      if (type < 0.34) {
        const t = Math.random();
        p = new THREE.Vector3(
          (Math.random() - 0.5) * (1.2 + (1 - t) * 3.4) + Math.sin(t * 9) * 0.8,
          -16 + t * 23,
          (Math.random() - 0.5) * 2.1
        );
        direction = new THREE.Vector3(
          Math.sin(t * 12 + strand) * 0.08,
          0.45 + Math.random() * 0.32,
          (Math.random() - 0.5) * 0.1
        );
      } else if (type < 0.7) {
        const t = 0.34 + Math.random() * 0.56;
        p = new THREE.Vector3(
          Math.sin(t * 8) * 0.9 + (Math.random() - 0.5) * 1.2,
          -15 + t * 28,
          (Math.random() - 0.5) * 2.4
        );
        direction = new THREE.Vector3(
          branchSide * (0.45 + Math.random() * 0.9),
          0.18 + Math.random() * 0.38,
          (Math.random() - 0.5) * 0.42
        );
      } else {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.pow(Math.random(), 0.7) * 14;
        p = new THREE.Vector3(
          Math.cos(angle) * radius,
          1.5 + Math.random() * 14,
          Math.sin(angle) * 2.2
        );
        direction = new THREE.Vector3(
          Math.cos(angle + Math.random() * 1.4) * (0.28 + Math.random() * 0.5),
          (Math.random() - 0.35) * 0.5,
          Math.sin(angle) * 0.18
        );
      }

      for (let step = 0; step < steps; step++) {
        const grow = Math.max(0.04, (p.y + 16) / 31);
        const curl = new THREE.Vector3(
          Math.sin(step * 0.8 + strand * 1.7 + baseT * 9) * 0.32,
          Math.cos(step * 0.37 + strand) * 0.08,
          Math.sin(step * 0.5 + strand) * 0.11
        );
        const next = p.clone().add(direction).add(curl);
        addSegment(p, next, grow);
        p = next;
        direction.multiplyScalar(0.95).add(curl.multiplyScalar(0.08));
      }
    }

    return [pos, order];
  }, []);

  const [rootFiberPositions, rootFiberOrder] = useMemo(() => {
    const segmentCount = 9000;
    const pos = new Float32Array(segmentCount * 2 * 3);
    const order = new Float32Array(segmentCount);
    let segment = 0;

    const addSegment = (a: THREE.Vector3, b: THREE.Vector3, grow: number) => {
      if (segment >= segmentCount) return;
      const ix = segment * 6;
      pos[ix] = a.x;
      pos[ix + 1] = a.y;
      pos[ix + 2] = a.z;
      pos[ix + 3] = b.x;
      pos[ix + 4] = b.y;
      pos[ix + 5] = b.z;
      order[segment] = grow;
      segment++;
    };

    for (let strand = 0; strand < 360; strand++) {
      const side = Math.random() > 0.5 ? 1 : -1;
      const steps = 10 + Math.floor(Math.random() * 18);
      let p = new THREE.Vector3((Math.random() - 0.5) * 2.2, -15.6 + Math.random() * 1.5, (Math.random() - 0.5) * 1.8);
      let direction = new THREE.Vector3(side * (0.35 + Math.random() * 0.65), -0.12 + Math.random() * 0.12, (Math.random() - 0.5) * 0.2);
      for (let step = 0; step < steps; step++) {
        const next = p.clone().add(direction).add(new THREE.Vector3(
          Math.sin(step * 0.9 + strand) * 0.24,
          Math.cos(step * 0.5 + strand) * 0.08,
          Math.sin(step * 0.7) * 0.08
        ));
        addSegment(p, next, 0.02 + step / steps * 0.18);
        p = next;
        direction.multiplyScalar(0.98);
      }
    }

    return [pos, order];
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

      mat.opacity = opacityRef.current;
      mat.visible = opacityRef.current > 0.0001;

      // Color Spectrum Shift 
      const c1 = new THREE.Color("#22d3ee");
      const c2 = new THREE.Color("#8b5cf6");
      const c3 = new THREE.Color("#ec4899");
      const c4 = new THREE.Color("#ffffff");
      if (intensity < 0.4) {
        colorRef.current.copy(c1).lerp(c2, intensity / 0.4);
      } else if (intensity < 0.8) {
        colorRef.current.copy(c2).lerp(c3, (intensity - 0.4) / 0.4);
      } else {
        colorRef.current.copy(c3).lerp(c4, (intensity - 0.8) / 0.2);
      }
      mat.color.copy(colorRef.current);
      
      // Sync shard appearance with stronger emissive sync
      if (leafRef.current) {
        const leafMat = leafRef.current.material as THREE.PointsMaterial;
        leafMat.opacity = Math.min(0.8, opacityRef.current * (0.45 + visibleGrowth * 0.5));
        leafMat.color.copy(new THREE.Color("#7dd3fc").lerp(new THREE.Color("#b7f7a5"), visibleGrowth));
        leafRef.current.geometry.setDrawRange(0, Math.floor(leafCount * visibleGrowth));
      }

      if (mistRef.current) {
        const mistMat = mistRef.current.material as THREE.PointsMaterial;
        mistMat.opacity = Math.min(0.62, 0.16 + idleMist * 0.36 + intensity * 0.22 + interactionPreview * 0.25);
        mistMat.size = 0.05 + Math.max(idleMist, interactionPreview) * 0.07 + intensity * 0.06;
        mistMat.color.copy(tempoColor);
        mistRef.current.geometry.setDrawRange(0, Math.floor(mistCount * Math.max(idleMist, interactionPreview)));
      }

      if (energyRef.current) {
        const energyMat = energyRef.current.material as THREE.PointsMaterial;
        energyMat.opacity = Math.min(0.95, 0.24 + intensity * 0.9 + (gestureActive ? 0.25 : 0));
        energyMat.size = 0.03 + intensity * 0.07 + (gestureActive ? 0.025 : 0);
        energyRef.current.geometry.setDrawRange(0, Math.floor(energyCount * visibleGrowth));
      }

      if (pollenRef.current) {
        const pollenMat = pollenRef.current.material as THREE.PointsMaterial;
        pollenMat.opacity = Math.min(0.9, visibleGrowth * 0.75 + intensity * 0.2);
        pollenMat.size = 0.04 + intensity * 0.08;
        pollenRef.current.geometry.setDrawRange(0, Math.floor(pollenCount * visibleGrowth));
      }

      if (glyphRef.current) {
        const glyphMat = glyphRef.current.material as THREE.PointsMaterial;
        glyphMat.opacity = Math.min(0.08, visibleGrowth * 0.08);
        glyphMat.size = 0.045 + intensity * 0.04;
        glyphRef.current.geometry.setDrawRange(0, Math.floor(glyphCount * visibleGrowth));
      }

      if (branchLineRef.current) {
        const branchMat = branchLineRef.current.material as THREE.LineBasicMaterial;
        branchMat.opacity = Math.min(0.18, visibleGrowth * 0.16 + intensity * 0.04);
        branchLineRef.current.geometry.setDrawRange(0, Math.floor((branchLinePositions.length / 3) * visibleGrowth));
      }

      if (contourRef.current) {
        const contourMat = contourRef.current.material as THREE.LineBasicMaterial;
        contourMat.opacity = Math.min(0.08, visibleGrowth * 0.06 + intensity * 0.02);
        contourRef.current.geometry.setDrawRange(0, Math.floor((contourPositions.length / 3) * visibleGrowth));
      }

      if (fiberRef.current) {
        const fiberMat = fiberRef.current.material as THREE.LineBasicMaterial;
        fiberMat.opacity = visibleGrowth > 0.001 ? Math.min(0.72, 0.18 + visibleGrowth * 0.42 + intensity * 0.18) : 0;
        fiberRef.current.geometry.setDrawRange(0, Math.floor((fiberPositions.length / 3) * visibleGrowth));
      }

      if (rootFiberRef.current) {
        const rootMat = rootFiberRef.current.material as THREE.LineBasicMaterial;
        rootMat.opacity = visibleGrowth > 0.001 ? Math.min(0.58, 0.12 + visibleGrowth * 0.38 + intensity * 0.12) : 0;
        rootFiberRef.current.geometry.setDrawRange(0, Math.floor((rootFiberPositions.length / 3) * visibleGrowth));
      }

      if (meshRef.current) {
        meshRef.current.visible = visibleGrowth > 0.001 && opacityRef.current > 0.01;
        meshRef.current.children.forEach((child) => {
          const m = child as THREE.Mesh;
          const mMat = m.material as THREE.MeshStandardMaterial;
          mMat.color.copy(colorRef.current);
          mMat.emissive.copy(colorRef.current);
          mMat.emissiveIntensity = 0.5 + intensity * 4;
          mMat.opacity = opacityRef.current * 0.2 * visibleGrowth;
        });
      }
    }
    
    if (pointsRef.current) {
      const posAttr = pointsRef.current.geometry.attributes.position;
      const mat = pointsRef.current.material as THREE.PointsMaterial;

      const activeCount = visibleGrowth > 0.001 ? Math.floor(count * renderGrowth) : 0;
      pointsRef.current.geometry.setDrawRange(0, Math.max(0, activeCount));

      mat.size = 0.018 + (intensity * 0.055) + (gestureActive ? 0.025 : 0);

      for (let i = 0; i < count; i++) {
        const ix = i * 3;
        const iy = i * 3 + 1;
        const iz = i * 3 + 2;

        const audioIdx = i % audioData.length;
        const audioValue = Math.abs(audioData[audioIdx]) * 3.0;
        const reveal = THREE.MathUtils.smoothstep(visibleGrowth + 0.03, growthOrder[i], growthOrder[i] + 0.12);
        const pulse = (gestureActive ? 0.025 : 0.009) + audioValue * 0.008;
        
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

        posAttr.array[ix] += Math.sin(time * 0.55 + initialPositions[iz]) * pulse * reveal;
        posAttr.array[iy] += Math.cos(time * 0.45 + initialPositions[ix]) * pulse * reveal;
      }
      posAttr.needsUpdate = true;
    }

    if (squareFieldRef.current) {
      squareFieldRef.current.children.forEach((child, i) => {
        const mesh = child as THREE.Mesh;
        const material = mesh.material as THREE.MeshStandardMaterial;
        let pulse = 0;

        if (mode === 'interaction' && visibleGrowth <= 0.001 && sourceLayout) {
          const data = squareData[i];
          const distance = Math.abs(data.screen.col - sourceLayout.col) + Math.abs(data.screen.row - sourceLayout.row);
          const delayed = THREE.MathUtils.clamp((pulseAge - distance * 0.07) / 0.75, 0, 1);
          pulse = Math.sin(delayed * Math.PI) * 0.9;
        }

        mesh.position.x += Math.sin(time * 0.7 + i * 1.37) * 0.0025;
        mesh.position.y += Math.cos(time * 0.6 + i * 1.91) * 0.002;
        mesh.position.z += Math.sin(time * 0.8 + i * 0.73) * 0.0025;
        mesh.rotation.x += 0.008 + pulse * 0.025 + Math.sin(time + i) * 0.001;
        mesh.rotation.z += 0.006 + pulse * 0.02 + Math.cos(time * 0.9 + i) * 0.001;
        mesh.scale.setScalar(squareData[i].scale * (1 + pulse * 1.2));
        material.color.copy(tempoColor.clone().lerp(new THREE.Color("#ffffff"), pulse * 0.35));
        material.emissive.copy(material.color);
        material.opacity = Math.min(0.95, 0.42 + pulse * 0.6 + intensity * 0.28);
        material.emissiveIntensity = 1.25 + pulse * 3.1 + intensity * 3.8;
      });
    }

    if (energyRef.current) {
      const posAttr = energyRef.current.geometry.attributes.position;
      for (let i = 0; i < energyCount; i++) {
        const ix = i * 3;
        const t = energyOrder[i];
        const wave = Math.sin(time * (1.2 + intensity) + t * 28 + (i % 9)) * (0.08 + intensity * 0.22);
        const lift = ((time * (0.08 + intensity * 0.12) + t) % 1) * 0.9;
        posAttr.array[ix] = energyInitial[ix] + wave;
        posAttr.array[ix + 1] = energyInitial[ix + 1] + lift;
        posAttr.array[ix + 2] = energyInitial[ix + 2] + Math.cos(time + t * 17) * 0.08;
      }
      posAttr.needsUpdate = true;
    }

    if (mistRef.current) {
      const posAttr = mistRef.current.geometry.attributes.position;
      for (let i = 0; i < mistCount; i++) {
        const ix = i * 3;
        const drift = 0.002 + mistOrder[i] * 0.002;
        posAttr.array[ix] += Math.sin(time * 0.22 + mistOrder[i] * 13) * drift;
        posAttr.array[ix + 1] += Math.cos(time * 0.18 + mistOrder[i] * 19) * drift;
      }
      posAttr.needsUpdate = true;
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
    <group position={[-screenCenter.x, -screenCenter.y, 0]} scale={sceneScale}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={count}
            array={positions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.035}
          color="#22d3ee"
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
        </bufferGeometry>
        <pointsMaterial
          size={0.055}
          color="#b7f7a5"
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

      <group ref={squareFieldRef}>
        {squareData.map((data, i) => (
          <mesh key={i} position={data.position} rotation={data.rotation} scale={data.scale}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial
              color="#5eead4"
              emissive="#5eead4"
              emissiveIntensity={0.5}
              transparent
              opacity={0.34}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              wireframe
            />
          </mesh>
        ))}
      </group>

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
          color="#67e8f9"
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
          color="#f0fdfa"
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
          color="#93c5fd"
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
          color="#5eead4"
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
        </bufferGeometry>
        <lineBasicMaterial
          color="#dbeafe"
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
        </bufferGeometry>
        <lineBasicMaterial
          color="#ecfccb"
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
              color="#22d3ee" 
              emissive="#22d3ee" 
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
