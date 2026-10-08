'use client';

import { formatBytes, formatSpeed, formatTime } from '@/lib/client/files';

interface TransferProgressProps {
  progressPercentage: number;
  currentBytes: number;
  totalBytes: number;
  speed: number;
  eta: number;
  currentFileName?: string;
  direction: 'sending' | 'receiving';
}

export default function TransferProgress({
  progressPercentage,
  currentBytes,
  totalBytes,
  speed,
  eta,
  currentFileName,
  direction
}: TransferProgressProps) {
  const percent = Math.min(100, Math.max(0, progressPercentage));

  return (
    <div className="progressBox">
      <div className="progressHeader">
        <div className="progressTitle">
          <strong>
            {currentFileName
              ? `${direction === 'sending' ? 'Sending' : 'Receiving'}: ${currentFileName}`
              : `${direction === 'sending' ? 'Sending' : 'Receiving'} files...`}
          </strong>
          <span>{percent.toFixed(1)}%</span>
        </div>
        <div
          className="progressBarContainer"
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Transfer progress"
        >
          <div className="progressBarFill" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="progressStatsGrid">
        <div className="statItem">
          <span className="statLabel">Transferred</span>
          <strong className="statValue">
            {formatBytes(currentBytes)} / {formatBytes(totalBytes)}
          </strong>
        </div>
        <div className="statItem">
          <span className="statLabel">Speed</span>
          <strong className="statValue">{formatSpeed(speed)}</strong>
        </div>
        <div className="statItem">
          <span className="statLabel">Time remaining</span>
          <strong className="statValue">
            {currentBytes < totalBytes && speed <= 0 ? 'Calculating…' : formatTime(eta)}
          </strong>
        </div>
      </div>
    </div>
  );
}
