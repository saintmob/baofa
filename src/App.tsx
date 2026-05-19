import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAudio } from './hooks/useAudio';
import { useHandTracking } from './hooks/useHandTracking';
import { AnimatePresence, motion } from 'motion/react';
import { Canvas } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { ParticleScene } from './components/Visuals/ParticleScene';
import * as Tone from 'tone';
import * as THREE from 'three';
import { db, handleFirestoreError, isFirebaseConfigured, OperationType } from './lib/firebase';
import { doc, getDocFromServer, onSnapshot, setDoc } from 'firebase/firestore';
import { Camera, CameraOff, LayoutGrid, MonitorCog, RotateCcw } from 'lucide-react';

const SCREEN_ROWS = [
  ['A1', 'B1', 'C1', 'D1', 'E1', 'F1'],
  ['', 'B2', 'C2', 'D2', 'E2', ''],
  ['', '', 'C3', 'D3', '', ''],
  ['', '', 'C4', 'D4', '', ''],
  ['', '', 'C5', 'D5', '', ''],
];

const MASTER_SCREEN = { id: 'MASTER', label: 'Master / 主屏', col: 2.5, row: -1 };

const SCREEN_COORDS = SCREEN_ROWS.reduce<Record<string, { col: number; row: number }>>((coords, row, rowIndex) => {
  row.forEach((id, colIndex) => {
    if (id) coords[id] = { col: colIndex, row: rowIndex };
  });
  return coords;
}, { MASTER: { col: MASTER_SCREEN.col, row: MASTER_SCREEN.row } });

function getScreenWorldPoint(id: string) {
  const screen = SCREEN_COORDS[id] ?? SCREEN_COORDS.C5;
  return new THREE.Vector3((screen.col - 2.5) * 12, (2 - screen.row) * 7, 0);
}

function getScreenFromPointer(clientX: number, clientY: number, rect: DOMRect, fallback: string) {
  const side = Math.min(rect.width * 0.94, rect.height * 1.12);
  const gridWidth = side;
  const gridHeight = side * 5 / 6;
  const left = rect.left + (rect.width - gridWidth) / 2;
  const top = rect.top + (rect.height - gridHeight) / 2 + 54;
  const masterWidth = gridWidth / 6;
  const masterHeight = gridHeight / 5;
  const masterLeft = left + gridWidth / 2 - masterWidth / 2;
  const masterTop = top - masterHeight - 12;
  if (
    clientX >= masterLeft &&
    clientX <= masterLeft + masterWidth &&
    clientY >= masterTop &&
    clientY <= masterTop + masterHeight
  ) {
    return 'MASTER';
  }
  const col = Math.floor(((clientX - left) / gridWidth) * 6);
  const row = Math.floor(((clientY - top) / gridHeight) * 5);
  const id = SCREEN_ROWS[row]?.[col];
  return id || fallback;
}

