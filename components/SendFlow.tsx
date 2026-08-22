'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { fileMeta } from '@/lib/client/files';
import { createTransferSession, sendSignal, startSignalPolling } from '@/lib/client/signaling';
import { createPeerConnection, sendControl } from '@/lib/client/webrtc';
import { sendSelectedFiles } from '@/lib/webrtc/sender';
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
    setErrorReasons([]);
    setState('preparing');
    cancelledRef.current = false;

    try {
      const fileMetas = selected.map((item) => item.meta);
      const session = await createTransferSession(fileMetas);
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
          if (stateRef.current === 'transferring') {
            setError('The peer connection was interrupted.');
            setErrorReasons(['Network disconnect between devices', 'NAT firewall blocked UDP traffic']);
          }
        }
      };

      channel.onopen = () => {
        setState('approval');
        setPeerStatus('Receiver connected — approve this device');
        setToast({ id: Date.now().toString(), type: 'info', text: 'Receiver connected! Approve to send files.' });
      };

      channel.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        try {
          const message = JSON.parse(event.data) as { kind?: string; fileId?: string; receivedBytes?: number };
          if (message.kind === 'accept' && manifestSentRef.current) {
            setPeerStatus('Receiver approved transfer');
            void startFileTransmission();
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
          if (!cancelledRef.current) setError(pollError.message);
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
      if ('reasons' in err && Array.isArray((err as Error & { reasons?: string[] }).reasons)) {
        setErrorReasons((err as Error & { reasons?: string[] }).reasons!);
      } else {
        setErrorReasons([
          'Server unavailable or network unreachable',
          'Redis session store error in production',
          'Missing environment configuration',
          'Invalid file selection payload'
        ]);
      }
    }
  }

  function approveReceiver() {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== 'open' || manifestSentRef.current) return;
    manifestSentRef.current = true;
    setPeerStatus('Receiver allowed — awaiting file approval');
    sendControl(channel, { kind: 'manifest', files: selected.map((item) => item.meta) });
  }

  function declineReceiver() {
    try {
      if (channelRef.current?.readyState === 'open') sendControl(channelRef.current, { kind: 'cancel' });
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
        setState('failed');
        setError(cause instanceof Error ? cause.message : 'File transfer failed.');
      }
    } finally {
      sendingRef.current = false;
    }
  }

  return (
    <main className="shell sendLayout">
      <ToastNotification toast={toast} onClose={() => setToast(null)} />

      <div className="flowHeader">
        <Link href="/" className="backLink">
          ← Back
        </Link>
        <h2>Send Files</h2>
        <p className="subtitle">Select files to generate a secure 6-digit transfer code for the receiver.</p>
      </div>

      <ConnectionStatus state={state} peerStatus={peerStatus} />

      {error && (
        <ErrorMessage
          title="Transfer Error"
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
        <div className="senderStepBox">
          <FileDropzone onFilesSelected={addFiles} maxFiles={MAX_FILES} />

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

      {state === 'waiting' && code && (
        <div className="senderStepBox">
          <TransferCode
            code={code}
            secondsLeft={secondsLeft}
            onCopySuccess={() => setToast({ id: Date.now().toString(), type: 'success', text: 'Transfer code copied to clipboard!' })}
          />
          <FileMetadata files={selected} totalBytes={totalBytes} />
          <FilePreview files={selected} readOnly />
        </div>
      )}

      {state === 'approval' && (
        <div className="senderStepBox approvalCard">
          <h3>Receiver Connected</h3>
          <p>A receiver device is ready to connect. Do you approve sending these files?</p>
          <FileMetadata files={selected} totalBytes={totalBytes} />
          <FilePreview files={selected} readOnly />
          <div className="approvalButtons">
            <button type="button" className="button buttonPrimary" onClick={approveReceiver}>
              ✓ Approve & Share Files
            </button>
            <button type="button" className="button buttonGhost" onClick={declineReceiver}>
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
        </div>
      )}

      {state === 'completed' && (
        <div className="senderStepBox successCard">
          <div className="successIcon">🎉</div>
          <h3>Transfer Complete!</h3>
          <p>All files were successfully transferred to the receiving device.</p>
          <FileMetadata files={selected} totalBytes={totalBytes} />
          <button
            type="button"
            className="button buttonPrimary"
            onClick={() => {
              cleanupConnection();
              setSelected([]);
              setState('idle');
              setCode('');
            }}
          >
            Send More Files
          </button>
        </div>
      )}
    </main>
  );
}
