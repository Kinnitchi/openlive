import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { buildTree, sameNode, type Node } from "./tree.js";
import {
  CHANNELS,
  type Channel,
  type ChatMessage,
  type ControlMode,
  type FileState,
  type PeerInfo,
  type ServerMsg,
} from "./protocol.js";

export interface Client {
  ws: WebSocket;
  id: string;
  clientId: string;
  ip: string;
  room?: Room;
  info?: PeerInfo;
  alive: boolean;
  lastChatAt: number[];
}

const COLORS = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#2dd4bf", "#60a5fa", "#a78bfa", "#f472b6"];

// Capacidade da árvore por canal: áudio é leve, vídeo pesa no upload de quem transmite.
const CAPS: Record<Channel, { root: number; relay: number }> = {
  mic: { root: 12, relay: 4 },
  camera: { root: Number(process.env.CAMERA_ROOT_CAP ?? 6), relay: Number(process.env.CAMERA_RELAY_CAP ?? 3) },
  screen: { root: Number(process.env.ROOT_CAP ?? 4), relay: Number(process.env.RELAY_CAP ?? 3) },
  file: { root: Number(process.env.ROOT_CAP ?? 4), relay: Number(process.env.RELAY_CAP ?? 3) },
};

export const MAX_MEMBERS = Number(process.env.MAX_MEMBERS ?? 50);

export class Room {
  readonly members = new Map<string, Client>();
  readonly chat: ChatMessage[] = [];
  readonly bans = new Set<string>(); // clientIds
  readonly trees = new Map<string, Map<string, Node>>(); // `${origin}:${channel}`
  readonly nacks = new Map<string, Set<string>>(); // relays que falharam por árvore
  readonly fileStates = new Map<string, FileState>();
  ownerId: string | null = null;
  ownerClientId: string | null = null;
  controlMode: ControlMode = "everyone";
  readonly createdAt = Date.now();

  constructor(readonly name: string) {}

  get isPrivate() {
    return this.name.startsWith("priv-");
  }

  send(c: Client, msg: ServerMsg) {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
  }

  broadcast(msg: ServerMsg, except?: string) {
    const raw = JSON.stringify(msg);
    for (const m of this.members.values()) if (m.id !== except && m.ws.readyState === m.ws.OPEN) m.ws.send(raw);
  }

  add(c: Client, name: string) {
    const info: PeerInfo = {
      id: c.id,
      name,
      color: COLORS[this.members.size % COLORS.length],
      joinedAt: Date.now(),
      sharing: { screen: false, camera: false, mic: false, file: false },
      typing: false,
    };
    c.info = info;
    c.room = this;
    // O criador da sala (mesmo clientId) recupera a posse ao reconectar.
    if (!this.ownerId || this.ownerClientId === c.clientId) {
      this.ownerId = c.id;
      this.ownerClientId = c.clientId;
    }
    this.members.set(c.id, c);
    this.send(c, {
      type: "welcome",
      selfId: c.id,
      room: this.name,
      isPrivate: this.isPrivate,
      ownerId: this.ownerId,
      controlMode: this.controlMode,
      peers: [...this.members.values()].map((m) => m.info!),
      chat: this.chat.slice(-100),
    });
    for (const fs of this.fileStates.values()) this.send(c, { type: "file-state", state: fs });
    this.broadcast({ type: "peer-joined", peer: info }, c.id);
    this.broadcast({ type: "owner", id: this.ownerId }, c.id);
    this.system(`${name} entrou`);
    this.rebuildAll();
  }

  remove(c: Client) {
    if (!this.members.delete(c.id)) return;
    this.broadcast({ type: "peer-left", id: c.id });
    for (const ch of CHANNELS) this.endTree(c.id, ch);
    this.fileStates.delete(c.id);
    if (this.ownerId === c.id) {
      // Passa a posse para o membro mais antigo, mas o criador recupera ao voltar.
      const next = [...this.members.values()].sort((a, b) => a.info!.joinedAt - b.info!.joinedAt)[0];
      this.ownerId = next?.id ?? null;
      if (next) this.broadcast({ type: "owner", id: next.id });
    }
    if (c.info) this.system(`${c.info.name} saiu`);
    this.rebuildAll();
  }

  system(text: string) {
    this.pushChat({ id: randomUUID(), from: "system", name: "", color: "", kind: "system", text, at: Date.now() });
  }

  pushChat(msg: ChatMessage) {
    this.chat.push(msg);
    if (this.chat.length > 200) this.chat.splice(0, this.chat.length - 200);
    this.broadcast({ type: "chat", msg });
  }

  updatePeer(c: Client) {
    this.broadcast({ type: "peer-update", peer: c.info! });
  }

  // ---------- árvores de mídia ----------
  private key(origin: string, ch: Channel) {
    return `${origin}:${ch}`;
  }

  endTree(origin: string, ch: Channel) {
    const k = this.key(origin, ch);
    if (!this.trees.has(k)) return;
    this.trees.delete(k);
    this.nacks.delete(k);
    this.broadcast({ type: "route-end", origin, channel: ch });
  }

  rebuildTree(origin: string, ch: Channel) {
    const k = this.key(origin, ch);
    const viewers = [...this.members.values()]
      .filter((m) => m.id !== origin)
      .sort((a, b) => a.info!.joinedAt - b.info!.joinedAt)
      .map((m) => m.id);
    const prev = this.trees.get(k);
    const next = buildTree(origin, viewers, CAPS[ch].root, CAPS[ch].relay, prev, this.nacks.get(k));
    this.trees.set(k, next);
    for (const [id, node] of next) {
      if (sameNode(prev?.get(id), node)) continue;
      const m = this.members.get(id);
      if (m) this.send(m, { type: "route", origin, channel: ch, parent: node.parent, children: node.children });
    }
  }

  rebuildAll() {
    for (const m of this.members.values())
      for (const ch of CHANNELS) if (m.info!.sharing[ch]) this.rebuildTree(m.id, ch);
  }

  // Um viewer reclamou que o relay pai dele não entrega mídia: tira o pai da função de relay.
  nack(from: string, origin: string, ch: Channel) {
    const k = this.key(origin, ch);
    const tree = this.trees.get(k);
    const parent = tree?.get(from)?.parent;
    if (!tree || !parent || parent === origin) return;
    if (!this.nacks.has(k)) this.nacks.set(k, new Set());
    this.nacks.get(k)!.add(parent);
    this.rebuildTree(origin, ch);
  }
}
