import { access, readFile } from 'node:fs/promises';

const required = [
  'package.json', 'next.config.mjs', 'vercel.json', 'app/layout.tsx', 'app/page.tsx',
  'app/send/page.tsx', 'app/receive/page.tsx', 'app/api/session/create/route.ts',
  'app/api/session/join/route.ts', 'app/api/signal/route.ts', 'app/api/health/route.ts',
  'components/SendFlow.tsx', 'components/ReceiveFlow.tsx', 'components/FileDropzone.tsx',
  'components/FileUploader.tsx', 'components/FilePreview.tsx', 'components/FileMetadata.tsx',
  'components/CreateTransferButton.tsx', 'components/TransferCode.tsx', 'components/ReceiverJoin.tsx',
  'components/CodeInput.tsx', 'components/ConnectionStatus.tsx', 'components/TransferProgress.tsx',
  'components/ErrorMessage.tsx', 'components/ToastNotification.tsx', 'lib/codeUtils.ts',
  'lib/webrtc/peerConnection.ts', 'lib/webrtc/signaling.ts', 'lib/webrtc/dataChannel.ts',
  'lib/webrtc/sender.ts', 'lib/webrtc/receiver.ts', 'lib/webrtc/chunkTransfer.ts',
  'lib/server/security.ts', 'lib/server/store.ts'
];

for (const file of required) await access(file);

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (!pkg.dependencies?.next || !pkg.dependencies?.react || !pkg.dependencies?.['react-dom']) {
  throw new Error('Next.js/React dependencies are incomplete.');
}

const env = await readFile('.env.example', 'utf8');
if (/UPSTASH_REDIS_REST_TOKEN=\S{12,}/.test(env)) throw new Error('A real Redis token appears to be committed.');

const config = await readFile('next.config.mjs', 'utf8');
for (const header of ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']) {
  if (!config.includes(header)) throw new Error(`Missing security header: ${header}`);
}

const signal = await readFile('app/api/signal/route.ts', 'utf8');
for (const check of ['isSameOrigin', 'enforceRateLimit', 'safeSecretEquals', '100_000']) {
  if (!signal.includes(check)) throw new Error(`Signaling security check missing: ${check}`);
}

console.log('PeerBridge project validation: PASS');
console.log(`Next.js ${pkg.dependencies.next} / React ${pkg.dependencies.react}`);
console.log(`${required.length} required project files verified.`);
