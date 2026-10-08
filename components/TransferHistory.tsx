'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatBytes, formatTime } from '@/lib/client/files';
import {
  clearTransferHistory,
  readTransferHistory,
  removeTransferHistoryEntry,
  type TransferHistoryEntry
} from '@/lib/client/history';

export default function TransferHistory() {
  const [entries, setEntries] = useState<TransferHistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setEntries(readTransferHistory());
    setLoaded(true);
  }, []);

  function handleRemove(id: string) {
    if (!removeTransferHistoryEntry(id)) {
      setNotice('Could not update history in this browser.');
      return;
    }
    setEntries((current) => current.filter((entry) => entry.id !== id));
    setNotice('Transfer removed from this device’s history.');
  }

  function handleClear() {
    if (!clearTransferHistory()) {
      setNotice('Could not clear history in this browser.');
      return;
    }
    setEntries([]);
    setNotice('Transfer history cleared from this device.');
  }

  return (
    <main className="shell utilityPage">
      <header className="utilityHeader">
        <span className="sectionLabel">Your device</span>
        <h1>Transfer history</h1>
        <p>Completed transfers saved privately in this browser. History is not synced between devices.</p>
      </header>

      {notice && <p className="utilityNotice" role="status">{notice}</p>}

      {!loaded ? (
        <section className="utilityCard" aria-live="polite">Loading history…</section>
      ) : entries.length === 0 ? (
        <section className="utilityCard historyEmpty">
          <div className="utilityHeroIcon" aria-hidden="true">↔</div>
          <h2>No transfers yet</h2>
          <p>Completed sends and receives will appear here on this device.</p>
          <div className="heroActions">
            <Link className="button" href="/send">Send files</Link>
            <Link className="button buttonGhost" href="/receive">Receive files</Link>
          </div>
        </section>
      ) : (
        <>
          <div className="historyToolbar">
            <span>{entries.length} completed {entries.length === 1 ? 'transfer' : 'transfers'}</span>
            <button type="button" className="button buttonGhost buttonSmall" onClick={handleClear}>Clear history</button>
          </div>
          <section className="historyList" aria-label="Completed transfers">
            {entries.map((entry) => (
              <article className="historyCard" key={entry.id}>
                <div className="historyDirectionIcon" aria-hidden="true">
                  {entry.direction === 'sent' ? '↑' : '↓'}
                </div>
                <div className="historyDetails">
                  <div className="historyTitleLine">
                    <h2>{entry.direction === 'sent' ? 'Files sent' : 'Files received'}</h2>
                    <time dateTime={entry.completedAt}>
                      {new Date(entry.completedAt).toLocaleString()}
                    </time>
                  </div>
                  <p className="historySummary">
                    {entry.files.length} {entry.files.length === 1 ? 'file' : 'files'} · {formatBytes(entry.totalBytes)} ·
                    {' '}{formatTime(entry.durationMs / 1000)}
                  </p>
                  <ul className="historyFileList">
                    {entry.files.map((file, index) => (
                      <li key={`${entry.id}-${index}`}>
                        <span>{file.name}</span>
                        <small>{formatBytes(file.size)}</small>
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  className="historyRemove"
                  onClick={() => handleRemove(entry.id)}
                  aria-label={`Remove ${entry.direction} transfer from history`}
                >
                  Remove
                </button>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
