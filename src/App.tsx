import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAudio } from './hooks/useAudio';
import { useHandTracking } from './hooks/useHandTracking';
import { AnimatePresence, motion } from 'motion/react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { ParticleScene } from './components/Visuals/ParticleScene';
import * as Tone from 'tone';
import * as THREE from 'three';
import { db, handleFirestoreError, isFirebaseConfigured, OperationType } from './lib/firebase';
import { createShowControlClient, type ControlCommand } from './lib/showControlClient';
import { BAOFA_NATIVE_URL, getVjScreenUrl } from './lib/runtimeConfig';
import { fetchScreenState, type ScreenPresentation, type ScreenRoute } from './lib/screenRoutes';
import { doc, getDocFromServer, onSnapshot, setDoc } from 'firebase/firestore';
import { Activity, Camera, CameraOff, ExternalLink, LayoutGrid, MonitorCog, RotateCcw, Route } from 'lucide-react';
import {
  DEFAULT_SCREEN_ID,
  MASTER_SCREEN,
  SCREEN_LAYOUT_ITEMS,
  STAGE_BOUNDS,
  getNearestScreenId,
  getScreenWorldPointData,
  isKnownScreenId,
  type ScreenLayoutItem,
} from './screenLayout';

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

const effectModes: Array<{ mode: 'idle' | 'interaction' | 'flow' | 'climax'; label: string; intensity: number }> = [
  { mode: 'idle', label: 'Calm / 静止', intensity: 0.08 },
  { mode: 'flow', label: 'Flow / 流动', intensity: 0.42 },
  { mode: 'interaction', label: 'Pulse / 脉冲', intensity: 0.72 },
  { mode: 'climax', label: 'Climax / 高潮', intensity: 1 },
];

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
  const { isStarted, startAudio, triggerNote, setMusicEvolution, evolution, getAudioData } = useAudio();
  const { isHandOpen, openHandCount, hasHandDetected, isCameraActive, cameraError, startCamera, stopCamera } = useHandTracking();
  const [audioData, setAudioData] = useState(new Float32Array(1024));
  const [interactionPoint, setInteractionPoint] = useState<THREE.Vector3 | null>(null);
  const [mode, setMode] = useState<'idle' | 'interaction' | 'flow' | 'climax'>('idle');
  const [intensity, setIntensity] = useState(0.08);
  const [screenId, setScreenId] = useState(getInitialScreenId);
  const [isMaster, setIsMaster] = useState(() => localStorage.getItem('baofa-role') === 'master');
  const [isOverview, setIsOverview] = useState(() => localStorage.getItem('baofa-view') === 'overview');
  const [showScreenPanel, setShowScreenPanel] = useState(true);
  const [treeGrowth, setTreeGrowth] = useState(0);
  const [gestureActive, setGestureActive] = useState(false);
  const [treeTriggered, setTreeTriggered] = useState(false);
  const [screenPulse, setScreenPulse] = useState<{ source: string; timestamp: number } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'error' | 'connecting'>('connecting');
  const [showControlStatus, setShowControlStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [webglStats, setWebglStats] = useState<WebGLStats | null>(null);
  const [screenRoute, setScreenRoute] = useState<ScreenRoute | null>(null);
  const [screenPresentation, setScreenPresentation] = useState<ScreenPresentation>({
    autoRedirect: true,
    showDebug: false,
    showMenu: false,
  });
  const [screenRouteError, setScreenRouteError] = useState('');
  const intensityRef = useRef(0.08);
  const lastClickTimeRef = useRef(0);
  const treeGrowthRef = useRef(0);
  const treeTriggeredRef = useRef(false);
  const lastSyncTimeRef = useRef<number>(Date.now());
  const requestRef = useRef<number>(null);
  const showControlRef = useRef<ReturnType<typeof createShowControlClient> | null>(null);
  const showControlClientIdRef = useRef(`baofa-${screenId}-${crypto.randomUUID().slice(0, 8)}`);
  const showControlCommandRef = useRef<(command: ControlCommand) => void>(() => undefined);

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

      if (typeof data.evolution === 'number') setMusicEvolution(data.evolution);
      if (data.mode) setMode(data.mode);
      if (typeof data.intensity === 'number') {
        intensityRef.current = data.intensity;
        setIntensity(data.intensity);
      }
      if (typeof data.treeGrowth === 'number') {
        treeGrowthRef.current = data.treeGrowth;
        setTreeGrowth(data.treeGrowth);
        treeTriggeredRef.current = data.treeGrowth > 0.01;
        setTreeTriggered(data.treeGrowth > 0.01);
      }
      if (typeof data.gestureActive === 'boolean') setGestureActive(data.gestureActive);
      if (data.lastInteraction && data.lastInteraction.timestamp > lastSyncTimeRef.current) {
        lastSyncTimeRef.current = data.lastInteraction.timestamp;
        setInteractionPoint(new THREE.Vector3(data.lastInteraction.x, data.lastInteraction.y, data.lastInteraction.z));
        triggerNote('C3');
      }
      if (data.screenPulse && typeof data.screenPulse.timestamp === 'number') {
        const source = isKnownScreenId(data.screenPulse.source) ? data.screenPulse.source : DEFAULT_SCREEN_ID;
        setScreenPulse({ source, timestamp: data.screenPulse.timestamp });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'global/state');
    });

    return () => unsub();
  }, [checkConnection, setMusicEvolution, triggerNote]);

  const syncToFirebase = useCallback(async (updates: any) => {
    if (!db) return;
    try {
      await setDoc(doc(db, 'global', 'state'), updates, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'global/state');
    }
  }, []);

  const startGestureGrowth = useCallback(() => {
    treeTriggeredRef.current = true;
    treeGrowthRef.current = Math.max(treeGrowthRef.current, 0.08);
    setTreeTriggered(true);
    setTreeGrowth(treeGrowthRef.current);
    setGestureActive(true);
    setMode('flow');
    intensityRef.current = Math.max(intensityRef.current, 0.72);
    syncToFirebase({
      treeGrowth: treeGrowthRef.current,
      gestureActive: true,
      intensity: intensityRef.current,
      mode: 'flow',
      lastInteraction: { x: 0, y: -14, z: 0, timestamp: Date.now() },
    });
  }, [syncToFirebase]);

  const animate = useCallback(() => {
    setAudioData(getAudioData());

    const handGestureActive = isCameraActive && hasHandDetected && isHandOpen && openHandCount > 0;
    if (handGestureActive && !treeTriggeredRef.current) {
      startGestureGrowth();
    }

    if (treeTriggeredRef.current) {
      const speed = 0.01 + (handGestureActive ? openHandCount * 0.009 : 0.004);
      treeGrowthRef.current = Math.min(1, treeGrowthRef.current + speed);
      setTreeGrowth(treeGrowthRef.current);
    }

    setGestureActive(handGestureActive);
    const floor = treeGrowthRef.current > 0 ? 0.12 + treeGrowthRef.current * 0.18 : 0.02;
    intensityRef.current = Math.max(floor, intensityRef.current - 0.006);
    setIntensity(intensityRef.current);

    requestRef.current = requestAnimationFrame(animate);
  }, [getAudioData, hasHandDetected, isCameraActive, isHandOpen, openHandCount, startGestureGrowth]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [animate]);

  useEffect(() => {
    if (!treeTriggered) return;
    const id = window.setInterval(() => {
      syncToFirebase({
        treeGrowth: treeGrowthRef.current,
        gestureActive,
        intensity: intensityRef.current,
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
      try {
        const { routes, presentation } = await fetchScreenState(controller.signal);
        setScreenRoute(isKnownScreenId(routeScreenId) ? routes[routeScreenId] || null : null);
        setScreenPresentation(presentation);
        setScreenRouteError('');
      } catch (error) {
        if (controller.signal.aborted) return;
        setScreenRouteError(error instanceof Error ? error.message : String(error));
      }
      timer = window.setTimeout(loadRoute, 2000);
    };

    void loadRoute();

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [routeScreenId]);

  useEffect(() => {
    if (!isKnownScreenId(routeScreenId)) return;
    if (!screenRoute || screenRoute.owner === 'baofa' || !screenPresentation.autoRedirect) return;
    if (screenRoute.owner === 'vj') {
      window.location.replace(screenRoute.url || getVjScreenUrl(routeScreenId));
    }
  }, [routeScreenId, screenPresentation.autoRedirect, screenRoute]);

  useEffect(() => {
    localStorage.setItem('baofa-role', isMaster ? 'master' : 'screen');
  }, [isMaster]);

  useEffect(() => {
    localStorage.setItem('baofa-view', isOverview ? 'overview' : 'screen');
  }, [isOverview]);

  const resetTreeGrowth = () => {
    treeGrowthRef.current = 0;
    treeTriggeredRef.current = false;
    intensityRef.current = 0.08;
    setTreeGrowth(0);
    setTreeTriggered(false);
    setGestureActive(false);
    setIntensity(0.08);
    setMode('idle');
    syncToFirebase({ treeGrowth: 0, gestureActive: false, intensity: 0.08, mode: 'idle' });
  };

  const applyEffectMode = (nextMode: 'idle' | 'interaction' | 'flow' | 'climax', nextIntensity: number) => {
    const clampedIntensity = Math.max(0, Math.min(1, nextIntensity));
    intensityRef.current = clampedIntensity;
    setIntensity(clampedIntensity);
    setMode(nextMode);
    if (nextMode !== 'idle') {
      treeTriggeredRef.current = true;
      treeGrowthRef.current = Math.max(treeGrowthRef.current, nextMode === 'climax' ? 0.82 : 0.24);
      setTreeTriggered(true);
      setTreeGrowth(treeGrowthRef.current);
    }
    syncToFirebase({
      mode: nextMode,
      intensity: clampedIntensity,
      treeGrowth: treeGrowthRef.current,
      gestureActive,
    });
  };

  const handleScreenChange = (id: string) => {
    if (!isKnownScreenId(id)) return;
    setScreenId(id);
    setIsMaster(id === 'MASTER');
    setIsOverview(false);
  };

  const handleSplashPointerDown = async (e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    if (!isStarted) await startAudio();
    await Tone.start();

    const sourceScreen = isOverview ? getScreenFromPointer(e.clientX, e.clientY, rect, screenId) : screenId;
    const point = treeTriggeredRef.current
      ? new THREE.Vector3(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
          0
        ).multiplyScalar(14)
      : getScreenWorldPoint(sourceScreen);

    const notes = ['D4', 'E4', 'F#4', 'A4', 'B4'];
    triggerNote(notes[Math.floor(Math.random() * notes.length)]);
    setInteractionPoint(point);
    setMode('interaction');
    setScreenPulse({ source: sourceScreen, timestamp: Date.now() });

    const now = Date.now();
    const gap = now - lastClickTimeRef.current;
    lastClickTimeRef.current = now;
    const tempoBoost = gap < 180 ? 0.62 : gap < 320 ? 0.5 : gap < 520 ? 0.36 : gap < 780 ? 0.26 : 0.18;
    const newIntensity = Math.min(1, intensityRef.current + tempoBoost);
    const newEvolution = Math.min(1, evolution + 0.025);
    intensityRef.current = newIntensity;
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
    if (mode !== 'interaction') return;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    setInteractionPoint(new THREE.Vector3(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
      0
    ).multiplyScalar(14));
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
        setMode(value);
        syncToFirebase({ mode: value });
      }
    } else if (command.command === 'setIntensity' && typeof value === 'number') {
      const next = Math.max(0, Math.min(1, value));
      intensityRef.current = next;
      setIntensity(next);
      syncToFirebase({ intensity: next });
    } else if (command.command === 'resetTree') {
      resetTreeGrowth();
    } else if (command.command === 'setScreen' && typeof value === 'string' && isKnownScreenId(value)) {
      handleScreenChange(value);
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
  }, [screenId, syncToFirebase]);

  showControlCommandRef.current = applyShowControlCommand;

  useEffect(() => {
    showControlRef.current = createShowControlClient({
      module: 'interaction',
      clientId: showControlClientIdRef.current,
      role: isMaster ? 'master' : isOverview ? 'overview' : 'screen',
      capabilities: ['module.statePatch', 'control.command', 'interaction.topology', 'interaction.pulse'],
      onStatus: setShowControlStatus,
      onCommand: (command) => showControlCommandRef.current(command),
    });

    return () => showControlRef.current?.close();
  }, []);

  useEffect(() => {
    showControlRef.current?.publishState({
      status: 'online',
      screenTopology: SCREEN_LAYOUT_ITEMS.map((screen) => screen.id),
      screenRegistry: SCREEN_LAYOUT_ITEMS.map((screen, index) => ({
        id: screen.id,
        label: `Screen ${screen.id}`,
        enabled: true,
        physicalIndex: index + 1,
      })),
      screenRoutes: Object.fromEntries(SCREEN_LAYOUT_ITEMS.map((screen) => [
        screen.id,
        {
          screenId: screen.id,
          owner: screenRoute?.screenId === screen.id ? screenRoute.owner : undefined,
          status: 'online',
          source: 'baofa',
          updatedAt: Date.now(),
        },
      ])),
      screenId,
      role: isMaster ? 'master' : 'screen',
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
      screenPresentation,
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
    screenPresentation,
    treeGrowth,
  ]);

  if (isKnownScreenId(routeScreenId) && screenRoute?.owner === 'vj') {
    const targetUrl = screenRoute.url || getVjScreenUrl(routeScreenId);

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
          {screenPresentation.autoRedirect && (
            <div className="text-[9px] font-mono uppercase tracking-widest text-white/35">Redirecting automatically / 自动跳转中</div>
          )}
          {screenRouteError && <div className="text-[9px] font-mono uppercase tracking-widest text-amber-200/50">Using last route</div>}
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
      <div className="absolute inset-0 z-0 pointer-events-none">
        <Canvas camera={{ position: [0, 0, 15], fov: 60 }} dpr={1} gl={{ antialias: false, powerPreference: 'high-performance' }}>
          <ambientLight intensity={0.45} />
          <ParticleScene
            audioData={audioData}
            interactionPoint={interactionPoint}
            mode={evolution > 0.8 ? 'climax' : mode}
            intensity={intensity}
            screenId={isOverview ? 'OVERVIEW' : isMaster ? 'MASTER' : screenId}
            treeGrowth={treeGrowth}
            gestureActive={gestureActive}
            pulseSource={screenPulse?.source}
            pulseTime={screenPulse?.timestamp}
            isStarted={treeGrowth > 0 || mode === 'interaction'}
            isPaused={false}
          />
          {screenPresentation.showDebug && <WebGLDebugProbe onStats={setWebglStats} />}
          <EffectComposer>
            <Bloom intensity={1.15 + intensity * 1.75} luminanceThreshold={0.18} luminanceSmoothing={0.92} />
          </EffectComposer>
        </Canvas>
      </div>

      {isOverview && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div
            className="relative w-[min(94vw,118vh)] border border-cyan-300/20 bg-black/10"
            style={{ aspectRatio: `${STAGE_BOUNDS.width} / ${STAGE_BOUNDS.height}` }}
          >
            <div
              className="absolute rounded-sm border border-emerald-300/35 bg-emerald-300/[0.035] text-[9px] font-mono tracking-widest text-emerald-100/80"
              style={getLayoutStyle(MASTER_SCREEN)}
            >
              <span className="absolute left-2 top-2">MASTER</span>
              <span className="absolute bottom-2 right-2">大屏幕</span>
            </div>
            {SCREEN_LAYOUT_ITEMS.map((screen) => (
              <div
                key={`overview-${screen.id}`}
                className="absolute rounded-sm border border-cyan-300/20 bg-cyan-300/[0.025]"
                style={getLayoutStyle(screen)}
              >
                <span className="absolute left-1.5 top-1 text-[9px] font-mono tracking-widest text-cyan-100/65">{screen.id}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="absolute inset-0 z-20 flex pointer-events-none">
        {screenPresentation.showMenu && (
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
            className="ml-3 p-3 rounded-full border border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:bg-white/10 transition-all duration-500 backdrop-blur-md"
            title="Screen routing"
          >
            <MonitorCog size={18} />
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

        <AnimatePresence>
          {screenPresentation.showMenu && showScreenPanel && (
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
                    {isOverview ? 'All Screens Preview / 全屏预览' : isMaster ? 'Master Position / 主屏位置' : `Display ${screenId} / 显示屏 ${screenId}`}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsOverview((value) => !value)}
                    className={`h-9 px-3 rounded border text-[10px] font-mono uppercase tracking-widest transition flex items-center gap-2 ${isOverview ? 'border-emerald-300/50 bg-emerald-300/15 text-emerald-100' : 'border-white/10 bg-white/5 text-white/45'}`}
                    aria-label="Overview"
                  >
                    <LayoutGrid size={14} />
                    Overview / 总览
                  </button>
                  <button
                    onClick={() => {
                      const next = !isMaster;
                      setIsMaster(next);
                      setScreenId(next ? 'MASTER' : DEFAULT_SCREEN_ID);
                      setIsOverview(false);
                    }}
                    className={`h-9 px-3 rounded border text-[10px] font-mono uppercase tracking-widest transition ${isMaster && !isOverview ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-200' : 'border-white/10 bg-white/5 text-white/45'}`}
                  >
                    Master / 主屏
                  </button>
                </div>
              </div>

              <div
                className="relative mt-4 rounded border border-white/10 bg-white/[0.025]"
                style={{ aspectRatio: `${STAGE_BOUNDS.width} / ${STAGE_BOUNDS.height}` }}
              >
                <button
                  onClick={() => handleScreenChange('MASTER')}
                  className={`absolute rounded-sm border px-2 text-[9px] font-mono uppercase tracking-widest transition ${isMaster && !isOverview ? 'border-emerald-300/45 bg-emerald-300/15 text-emerald-100' : 'border-white/10 bg-white/[0.04] text-white/45 hover:text-white/80'}`}
                  style={getLayoutStyle(MASTER_SCREEN)}
                >
                  大屏幕
                </button>
                {SCREEN_LAYOUT_ITEMS.map((screen) => (
                  <button
                    key={screen.id}
                    onClick={() => handleScreenChange(screen.id)}
                    className={`absolute rounded-sm border text-[10px] font-mono transition ${!isMaster && !isOverview && screenId === screen.id ? 'border-cyan-300 bg-cyan-300/15 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.25)]' : 'border-white/10 bg-white/[0.04] text-white/45 hover:text-white/80 hover:border-white/20'}`}
                    style={getLayoutStyle(screen)}
                  >
                    {screen.id}
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
                  <span className="text-cyan-200/70 break-all">{getVjScreenUrl(isMaster ? 'MASTER' : isOverview ? DEFAULT_SCREEN_ID : screenId)}</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
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

              <div className="mt-4 flex justify-end">
                <button
                  onClick={resetTreeGrowth}
                  className="h-10 rounded border border-white/10 bg-white/5 px-4 text-white/55 text-[10px] font-mono uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  <RotateCcw size={15} />
                  Reset / 重置
                </button>
              </div>

              <div className="mt-3 h-1 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-cyan-300 transition-all duration-300" style={{ width: `${Math.round(treeGrowth * 100)}%` }} />
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
        {screenPresentation.showDebug && (
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
              <span className="rounded border border-white/10 px-2 py-1 text-[9px] text-white/35">4300</span>
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

      {(screenPresentation.showMenu || screenPresentation.showDebug) && (
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
            `${isOverview ? 'Overview / 总览' : isMaster ? 'Master / 主屏' : `${screenId} / 显示屏`} / Camera Offline / 摄像头离线`
          )}
        </div>
      </div>
      )}
    </div>
  );
}
