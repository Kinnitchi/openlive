"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRoom } from "@/hooks/useRoom";
import { roomLabel } from "@/lib/config";
import type { Prefs } from "@/lib/identity";
import { cameraPreset, screenPreset, type CameraQuality, type ScreenQuality } from "@/lib/quality";
import { Stage, AudioSinks } from "./Stage";
import { Participants } from "./Participants";
import { Chat } from "./Chat";
import { QualityPicker, type PickerKind } from "./QualityPicker";
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

function Ctrl({
  on,
  danger,
  label,
  title,
  onClick,
  children,
}: {
  on?: boolean;
  danger?: boolean;
  label: string;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const color = danger
    ? "bg-live text-white hover:bg-red-600"
    : on
      ? "bg-ok text-black hover:bg-ok/90"
      : "bg-white/[.07] text-zinc-200 hover:bg-white/15";
  return (
    <button
      title={title ?? label}
      aria-label={title ?? label}
      aria-pressed={danger ? undefined : !!on}
      onClick={onClick}
      className="group flex flex-col items-center gap-1 text-[11px] text-zinc-400"
    >
      <span className={`flex h-11 w-11 items-center justify-center rounded-full transition sm:h-12 sm:w-14 sm:rounded-2xl ${color}`}>{children}</span>
      <span className="hidden group-hover:text-zinc-200 sm:block">{label}</span>
    </button>
  );
}

function TopBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} aria-label={title} onClick={onClick} className="flex h-9 items-center gap-1.5 rounded-lg bg-white/[.07] px-3 text-sm hover:bg-white/15">
      {children}
    </button>
  );
}

