"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRoom } from "@/hooks/useRoom";
import { roomLabel } from "@/lib/config";
import type { Prefs } from "@/lib/identity";
import { Stage, AudioSinks } from "./Stage";
import { Participants } from "./Participants";
import { Chat } from "./Chat";
import {
  CameraIcon,
  DeafIcon,
  FileVideoIcon,
  HeadphonesIcon,
  HomeIcon,
  LinkIcon,
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  ScreenIcon,
  SettingsIcon,
} from "./icons";

function Btn({
  on,
  danger,
  title,
  onClick,
  children,
}: {
  on?: boolean;
  danger?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const color = danger ? "bg-live hover:bg-red-600" : on ? "bg-ok/90 text-black hover:bg-ok" : "bg-white/10 hover:bg-white/20";
  return (
    <button title={title} aria-label={title} onClick={onClick} className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm transition ${color}`}>
      {children}
    </button>
  );
}

export function RoomView({ room, name }: { room: string; name: string }) {
  const api = useRoom(room, name);
  const fileInput = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState(false);
  const [tab, setTab] = useState<"stage" | "chat" | "people">("stage");
  const me = api.peers.get(api.selfId);
  const isPrivate = room.startsWith("priv-");

  if (api.kicked)
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-lg">{api.kicked}</p>
        <Link href="/" className="rounded-lg bg-accent px-4 py-2 text-white">
          Voltar ao início
        </Link>
      </div>
    );

  const copyLink = () => {
    navigator.clipboard?.writeText(location.href);
    api.actions.react("🔗");
  };

  return (
    <div className="flex h-dvh flex-col">
      {/* barra superior */}
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <Link href="/" className="rounded-lg p-2 hover:bg-white/10" title="Início">
          <HomeIcon />
        </Link>
        <h1 className="truncate font-semibold">{roomLabel(room)}</h1>
        {isPrivate && <span className="rounded bg-live/90 px-1.5 py-0.5 text-xs">Sala privada</span>}
        <span
          className={`h-2 w-2 rounded-full ${api.conn === "open" ? "bg-ok" : api.conn === "connecting" ? "bg-amber-400" : "bg-live"}`}
          title={api.conn === "open" ? `Conectado` : "Reconectando…"}
        />

        <div className="mx-auto flex flex-wrap items-center gap-1.5">
          <Btn on={me?.sharing.mic} title={me?.sharing.mic ? "Desligar microfone" : "Ligar microfone"} onClick={api.actions.toggleMic}>
            {me?.sharing.mic ? <MicIcon /> : <MicOffIcon />}
          </Btn>
          <Btn on={api.deafened} title={api.deafened ? "Ativar áudio" : "Silenciar tudo"} onClick={() => api.actions.setDeafened(!api.deafened)}>
            {api.deafened ? <DeafIcon /> : <HeadphonesIcon />}
          </Btn>
          <span className="mx-1 h-6 w-px bg-line" />
          <Btn on={me?.sharing.screen} title="Compartilhar tela" onClick={api.actions.toggleScreen}>
            <ScreenIcon /> <span className="hidden sm:inline">Tela</span>
          </Btn>
          <Btn on={me?.sharing.camera} title="Câmera" onClick={api.actions.toggleCamera}>
            <CameraIcon /> <span className="hidden sm:inline">Câmera</span>
          </Btn>
          <Btn
            on={me?.sharing.file}
            title="Transmitir arquivo de vídeo"
            onClick={() => (me?.sharing.file ? api.actions.stopShare("file") : fileInput.current?.click())}
          >
            <FileVideoIcon /> <span className="hidden sm:inline">Arquivo</span>
          </Btn>
          <input
            ref={fileInput}
            type="file"
            accept="video/*,audio/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) api.actions.shareFile(f);
              e.target.value = "";
            }}
          />
          <Link href="/" className="flex h-9 items-center rounded-lg bg-live px-3 hover:bg-red-600" title="Sair">
            <PhoneOffIcon />
          </Link>
        </div>

        <Btn title="Copiar link da sala" onClick={copyLink}>
          <LinkIcon />
        </Btn>
        <Btn title="Configurações" onClick={() => setSettings(true)}>
          <SettingsIcon />
        </Btn>
      </header>

      {/* abas no celular */}
      <nav className="flex border-b border-line text-sm lg:hidden">
        {(["stage", "chat", "people"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 ${tab === t ? "border-b-2 border-accent text-white" : "text-zinc-400"}`}>
            {t === "stage" ? "Transmissão" : t === "chat" ? "Chat" : `Pessoas (${api.peers.size})`}
          </button>
        ))}
      </nav>

      <main className="grid min-h-0 flex-1 gap-2 p-2 lg:grid-cols-[240px_1fr_320px]">
        <div className={`min-h-0 ${tab === "people" ? "block" : "hidden"} lg:block`}>
          <Participants api={api} />
        </div>
        <section className={`relative min-h-0 ${tab === "stage" ? "block" : "hidden"} lg:block`}>
          <Stage api={api} />
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {api.reactions.map((r) => (
              <div key={r.id} className="reaction-float absolute bottom-4 flex flex-col items-center" style={{ left: `${r.x}%` }}>
                <span className="text-4xl">{r.emoji}</span>
                <span className="rounded bg-black/60 px-1 text-[10px]">{r.name}</span>
              </div>
            ))}
          </div>
        </section>
        <div className={`min-h-0 ${tab === "chat" ? "block" : "hidden"} lg:block`}>
          <Chat api={api} />
        </div>
      </main>

      <AudioSinks api={api} />

      {api.toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-line bg-panel-2 px-4 py-2 text-sm shadow-xl">{api.toast}</div>
      )}
      {settings && <Settings prefs={api.prefs} onSave={api.actions.setPrefs} onClose={() => setSettings(false)} />}
    </div>
  );
}

function Settings({ prefs, onSave, onClose }: { prefs: Prefs; onSave: (p: Prefs) => void; onClose: () => void }) {
  const [p, setP] = useState(prefs);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-4 rounded-xl border border-line bg-panel p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Configurações</h2>
        <label className="block text-sm">
          Qualidade da tela
          <select
            value={p.screenQuality}
            onChange={(e) => setP({ ...p, screenQuality: e.target.value as Prefs["screenQuality"] })}
            className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-2 py-2"
          >
            <option value="720p30">720p · 30fps (~2,5 Mbps)</option>
            <option value="1080p30">1080p · 30fps (~4,5 Mbps)</option>
            <option value="1080p60">1080p · 60fps (~8 Mbps) — jogos</option>
            <option value="source">Original · 60fps (~12 Mbps)</option>
          </select>
        </label>
        {(
          [
            ["systemAudio", "Transmitir áudio do sistema/aba junto com a tela"],
            ["noiseSuppression", "Supressão de ruído no microfone"],
            ["forceRelay", "Forçar TURN (use se a conexão P2P falhar em redes restritas)"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex items-center justify-between gap-4 text-sm">
            {label}
            <input type="checkbox" checked={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.checked })} className="accent-indigo-500" />
          </label>
        ))}
        <p className="text-xs text-zinc-500">A qualidade vale para o próximo compartilhamento; o bitrate é aplicado na hora. Forçar TURN vale para novas conexões.</p>
        <div className="flex justify-end gap-2">
          <button className="rounded-lg px-4 py-2 hover:bg-white/10" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="rounded-lg bg-accent px-4 py-2 text-white"
            onClick={() => {
              onSave(p);
              onClose();
            }}
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
