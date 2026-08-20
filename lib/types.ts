export type PeerRole = 'sender' | 'receiver';

export type SignalType = 'offer' | 'answer' | 'ice';

export type SignalMessage = {
  id: string;
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
  | 'preparing'
  | 'waiting'
  | 'connecting'
  | 'approval'
  | 'transferring'
  | 'completed'
  | 'declined'
  | 'failed';
