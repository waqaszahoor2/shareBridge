'use client';

import { ChangeEvent, FormEvent, useState } from 'react';

interface ReceiverJoinProps {
  onJoin: (code: string) => Promise<void> | void;
  disabled?: boolean;
  loading?: boolean;
}

export default function ReceiverJoin({ onJoin, disabled = false, loading = false }: ReceiverJoinProps) {
  const [code, setCode] = useState('');

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.length === 6 && !disabled && !loading) {
      onJoin(code);
    }
  }

  const formattedValue = code.length > 3 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;

  return (
    <form className="joinForm" onSubmit={handleSubmit}>
      <div className="inputGroup">
        <label htmlFor="transferCodeInput" className="inputLabel">
          Enter 6-Digit Transfer Code
        </label>
        <div className="codeInputWrapper">
          <input
            id="transferCodeInput"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={7}
            placeholder="583-921"
            value={formattedValue}
            onChange={handleChange}
            disabled={disabled || loading}
            className="codeInput"
            autoComplete="off"
          />
        </div>
      </div>
      <button
        type="submit"
        className="button buttonPrimary joinButton"
        disabled={disabled || loading || code.length !== 6}
      >
        {loading ? (
          <>
            <span className="spinner" aria-hidden="true" /> Connecting...
          </>
        ) : (
          'Join Transfer →'
        )}
      </button>
    </form>
  );
}
