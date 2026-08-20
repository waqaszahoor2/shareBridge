import type { Metadata } from 'next';
import SendFlow from '@/components/SendFlow';

export const metadata: Metadata = { title: 'Send Files' };

export default function SendPage() {
  return <SendFlow />;
}
