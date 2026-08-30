'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { safeFileName } from '@/lib/client/files';
import { joinTransferSession, releaseTransferSession, sendSignal, startSignalPolling } from '@/lib/client/signaling';
import { createPeerConnection } from '@/lib/webrtc/peerConnection';
import { sendControl } from '@/lib/webrtc/dataChannel';
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
const STORAGE_KEY = 'peerbridge_receiver_session';

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
  const [receivedTexts, setReceivedTexts] = useState<Record<string, string>>({});
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  async function handleCopyText(text: string, filename: string) {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedFile(filename);
      setToast({ id: Date.now().toString(), type: 'success', text: `✓ Copied "${filename}" to clipboard!` });
      setTimeout(() => setCopiedFile(null), 3000);
    } catch {
      setToast({ id: Date.now().toString(), type: 'error', text: 'Failed to copy text. Please select text manually.' });
    }
  }

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
  const receiverIdRef = useRef<string>('');
  const resumeTokenRef = useRef<string>('');
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // Auto-restore session from sessionStorage on reload
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as { code: string; receiverId: string; resumeToken: string };
          if (parsed.code && parsed.resumeToken) {
            receiverIdRef.current = parsed.receiverId || '';
            resumeTokenRef.current = parsed.resumeToken || '';
            void connectWithCode(parsed.code, parsed.receiverId, parsed.resumeToken);
          }
        }
      } catch {}
    }

    return () => cleanupConnection();
  }, []);

  function cleanupConnection(releaseClaim = false) {
    cancelledRef.current = true;
    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
    connectionTimeoutRef.current = null;

    if (releaseClaim && code && resumeTokenRef.current) {
      void releaseTransferSession({
        code,
        receiverId: receiverIdRef.current,
        resumeToken: resumeTokenRef.current
      });
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }

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

  async function pickCustomDirectory() {
    if (
      typeof window !== 'undefined' &&
      typeof (window as unknown as { showDirectoryPicker?: () => Promise<DirectoryHandleLike> }).showDirectoryPicker === 'function'
    ) {
      try {
        directoryRef.current = await (window as unknown as { showDirectoryPicker: () => Promise<DirectoryHandleLike> }).showDirectoryPicker();
        setToast({ id: Date.now().toString(), type: 'success', text: '✓ Save directory selected for disk streaming!' });
      } catch {
        // User cancelled
      }
    }
  }

  async function connectWithCode(targetCode: string, existingReceiverId?: string, existingResumeToken?: string) {
    if (targetCode.length !== 6) return;
    setCode(targetCode);
    setError('');
    setErrorReasons([]);
    setState('joining');
    setPeerStatus('Connecting to room...');
    cancelledRef.current = false;

    try {
      const session = await joinTransferSession({
        code: targetCode,
        receiverId: existingReceiverId || receiverIdRef.current,
        resumeToken: existingResumeToken || resumeTokenRef.current
      });

      receiverIdRef.current = session.receiverId || '';
      resumeTokenRef.current = session.resumeToken || session.token || '';

      if (typeof window !== 'undefined') {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            code: targetCode,
            receiverId: receiverIdRef.current,
            resumeToken: resumeTokenRef.current
          })
        );
      }

      setState('connecting');
      setPeerStatus('Connecting WebRTC peer...');

      const pc = await createPeerConnection();
      pcRef.current = pc;

      connectionTimeoutRef.current = setTimeout(() => {
        if (stateRef.current === 'connecting' || stateRef.current === 'joining') {
          cleanupConnection(true);
          setState('failed');
          setError('WebRTC peer connection timed out after 30 seconds.');
          setErrorReasons(['Network disconnect between devices', 'NAT firewall blocking peer connection']);
        }
      }, 30_000);

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
        if (pc.connectionState === 'connected') {
          if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
          setPeerStatus('Connected — waiting for sender approval');
        }
        if (pc.connectionState === 'disconnected') {
          setPeerStatus('Reconnecting peer network...');
        }
        if (pc.connectionState === 'failed') {
          setPeerStatus('Connection interrupted');
          if (!cancelledRef.current && stateRef.current !== 'completed') {
            cleanupConnection(false);
            setState('failed');
            setError('The WebRTC connection was interrupted.');
            setErrorReasons([
              'Cellular network switched or NAT firewall blocked direct P2P',
              'Sender closed connection or device screen turned off',
              'Try connecting again — TURN relay will auto-assist cross-network connections'
            ]);
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
          if (
            !cancelledRef.current &&
            (stateRef.current === 'joining' || stateRef.current === 'connecting')
          ) {
            setError(pollError.message);
          }
        }
      );
    } catch (cause) {
      cleanupConnection(false);
      setState('failed');
      setPeerStatus('Not connected');
      const err = cause instanceof Error ? cause : new Error('Could not connect to transfer.');
      setError(err.message);
      if ('reasons' in err && Array.isArray((err as Error & { reasons?: string[] }).reasons)) {
        setErrorReasons((err as Error & { reasons?: string[] }).reasons!);
      } else {
        setErrorReasons([
          'The transfer code is invalid or expired (10-minute limit)',
          'Another device has already claimed this code',
          'Server session storage unavailable'
        ]);
      }
    }
  }

  function configureChannel(channel: RTCDataChannel) {
    channel.onopen = () => {
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      if (stopPollRef.current) {
        stopPollRef.current();
        stopPollRef.current = null;
      }
      setState('waiting-for-sender-approval');
      setPeerStatus('Connected — waiting for sender approval');

      // Send receiver-ready acknowledgement to sender immediately!
      try {
        sendControl(channel, { kind: 'receiver-ready', receiverId: receiverIdRef.current });
      } catch {}
    };

    channel.onclose = () => {
      if (stateRef.current !== 'completed' && !cancelledRef.current) {
        setPeerStatus('Transfer channel closed');
      }
    };

    channel.onerror = () => {
      if (stateRef.current !== 'completed' && !cancelledRef.current) {
        setError('The peer-to-peer data channel reported an error.');
      }
    };

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
      const message = JSON.parse(raw) as {
        kind?: string;
        files?: unknown;
        file?: FileMeta;
        fileId?: string;
        chunkSize?: number;
      };

      if (message.kind === 'transfer-approved' || message.kind === 'manifest') {
        const files = validateIncomingManifest(message.files);
        incomingRef.current = files;
        const total = files.reduce((sum, file) => sum + file.size, 0);
        totalBytesRef.current = total;
        setIncoming(files);

        // Notify user if large file on unsupported browser
        if (!directoryRef.current && total > 500 * 1024 * 1024) {
          setToast({
            id: Date.now().toString(),
            type: 'info',
            text: 'Files total > 500MB without disk streaming access. High memory usage may occur.'
          });
        }

        startedAtRef.current = performance.now();
        lastUiRef.current = performance.now();
        totalReceivedRef.current = 0;

        setState('preparing-storage');
        setPeerStatus('Preparing storage & streaming files...');

        // Send automatic manifest-ready response back to sender
        sendControl(channel, { kind: 'manifest-ready' });
        setState('transferring');
        setPeerStatus('Receiving files...');
        return;
      }

      if (message.kind === 'file-start' && message.file) {
        if (stateRef.current !== 'transferring' && stateRef.current !== 'preparing-storage') {
          throw new Error('Sender transmitted before approval.');
        }
        const meta = incomingRef.current.find((file) => file.id === message.file?.id);
        if (!meta) throw new Error('Received an unknown file identifier.');
        setActiveFileName(meta.name);
        const writerPromise = prepareWriter(meta);
        activeRef.current = { meta, writerPromise, chunks: [], received: 0, nextAck: ACK_STEP };
        return;
      }

      if (message.kind === 'file-end' && message.fileId) {
        const context = activeRef.current;
        if (!context || context.meta.id !== message.fileId) throw new Error('File transfer order was invalid.');
        activeRef.current = null;
        writeChainRef.current = writeChainRef.current.then(async () => {
          if (context.received !== context.meta.size) throw new Error('Received file size mismatch.');

          const blob = new Blob(context.chunks, { type: context.meta.type });
          if (
            context.meta.type.includes('text') ||
            context.meta.extension === '.txt' ||
            context.meta.name.endsWith('.txt') ||
            context.meta.size < 500_000
          ) {
            try {
              const text = await blob.text();
              if (text && !/[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 200))) {
                setReceivedTexts((prev) => ({ ...prev, [context.meta.name]: text }));
              }
            } catch {}
          }

          const writer = await context.writerPromise;
          if (writer) {
            await writer.close();
          } else {
            triggerFileDownload(blob, context.meta.name);
          }
          if (channel.readyState === 'open') {
            sendControl(channel, { kind: 'chunk-ack', fileId: context.meta.id, receivedBytes: context.received });
            sendControl(channel, { kind: 'file-saved', fileId: context.meta.id });
          }
        });
        return;
      }

      if (message.kind === 'all-complete') {
        writeChainRef.current = writeChainRef.current.then(async () => {
          setTotalReceived(totalBytesRef.current);
          setEta(0);
          setState('completed');
          setPeerStatus('Transfer completed');
          if (typeof window !== 'undefined') sessionStorage.removeItem(STORAGE_KEY);
          // Purge room keys from Upstash Redis immediately on completion
          fetch('/api/session/release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, purge: true })
          }).catch(() => undefined);
          setToast({ id: Date.now().toString(), type: 'success', text: 'All files received and saved!' });
        });
        return;
      }

      if (message.kind === 'decline' || message.kind === 'cancel') {
        cancelledRef.current = true;
        cleanupConnection(true);
        setState('cancelled');
        setError('Sender cancelled or declined the transfer.');
      }
    } catch (cause) {
      cleanupConnection(true);
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
        sendControl(channel, { kind: 'chunk-ack', fileId: context.meta.id, receivedBytes: context.received });
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
    if (now - lastUiRef.current > 100 || totalReceivedRef.current === totalBytesRef.current) {
      const elapsedSeconds = Math.max((now - startedAtRef.current) / 1000, 0.001);
      const currentSpeed = totalReceivedRef.current / elapsedSeconds;
      const remainingBytes = Math.max(0, totalBytesRef.current - totalReceivedRef.current);
      setTotalReceived(totalReceivedRef.current);
      setSpeed(currentSpeed);
      setEta(currentSpeed > 0 ? remainingBytes / currentSpeed : 0);
      lastUiRef.current = now;
    }
  }

  function cancelTransfer() {
    try {
      if (channelRef.current?.readyState === 'open') {
        sendControl(channelRef.current, { kind: 'cancel' });
      }
    } catch {}
    cleanupConnection(true);
    setState('cancelled');
    setPeerStatus('Transfer cancelled by receiver');
  }

  function resetToStart() {
    cleanupConnection(true);
    setIncoming([]);
    setState('idle');
    setCode('');
    setTotalReceived(0);
    setSpeed(0);
    setEta(0);
    setError('');
    setErrorReasons([]);
    setReceivedTexts({});
    setCopiedFile(null);
  }

  return (
    <main className="shell receiveLayout">
      <ToastNotification toast={toast} onClose={() => setToast(null)} />

      <div className="flowHeader">
        <Link href="/" className="backLink">
          ← Back
        </Link>
        <h1>Receive Files</h1>
        <p className="subtitle">Enter the 6-digit code provided by the sender to join the transfer.</p>
      </div>

      <ConnectionStatus state={state} peerStatus={peerStatus} />

      {error && (
        <ErrorMessage
          title="Connection Alert"
          message={error}
          reasons={errorReasons}
          onRetry={() => {
            if (code && code.length === 6) {
              connectWithCode(code);
            } else {
              resetToStart();
            }
          }}
          onDismiss={resetToStart}
        />
      )}

      {state === 'idle' && (
        <div className="receiverStepBox">
          <ReceiverJoin onJoin={(digits) => connectWithCode(digits)} loading={false} />
        </div>
      )}

      {(state === 'joining' || state === 'connecting') && (
        <div className="receiverStepBox connectingCard">
          <div className="spinner" aria-hidden="true" />
          <h3>Connecting to Sender...</h3>
          <p>Verifying transfer code and establishing secure peer connection.</p>
          <div className="actionRow">
            <button type="button" className="button buttonGhost" onClick={cancelTransfer}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {state === 'waiting-for-sender-approval' && (
        <div className="receiverStepBox approvalCard">
          <div className="spinner" aria-hidden="true" />
          <h3>Waiting for Sender Approval</h3>
          <p>Connected to sender device. The sender is reviewing your transfer request.</p>
          <div className="actionRow">
            {supportsDirectory && (
              <button type="button" className="button buttonSmall buttonSecondary" onClick={pickCustomDirectory}>
                📂 Choose Save Folder (Optional)
              </button>
            )}
            <button type="button" className="button buttonGhost" onClick={cancelTransfer}>
              Cancel Waiting
            </button>
          </div>
        </div>
      )}

      {state === 'preparing-storage' && (
        <div className="receiverStepBox connectingCard">
          <div className="spinner" aria-hidden="true" />
          <h3>Sender Approved Transfer</h3>
          <p>Initializing download storage stream...</p>
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
          <div className="actionRow">
            <button type="button" className="button buttonGhost" onClick={cancelTransfer}>
              Cancel Download
            </button>
          </div>
        </div>
      )}

      {state === 'completed' && (
        <div className="receiverStepBox successCard">
          <div className="successIcon">🎉</div>
          <h3>Transfer Complete!</h3>
          <p>All files and text content have been successfully received.</p>
          
          {Object.keys(receivedTexts).length > 0 && (
            <div className="receivedTextSection">
              <h4 className="textSectionTitle">📝 Received Text Snippet</h4>
              {Object.entries(receivedTexts).map(([filename, textContent]) => (
                <div key={filename} className="receivedTextCard">
                  <div className="receivedTextHeader">
                    <span className="textFileNameLabel">{filename}</span>
                    <button
                      type="button"
                      className="button buttonSmall buttonPrimary copyTextBtn"
                      onClick={() => handleCopyText(textContent, filename)}
                    >
                      {copiedFile === filename ? '✓ Copied to Clipboard!' : '📋 Copy Text'}
                    </button>
                  </div>
                  <textarea
                    className="receivedTextArea"
                    readOnly
                    value={textContent}
                    rows={Math.min(10, Math.max(3, textContent.split('\n').length))}
                  />
                </div>
              ))}
            </div>
          )}

          <FileMetadata files={incoming} totalBytes={totalBytes} />
          <button type="button" className="button buttonPrimary" onClick={resetToStart}>
            Receive Another Transfer
          </button>
        </div>
      )}

      {(state === 'cancelled' || state === 'declined' || state === 'expired') && !error && (
        <div className="receiverStepBox failureCard">
          <h3>
            {state === 'cancelled'
              ? 'Transfer Cancelled'
              : state === 'declined'
              ? 'Transfer Declined'
              : 'Transfer Code Expired'}
          </h3>
          <p>
            {state === 'cancelled'
              ? 'The transfer was cancelled.'
              : state === 'declined'
              ? 'The sender declined the transfer request.'
              : 'The transfer code expired.'}
          </p>
          <div className="actionRow">
            <button type="button" className="button buttonPrimary" onClick={resetToStart}>
              Enter New Code
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

