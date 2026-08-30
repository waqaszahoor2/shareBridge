'use client';

import type { TransferState } from '@/lib/types';

interface ConnectionStatusProps {
  state: TransferState;
  peerStatus: string;
  sendMode?: 'files' | 'text';
}

const stateLabels: Record<TransferState, { label: string; tone: string }> = {
  idle: { label: 'Ready', tone: 'neutral' },
  selecting: { label: 'Selecting Files', tone: 'neutral' },
  'creating-session': { label: 'Creating Session', tone: 'info' },
  'waiting-for-receiver': { label: 'Waiting for Receiver', tone: 'warning' },
  joining: { label: 'Joining Room', tone: 'info' },
  connecting: { label: 'Connecting WebRTC', tone: 'info' },
  'waiting-for-sender-approval': { label: 'Waiting for Approval', tone: 'warning' },
  'preparing-storage': { label: 'Preparing Stream', tone: 'info' },
  transferring: { label: 'Transferring', tone: 'active' },
  completed: { label: 'Completed', tone: 'success' },
  declined: { label: 'Declined', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  expired: { label: 'Code Expired', tone: 'danger' },
  failed: { label: 'Interrupted', tone: 'danger' }
};

export default function ConnectionStatus({ state, peerStatus, sendMode }: ConnectionStatusProps) {
  const current = stateLabels[state] || { label: state, tone: 'neutral' };
  const label = sendMode === 'text' && state === 'selecting' ? 'Preparing Items' : current.label;

  return (
    <div className="statusCard" aria-live="polite">
      <div className="statusHeader">
        <span className="statusDotLabel">Connection Status</span>
        <span className={`statusPill tone-${current.tone}`}>
          <span className="dot" /> {label}
        </span>
      </div>
      <p className="statusDetail">{peerStatus}</p>
    </div>
  );
}

