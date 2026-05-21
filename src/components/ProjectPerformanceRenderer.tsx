import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ParticleScene } from './Visuals/ParticleScene';

export type ProjectRenderMode = 'canvas2d' | 'webgl' | 'webgpu';

export type ProjectRenderStats = {
  fps: number;
  frameMs: number;
  status?: 'running' | 'unsupported';
  note?: string;
};

type ProjectRendererProps = {
  audioData: Float32Array;
  interactionPoint: THREE.Vector3 | null;
  mode: 'idle' | 'interaction' | 'flow' | 'climax';
  intensity: number;
  screenId?: string;
  treeGrowth: number;
  gestureActive: boolean;
  pulseSource?: string;
  isStarted: boolean;
  pulseTime?: number;
  onStats: (stats: ProjectRenderStats) => void;
};

const PARTICLE_COUNT = 52000;
const PALETTE = ['#22d3ee', '#2dd4bf', '#bef264', '#fef08a', '#c084fc', '#fb7185', '#f8fafc'];

function useFpsMeter(onStats: (stats: ProjectRenderStats) => void) {
  const lastSampleRef = useRef(performance.now());
  const frameCountRef = useRef(0);
  const frameMsRef = useRef(0);

  return useCallback((frameMs: number) => {
    frameCountRef.current += 1;
    frameMsRef.current += frameMs;

    const now = performance.now();
    const elapsed = now - lastSampleRef.current;
    if (elapsed < 500) return;

    onStats({
      fps: Math.round((frameCountRef.current * 1000) / elapsed),
      frameMs: Number((frameMsRef.current / Math.max(1, frameCountRef.current)).toFixed(1)),
      status: 'running',
    });
    frameCountRef.current = 0;
    frameMsRef.current = 0;
    lastSampleRef.current = now;
  }, [onStats]);
}

function makeProjectParticles() {
  const base = new Float32Array(PARTICLE_COUNT * 2);
  const idle = new Float32Array(PARTICLE_COUNT * 2);
  const velocity = new Float32Array(PARTICLE_COUNT * 2);
  const colors = new Uint8Array(PARTICLE_COUNT);
  const order = new Float32Array(PARTICLE_COUNT);

  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.pow(Math.random(), 0.58);
    const treeBias = Math.random();
    const crown = treeBias > 0.55;
    const trunk = treeBias < 0.28;
    const x = trunk
      ? 0.48 + (Math.random() - 0.5) * (0.045 + radius * 0.08)
      : crown
        ? 0.5 + Math.cos(angle) * radius * 0.38
        : Math.random();
    const y = trunk
      ? 0.93 - radius * 0.76
      : crown
        ? 0.34 + Math.sin(angle) * radius * 0.22
        : Math.random();

    base[i * 2] = Math.max(0, Math.min(1, x));
    base[i * 2 + 1] = Math.max(0, Math.min(1, y));
    idle[i * 2] = Math.random();
    idle[i * 2 + 1] = Math.random();
    velocity[i * 2] = (Math.random() * 2 - 1) * 0.00018;
    velocity[i * 2 + 1] = (Math.random() * 2 - 1) * 0.00018;
    colors[i] = i % PALETTE.length;
    order[i] = y;
  }

  return { base, idle, velocity, colors, order };
}

