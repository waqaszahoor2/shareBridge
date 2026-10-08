import type { Metadata } from 'next';
import TransferHistory from '@/components/TransferHistory';

export const metadata: Metadata = { title: 'Transfer History' };

export default function HistoryPage() {
  return <TransferHistory />;
}
