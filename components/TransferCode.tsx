'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { formatTransferCode, normalizeTransferCode } from '@/lib/utils/transferCode';

interface TransferCodeProps {
  code: string;
  secondsLeft: number;
  onCopySuccess?: () => void;
}

export default function TransferCode({ code, secondsLeft, onCopySuccess }: TransferCodeProps) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrError, setQrError] = useState('');

  const formattedCode = formatTransferCode(code);
  const rawCode = normalizeTransferCode(code);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  useEffect(() => {
    let active = true;
    setQrDataUrl('');
    setQrError('');
    if (!rawCode) return;

    QRCode.toDataURL(`${window.location.origin}/receive?code=${rawCode}`, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 220
    }).then((dataUrl) => {
      if (active) setQrDataUrl(dataUrl);
    }).catch((error: unknown) => {
      console.error('[QR] Could not create the transfer QR code.', error);
      if (active) setQrError('QR code could not be created. Share the 6-digit code instead.');
    });

    return () => {
      active = false;
    };
  }, [rawCode]);

  function copyCode() {
    if (!rawCode) return;
    navigator.clipboard.writeText(rawCode).then(() => {
      setCopied(true);
      onCopySuccess?.();
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="transferCodeBox">
      <span className="codeLabel">TRANSFER CODE</span>
      <div className="codeDisplay">
        <span className="codeDigits">{formattedCode}</span>
        <button
          type="button"
          className="button buttonGhost copyButton"
          onClick={copyCode}
          aria-label="Copy transfer code"
        >
          {copied ? '✓ Copied' : '📋 Copy Code'}
        </button>
      </div>
      <div className="codeExpiry">
        <span>Expires in:</span>
        <strong className={secondsLeft < 120 ? 'expiryWarning' : ''}>{timeString}</strong>
      </div>
      {qrDataUrl && (
        <div className="transferQr">
          <img src={qrDataUrl} alt="Scan to open PeerBridge and join this transfer" width="220" height="220" />
          <span>Scan to open this transfer on another device</span>
        </div>
      )}
      {qrError && <p role="status">{qrError}</p>}
    </div>
  );
}
