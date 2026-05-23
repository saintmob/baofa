import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AVAILABLE_SOUNDS,
  type FxParams,
  type SoundDef,
  defaultFx,
  engineManager,
} from '../music-workbench/audio';

type LayerPhase = 'idle' | 'click' | 'gesture' | 'tree' | 'fading';

interface SoundLayer {
  id: string;
  sound: SoundDef;
  volume: number;
  targetVolume: number;
}

const MAX_LAYERS = 7;
const PROJECT_ID = 'baofa-sound-layers';
const SAMPLE_LIBRARY_STORAGE_KEY = 'baofa-use-sample-library-manual';
const LIBRARY_SOUNDS = AVAILABLE_SOUNDS.filter((sound) => sound.category !== 'custom');
const SCALE_NOTES = [293.66, 329.63, 369.99, 440, 493.88];

function makeLayer(sound: SoundDef): SoundLayer {
  return {
    id: `${sound.id}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
    sound,
    volume: 0,
    targetVolume: 72,
  };
}

function makeFx(volume: number): FxParams {
  return {
    ...defaultFx(),
    volume,
    compressor: 18,
    reverb: 12,
    delay: 4,
  };
}

function pickRandomSound(existing: SoundLayer[]) {
  const used = new Set(existing.map((layer) => layer.sound.id));
  const candidates = LIBRARY_SOUNDS.filter((sound) => !used.has(sound.id));
  const pool = candidates.length ? candidates : LIBRARY_SOUNDS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function useAudio() {
  const [isStarted, setIsStarted] = useState(false);
  const [useSampleLibrary, setUseSampleLibraryState] = useState(() => {
    const saved = localStorage.getItem(SAMPLE_LIBRARY_STORAGE_KEY);
    return saved === null ? false : saved === 'true';
  });
  const [evolution, setEvolution] = useState(0);
  const useSampleLibraryRef = useRef(useSampleLibrary);
  const layersRef = useRef<SoundLayer[]>([]);
  const phaseRef = useRef<LayerPhase>('idle');
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserDataRef = useRef<Float32Array>(new Float32Array(1024));
  const analyserConnectedRef = useRef(false);
  const scaleOutputRef = useRef<GainNode | null>(null);
  const frameRef = useRef<number | null>(null);

  const syncProject = useCallback(() => {
    if (!engineManager.ctx) return;
    const project = engineManager.getProject(PROJECT_ID);
    const slots = new Array<SoundDef | null>(MAX_LAYERS).fill(null);

    layersRef.current.slice(0, MAX_LAYERS).forEach((layer, index) => {
      slots[index] = layer.sound;
      project.setFxParams(index, makeFx(layer.volume));
    });

    for (let index = layersRef.current.length; index < MAX_LAYERS; index++) {
      project.setFxParams(index, makeFx(0));
    }

    project.setStyle('club');
    project.setMasterFxParams(makeFx(92));
    project.setSlots(slots);

    if (analyserRef.current && !analyserConnectedRef.current) {
      project.connectOutput(analyserRef.current);
      analyserConnectedRef.current = true;
    }
  }, []);

  const ensureStarted = useCallback(async () => {
    engineManager.init();
    if (!analyserRef.current && engineManager.ctx) {
      analyserRef.current = engineManager.ctx.createAnalyser();
      analyserRef.current.fftSize = 2048;
    }
    if (!scaleOutputRef.current && engineManager.ctx) {
      scaleOutputRef.current = engineManager.ctx.createGain();
      scaleOutputRef.current.gain.value = 0.72;
      scaleOutputRef.current.connect(engineManager.ctx.destination);
      if (analyserRef.current) {
        scaleOutputRef.current.connect(analyserRef.current);
      }
    }
    if (useSampleLibraryRef.current) {
      syncProject();
      engineManager.startProject(PROJECT_ID);
    }
    setIsStarted(true);
  }, [syncProject]);

  const stopAllLayers = useCallback(() => {
    layersRef.current = [];
    phaseRef.current = 'idle';
    setEvolution(0);
    if (engineManager.projects.has(PROJECT_ID)) {
      const project = engineManager.getProject(PROJECT_ID);
      project.setSlots(new Array<SoundDef | null>(MAX_LAYERS).fill(null));
      for (let index = 0; index < MAX_LAYERS; index++) {
        project.setFxParams(index, makeFx(0));
      }
    }
    engineManager.stopAllProjects();
    setIsStarted(false);
  }, []);

  const setUseSampleLibrary = useCallback((enabled: boolean) => {
    useSampleLibraryRef.current = enabled;
    setUseSampleLibraryState(enabled);
    localStorage.setItem(SAMPLE_LIBRARY_STORAGE_KEY, String(enabled));
    if (!enabled) {
      stopAllLayers();
    }
  }, [stopAllLayers]);

  const triggerScaleNote = useCallback(async () => {
    await ensureStarted();
    const ctx = engineManager.ctx;
    const output = scaleOutputRef.current;
    if (!ctx || !output) return;

    const frequency = SCALE_NOTES[Math.floor(Math.random() * SCALE_NOTES.length)];
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const shimmer = ctx.createOscillator();
    const toneGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    shimmer.type = 'triangle';
    osc.frequency.setValueAtTime(frequency, now);
    shimmer.frequency.setValueAtTime(frequency * 2.01, now);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, now);
    filter.frequency.exponentialRampToValueAtTime(900, now + 0.75);
    toneGain.gain.setValueAtTime(0.0001, now);
    toneGain.gain.exponentialRampToValueAtTime(0.22, now + 0.018);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);

    osc.connect(filter);
    shimmer.connect(filter);
    filter.connect(toneGain);
    toneGain.connect(output);

    osc.start(now);
    shimmer.start(now);
    osc.stop(now + 0.9);
    shimmer.stop(now + 0.9);
  }, [ensureStarted]);

  const addRandomSampleLayer = useCallback(async () => {
    await ensureStarted();
    if (!useSampleLibraryRef.current) return;
    phaseRef.current = 'click';
    const layers = layersRef.current.slice(0, MAX_LAYERS);
    const nextLayer = makeLayer(pickRandomSound(layers));

    if (layers.length < MAX_LAYERS) {
      layers.push(nextLayer);
    } else {
      layers.shift();
      layers.push(nextLayer);
    }

    layers.forEach((layer) => {
      layer.targetVolume = 64;
    });
    nextLayer.targetVolume = 82;
    layersRef.current = layers;
    syncProject();
  }, [ensureStarted, syncProject]);

  const fadeToSingleLayer = useCallback((progress: number) => {
    if (!useSampleLibraryRef.current) return;
    if (!layersRef.current.length) return;
    phaseRef.current = 'gesture';
    const keepIndex = 0;
    const desiredCount = Math.max(1, Math.ceil(MAX_LAYERS - progress * (MAX_LAYERS - 1)));

    layersRef.current.forEach((layer, index) => {
      if (index === keepIndex) {
        layer.targetVolume = 58 - progress * 12;
      } else {
        const shouldRemain = index < desiredCount;
        layer.targetVolume = shouldRemain ? Math.max(12, 42 * (1 - progress)) : 0;
      }
    });
  }, []);

  const updateTreeLayers = useCallback((growth: number, musicEvolution: number, isFading: boolean) => {
    if (!useSampleLibraryRef.current) return;
    if (growth <= 0 && !layersRef.current.length) return;
    if (!engineManager.ctx) return;
    syncProject();
    engineManager.startProject(PROJECT_ID);
    setIsStarted(true);
    phaseRef.current = isFading ? 'fading' : 'tree';
    setEvolution(musicEvolution);

    const targetCount = isFading
      ? Math.max(0, Math.ceil(growth * MAX_LAYERS))
      : Math.max(1, Math.min(MAX_LAYERS, 1 + Math.floor(Math.max(growth * 0.42, musicEvolution) * (MAX_LAYERS - 1))));

    const nextLayers = layersRef.current.slice(0, MAX_LAYERS);
    while (nextLayers.length < targetCount) {
      nextLayers.push(makeLayer(pickRandomSound(nextLayers)));
    }
    layersRef.current = nextLayers;

    layersRef.current.forEach((layer, index) => {
      if (index >= targetCount) {
        layer.targetVolume = 0;
        return;
      }

      if (isFading) {
        const fadeStart = index / MAX_LAYERS;
        const fadeAmount = Math.max(0, Math.min(1, (1 - growth - fadeStart) * 2.2));
        layer.targetVolume = Math.max(0, 62 * (1 - fadeAmount));
      } else {
        const layerLift = index / Math.max(1, MAX_LAYERS - 1);
        layer.targetVolume = 48 + layerLift * 28 + musicEvolution * 10;
      }
    });
  }, [syncProject]);

  useEffect(() => {
    const tick = () => {
      let changed = false;
      layersRef.current.forEach((layer) => {
        const next = layer.volume + (layer.targetVolume - layer.volume) * 0.045;
        if (Math.abs(next - layer.volume) > 0.05) changed = true;
        layer.volume = next;
      });

      const before = layersRef.current.length;
      layersRef.current = layersRef.current.filter((layer) => layer.targetVolume > 0.1 || layer.volume > 1);
      if (before !== layersRef.current.length) changed = true;

      if (changed) syncProject();

      if (phaseRef.current === 'fading' && layersRef.current.length === 0) {
        stopAllLayers();
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      stopAllLayers();
    };
  }, [stopAllLayers, syncProject]);

  const setMusicEvolution = useCallback((val: number) => {
    setEvolution(val);
  }, []);

  const getAudioData = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return analyserDataRef.current;
    analyser.getFloatTimeDomainData(analyserDataRef.current);
    return analyserDataRef.current;
  }, []);

  return {
    isStarted,
    useSampleLibrary,
    setUseSampleLibrary,
    startAudio: ensureStarted,
    addRandomSampleLayer,
    triggerScaleNote,
    fadeToSingleLayer,
    updateTreeLayers,
    stopAllLayers,
    setMusicEvolution,
    evolution,
    getAudioData,
  };
}
