'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Keyboard, ScanLine, Check, AlertTriangle } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
  title?: string;
}

interface ScannedItem {
  code: string;
  timestamp: Date;
}

export default function BarcodeScanner({ onScan, onClose, title }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastScanRef = useRef<string>('');
  const lastScanTimeRef = useRef<number>(0);

  const [cameraStatus, setCameraStatus] = useState<'initializing' | 'active' | 'error' | 'unsupported'>('initializing');
  const [errorMessage, setErrorMessage] = useState('');
  const [lastScanned, setLastScanned] = useState<string>('');
  const [scanHistory, setScanHistory] = useState<ScannedItem[]>([]);
  const [manualCode, setManualCode] = useState('');
  const [flashGreen, setFlashGreen] = useState(false);
  const [scanningLineY, setScanningLineY] = useState(0);

  const scanAreaRef = useRef<HTMLDivElement>(null);

  // Play beep sound using Web Audio API
  const playBeep = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.value = 1800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch {
      // Audio not available
    }
  }, []);

  // Handle successful scan
  const handleScanSuccess = useCallback((code: string) => {
    const now = Date.now();
    // Debounce: ignore same code within 3 seconds
    if (code === lastScanRef.current && now - lastScanTimeRef.current < 3000) return;

    lastScanRef.current = code;
    lastScanTimeRef.current = now;

    // Vibrate
    if (navigator.vibrate) {
      navigator.vibrate(200);
    }

    // Play beep
    playBeep();

    // Flash green
    setFlashGreen(true);
    setTimeout(() => setFlashGreen(false), 500);

    // Update UI
    setLastScanned(code);
    setScanHistory(prev => [{ code, timestamp: new Date() }, ...prev].slice(0, 20));

    // Call parent callback
    onScan(code);
  }, [onScan, playBeep]);

  // Initialize camera and barcode detection
  const startCamera = useCallback(async () => {
    try {
      // Check BarcodeDetector support
      if (!('BarcodeDetector' in window)) {
        setCameraStatus('unsupported');
        setErrorMessage('Tu navegador no soporta detección de códigos. Por favor usa Google Chrome o Microsoft Edge.');
        return;
      }

      // Create detector
      const barcodeDetector = new (window as any).BarcodeDetector({
        formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'data_matrix', 'itf']
      });
      detectorRef.current = barcodeDetector;

      // Request camera - prefer rear-facing
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
      } catch {
        // Fallback to any camera
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } }
        });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraStatus('active');
      }

      // Start scanning loop
      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || !canvasRef.current || !detectorRef.current) return;
        if (videoRef.current.readyState < 2) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        try {
          const barcodes = await detectorRef.current.detect(canvas);
          if (barcodes && barcodes.length > 0) {
            const detectedCode = barcodes[0].rawValue || barcodes[0].value;
            if (detectedCode) {
              handleScanSuccess(detectedCode);
            }
          }
        } catch {
          // Detection error - continue scanning
        }
      }, 500);

    } catch (error: any) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setCameraStatus('error');
        setErrorMessage('Permiso de cámara denegado. Por favor permite el acceso a la cámara en la configuración de tu navegador.');
      } else if (error.name === 'NotFoundError') {
        setCameraStatus('error');
        setErrorMessage('No se encontró ninguna cámara en este dispositivo.');
      } else {
        setCameraStatus('error');
        setErrorMessage(`Error al acceder a la cámara: ${error.message || 'Error desconocido'}`);
      }
    }
  }, [handleScanSuccess]);

  // Cleanup
  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Start camera on mount
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // Scanning line animation
  useEffect(() => {
    if (cameraStatus !== 'active') return;
    let animationId: number;
    const animate = () => {
      setScanningLineY(prev => (prev >= 100 ? 0 : prev + 0.8));
      animationId = requestAnimationFrame(animate);
    };
    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [cameraStatus]);

  // Handle manual submit
  const handleManualSubmit = () => {
    const code = manualCode.trim();
    if (!code) return;
    handleScanSuccess(code);
    setManualCode('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleManualSubmit();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Hidden canvas for detection */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black border-b border-neutral-800 shrink-0">
        <div className="flex items-center gap-3">
          <ScanLine className="w-5 h-5 text-green-400" />
          <h2 className="text-sm font-mono uppercase tracking-widest text-white">
            {title || 'Escanear Código'}
          </h2>
        </div>
        <button
          onClick={() => { stopCamera(); onClose(); }}
          className="p-2 text-neutral-400 hover:text-white transition-colors"
          aria-label="Cerrar escáner"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Video / Camera Area */}
      <div className="relative flex-1 bg-black overflow-hidden">
        {cameraStatus === 'initializing' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-2 border-neutral-600 border-t-green-400 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-xs font-mono uppercase tracking-widest text-neutral-400">
                Iniciando cámara...
              </p>
            </div>
          </div>
        )}

        {cameraStatus === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-full bg-red-500/20">
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
              <p className="text-sm font-mono uppercase tracking-widest text-red-400 mb-2">
                Error de Cámara
              </p>
              <p className="text-xs font-mono text-neutral-400 leading-relaxed">
                {errorMessage}
              </p>
            </div>
          </div>
        )}

        {cameraStatus === 'unsupported' && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-full bg-amber-500/20">
                <AlertTriangle className="w-8 h-8 text-amber-400" />
              </div>
              <p className="text-sm font-mono uppercase tracking-widest text-amber-400 mb-2">
                Navegador No Compatible
              </p>
              <p className="text-xs font-mono text-neutral-400 leading-relaxed">
                {errorMessage}
              </p>
              <div className="mt-4 px-3 py-2 bg-neutral-900 rounded text-[10px] font-mono text-neutral-500">
                Chrome &bull; Edge &bull; Opera
              </div>
            </div>
          </div>
        )}

        {/* Video element */}
        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${cameraStatus !== 'active' ? 'hidden' : ''}`}
          playsInline
          muted
          autoPlay
        />

        {/* Scan overlay - only when active */}
        {cameraStatus === 'active' && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Dark overlay with center cutout */}
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.6) 30%, transparent 30%, transparent 70%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.6) 100%)',
            }} />
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.6) 15%, transparent 15%, transparent 85%, rgba(0,0,0,0.6) 85%, rgba(0,0,0,0.6) 100%)',
            }} />

            {/* Corner brackets */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-64 h-64 sm:w-72 sm:h-72 relative">
                {/* Top-left corner */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-green-400" />
                {/* Top-right corner */}
                <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-green-400" />
                {/* Bottom-left corner */}
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-green-400" />
                {/* Bottom-right corner */}
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-green-400" />

                {/* Animated scanning line */}
                <div
                  className="absolute left-2 right-2 h-0.5 bg-green-400/80 shadow-lg shadow-green-400/50"
                  style={{
                    top: `${scanningLineY}%`,
                    transition: 'none',
                  }}
                />
              </div>
            </div>

            {/* Green flash on successful scan */}
            {flashGreen && (
              <div className="absolute inset-0 bg-green-500/20 animate-pulse" />
            )}

            {/* Status text */}
            <div className="absolute bottom-4 left-0 right-0 text-center">
              <p className="text-xs font-mono uppercase tracking-widest text-white/80 bg-black/50 inline-block px-4 py-2 rounded">
                Apuntar la cámara al código...
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div className="bg-neutral-950 border-t border-neutral-800 shrink-0">
        {/* Last scanned code */}
        {lastScanned && (
          <div className={`px-4 py-3 border-b border-neutral-800 transition-colors duration-300 ${flashGreen ? 'bg-green-500/10' : ''}`}>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-mono uppercase tracking-widest text-neutral-500">Último código detectado</p>
                <p className="text-sm font-mono text-green-400 truncate">{lastScanned}</p>
              </div>
            </div>
          </div>
        )}

        {/* Manual input */}
        <div className="px-4 py-3 border-b border-neutral-800">
          <div className="flex items-center gap-2 mb-2">
            <Keyboard className="w-3 h-3 text-neutral-500" />
            <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Ingresar código manualmente</p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="ESCANEAR CÓDIGO..."
              className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-700 text-sm font-mono text-white placeholder:text-neutral-600 focus:border-green-400 focus:outline-none transition-colors uppercase"
              autoComplete="off"
            />
            <button
              onClick={handleManualSubmit}
              disabled={!manualCode.trim()}
              className="px-4 py-2 bg-green-600 text-white text-xs font-mono uppercase tracking-widest hover:bg-green-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              OK
            </button>
          </div>
        </div>

        {/* Scan history */}
        {scanHistory.length > 0 && (
          <div className="px-4 py-3 max-h-40 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-600 mb-2">
              Historial de esta sesión ({scanHistory.length})
            </p>
            <div className="space-y-1">
              {scanHistory.map((item, idx) => (
                <button
                  key={`${item.code}-${idx}`}
                  onClick={() => handleScanSuccess(item.code)}
                  className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-900 rounded transition-colors group"
                >
                  <span className="text-xs font-mono text-neutral-300 truncate mr-2">{item.code}</span>
                  <span className="text-[9px] font-mono text-neutral-600 shrink-0">
                    {item.timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
