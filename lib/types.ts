export type PeerRole = 'sender' | 'receiver';

export type SignalType = 'offer' | 'answer' | 'ice';

export type SignalMessage = {
  id: string;
  seq: number;
  type: SignalType;
  payload: unknown;
  sentAt: number;
};

export type FileMeta = {
  id: string;
  name: string;
  size: number;
  type: string;
  extension: string;
};

export type TransferState =
  | 'idle'
  | 'selecting'
  | 'creating-session'
  | 'waiting-for-receiver'
  | 'joining'
  | 'connecting'
  | 'waiting-for-sender-approval'
  | 'preparing-storage'
  | 'transferring'
  | 'completed'
  | 'declined'
  | 'cancelled'
  | 'expired'
  | 'failed';

export type ControlMessage =
  | { kind: 'receiver-ready'; receiverId: string }
  | { kind: 'transfer-approved'; sessionId: string; files: FileMeta[] }
  | { kind: 'manifest'; sessionId: string; files: FileMeta[] }
  | { kind: 'manifest-ready' }
  | { kind: 'file-start'; file: FileMeta; chunkSize: number }
  | { kind: 'chunk-ack'; fileId: string; receivedBytes: number }
  | { kind: 'file-end'; fileId: string }
  | { kind: 'file-saved'; fileId: string }
  | { kind: 'all-complete' }
  | { kind: 'cancel'; reason?: string }
  | { kind: 'decline' }
  | { kind: 'error'; message: string };

