import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAudio } from './hooks/useAudio';
import { useHandTracking } from './hooks/useHandTracking';
import { AnimatePresence, motion } from 'motion/react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { ParticleScene } from './components/Visuals/ParticleScene';
import {
  WebGPUProjectRenderer,
  type ProjectRenderMode,
  type ProjectRenderStats,
} from './components/ProjectPerformanceRenderer';
import * as THREE from 'three';
import { db, handleFirestoreError, isFirebaseConfigured, OperationType } from './lib/firebase';
import { doc, getDocFromServer, onSnapshot, setDoc } from 'firebase/firestore';
import { Activity, Camera, CameraOff, LayoutGrid, MonitorCog, Music2, RotateCcw } from 'lucide-react';
import {
  DEFAULT_SCREEN_ID,
  MASTER_SCREEN,
  SCREEN_LAYOUT_ITEMS,
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
type WebGLPerformanceProfile = 'original' | 'optimized';
const RENDER_MODE_META: Record<ProjectRenderMode, {
  label: string;
  api: string;
  physics: string;
  render: string;
  transfer: string;
}> = {
  canvas2d: {
    label: 'Canvas 2D',
    api: 'CanvasRenderingContext2D',
    physics: 'Not applicable to this Three.js scene',
    render: 'Unavailable for identical scene',
    transfer: 'No comparable sample',
  },
  webgl: {
    label: 'WebGL',
    api: 'WebGLRenderer / Three.js',
    physics: 'CPU + GPU pipeline',
    render: 'Original project scene',
    transfer: 'Three.js buffers',
  },
  webgpu: {
    label: 'WebGPU',
    api: 'GPUCanvasContext',
    physics: 'Three.js WebGPU backend',
    render: 'Original project scene',
    transfer: 'Three.js WebGPU renderer',
  },
};

function getInitialRenderMode(): ProjectRenderMode {
  const saved = localStorage.getItem('baofa-render-mode');
  return saved === 'canvas2d' || saved === 'webgl' || saved === 'webgpu' ? saved : 'webgl';
}

function getInitialWebGLPerformanceProfile(): WebGLPerformanceProfile {
  return localStorage.getItem('baofa-webgl-profile') === 'optimized' ? 'optimized' : 'original';
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
  const {
    addRandomSampleLayer,
    triggerScaleNote,
    fadeToSingleLayer,
    updateTreeLayers,
    stopAllLayers,
    setMusicEvolution,
    evolution,
    getAudioData,
    useSampleLibrary,
    setUseSampleLibrary
  } = useAudio();
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
  const [gestureProgress, setGestureProgress] = useState(0);
  const [showGestureProgress, setShowGestureProgress] = useState(false);
  const [gestureStartPending, setGestureStartPending] = useState(false);
  const [gestureRoundLocked, setGestureRoundLocked] = useState(false);
  const [standbyPromptReady, setStandbyPromptReady] = useState(true);
  const [screenPulse, setScreenPulse] = useState<{ source: string; timestamp: number } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'error' | 'connecting'>('connecting');
  const [showWebGLDebug, setShowWebGLDebug] = useState(false);
  const [webglStats, setWebglStats] = useState<WebGLStats | null>(null);
  const [renderMode, setRenderMode] = useState<ProjectRenderMode>(getInitialRenderMode);
  const [projectStats, setProjectStats] = useState<ProjectRenderStats>({ fps: 0, frameMs: 0 });
  const [webglPerformanceProfile, setWebglPerformanceProfile] = useState<WebGLPerformanceProfile>(getInitialWebGLPerformanceProfile);
  const intensityRef = useRef(0.08);
  const lastClickTimeRef = useRef(0);
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
  const staleTreeResetRef = useRef(false);
  const evolutionRef = useRef(evolution);
  const lastSyncTimeRef = useRef<number>(Date.now());
  const requestRef = useRef<number>(null);
  const useSampleLibraryRef = useRef(useSampleLibrary);

  useEffect(() => {
    useSampleLibraryRef.current = useSampleLibrary;
    if (!useSampleLibrary) {
      stopAllLayers();
    }
  }, [stopAllLayers, useSampleLibrary]);

  useEffect(() => {
    localStorage.setItem('baofa-render-mode', renderMode);
    setProjectStats(
      renderMode === 'canvas2d'
        ? { fps: 0, frameMs: 0, status: 'unsupported', note: 'Canvas 2D cannot render the original Three.js scene' }
        : { fps: 0, frameMs: 0 }
    );
    setWebglStats(null);
  }, [renderMode]);

  useEffect(() => {
    localStorage.setItem('baofa-webgl-profile', webglPerformanceProfile);
    setWebglStats(null);
  }, [webglPerformanceProfile]);

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
    const handGestureEligible = handGestureActive && gestureInputArmedRef.current && !gestureNeedsReleaseRef.current;
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
        if (nextProgress > 0) {
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
        updateTreeLayers(treeGrowthRef.current, evolutionRef.current, true);
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
          scheduleStandbyPrompt(ROUND_STANDBY_PROMPT_DELAY_MS, false);
          syncToFirebase({ treeGrowth: 0, treePhase: 'idle', gestureActive: false, intensity: 0.08, evolution: 0, mode: 'idle' });
        }
      } else {
        const speed = 0.01 + (handGestureActive ? openHandCount * 0.009 : 0.004);
        treeGrowthRef.current = Math.min(1, treeGrowthRef.current + speed);
        if (treeGrowthRef.current >= 1) {
          treeCompletedAtRef.current ??= Date.now();
          intensityRef.current = Math.min(1, intensityRef.current + 0.01);
          evolutionRef.current = Math.min(1, evolutionRef.current + 0.004);
          setMusicEvolution(evolutionRef.current);
          updateTreeLayers(treeGrowthRef.current, evolutionRef.current, false);

          const completedElapsed = Date.now() - treeCompletedAtRef.current;
          if (
            (intensityRef.current >= 0.995 && evolutionRef.current >= 0.995) ||
            completedElapsed > TREE_COLOR_RAMP_MS
          ) {
            treeBrightAtRef.current ??= Date.now();
            treePhaseRef.current = 'bright';
          }

          if (treeBrightAtRef.current && Date.now() - treeBrightAtRef.current > TREE_BRIGHT_HOLD_MS) {
            treeFadingRef.current = true;
            treePhaseRef.current = 'fading';
            setMode('flow');
          }
        } else {
          treePhaseRef.current = 'growing';
          updateTreeLayers(treeGrowthRef.current, evolutionRef.current, false);
        }
      }
      setTreeGrowth(treeGrowthRef.current);
    }

    if (treeControllerRef.current || !treeTriggeredRef.current) {
      setGestureActive(treeFadingRef.current ? false : handGestureActive && (gestureInputArmedRef.current || treeTriggeredRef.current));
      const floor = treeFadingRef.current ? 0.02 : treeGrowthRef.current > 0 ? 0.12 + treeGrowthRef.current * 0.18 : 0.02;
      intensityRef.current = treeFadingRef.current ? intensityRef.current : Math.max(floor, intensityRef.current - 0.006);
      setIntensity(intensityRef.current);
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [fadeToSingleLayer, getAudioData, hasHandDetected, isCameraActive, isHandOpen, openHandCount, scheduleStandbyPrompt, setMusicEvolution, startGestureGrowth, stopAllLayers, syncToFirebase, updateTreeLayers]);

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
    };
  }, []);

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
    localStorage.setItem('baofa-role', isMaster ? 'master' : 'screen');
  }, [isMaster]);

  useEffect(() => {
    localStorage.setItem('baofa-view', isOverview ? 'overview' : 'screen');
  }, [isOverview]);

  const resetTreeGrowth = () => {
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

    const canStartIdleRound =
      treeGrowthRef.current <= 0 &&
      !treeTriggeredRef.current &&
      !gestureStartPending &&
      !gestureRoundLockedRef.current;
    if (canStartIdleRound) {
      scheduleStandbyPrompt(STANDBY_PROMPT_DELAY_MS, true);
    }

    const sourceScreen = isOverview ? getScreenFromPointer(e.clientX, e.clientY, rect, screenId) : screenId;
    const point = treeTriggeredRef.current
      ? new THREE.Vector3(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
          0
        ).multiplyScalar(14)
      : getScreenWorldPoint(sourceScreen);

    if (useSampleLibraryRef.current) {
      await addRandomSampleLayer();
    } else {
      stopAllLayers();
      await triggerScaleNote();
    }
    setInteractionPoint(point);
    setMode('interaction');
    setScreenPulse({ source: sourceScreen, timestamp: Date.now() });

    const now = Date.now();
    const gap = now - lastClickTimeRef.current;
    lastClickTimeRef.current = now;
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

  const handGestureActive = isCameraActive && hasHandDetected && isHandOpen && openHandCount > 0;
  const showStandbyPrompt =
    renderMode !== 'canvas2d' &&
    treeGrowth <= 0 &&
    gestureProgress <= 0 &&
    !showGestureProgress &&
    !gestureStartPending &&
    !gestureRoundLocked &&
    standbyPromptReady;
  const activeRenderStats =
    renderMode === 'webgl' && webglStats
      ? { fps: webglStats.fps, frameMs: webglStats.frameMs, status: 'running' as const }
      : projectStats;
  const renderModeMeta = RENDER_MODE_META[renderMode];
  const activeScreenId = isOverview ? 'OVERVIEW' : isMaster ? 'MASTER' : screenId;

  return (
    <div
      className="fixed inset-0 bg-[#02040a] cursor-default overflow-hidden select-none"
      onPointerDown={handleSplashPointerDown}
      onPointerMove={handleSplashPointerMove}
      onPointerUp={handleSplashPointerUp}
    >
      <div className="absolute inset-0 z-0 pointer-events-none">
        {renderMode === 'webgl' ? (
          <Canvas camera={{ position: [0, 0, 15], fov: 60 }} dpr={1} gl={{ antialias: false, powerPreference: 'high-performance' }}>
            <ambientLight intensity={0.45} />
            <ParticleScene
              audioData={audioData}
              interactionPoint={interactionPoint}
              mode={evolution > 0.8 ? 'climax' : mode}
              intensity={intensity}
              screenId={activeScreenId}
              treeGrowth={treeGrowth}
              gestureActive={gestureActive}
              pulseSource={screenPulse?.source}
              pulseTime={screenPulse?.timestamp}
              isStarted={treeGrowth > 0 || mode === 'interaction'}
              isPaused={false}
              performanceProfile={webglPerformanceProfile}
            />
            {(showWebGLDebug || renderMode === 'webgl') && <WebGLDebugProbe onStats={setWebglStats} />}
            {webglPerformanceProfile === 'original' && (
              <EffectComposer>
                <Bloom
                  intensity={isOverview ? 0.48 + intensity * 0.72 : 1.45 + intensity * 2.35}
                  luminanceThreshold={isOverview ? 0.28 : 0.08}
                  luminanceSmoothing={0.9}
                />
              </EffectComposer>
            )}
          </Canvas>
        ) : renderMode === 'canvas2d' ? (
          <div className="absolute inset-0 bg-[#02040a]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.08),transparent_34%)]" />
            <div className="absolute inset-0 flex items-center justify-center px-6">
              <div className="max-w-[520px] rounded border border-white/10 bg-[#111827]/88 px-6 py-5 text-center text-sm leading-relaxed text-white/72 backdrop-blur-xl">
                <div className="text-base font-semibold text-white/85">Canvas 2D 不能直接渲染当前原项目场景</div>
                <div className="mt-2">
                  当前画面由 Three.js 的 3D 场景、Points、Lines、InstancedMesh 和后处理组成。Canvas 2D 需要重写一套 2D 复刻版，画面和性能都不能与原场景直接对比。
                </div>
                <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-cyan-200/65">
                  请使用 WebGL / WebGPU 对比同一原项目场景
                </div>
              </div>
            </div>
          </div>
        ) : (
          <WebGPUProjectRenderer
            audioData={audioData}
            interactionPoint={interactionPoint}
            mode={evolution > 0.8 ? 'climax' : mode}
            intensity={intensity}
            screenId={activeScreenId}
            treeGrowth={treeGrowth}
            gestureActive={gestureActive}
            pulseSource={screenPulse?.source}
            pulseTime={screenPulse?.timestamp}
            isStarted={treeGrowth > 0 || mode === 'interaction'}
            onStats={setProjectStats}
          />
        )}
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
              <span className="absolute left-2 top-2">{getScreenDisplayId(MASTER_SCREEN.id)}</span>
              <span className="absolute bottom-2 right-2">大屏幕</span>
            </div>
            {SCREEN_LAYOUT_ITEMS.map((screen) => (
              <div
                key={`overview-${screen.id}`}
                className="absolute rounded-sm border border-cyan-300/20 bg-cyan-300/[0.025]"
                style={getLayoutStyle(screen)}
              >
                <span className="absolute left-1.5 top-1 text-[9px] font-mono tracking-widest text-cyan-100/65">{getScreenDisplayId(screen.id)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="absolute inset-0 z-20 flex pointer-events-none">
        {showStandbyPrompt && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-sm font-mono uppercase tracking-[0.32em] text-white/80">Click To Begin / 点击开始</div>
              <div className="mt-3 text-[10px] font-mono tracking-[0.22em] text-cyan-300/60">Open camera and show palm to grow / 开启摄像头并张开手掌生长</div>
            </div>
          </div>
        )}

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

        <div
          className="absolute left-1/2 top-6 flex w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 flex-col items-center gap-3 pointer-events-auto"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="grid w-[min(410px,100%)] grid-cols-3 rounded-lg border border-white/10 bg-black/45 p-1 backdrop-blur-xl">
            {(['canvas2d', 'webgl', 'webgpu'] as ProjectRenderMode[]).map((item) => (
              <button
                key={item}
                onClick={() => setRenderMode(item)}
                className={`h-10 rounded-md text-sm font-semibold transition ${
                  renderMode === item
                    ? 'bg-[#1767ff] text-white shadow-[0_0_18px_rgba(23,103,255,0.32)]'
                    : 'text-white/45 hover:text-white/80'
                }`}
              >
                {RENDER_MODE_META[item].label}
              </button>
            ))}
          </div>
          {renderMode === 'webgl' && (
            <button
              onClick={() => setWebglPerformanceProfile((value) => value === 'original' ? 'optimized' : 'original')}
              className={`h-9 rounded-full border px-4 font-mono text-[10px] uppercase tracking-[0.18em] transition backdrop-blur-xl ${
                webglPerformanceProfile === 'optimized'
                  ? 'border-emerald-300/45 bg-emerald-300/14 text-emerald-100'
                  : 'border-white/10 bg-black/40 text-white/55 hover:border-white/20 hover:text-white/80'
              }`}
              title="Toggle WebGL before/after optimization"
            >
              WebGL {webglPerformanceProfile === 'optimized' ? '优化后' : '优化前'}
            </button>
          )}
        </div>

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
          <button
            onClick={() => setShowWebGLDebug((value) => !value)}
            className={`ml-3 p-3 rounded-full border transition-all duration-500 backdrop-blur-md ${showWebGLDebug ? 'border-amber-300/50 bg-amber-300/15 text-amber-100' : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:bg-white/10'}`}
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

        <AnimatePresence>
          {showScreenPanel && (
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
                    {isOverview ? 'All Screens Preview / 全屏预览' : isMaster ? `Display ${getScreenDisplayId('MASTER')} / 主屏位置` : `Display ${getScreenDisplayId(screenId)} / 显示屏 ${getScreenDisplayId(screenId)}`}
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
                    {getScreenDisplayId('MASTER')} / 主屏
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
                  {getScreenDisplayId('MASTER')}
                </button>
                {SCREEN_LAYOUT_ITEMS.map((screen) => (
                  <button
                    key={screen.id}
                    onClick={() => handleScreenChange(screen.id)}
                    className={`absolute rounded-sm border text-[10px] font-mono transition ${!isMaster && !isOverview && screenId === screen.id ? 'border-cyan-300 bg-cyan-300/15 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.25)]' : 'border-white/10 bg-white/[0.04] text-white/45 hover:text-white/80 hover:border-white/20'}`}
                    style={getLayoutStyle(screen)}
                  >
                    {getScreenDisplayId(screen.id)}
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
        {showWebGLDebug && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-6 left-6 z-50 w-[320px] max-w-[calc(100vw-3rem)] pointer-events-auto rounded border border-amber-300/20 bg-black/65 p-4 font-mono text-[10px] uppercase tracking-[0.18em] text-white/65 backdrop-blur-xl"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-amber-100/90">
                <Activity size={14} />
                <span>Render Debug / 调试</span>
              </div>
              <button
                onClick={() => setShowWebGLDebug(false)}
                className="rounded border border-white/10 px-2 py-1 text-[9px] text-white/45 hover:border-white/20 hover:text-white/80"
              >
                Off
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <span>Mode</span><span className="text-right text-cyan-100">{renderModeMeta.label}</span>
              {renderMode === 'webgl' && (
                <>
                  <span>WebGL Profile</span>
                  <span className="text-right text-cyan-100">{webglPerformanceProfile === 'optimized' ? '优化后' : '优化前'}</span>
                </>
              )}
              <span>FPS</span>
              <span className="text-right text-cyan-100">
                {activeRenderStats.status === 'unsupported' ? 'N/A' : activeRenderStats.fps}
              </span>
              <span>Frame</span>
              <span className="text-right text-cyan-100">
                {activeRenderStats.status === 'unsupported' ? 'N/A' : `${activeRenderStats.frameMs}ms`}
              </span>
              <span>API</span><span className="text-right text-cyan-100">{renderModeMeta.api}</span>
              <span>Scene</span><span className="text-right text-cyan-100">{renderModeMeta.render}</span>
              <span>Pipeline</span><span className="text-right text-cyan-100">{renderModeMeta.physics}</span>
              {activeRenderStats.note && (
                <>
                  <span>Status</span><span className="text-right text-cyan-100 normal-case tracking-normal">{activeRenderStats.note}</span>
                </>
              )}
            </div>

            {renderMode === 'webgl' && webglStats && (
              <div className="mt-4 border-t border-white/10 pt-3">
                <div className="mb-2 text-amber-100/75">WebGL Renderer</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <span>Calls</span><span className="text-right text-cyan-100">{webglStats.calls}</span>
                  <span>Triangles</span><span className="text-right text-cyan-100">{webglStats.triangles.toLocaleString()}</span>
                  <span>Points</span><span className="text-right text-cyan-100">{webglStats.points.toLocaleString()}</span>
                  <span>Lines</span><span className="text-right text-cyan-100">{webglStats.lines.toLocaleString()}</span>
                  <span>Geometry</span><span className="text-right text-cyan-100">{webglStats.geometries}</span>
                  <span>Textures</span><span className="text-right text-cyan-100">{webglStats.textures}</span>
                  <span>DPR</span><span className="text-right text-cyan-100">{webglStats.pixelRatio}</span>
                  <span>Viewport</span><span className="text-right text-cyan-100">{webglStats.viewport}</span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-2 pointer-events-none z-50">
        <div className={`px-3 py-1.5 rounded-full text-[10px] font-mono tracking-widest uppercase transition-all duration-500 border ${
          isCameraActive ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-gray-900/50 border-white/5 text-white/20'
        }`}>
          {isCameraActive ? (
            <span className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${hasHandDetected ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'bg-gray-600'}`} />
              Motion / 手势: {hasHandDetected ? (openHandCount > 0 ? `Open x${openHandCount} / 展开 ${openHandCount}` : 'Paused / 暂停') : 'Scanning / 扫描中'}
            </span>
          ) : (
            `${isOverview ? 'Overview / 总览' : isMaster ? `${getScreenDisplayId('MASTER')} / 主屏` : `${getScreenDisplayId(screenId)} / 显示屏`} / Camera Offline / 摄像头离线`
          )}
        </div>
      </div>
    </div>
  );
}
