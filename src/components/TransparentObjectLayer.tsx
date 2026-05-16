import React from 'react';
import { motion } from 'motion/react';
import * as THREE from 'three';

const SOURCE_CANVAS_SIZE = 240;
const MAX_SOURCE_POINTS = 1800;
const DEFAULT_FILTER_INTENSITY = 0.89;
const DEFAULT_DROP_SHADOW = 'drop-shadow(0 0 12px rgba(56, 189, 248, 0.14))';
const MIN_FRAGMENT_COLUMNS = 6;
const MAX_FRAGMENT_COLUMNS = 12;
const MIN_FRAGMENT_ROWS = 4;
const MAX_FRAGMENT_ROWS = 8;

export type TransparentImageConfig = {
  opacity?: number;
  scale?: number;
  filterIntensity?: number;
  mixBlendMode?: string;
  dropShadow?: string;
  glow?: string;
};

export type TransparentObjectLayerProps = {
  imageSrc: string;
  imageConfig?: TransparentImageConfig;
  isFadedOut?: boolean;
  fadeDurationMs?: number;
  fragmentDurationMs?: number;
  onSourceReady?: (points: THREE.Vector3[]) => void;
  style?: React.CSSProperties;
};

type FragmentPiece = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  backgroundPositionX: number;
  backgroundPositionY: number;
  exitX: number;
  exitY: number;
  exitRotate: number;
  delay: number;
  duration: number;
  opacity: number;
  scale: number;
  blur: number;
};

type ImageBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const buildFragments = (bounds: ImageBounds): FragmentPiece[] => {
  const columns = clamp(Math.round(bounds.width / 96), MIN_FRAGMENT_COLUMNS, MAX_FRAGMENT_COLUMNS);
  const rows = clamp(Math.round(bounds.height / 112), MIN_FRAGMENT_ROWS, MAX_FRAGMENT_ROWS);
  const cellWidth = bounds.width / columns;
  const cellHeight = bounds.height / rows;
  const diagonal = Math.max(1, Math.hypot(bounds.width, bounds.height));
  const scatterBase = Math.max(bounds.width, bounds.height) * 0.18;
  const pieces: FragmentPiece[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const left = col * cellWidth;
      const top = row * cellHeight;
      const width = col === columns - 1 ? bounds.width - left : cellWidth;
      const height = row === rows - 1 ? bounds.height - top : cellHeight;
      const centerX = left + width / 2;
      const centerY = top + height / 2;
      const offsetX = centerX - bounds.width / 2;
      const offsetY = centerY - bounds.height / 2;
      const distance = Math.max(1, Math.hypot(offsetX, offsetY));
      const directionX = offsetX / distance;
      const directionY = offsetY / distance;
      const energy = 0.75 + (distance / diagonal) * 1.1;
      const turbulence = 0.45 + Math.random() * 0.9;

      pieces.push({
        id: `${row}-${col}`,
        left,
        top,
        width,
        height,
        backgroundPositionX: -left,
        backgroundPositionY: -top,
        exitX: directionX * (scatterBase * energy) + (Math.random() - 0.5) * 56,
        exitY: directionY * (scatterBase * energy) + (Math.random() - 0.5) * 56 - bounds.height * 0.08,
        exitRotate: (Math.random() - 0.5) * 54 + directionX * 18,
        delay: (distance / diagonal) * 0.14 + turbulence * 0.035 + row * 0.006 + col * 0.004,
        duration: 0.72 + Math.random() * 0.26,
        opacity: 0.9 + Math.random() * 0.1,
        scale: 0.85 + Math.random() * 0.18,
        blur: 0.6 + Math.random() * 1.2,
      });
    }
  }

  return pieces;
};

