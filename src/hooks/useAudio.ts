import { useCallback, useEffect, useRef, useState } from 'react';
import {
  engineManager,
} from '../music-workbench/audio';

export type FireworkBurstKind = 'small' | 'medium' | 'large';

type TreeMusic = {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
};

const TREE_MUSIC_URL = '/samples/music/cathedral-bark.mp3';
const FIREWORK_BURST_MP3_URL = '/samples/firework/IMG_7676.mp3';

export function useAudio() {
  const [isStarted, setIsStarted] = useState(false);
  const [evolution, setEvolution] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserDataRef = useRef<Float32Array>(new Float32Array(1024));
  const audioOutputRef = useRef<GainNode | null>(null);
  const treeMusicRef = useRef<TreeMusic | null>(null);

  const ensureAudioOutput = useCallback(() => {
    engineManager.init();
    if (!analyserRef.current && engineManager.ctx) {
      analyserRef.current = engineManager.ctx.createAnalyser();
      analyserRef.current.fftSize = 2048;
    }
    if (!audioOutputRef.current && engineManager.ctx) {
      audioOutputRef.current = engineManager.ctx.createGain();
      audioOutputRef.current.gain.value = 0.72;
      audioOutputRef.current.connect(engineManager.ctx.destination);
      if (analyserRef.current) {
        audioOutputRef.current.connect(analyserRef.current);
      }
    }
  }, []);

  const ensureTreeMusic = useCallback(() => {
    ensureAudioOutput();
    const ctx = engineManager.ctx;
    const output = audioOutputRef.current;
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
  }, [ensureAudioOutput]);

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
    ensureAudioOutput();
    setIsStarted(true);
  }, [ensureAudioOutput]);

  const stopAllLayers = useCallback(() => {
    setEvolution(0);
    stopTreeMusic(0);
    engineManager.stopAllProjects();
    setIsStarted(false);
  }, [stopTreeMusic]);

  const triggerFireworkBurst = useCallback(async (kind: FireworkBurstKind = 'small') => {
    await ensureStarted();
    stopTreeMusic(0);
    const audio = new Audio(FIREWORK_BURST_MP3_URL);
    audio.preload = 'auto';
    audio.volume = kind === 'large' ? 1 : kind === 'medium' ? 0.88 : 0.76;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, [ensureStarted, stopTreeMusic]);

  const fadeToSingleLayer = useCallback((_progress: number) => undefined, []);

  const updateTreeLayers = useCallback((growth: number, musicEvolution: number, isFading: boolean) => {
    setTreeMusic(growth, musicEvolution, isFading);
    if (growth <= 0 && isFading) {
      stopTreeMusic();
    }
    setIsStarted(true);
    setEvolution(musicEvolution);
  }, [setTreeMusic, stopTreeMusic]);

  const setMusicEvolution = useCallback((val: number) => {
    setEvolution(val);
  }, []);

  useEffect(() => {
    return () => stopAllLayers();
  }, [stopAllLayers]);

  const getAudioData = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return analyserDataRef.current;
    analyser.getFloatTimeDomainData(analyserDataRef.current);
    return analyserDataRef.current;
  }, []);

  return {
    isStarted,
    startAudio: ensureStarted,
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
