import type { Channel, SignalData } from "./protocol";

// Motor WebRTC com distribuição em cascata.
// Para cada transmissão (origem + canal) o servidor envia uma "route" a cada nó dizendo
// quem é o pai (de quem recebo) e quem são os filhos (para quem envio). Um relay repassa
// as tracks que recebe do pai para os filhos — sem SFU, só P2P.
// Só quem ENVIA mídia cria ofertas, então não há "glare" de negociação.

type Key = string;
const k = (origin: string, ch: Channel) => `${origin}:${ch}`;

interface Incoming {
  pc: RTCPeerConnection;
  from: string;
  stream: MediaStream;
  pendingIce: RTCIceCandidateInit[];
}
interface Outgoing {
  pc: RTCPeerConnection;
  origin: string;
  channel: Channel;
  child: string;
  pendingIce: RTCIceCandidateInit[];
}

export interface RemoteStream {
  origin: string;
  channel: Channel;
  stream: MediaStream;
  relayedBy: string | null; // null = direto da origem
}

export const BITRATES: Record<string, number> = {
  "720p30": 2_500_000,
  "1080p30": 4_500_000,
  "1080p60": 8_000_000,
  source: 12_000_000,
  camera: 1_500_000,
  mic: 64_000,
};

export class MediaEngine {
  selfId = "";
  iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  forceRelay = false;
  screenBitrate = BITRATES["1080p30"];

  readonly local = new Map<Channel, MediaStream>();
  private incoming = new Map<Key, Incoming>();
  private outgoing = new Map<string, Outgoing>(); // `${key}:${child}`
  private routes = new Map<Key, { parent: string | null; children: string[] }>();
  private watchdogs = new Map<Key, ReturnType<typeof setTimeout>>();

  constructor(
    private sendSignal: (to: string, data: SignalData) => void,
    private sendNack: (origin: string, channel: Channel) => void,
    private onChange: () => void,
  ) {}

  private config(): RTCConfiguration {
    return { iceServers: this.iceServers, iceTransportPolicy: this.forceRelay ? "relay" : "all" };
  }

  private streamFor(origin: string, ch: Channel): MediaStream | undefined {
    return origin === this.selfId ? this.local.get(ch) : this.incoming.get(k(origin, ch))?.stream;
  }

  remoteStreams(): RemoteStream[] {
    const out: RemoteStream[] = [];
    for (const [key, inc] of this.incoming) {
      if (!inc.stream.getTracks().length) continue;
      const [origin, channel] = key.split(":") as [string, Channel];
      out.push({ origin, channel, stream: inc.stream, relayedBy: inc.from === origin ? null : inc.from });
    }
    return out;
  }

  /** Quantos filhos eu estou servindo (para mostrar "você está retransmitindo"). */
  relayLoad() {
    let n = 0;
    for (const o of this.outgoing.values()) if (o.origin !== this.selfId) n++;
    return n;
  }

  // ---------- local ----------
  addLocal(ch: Channel, stream: MediaStream) {
    this.local.set(ch, stream);
    // Se já existem filhos (troca de fonte), substitui as tracks.
    for (const o of this.outgoing.values()) if (o.origin === this.selfId && o.channel === ch) this.syncTracks(o.pc, stream);
    this.onChange();
  }

  removeLocal(ch: Channel) {
    this.local.get(ch)?.getTracks().forEach((t) => t.stop());
    this.local.delete(ch);
    this.routeEnd(this.selfId, ch);
  }

  // ---------- rotas vindas do servidor ----------
  route(origin: string, ch: Channel, parent: string | null, children: string[]) {
    const key = k(origin, ch);
    const prev = this.routes.get(key);
    this.routes.set(key, { parent, children });

    if (origin !== this.selfId && prev?.parent && prev.parent !== parent) this.closeIncoming(key);

    for (const [okey, o] of this.outgoing)
      if (o.origin === origin && o.channel === ch && !children.includes(o.child)) this.closeOutgoing(okey);
    for (const child of children) if (!this.outgoing.has(`${key}:${child}`)) this.openOutgoing(origin, ch, child);

    if (origin !== this.selfId && parent) this.armWatchdog(origin, ch);
    this.onChange();
  }

  routeEnd(origin: string, ch: Channel) {
    const key = k(origin, ch);
    this.routes.delete(key);
    this.closeIncoming(key);
    for (const [okey, o] of this.outgoing) if (o.origin === origin && o.channel === ch) this.closeOutgoing(okey);
    clearTimeout(this.watchdogs.get(key));
    this.onChange();
  }

  /** Se em 12s o pai não entregou mídia, avisa o servidor para trocar de relay. */
  private armWatchdog(origin: string, ch: Channel) {
    const key = k(origin, ch);
    clearTimeout(this.watchdogs.get(key));
    this.watchdogs.set(
      key,
      setTimeout(() => {
        const inc = this.incoming.get(key);
        const live = inc?.stream.getTracks().some((t) => t.readyState === "live");
        if (!live && this.routes.has(key)) {
          this.sendNack(origin, ch);
          this.armWatchdog(origin, ch);
        }
      }, 12000),
    );
  }

