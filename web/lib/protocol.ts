// Protocolo de sinalização (espelhado em web/lib/protocol.ts — mantenha os dois em sincronia).
// Mensagens JSON sobre um único WebSocket em /ws, discriminadas pelo campo `type`.

export type Channel = "screen" | "camera" | "mic" | "file";
export const CHANNELS: Channel[] = ["screen", "camera", "mic", "file"];

export interface PeerInfo {
  id: string;
  name: string;
  color: string;
  joinedAt: number;
  sharing: Record<Channel, boolean>;
  typing: boolean;
}

export interface ChatMessage {
  id: string;
  from: string;
  name: string;
  color: string;
  kind: "text" | "gif" | "system";
  text: string;
  replyTo?: string;
  at: number;
}

export interface FileState {
  origin: string;
  paused: boolean;
  time: number;
  duration: number;
  title: string;
}

export type FileAction = "toggle" | "seek" | "playAt";
export type ControlMode = "everyone" | "owner";

// ---------- cliente -> servidor ----------
export type ClientMsg =
  | { type: "join"; room: string; name: string; clientId: string }
  | { type: "leave" }
  | { type: "set-name"; name: string }
  | { type: "chat"; text: string; kind?: "text" | "gif"; replyTo?: string }
  | { type: "typing"; typing: boolean }
  | { type: "reaction"; emoji: string }
  | { type: "sharing"; channel: Channel; active: boolean }
  | { type: "signal"; to: string; data: SignalData }
  | { type: "file-state"; state: Omit<FileState, "origin"> }
  | { type: "file-control"; to: string; action: FileAction; time?: number }
  | { type: "control-mode"; mode: ControlMode }
  | { type: "room-kick"; target: string }
  | { type: "room-silence"; target: string }
  | { type: "relay-nack"; origin: string; channel: Channel }
  | { type: "ping"; t: number };

// ---------- servidor -> cliente ----------
export type ServerMsg =
  | {
      type: "welcome";
      selfId: string;
      room: string;
      isPrivate: boolean;
      ownerId: string;
      controlMode: ControlMode;
      peers: PeerInfo[];
      chat: ChatMessage[];
    }
  | { type: "peer-joined"; peer: PeerInfo }
  | { type: "peer-left"; id: string }
  | { type: "peer-update"; peer: PeerInfo }
  | { type: "owner"; id: string }
  | { type: "control-mode"; mode: ControlMode }
  | { type: "chat"; msg: ChatMessage }
  | { type: "reaction"; from: string; emoji: string }
  | { type: "signal"; from: string; data: SignalData }
  | { type: "route"; origin: string; channel: Channel; parent: string | null; children: string[] }
  | { type: "route-end"; origin: string; channel: Channel }
  | { type: "file-state"; state: FileState }
  | { type: "file-control"; from: string; action: FileAction; time?: number }
  | { type: "silenced" }
  | { type: "kicked"; reason: string }
  | { type: "error"; message: string }
  | { type: "pong"; t: number; server: number };

// Payload opaco repassado pelo servidor entre peers.
// role = papel de QUEM ENVIA no par (sender = quem transmite a mídia, receiver = quem recebe)
export interface SignalData {
  origin: string;
  channel: Channel;
  role: "sender" | "receiver";
  kind: "offer" | "answer" | "ice";
  sdp?: string;
  candidate?: unknown;
}