export function TransparentObjectLayer({
  imageSrc,
  imageConfig,
  isFadedOut = false,
  fadeDurationMs = 1200,
  fragmentDurationMs,
  onSourceReady,
  style,
}: TransparentObjectLayerProps) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const imageRef = React.useRef<HTMLImageElement>(null);
  const fadeStateRef = React.useRef(isFadedOut);
  const pulseTimeoutRef = React.useRef<number | null>(null);
  const clearTimeoutRef = React.useRef<number | null>(null);
  const [imageBounds, setImageBounds] = React.useState<ImageBounds | null>(null);
  const [shatteredSource, setShatteredSource] = React.useState<string | null>(null);
  const [fragments, setFragments] = React.useState<FragmentPiece[]>([]);

  React.useEffect(() => {
    const measure = () => {
      const wrapper = wrapperRef.current;
      const image = imageRef.current;

      if (!wrapper || !image) return;

      const wrapperRect = wrapper.getBoundingClientRect();
      const imageRect = image.getBoundingClientRect();

      if (imageRect.width <= 0 || imageRect.height <= 0) return;

      setImageBounds({
        left: imageRect.left - wrapperRect.left,
        top: imageRect.top - wrapperRect.top,
        width: imageRect.width,
        height: imageRect.height,
      });
    };

    measure();

    const wrapper = wrapperRef.current;
    const image = imageRef.current;
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;

    if (wrapper && resizeObserver) resizeObserver.observe(wrapper);
    if (image && resizeObserver) resizeObserver.observe(image);

    window.addEventListener('resize', measure);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [imageSrc]);

  React.useEffect(() => {
    if (isFadedOut && !fadeStateRef.current) {
      if (clearTimeoutRef.current) window.clearTimeout(clearTimeoutRef.current);

      const bounds = imageBounds;
      if (bounds) {
        setShatteredSource(imageSrc);
        setFragments(buildFragments(bounds));
      }

      if (pulseTimeoutRef.current) window.clearTimeout(pulseTimeoutRef.current);
      pulseTimeoutRef.current = window.setTimeout(() => {
        pulseTimeoutRef.current = null;
      }, Math.max(480, fadeDurationMs * 0.72));

      if (clearTimeoutRef.current) window.clearTimeout(clearTimeoutRef.current);
      const fragmentLifetime = fragmentDurationMs ?? fadeDurationMs;
      clearTimeoutRef.current = window.setTimeout(() => {
        setFragments([]);
      }, Math.max(680, fragmentLifetime + 120));
    }

    if (!isFadedOut && fadeStateRef.current) {
      if (clearTimeoutRef.current) window.clearTimeout(clearTimeoutRef.current);
      clearTimeoutRef.current = window.setTimeout(() => {
        setFragments([]);
        setShatteredSource(null);
      }, 120);
    }

    fadeStateRef.current = isFadedOut;

    return () => {
      if (pulseTimeoutRef.current) {
        window.clearTimeout(pulseTimeoutRef.current);
        pulseTimeoutRef.current = null;
      }
      if (clearTimeoutRef.current) {
        window.clearTimeout(clearTimeoutRef.current);
        clearTimeoutRef.current = null;
      }
    };
  }, [fadeDurationMs, fragmentDurationMs, imageBounds, imageSrc, isFadedOut]);

  React.useEffect(() => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = imageSrc;

    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = SOURCE_CANVAS_SIZE;
      canvas.height = SOURCE_CANVAS_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx || !onSourceReady) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      try {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const points: THREE.Vector3[] = [];

        const getLuminance = (px: number, py: number) => {
          if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return 0;
          const index = (py * canvas.width + px) * 4;
          const r2 = data[index];
          const g2 = data[index + 1];
          const b2 = data[index + 2];
          return (0.299 * r2 + 0.587 * g2 + 0.114 * b2) / 255;
        };

        for (let y = 0; y < canvas.height; y += 2) {
          for (let x = 0; x < canvas.width; x += 2) {
            const idx = (y * canvas.width + x) * 4;
            const alpha = data[idx + 3];
            if (alpha < 50) continue;

            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            if (lum < 0.14 && alpha < 110) continue;

            const gradient = (
              Math.abs(lum - getLuminance(x - 2, y)) +
              Math.abs(lum - getLuminance(x + 2, y)) +
              Math.abs(lum - getLuminance(x, y - 2)) +
              Math.abs(lum - getLuminance(x, y + 2))
            ) / 4;
            const edgeBoost = Math.min(1, gradient * 3.2);
            const weight = Math.min(1, (alpha / 255) * (0.2 + lum * 0.8) + edgeBoost * 0.65);
            if (Math.random() > weight) continue;

            const nx = (x / canvas.width - 0.5) * 18;
            const ny = -(y / canvas.height - 0.5) * 18;
            const nz = (Math.random() - 0.5) * 2.5;
            points.push(new THREE.Vector3(nx, ny, nz));
          }
        }

        if (points.length > MAX_SOURCE_POINTS) {
          const reduced: THREE.Vector3[] = [];
          const step = points.length / MAX_SOURCE_POINTS;
          for (let i = 0; i < MAX_SOURCE_POINTS; i += 1) {
            reduced.push(points[Math.floor(i * step)]);
          }
          onSourceReady(reduced);
        } else if (points.length > 0) {
          onSourceReady(points);
        }
      } catch (error) {
        console.warn('TransparentObjectLayer image sampling failed', error);
      }
    };

    return () => {
      image.onload = null;
    };
  }, [imageSrc, onSourceReady]);

  const filterIntensity = imageConfig?.filterIntensity ?? DEFAULT_FILTER_INTENSITY;
  const filterString = `invert(${filterIntensity}) grayscale(${filterIntensity * 100}%) contrast(${1 + filterIntensity}) brightness(${1 + filterIntensity * 0.5})`;
  const additionalFilter = [imageConfig?.dropShadow ?? DEFAULT_DROP_SHADOW, imageConfig?.glow].filter(Boolean).join(' ');
  const combinedFilter = `${filterString}${additionalFilter ? ` ${additionalFilter}` : ''}`;
  const blendMode = (imageConfig?.mixBlendMode ?? 'screen') as React.CSSProperties['mixBlendMode'];
  const scale = imageConfig?.scale ?? 1;
  const baseOpacity = isFadedOut ? 0 : (imageConfig?.opacity ?? 1);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 12,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      <div
        ref={wrapperRef}
        style={{
          width: '100%',
          maxWidth: '72rem',
          maxHeight: '82vh',
          padding: '2rem',
          boxSizing: 'border-box',
          position: 'relative',
          overflow: 'visible',
          transform: `translateZ(0) scale(${scale})`,
        }}
      >
        <motion.img
          ref={imageRef}
          src={imageSrc}
          alt="Transparent object"
          animate={{
            opacity: baseOpacity,
            filter: isFadedOut
              ? 'blur(12px) brightness(1.18) saturate(1.08)'
              : combinedFilter,
          }}
          transition={{
            duration: Math.max(0.28, fadeDurationMs / 1000),
            ease: [0.16, 1, 0.3, 1],
          }}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            mixBlendMode: blendMode,
            display: 'block',
            willChange: 'opacity, filter',
          }}
        />

        {imageBounds && shatteredSource && fragments.length > 0 && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              overflow: 'visible',
            }}
          >
            {fragments.map((piece) => (
              <motion.div
                key={piece.id}
                initial={
                  isFadedOut
                    ? {
                        x: 0,
                        y: 0,
                        rotate: 0,
                        opacity: piece.opacity,
                        scale: 1,
                        filter: 'blur(0px)',
                      }
                    : false
                }
                animate={isFadedOut ? {
                  x: piece.exitX,
                  y: piece.exitY,
                  rotate: piece.exitRotate,
                  opacity: 0,
                  scale: piece.scale,
                  filter: `blur(${piece.blur}px)`,
                } : {
                  x: 0,
                  y: 0,
                  rotate: 0,
                  opacity: 0,
                  scale: 1,
                  filter: 'blur(0px)',
                }}
                transition={{
                  duration: piece.duration,
                  delay: piece.delay,
                  ease: [0.16, 1, 0.3, 1],
                }}
                style={{
                  position: 'absolute',
                  left: imageBounds.left + piece.left,
                  top: imageBounds.top + piece.top,
                  width: piece.width,
                  height: piece.height,
                  backgroundImage: `url(${shatteredSource})`,
                  backgroundSize: `${imageBounds.width}px ${imageBounds.height}px`,
                  backgroundPosition: `${piece.backgroundPositionX}px ${piece.backgroundPositionY}px`,
                  backgroundRepeat: 'no-repeat',
                  transformOrigin: 'center center',
                  mixBlendMode: blendMode,
                  willChange: 'transform, opacity, filter',
                  boxShadow: '0 0 18px rgba(56, 189, 248, 0.16)',
                }}
              />
            ))}
          </div>
        )}

        <motion.div
          aria-hidden
          animate={{
            opacity: isFadedOut ? 0.82 : 0,
            scale: isFadedOut ? 1.02 : 0.96,
          }}
          transition={{
            duration: Math.max(0.36, fadeDurationMs / 1000 * 0.72),
            ease: [0.16, 1, 0.3, 1],
          }}
          style={{
            position: 'absolute',
            inset: '1.25rem',
            borderRadius: '999px',
            background:
              'radial-gradient(circle at center, rgba(255,255,255,0.22) 0%, rgba(34,211,238,0.18) 22%, rgba(139,92,246,0.14) 42%, rgba(2,6,23,0) 72%)',
            mixBlendMode: 'screen',
            pointerEvents: 'none',
            filter: 'blur(18px)',
          }}
        />
      </div>
    </div>
  );
}
