import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { AlertCircle, Camera } from "lucide-react";

interface QRScannerProps {
  onScan: (data: string) => void;
}

export function QRScanner({ onScan }: QRScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startedRef = useRef(false);
  const scannedRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    const id = "qr-reader";
    const scanner = new Html5Qrcode(id);
    scannerRef.current = scanner;
    startedRef.current = false;
    scannedRef.current = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => {
          if (scannedRef.current) return;
          scannedRef.current = true;
          scanner.stop().catch(() => {});
          startedRef.current = false;
          onScanRef.current(decoded);
        },
        () => {}
      )
      .then(() => { startedRef.current = true; setScanning(true); })
      .catch((err: unknown) => {
        startedRef.current = false;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("notallowed")) {
          setError("Camera permission denied. Please enable camera access in your browser settings.");
        } else if (msg.toLowerCase().includes("notfound")) {
          setError("No camera found on your device.");
        } else {
          setError("Failed to start camera.");
        }
      });

    return () => {
      if (startedRef.current) {
        scanner.stop().catch(() => {});
        startedRef.current = false;
      }
    };
  }, []);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Camera size={20} className="text-indigo-400" />
        <h3 className="text-lg font-bold text-slate-100">Scan QR Code</h3>
      </div>

      {/* html5-qrcode renders the camera feed here */}
      <div id="qr-reader" className="w-full rounded-xl overflow-hidden mb-4" />

      {!scanning && !error && (
        <div className="flex items-center justify-center h-40 bg-slate-800 rounded-xl mb-4">
          <p className="text-slate-500 text-sm">Starting camera...</p>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl mb-4 flex items-start gap-2">
          <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <p className="text-xs font-semibold text-slate-400 mb-2">Tips for best scanning</p>
        <ul className="text-xs text-slate-500 space-y-1">
          <li>✓ Hold camera steady within the frame</li>
          <li>✓ Ensure good lighting conditions</li>
          <li>✓ Keep QR code in the center focus area</li>
          <li>✓ Avoid shadows or glare on the screen</li>
        </ul>
      </div>
    </div>
  );
}
