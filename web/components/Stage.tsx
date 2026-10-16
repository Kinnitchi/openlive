"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomApi } from "@/hooks/useRoom";
import type { Channel } from "@/lib/protocol";
import { MaximizeIcon, PauseIcon, PlayIcon, RelayIcon } from "./icons";

interface Tile {
  id: string;
  origin: string;
  channel: Exclude<Channel, "mic">;
  stream: MediaStream | null;
  local: boolean;
  relayedBy: string | null;
}

const LABEL: Record<string, string> = { screen: "Tela", camera: "Câmera", file: "Arquivo" };

function fmt(s: number) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function VideoEl({ stream, muted, fit }: { stream: MediaStream | null; muted: boolean; fit: "contain" | "cover" }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    v.play().catch(() => {
      // autoplay com áudio bloqueado: toca mudo até o usuário interagir
      v.muted = true;
      v.play().catch(() => {});
    });
  }, [stream]);
  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={`h-full w-full bg-black ${fit === "cover" ? "object-cover" : "object-contain"}`} />;
}

/** O <video> real do arquivo do próprio usuário é montado aqui (com controles nativos). */
function OwnFileEl({ el }: { el: HTMLVideoElement | null }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (el && box.current && el.parentElement !== box.current) box.current.appendChild(el);
  }, [el]);
  return <div ref={box} className="h-full w-full" />;
}

function RemoteFileControls({ api, origin }: { api: RoomApi; origin: string }) {
  const st = api.fileStates.get(origin);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const [recv, setRecv] = useState({ at: Date.now(), st });
  useEffect(() => setRecv({ at: Date.now(), st }), [st]);
  if (!st) return null;
  const canControl = api.controlMode === "everyone" || api.ownerId === api.selfId;
  // extrapola o tempo entre os relatórios (enviados a cada 2s)
  const time = Math.min(st.duration, st.time + (st.paused ? 0 : (now - recv.at) / 1000));
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/90 to-transparent px-3 pb-2 pt-6 opacity-0 transition group-hover:opacity-100">
      <button
        disabled={!canControl}
        onClick={() => api.actions.fileControl(origin, "toggle")}
        className="rounded-md bg-white/10 p-1.5 hover:bg-white/20 disabled:opacity-40"
        title={st.paused ? "Reproduzir" : "Pausar"}
      >
        {st.paused ? <PlayIcon width={16} height={16} /> : <PauseIcon width={16} height={16} />}
      </button>
      <span className="w-24 shrink-0 text-xs tabular-nums text-zinc-300">
        {fmt(time)} / {fmt(st.duration)}
      </span>
      <input
        type="range"
        min={0}
        max={st.duration || 0}
        step={0.5}
        value={time}
        disabled={!canControl}
        onChange={(e) => api.actions.fileControl(origin, "seek", Number(e.target.value))}
        className="h-1 flex-1 accent-indigo-500"
      />
      <span className="max-w-40 truncate text-xs text-zinc-400" title={st.title}>
        {st.title}
      </span>
    </div>
  );
}

export function Stage({ api }: { api: RoomApi }) {
  const [focus, setFocus] = useState<string | null>(null);
  const tiles: Tile[] = [];
  for (const [ch, stream] of api.localStreams)
    if (ch !== "mic") tiles.push({ id: `self:${ch}`, origin: api.selfId, channel: ch, stream, local: true, relayedBy: null });
  for (const r of api.remote)
    if (r.channel !== "mic" && r.stream.getVideoTracks().length)
      tiles.push({ id: `${r.origin}:${r.channel}`, origin: r.origin, channel: r.channel, stream: r.stream, local: false, relayedBy: r.relayedBy });

  // Transmissões anunciadas mas que ainda não chegaram
  const waiting = [...api.peers.values()].flatMap((p) =>
    p.id === api.selfId
      ? []
      : (["screen", "camera", "file"] as const).filter((ch) => p.sharing[ch] && !tiles.some((t) => t.id === `${p.id}:${ch}`)).map((ch) => ({ p, ch })),
  );

  const focused = tiles.find((t) => t.id === focus);
  const shown = focused ? [focused] : tiles;
  const cols = shown.length <= 1 ? 1 : shown.length <= 4 ? 2 : 3;

  if (!tiles.length && !waiting.length)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-zinc-500">
        <p className="text-lg text-zinc-300">Ninguém está transmitindo</p>
        <p className="text-sm">Use os botões no topo para compartilhar sua tela, câmera ou um arquivo de vídeo.</p>
      </div>
    );

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="grid min-h-0 flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {shown.map((t) => {
          const name = t.local ? "Você" : api.peers.get(t.origin)?.name ?? "?";
          return (
            <div
              key={t.id}
              className="group relative min-h-0 overflow-hidden rounded-xl border border-line bg-black"
              onDoubleClick={(e) => (e.currentTarget as HTMLElement).requestFullscreen?.()}
            >
              {t.local && t.channel === "file" ? (
                <OwnFileEl el={api.fileVideo.current} />
              ) : (
                <VideoEl stream={t.stream} muted={t.local || api.deafened} fit={t.channel === "camera" ? "cover" : "contain"} />
              )}
              <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs">
                <span className="h-2 w-2 rounded-full bg-live" />
                {name} · {LABEL[t.channel]}
                {t.relayedBy && (
                  <span className="ml-1 flex items-center gap-1 text-zinc-400" title="Recebendo via outro participante (cascata)">
                    <RelayIcon width={12} height={12} /> via {api.peers.get(t.relayedBy)?.name ?? "relay"}
                  </span>
                )}
              </div>
              <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                <button
                  className="rounded-md bg-black/60 px-2 py-1 text-xs hover:bg-black/80"
                  onClick={() => setFocus(focus === t.id ? null : t.id)}
                >
                  {focus === t.id ? "Grade" : "Focar"}
                </button>
                <button
                  className="rounded-md bg-black/60 p-1 hover:bg-black/80"
                  title="Tela cheia"
                  onClick={(e) => (e.currentTarget.closest(".group") as HTMLElement)?.requestFullscreen?.()}
                >
                  <MaximizeIcon width={16} height={16} />
                </button>
              </div>
              {!t.local && t.channel === "file" && <RemoteFileControls api={api} origin={t.origin} />}
            </div>
          );
        })}
      </div>
      {waiting.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
          {waiting.map(({ p, ch }) => (
            <span key={p.id + ch} className="rounded-md border border-line bg-panel px-2 py-1">
              Conectando à {LABEL[ch].toLowerCase()} de {p.name}…
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Players de áudio invisíveis para os microfones remotos. */
export function AudioSinks({ api }: { api: RoomApi }) {
  return (
    <>
      {api.remote
        .filter((r) => r.channel === "mic")
        .map((r) => (
          <AudioEl key={r.origin} stream={r.stream} muted={api.deafened} />
        ))}
    </>
  );
}

function AudioEl({ stream, muted }: { stream: MediaStream; muted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      ref.current.play().catch(() => {});
    }
  }, [stream]);
  return <audio ref={ref} autoPlay muted={muted} />;
}
