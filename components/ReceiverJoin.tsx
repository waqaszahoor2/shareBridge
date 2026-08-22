'use client';

import { FormEvent, useState } from 'react';
import { normalizeTransferCode } from '@/lib/codeUtils';
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

    if (!codeDigits) {
      setValidationError('Please enter the transfer code.');
      return;
    }

    const normalized = normalizeTransferCode(codeDigits);
    if (!normalized) {
      setValidationError('Invalid format. Enter a 6-digit code. Example: 583-921');
      return;
    }

    if (!disabled && !loading) {
      onJoin(normalized);
    }
  }

  return (
    <form className="joinForm" onSubmit={handleSubmit}>
      <div className="joinHeader">
        <h3>Enter Transfer Code</h3>
        <p className="joinSubtext">Enter the 6-digit code shared by the sender.</p>
        <span className="joinExample">Example: <strong>583-921</strong></span>
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
