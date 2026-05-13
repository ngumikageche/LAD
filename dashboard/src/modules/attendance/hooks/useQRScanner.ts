// useQRScanner Hook
import { useState, useEffect, useRef, useCallback } from "react";

export function useQRScanner(onScan: (result: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraSupported, setCameraSupported] = useState(true);
  const scannerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startScanning = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access not supported in this browser");
      setCameraSupported(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsScanning(true);
        setError(null);

        // Start QR scanning loop
        scannerIntervalRef.current = setInterval(() => {
          decodeQRCode();
        }, 500);
      }
    } catch (err) {
      let message = "Failed to access camera";
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        message = "Camera permission denied. Please check your browser settings.";
      }
      setError(message);
      setCameraSupported(false);
    }
  }, []);

  const stopScanning = useCallback(() => {
    setIsScanning(false);

    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
    }

    if (scannerIntervalRef.current) {
      clearInterval(scannerIntervalRef.current);
      scannerIntervalRef.current = null;
    }
  }, []);

  const decodeQRCode = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      // Simple QR code detection - look for dark spots pattern
      // This is a basic implementation; production should use a proper QR library
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Count dark pixels (potential QR pattern)
      let darkPixels = 0;
      for (let i = 0; i < data.length; i += 4) {
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (brightness < 128) {
          darkPixels++;
        }
      }

      // If significant dark pattern detected, attempt decode
      const darkRatio = darkPixels / (canvas.width * canvas.height);
      if (darkRatio > 0.15 && darkRatio < 0.5) {
        // Pattern found - in production, use jsQR or similar library
        // For now, we'll rely on html5-qrcode or similar
        console.log("QR pattern detected");
      }
    } catch (err) {
      console.error("QR decode error:", err);
    }
  };

  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, [stopScanning]);

  return {
    videoRef,
    canvasRef,
    isScanning,
    error,
    cameraSupported,
    startScanning,
    stopScanning,
  };
}
