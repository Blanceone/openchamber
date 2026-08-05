// Static fallback capabilities for CLI status/discovery. Local-desktop builds
// do not load tunnel provider implementations at runtime.

export const TUNNEL_PROVIDER_CLOUDFLARE = 'cloudflare';
export const TUNNEL_PROVIDER_NGROK = 'ngrok';

const DEFAULT_TUNNEL_PROVIDER_CAPABILITIES = [
  {
    provider: TUNNEL_PROVIDER_CLOUDFLARE,
    label: 'Cloudflare',
    modes: ['quick', 'managed-local', 'managed-remote'],
  },
  {
    provider: TUNNEL_PROVIDER_NGROK,
    label: 'ngrok',
    modes: ['quick'],
  },
];

export { DEFAULT_TUNNEL_PROVIDER_CAPABILITIES };
