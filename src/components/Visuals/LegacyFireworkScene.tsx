import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface LegacyFireworkSceneProps {
  audioData: Float32Array;
  interactionPoint: THREE.Vector3 | null;
  scratchPoint?: THREE.Vector3 | null;
  mode: 'idle' | 'interaction' | 'flow' | 'climax';
  intensity: number;
  isPaused?: boolean;
}

type ShardKind = 'block' | 'frame' | 'diagonalFrame';

function makeParticleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture(canvas);

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.32, 'rgba(255,255,255,0.7)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const squareFramePositions = new Float32Array([
  -0.5, -0.5, 0, 0.5, -0.5, 0,
  0.5, -0.5, 0, 0.5, 0.5, 0,
  0.5, 0.5, 0, -0.5, 0.5, 0,
  -0.5, 0.5, 0, -0.5, -0.5, 0,
]);

const squareFrameWithDiagonalPositions = new Float32Array([
  -0.5, -0.5, 0, 0.5, -0.5, 0,
  0.5, -0.5, 0, 0.5, 0.5, 0,
  0.5, 0.5, 0, -0.5, 0.5, 0,
  -0.5, 0.5, 0, -0.5, -0.5, 0,
  -0.5, -0.5, 0, 0.5, 0.5, 0,
]);

const FIREWORK_COLOR_STOPS = [
  '#22d3ee',
  '#38bdf8',
  '#60a5fa',
  '#4ade80',
  '#a3e635',
  '#fde047',
  '#fb923c',
  '#8b5cf6',
  '#a855f7',
  '#ec4899',
  '#f9a8d4',
  '#ffffff',
].map((color) => new THREE.Color(color));

