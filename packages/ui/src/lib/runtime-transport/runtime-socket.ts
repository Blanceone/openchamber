import { wrapBrowserWebSocket, type RuntimeWebSocket } from './browser-websocket';

/**
 * Opens a runtime WebSocket for desktop/local transport.
 * Private-relay tunneling is disabled in this product; always use a native socket.
 */
export const openRuntimeWebSocket = (url: string, protocols?: string[]): RuntimeWebSocket =>
  wrapBrowserWebSocket(protocols ? new WebSocket(url, protocols) : new WebSocket(url));
