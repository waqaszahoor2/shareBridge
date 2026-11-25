'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { fileMeta } from '@/lib/client/files';
import { useWakeLock } from '@/lib/client/useWakeLock';
import type { FileMeta } from '@/lib/types';
import { sendControl } from '@/lib/webrtc/dataChannel';
import { sendSelectedFiles } from '@/lib/webrtc/sender';
import { validateIncomingManifest, triggerFileDownload } from '@/lib/webrtc/receiver';
import { createOfflinePairingCode, decodeOfflineDescription, encodeOfflineDescription, waitForIceGathering } from '@/lib/webrtc/offlinePairing';
import CodeInput from './CodeInput';
import FileMetadata from './FileMetadata';
import FileUploader from './FileUploader';
import TransferProgress from './TransferProgress';

type OfflineRole = 'send' | 'receive';
type OfflineStep = 'choose' | 'offer' | 'answer' | 'connected' | 'transferring' | 'completed';
type ActiveFile = { meta: FileMeta; chunks: ArrayBuffer[]; received: number; nextAck: number };

const MAX_OFFLINE_BYTES = 256 * 1024 * 1024;
const ACK_STEP = 256 * 1024;

export default function OfflineTransferFlow() {
  const [role, setRole] = useState<OfflineRole>('send');
  const [step, setStep] = useState<OfflineStep>('choose');
  const [files, setFiles] = useState<{ file: File; meta: FileMeta }[]>([]);
  const [incoming, setIncoming] = useState<FileMeta[]>([]);
  const [pairingCode, setPairingCode] = useState('');
  const [enteredPairingCode, setEnteredPairingCode] = useState('');
  const [pairingText, setPairingText] = useState('');
  const [remoteText, setRemoteText] = useState('');
  const [peerReady, setPeerReady] = useState(false);
  const [status, setStatus] = useState('Both devices must be on the same local Wi-Fi or hotspot.');
  const [error, setError] = useState('');
  const [sentBytes, setSentBytes] = useState(0);
  const [receivedBytes, setReceivedBytes] = useState(0);
  const [activeFileName, setActiveFileName] = useState('');
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const controlRef = useRef<RTCDataChannel | null>(null);
  const dataRef = useRef<RTCDataChannel | null>(null);
  const activeFileRef = useRef<ActiveFile | null>(null);
  const ackedRef = useRef<Record<string, number>>({});
  const savedRef = useRef<Record<string, boolean>>({});
  const sendingRef = useRef(false);
  const readyRef = useRef(false);
  const totalReceivedRef = useRef(0);
  const writeChainRef = useRef(Promise.resolve());
  const incomingRef = useRef<FileMeta[]>([]);
  const stepRef = useRef(step);
  stepRef.current = step;
  const totalBytes = files.reduce((total, item) => total + item.file.size, 0);
  const incomingBytes = incoming.reduce((total, file) => total + file.size, 0);
  useWakeLock(step === 'transferring');

  function cleanup() {
    try { controlRef.current?.close(); } catch {}
    try { dataRef.current?.close(); } catch {}
    try { pcRef.current?.close(); } catch {}
    controlRef.current = null;
    dataRef.current = null;
    pcRef.current = null;
    activeFileRef.current = null;
    readyRef.current = false;
    sendingRef.current = false;
    setPeerReady(false);
  }

  function onFilesSelected(selected: File[]) {
    const next = selected.slice(0, 20).map((file) => ({ file, meta: fileMeta(file) }));
    setFiles((current) => [...current, ...next].slice(0, 20));
    setError('');
  }

  async function copyConnectionText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus('Copied. Send this text to the other device.');
    } catch (cause) {
      console.warn('[Offline] Could not copy pairing text.', cause);
      setError('Clipboard access is unavailable. Select and copy the text manually.');
    }
  }

  function configureChannels(pc: RTCPeerConnection) {
    const control = pc.createDataChannel('peerbridge-control', { negotiated: true, id: 0, ordered: true });
    const data = pc.createDataChannel('peerbridge-data', { negotiated: true, id: 1, ordered: true });
    data.binaryType = 'arraybuffer';
    controlRef.current = control;
    dataRef.current = data;

    const sendReady = () => {
      if (readyRef.current || control.readyState !== 'open' || data.readyState !== 'open') return;
      readyRef.current = true;
      if (role === 'receive') {
        setStep('connected');
        setStatus('Direct local peer connected. No internet or relay is used.');
      }
      if (role === 'receive' && !sendControl(control, { kind: 'receiver-ready' })) {
        setError('Could not acknowledge the direct connection.');
      }
    };
    control.onopen = sendReady;
    data.onopen = sendReady;
    control.onclose = data.onclose = () => {
      if (stepRef.current !== 'completed') setError('Local transfer connection closed.');
    };
    control.onerror = data.onerror = () => setError('Local transfer channel error.');

    control.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      void handleControl(control, data, event.data);
    };
    data.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) handleBinary(control, data, event.data);
    };
  }

  async function createLocalPeerConnection() {
    const pc = new RTCPeerConnection({ iceServers: [], iceCandidatePoolSize: 0 });
    pcRef.current = pc;
    configureChannels(pc);
    return pc;
  }

  async function createOfflineOffer() {
    try {
      setError('');
      if (!files.length) throw new Error('Select at least one file before creating an offer.');
      const code = createOfflinePairingCode();
      const pc = await createLocalPeerConnection();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      setStatus('Discovering devices on the local network…');
      await waitForIceGathering(pc);
      if (!pc.localDescription) throw new Error('Could not create the local network offer.');
      setPairingCode(code);
      setPairingText(encodeOfflineDescription(pc.localDescription, code));
      setRemoteText('');
      setStep('offer');
      setStatus('Share the 6-digit code and offer text with the receiving device.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create offline offer.');
      cleanup();
    }
  }

  async function acceptOffer(raw: string) {
    try {
      setError('');
      const { pairingCode: offerCode, description: offer } = decodeOfflineDescription(raw, enteredPairingCode);
      if (offer.type !== 'offer') throw new Error('The connection data is not an offer.');
      setPairingCode(offerCode);
      const pc = await createLocalPeerConnection();
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      setStatus('Preparing answer using local Wi-Fi only…');
      await waitForIceGathering(pc);
      if (!pc.localDescription) throw new Error('Could not create the local network answer.');
      setPairingText(encodeOfflineDescription(pc.localDescription, offerCode));
      setStep('answer');
      setStatus('Share the answer text with the sender. The 6-digit code must match.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not accept offline offer.');
      cleanup();
    }
  }

  async function acceptAnswer(raw: string) {
    try {
      const { pairingCode: answerCode, description: answer } = decodeOfflineDescription(raw, pairingCode);
      if (answer.type !== 'answer' || !pcRef.current) throw new Error('The connection data is not an answer.');
      await pcRef.current.setRemoteDescription(answer);
      setRemoteText('');
      setStatus('Answer accepted. Establishing direct local connection…');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not accept offline answer.');
    }
  }

  async function transmitFiles() {
    if (sendingRef.current) return;
    const control = controlRef.current;
    const data = dataRef.current;
    const pc = pcRef.current;
    if (!control || !data || !pc || control.readyState !== 'open' || data.readyState !== 'open') {
      setError('The local data channels are not connected.');
      return;
    }
    sendingRef.current = true;
    setStep('transferring');
    setSentBytes(0);
    try {
      await sendSelectedFiles({
        files,
        channel: data,
        controlChannel: control,
        pc,
        ackedRef,
        savedRef,
        isCancelled: () => !pcRef.current,
        onFileStart: (fileId) => setActiveFileName(files.find((item) => item.meta.id === fileId)?.meta.name ?? ''),
        onProgress: (_id, _offset, total, currentSpeed, currentEta) => {
          setSentBytes(total);
          setSpeed(currentSpeed);
          setEta(currentEta);
        }
      });
      setStep('completed');
      setStatus('All files transferred directly over the local network.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Offline transfer failed.');
    } finally {
      sendingRef.current = false;
    }
  }

  async function handleControl(control: RTCDataChannel, data: RTCDataChannel, raw: string) {
    try {
      if (raw.length > 100_000) throw new Error('Control message is too large.');
      const message = JSON.parse(raw) as {
        kind?: string; files?: unknown; file?: FileMeta; fileId?: string;
        receivedBytes?: number; message?: string;
      };
      if (message.kind === 'receiver-ready' && role === 'send') {
        setPeerReady(true);
        setStep('connected');
        setStatus('Receiver ready. Approve to send the selected files.');
      } else if (message.kind === 'manifest-ready' && role === 'send') {
        void transmitFiles();
      } else if (message.kind === 'transfer-approved' && role === 'receive') {
        const manifest = validateIncomingManifest(message.files);
        const total = manifest.reduce((sum, file) => sum + file.size, 0);
        if (total > MAX_OFFLINE_BYTES) throw new Error('Offline receiving is limited to 256 MB total to protect device memory.');
        setIncoming(manifest);
        incomingRef.current = manifest;
        setStep('transferring');
        if (!sendControl(control, { kind: 'manifest-ready' })) throw new Error('Could not acknowledge the file list.');
      } else if (message.kind === 'file-start' && role === 'receive' && message.file) {
        const meta = incomingRef.current.find((file) => file.id === message.file?.id);
        if (!meta) throw new Error('The sender started a file that was not approved.');
        activeFileRef.current = { meta, chunks: [], received: 0, nextAck: ACK_STEP };
        setActiveFileName(meta.name);
      } else if (message.kind === 'file-end' && role === 'receive' && message.fileId) {
        const active = activeFileRef.current;
        if (!active || active.meta.id !== message.fileId || active.received !== active.meta.size) {
          throw new Error('The received file is incomplete or does not match the approved file.');
        }
        activeFileRef.current = null;
        writeChainRef.current = writeChainRef.current.then(async () => {
          const blob = new Blob(active.chunks, { type: active.meta.type });
          triggerFileDownload(blob, active.meta.name);
          if (!sendControl(control, { kind: 'chunk-ack', fileId: active.meta.id, receivedBytes: active.received }) ||
              !sendControl(control, { kind: 'file-saved', fileId: active.meta.id })) {
            throw new Error('Could not acknowledge the saved file.');
          }
        });
        await writeChainRef.current;
      } else if (message.kind === 'chunk-ack' && message.fileId && Number.isFinite(message.receivedBytes)) {
        ackedRef.current[message.fileId] = Math.max(0, Number(message.receivedBytes));
      } else if (message.kind === 'file-saved' && message.fileId) {
        savedRef.current[message.fileId] = true;
      } else if (message.kind === 'all-complete' && role === 'receive') {
        setStep('completed');
        setStatus('All files received and downloaded.');
      } else if (message.kind === 'error') {
        throw new Error(message.message || 'The peer reported a transfer error.');
      }
    } catch (cause) {
      const failure = cause instanceof Error ? cause : new Error('Offline transfer failed.');
      setError(failure.message);
      sendControl(control, { kind: 'error', message: failure.message });
      sendControl(control, { kind: 'cancel' });
      cleanup();
    }
  }

  function handleBinary(control: RTCDataChannel, data: RTCDataChannel, chunk: ArrayBuffer) {
    const active = activeFileRef.current;
    if (!active || stepRef.current !== 'transferring') return;
    active.received += chunk.byteLength;
    if (active.received > active.meta.size) {
      setError(`Received too much data for "${active.meta.name}".`);
      cleanup();
      return;
    }
    active.chunks.push(chunk);
    totalReceivedRef.current += chunk.byteLength;
    const received = active.received;
    if (received >= active.nextAck || received === active.meta.size) {
      active.nextAck = received + ACK_STEP;
      if (!sendControl(control, { kind: 'chunk-ack', fileId: active.meta.id, receivedBytes: received })) {
        setError('Could not acknowledge received bytes.');
        cleanup();
        return;
      }
    }
    setReceivedBytes(totalReceivedRef.current);
  }

  function reset() {
    cleanup();
    setStep('choose');
    setPairingText('');
    setPairingCode('');
    setEnteredPairingCode('');
    setRemoteText('');
    setIncoming([]);
    incomingRef.current = [];
    setFiles([]);
    setError('');
    setStatus('Both devices must be on the same local Wi-Fi or hotspot.');
    setSentBytes(0);
    setReceivedBytes(0);
    totalReceivedRef.current = 0;
  }

  return (
    <main className="shell receiveLayout">
      <div className="workflowContent">
        <div className="flowHeader">
          <Link href="/" className="backLink">← Back</Link>
          <h1>Offline Hotspot Transfer</h1>
          <p className="subtitle">Pair over local Wi-Fi or a hotspot without internet. Exchange the 6-digit code and connection text manually.</p>
        </div>

        <section className="receiverStepBox">
          <p role="status">{status}</p>
          {error && <p className="inputValidationAlert" role="alert">{error}</p>}

          {step === 'choose' && (
            <>
              <div className="actionRow">
                <button className={`button ${role === 'send' ? 'buttonPrimary' : 'buttonGhost'}`} onClick={() => setRole('send')}>Send files</button>
                <button className={`button ${role === 'receive' ? 'buttonPrimary' : 'buttonGhost'}`} onClick={() => setRole('receive')}>Receive files</button>
              </div>
              {role === 'send' ? (
                <>
                  <FileUploader onFilesSelected={onFilesSelected} buttonText="Choose files" />
                  {files.length > 0 && <FileMetadata files={files.map((item) => item.meta)} totalBytes={totalBytes} />}
                  <button className="button buttonPrimary" disabled={!files.length} onClick={() => void createOfflineOffer()}>Create local offer</button>
                </>
              ) : (
                <>
                  <p>Enter the sender’s 6-digit code and paste the offer text. The short code alone cannot establish an offline connection.</p>
                  <label className="inputGroup">6-digit pairing code
                    <CodeInput value={enteredPairingCode} onChange={(digits) => setEnteredPairingCode(digits)} />
                  </label>
                  <textarea className="receivedTextArea" aria-label="Offline offer connection text" value={pairingText} onChange={(event) => setPairingText(event.target.value)} rows={5} />
                  <button className="button buttonPrimary" disabled={enteredPairingCode.length !== 6 || !pairingText.trim()} onClick={() => void acceptOffer(pairingText.trim())}>Accept offer</button>
                </>
              )}
            </>
          )}

          {step === 'offer' && role === 'send' && (
            <>
              <p className="codeDigits" aria-label={`Offline pairing code ${pairingCode}`}>{pairingCode.slice(0, 3)}-{pairingCode.slice(3)}</p>
              <p>Tell the receiver this 6-digit code, then copy and send the offer text below.</p>
              <button type="button" className="button buttonSecondary" onClick={() => void copyConnectionText(pairingCode)}>Copy 6-digit code</button>
              <textarea className="receivedTextArea" readOnly aria-label="Offline offer connection text" value={pairingText} rows={5} />
              <button type="button" className="button buttonSecondary" onClick={() => void copyConnectionText(pairingText)}>Copy offer text</button>
              <label className="inputGroup">Paste answer connection text
                <textarea className="receivedTextArea" value={remoteText} onChange={(event) => setRemoteText(event.target.value)} rows={3} />
              </label>
              <button className="button buttonPrimary" disabled={!remoteText.trim()} onClick={() => void acceptAnswer(remoteText.trim())}>Apply answer</button>
            </>
          )}

          {step === 'answer' && role === 'receive' && (
            <>
              <p className="codeDigits" aria-label={`Offline pairing code ${pairingCode}`}>{pairingCode.slice(0, 3)}-{pairingCode.slice(3)}</p>
              <p>Send this answer text to the sender. Confirm the 6-digit code matches.</p>
              <textarea className="receivedTextArea" readOnly aria-label="Offline answer connection text" value={pairingText} rows={5} />
              <button type="button" className="button buttonSecondary" onClick={() => void copyConnectionText(pairingText)}>Copy answer text</button>
              <p>Once both data channels open, the sender will begin the transfer.</p>
            </>
          )}

          {step === 'connected' && role === 'send' && <p>Receiver joined. Approve and start sending the selected files.</p>}
          {step === 'transferring' && (
            <TransferProgress
              direction={role === 'send' ? 'sending' : 'receiving'}
              progressPercentage={role === 'send'
                ? (totalBytes ? Math.min(100, (sentBytes / totalBytes) * 100) : 0)
                : (incomingBytes ? Math.min(100, (receivedBytes / incomingBytes) * 100) : 0)}
              currentBytes={role === 'send' ? sentBytes : receivedBytes}
              totalBytes={role === 'send' ? totalBytes : incomingBytes}
              speed={speed}
              eta={eta}
              currentFileName={activeFileName}
            />
          )}
          {step === 'connected' && role === 'send' && peerReady && (
            <button className="button buttonPrimary" onClick={() => {
              const control = controlRef.current;
              if (!control || !sendControl(control, { kind: 'transfer-approved', files: files.map((item) => item.meta) })) {
                setError('Could not send approved file list.');
              }
            }}>Approve &amp; Send</button>
          )}
          {step === 'completed' && <h2>Transfer complete</h2>}
          {step !== 'choose' && (
            <button className="button buttonGhost" onClick={reset}>End offline session</button>
          )}
          {role === 'receive' && incoming.length > 0 && <FileMetadata files={incoming} totalBytes={incomingBytes} />}
        </section>
      </div>
    </main>
  );
}
