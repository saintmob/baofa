import * as Tone from 'tone';
import { useState, useCallback, useEffect, useRef } from 'react';

export function useAudio() {
  const [isStarted, setIsStarted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [evolution, setEvolution] = useState(0); // 0 to 1
  const ambientRef = useRef<Tone.PolySynth<any> | null>(null);
  const interactionSynthRef = useRef<Tone.PolySynth<any> | null>(null);
  const analyzerRef = useRef<Tone.Analyser | null>(null);
  const loopRef = useRef<Tone.Loop | null>(null);

  useEffect(() => {
    // Ambient Pad Synth (Background)
    ambientRef.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 4, decay: 2, sustain: 0.8, release: 5 },
      volume: -25
    }).toDestination();

    // Interaction Synth (Clear, high frequency)
    interactionSynthRef.current = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 2,
      modulationIndex: 10,
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.8 },
      volume: -10
    }).toDestination();

    const reverb = new Tone.Reverb({ decay: 5, wet: 0.5 }).toDestination();
    ambientRef.current.connect(reverb);
    interactionSynthRef.current.connect(reverb);

    analyzerRef.current = new Tone.Analyser("waveform", 1024);
    Tone.getDestination().connect(analyzerRef.current);

    // Evolving Ambient Loop (Non-rhythmic, slow chords)
    loopRef.current = new Tone.Loop((time) => {
      if (!ambientRef.current) return;
      const chords = [
        ["C2", "G2", "E3"],
        ["F2", "C3", "A3"],
        ["G2", "D3", "B3"],
        ["A2", "E3", "C4"]
      ];
      const chord = chords[Math.floor(Math.random() * chords.length)];
      // Trigger a long note that overlaps with the next cycle
      ambientRef.current.triggerAttackRelease(chord, "2n", time);
    }, "2n"); 

    return () => {
      ambientRef.current?.dispose();
      interactionSynthRef.current?.dispose();
      loopRef.current?.dispose();
      reverb.dispose();
    };
  }, []);

  const startAudio = useCallback(async () => {
    await Tone.start();
    loopRef.current?.start(0);
    Tone.getTransport().start();
    setIsStarted(true);
  }, []);

  const stopAudio = useCallback(() => {
    loopRef.current?.stop();
    Tone.getTransport().stop();
    setIsStarted(false);
    setEvolution(0);
  }, []);

  const triggerNote = useCallback((note: string = "C4") => {
    if (interactionSynthRef.current) {
      interactionSynthRef.current.triggerAttackRelease(note, "8n");
    }
  }, []);

  const setMusicEvolution = useCallback((val: number) => {
    setEvolution(val);
    if (ambientRef.current) {
      // Modulate volume or filter based on evolution
      ambientRef.current.volume.value = -25 + (val * 10);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    Tone.getDestination().mute = nextMute;
  }, [isMuted]);

  const getAudioData = useCallback(() => {
    if (!analyzerRef.current) return new Float32Array(1024);
    return analyzerRef.current.getValue() as Float32Array;
  }, []);

  return { 
    isStarted, 
    isMuted,
    toggleMute,
    startAudio, 
    stopAudio,
    triggerNote, 
    setMusicEvolution, 
    evolution,
    getAudioData 
  };
}
