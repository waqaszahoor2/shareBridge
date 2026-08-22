'use client';

import { ChangeEvent, ClipboardEvent } from 'react';
import { formatTransferCodeDisplay, normalizeTransferCode } from '@/lib/codeUtils';

interface CodeInputProps {
  value: string;
  onChange: (normalizedCode: string, displayCode: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  hasError?: boolean;
}

export default function CodeInput({
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  hasError = false
}: CodeInputProps) {
  const digits = value.replace(/\D/g, '').slice(0, 6);
  const displayValue = formatTransferCodeDisplay(digits);

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const cleanDigits = raw.replace(/\D/g, '').slice(0, 6);
    const formatted = formatTransferCodeDisplay(cleanDigits);
    onChange(cleanDigits, formatted);
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const cleanDigits = pastedText.replace(/\D/g, '').slice(0, 6);
    const formatted = formatTransferCodeDisplay(cleanDigits);
    onChange(cleanDigits, formatted);
  }

  return (
    <div className="codeInputContainer">
      <div className="codeInputWrapper">
        <input
          id="transferCodeInput"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={7}
          placeholder="583-921"
          value={displayValue}
          onChange={handleInputChange}
          onPaste={handlePaste}
          disabled={disabled}
          autoFocus={autoFocus}
          className={`codeInput ${hasError ? 'inputError' : ''}`}
          autoComplete="off"
          aria-label="6-Digit Transfer Code"
        />
      </div>
      <div className="inputHelperRow">
        <span className="helperText">Format: XXX-XXX</span>
        <span className="dotSeparator">•</span>
        <span className="helperText">Numbers only</span>
      </div>
    </div>
  );
}
