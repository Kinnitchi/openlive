import http from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import { MAX_MEMBERS, Room, type Client } from "./room.js";
import { CHANNELS, type ClientMsg } from "./protocol.js";

const PORT = Number(process.env.PORT ?? 8787);
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const ROOM_RE = /^[a-zA-Z0-9_-]{2,64}$/;

const rooms = new Map<string, Room>();
const clients = new Set<Client>();

// ---------- ICE / TURN ----------
// Se TURN_SECRET estiver definido, gera credenciais temporárias no padrão "TURN REST API"
// (coturn: use-auth-secret / static-auth-secret). Senão, usa usuário/senha fixos.
function iceServers() {
  const list: RTCIceServerLike[] = [{ urls: (process.env.STUN_URLS ?? "stun:stun.l.google.com:19302").split(",") }];
  const turn = process.env.TURN_URLS?.split(",").filter(Boolean);
  if (turn?.length) {
    if (process.env.TURN_SECRET) {
      const ttl = Number(process.env.TURN_TTL ?? 6 * 3600);
      const username = `${Math.floor(Date.now() / 1000) + ttl}:openlive`;
      const credential = createHmac("sha1", process.env.TURN_SECRET).update(username).digest("base64");
      list.push({ urls: turn, username, credential });
    } else {
      list.push({ urls: turn, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
    }
  }
  return list;
}
interface RTCIceServerLike {
  urls: string[];
  username?: string;
  credential?: string;
}

// ---------- HTTP ----------
function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (req.method === "OPTIONS") return json(res, 204, null);
  switch (url.pathname) {
    case "/ice-servers":
      return json(res, 200, { iceServers: iceServers() });
    case "/stats":
      return json(res, 200, { online: clients.size, rooms: rooms.size });
    case "/rooms":
      return json(res, 200, {
        rooms: [...rooms.values()]
          .filter((r) => !r.isPrivate)
          .map((r) => ({
            name: r.name,
            members: r.members.size,
            live: [...r.members.values()].some((m) => m.info?.sharing.screen || m.info?.sharing.camera || m.info?.sharing.file),
          }))
          .sort((a, b) => b.members - a.members),
      });
    case "/health":
      return json(res, 200, { ok: true });
    default:
      return json(res, 404, { error: "not found" });
  }
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 256 * 1024 });

wss.on("connection", (ws, req) => {
  if (ORIGINS.length && !ORIGINS.includes(req.headers.origin ?? "")) return ws.close(1008, "origin");
  const c: Client = {
    ws,
    id: randomUUID().slice(0, 8),
    clientId: "",
    ip: (req.headers["x-forwarded-for"] as string)?.split(",")[0] ?? req.socket.remoteAddress ?? "",
    alive: true,
    lastChatAt: [],
  };
  clients.add(c);
  ws.on("pong", () => (c.alive = true));
  ws.on("message", (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    try {
      handle(c, msg);
    } catch (e) {
      console.error("handler error", e);
    }
  });
  ws.on("close", () => {
    clients.delete(c);
    leave(c);
  });
});

function leave(c: Client) {
  const room = c.room;
  if (!room) return;
  room.remove(c);
  c.room = undefined;
  if (room.members.size === 0) rooms.delete(room.name);
}

const clean = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);

