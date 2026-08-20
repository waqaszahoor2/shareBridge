/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';
    // WebRTC ICE/STUN/TURN requires broad connect-src; data channel is not HTTP so
    // it isn't controlled by CSP, but the signaling fetch calls and STUN checks are.
    const connectSrc = isDev
      ? "connect-src 'self' ws: wss: stun: turn:"
      : "connect-src 'self' stun: turn: https:";
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      connectSrc,
      "worker-src 'self' blob:",
      "media-src 'self' blob:",
      isDev ? '' : 'upgrade-insecure-requests'
    ].filter(Boolean).join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' }
        ]
      }
    ];
  }
};

export default nextConfig;
