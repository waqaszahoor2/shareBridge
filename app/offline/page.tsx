import type { Metadata } from 'next';
import OfflineTransferFlow from '@/components/OfflineTransferFlow';

export const metadata: Metadata = { title: 'Offline Hotspot Transfer' };

export default function OfflinePage() {
  return <OfflineTransferFlow />;
}
