import { useEffect, useRef, useState } from 'react';
import { Hands, Results } from '@mediapipe/hands';

export function useHandTracking() {
  const [isHandOpen, setIsHandOpen] = useState(true);
  const [openHandCount, setOpenHandCount] = useState(0);
  const [hasHandDetected, setHasHandDetected] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handsRef = useRef<Hands | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);

  const isCameraActiveRef = useRef(false);

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
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    hands.onResults((results: Results) => {
      if (!handsRef.current || !isCameraActiveRef.current) return;
      
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        if (!hasHandDetected) console.log("Hand tracking active");
        setHasHandDetected(true);

        const fingers = [
          { tip: 8, pip: 6 },
          { tip: 12, pip: 10 },
          { tip: 16, pip: 14 },
          { tip: 20, pip: 18 }
        ];

        const detectedOpenHands = results.multiHandLandmarks.reduce((total, landmarks) => {
          let openFingers = 0;
          fingers.forEach(f => {
            if (landmarks[f.tip].y < landmarks[f.pip].y) {
              openFingers++;
            }
          });
          return total + (openFingers >= 3 ? 1 : 0);
        }, 0);

        setOpenHandCount(detectedOpenHands);
        setIsHandOpen(detectedOpenHands > 0);
      } else {
        setHasHandDetected(false);
        setIsHandOpen(true);
        setOpenHandCount(0);
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
    setIsHandOpen(true);
    setHasHandDetected(false);
    setOpenHandCount(0);
  };

  return { isHandOpen, openHandCount, hasHandDetected, isCameraActive, cameraError, startCamera, stopCamera };
}
