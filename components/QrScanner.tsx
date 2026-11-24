'use client';

import { useEffect, useRef, useState } from 'react';

export default function QrScanner({ onScan, disabled = false }: { onScan: (value: string) => void; disabled?: boolean }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!scanning) return;
    const Detector = (window as Window & {
      BarcodeDetector?: new (options: { formats: string[] }) => {
        detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
      };
    }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot scan QR codes. Paste the code below instead.');
      setScanning(false);
      return;
    }

    let active = true;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let busy = false;
    const detector = new Detector({ formats: ['qr_code'] });
    const scan = async () => {
      const video = videoRef.current;
      if (!active) return;
      if (!busy && video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        busy = true;
        try {
          const [result] = await detector.detect(video);
          if (result?.rawValue) {
            setScanning(false);
            onScanRef.current(result.rawValue);
            return;
          }
        } catch (cause) {
          console.warn('[QR] Could not read the camera frame.', cause);
        } finally {
          busy = false;
        }
      }
      if (active) timer = setTimeout(scan, 250);
    };

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((camera) => {
        if (!active) {
          camera.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = camera;
        if (videoRef.current) {
          videoRef.current.srcObject = camera;
          void videoRef.current.play().then(scan).catch((cause) => {
            console.warn('[QR] Could not start camera preview.', cause);
            setError('Camera preview failed. Paste the code below instead.');
            setScanning(false);
          });
        }
      })
      .catch((cause: unknown) => {
        console.warn('[QR] Camera access was denied or unavailable.', cause);
        setError('Camera access is unavailable. Paste the code below instead.');
        setScanning(false);
      });

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [scanning]);

  return (
    <div className="qrScanner">
      {scanning ? (
        <>
          <video ref={videoRef} muted playsInline aria-label="Scan a PeerBridge pairing QR code" />
          <button type="button" className="button buttonGhost" onClick={() => setScanning(false)}>
            Stop camera
          </button>
        </>
      ) : (
        <button type="button" className="button buttonGhost" disabled={disabled} onClick={() => { setError(''); setScanning(true); }}>
          Scan QR code
        </button>
      )}
      {error && <p role="status">{error}</p>}
    </div>
  );
}
