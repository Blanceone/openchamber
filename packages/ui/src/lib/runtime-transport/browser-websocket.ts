export interface RuntimeSocketMessageEvent {
  data: string | ArrayBuffer;
}

export interface RuntimeSocketCloseEvent {
  code: number;
  reason: string;
}

/** Unified socket shape for event-pipeline / terminal / dictation consumers. */
export interface RuntimeWebSocket {
  readonly readyState: number;
  binaryType?: 'blob' | 'arraybuffer';
  onopen: (() => void) | null;
  onmessage: ((event: RuntimeSocketMessageEvent) => void) | null;
  onerror: (() => void) | null;
  onclose: ((event: RuntimeSocketCloseEvent) => void) | null;
  send(data: string | ArrayBuffer | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
}

/** @deprecated Alias kept for call sites that still use the relay-era name. */
export type RelayTunnelWebSocket = RuntimeWebSocket;
export type RelayTunnelSocketMessageEvent = RuntimeSocketMessageEvent;
export type RelayTunnelSocketCloseEvent = RuntimeSocketCloseEvent;

export const wrapBrowserWebSocket = (ws: WebSocket): RuntimeWebSocket => {
  const socket: RuntimeWebSocket = {
    get readyState() {
      return ws.readyState;
    },
    get binaryType() {
      return ws.binaryType;
    },
    set binaryType(value) {
      if (value) ws.binaryType = value;
    },
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send(data) {
      ws.send(data);
    },
    close(code, reason) {
      ws.close(code, reason);
    },
  };
  ws.onopen = () => socket.onopen?.();
  ws.onmessage = (event) => {
    const data: unknown = event.data;
    if (typeof data === 'string' || data instanceof ArrayBuffer) {
      socket.onmessage?.({ data });
    }
  };
  ws.onerror = () => socket.onerror?.();
  ws.onclose = (event) => socket.onclose?.({ code: event.code, reason: event.reason });
  return socket;
};
