'use client';

import { ChangeEvent, ClipboardEvent } from 'react';
import { formatTransferCode, normalizeTransferCode } from '@/lib/utils/transferCode';

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
  const cleanDigits = normalizeTransferCode(value);
  const displayValue = formatTransferCode(cleanDigits);

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const nextDigits = normalizeTransferCode(raw);
    const formatted = formatTransferCode(nextDigits);
    onChange(nextDigits, formatted);
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const nextDigits = normalizeTransferCode(pastedText);
    const formatted = formatTransferCode(nextDigits);
    onChange(nextDigits, formatted);
  }

  return (
    <div className="codeInputContainer">
      <div className="codeInputWrapper">
        <input
          id="transferCodeInput"
          type="text"
          inputMode="numeric"
          maxLength={7}
          placeholder="•••-•••"
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
        <span className="helperText">Only numbers are allowed</span>
      </div>
    </div>
  );
}
