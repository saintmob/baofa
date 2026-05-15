import React, { useState, useCallback, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';
import { ParticleScene } from './Visuals/ParticleScene';
import { motion, AnimatePresence } from 'motion/react';
import { Send, MousePointer2 } from 'lucide-react';

interface MainProcessorProps {
  audioData: Float32Array;
  onInteraction: (point: THREE.Vector3 | null, isInteracting: boolean) => void;
  onEmitFlow: (text: string) => void;
  evolution: number;
  intensity: number;
}

const PROMPTS = [
  "你想留下什么？ (What do you want to leave behind?)",
  "你最近学到了什么？ (What did you learn recently?)",
  "哪些问题尚未解决？ (What questions are still unsolved?)"
];

export const MainProcessor: React.FC<MainProcessorProps> = ({ audioData, onInteraction, onEmitFlow, evolution, intensity }) => {
  const [inputText, setInputText] = useState("");
  const [currentPromptIdx, setCurrentPromptIdx] = useState(0);
  const [showInput, setShowInput] = useState(true);

  const handlePointerDown = (e: any) => {
    const point = new THREE.Vector3(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
      0
    ).multiplyScalar(8);
    onInteraction(point, true);
  };

  const handlePointerUp = () => {
    onInteraction(null, false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    
    onEmitFlow(inputText);
    setShowInput(false);
    
    setTimeout(() => {
      setInputText("");
      setCurrentPromptIdx((prev) => (prev + 1) % PROMPTS.length);
      setShowInput(true);
    }, 4000);
  };

  return (
    <div className="relative w-full h-full overflow-hidden cursor-crosshair">
      {/* Interaction Surface - Completely transparent, purely functional */}
      <div 
        className="absolute inset-0 z-10 p-8 pointer-events-auto"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      />
    </div>
  );
};