export function RoomView({ room, name }: { room: string; name: string }) {
  const api = useRoom(room, name);
  const fileInput = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState(false);
  const [picker, setPicker] = useState<PickerKind | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"stage" | "chat" | "people">("stage");
  const me = api.peers.get(api.selfId);
  const isPrivate = room.startsWith("priv-");

  if (api.kicked)
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-lg">{api.kicked}</p>
        <Link href="/" className="rounded-lg bg-accent px-4 py-2 text-white">
          Voltar ao início
        </Link>
      </div>
    );

  const copyLink = () => {
    navigator.clipboard?.writeText(location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Ligar abre o seletor de qualidade; desligar é direto.
  const toggle = (ch: PickerKind) => (me?.sharing[ch] ? api.actions.stopShare(ch) : setPicker(ch));

  const confirmQuality = (quality: string, systemAudio: boolean) => {
    const kind = picker;
    setPicker(null);
    if (kind === "screen") api.actions.startScreen(quality as ScreenQuality, systemAudio);
    else if (kind === "camera") api.actions.startCamera(quality as CameraQuality);
    else if (kind === "file") {
      api.actions.setFileQuality(quality as ScreenQuality);
      fileInput.current?.click();
    }
  };

  const sharingNow = [
    me?.sharing.screen && `Tela · ${screenPreset(api.prefs.screenQuality).detail}`,
    me?.sharing.camera && `Câmera · ${cameraPreset(api.prefs.cameraQuality).detail}`,
    me?.sharing.file && "Arquivo de vídeo",
  ].filter(Boolean) as string[];

  return (
    <div className="flex h-dvh flex-col">
      {/* barra superior */}
      <header className="flex items-center gap-2 border-b border-line bg-panel/60 px-3 py-2">
        <Link href="/" className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white" title="Início">
          <HomeIcon />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${api.conn === "open" ? "bg-ok" : api.conn === "connecting" ? "bg-amber-400" : "bg-live"}`}
            title={api.conn === "open" ? "Conectado" : "Reconectando…"}
          />
          <h1 className="truncate font-semibold">{roomLabel(room)}</h1>
          {isPrivate && <span className="hidden shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-xs text-zinc-300 sm:inline">Privada</span>}
          {api.conn !== "open" && <span className="shrink-0 text-xs text-amber-400">Reconectando…</span>}
        </div>
        <TopBtn title="Copiar link da sala" onClick={copyLink}>
          <LinkIcon width={16} height={16} />
          <span className="hidden sm:inline">{copied ? "Link copiado!" : "Convidar"}</span>
        </TopBtn>
        <TopBtn title="Configurações" onClick={() => setSettings(true)}>
          <SettingsIcon width={16} height={16} />
        </TopBtn>
      </header>

      {/* abas no celular */}
      <nav className="flex border-b border-line text-sm lg:hidden">
        {(["stage", "chat", "people"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 ${tab === t ? "border-b-2 border-accent text-white" : "text-zinc-400"}`}>
            {t === "stage" ? "Transmissão" : t === "chat" ? "Chat" : `Pessoas (${api.peers.size})`}
          </button>
        ))}
      </nav>

      <main className="grid min-h-0 flex-1 gap-2 p-2 lg:grid-cols-[220px_1fr_300px] xl:grid-cols-[240px_1fr_340px]">
        <div className={`min-h-0 ${tab === "people" ? "block" : "hidden"} lg:block`}>
          <Participants api={api} />
        </div>
        <section className={`relative min-h-0 ${tab === "stage" ? "block" : "hidden"} lg:block`}>
          <Stage api={api} onShare={(ch) => setPicker(ch)} />
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

      {/* barra de controles */}
      <footer className="border-t border-line bg-panel/60 px-3 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 sm:gap-3">
          <Ctrl on={me?.sharing.mic} label="Microfone" title={me?.sharing.mic ? "Desligar microfone" : "Ligar microfone"} onClick={api.actions.toggleMic}>
            {me?.sharing.mic ? <MicIcon /> : <MicOffIcon />}
          </Ctrl>
          <Ctrl on={api.deafened} label={api.deafened ? "Sem áudio" : "Áudio"} title={api.deafened ? "Ativar áudio" : "Silenciar tudo"} onClick={() => api.actions.setDeafened(!api.deafened)}>
            {api.deafened ? <DeafIcon /> : <HeadphonesIcon />}
          </Ctrl>
          <span className="mx-1 h-8 w-px bg-line" />
          <Ctrl on={me?.sharing.screen} label="Tela" title={me?.sharing.screen ? "Parar de compartilhar a tela" : "Compartilhar tela"} onClick={() => toggle("screen")}>
            <ScreenIcon />
          </Ctrl>
          <Ctrl on={me?.sharing.camera} label="Câmera" title={me?.sharing.camera ? "Desligar câmera" : "Ligar câmera"} onClick={() => toggle("camera")}>
            <CameraIcon />
          </Ctrl>
          <Ctrl on={me?.sharing.file} label="Arquivo" title={me?.sharing.file ? "Parar o arquivo" : "Transmitir arquivo de vídeo"} onClick={() => toggle("file")}>
            <FileVideoIcon />
          </Ctrl>
          <span className="mx-1 h-8 w-px bg-line" />
          <Link href="/" title="Sair da sala" aria-label="Sair da sala" className="group flex flex-col items-center gap-1 text-[11px] text-zinc-400">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-live text-white transition hover:bg-red-600 sm:h-12 sm:w-14 sm:rounded-2xl">
              <PhoneOffIcon />
            </span>
            <span className="hidden group-hover:text-zinc-200 sm:block">Sair</span>
          </Link>
        </div>
        {sharingNow.length > 0 && (
          <p className="mt-1 text-center text-[11px] text-zinc-500">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-live align-middle" />
            Transmitindo: {sharingNow.join(" · ")}
          </p>
        )}
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
      </footer>

      <AudioSinks api={api} />

      {api.toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-line bg-panel-2 px-4 py-2 text-sm shadow-xl">{api.toast}</div>
      )}
      {picker && (
        <QualityPicker
          kind={picker}
          initial={picker === "camera" ? api.prefs.cameraQuality : api.prefs.screenQuality}
          systemAudio={api.prefs.systemAudio}
          onConfirm={confirmQuality}
          onClose={() => setPicker(null)}
        />
      )}
      {settings && <Settings prefs={api.prefs} onSave={api.actions.setPrefs} onClose={() => setSettings(false)} />}
    </div>
  );
}

function Settings({ prefs, onSave, onClose }: { prefs: Prefs; onSave: (p: Prefs) => void; onClose: () => void }) {
  const [p, setP] = useState(prefs);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Configurações</h2>
        {(
          [
            ["noiseSuppression", "Supressão de ruído no microfone"],
            ["forceRelay", "Forçar TURN (só se a conexão P2P falhar em redes restritas)"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex items-center justify-between gap-4 text-sm">
            {label}
            <input type="checkbox" checked={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.checked })} className="h-4 w-4 accent-indigo-500" />
          </label>
        ))}
        <p className="text-xs text-zinc-500">
          A qualidade da tela, da câmera e dos arquivos é escolhida a cada transmissão. Forçar TURN vale para novas conexões e aumenta o consumo do
          servidor TURN.
        </p>
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