  // ---------- envio (origem ou relay -> filho) ----------
  private openOutgoing(origin: string, ch: Channel, child: string) {
    const pc = new RTCPeerConnection(this.config());
    const o: Outgoing = { pc, origin, channel: ch, child, pendingIce: [] };
    const okey = `${k(origin, ch)}:${child}`;
    this.outgoing.set(okey, o);
    const sig = (d: Omit<SignalData, "origin" | "channel" | "role">) =>
      this.sendSignal(child, { origin, channel: ch, role: "sender", ...d });

    pc.onicecandidate = (e) => e.candidate && sig({ kind: "ice", candidate: e.candidate.toJSON() });
    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sig({ kind: "offer", sdp: pc.localDescription!.sdp });
        this.applyBitrate(pc, ch);
      } catch (e) {
        console.warn("offer falhou", e);
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") pc.restartIce();
    };
    const stream = this.streamFor(origin, ch);
    if (stream) this.syncTracks(pc, stream);
  }

  /** Garante que o pc envia exatamente as tracks atuais do stream (add/replace por tipo). */
  private syncTracks(pc: RTCPeerConnection, stream: MediaStream) {
    if (pc.signalingState === "closed") return;
    for (const track of stream.getTracks()) {
      // receiver.track.kind sempre reflete o tipo de mídia do transceiver
      const tr = pc.getTransceivers().find((t) => t.receiver.track.kind === track.kind);
      if (tr) {
        if (tr.sender.track !== track) tr.sender.replaceTrack(track).catch(() => {});
      } else {
        pc.addTransceiver(track, { direction: "sendonly", streams: [stream] });
      }
    }
  }

  private applyBitrate(pc: RTCPeerConnection, ch: Channel) {
    const max = ch === "camera" ? BITRATES.camera : ch === "mic" ? BITRATES.mic : this.screenBitrate;
    for (const s of pc.getSenders()) {
      if (!s.track) continue;
      const p = s.getParameters();
      if (!p.encodings?.length) continue;
      if (s.track.kind === "video" || ch === "mic") {
        p.encodings[0].maxBitrate = max;
        if (s.track.kind === "video") (p as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference =
          ch === "camera" ? "balanced" : "maintain-resolution";
        s.setParameters(p).catch(() => {});
      }
    }
  }

  setScreenBitrate(bps: number) {
    this.screenBitrate = bps;
    for (const o of this.outgoing.values()) if (o.channel === "screen" || o.channel === "file") this.applyBitrate(o.pc, o.channel);
  }

  private closeOutgoing(okey: string) {
    this.outgoing.get(okey)?.pc.close();
    this.outgoing.delete(okey);
  }

  // ---------- recepção ----------
  private ensureIncoming(origin: string, ch: Channel, from: string): Incoming {
    const key = k(origin, ch);
    const cur = this.incoming.get(key);
    if (cur && cur.from === from && cur.pc.connectionState !== "closed") return cur;
    if (cur) this.closeIncoming(key);

    const pc = new RTCPeerConnection(this.config());
    const inc: Incoming = { pc, from, stream: new MediaStream(), pendingIce: [] };
    this.incoming.set(key, inc);
    pc.onicecandidate = (e) =>
      e.candidate && this.sendSignal(from, { origin, channel: ch, role: "receiver", kind: "ice", candidate: e.candidate.toJSON() });
    pc.ontrack = (e) => {
      // Troca a track do mesmo tipo (renegociação) e cria um MediaStream novo para o React notar.
      const old = inc.stream.getTracks().filter((t) => t.kind === e.track.kind);
      inc.stream = new MediaStream([...inc.stream.getTracks().filter((t) => !old.includes(t)), e.track]);
      // Repassa para meus filhos (sou relay desta transmissão)
      for (const o of this.outgoing.values()) if (o.origin === origin && o.channel === ch) this.syncTracks(o.pc, inc.stream);
      e.track.onunmute = () => this.onChange();
      this.onChange();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") this.sendNack(origin, ch);
      this.onChange();
    };
    return inc;
  }

  private closeIncoming(key: Key) {
    const inc = this.incoming.get(key);
    if (!inc) return;
    inc.pc.close();
    this.incoming.delete(key);
  }

  // ---------- sinalização ----------
  async signal(from: string, d: SignalData) {
    try {
      if (d.kind === "offer") {
        const inc = this.ensureIncoming(d.origin, d.channel, from);
        await inc.pc.setRemoteDescription({ type: "offer", sdp: d.sdp });
        for (const c of inc.pendingIce.splice(0)) await inc.pc.addIceCandidate(c).catch(() => {});
        const answer = await inc.pc.createAnswer();
        await inc.pc.setLocalDescription(answer);
        this.sendSignal(from, { origin: d.origin, channel: d.channel, role: "receiver", kind: "answer", sdp: inc.pc.localDescription!.sdp });
      } else if (d.kind === "answer") {
        const o = this.outgoing.get(`${k(d.origin, d.channel)}:${from}`);
        if (!o || o.pc.signalingState !== "have-local-offer") return;
        await o.pc.setRemoteDescription({ type: "answer", sdp: d.sdp });
        for (const c of o.pendingIce.splice(0)) await o.pc.addIceCandidate(c).catch(() => {});
      } else if (d.kind === "ice") {
        const cand = d.candidate as RTCIceCandidateInit;
        const target =
          d.role === "sender" ? this.incoming.get(k(d.origin, d.channel)) : this.outgoing.get(`${k(d.origin, d.channel)}:${from}`);
        if (!target) return;
        if (target.pc.remoteDescription) await target.pc.addIceCandidate(cand).catch(() => {});
        else target.pendingIce.push(cand);
      }
    } catch (e) {
      console.warn("erro de sinalização", d.kind, e);
    }
  }

  /** Reconexão do WebSocket: os ids mudam, então tudo que é remoto é descartado. */
  resetRemote() {
    for (const key of [...this.incoming.keys()]) this.closeIncoming(key);
    for (const okey of [...this.outgoing.keys()]) this.closeOutgoing(okey);
    for (const t of this.watchdogs.values()) clearTimeout(t);
    this.routes.clear();
    this.onChange();
  }

  destroy() {
    this.resetRemote();
    for (const ch of [...this.local.keys()]) this.removeLocal(ch);
  }
}
