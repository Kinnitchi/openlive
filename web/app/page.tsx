"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { httpBase, makePrivateRoomName } from "@/lib/config";
import { getName, setName } from "@/lib/identity";
import { CameraIcon, FileVideoIcon, MicIcon, ScreenIcon } from "@/components/icons";

interface PublicRoom {
  name: string;
  members: number;
  live: boolean;
}

const FEATURES = [
  [ScreenIcon, "Tela"],
  [CameraIcon, "Câmera"],
  [MicIcon, "Voz"],
  [FileVideoIcon, "Vídeos"],
] as const;

const input =
  "mt-1.5 w-full rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-white outline-none transition placeholder:text-zinc-600 focus:border-accent focus:ring-2 focus:ring-accent/30";

export default function Home() {
  const router = useRouter();
  const [name, setNameState] = useState("");
  const [roomName, setRoomName] = useState("");
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [online, setOnline] = useState<number | null>(null);

  useEffect(() => {
    setNameState(getName());
    const load = () => {
      fetch(`${httpBase()}/rooms`).then((r) => r.json()).then((j) => setRooms(j.rooms)).catch(() => {});
      fetch(`${httpBase()}/stats`).then((r) => r.json()).then((j) => setOnline(j.online)).catch(() => setOnline(null));
    };
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const go = (room: string) => {
    if (name.trim()) setName(name.trim());
    router.push(`/watch/${encodeURIComponent(room)}`);
  };
  const slug = roomName.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,.22),transparent_70%)]" />

      <div className="relative mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:py-20 lg:grid-cols-[1fr_420px] lg:items-start">
        <header className="space-y-6 lg:pt-6">
          {online !== null && (
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs text-zinc-300">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" />
              {online} {online === 1 ? "pessoa online" : "pessoas online"}
            </p>
          )}
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
            Open<span className="text-accent">Live</span>
          </h1>
          <p className="max-w-md text-lg text-zinc-400">
            Transmita sua tela, câmera, voz ou um vídeo para várias pessoas ao mesmo tempo, direto do navegador. Sem cadastro.
          </p>
          <ul className="flex flex-wrap gap-2">
            {FEATURES.map(([Icon, label]) => (
              <li key={label} className="flex items-center gap-1.5 rounded-lg bg-white/[.06] px-3 py-1.5 text-sm text-zinc-300">
                <Icon width={15} height={15} className="text-indigo-300" />
                {label}
              </li>
            ))}
          </ul>
        </header>

        <section className="space-y-4 rounded-2xl border border-line bg-panel/90 p-5 shadow-2xl shadow-black/40 backdrop-blur sm:p-6">
          <h2 className="font-semibold">Entrar ou criar uma sala</h2>
          <label className="block text-sm text-zinc-400">
            Seu nome
            <input value={name} onChange={(e) => setNameState(e.target.value)} maxLength={32} placeholder="Como você quer aparecer" className={input} />
          </label>
          <label className="block text-sm text-zinc-400">
            Nome da sala
            <input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && slug.length >= 2 && go(slug)}
              maxLength={40}
              placeholder="ex.: noite-do-filme"
              className={input}
            />
          </label>
          <div className="grid gap-2 pt-1">
            <button
              onClick={() => go(makePrivateRoomName(slug || name || "sala"))}
              className="rounded-xl bg-accent px-4 py-3 font-medium text-white transition hover:opacity-90"
            >
              Criar sala privada
            </button>
            <button
              disabled={slug.length < 2}
              onClick={() => go(slug)}
              className="rounded-xl bg-white/[.07] px-4 py-3 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {slug.length >= 2 ? `Entrar na sala pública “${slug}”` : "Entrar em sala pública"}
            </button>
          </div>
          <p className="text-xs leading-relaxed text-zinc-500">Salas privadas ganham um código aleatório e não aparecem na lista. Só entra quem tiver o link.</p>
        </section>

        <section className="space-y-3 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-400">
            Salas públicas
            {rooms.length > 0 && <span className="rounded bg-white/10 px-1.5 text-xs">{rooms.length}</span>}
          </h2>
          {rooms.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-zinc-500">
              Nenhuma sala pública aberta agora. Crie uma acima.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {rooms.map((r) => (
                <li key={r.name}>
                  <button
                    onClick={() => go(r.name)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-panel p-4 text-left transition hover:border-accent hover:bg-accent/5"
                  >
                    <span className="truncate font-medium">{r.name}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-zinc-400">
                      {r.live && (
                        <span className="flex items-center gap-1 rounded-md bg-live/15 px-1.5 py-0.5 font-medium text-red-400">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-live" />
                          AO VIVO
                        </span>
                      )}
                      {r.members} {r.members === 1 ? "pessoa" : "pessoas"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
