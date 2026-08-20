'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { fileCategory, formatBytes, formatSpeed, formatTime, safeFileName } from '@/lib/client/files';
import { joinTransferSession, sendSignal, startSignalPolling } from '@/lib/client/signaling';
import { createPeerConnection } from '@/lib/client/webrtc';
import type { FileMeta, SignalMessage, TransferState } from '@/lib/types';

type WriterLike = {
  write(data: ArrayBuffer): Promise<void>;
  close(): Promise<void>;
};

type FileHandleLike = {
  createWritable(): Promise<WriterLike>;
};

type DirectoryHandleLike = {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
};

type ActiveFile = {
  meta: FileMeta;
  writerPromise: Promise<WriterLike | null>;
  chunks: ArrayBuffer[];
  received: number;
  nextAck: number;
};

const ACK_STEP = 512 * 1024;

function sendControl(channel: RTCDataChannel, message: unknown) {
  if (channel.readyState !== 'open') throw new Error('Transfer channel is not open.');
  channel.send(JSON.stringify(message));
}

async function uniqueFileHandle(directory: DirectoryHandleLike, originalName: string) {
  const safe = safeFileName(originalName);
  const dot = safe.lastIndexOf('.');
  const base = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : '';

  for (let index = 0; index < 1000; index += 1) {
    const candidate = index === 0 ? safe : `${base} (${index})${ext}`;
    try {
      await directory.getFileHandle(candidate, { create: false });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        return directory.getFileHandle(candidate, { create: true });
      }
      throw error;
    }
  }
  throw new Error('Could not allocate a safe destination filename.');
}