function handle(c: Client, msg: ClientMsg) {
  const send = (m: Parameters<Room["send"]>[1]) => c.ws.readyState === c.ws.OPEN && c.ws.send(JSON.stringify(m));

  if (msg.type === "ping") return send({ type: "pong", t: msg.t, server: Date.now() });

  if (msg.type === "join") {
    if (c.room) leave(c);
    const roomName = clean(msg.room, 64);
    if (!ROOM_RE.test(roomName)) return send({ type: "error", message: "Nome de sala inválido" });
    c.clientId = clean(msg.clientId, 64) || randomUUID();
    let room = rooms.get(roomName);
    if (!room) rooms.set(roomName, (room = new Room(roomName)));
    if (room.bans.has(c.clientId)) return send({ type: "kicked", reason: "Você foi banido desta sala" });
    if (room.members.size >= MAX_MEMBERS) return send({ type: "error", message: "Sala cheia" });
    room.add(c, clean(msg.name, 32) || "Convidado");
    return;
  }

  const room = c.room;
  const me = c.info;
  if (!room || !me) return;
  const isOwner = room.ownerId === c.id;

  switch (msg.type) {
    case "leave":
      return leave(c);

    case "set-name":
      me.name = clean(msg.name, 32) || me.name;
      return room.updatePeer(c);

    case "chat": {
      // rate limit simples: 5 mensagens / 5s
      const now = Date.now();
      c.lastChatAt = c.lastChatAt.filter((t) => now - t < 5000);
      if (c.lastChatAt.length >= 5) return send({ type: "error", message: "Calma! Você está enviando mensagens rápido demais." });
      c.lastChatAt.push(now);
      const kind = msg.kind === "gif" ? "gif" : "text";
      const text = clean(msg.text, kind === "gif" ? 512 : 1000);
      if (!text) return;
      if (kind === "gif" && !/^https:\/\//.test(text)) return;
      if (me.typing) {
        me.typing = false;
        room.updatePeer(c);
      }
      return room.pushChat({
        id: randomUUID(),
        from: c.id,
        name: me.name,
        color: me.color,
        kind,
        text,
        replyTo: msg.replyTo ? clean(msg.replyTo, 64) : undefined,
        at: now,
      });
    }

    case "typing":
      if (me.typing === !!msg.typing) return;
      me.typing = !!msg.typing;
      return room.updatePeer(c);

    case "reaction": {
      const emoji = clean(msg.emoji, 16);
      if (emoji) room.broadcast({ type: "reaction", from: c.id, emoji });
      return;
    }

    case "sharing": {
      if (!CHANNELS.includes(msg.channel)) return;
      const active = !!msg.active;
      if (me.sharing[msg.channel] === active) return;
      me.sharing[msg.channel] = active;
      room.updatePeer(c);
      if (active) room.rebuildTree(c.id, msg.channel);
      else {
        room.endTree(c.id, msg.channel);
        if (msg.channel === "file") room.fileStates.delete(c.id);
      }
      return;
    }

    case "signal": {
      const target = room.members.get(msg.to);
      if (!target || !msg.data || !CHANNELS.includes(msg.data.channel)) return;
      return room.send(target, { type: "signal", from: c.id, data: msg.data });
    }

    case "relay-nack":
      if (CHANNELS.includes(msg.channel)) room.nack(c.id, msg.origin, msg.channel);
      return;

    case "file-state": {
      if (!me.sharing.file) return;
      const s = msg.state;
      const state = {
        origin: c.id,
        paused: !!s.paused,
        time: Number(s.time) || 0,
        duration: Number(s.duration) || 0,
        title: clean(s.title, 120),
      };
      room.fileStates.set(c.id, state);
      return room.broadcast({ type: "file-state", state }, c.id);
    }

    case "file-control": {
      const target = room.members.get(msg.to);
      if (!target?.info?.sharing.file) return;
      if (room.controlMode === "owner" && !isOwner && target.id !== c.id) return send({ type: "error", message: "Só o dono da sala controla o vídeo" });
      if (!["toggle", "seek", "playAt"].includes(msg.action)) return;
      return room.send(target, { type: "file-control", from: c.id, action: msg.action, time: Number(msg.time) || 0 });
    }

    case "control-mode":
      if (!isOwner) return;
      room.controlMode = msg.mode === "owner" ? "owner" : "everyone";
      return room.broadcast({ type: "control-mode", mode: room.controlMode });

    case "room-silence": {
      const t = room.members.get(msg.target);
      if (isOwner && t) room.send(t, { type: "silenced" });
      return;
    }

    case "room-kick": {
      const t = room.members.get(msg.target);
      if (!isOwner || !t || t.id === c.id) return;
      room.bans.add(t.clientId);
      room.send(t, { type: "kicked", reason: "Você foi removido da sala pelo dono" });
      leave(t);
      return;
    }
  }
}

// Heartbeat: derruba conexões mortas (o close dispara a limpeza da sala).
setInterval(() => {
  for (const c of clients) {
    if (!c.alive) {
      c.ws.terminate();
      continue;
    }
    c.alive = false;
    c.ws.ping();
  }
}, 15000);

server.listen(PORT, () => console.log(`[openlive] sinalização em http://localhost:${PORT} (ws em /ws)`));