export const LegacyFireworkScene: React.FC<LegacyFireworkSceneProps> = ({
  audioData,
  interactionPoint,
  scratchPoint,
  mode,
  intensity,
  isPaused,
}) => {
  const pointsRef = useRef<THREE.Points>(null);
  const meshRef = useRef<THREE.Group>(null);
  const count = 50000;
  const shardCount = 200;
  const opacityRef = useRef(0);
  const colorRef = useRef(new THREE.Color('#22d3ee'));
  const scratchPointRef = useRef<THREE.Vector3 | null>(null);
  const scratchStrengthRef = useRef(0);
  const particleTexture = useMemo(() => makeParticleTexture(), []);

  const getShardKind = (): ShardKind => {
    const value = Math.random();
    if (value < 0.32) return 'block';
    if (value < 0.66) return 'frame';
    return 'diagonalFrame';
  };

  const [positions, initialPositions] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const init = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const type = Math.random();
      let r;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      if (type > 0.6) {
        r = 10 + Math.random() * 5;
      } else if (type > 0.2) {
        r = Math.random() * 20;
      } else {
        r = Math.random() * 3;
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
      kind: getShardKind(),
      position: new THREE.Vector3(
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 10
      ),
      rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
      scale: 0.05 + Math.random() * 0.1,
    })).map((data) => ({
      ...data,
      currentPosition: data.position.clone(),
    }));
  }, [shardCount]);

  useFrame((state) => {
    if (isPaused) return;

    const time = state.clock.getElapsedTime();
    if (scratchPoint) {
      scratchPointRef.current = scratchPoint;
      scratchStrengthRef.current = 1;
    } else {
      scratchStrengthRef.current *= 0.88;
      if (scratchStrengthRef.current < 0.01) {
        scratchPointRef.current = null;
      }
    }

    if (pointsRef.current) {
      const mat = pointsRef.current.material as THREE.PointsMaterial;

      if (mode === 'interaction') {
        opacityRef.current = 0.8 + intensity * 0.2;
      } else if (mode === 'climax') {
        opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, 0.6 + intensity * 0.4, 0.05);
      } else if (mode === 'flow') {
        opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, 0.4 + intensity * 0.3, 0.05);
      } else {
        const targetOpacity = 0.2 + intensity * 0.46;
        opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, targetOpacity, 0.03);
      }

      mat.opacity = opacityRef.current;
      mat.visible = opacityRef.current > 0.0001;

      const scaledIntensity = THREE.MathUtils.clamp(intensity, 0, 1) * (FIREWORK_COLOR_STOPS.length - 1);
      const colorIndex = Math.min(FIREWORK_COLOR_STOPS.length - 2, Math.floor(scaledIntensity));
      colorRef.current
        .copy(FIREWORK_COLOR_STOPS[colorIndex])
        .lerp(FIREWORK_COLOR_STOPS[colorIndex + 1], scaledIntensity - colorIndex);
      mat.color.copy(colorRef.current);

      if (meshRef.current) {
        meshRef.current.visible = opacityRef.current > 0.01;
        meshRef.current.children.forEach((child) => {
          const material = (child as THREE.Mesh | THREE.LineSegments).material;
          if (material instanceof THREE.MeshStandardMaterial) {
            material.color.copy(colorRef.current);
            material.emissive.copy(colorRef.current);
            material.emissiveIntensity = 0.5 + intensity * 4;
            material.transparent = false;
            material.opacity = 1;
          } else {
            const lineMaterial = material as THREE.LineBasicMaterial;
            lineMaterial.color.copy(colorRef.current);
            lineMaterial.opacity = Math.min(1, opacityRef.current * (0.9 + intensity * 0.32));
          }
        });
      }

    }

    if (pointsRef.current) {
      const posAttr = pointsRef.current.geometry.attributes.position;
      const mat = pointsRef.current.material as THREE.PointsMaterial;
      const baseVisible = mode === 'idle' ? 9000 : 5000;
      const activeCount = Math.floor(baseVisible * intensity + (count - baseVisible) * (intensity * intensity));

      pointsRef.current.geometry.setDrawRange(0, Math.max(0, activeCount));
      mat.size = mode === 'idle'
        ? 0.018 + intensity * 0.055
        : 0.01 + intensity * 0.1;

      for (let i = 0; i < count; i++) {
        const ix = i * 3;
        const iy = i * 3 + 1;
        const iz = i * 3 + 2;
        const audioIdx = i % audioData.length;
        const audioValue = Math.abs(audioData[audioIdx]) * 3.0;

        if (interactionPoint && (mode === 'interaction' || mode === 'climax')) {
          const dx = posAttr.array[ix] - interactionPoint.x;
          const dy = posAttr.array[iy] - interactionPoint.y;
          const dz = posAttr.array[iz] - (interactionPoint.z || 0);
          const distSq = dx * dx + dy * dy + dz * dz;
          const dist = Math.sqrt(distSq);

          if (dist > 0.001 && dist < 12) {
            const force = (12 - dist) * (0.8 + intensity * 1.5);
            posAttr.array[ix] += (dx / dist) * force;
            posAttr.array[iy] += (dy / dist) * force;
            posAttr.array[iz] += (dz / dist) * force;
          }
        }

        const scratch = scratchPointRef.current;
        if (scratch) {
          const dx = posAttr.array[ix] - scratch.x;
          const dy = posAttr.array[iy] - scratch.y;
          const dz = posAttr.array[iz] - (scratch.z || 0);
          const distSq = dx * dx + dy * dy + dz * dz;
          const dist = Math.sqrt(Math.max(0.001, distSq));

          if (dist < 5.6) {
            const force = (5.6 - dist) * (0.08 + scratchStrengthRef.current * 0.18);
            posAttr.array[ix] += (dx / dist) * force;
            posAttr.array[iy] += (dy / dist) * force;
            posAttr.array[iz] += (dz / dist) * force * 0.35;
          }
        }

        const lerpFactor = mode === 'interaction' ? 0.01 / (1 + intensity) : 0.06;
        posAttr.array[ix] += (initialPositions[ix] - posAttr.array[ix]) * lerpFactor;
        posAttr.array[iy] += (initialPositions[iy] - posAttr.array[iy]) * lerpFactor;
        posAttr.array[iz] += (initialPositions[iz] - posAttr.array[iz]) * lerpFactor;

        posAttr.array[ix] += Math.sin(time * 0.2 + initialPositions[iz]) * (0.001 + audioValue * 0.0004);
        posAttr.array[iy] += Math.cos(time * 0.2 + initialPositions[ix]) * (0.001 + audioValue * 0.0004);
      }
      posAttr.needsUpdate = true;
      pointsRef.current.rotation.y += 0.0005;
    }

    if (meshRef.current) {
      meshRef.current.rotation.y = time * 0.05;
      meshRef.current.children.forEach((child, i) => {
        const data = shardData[i];
        const targetY = data.position.y + Math.sin(time + i) * 0.18;
        data.currentPosition.x += (data.position.x - data.currentPosition.x) * 0.04;
        data.currentPosition.y += (targetY - data.currentPosition.y) * 0.04;
        data.currentPosition.z += (data.position.z - data.currentPosition.z) * 0.04;

        if (interactionPoint && (mode === 'interaction' || mode === 'climax')) {
          const dx = data.currentPosition.x - interactionPoint.x;
          const dy = data.currentPosition.y - interactionPoint.y;
          const dz = data.currentPosition.z - (interactionPoint.z || 0);
          const distSq = dx * dx + dy * dy + dz * dz;
          const dist = Math.sqrt(Math.max(0.001, distSq));

          if (dist < 13) {
            const force = (13 - dist) * (0.04 + intensity * 0.12);
            data.currentPosition.x += (dx / dist) * force;
            data.currentPosition.y += (dy / dist) * force;
            data.currentPosition.z += (dz / dist) * force;
          }
        }

        const scratch = scratchPointRef.current;
        if (scratch) {
          const dx = data.currentPosition.x - scratch.x;
          const dy = data.currentPosition.y - scratch.y;
          const dz = data.currentPosition.z - (scratch.z || 0);
          const distSq = dx * dx + dy * dy + dz * dz;
          const dist = Math.sqrt(Math.max(0.001, distSq));

          if (dist < 6.2) {
            const force = (6.2 - dist) * (0.06 + scratchStrengthRef.current * 0.14);
            data.currentPosition.x += (dx / dist) * force;
            data.currentPosition.y += (dy / dist) * force;
            data.currentPosition.z += (dz / dist) * force * 0.45;
          }
        }

        child.rotation.x += 0.01 * (1 + intensity);
        child.rotation.z += 0.005 * (1 + intensity);
        child.position.copy(data.currentPosition);
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
          map={particleTexture}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>

      <group ref={meshRef}>
        {shardData.map((data, i) => (
          data.kind === 'block' ? (
            <mesh key={i} position={data.position} rotation={data.rotation} scale={data.scale}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial
                color="#22d3ee"
                emissive="#22d3ee"
                emissiveIntensity={1}
              />
            </mesh>
          ) : (
            <lineSegments key={i} position={data.position} rotation={data.rotation} scale={data.scale}>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  count={data.kind === 'diagonalFrame' ? 10 : 8}
                  array={data.kind === 'diagonalFrame' ? squareFrameWithDiagonalPositions : squareFramePositions}
                  itemSize={3}
                />
              </bufferGeometry>
              <lineBasicMaterial
                color="#22d3ee"
                transparent
                opacity={0}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </lineSegments>
          )
        ))}
      </group>
    </group>
  );
};
