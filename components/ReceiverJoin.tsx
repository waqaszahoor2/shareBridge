'use client';

import { FormEvent, useState } from 'react';
import { normalizeTransferCode } from '@/lib/utils/transferCode';
import CodeInput from './CodeInput';

interface ReceiverJoinProps {
  onJoin: (normalizedCode: string) => Promise<void> | void;
  disabled?: boolean;
  loading?: boolean;
}

export default function ReceiverJoin({ onJoin, disabled = false, loading = false }: ReceiverJoinProps) {
  const [codeDigits, setCodeDigits] = useState('');
  const [validationError, setValidationError] = useState('');

  function handleCodeChange(normalizedDigits: string) {
    setCodeDigits(normalizedDigits);
    if (validationError) setValidationError('');
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setValidationError('');

    if (!codeDigits.trim()) {
      setValidationError('Please enter transfer code.');
      return;
    }

    const normalized = normalizeTransferCode(codeDigits);
    if (normalized.length !== 6) {
      setValidationError('Enter a valid 6-digit code. Format: XXX-XXX');
      return;
    }

    if (!disabled && !loading) {
      onJoin(normalized);
    }
  }

  return (
    <form className="joinForm" onSubmit={handleSubmit} noValidate>
      <div className="joinHeader">
        <h3>Enter 6-Digit Transfer Code</h3>
        <p className="joinSubtext">Enter the code shared by the sender to join the transfer.</p>
      </div>

      <CodeInput
        value={codeDigits}
        onChange={handleCodeChange}
        disabled={disabled || loading}
        autoFocus
        hasError={Boolean(validationError)}
      />

      {validationError && (
        <div className="inputValidationAlert" role="alert">
          ⚠️ {validationError}
        </div>
      )}

      <button
        type="submit"
        className="button buttonPrimary joinButton"
        disabled={disabled || loading || codeDigits.length !== 6}
      >
        {loading ? (
          <>
            <span className="spinner" aria-hidden="true" /> Connecting to Sender...
          </>
        ) : (
          'Join Transfer →'
        )}
      </button>
    </form>
  );
}
