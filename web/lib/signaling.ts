import type { ClientMsg, ServerMsg } from "./protocol";

type Listener = (msg: ServerMsg) => void;
export type ConnState = "connecting" | "open" | "closed";

// WebSocket com reconexão exponencial e fila de mensagens enquanto conecta.
export class SignalingClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private stateListeners = new Set<(s: ConnState) => void>();
  private queue: string[] = [];
  private attempts = 0;
  private closedByUser = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  rtt = 0;
  state: ConnState = "closed";

  constructor(private url: string, private onOpen: () => void) {}

  connect() {
    this.closedByUser = false;
    this.setState("connecting");
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      this.setState("open");
      this.onOpen();
      for (const m of this.queue.splice(0)) ws.send(m);
      this.pingTimer = setInterval(() => this.send({ type: "ping", t: performance.now() }), 10000);
    };
    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === "pong") this.rtt = Math.round(performance.now() - msg.t);
      for (const l of this.listeners) l(msg);
    };
    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.setState("closed");
      if (this.closedByUser) return;
      const delay = Math.min(1000 * 2 ** this.attempts++, 15000);
      setTimeout(() => !this.closedByUser && this.connect(), delay);
    };
  }

  close() {
    this.closedByUser = true;
    this.ws?.close();
  }

  send(msg: ClientMsg) {
    const raw = JSON.stringify(msg);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(raw);
    else if (msg.type !== "ping" && msg.type !== "signal") this.queue.push(raw);
  }

  on(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  onState(l: (s: ConnState) => void) {
    this.stateListeners.add(l);
    return () => this.stateListeners.delete(l);
  }
  private setState(s: ConnState) {
    this.state = s;
    for (const l of this.stateListeners) l(s);
  }
}
