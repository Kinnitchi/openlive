"use client";

import { useState } from "react";
import type { RoomApi } from "@/hooks/useRoom";
import type { PeerInfo } from "@/lib/protocol";
import { useSpeaking } from "./useSpeaking";
import { CameraIcon, CrownIcon, FileVideoIcon, MicIcon, MicOffIcon, RelayIcon, ScreenIcon } from "./icons";

function Row({ p, api }: { p: PeerInfo; api: RoomApi }) {
  const isSelf = p.id === api.selfId;
  const micStream = isSelf ? api.localStreams.get("mic") : api.remote.find((r) => r.origin === p.id && r.channel === "mic")?.stream;
  const speaking = useSpeaking(micStream);
  const [menu, setMenu] = useState(false);
  const amOwner = api.ownerId === api.selfId;

  return (
    <li className="group relative flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-black transition"
        style={{ background: p.color, boxShadow: speaking ? `0 0 0 2px #09090b, 0 0 0 4px ${"#22c55e"}` : undefined }}
      >
        {p.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 truncate text-sm">
          <span className="truncate">{p.name}</span>
          {isSelf && <span className="text-xs text-zinc-500">(você)</span>}
          {api.ownerId === p.id && <CrownIcon width={13} height={13} className="shrink-0 text-amber-400" />}
        </div>
        {p.typing && <div className="text-[11px] text-zinc-500">digitando…</div>}
      </div>
      <div className="flex items-center gap-1 text-zinc-400">
        {p.sharing.screen && <ScreenIcon width={14} height={14} className="text-ok" />}
        {p.sharing.camera && <CameraIcon width={14} height={14} className="text-ok" />}
        {p.sharing.file && <FileVideoIcon width={14} height={14} className="text-ok" />}
        {p.sharing.mic ? <MicIcon width={14} height={14} /> : <MicOffIcon width={14} height={14} className="text-live" />}
      </div>
      {amOwner && !isSelf && (
        <>
          <button onClick={() => setMenu((m) => !m)} className="px-1 text-zinc-500 opacity-0 group-hover:opacity-100" title="Moderar">
            ⋯
          </button>
          {menu && (
            <div className="absolute right-2 top-9 z-20 w-40 rounded-lg border border-line bg-panel-2 p-1 text-sm shadow-xl" onMouseLeave={() => setMenu(false)}>
              <button className="w-full rounded px-2 py-1.5 text-left hover:bg-white/5" onClick={() => (api.actions.silence(p.id), setMenu(false))}>
                Desligar microfone
              </button>
              <button className="w-full rounded px-2 py-1.5 text-left text-live hover:bg-white/5" onClick={() => (api.actions.kick(p.id), setMenu(false))}>
                Expulsar e banir
              </button>
            </div>
          )}
        </>
      )}
    </li>
  );
}

export function Participants({ api }: { api: RoomApi }) {
  const list = [...api.peers.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  const amOwner = api.ownerId === api.selfId;
  return (
    <aside className="flex h-full flex-col rounded-xl border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-sm font-medium">
        Participantes <span className="rounded bg-white/10 px-1.5 text-xs">{list.length}</span>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto p-1.5">
        {list.map((p) => (
          <Row key={p.id} p={p} api={api} />
        ))}
      </ul>
      {api.relayLoad > 0 && (
        <div className="mx-2 mb-2 flex items-center gap-2 rounded-lg bg-indigo-500/10 px-2 py-1.5 text-xs text-indigo-300">
          <RelayIcon width={14} height={14} /> Você está retransmitindo para {api.relayLoad} pessoa(s)
        </div>
      )}
      {amOwner && (
        <label className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs text-zinc-400">
          Só o dono controla vídeos
          <input
            type="checkbox"
            checked={api.controlMode === "owner"}
            onChange={(e) => api.actions.setControlMode(e.target.checked ? "owner" : "everyone")}
            className="accent-indigo-500"
          />
        </label>
      )}
    </aside>
  );
}
