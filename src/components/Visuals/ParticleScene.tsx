import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface ParticleSceneProps {
  audioData: Float32Array;
  interactionPoint: THREE.Vector3 | null;
  mode: 'idle' | 'interaction' | 'flow' | 'climax';
  intensity: number;
  isStarted?: boolean;
  isPaused?: boolean;
  sourcePositions?: THREE.Vector3[];
  isExploding?: boolean;
}

export const ParticleScene: React.FC<ParticleSceneProps> = ({ audioData, interactionPoint, mode, intensity, isStarted, isPaused }) => {
  const pointsRef = useRef<THREE.Points>(null);
  const meshRef = useRef<THREE.Group>(null);
  const count = 50000;
  const shardCount = 200;
  const { size } = useThree();
  const opacityRef = useRef(0);
  const colorRef = useRef(new THREE.Color("#22d3ee"));

  const [positions, initialPositions] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const init = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Distribution: Mixture of global shell and dense core
      const type = Math.random();
      let r, theta, phi;

      if (type > 0.6) {
        // Enclosing Shell (Irregular)
        r = 10 + Math.random() * 5;
        theta = Math.random() * Math.PI * 2;
        phi = Math.acos(2 * Math.random() - 1);
      } else if (type > 0.2) {
        // Wide Field
        r = Math.random() * 20;
        theta = Math.random() * Math.PI * 2;
        phi = Math.acos(2 * Math.random() - 1);
      } else {
        // Dense Core
        r = Math.random() * 3;
        theta = Math.random() * Math.PI * 2;
        phi = Math.acos(2 * Math.random() - 1);
      }
      
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      
      pos[i * 3] = init[i * 3] = x;
      pos[i * 3 + 1] = init[i * 3 + 1] = y;
      pos[i * 3 + 2] = init[i * 3 + 2] = z;
    }
    return [pos, init];
  }, [count]);

  const shardData = useMemo(() => {
    return Array.from({ length: shardCount }).map(() => ({
      position: new THREE.Vector3(
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 10
      ),
      rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
      scale: 0.05 + Math.random() * 0.1,
      speed: 0.1 + Math.random() * 0.5
    }));
  }, [shardCount]);

  useFrame((state) => {
    if (isPaused) return;
    
    const time = state.clock.getElapsedTime();
    
    // Update appearance stats
    if (pointsRef.current) {
      const mat = pointsRef.current.material as THREE.PointsMaterial;

      // Opacity logic: home screen is dark unless interaction
      if (mode === 'interaction') {
        opacityRef.current = 0.8 + (intensity * 0.2);
      } else if (mode === 'climax') {
        opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, 0.6 + (intensity * 0.4), 0.05);
      } else if (mode === 'flow') {
        opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, 0.4 + (intensity * 0.3), 0.05);
      } else {
        // More aggressive fade to zero. If intensity is negligible, target zero exactly.
        const targetOpacity = intensity > 0.005 ? (0.01 + intensity * 0.4) : 0;
        opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, targetOpacity, 0.03);
      }

      mat.opacity = opacityRef.current;
      // Completely hide if opacity is virtually zero to save draw calls
      mat.visible = opacityRef.current > 0.0001;

      // Color Spectrum Shift 
      const c1 = new THREE.Color("#22d3ee");
      const c2 = new THREE.Color("#8b5cf6");
      const c3 = new THREE.Color("#ec4899");
      const c4 = new THREE.Color("#ffffff");
      
      if (intensity < 0.4) {
        colorRef.current.copy(c1).lerp(c2, intensity / 0.4);
      } else if (intensity < 0.8) {
        colorRef.current.copy(c2).lerp(c3, (intensity - 0.4) / 0.4);
      } else {
        colorRef.current.copy(c3).lerp(c4, (intensity - 0.8) / 0.2);
      }
      mat.color.copy(colorRef.current);
      
      // Sync shard appearance with stronger emissive sync
      if (meshRef.current) {
        meshRef.current.visible = opacityRef.current > 0.01;
        meshRef.current.children.forEach((child) => {
          const m = child as THREE.Mesh;
          const mMat = m.material as THREE.MeshStandardMaterial;
          mMat.color.copy(colorRef.current);
          mMat.emissive.copy(colorRef.current);
          mMat.emissiveIntensity = 0.5 + intensity * 4;
          mMat.opacity = opacityRef.current * 0.25;
        });
      }
    }
    
    if (pointsRef.current) {
      const posAttr = pointsRef.current.geometry.attributes.position;
      const mat = pointsRef.current.material as THREE.PointsMaterial;

      // Particle quantity responds directly to intensity and mode
      const baseVisible = (mode === 'idle') ? 0 : 5000;
      const activeCount = Math.floor(baseVisible * intensity + (count - baseVisible) * (intensity * intensity)); 
      pointsRef.current.geometry.setDrawRange(0, Math.max(0, activeCount));

      // Dynamic size 
      mat.size = (0.01 + (intensity * 0.1)) * (mode === 'idle' ? intensity : 1);

      for (let i = 0; i < count; i++) {
        const ix = i * 3;
        const iy = i * 3 + 1;
        const iz = i * 3 + 2;

        const audioIdx = i % audioData.length;
        const audioValue = Math.abs(audioData[audioIdx]) * 3.0;
        
        // Repulsion/Ripple towards Interaction
        if (interactionPoint && (mode === 'interaction' || mode === 'climax')) {
          const dx = posAttr.array[ix] - interactionPoint.x;
          const dy = posAttr.array[iy] - interactionPoint.y;
          const dz = posAttr.array[iz] - (interactionPoint.z || 0);
          const distSq = dx * dx + dy * dy + dz * dz;
          const dist = Math.sqrt(distSq);
          
          if (dist < 12) {
            // Highly aggressive repulsion for "scatter" effect, amplified by intensity
            const force = (12 - dist) * (0.8 + intensity * 1.5);
            posAttr.array[ix] += (dx / dist) * force;
            posAttr.array[iy] += (dy / dist) * force;
            posAttr.array[iz] += (dz / dist) * force;
          }
        }

        // Return to initial positions faster for snappier response
        const lerpFactor = mode === 'interaction' ? (0.01 / (1 + intensity)) : 0.06;
        posAttr.array[ix] += (initialPositions[ix] - posAttr.array[ix]) * lerpFactor;
        posAttr.array[iy] += (initialPositions[iy] - posAttr.array[iy]) * lerpFactor;
        posAttr.array[iz] += (initialPositions[iz] - posAttr.array[iz]) * lerpFactor;

        // Subtle noise
        posAttr.array[ix] += Math.sin(time * 0.2 + initialPositions[iz]) * 0.001;
        posAttr.array[iy] += Math.cos(time * 0.2 + initialPositions[ix]) * 0.001;
      }
      posAttr.needsUpdate = true;
      pointsRef.current.rotation.y += 0.0005;
    }

    if (meshRef.current) {
      meshRef.current.rotation.y = time * 0.05;
      meshRef.current.children.forEach((child, i) => {
        const mesh = child as THREE.Mesh;
        mesh.rotation.x += 0.01 * (1 + intensity);
        mesh.rotation.z += 0.005 * (1 + intensity);
        mesh.position.y += Math.sin(time + i) * 0.002;
      });
    }
  });

  return (
    <group>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={count}
            array={positions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.03}
          color="#22d3ee"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation={true}
        />
      </points>

      <group ref={meshRef}>
        {shardData.map((data, i) => (
          <mesh key={i} position={data.position} rotation={data.rotation} scale={data.scale}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial 
              color="#22d3ee" 
              emissive="#22d3ee" 
              emissiveIntensity={1} 
              transparent 
              opacity={0} 
            />
          </mesh>
        ))}
      </group>
    </group>
  );
};
