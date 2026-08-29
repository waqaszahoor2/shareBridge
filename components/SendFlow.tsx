'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { fileMeta } from '@/lib/client/files';
import { createTransferSession, sendSignal, startSignalPolling } from '@/lib/client/signaling';
import { createPeerConnection } from '@/lib/webrtc/peerConnection';
import { sendControl } from '@/lib/webrtc/dataChannel';
import { sendSelectedFiles } from '@/lib/webrtc/sender';
import { waitForReceiverReady } from '@/lib/webrtc/chunkTransfer';
import type { FileMeta, SignalMessage, TransferState } from '@/lib/types';

import ConnectionStatus from './ConnectionStatus';
import CreateTransferButton from './CreateTransferButton';
import ErrorMessage from './ErrorMessage';
import FileDropzone from './FileDropzone';
import FileMetadata from './FileMetadata';
import FilePreview from './FilePreview';
import FileUploader from './FileUploader';
import ToastNotification, { ToastMessage } from './ToastNotification';
import TransferCode from './TransferCode';
import TransferProgress from './TransferProgress';

type Selected = { file: File; meta: FileMeta };

const MAX_FILES = 20;

export default function SendFlow() {
  const [selected, setSelected] = useState<Selected[]>([]);
  const [state, setState] = useState<TransferState>('idle');
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState('');
  const [errorReasons, setErrorReasons] = useState<string[]>([]);
  const [peerStatus, setPeerStatus] = useState('Not connected');
  const [sentBytes, setSentBytes] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState<number>(0);
  const [activeFileName, setActiveFileName] = useState<string>('');
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [prepProgress, setPrepProgress] = useState(0);

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
  const receiverReadyRef = useRef(false);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalBytes = useMemo(() => selected.reduce((sum, item) => sum + item.file.size, 0), [selected]);
  const totalProgress = totalBytes ? Math.min(100, (sentBytes / totalBytes) * 100) : 0;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0 && (stateRef.current === 'waiting-for-receiver' || stateRef.current === 'connecting')) {
        cleanupConnection();
        setState('expired');
        setPeerStatus('Transfer code expired');
        setError('Transfer code expired before receiver connected.');
        setErrorReasons(['Code TTL reached (10 minutes)', 'Please generate a new code']);
      }
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  useEffect(() => () => cleanupConnection(), []);

  function cleanupConnection() {
    cancelledRef.current = true;
    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
    if (apiTimeoutRef.current) clearTimeout(apiTimeoutRef.current);
    connectionTimeoutRef.current = null;
    apiTimeoutRef.current = null;

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

  function addFiles(files: File[]) {
    setError('');
    setErrorReasons([]);
    const usable = files.filter((f) => f.size > 0);
    if (!usable.length) return;

    setSelected((current) => {
      const remaining = Math.max(0, MAX_FILES - current.length);
      const next = usable.slice(0, remaining).map((file) => ({ file, meta: fileMeta(file) }));
      if (usable.length > remaining) {
        setError(`A maximum of ${MAX_FILES} files can be sent in one transfer.`);
      }
      return [...current, ...next];
    });
    if (state === 'idle') setState('selecting');
  }

  function removeFile(id: string) {
    if (state !== 'idle' && state !== 'selecting') return;
    setSelected((items) => {
      const next = items.filter((item) => item.meta.id !== id);
      if (next.length === 0) setState('idle');
      return next;
    });
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
    if (!selected.length || (state !== 'idle' && state !== 'selecting' && state !== 'failed')) return;
    setError('');
    setErrorReasons([]);
    setState('creating-session');
    cancelledRef.current = false;
    manifestSentRef.current = false;
    receiverReadyRef.current = false;

    try {
      const fileMetas = selected.map((item) => item.meta);

      const apiPromise = createTransferSession(fileMetas);
      const timeoutPromise = new Promise<never>((_, reject) => {
        apiTimeoutRef.current = setTimeout(() => reject(new Error('Session creation request timed out (15s).')), 15_000);
      });

      const session = await Promise.race([apiPromise, timeoutPromise]);
      if (apiTimeoutRef.current) clearTimeout(apiTimeoutRef.current);

      setCode(session.code);
      const expiry = Date.now() + session.expiresIn * 1000;
      setExpiresAt(expiry);
      setState('waiting-for-receiver');
      setPeerStatus('Waiting for receiver');

      const pc = await createPeerConnection();
      pcRef.current = pc;
      const channel = pc.createDataChannel('peerbridge-files', { ordered: true });
      channel.binaryType = 'arraybuffer';
      channelRef.current = channel;

      connectionTimeoutRef.current = setTimeout(() => {
        if (stateRef.current === 'connecting') {
          cleanupConnection();
          setState('failed');
          setError('WebRTC peer connection timed out after 30 seconds.');
          setErrorReasons(['Symmetric NAT or firewall blocking UDP/TCP peer connection', 'TRY TURN relay or check internet access']);
        }
      }, 30_000);

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
        if (status === 'connected') {
          if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
          setPeerStatus('Direct peer connected');
        }
        if (status === 'failed' || status === 'disconnected') {
          setPeerStatus('Connection interrupted');
          if (stateRef.current === 'transferring' || stateRef.current === 'waiting-for-sender-approval') {
            cleanupConnection();
            setState('failed');
            setError('The WebRTC connection was interrupted.');
            setErrorReasons(['Network disconnect between devices', 'NAT firewall closed media stream']);
          }
        }
      };

      channel.onopen = () => {
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        setState('waiting-for-sender-approval');
        setPeerStatus('Receiver connected — ready for approval');
        setToast({ id: Date.now().toString(), type: 'info', text: 'Receiver connected! Review files and click Approve.' });
      };

      channel.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        try {
          const message = JSON.parse(event.data) as {
            kind?: string;
            fileId?: string;
            receivedBytes?: number;
            receiverId?: string;
          };

          if (message.kind === 'receiver-ready' || message.kind === 'manifest-ready') {
            receiverReadyRef.current = true;
            if (manifestSentRef.current) {
              void startFileTransmission();
            }
          } else if (message.kind === 'decline' || message.kind === 'cancel') {
            cancelledRef.current = true;
            cleanupConnection();
            setState(message.kind === 'decline' ? 'declined' : 'cancelled');
            setPeerStatus(message.kind === 'decline' ? 'Receiver declined transfer' : 'Receiver cancelled transfer');
          } else if (message.kind === 'chunk-ack' && message.fileId && Number.isFinite(message.receivedBytes)) {
            ackedRef.current[message.fileId] = Math.max(0, Number(message.receivedBytes));
          } else if (message.kind === 'file-saved' && message.fileId) {
            savedRef.current[message.fileId] = true;
          }
        } catch {}
      };

      channel.onclose = () => {
        if (stateRef.current !== 'completed' && !cancelledRef.current) {
          setPeerStatus('Transfer channel closed');
        }
      };

      stopPollRef.current = startSignalPolling(
        { code: session.code, role: 'sender', token: session.token },
        handleSignal,
        (pollError) => {
          if (!cancelledRef.current && stateRef.current !== 'completed') setError(pollError.message);
        }
      );

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal({ code: session.code, role: 'sender', token: session.token, type: 'offer', payload: offer });
    } catch (cause) {
      cleanupConnection();
      setState('failed');
      const err = cause instanceof Error ? cause : new Error('Unable to create transfer session.');
      setError(err.message);
      setErrorReasons([
        'Server unavailable or network unreachable',
        'Redis session store error in production',
        'Invalid file selection payload'
      ]);
    }
  }

  async function approveReceiver() {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== 'open') {
      setError('Unable to approve transfer.');
      setErrorReasons(['Connection lost', 'Receiver disconnected']);
      return;
    }
    if (manifestSentRef.current || isApproving) return;

    setIsApproving(true);
    manifestSentRef.current = true;
    setPrepProgress(10);
    setPeerStatus('Approving transfer & starting receiver stream...');

    try {
      sendControl(channel, {
        kind: 'transfer-approved',
        sessionId: code,
        files: selected.map((item) => item.meta)
      });
      setPrepProgress(40);

      await waitForReceiverReady(
        () => receiverReadyRef.current,
        () => cancelledRef.current,
        30_000
      );
      setPrepProgress(90);

      await startFileTransmission();
    } catch (cause) {
      setIsApproving(false);
      if (!cancelledRef.current) {
        cleanupConnection();
        setState('failed');
        setError(cause instanceof Error ? cause.message : 'Receiver acknowledgement failed.');
        setErrorReasons(['Receiver did not respond to approval within 30 seconds', 'Data channel interrupted']);
      }
    }
  }

  function declineReceiver() {
    try {
      if (channelRef.current?.readyState === 'open') {
        sendControl(channelRef.current, { kind: 'decline' });
      }
    } catch {}
    cleanupConnection();
    setState('declined');
    setPeerStatus('Receiver rejected by sender');
  }

  async function startFileTransmission() {
    if (sendingRef.current) return;
    sendingRef.current = true;
    const channel = channelRef.current;
    const pc = pcRef.current;

    if (!channel || !pc || channel.readyState !== 'open') {
      sendingRef.current = false;
      setIsApproving(false);
      setError('Transfer channel is not connected.');
      return;
    }

    stateRef.current = 'transferring';
    setState('transferring');
    setSentBytes(0);

    try {
      await sendSelectedFiles({
        files: selected,
        channel,
        pc,
        ackedRef,
        savedRef,
        isCancelled: () => cancelledRef.current,
        onFileStart: (fileId) => {
          const item = selected.find((s) => s.meta.id === fileId);
          if (item) setActiveFileName(item.meta.name);
        },
        onProgress: (_id, _offset, totalSent, currentSpeed, currentEta) => {
          setSentBytes(totalSent);
          setSpeed(currentSpeed);
          setEta(currentEta);
        }
      });

      setState('completed');
      setPeerStatus('All files transferred successfully');
      setToast({ id: Date.now().toString(), type: 'success', text: 'All files sent successfully!' });
    } catch (cause) {
      if (!cancelledRef.current) {
        cleanupConnection();
        setState('failed');
        setError(cause instanceof Error ? cause.message : 'File transfer failed.');
      }
    } finally {
      sendingRef.current = false;
      setIsApproving(false);
    }
  }

  function resetToStart() {
    cleanupConnection();
    setSelected([]);
    setState('idle');
    setCode('');
    setSentBytes(0);
    setSpeed(0);
    setEta(0);
    setError('');
    setErrorReasons([]);
    setIsApproving(false);
  }

  const [sendMode, setSendMode] = useState<'files' | 'text'>('files');
  const [textNoteInput, setTextNoteInput] = useState('');
  const [textFileName, setTextFileName] = useState('shared-note.txt');

  function handleAddTextNote() {
    if (!textNoteInput.trim()) return;
    const name = textFileName.trim() || 'shared-note.txt';
    const safeName = name.endsWith('.txt') ? name : `${name}.txt`;
    const blob = new Blob([textNoteInput], { type: 'text/plain;charset=utf-8' });
    const file = new File([blob], safeName, { type: 'text/plain;charset=utf-8' });
    addFiles([file]);
    setTextNoteInput('');
  }

  return (
    <main className="shell sendLayout">
      <ToastNotification toast={toast} onClose={() => setToast(null)} />

      <div className="flowHeader">
        <Link href="/" className="backLink">
          ← Back
        </Link>
        <h1>Send Files &amp; Text</h1>
        <p className="subtitle">Select files or type a text snippet to generate a 6-digit transfer code for the receiver.</p>
      </div>

      <ConnectionStatus state={state} peerStatus={peerStatus} />

      {error && (
        <ErrorMessage
          title="Transfer Alert"
          message={error}
          reasons={errorReasons}
          onRetry={state === 'failed' || state === 'expired' ? createRoom : undefined}
          onDismiss={() => {
            setError('');
            setErrorReasons([]);
          }}
        />
      )}

      {(state === 'idle' || state === 'selecting') && (
        <div className="senderStepBox">
          <div className="modeTabs" role="tablist" aria-label="Sharing Mode">
            <button
              type="button"
              role="tab"
              aria-selected={sendMode === 'files'}
              className={`tabBtn ${sendMode === 'files' ? 'tabBtnActive' : ''}`}
              onClick={() => setSendMode('files')}
            >
              📁 Share Files
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sendMode === 'text'}
              className={`tabBtn ${sendMode === 'text' ? 'tabBtnActive' : ''}`}
              onClick={() => setSendMode('text')}
            >
              📝 Share Text / Snippet
            </button>
          </div>

          {sendMode === 'files' ? (
            <FileDropzone onFilesSelected={addFiles} maxFiles={MAX_FILES} />
          ) : (
            <div className="textInputCard">
              <div className="textInputHeader">
                <label htmlFor="sharedTextInput"><strong>Type or Paste Text to Share</strong></label>
                <input
                  type="text"
                  className="textFileNameInput"
                  value={textFileName}
                  onChange={(e) => setTextFileName(e.target.value)}
                  placeholder="filename.txt"
                  aria-label="Filename for text note"
                />
              </div>
              <textarea
                id="sharedTextInput"
                className="textShareArea"
                rows={6}
                value={textNoteInput}
                onChange={(e) => setTextNoteInput(e.target.value)}
                placeholder="Type or paste passwords, code snippets, links, messages or notes here..."
              />
              <div className="textMetaRow">
                <span>{textNoteInput.length} characters · {textNoteInput.trim() ? textNoteInput.trim().split(/\s+/).length : 0} words</span>
                <button
                  type="button"
                  className="button buttonSmall buttonSecondary"
                  onClick={handleAddTextNote}
                  disabled={!textNoteInput.trim()}
                >
                  + Add Text to Transfer
                </button>
              </div>
            </div>
          )}

          {selected.length > 0 && (
            <div className="selectedSection">
              <FileMetadata files={selected} totalBytes={totalBytes} />
              <FilePreview files={selected} onRemove={removeFile} />
              <div className="actionRow">
                <FileUploader onFilesSelected={addFiles} buttonText="Add More Files" />
                <CreateTransferButton
                  onClick={createRoom}
                  fileCount={selected.length}
                  disabled={selected.length === 0}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {state === 'creating-session' && (
        <div className="senderStepBox connectingCard">
          <div className="spinner" aria-hidden="true" />
          <h3>Generating Transfer Code...</h3>
          <p>Allocating secure session and WebRTC channel.</p>
        </div>
      )}

      {state === 'waiting-for-receiver' && code && (
        <div className="senderStepBox">
          <TransferCode
            code={code}
            secondsLeft={secondsLeft}
            onCopySuccess={() => setToast({ id: Date.now().toString(), type: 'success', text: 'Transfer code copied to clipboard!' })}
          />
          <FileMetadata files={selected} totalBytes={totalBytes} />
          <FilePreview files={selected} readOnly />
          <div className="actionRow">
            <button type="button" className="button buttonGhost" onClick={resetToStart}>
              Cancel Session
            </button>
          </div>
        </div>
      )}

      {state === 'waiting-for-sender-approval' && (
        <div className="senderStepBox approvalCard">
          <h3>Receiver Connected</h3>
          <p>A receiver device entered code <strong>{code}</strong>. Approve to stream these files directly to their device.</p>
          <FileMetadata files={selected} totalBytes={totalBytes} />
          <FilePreview files={selected} readOnly />

          {isApproving && (
            <div className="prepStatusCard" role="status">
              <div className="prepHeader">
                <span className="spinner" aria-hidden="true" />
                <strong>Preparing Direct Transfer...</strong>
              </div>
              <div className="prepChecklist">
                <span>✓ Receiver verified</span>
                <span>✓ Transfer manifest approved</span>
                <span>⏳ Initializing receiver storage stream...</span>
              </div>
            </div>
          )}

          <div className="approvalButtons">
            <button
              type="button"
              className="button buttonPrimary"
              onClick={approveReceiver}
              disabled={isApproving}
            >
              {isApproving ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Approve &amp; Send Files
                </>
              ) : (
                '✓ Approve & Send Files'
              )}
            </button>
            <button type="button" className="button buttonGhost" onClick={declineReceiver} disabled={isApproving}>
              ✕ Decline
            </button>
          </div>
        </div>
      )}

      {state === 'transferring' && (
        <div className="senderStepBox">
          <TransferProgress
            progressPercentage={totalProgress}
            currentBytes={sentBytes}
            totalBytes={totalBytes}
            speed={speed}
            eta={eta}
            currentFileName={activeFileName}
          />
          <FileMetadata files={selected} totalBytes={totalBytes} />
          <FilePreview files={selected} readOnly />
          <div className="actionRow">
            <button type="button" className="button buttonGhost" onClick={declineReceiver}>
              Cancel Transfer
            </button>
          </div>
        </div>
      )}

      {state === 'completed' && (
        <div className="senderStepBox successCard">
          <div className="successIcon">🎉</div>
          <h3>Transfer Complete!</h3>
          <p>All files were successfully sent directly to the receiving device.</p>
          <FileMetadata files={selected} totalBytes={totalBytes} />
          <button type="button" className="button buttonPrimary" onClick={resetToStart}>
            Send More Files
          </button>
        </div>
      )}

      {(state === 'declined' || state === 'cancelled' || state === 'expired' || state === 'failed') && (
        <div className="senderStepBox failureCard">
          <h3>
            {state === 'declined'
              ? 'Receiver Declined'
              : state === 'cancelled'
              ? 'Transfer Cancelled'
              : state === 'expired'
              ? 'Transfer Code Expired'
              : 'Transfer Interrupted'}
          </h3>
          <p>
            {state === 'declined'
              ? 'The receiver device declined or disconnected.'
              : state === 'cancelled'
              ? 'The transfer was cancelled.'
              : state === 'expired'
              ? 'The 10-minute code expired before completion.'
              : 'The peer connection was lost or timed out.'}
          </p>

          <div className="actionRow">
            <button type="button" className="button buttonPrimary" onClick={createRoom} disabled={selected.length === 0}>
              Generate New Code
            </button>
            <button type="button" className="button buttonGhost" onClick={resetToStart}>
              Start Over
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

