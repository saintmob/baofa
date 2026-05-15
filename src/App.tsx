import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAudio } from './hooks/useAudio';
import { motion, AnimatePresence } from 'motion/react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { ParticleScene } from './components/Visuals/ParticleScene';
import * as Tone from 'tone';
import * as THREE from 'three';
import { db, handleFirestoreError, OperationType } from './lib/firebase';
import { doc, onSnapshot, setDoc, getDocFromServer } from 'firebase/firestore';

export default function App() {
  const { isStarted, isMuted, toggleMute, startAudio, stopAudio, triggerNote, setMusicEvolution, evolution, getAudioData } = useAudio();
  const [audioData, setAudioData] = useState(new Float32Array(1024));
  const [flowText, setFlowText] = useState<string | undefined>(undefined);
  const [activeNodes, setActiveNodes] = useState<string[]>([]);
  const [interactionPoint, setInteractionPoint] = useState<THREE.Vector3 | null>(null);
  const [mode, setMode] = useState<'idle' | 'interaction' | 'flow' | 'climax'>('idle');
  const [intensity, setIntensity] = useState(0);
  const [isDisplayMode, setIsDisplayMode] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [remotePulse, setRemotePulse] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'error' | 'connecting'>('connecting');
  const intensityRef = useRef(0);
  const requestRef = useRef<number>(null);

  // Connectivity check
  const checkConnection = useCallback(async () => {
    setConnectionStatus('connecting');
    try {
      const stateRef = doc(db, 'global', 'state');
      await getDocFromServer(stateRef);
      setConnectionStatus('connected');
    } catch (err) {
      console.error("Connection failed:", err);
      // Wait a bit and retry once before showing error
      setTimeout(async () => {
        try {
          await getDocFromServer(doc(db, 'global', 'state'));
          setConnectionStatus('connected');
        } catch {
          setConnectionStatus('error');
        }
      }, 2000);
    }
  }, []);
  const lastSyncTimeRef = useRef<number>(Date.now());
  const clientId = useRef(Math.random().toString(36).substring(7));

  useEffect(() => {
    // Check for display mode URL parameter
    const params = new URLSearchParams(window.location.search);
    if (params.get('display') === 'true' || params.get('mode') === 'display') {
      setIsDisplayMode(true);
    }
  }, []);

  // Sync state from Firebase
  useEffect(() => {
    checkConnection();
    const unsub = onSnapshot(doc(db, 'global', 'state'), (snapshot) => {
      if (snapshot.exists()) {
        setConnectionStatus('connected');
        const data = snapshot.data();
        
        // Sync evolution
        if (typeof data.evolution === 'number') {
           setMusicEvolution(data.evolution);
        }

        // Sync mode
        if (data.mode) setMode(data.mode);

        // Sync intensity
        if (typeof data.intensity === 'number') {
          intensityRef.current = data.intensity;
          setIntensity(data.intensity);
        }

        // Sync interaction point
        if (data.lastInteraction && data.lastInteraction.timestamp > lastSyncTimeRef.current) {
          lastSyncTimeRef.current = data.lastInteraction.timestamp;
          const point = new THREE.Vector3(data.lastInteraction.x, data.lastInteraction.y, data.lastInteraction.z);
          setInteractionPoint(point);
          triggerNote("C3");
          
          // Trigger a visual pulse for remote interaction
          setRemotePulse(true);
          setTimeout(() => setRemotePulse(false), 1000);
        }

        // Sync active nodes
        if (data.activeNodes) setActiveNodes(data.activeNodes);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'global/state');
    });

    return () => unsub();
  }, [triggerNote, setMusicEvolution]);

  const syncToFirebase = useCallback(async (updates: any) => {
    try {
      await setDoc(doc(db, 'global', 'state'), updates, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'global/state');
    }
  }, []);

  // Animation frame for audio visualizer data and intensity decay
  const animate = useCallback(() => {
    setAudioData(getAudioData());
    
    // Decay intensity - slightly slower decay to allow building up color
    intensityRef.current = Math.max(0, intensityRef.current - 0.012);
    setIntensity(intensityRef.current);

    requestRef.current = requestAnimationFrame(animate);
  }, [getAudioData]);

  useEffect(() => {
    if (isStarted || true) { // Always run for intensity tracking on splash
      requestRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isStarted, animate]);

  const handleEmitFlow = (text: string) => {
    setFlowText(text);
    const newMode = 'flow';
    const newNodes = ["node_1", "node_2", "node_3", "node_4"];
    
    setMode(newMode);
    setActiveNodes(newNodes);

    syncToFirebase({
      mode: newMode,
      activeNodes: newNodes,
      intensity: Math.min(1, intensityRef.current + 0.3),
      evolution: Math.min(1, evolution + 0.1)
    });

    setTimeout(() => {
      setFlowText(undefined);
      setActiveNodes([]);
      setMode('idle');
      syncToFirebase({ mode: 'idle', activeNodes: [] });
    }, 4000);

    // Increase evolution and intensity
    setMusicEvolution(Math.min(1, evolution + 0.1));
    intensityRef.current = Math.min(1, intensityRef.current + 0.3);
  };

  const handleInteraction = (point: THREE.Vector3 | null, isInteracting: boolean) => {
    setInteractionPoint(point);
    const newMode = isInteracting ? 'interaction' : 'idle';
    setMode(newMode);
    
    if (isInteracting) {
      triggerNote("C3");
      const newIntensity = Math.min(1, intensityRef.current + 0.05);
      intensityRef.current = newIntensity;
      
      if (point) {
        syncToFirebase({
          lastInteraction: { x: point.x, y: point.y, z: point.z, timestamp: Date.now() },
          intensity: newIntensity,
          mode: newMode
        });
      }
    }
  };

  const handleNodeTrigger = (id: string) => {
    const notes = ["C4", "Eb4", "F4", "G4", "Bb4"];
    triggerNote(notes[Math.floor(Math.random() * notes.length)]);
    setMusicEvolution(Math.min(1, evolution + 0.01));
    const newIntensity = Math.min(1, intensityRef.current + 0.1);
    const newEvolution = Math.min(1, evolution + 0.01);
    intensityRef.current = newIntensity;
    setMusicEvolution(newEvolution);
    
    syncToFirebase({ intensity: newIntensity, evolution: newEvolution });
  };

  const handleSplashPointerDown = async (e: React.PointerEvent) => {
    // Start audio on first interaction if not yet started
    if (!isStarted) {
      await startAudio();
    }
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;

    await Tone.start();
    const notes = ["C2", "G2", "C3", "E3", "G3", "A3", "C4", "E4"];
    triggerNote(notes[Math.floor(Math.random() * notes.length)]);
    
    const point = new THREE.Vector3(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
      0
    ).multiplyScalar(14);
    
    setInteractionPoint(point);
    setMode('interaction');

    const newIntensity = Math.min(1, intensityRef.current + 0.25);
    const newEvolution = Math.min(1, evolution + 0.05);
    intensityRef.current = newIntensity;
    setMusicEvolution(newEvolution);

    syncToFirebase({
      lastInteraction: { x: point.x, y: point.y, z: point.z, timestamp: Date.now() },
      intensity: newIntensity,
      evolution: newEvolution,
      mode: 'interaction'
    });
  };

  const handleSplashPointerMove = (e: React.PointerEvent) => {
    if (!isStarted && mode === 'interaction' && e.currentTarget) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const point = new THREE.Vector3(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
        0
      ).multiplyScalar(14);
      setInteractionPoint(point);
    }
  };

  const handleSplashPointerUp = () => {
    if (!isStarted) {
      // Delay clearing to let the ripple travel a bit
      setTimeout(() => {
        setInteractionPoint(null);
        setMode('idle');
      }, 500);
    }
  };

  const handleStart = async () => {
    setIsInitializing(true);
    // Initial sync
    await syncToFirebase({ intensity: 0.2 });
    await startAudio();
  };

  const copyLink = (type: 'main' | 'display') => {
    const url = new URL(window.location.href);
    if (type === 'display') {
      url.searchParams.set('mode', 'display');
    } else {
      url.searchParams.delete('mode');
    }
    navigator.clipboard.writeText(url.toString());
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div 
      className="fixed inset-0 bg-[#02040a] cursor-crosshair overflow-hidden select-none"
      onPointerDown={handleSplashPointerDown}
      onPointerMove={handleSplashPointerMove}
      onPointerUp={handleSplashPointerUp}
    >
      {/* Visual Canvas Layer */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <Canvas camera={{ position: [0, 0, 15], fov: 60 }} dpr={[1, 2]} gl={{ antialias: false, alpha: true }}>
          <ambientLight intensity={0.5} />
          <ParticleScene 
            audioData={audioData} 
            interactionPoint={interactionPoint} 
            mode={evolution > 0.8 ? 'climax' : mode} 
            intensity={intensity}
            isStarted={true}
          />
          <EffectComposer>
            <Bloom intensity={1.5 + intensity * 2} luminanceThreshold={0.2} luminanceSmoothing={0.9} />
          </EffectComposer>
        </Canvas>
      </div>

      {/* Minimal Sync Status Overlay */}
      {connectionStatus === 'error' && (
        <div className="absolute bottom-4 right-4 text-[8px] font-mono text-red-500/40 uppercase tracking-widest animate-pulse pointer-events-none">
          Sync_Offline
        </div>
      )}
    </div>
  );
}
