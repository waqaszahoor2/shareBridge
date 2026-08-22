'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { safeFileName } from '@/lib/client/files';
import { joinTransferSession, sendSignal, startSignalPolling } from '@/lib/client/signaling';
import { createPeerConnection, sendControl } from '@/lib/client/webrtc';
import { triggerFileDownload, validateIncomingManifest } from '@/lib/webrtc/receiver';
import type { FileMeta, SignalMessage, TransferState } from '@/lib/types';

import ConnectionStatus from './ConnectionStatus';
import ErrorMessage from './ErrorMessage';
import FileMetadata from './FileMetadata';
import FilePreview from './FilePreview';
import ReceiverJoin from './ReceiverJoin';
import ToastNotification, { ToastMessage } from './ToastNotification';
import TransferProgress from './TransferProgress';

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
  const [errorReasons, setErrorReasons] = useState<string[]>([]);
  const [incoming, setIncoming] = useState<FileMeta[]>([]);
  const [totalReceived, setTotalReceived] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [activeFileName, setActiveFileName] = useState('');
  const [supportsDirectory, setSupportsDirectory] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

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

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    setSupportsDirectory(
      typeof window !== 'undefined' &&
        typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
    );
    return () => cleanupConnection();
  }, []);

  function cleanupConnection() {
    cancelledRef.current = true;
    stopPollRef.current?.();
    stopPollRef.current = null;
    try {
      channelRef.current?.close();
    } catch {}
    try {
      pcRef.current?.close();
    } catch {}
    channelRef.current = null;
    pcRef.current = null;
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
      await sendSignal({
        code: session.code,
        role: 'receiver',
        token: session.token,
        type: 'answer',
        payload: answer
      });
      return;
    }

    if (message.type === 'ice') {
      const candidate = message.payload as RTCIceCandidateInit;
      if (pc.remoteDescription) await pc.addIceCandidate(candidate).catch(() => undefined);
      else pendingIceRef.current.push(candidate);
    }
  }

  async function connectWithCode(targetCode: string) {
    if (targetCode.length !== 6 || state !== 'idle') return;
    setCode(targetCode);
    setError('');
    setErrorReasons([]);
    setState('preparing');
    setPeerStatus('Finding sender');
    cancelledRef.current = false;

    try {
      const session = await joinTransferSession(targetCode);
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
          if (!cancelledRef.current) {
            setError('The peer connection was interrupted.');
            setErrorReasons(['Sender closed connection', 'Network timeout / NAT firewall blocking']);
          }
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
      const err = cause instanceof Error ? cause : new Error('Could not connect to transfer.');
      setError(err.message);
      if ('reasons' in err && Array.isArray((err as Error & { reasons?: string[] }).reasons)) {
        setErrorReasons((err as Error & { reasons?: string[] }).reasons!);
      } else {
        setErrorReasons([
          'The transfer code is invalid or expired (10-minute limit)',
          'Another device has already joined using this code',
          'Server is unavailable or Upstash Redis failed in production'
        ]);
      }
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

  function handleControlMessage(channel: RTCDataChannel, raw: string) {
    if (raw.length > 100_000) return;
    try {
      const message = JSON.parse(raw) as { kind?: string; files?: unknown; file?: FileMeta; fileId?: string };
      if (message.kind === 'manifest') {
        const files = validateIncomingManifest(message.files);
        incomingRef.current = files;
        totalBytesRef.current = files.reduce((sum, file) => sum + file.size, 0);
        setIncoming(files);
        setState('approval');
        setPeerStatus('Incoming transfer request');
        return;
      }

      if (message.kind === 'file-start' && message.file) {
        if (stateRef.current !== 'transferring') throw new Error('Sender transmitted before approval.');
        const meta = incomingRef.current.find((file) => file.id === message.file?.id);
        if (!meta) throw new Error('Received an unknown file identifier.');
        setActiveFileName(meta.name);
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
          if (context.received !== context.meta.size) throw new Error('Received file size mismatch.');
          const writer = await context.writerPromise;
          if (writer) {
            await writer.close();
          } else {
            const blob = new Blob(context.chunks, { type: context.meta.type });
            triggerFileDownload(blob, context.meta.name);
          }
          if (channel.readyState === 'open') {
            sendControl(channel, { kind: 'ack', fileId: context.meta.id, receivedBytes: context.received });
            sendControl(channel, { kind: 'file-saved', fileId: context.meta.id });
          }
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
          setToast({ id: Date.now().toString(), type: 'success', text: 'All files received and saved!' });
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
      try {
        sendControl(channel, { kind: 'cancel' });
      } catch {}
    }
  }

  async function prepareWriter(meta: FileMeta): Promise<WriterLike | null> {
    const dir = directoryRef.current;
    if (!dir) return null;
    try {
      const handle = await uniqueFileHandle(dir, meta.name);
      return await handle.createWritable();
    } catch {
      return null;
    }
  }

  function enqueueBinary(channel: RTCDataChannel, buffer: ArrayBuffer) {
    const context = activeRef.current;
    if (!context || stateRef.current !== 'transferring') return;

    context.received += buffer.byteLength;
    totalReceivedRef.current += buffer.byteLength;

    if (context.received >= context.nextAck || context.received === context.meta.size) {
      context.nextAck = context.received + ACK_STEP;
      try {
        sendControl(channel, { kind: 'ack', fileId: context.meta.id, receivedBytes: context.received });
      } catch {}
    }

    writeChainRef.current = writeChainRef.current.then(async () => {
      const writer = await context.writerPromise;
      if (writer) {
        await writer.write(buffer);
      } else {
        context.chunks.push(buffer);
      }
    });

    const now = performance.now();
    if (now - lastUiRef.current > 120 || totalReceivedRef.current === totalBytesRef.current) {
      const elapsedSeconds = Math.max((now - startedAtRef.current) / 1000, 0.001);
      const currentSpeed = totalReceivedRef.current / elapsedSeconds;
      const remainingBytes = Math.max(0, totalBytesRef.current - totalReceivedRef.current);
      setTotalReceived(totalReceivedRef.current);
      setSpeed(currentSpeed);
      setEta(currentSpeed > 0 ? remainingBytes / currentSpeed : 0);
      lastUiRef.current = now;
    }
  }

  function acceptTransfer() {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== 'open') {
      setError('Transfer channel is not open.');
      return;
    }

    startedAtRef.current = performance.now();
    lastUiRef.current = performance.now();
    totalReceivedRef.current = 0;

    setState('transferring');
    setPeerStatus('Receiving files...');
    sendControl(channel, { kind: 'accept' });
  }

  function declineTransfer() {
    try {
      if (channelRef.current?.readyState === 'open') sendControl(channelRef.current, { kind: 'decline' });
    } catch {}
    cleanupConnection();
    setState('declined');
    setPeerStatus('Transfer declined');
  }

  return (
    <main className="shell receiveLayout">
      <ToastNotification toast={toast} onClose={() => setToast(null)} />

      <div className="flowHeader">
        <Link href="/" className="backLink">
          ← Back
        </Link>
        <h2>Receive Files</h2>
        <p className="subtitle">Enter the 6-digit code provided by the sender to join the transfer.</p>
      </div>

      <ConnectionStatus state={state} peerStatus={peerStatus} />

      {error && (
        <ErrorMessage
          title="Connection Error"
          message={error}
          reasons={errorReasons}
          onRetry={state === 'failed' ? () => setState('idle') : undefined}
          onDismiss={() => {
            setError('');
            setErrorReasons([]);
          }}
        />
      )}

      {state === 'idle' && (
        <div className="receiverStepBox">
          <ReceiverJoin onJoin={connectWithCode} loading={false} />
        </div>
      )}

      {(state === 'preparing' || state === 'connecting') && (
        <div className="receiverStepBox connectingCard">
          <div className="spinner" aria-hidden="true" />
          <h3>Connecting to Sender...</h3>
          <p>Verifying transfer code and establishing peer connection.</p>
        </div>
      )}

      {state === 'approval' && (
        <div className="receiverStepBox approvalCard">
          <h3>Incoming Transfer</h3>
          <p>The sender wants to transmit the following files directly to your device:</p>
          <FileMetadata files={incoming} totalBytes={totalBytes} />
          <FilePreview files={incoming} readOnly />
          <div className="approvalButtons">
            <button type="button" className="button buttonPrimary" onClick={acceptTransfer}>
              ✓ Accept &amp; Download Files
            </button>
            <button type="button" className="button buttonGhost" onClick={declineTransfer}>
              ✕ Decline Transfer
            </button>
          </div>
        </div>
      )}

      {state === 'transferring' && (
        <div className="receiverStepBox">
          <TransferProgress
            progressPercentage={totalProgress}
            currentBytes={totalReceived}
            totalBytes={totalBytes}
            speed={speed}
            eta={eta}
            currentFileName={activeFileName}
          />
          <FileMetadata files={incoming} totalBytes={totalBytes} />
          <FilePreview files={incoming} readOnly />
        </div>
      )}

      {state === 'completed' && (
        <div className="receiverStepBox successCard">
          <div className="successIcon">🎉</div>
          <h3>Transfer Complete!</h3>
          <p>All files have been successfully received.</p>
          <FileMetadata files={incoming} totalBytes={totalBytes} />
          <button
            type="button"
            className="button buttonPrimary"
            onClick={() => {
              cleanupConnection();
              setIncoming([]);
              setState('idle');
              setCode('');
            }}
          >
            Receive Another Transfer
          </button>
        </div>
      )}
    </main>
  );
}
