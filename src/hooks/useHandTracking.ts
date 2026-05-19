import { useEffect, useRef, useState } from 'react';
import { Hands, Results } from '@mediapipe/hands';

type HandLandmark = {
  x: number;
  y: number;
  z?: number;
};

const OPEN_CONFIDENCE_ON = 2;
const OPEN_CONFIDENCE_MAX = 5;

function distance2D(a: HandLandmark, b: HandLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isPalmOpen(landmarks: HandLandmark[]) {
  const palmHeight = Math.max(0.001, distance2D(landmarks[0], landmarks[9]));
  const palmWidth = Math.max(0.001, distance2D(landmarks[5], landmarks[17]));
  const fingers = [
    { tip: 8, pip: 6, mcp: 5 },
    { tip: 12, pip: 10, mcp: 9 },
    { tip: 16, pip: 14, mcp: 13 },
    { tip: 20, pip: 18, mcp: 17 },
  ];

  let openFingers = 0;
  fingers.forEach(({ tip, pip, mcp }) => {
    const liftedFromPip = landmarks[tip].y < landmarks[pip].y + palmHeight * 0.1;
    const liftedFromMcp = landmarks[tip].y < landmarks[mcp].y - palmHeight * 0.035;
    const extendedLength = distance2D(landmarks[tip], landmarks[mcp]) > palmHeight * 0.34;

    if ((liftedFromPip || liftedFromMcp) && extendedLength) {
      openFingers++;
    }
  });

  const thumbOpen =
    distance2D(landmarks[4], landmarks[9]) > palmWidth * 0.95 ||
    distance2D(landmarks[4], landmarks[5]) > palmWidth * 0.62;
  const spreadOpen =
    distance2D(landmarks[8], landmarks[20]) > palmWidth * 1.05 ||
    distance2D(landmarks[8], landmarks[16]) > palmWidth * 0.72;

  return openFingers >= 2 || (openFingers >= 1 && thumbOpen && spreadOpen);
}

export function useHandTracking() {
  const [isHandOpen, setIsHandOpen] = useState(false);
  const [openHandCount, setOpenHandCount] = useState(0);
  const [hasHandDetected, setHasHandDetected] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handsRef = useRef<Hands | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);

  const isCameraActiveRef = useRef(false);
  const presenceConfidenceRef = useRef(0);
  const openConfidenceRef = useRef(0);
  const lastOpenHandCountRef = useRef(0);

  useEffect(() => {
    // Create hidden video element
    const video = document.createElement('video');
    // Using a tiny size and opacity instead of hiding off-screen helps some browsers keep frame updates active
    video.style.position = 'fixed';
    video.style.top = '0px';
    video.style.left = '0px';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0.01';
    video.style.pointerEvents = 'none';
    video.style.zIndex = '-1';
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.muted = true;
    document.body.appendChild(video);
    videoRef.current = video;

    const hands = new Hands({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`;
      },
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.42,
      minTrackingConfidence: 0.42,
    });

    hands.onResults((results: Results) => {
      if (!handsRef.current || !isCameraActiveRef.current) return;
      
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        if (!hasHandDetected) console.log("Hand tracking active");
        presenceConfidenceRef.current = Math.min(OPEN_CONFIDENCE_MAX, presenceConfidenceRef.current + 2);
        setHasHandDetected(presenceConfidenceRef.current >= OPEN_CONFIDENCE_ON);

        const detectedOpenHands = results.multiHandLandmarks.reduce((total, landmarks) => {
          return total + (isPalmOpen(landmarks) ? 1 : 0);
        }, 0);
        lastOpenHandCountRef.current = detectedOpenHands;
        openConfidenceRef.current = detectedOpenHands > 0
          ? Math.min(OPEN_CONFIDENCE_MAX, openConfidenceRef.current + 2)
          : Math.max(0, openConfidenceRef.current - 1);

        const handOpen = openConfidenceRef.current >= OPEN_CONFIDENCE_ON;
        setOpenHandCount(handOpen ? Math.max(1, lastOpenHandCountRef.current) : 0);
        setIsHandOpen(handOpen);
      } else {
        presenceConfidenceRef.current = Math.max(0, presenceConfidenceRef.current - 1);
        openConfidenceRef.current = Math.max(0, openConfidenceRef.current - 1);
        const handOpen = openConfidenceRef.current >= OPEN_CONFIDENCE_ON;
        setHasHandDetected(presenceConfidenceRef.current >= OPEN_CONFIDENCE_ON);
        setIsHandOpen(handOpen);
        setOpenHandCount(handOpen ? Math.max(1, lastOpenHandCountRef.current) : 0);
      }
    });

    handsRef.current = hands;

    return () => {
      isCameraActiveRef.current = false;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (handsRef.current) {
        handsRef.current.close();
      }
      videoRef.current?.remove();
    };
  }, []);

  const startCamera = async () => {
    if (!videoRef.current || !handsRef.current) return;

    try {
      setCameraError(null);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      isCameraActiveRef.current = true;
      setIsCameraActive(true);

      const processFrame = async () => {
        const video = videoRef.current;
        const hands = handsRef.current;

        if (video && hands && isCameraActiveRef.current && video.readyState >= 2) {
          try {
            await hands.send({ image: video });
          } catch {
            // Ignore occasional MediaPipe frame errors.
          }
        }

        if (isCameraActiveRef.current) {
          frameRef.current = requestAnimationFrame(processFrame);
        }
      };

      frameRef.current = requestAnimationFrame(processFrame);
    } catch (err) {
      console.error("Camera start failed:", err);
      const message = err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Camera permission denied / 摄像头权限被拒绝'
        : 'Camera unavailable / 摄像头不可用';
      setCameraError(message);
      isCameraActiveRef.current = false;
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    isCameraActiveRef.current = false;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraActive(false);
    presenceConfidenceRef.current = 0;
    openConfidenceRef.current = 0;
    lastOpenHandCountRef.current = 0;
    setIsHandOpen(false);
    setHasHandDetected(false);
    setOpenHandCount(0);
  };

  return { isHandOpen, openHandCount, hasHandDetected, isCameraActive, cameraError, startCamera, stopCamera };
}
