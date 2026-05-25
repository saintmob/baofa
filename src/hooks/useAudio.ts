import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AVAILABLE_SOUNDS,
  type FxParams,
  type SoundDef,
  defaultFx,
  engineManager,
} from '../music-workbench/audio';

type LayerPhase = 'idle' | 'click' | 'gesture' | 'tree' | 'fading';
export type FireworkBurstKind = 'small' | 'medium' | 'large';

interface SoundLayer {
  id: string;
  sound: SoundDef;
  volume: number;
  targetVolume: number;
}

type TreeMusic = {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
};

const MAX_LAYERS = 7;
const PROJECT_ID = 'baofa-sound-layers';
const SAMPLE_LIBRARY_STORAGE_KEY = 'baofa-use-sample-library-manual';
const TREE_MUSIC_URL = '/samples/music/cathedral-bark.mp3';
const FIREWORK_BURST_MP3_URL = '/samples/firework/IMG_7676.mp3';
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
  const treeMusicRef = useRef<TreeMusic | null>(null);
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

  const ensureScaleOutput = useCallback(() => {
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
  }, []);

  const ensureTreeMusic = useCallback(() => {
    ensureScaleOutput();
    const ctx = engineManager.ctx;
    const output = scaleOutputRef.current;
    if (!ctx || !output) return null;
    if (treeMusicRef.current) return treeMusicRef.current;

    const audio = new Audio(TREE_MUSIC_URL);
    audio.loop = true;
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    const source = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const now = ctx.currentTime;

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.Q.setValueAtTime(0.35, now);
    gain.gain.setValueAtTime(0.0001, now);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(output);

    treeMusicRef.current = { audio, source, gain, filter };
    return treeMusicRef.current;
  }, [ensureScaleOutput]);

  const setTreeMusic = useCallback((growth: number, musicEvolution: number, isFading: boolean) => {
    const music = ensureTreeMusic();
    const ctx = engineManager.ctx;
    if (!music || !ctx) return;

    const now = ctx.currentTime;
    const presence = Math.max(0, Math.min(1, isFading ? growth : growth * 0.85 + musicEvolution * 0.25));
    const targetGain = isFading ? Math.max(0, presence * 0.26) : 0.28 + presence * 0.22;

    music.filter.frequency.setTargetAtTime(1600 + presence * 1200, now, 1.2);
    const isIntro = music.audio.currentTime < 5;
    music.gain.gain.setTargetAtTime(targetGain, now, isFading ? 1.4 : isIntro ? 4.2 : 1.8);
    if (music.audio.paused) {
      void music.audio.play().catch(() => undefined);
    }
  }, [ensureTreeMusic]);

  const restartTreeMusic = useCallback((loop = true, playbackRate = 1) => {
    const music = ensureTreeMusic();
    const ctx = engineManager.ctx;
    if (!music || !ctx) return;
    music.audio.loop = loop;
    music.audio.playbackRate = playbackRate;
    music.audio.currentTime = 0;
    music.gain.gain.cancelScheduledValues(ctx.currentTime);
    music.gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    void music.audio.play().catch(() => undefined);
  }, [ensureTreeMusic]);

  const stopTreeMusic = useCallback((fadeSeconds = 1.2) => {
    const music = treeMusicRef.current;
    const ctx = engineManager.ctx;
    if (!music || !ctx) return;
    if (fadeSeconds <= 0) {
      music.gain.gain.cancelScheduledValues(ctx.currentTime);
      music.gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      music.audio.pause();
      music.audio.currentTime = 0;
      return;
    }
    music.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, fadeSeconds);
  }, []);

  const ensureStarted = useCallback(async () => {
    ensureScaleOutput();
    if (useSampleLibraryRef.current) {
      syncProject();
      engineManager.startProject(PROJECT_ID);
    }
    setIsStarted(true);
  }, [ensureScaleOutput, syncProject]);

  const stopAllLayers = useCallback(() => {
    layersRef.current = [];
    phaseRef.current = 'idle';
    setEvolution(0);
    stopTreeMusic(0);
    if (engineManager.projects.has(PROJECT_ID)) {
      const project = engineManager.getProject(PROJECT_ID);
      project.setSlots(new Array<SoundDef | null>(MAX_LAYERS).fill(null));
      for (let index = 0; index < MAX_LAYERS; index++) {
        project.setFxParams(index, makeFx(0));
      }
    }
    engineManager.stopAllProjects();
    setIsStarted(false);
  }, [stopTreeMusic]);

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

    const frequency = SCALE_NOTES[Math.floor(Math.random() * SCALE_NOTES.length)] * 0.42;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const body = ctx.createOscillator();
    const brass = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const abyss = ctx.createOscillator();
    const shimmer = ctx.createOscillator();
    const choir = ctx.createOscillator();
    const sanctum = ctx.createOscillator();
    const toneGain = ctx.createGain();
    const subGain = ctx.createGain();
    const brassGain = ctx.createGain();
    const shimmerGain = ctx.createGain();
    const sanctumGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const brassFilter = ctx.createBiquadFilter();
    const sanctumFilter = ctx.createBiquadFilter();
    const lowShelf = ctx.createBiquadFilter();
    const delay = ctx.createDelay(1.2);
    const longDelay = ctx.createDelay(2);
    const delayFeedback = ctx.createGain();
    const longFeedback = ctx.createGain();
    const delayFilter = ctx.createBiquadFilter();
    const longDelayFilter = ctx.createBiquadFilter();
    const spaceGain = ctx.createGain();
    const farSpaceGain = ctx.createGain();

    osc.type = 'sine';
    body.type = 'triangle';
    brass.type = 'sawtooth';
    sub.type = 'sine';
    abyss.type = 'sine';
    shimmer.type = 'sine';
    choir.type = 'triangle';
    sanctum.type = 'sine';
    osc.frequency.setValueAtTime(frequency, now);
    body.frequency.setValueAtTime(frequency * 1.505, now);
    brass.frequency.setValueAtTime(frequency * 1.5, now);
    sub.frequency.setValueAtTime(frequency * 0.5, now);
    abyss.frequency.setValueAtTime(frequency * 0.25, now);
    shimmer.frequency.setValueAtTime(frequency * 2.01, now);
    choir.frequency.setValueAtTime(frequency * 3.01, now);
    sanctum.frequency.setValueAtTime(frequency * 0.75, now);
    body.detune.setValueAtTime(-8, now);
    brass.detune.setValueAtTime(-14, now);
    shimmer.detune.setValueAtTime(9, now);
    choir.detune.setValueAtTime(18, now);
    sanctum.detune.setValueAtTime(-21, now);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(390, now);
    filter.frequency.exponentialRampToValueAtTime(1380, now + 0.48);
    filter.frequency.exponentialRampToValueAtTime(390, now + 3.05);
    filter.Q.setValueAtTime(1.15, now);
    brassFilter.type = 'lowpass';
    brassFilter.frequency.setValueAtTime(280, now);
    brassFilter.frequency.exponentialRampToValueAtTime(1120, now + 0.58);
    brassFilter.frequency.exponentialRampToValueAtTime(480, now + 2.75);
    brassFilter.Q.setValueAtTime(0.75, now);
    sanctumFilter.type = 'bandpass';
    sanctumFilter.frequency.setValueAtTime(240, now);
    sanctumFilter.frequency.exponentialRampToValueAtTime(310, now + 2.4);
    sanctumFilter.Q.setValueAtTime(1.8, now);
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.setValueAtTime(120, now);
    lowShelf.gain.setValueAtTime(13.5, now);
    delay.delayTime.setValueAtTime(0.42, now);
    delayFeedback.gain.setValueAtTime(0.34, now);
    longDelay.delayTime.setValueAtTime(0.86, now);
    longFeedback.gain.setValueAtTime(0.22, now);
    delayFilter.type = 'lowpass';
    delayFilter.frequency.setValueAtTime(680, now);
    longDelayFilter.type = 'lowpass';
    longDelayFilter.frequency.setValueAtTime(420, now);
    spaceGain.gain.setValueAtTime(0.42, now);
    farSpaceGain.gain.setValueAtTime(0.3, now);
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.exponentialRampToValueAtTime(0.3, now + 0.22);
    subGain.gain.exponentialRampToValueAtTime(0.12, now + 2.2);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 4.2);
    brassGain.gain.setValueAtTime(0.0001, now);
    brassGain.gain.exponentialRampToValueAtTime(0.08, now + 0.3);
    brassGain.gain.exponentialRampToValueAtTime(0.19, now + 0.82);
    brassGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.5);
    shimmerGain.gain.setValueAtTime(0.0001, now);
    shimmerGain.gain.exponentialRampToValueAtTime(0.04, now + 0.7);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 4.4);
    sanctumGain.gain.setValueAtTime(0.0001, now);
    sanctumGain.gain.exponentialRampToValueAtTime(0.16, now + 0.9);
    sanctumGain.gain.exponentialRampToValueAtTime(0.09, now + 3);
    sanctumGain.gain.exponentialRampToValueAtTime(0.0001, now + 5.4);
    toneGain.gain.setValueAtTime(0.0001, now);
    toneGain.gain.exponentialRampToValueAtTime(0.14, now + 0.26);
    toneGain.gain.exponentialRampToValueAtTime(0.3, now + 0.9);
    toneGain.gain.exponentialRampToValueAtTime(0.13, now + 2.6);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 4.6);

    osc.connect(filter);
    body.connect(filter);
    sub.connect(subGain);
    abyss.connect(subGain);
    brass.connect(brassFilter);
    choir.connect(brassFilter);
    sanctum.connect(sanctumFilter);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(filter);
    filter.connect(lowShelf);
    lowShelf.connect(toneGain);
    brassFilter.connect(brassGain);
    brassGain.connect(toneGain);
    sanctumFilter.connect(sanctumGain);
    sanctumGain.connect(toneGain);
    subGain.connect(lowShelf);
    toneGain.connect(output);
    toneGain.connect(delay);
    toneGain.connect(longDelay);
    delay.connect(delayFilter);
    delayFilter.connect(delayFeedback);
    delayFeedback.connect(delay);
    delayFilter.connect(spaceGain);
    spaceGain.connect(output);
    longDelay.connect(longDelayFilter);
    longDelayFilter.connect(longFeedback);
    longFeedback.connect(longDelay);
    longDelayFilter.connect(farSpaceGain);
    farSpaceGain.connect(output);

    osc.start(now);
    body.start(now);
    brass.start(now);
    sub.start(now);
    abyss.start(now);
    shimmer.start(now);
    choir.start(now);
    sanctum.start(now);
    osc.stop(now + 5.6);
    body.stop(now + 5.6);
    brass.stop(now + 5.6);
    sub.stop(now + 5.6);
    abyss.stop(now + 5.6);
    shimmer.stop(now + 5.6);
    choir.stop(now + 5.6);
    sanctum.stop(now + 5.6);
  }, [ensureStarted]);

  const triggerFireworkBurst = useCallback(async (kind: FireworkBurstKind = 'small') => {
    await ensureStarted();
    stopTreeMusic(0);
    const audio = new Audio(FIREWORK_BURST_MP3_URL);
    audio.preload = 'auto';
    audio.volume = kind === 'large' ? 1 : kind === 'medium' ? 0.88 : 0.76;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, [ensureStarted, stopTreeMusic]);

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
    setTreeMusic(growth, musicEvolution, isFading);
    if (growth <= 0 && isFading) {
      stopTreeMusic();
    }
    if (!useSampleLibraryRef.current) {
      setEvolution(musicEvolution);
      setIsStarted(true);
      return;
    }
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
  }, [setTreeMusic, stopTreeMusic, syncProject]);

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
    triggerFireworkBurst,
    fadeToSingleLayer,
    updateTreeLayers,
    restartTreeMusic,
    fadeTreeMusic: stopTreeMusic,
    stopAllLayers,
    setMusicEvolution,
    evolution,
    getAudioData,
  };
}
