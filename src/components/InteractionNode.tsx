import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Radio } from 'lucide-react';

interface InteractionNodeProps {
  id: string;
  onTrigger: () => void;
  isActive: boolean;
  flowText?: string;
}

export const InteractionNode: React.FC<InteractionNodeProps> = ({ id, onTrigger, isActive, flowText }) => {
  const [clicked, setClicked] = useState(false);

  const handleClick = () => {
    setClicked(true);
    onTrigger();
    setTimeout(() => setClicked(false), 500);
  };

  return (
    <div className="relative w-full aspect-square bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden flex flex-col items-center justify-center group transition-all hover:bg-white/[0.05] hover:border-white/10">
      {/* Background Micro-Dots */}
      <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ 
        backgroundImage: 'radial-gradient(white 0.5px, transparent 0.5px)', 
        backgroundSize: '12px 12px' 
      }} />

      {/* Flow Text Animation */}
      <AnimatePresence>
        {flowText && (
          <motion.div
            initial={{ y: 15, opacity: 0 }}
            animate={{ y: -15, opacity: [0, 1, 0] }}
            transition={{ duration: 4, ease: "easeOut" }}
            className="absolute text-[8px] text-cyan-400 font-mono text-center px-4 leading-tight uppercase tracking-tighter"
          >
            {flowText}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleClick}
        className={`relative z-10 w-12 h-12 rounded-full border flex items-center justify-center transition-all duration-500 overflow-hidden ${
          clicked || isActive 
            ? 'bg-cyan-500/10 border-cyan-400/50 shadow-[0_0_25px_rgba(34,211,238,0.2)]' 
            : 'bg-transparent border-white/10 hover:border-white/20'
        }`}
      >
        <div className={`absolute inset-0 bg-cyan-500/5 transition-opacity duration-500 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
        <Radio size={18} className={clicked || isActive ? 'text-cyan-400' : 'text-white/20'} />
      </motion.button>

      <div className="mt-4 flex flex-col items-center">
        <span className="text-[8px] font-mono text-white/30 uppercase tracking-[0.4em]">Sub_Screen_{id} / 子屏幕_{id}</span>
        {isActive && (
          <motion.div 
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            className="h-[1px] w-6 bg-cyan-500/50 mt-1.5 shadow-[0_0_5px_#22d3ee]"
          />
        )}
      </div>

      {/* Modern Edge Brackets */}
      <div className="absolute top-3 left-3 w-1.5 h-1.5 border-t border-l border-white/10 group-hover:border-white/30 transition-colors" />
      <div className="absolute bottom-3 right-3 w-1.5 h-1.5 border-b border-r border-white/10 group-hover:border-white/30 transition-colors" />
    </div>
  );
};
