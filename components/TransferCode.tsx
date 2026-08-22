'use client';

import { useState } from 'react';

interface TransferCodeProps {
  code: string;
  secondsLeft: number;
  onCopySuccess?: () => void;
}

export default function TransferCode({ code, secondsLeft, onCopySuccess }: TransferCodeProps) {
  const [copied, setCopied] = useState(false);

  const formattedCode = code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  function copyCode() {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
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
