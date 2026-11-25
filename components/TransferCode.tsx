'use client';

import { useState } from 'react';
import { formatTransferCode, normalizeTransferCode } from '@/lib/utils/transferCode';

interface TransferCodeProps {
  code: string;
  secondsLeft: number;
  onCopySuccess?: () => void;
}

export default function TransferCode({ code, secondsLeft, onCopySuccess }: TransferCodeProps) {
  const [copied, setCopied] = useState(false);

  const formattedCode = formatTransferCode(code);
  const rawCode = normalizeTransferCode(code);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

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
    </div>
  );
}
