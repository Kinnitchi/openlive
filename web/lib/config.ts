// Mesmo truque do original: se a URL configurada aponta para localhost mas o app foi
// aberto por outro host (ex.: IP da rede local), troca o hostname para o da página.
export function signalingUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SIGNALING_URL ?? "ws://localhost:8787/ws";
  if (typeof window === "undefined") return configured;
  try {
    const u = new URL(configured);
    const local = (h: string) => h === "localhost" || h === "127.0.0.1";
    if (local(u.hostname) && !local(window.location.hostname)) u.hostname = window.location.hostname;
    if (window.location.protocol === "https:" && u.protocol === "ws:") u.protocol = "wss:";
    return u.toString();
  } catch {
    return configured;
  }
}

export function httpBase(): string {
  return signalingUrl().replace(/^ws/, "http").replace(/\/ws\/?$/, "");
}

export const PRIVATE_PREFIX = "priv-";

export function makePrivateRoomName(label: string) {
  const slug = label.normalize("NFD").replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "sala";
  const n = Math.floor(100000 + Math.random() * 900000);
  return `${PRIVATE_PREFIX}${slug}-${n}`;
}

export function roomLabel(room: string) {
  return room.startsWith(PRIVATE_PREFIX) ? room.slice(PRIVATE_PREFIX.length).replace(/-\d+$/, "") : room;
}
