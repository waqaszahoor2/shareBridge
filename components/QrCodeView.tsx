'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function QrCodeView({ value, label }: { value: string; label: string }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setImage('');
    setError('');
    if (!value) return;
    QRCode.toDataURL(value, { errorCorrectionLevel: 'M', margin: 2, width: 280 })
      .then((dataUrl) => {
        if (active) setImage(dataUrl);
      })
      .catch((cause: unknown) => {
        console.error('[QR] Could not create pairing QR code.', cause);
        if (active) setError('QR creation failed. Copy the code below instead.');
      });
    return () => {
      active = false;
    };
  }, [value]);

  return (
    <div className="transferQr">
      {image ? <img src={image} alt={label} width="280" height="280" /> : <p>{error}</p>}
      <span>{label}</span>
    </div>
  );
}
