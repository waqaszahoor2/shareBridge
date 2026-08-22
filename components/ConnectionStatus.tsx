'use client';

import type { TransferState } from '@/lib/types';

interface ConnectionStatusProps {
  state: TransferState;
  peerStatus: string;
}

const stateLabels: Record<TransferState, { label: string; tone: string }> = {
  idle: { label: 'Ready', tone: 'neutral' },
  preparing: { label: 'Preparing', tone: 'info' },
  waiting: { label: 'Waiting for Peer', tone: 'warning' },
  connecting: { label: 'Connecting', tone: 'info' },
  approval: { label: 'Awaiting Approval', tone: 'warning' },
  transferring: { label: 'Transferring', tone: 'active' },
  completed: { label: 'Completed', tone: 'success' },
  declined: { label: 'Declined', tone: 'danger' },
  failed: { label: 'Failed', tone: 'danger' }
};

export default function ConnectionStatus({ state, peerStatus }: ConnectionStatusProps) {
  const current = stateLabels[state] || { label: state, tone: 'neutral' };

  return (
    <div className="statusCard">
      <div className="statusHeader">
        <span className="statusDotLabel">Connection Status</span>
        <span className={`statusPill tone-${current.tone}`}>
          <span className="dot" /> {current.label}
        </span>
      </div>
      <p className="statusDetail">{peerStatus}</p>
    </div>
  );
}
