'use client';

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { fileCategory, fileMeta, formatBytes, formatSpeed, formatTime } from '@/lib/client/files';
import { createTransferSession, sendSignal, startSignalPolling } from '@/lib/client/signaling';
import { createPeerConnection, waitForBuffer } from '@/lib/client/webrtc';
import type { FileMeta, SignalMessage, TransferState } from '@/lib/types';

type Selected = { file: File; meta: FileMeta };
type FileProgress = Record<string, { sent: number; status: 'queued' | 'sending' | 'done' }>;

const MAX_FILES = 20;
const ACK_WINDOW = 8 * 1024 * 1024;

function control(channel: RTCDataChannel, message: unknown) {
  if (channel.readyState !== 'open') throw new Error('Transfer channel is not open.');
  channel.send(JSON.stringify(message));
}

export default function SendFlow() {
  const [selected, setSelected] = useState<Selected[]>([]);
  const [state, setState] = useState<TransferState>('idle');
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState('');
  const [peerStatus, setPeerStatus] = useState('Not connected');
  const [progress, setProgress] = useState<FileProgress>({});
  const [sentBytes, setSentBytes] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState<number>(0);
  const [manifestSent, setManifestSent] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const stopPollRef = useRef<null | (() => void)>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const ackedRef = useRef<Record<string, number>>({});
  const savedRef = useRef<Record<string, boolean>>({});
  const stateRef = useRef<TransferState>('idle');
  const cancelledRef = useRef(false);
  const sendingRef = useRef(false);
  const manifestSentRef = useRef(false);

  const totalBytes = useMemo(() => selected.reduce((sum, item) => sum + item.file.size, 0), [selected]);
  const totalProgress = totalBytes ? Math.min(100, (sentBytes / totalBytes) * 100) : 0;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!expiresAt) return;
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  useEffect(() => () => cleanupConnection(), []);

  function cleanupConnection() {
    cancelledRef.current = true;
    stopPollRef.current?.();
    stopPollRef.current = null;
    try { channelRef.current?.close(); } catch {}
    try { pcRef.current?.close(); } catch {}
    channelRef.current = null;
    pcRef.current = null;
  }

  function addFiles(files: File[]) {
    setError('');
    const usable = files.filter((f) => f.size > 0);
    if (!usable.length) return;
    setSelected((current) => {
      const remaining = Math.max(0, MAX_FILES - current.length);
      const next = usable.slice(0, remaining).map((file) => ({ file, meta: fileMeta(file) }));
      if (usable.length > remaining) setError(`A maximum of ${MAX_FILES} files can be sent in one transfer.`);
      return [...current, ...next];
    });
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    addFiles(Array.from(event.dataTransfer.files ?? []));
  }

  function removeFile(id: string) {
    if (state !== 'idle') return;
    setSelected((items) => items.filter((item) => item.meta.id !== id));
  }

  async function handleSignal(message: SignalMessage) {
    const pc = pcRef.current;
    if (!pc) return;
    if (message.type === 'answer') {
      if (!pc.remoteDescription) {
        await pc.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
        for (const candidate of pendingIceRef.current.splice(0)) {
          await pc.addIceCandidate(candidate).catch(() => undefined);
        }
      }
      return;
    }
    if (message.type === 'ice') {
      const candidate = message.payload as RTCIceCandidateInit;
      if (pc.remoteDescription) await pc.addIceCandidate(candidate).catch(() => undefined);
      else pendingIceRef.current.push(candidate);
    }
  }

  async function createRoom() {
    if (!selected.length || state !== 'idle') return;
    setError('');
    setState('preparing');
    cancelledRef.current = false;

    try {
      const session = await createTransferSession();
      setCode(session.code);
      const expiry = Date.now() + session.expiresIn * 1000;
      setExpiresAt(expiry);
      setState('waiting');
      setPeerStatus('Waiting for receiver');

      const pc = createPeerConnection();
      pcRef.current = pc;
      const channel = pc.createDataChannel('peerbridge-files', { ordered: true });
      channel.binaryType = 'arraybuffer';
      channelRef.current = channel;

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        void sendSignal({
          code: session.code,
          role: 'sender',
          token: session.token,
          type: 'ice',
          payload: event.candidate.toJSON()
        }).catch(() => undefined);
      };

      pc.onconnectionstatechange = () => {
        const status = pc.connectionState;
        if (status === 'connected') setPeerStatus('Direct peer connected');
        if (status === 'failed' || status === 'disconnected') {
          setPeerStatus('Connection interrupted');
          if (stateRef.current === 'transferring') setError('The peer connection was interrupted.');
        }
      };

      channel.onopen = () => {
        setState('approval');
        setPeerStatus('Receiver connected — approve this device');
      };

      channel.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        try {
          const message = JSON.parse(event.data) as { kind?: string; fileId?: string; receivedBytes?: number };
          if (message.kind === 'accept' && manifestSentRef.current) {
            setPeerStatus('Receiver approved transfer');
            void sendFiles();
          } else if (message.kind === 'decline') {
            setState('declined');
            setPeerStatus('Receiver declined transfer');
          } else if (message.kind === 'cancel') {
            cancelledRef.current = true;
            setState('failed');
            setError('Receiver cancelled the transfer.');
          } else if (message.kind === 'ack' && message.fileId && Number.isFinite(message.receivedBytes)) {
            ackedRef.current[message.fileId] = Math.max(0, Number(message.receivedBytes));
          } else if (message.kind === 'file-saved' && message.fileId) {
            savedRef.current[message.fileId] = true;
          }
        } catch {
          // Ignore malformed peer control messages.
        }
      };

      channel.onclose = () => {
        if (stateRef.current !== 'completed' && !cancelledRef.current) setPeerStatus('Transfer channel closed');
      };

      stopPollRef.current = startSignalPolling(
        { code: session.code, role: 'sender', token: session.token },
        handleSignal,
        (pollError) => {
          if (!cancelledRef.current) setError(pollError.message);
        }
      );

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal({ code: session.code, role: 'sender', token: session.token, type: 'offer', payload: offer });
    } catch (cause) {
      cleanupConnection();
      setState('failed');
      setError(cause instanceof Error ? cause.message : 'Could not create transfer session.');
    }
  }


  function approveReceiver() {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== 'open' || manifestSentRef.current) return;
    manifestSentRef.current = true;
    setManifestSent(true);
    setPeerStatus('Receiver allowed — awaiting file approval');
    control(channel, { kind: 'manifest', files: selected.map((item) => item.meta) });
  }

  function declineReceiver() {
    try { if (channelRef.current?.readyState === 'open') control(channelRef.current, { kind: 'cancel' }); } catch {}
    cleanupConnection();
    setState('declined');
    setPeerStatus('Receiver rejected by sender');
  }

  async function waitForReceiverAck(fileId: string, sent: number) {
    const started = Date.now();
    while (sent - (ackedRef.current[fileId] ?? 0) > ACK_WINDOW) {
      if (cancelledRef.current) throw new Error('Transfer cancelled.');
      if (Date.now() - started > 45_000) throw new Error('Receiver stopped acknowledging data.');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }


  async function waitForFileSaved(fileId: string) {
    const started = Date.now();
    while (!savedRef.current[fileId]) {
      if (cancelledRef.current) throw new Error('Transfer cancelled.');
      if (Date.now() - started > 60_000) throw new Error('Receiver did not finish saving the file.');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  async function sendFiles() {
    if (sendingRef.current) return;
    sendingRef.current = true;
    const channel = channelRef.current;
    const pc = pcRef.current;
    if (!channel || !pc || channel.readyState !== 'open') {
      sendingRef.current = false;
      setError('Transfer channel is not connected.');
      return;
    }

    stateRef.current = 'transferring';
    setState('transferring');
    const initialProgress: FileProgress = {};
    for (const item of selected) initialProgress[item.meta.id] = { sent: 0, status: 'queued' };
    setProgress(initialProgress);
    setSentBytes(0);
    const started = performance.now();
    let totalSent = 0;
    let lastUi = 0;

    try {
      const maxMessage = pc.sctp?.maxMessageSize || 65_536;
      const chunkSize = Math.max(16 * 1024, Math.min(64 * 1024, Math.floor(maxMessage / 2)));

      for (const item of selected) {
        if (cancelledRef.current) throw new Error('Transfer cancelled.');
        ackedRef.current[item.meta.id] = 0;
        savedRef.current[item.meta.id] = false;
        control(channel, { kind: 'file-start', file: item.meta, chunkSize });
        setProgress((current) => ({ ...current, [item.meta.id]: { sent: 0, status: 'sending' } }));

        let offset = 0;
        while (offset < item.file.size) {
          if (cancelledRef.current) throw new Error('Transfer cancelled.');
          await waitForBuffer(channel, 4 * 1024 * 1024);
          await waitForReceiverAck(item.meta.id, offset);

          const end = Math.min(offset + chunkSize, item.file.size);
          const buffer = await item.file.slice(offset, end).arrayBuffer();
          channel.send(buffer);
          const delta = end - offset;
          offset = end;
          totalSent += delta;

          const tick = performance.now();
          if (tick - lastUi > 120 || offset === item.file.size) {
            const elapsedSeconds = Math.max((tick - started) / 1000, 0.001);
            const currentSpeed = totalSent / elapsedSeconds;
            setSentBytes(totalSent);
            setSpeed(currentSpeed);
            setEta(currentSpeed > 0 ? (totalBytes - totalSent) / currentSpeed : 0);
            setProgress((current) => ({ ...current, [item.meta.id]: { sent: offset, status: 'sending' } }));
            lastUi = tick;
          }
        }

        await waitForReceiverAck(item.meta.id, item.file.size);
        control(channel, { kind: 'file-end', fileId: item.meta.id });
        await waitForFileSaved(item.meta.id);
        setProgress((current) => ({ ...current, [item.meta.id]: { sent: item.file.size, status: 'done' } }));
      }

      control(channel, { kind: 'all-complete' });
      setSentBytes(totalBytes);
      setEta(0);
      stateRef.current = 'completed';
      setState('completed');
      setPeerStatus('Transfer completed');
    } catch (cause) {
      setState('failed');
      setError(cause instanceof Error ? cause.message : 'File transfer failed.');
    } finally {
      sendingRef.current = false;
    }
  }

  function cancelTransfer() {
    cancelledRef.current = true;
    try { if (channelRef.current?.readyState === 'open') control(channelRef.current, { kind: 'cancel' }); } catch {}
    cleanupConnection();
    setState('failed');
    setError('Transfer cancelled.');
  }

  function reset() {
    cleanupConnection();
    stateRef.current = 'idle';
    setState('idle');
    setCode('');
    setExpiresAt(0);
    setProgress({});
    setSentBytes(0);
    setSpeed(0);
    setEta(0);
    setManifestSent(false);
    manifestSentRef.current = false;
    setError('');
    setPeerStatus('Not connected');
    cancelledRef.current = false;
    sendingRef.current = false;
  }

  return (
    <main className="shell flowPage">
      <div className="flowTopline">
        <div><Link href="/" className="backLink">← Back</Link><span className="pageKicker">Secure P2P transfer</span></div>
        {['preparing','waiting','approval','transferring'].includes(state) && <button className="dangerButton" onClick={cancelTransfer}>Cancel transfer</button>}
      </div>

      <div className="flowHeading">
        <div><h1>Send files</h1><p>Select files, create a transfer code and keep this browser open while the receiver connects.</p></div>
        <div className={`statusPill ${peerStatus.includes('connected') || peerStatus.includes('approved') ? 'statusGood' : ''}`}><span />{peerStatus}</div>
      </div>

      {error && <div className="alert" role="alert"><strong>Action needed</strong><span>{error}</span>{state === 'failed' && <button className="alertAction" onClick={reset}>Start over</button>}</div>}

      {state === 'completed' ? (
        <section className="successPanel">
          <div className="successIcon">✓</div>
          <h2>Transfer complete</h2>
          <p>{selected.length} {selected.length === 1 ? 'file' : 'files'} · {formatBytes(totalBytes)} sent successfully.</p>
          <div className="successActions"><button className="button" onClick={reset}>Send more files</button><Link className="button buttonGhost" href="/">Home</Link></div>
        </section>
      ) : (
        <div className="sendLayout">
          <section className="panel">
            <div className="panelHead"><div><span className="stepBadge">1</span><h2>Choose files</h2></div><span>{selected.length}/{MAX_FILES}</span></div>
            <div className={`dropZone ${state !== 'idle' ? 'dropDisabled' : ''}`} onDragOver={(e: DragEvent<HTMLDivElement>) => e.preventDefault()} onDrop={onDrop}>
              <div className="dropIcon">↥</div>
              <strong>Drag & drop files here</strong>
              <span>or choose files from this device</span>
              <label className="button filePickerButton">Browse files<input type="file" multiple onChange={onPick} disabled={state !== 'idle'} /></label>
              <small>Automatic name, file type and file size detection</small>
            </div>

            {selected.length > 0 && (
              <div className="fileList">
                <div className="fileListSummary"><strong>{selected.length} files selected</strong><span>Total {formatBytes(totalBytes)}</span></div>
                {selected.map((item) => {
                  const itemProgress = progress[item.meta.id];
                  const pct = item.meta.size ? ((itemProgress?.sent ?? 0) / item.meta.size) * 100 : 0;
                  return (
                    <div className="fileRow" key={item.meta.id}>
                      <div className={`fileType type-${fileCategory(item.meta.name).toLowerCase()}`}>{item.meta.extension?.slice(0, 3).toUpperCase() || 'FILE'}</div>
                      <div className="fileInfo"><strong title={item.meta.name}>{item.meta.name}</strong><span>{fileCategory(item.meta.name)} · {formatBytes(item.meta.size)}</span>{itemProgress && <div className="miniTrack"><i style={{ width: `${pct}%` }} /></div>}</div>
                      {state === 'idle' ? <button className="iconButton" onClick={() => removeFile(item.meta.id)} aria-label={`Remove ${item.meta.name}`}>×</button> : <span className="fileState">{itemProgress?.status === 'done' ? '✓' : itemProgress?.status === 'sending' ? `${pct.toFixed(0)}%` : '•'}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="panel sessionPanel">
            <div className="panelHead"><div><span className="stepBadge">2</span><h2>Connect</h2></div></div>
            {!code ? (
              <>
                <div className="sessionEmpty"><div className="codeGhost">••• — •••</div><p>Your temporary code appears here.</p></div>
                <button className="button buttonFull" onClick={createRoom} disabled={!selected.length || state !== 'idle'}>{state === 'preparing' ? 'Creating secure room…' : 'Create transfer code'}</button>
              </>
            ) : (
              <>
                <span className="fieldLabel">Transfer code</span>
                <div className="transferCode">{code.slice(0, 3)}<span>—</span>{code.slice(3)}</div>
                <button className="copyButton" onClick={() => void navigator.clipboard.writeText(code)}>Copy code</button>
                <div className="expiryLine"><span>Code expires in</span><strong>{Math.floor(secondsLeft / 60).toString().padStart(2, '0')}:{(secondsLeft % 60).toString().padStart(2, '0')}</strong></div>
                <div className="infoBox">Share this code only with the intended receiver. File bytes are not uploaded to PeerBridge.</div>
              </>
            )}

            {state === 'approval' && !manifestSent && <div className="senderApproval"><strong>Allow this receiver?</strong><span>A device entered your code. Only continue if you expect this connection.</span><div><button className="button buttonGhost" onClick={declineReceiver}>Reject</button><button className="button" onClick={approveReceiver}>Allow device</button></div></div>}
            {state === 'approval' && manifestSent && <div className="approvalWaiting"><span className="pulseDot" />File list sent. Waiting for receiver approval…</div>}

            {state === 'transferring' && (
              <div className="transferStats">
                <div className="bigProgress"><div><strong>{totalProgress.toFixed(0)}%</strong><span>Overall progress</span></div><div className="track"><i style={{ width: `${totalProgress}%` }} /></div></div>
                <div className="statGrid"><div><span>Sent</span><strong>{formatBytes(sentBytes)}</strong></div><div><span>Speed</span><strong>{formatSpeed(speed)}</strong></div><div><span>ETA</span><strong>{formatTime(eta)}</strong></div><div><span>Total</span><strong>{formatBytes(totalBytes)}</strong></div></div>
              </div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
