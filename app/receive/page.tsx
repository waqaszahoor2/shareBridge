import type { Metadata } from 'next';
import ReceiveFlow from '@/components/ReceiveFlow';

export const metadata: Metadata = { title: 'Receive Files' };

export default function ReceivePage() {
  return <ReceiveFlow />;
}