export default function App() {
  const { isStarted, startAudio, triggerNote, setMusicEvolution, evolution, getAudioData } = useAudio();
  const { isHandOpen, openHandCount, hasHandDetected, isCameraActive, cameraError, startCamera, stopCamera } = useHandTracking();
  const [audioData, setAudioData] = useState(new Float32Array(1024));
  const [interactionPoint, setInteractionPoint] = useState<THREE.Vector3 | null>(null);
  const [mode, setMode] = useState<'idle' | 'interaction' | 'flow' | 'climax'>('idle');
  const [intensity, setIntensity] = useState(0.08);
  const [screenId, setScreenId] = useState(() => localStorage.getItem('baofa-screen-id') || 'C5');
  const [isMaster, setIsMaster] = useState(() => localStorage.getItem('baofa-role') === 'master');
  const [isOverview, setIsOverview] = useState(() => localStorage.getItem('baofa-view') === 'overview');
  const [showScreenPanel, setShowScreenPanel] = useState(true);
  const [treeGrowth, setTreeGrowth] = useState(0);
  const [gestureActive, setGestureActive] = useState(false);
  const [treeTriggered, setTreeTriggered] = useState(false);
  const [screenPulse, setScreenPulse] = useState<{ source: string; timestamp: number } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'error' | 'connecting'>('connecting');
  const intensityRef = useRef(0.08);
  const lastClickTimeRef = useRef(0);
  const treeGrowthRef = useRef(0);
  const treeTriggeredRef = useRef(false);
  const lastSyncTimeRef = useRef<number>(Date.now());
  const requestRef = useRef<number>(null);

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
        setScreenPulse({ source: data.screenPulse.source || 'C5', timestamp: data.screenPulse.timestamp });
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
    setTreeTriggered(true);
    setGestureActive(true);
    setMode('flow');
    intensityRef.current = Math.max(intensityRef.current, 0.55);
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

    const handGestureActive = isCameraActive && hasHandDetected && openHandCount > 0;
    if (handGestureActive && !treeTriggeredRef.current) {
      startGestureGrowth();
    }

    if (treeTriggeredRef.current) {
      const speed = 0.006 + (handGestureActive ? openHandCount * 0.004 : 0.002);
      treeGrowthRef.current = Math.min(1, treeGrowthRef.current + speed);
      setTreeGrowth(treeGrowthRef.current);
    }

    setGestureActive(handGestureActive);
    const floor = treeGrowthRef.current > 0 ? 0.12 + treeGrowthRef.current * 0.18 : 0.02;
    intensityRef.current = Math.max(floor, intensityRef.current - 0.006);
    setIntensity(intensityRef.current);

    requestRef.current = requestAnimationFrame(animate);
  }, [getAudioData, hasHandDetected, isCameraActive, openHandCount, startGestureGrowth]);

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

  const handleScreenChange = (id: string) => {
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

  return (
    <div
      className="fixed inset-0 bg-[#02040a] cursor-default overflow-hidden select-none"
      onPointerDown={handleSplashPointerDown}
      onPointerMove={handleSplashPointerMove}
      onPointerUp={handleSplashPointerUp}
    >
      <div className="absolute inset-0 z-0 pointer-events-none">
        <Canvas camera={{ position: [0, 0, 15], fov: 60 }} dpr={[1, 2]} gl={{ antialias: false }}>
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
          <EffectComposer>
            <Bloom intensity={1.15 + intensity * 1.75} luminanceThreshold={0.18} luminanceSmoothing={0.92} />
          </EffectComposer>
        </Canvas>
      </div>

      {isOverview && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="relative w-[min(94vw,112vh)]">
            <div className="relative mx-auto mb-3 w-[calc(100%/6)] aspect-[1.6] border border-emerald-300/35 bg-emerald-300/[0.035] text-[9px] font-mono tracking-widest text-emerald-100/80">
              <span className="absolute left-2 top-2">MASTER</span>
              <span className="absolute bottom-2 right-2">主屏</span>
            </div>
            <div className="grid grid-cols-6 grid-rows-5 aspect-[6/5] border border-cyan-300/20 bg-black/10">
              {SCREEN_ROWS.map((row) =>
                row.map((id, index) => (
                  <div
                    key={`overview-${row.join('-')}-${index}`}
                    className={`relative border border-cyan-300/15 ${id ? 'bg-cyan-300/[0.025]' : 'bg-black/45'}`}
                  >
                    {id && <span className="absolute left-2 top-2 text-[9px] font-mono tracking-widest text-cyan-100/65">{id}</span>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="absolute inset-0 z-20 flex pointer-events-none">
        {!isStarted && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-sm font-mono uppercase tracking-[0.32em] text-white/80">Click To Begin / 点击开始</div>
              <div className="mt-3 text-[10px] font-mono tracking-[0.22em] text-cyan-300/60">Open camera and show palm to grow / 开启摄像头并张开手掌生长</div>
            </div>
          </div>
        )}

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
                      if (next) setScreenId('MASTER');
                      setIsOverview(false);
                    }}
                    className={`h-9 px-3 rounded border text-[10px] font-mono uppercase tracking-widest transition ${isMaster && !isOverview ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-200' : 'border-white/10 bg-white/5 text-white/45'}`}
                  >
                    Master / 主屏
                  </button>
                </div>
              </div>

              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => handleScreenChange('MASTER')}
                  className={`w-28 rounded border px-3 py-2 text-[10px] font-mono uppercase tracking-widest transition ${isMaster && !isOverview ? 'border-emerald-300/45 bg-emerald-300/15 text-emerald-100' : 'border-white/10 bg-white/[0.04] text-white/45 hover:text-white/80'}`}
                >
                  Master / 主屏
                </button>
              </div>

              <div className="mt-3 grid grid-cols-6 gap-1.5">
                {SCREEN_ROWS.map((row) =>
                  row.map((id, index) => id ? (
                    <button
                      key={id}
                      onClick={() => handleScreenChange(id)}
                      className={`aspect-[1.6] rounded border text-[10px] font-mono transition ${!isMaster && !isOverview && screenId === id ? 'border-cyan-300 bg-cyan-300/15 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.25)]' : 'border-white/10 bg-white/[0.04] text-white/45 hover:text-white/80 hover:border-white/20'}`}
                    >
                      {id}
                    </button>
                  ) : (
                    <div key={`empty-${row.join('-')}-${index}`} />
                  ))
                )}
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
            `${isOverview ? 'Overview / 总览' : isMaster ? 'Master / 主屏' : `${screenId} / 显示屏`} / Camera Offline / 摄像头离线`
          )}
        </div>
      </div>
    </div>
  );
}