export default function ReceiveFlow() {
  const [code, setCode] = useState('');
  const [state, setState] = useState<TransferState>('idle');
  const [peerStatus, setPeerStatus] = useState('Not connected');
  const [error, setError] = useState('');
  const [incoming, setIncoming] = useState<FileMeta[]>([]);
  const [received, setReceived] = useState<Record<string, number>>({});
  const [completedFiles, setCompletedFiles] = useState<Record<string, boolean>>({});
  const [totalReceived, setTotalReceived] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [supportsDirectory, setSupportsDirectory] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const stopPollRef = useRef<null | (() => void)>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const directoryRef = useRef<DirectoryHandleLike | null>(null);
  const activeRef = useRef<ActiveFile | null>(null);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  const totalReceivedRef = useRef(0);
  const startedAtRef = useRef(0);
  const lastUiRef = useRef(0);
  const cancelledRef = useRef(false);
  const stateRef = useRef<TransferState>('idle');
  const incomingRef = useRef<FileMeta[]>([]);
  const totalBytesRef = useRef(0);

  const totalBytes = useMemo(() => incoming.reduce((sum, file) => sum + file.size, 0), [incoming]);
  const totalProgress = totalBytes ? Math.min(100, (totalReceived / totalBytes) * 100) : 0;
  const memoryWarning = incoming.length > 0 && totalBytes > 256 * 1024 * 1024 && !supportsDirectory;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    setSupportsDirectory(typeof window !== 'undefined' && typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function');
    return () => cleanupConnection();
  }, []);

  function cleanupConnection() {
    cancelledRef.current = true;
    stopPollRef.current?.();
    stopPollRef.current = null;
    try { channelRef.current?.close(); } catch {}
    try { pcRef.current?.close(); } catch {}
    channelRef.current = null;
    pcRef.current = null;
  }

  function onCodeChange(event: ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
  }

  async function handleSignal(message: SignalMessage, session: { code: string; token: string }) {
    const pc = pcRef.current;
    if (!pc) return;

    if (message.type === 'offer' && !pc.remoteDescription) {
      await pc.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
      for (const candidate of pendingIceRef.current.splice(0)) {
        await pc.addIceCandidate(candidate).catch(() => undefined);
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal({ code: session.code, role: 'receiver', token: session.token, type: 'answer', payload: answer });
      return;
    }

    if (message.type === 'ice') {
      const candidate = message.payload as RTCIceCandidateInit;
      if (pc.remoteDescription) await pc.addIceCandidate(candidate).catch(() => undefined);
      else pendingIceRef.current.push(candidate);
    }
  }

  async function connect() {
    if (code.length !== 6 || state !== 'idle') return;
    setError('');
    setState('preparing');
    setPeerStatus('Finding sender');
    cancelledRef.current = false;

    try {
      const session = await joinTransferSession(code);
      const pc = createPeerConnection();
      pcRef.current = pc;
      setState('connecting');

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        void sendSignal({
          code: session.code,
          role: 'receiver',
          token: session.token,
          type: 'ice',
          payload: event.candidate.toJSON()
        }).catch(() => undefined);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setPeerStatus('Secure peer connected');
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setPeerStatus('Connection interrupted');
          if (!cancelledRef.current) setError('The peer connection was interrupted.');
        }
      };

      pc.ondatachannel = (event) => {
        const channel = event.channel;
        channel.binaryType = 'arraybuffer';
        channelRef.current = channel;
        configureChannel(channel);
      };

      stopPollRef.current = startSignalPolling(
        { code: session.code, role: 'receiver', token: session.token },
        (message) => handleSignal(message, session),
        (pollError) => {
          if (!cancelledRef.current) setError(pollError.message);
        }
      );
    } catch (cause) {
      cleanupConnection();
      cancelledRef.current = false;
      setState('idle');
      setPeerStatus('Not connected');
      setError(cause instanceof Error ? cause.message : 'Could not connect to this transfer.');
    }
  }

  function configureChannel(channel: RTCDataChannel) {
    channel.onopen = () => setPeerStatus('Secure channel connected');
    channel.onclose = () => {
      if (stateRef.current !== 'completed' && !cancelledRef.current) setPeerStatus('Transfer channel closed');
    };
    channel.onerror = () => setError('The peer-to-peer data channel reported an error.');
    channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        handleControlMessage(channel, event.data);
      } else if (event.data instanceof ArrayBuffer) {
        enqueueBinary(channel, event.data);
      }
    };
  }

  function validateManifest(files: unknown): FileMeta[] {
    if (!Array.isArray(files) || files.length === 0 || files.length > 20) throw new Error('Sender provided an invalid file list.');
    return files.map((item) => {
      const value = item as Partial<FileMeta>;
      if (
        typeof value.id !== 'string' || value.id.length > 80 ||
        typeof value.name !== 'string' || value.name.length === 0 || value.name.length > 255 ||
        typeof value.size !== 'number' || !Number.isSafeInteger(value.size) || value.size <= 0 || value.size > 50 * 1024 ** 3
      ) throw new Error('Sender provided invalid file metadata.');
      return {
        id: value.id,
        name: value.name,
        size: value.size,
        type: typeof value.type === 'string' ? value.type.slice(0, 120) : 'application/octet-stream',
        extension: typeof value.extension === 'string' ? value.extension.slice(0, 12) : ''
      };
    });
  }

  function handleControlMessage(channel: RTCDataChannel, raw: string) {
    if (raw.length > 100_000) return;
    try {
      const message = JSON.parse(raw) as { kind?: string; files?: unknown; file?: FileMeta; fileId?: string };
      if (message.kind === 'manifest') {
        const files = validateManifest(message.files);
        incomingRef.current = files;
        totalBytesRef.current = files.reduce((sum, file) => sum + file.size, 0);
        setIncoming(files);
        setState('approval');
        setPeerStatus('Incoming transfer request');
        return;
      }

      if (message.kind === 'file-start' && message.file) {
        if (stateRef.current !== 'transferring') throw new Error('Sender attempted to transmit before approval.');
        const meta = incomingRef.current.find((file) => file.id === message.file?.id);
        if (!meta) throw new Error('Received an unknown file identifier.');
        const writerPromise = prepareWriter(meta);
        activeRef.current = { meta, writerPromise, chunks: [], received: 0, nextAck: ACK_STEP };
        return;
      }

      if (message.kind === 'file-end' && message.fileId) {
        if (stateRef.current !== 'transferring') throw new Error('Unexpected file completion message.');
        const context = activeRef.current;
        if (!context || context.meta.id !== message.fileId) throw new Error('File transfer order was invalid.');
        activeRef.current = null;
        writeChainRef.current = writeChainRef.current.then(async () => {
          if (context.received !== context.meta.size) throw new Error('Received file size does not match sender metadata.');
          const writer = await context.writerPromise;
          if (writer) {
            await writer.close();
          } else {
            const blob = new Blob(context.chunks, { type: context.meta.type });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = safeFileName(context.meta.name);
            anchor.rel = 'noopener';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
          }
          if (channel.readyState === 'open') {
            sendControl(channel, { kind: 'ack', fileId: context.meta.id, receivedBytes: context.received });
            sendControl(channel, { kind: 'file-saved', fileId: context.meta.id });
          }
          setReceived((current) => ({ ...current, [context.meta.id]: context.meta.size }));
          setCompletedFiles((current) => ({ ...current, [context.meta.id]: true }));
        });
        return;
      }

      if (message.kind === 'all-complete') {
        if (stateRef.current !== 'transferring') throw new Error('Unexpected transfer completion message.');
        writeChainRef.current = writeChainRef.current.then(async () => {
          setTotalReceived(totalBytesRef.current);
          setEta(0);
          setState('completed');
          setPeerStatus('Transfer completed');
        });
        return;
      }

      if (message.kind === 'cancel') {
        cancelledRef.current = true;
        setState('failed');
        setError('Sender cancelled the transfer.');
      }
    } catch (cause) {
      setState('failed');
      setError(cause instanceof Error ? cause.message : 'Invalid transfer message received.');
      try { sendControl(channel, { kind: 'cancel' }); } catch {}
    }
  }

  async function prepareWriter(meta: FileMeta): Promise<WriterLike | null> {
    const directory = directoryRef.current;
    if (!directory) return null;
    const handle = await uniqueFileHandle(directory, meta.name);
    return handle.createWritable();
  }

  function enqueueBinary(channel: RTCDataChannel, data: ArrayBuffer) {
    const context = activeRef.current;
    if (!context || stateRef.current !== 'transferring') {
      setState('failed');
      setError('Unexpected binary data was rejected.');
      try { sendControl(channel, { kind: 'cancel' }); } catch {}
      return;
    }
    const fileId = context.meta.id;

    writeChainRef.current = writeChainRef.current.then(async () => {
      const writer = await context.writerPromise;
      if (writer) await writer.write(data);
      else context.chunks.push(data);

      context.received += data.byteLength;
      totalReceivedRef.current += data.byteLength;

      if (context.received > context.meta.size + 64 * 1024) throw new Error('Received more data than declared for this file.');

      if (context.received >= context.nextAck || context.received === context.meta.size) {
        if (channel.readyState === 'open') sendControl(channel, { kind: 'ack', fileId, receivedBytes: context.received });
        context.nextAck = context.received + ACK_STEP;
      }

      const tick = performance.now();
      if (tick - lastUiRef.current > 120 || context.received === context.meta.size) {
        const elapsed = Math.max((tick - startedAtRef.current) / 1000, 0.001);
        const currentSpeed = totalReceivedRef.current / elapsed;
        setReceived((current) => ({ ...current, [fileId]: context.received }));
        setTotalReceived(totalReceivedRef.current);
        setSpeed(currentSpeed);
        setEta(currentSpeed > 0 ? Math.max(0, (totalBytesRef.current - totalReceivedRef.current) / currentSpeed) : 0);
        lastUiRef.current = tick;
      }
    }).catch((cause) => {
      setState('failed');
      setError(cause instanceof Error ? cause.message : 'Could not write the incoming file.');
      try { sendControl(channel, { kind: 'cancel' }); } catch {}
    });
  }

  async function acceptTransfer() {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== 'open') {
      setError('Secure peer channel is not ready yet.');
      return;
    }

    setError('');
    if (supportsDirectory) {
      const picker = (window as Window & { showDirectoryPicker?: () => Promise<DirectoryHandleLike> }).showDirectoryPicker;
      try {
        directoryRef.current = picker ? await picker() : null;
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError('Could not open the selected download folder.');
        return;
      }
    } else {
      directoryRef.current = null;
    }

    totalReceivedRef.current = 0;
    startedAtRef.current = performance.now();
    lastUiRef.current = 0;
    writeChainRef.current = Promise.resolve();
    setReceived({});
    setCompletedFiles({});
    setTotalReceived(0);
    setSpeed(0);
    setEta(0);
    stateRef.current = 'transferring';
    setState('transferring');
    setPeerStatus('Receiving files');
    sendControl(channel, { kind: 'accept' });
  }

  function declineTransfer() {
    try { if (channelRef.current?.readyState === 'open') sendControl(channelRef.current, { kind: 'decline' }); } catch {}
    setState('declined');
    setPeerStatus('Transfer declined');
  }

  function cancelTransfer() {
    cancelledRef.current = true;
    try { if (channelRef.current?.readyState === 'open') sendControl(channelRef.current, { kind: 'cancel' }); } catch {}
    cleanupConnection();
    setState('failed');
    setError('Transfer cancelled.');
  }

  function reset() {
    cleanupConnection();
    cancelledRef.current = false;
    setCode('');
    setState('idle');
    setPeerStatus('Not connected');
    setIncoming([]);
    incomingRef.current = [];
    totalBytesRef.current = 0;
    setReceived({});
    setCompletedFiles({});
    setTotalReceived(0);
    setSpeed(0);
    setEta(0);
    setError('');
    directoryRef.current = null;
    activeRef.current = null;
    totalReceivedRef.current = 0;
  }

  if (state === 'completed') {
    return (
      <main className="shell flowPage">
        <section className="successPanel standaloneSuccess">
          <div className="successIcon">✓</div>
          <h2>Transfer complete</h2>
          <p>{incoming.length} {incoming.length === 1 ? 'file' : 'files'} · {formatBytes(totalBytes)} received successfully.</p>
          <div className="successActions"><button className="button" onClick={reset}>Receive another</button><Link className="button buttonGhost" href="/">Home</Link></div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell flowPage">
      <div className="flowTopline">
        <div><Link href="/" className="backLink">← Back</Link><span className="pageKicker">Secure P2P transfer</span></div>
        {(state === 'connecting' || state === 'approval' || state === 'transferring') && <button className="dangerButton" onClick={cancelTransfer}>Cancel transfer</button>}
      </div>

      <div className="flowHeading">
        <div><h1>Receive files</h1><p>Enter the sender&apos;s 6-digit code. You always approve the file list before receiving data.</p></div>
        <div className={`statusPill ${peerStatus.includes('connected') || peerStatus.includes('Receiving') ? 'statusGood' : ''}`}><span />{peerStatus}</div>
      </div>

      {error && <div className="alert" role="alert"><strong>Action needed</strong><span>{error}</span></div>}

      {state === 'idle' || state === 'preparing' || state === 'connecting' ? (
        <section className="receiveConnect panel">
          <div className="receiveIcon">↓</div>
          <span className="sectionLabel">Connection code</span>
          <h2>Enter the 6-digit code</h2>
          <p>The code was created on the sender&apos;s device and expires automatically.</p>
          <input className="codeInput" value={code} onChange={onCodeChange} inputMode="numeric" autoComplete="one-time-code" placeholder="000 000" aria-label="6-digit transfer code" />
          <button className="button buttonFull receiveButton" onClick={connect} disabled={code.length !== 6 || state !== 'idle'}>{state === 'preparing' || state === 'connecting' ? 'Connecting securely…' : 'Connect to sender'}</button>
          <div className="secureNote"><span>✓</span><div><strong>Private connection</strong><p>PeerBridge exchanges connection metadata only. File bytes use the WebRTC peer channel.</p></div></div>
        </section>
      ) : state === 'approval' ? (
        <section className="approvalPanel panel">
          <div className="incomingBadge">Incoming transfer request</div>
          <h2>{incoming.length} {incoming.length === 1 ? 'file' : 'files'} · {formatBytes(totalBytes)}</h2>
          <p>Review the file list before accepting. Filenames and MIME types are treated as untrusted metadata.</p>
          <div className="fileList approvalList">
            {incoming.map((file) => <div className="fileRow" key={file.id}><div className={`fileType type-${fileCategory(file.name).toLowerCase()}`}>{file.extension?.slice(0, 3).toUpperCase() || 'FILE'}</div><div className="fileInfo"><strong>{file.name}</strong><span>{fileCategory(file.name)} · {formatBytes(file.size)}</span></div></div>)}
          </div>
          {memoryWarning && <div className="browserWarning"><strong>Large-file browser notice</strong><span>This browser cannot stream directly into a selected folder. For 500 MB+ transfers, use current Chrome or Edge desktop to avoid high memory usage.</span></div>}
          <div className="approvalActions"><button className="button buttonGhost" onClick={declineTransfer}>Decline</button><button className="button" onClick={acceptTransfer}>{supportsDirectory ? 'Choose folder & accept' : 'Accept & download'}</button></div>
        </section>
      ) : state === 'declined' ? (
        <section className="successPanel neutralPanel"><div className="neutralIcon">×</div><h2>Transfer declined</h2><p>No file data was received.</p><button className="button" onClick={reset}>Enter another code</button></section>
      ) : state === 'failed' ? (
        <section className="successPanel neutralPanel"><div className="neutralIcon">!</div><h2>Transfer stopped</h2><p>The connection was closed before the transfer completed.</p><button className="button" onClick={reset}>Try another code</button></section>
      ) : (
        <div className="receiveTransferLayout">
          <section className="panel">
            <div className="panelHead"><div><span className="stepBadge">✓</span><h2>Receiving files</h2></div><strong className="progressNumber">{totalProgress.toFixed(0)}%</strong></div>
            <div className="overallTrack"><i style={{ width: `${totalProgress}%` }} /></div>
            <div className="statGrid receiveStats"><div><span>Received</span><strong>{formatBytes(totalReceived)}</strong></div><div><span>Total</span><strong>{formatBytes(totalBytes)}</strong></div><div><span>Speed</span><strong>{formatSpeed(speed)}</strong></div><div><span>ETA</span><strong>{formatTime(eta)}</strong></div></div>
            <div className="fileList transferFileList">
              {incoming.map((file) => {
                const bytes = received[file.id] ?? 0;
                const pct = file.size ? Math.min(100, (bytes / file.size) * 100) : 0;
                return <div className="fileRow" key={file.id}><div className={`fileType type-${fileCategory(file.name).toLowerCase()}`}>{file.extension?.slice(0, 3).toUpperCase() || 'FILE'}</div><div className="fileInfo"><strong>{file.name}</strong><span>{formatBytes(bytes)} / {formatBytes(file.size)}</span><div className="miniTrack"><i style={{ width: `${pct}%` }} /></div></div><span className={`fileState ${completedFiles[file.id] ? 'done' : ''}`}>{completedFiles[file.id] ? '✓' : `${pct.toFixed(0)}%`}</span></div>;
              })}
            </div>
          </section>
          <aside className="panel transferAside"><div className="connectionOrb"><span>↔</span></div><h3>Direct P2P connection</h3><p>Keep both browsers open until every file reaches 100%.</p><div className="connectionFacts"><span><b>✓</b> WebRTC encrypted</span><span><b>✓</b> Chunked transfer</span><span><b>✓</b> Receiver-controlled save</span></div></aside>
        </div>
      )}
    </main>
  );
}