export function Canvas2DProjectRenderer({
  audioData,
  interactionPoint,
  mode,
  intensity,
  treeGrowth,
  gestureActive,
  isStarted,
  pulseTime,
  onStats,
}: ProjectRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tickStats = useFpsMeter(onStats);
  const data = useMemo(() => makeProjectParticles(), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !ctx) return;

    let animationId = 0;
    let last = performance.now();

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
      canvas.height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
    };

    resize();
    window.addEventListener('resize', resize);

    const draw = (now: number) => {
      const start = performance.now();
      const dt = Math.min(34, now - last);
      last = now;
      const width = canvas.width;
      const height = canvas.height;
      const pulseAge = pulseTime ? (Date.now() - pulseTime) / 1000 : 99;
      const pulse = mode === 'interaction' ? Math.max(0, Math.sin(Math.min(1, pulseAge) * Math.PI)) : 0;
      const growth = Math.max(treeGrowth, isStarted ? 0.08 : 0);
      const morph = THREE.MathUtils.smoothstep(growth, 0.04, 0.58);

      ctx.fillStyle = '#02040a';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      for (let i = 0; i < PARTICLE_COUNT; i += 1) {
        const ix = i * 2;
        const orderReveal = growth <= 0.01 ? 0.66 : data.order[i] > 1 - growth * 1.15 ? 1 : 0;
        if (orderReveal <= 0) continue;

        const audio = Math.abs(audioData[i % audioData.length] ?? 0) * 0.18;
        const drift = (0.35 + intensity * 1.6 + (gestureActive ? 0.7 : 0)) * dt;
        const baseX = THREE.MathUtils.lerp(data.idle[ix], data.base[ix], morph);
        const baseY = THREE.MathUtils.lerp(data.idle[ix + 1], data.base[ix + 1], morph);
        let x = baseX + Math.sin(now * 0.00022 + i * 0.013) * (0.004 + intensity * 0.012) + data.velocity[ix] * drift;
        let y = baseY + Math.cos(now * 0.00018 + i * 0.017) * (0.004 + intensity * 0.01) + data.velocity[ix + 1] * drift - audio;

        if (interactionPoint) {
          const pointerX = interactionPoint.x / 28 + 0.5;
          const pointerY = 0.5 - interactionPoint.y / 28;
          const dx = x - pointerX;
          const dy = y - pointerY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > 0.001 && distance < 0.24) {
            const force = (0.24 - distance) * (0.2 + intensity * 0.28 + pulse * 0.2);
            x += (dx / distance) * force;
            y += (dy / distance) * force;
          }
        }

        x = ((x % 1) + 1) % 1;
        y = ((y % 1) + 1) % 1;
        const size = growth > 0.2 ? 1.15 + intensity * 1.5 + audio * 7 : 1;
        ctx.fillStyle = PALETTE[data.colors[i]];
        ctx.globalAlpha = Math.min(0.95, 0.42 + intensity * 0.42 + orderReveal * 0.18);
        ctx.fillRect(x * width, y * height, size, size);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      tickStats(performance.now() - start);
      animationId = requestAnimationFrame(draw);
    };

    animationId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, [audioData, data, gestureActive, intensity, interactionPoint, isStarted, mode, onStats, pulseTime, tickStats, treeGrowth]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

export function WebGPUProjectRenderer({
  audioData,
  interactionPoint,
  mode,
  intensity,
  screenId,
  treeGrowth,
  gestureActive,
  pulseSource,
  isStarted,
  pulseTime,
  onStats,
}: ProjectRendererProps) {
  const [support, setSupport] = useState<'checking' | 'supported' | 'unsupported'>('checking');
  const [note, setNote] = useState('Checking WebGPU adapter');

  useEffect(() => {
    let disposed = false;
    const check = async () => {
      const gpu = (navigator as Navigator & { gpu?: any }).gpu;
      if (!gpu) {
        setSupport('unsupported');
        setNote('navigator.gpu is unavailable');
        onStats({ fps: 0, frameMs: 0, status: 'unsupported', note: 'navigator.gpu is unavailable' });
        return;
      }

      const adapter = await gpu.requestAdapter();
      if (!adapter || disposed) {
        setSupport('unsupported');
        setNote('No WebGPU adapter/device');
        onStats({ fps: 0, frameMs: 0, status: 'unsupported', note: 'No WebGPU adapter/device' });
        return;
      }
      setSupport('supported');
      setNote('WebGPU adapter ready');
    };

    check();

    return () => {
      disposed = true;
    };
  }, [onStats]);

  if (support !== 'supported') {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#02040a]">
        <div className="max-w-[420px] rounded border border-white/10 bg-[#111827]/90 px-5 py-4 text-center text-sm leading-relaxed text-white/70">
          {support === 'checking' ? '正在检测 WebGPU...' : '当前浏览器暂不支持 WebGPU。请确认 Chrome 已开启硬件加速，并在 chrome://gpu 查看 WebGPU 是否为 Hardware accelerated。'}
          <div className="mt-2 font-mono text-[11px] text-white/40">{note}</div>
        </div>
      </div>
    );
  }

  return (
    <Canvas
      camera={{ position: [0, 0, 15], fov: 60 }}
      dpr={1}
      gl={async ({ canvas }) => {
        const module = await import('three/src/renderers/webgpu/WebGPURenderer.js');
        const WebGPURenderer = module.default;
        const renderer = new WebGPURenderer({ canvas: canvas as any, antialias: false, alpha: false });
        await renderer.init();
        return renderer;
      }}
    >
      <ambientLight intensity={0.45} />
      <ParticleScene
        audioData={audioData}
        interactionPoint={interactionPoint}
        mode={mode}
        intensity={intensity}
        screenId={screenId}
        treeGrowth={treeGrowth}
        gestureActive={gestureActive}
        pulseSource={pulseSource}
        pulseTime={pulseTime}
        isStarted={isStarted}
        isPaused={false}
      />
      <FrameStatsProbe onStats={onStats} />
    </Canvas>
  );
}

function FrameStatsProbe({ onStats }: { onStats: (stats: ProjectRenderStats) => void }) {
  const tickStats = useFpsMeter(onStats);

  useFrame((_, delta) => {
    tickStats(delta * 1000);
  });

  return null;
}
