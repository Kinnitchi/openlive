"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { httpBase, makePrivateRoomName } from "@/lib/config";
import { getName, setName } from "@/lib/identity";

interface PublicRoom {
  name: string;
  members: number;
  live: boolean;
}

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
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-4 py-12">
      <header className="space-y-2 text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          Open<span className="text-accent">Live</span>
        </h1>
        <p className="text-zinc-400">Transmita sua tela, câmera, voz ou um vídeo para várias pessoas ao mesmo tempo. Sem cadastro.</p>
        {online !== null && (
          <p className="text-sm text-ok">
            ● {online} {online === 1 ? "pessoa online" : "pessoas online"}
          </p>
        )}
      </header>

      <section className="space-y-4 rounded-2xl border border-line bg-panel p-5">
        <label className="block text-sm text-zinc-400">
          Seu nome
          <input
            value={name}
            onChange={(e) => setNameState(e.target.value)}
            maxLength={32}
            placeholder="Como você quer aparecer"
            className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-white outline-none focus:border-indigo-500"
          />
        </label>
        <label className="block text-sm text-zinc-400">
          Nome da sala
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            maxLength={40}
            placeholder="ex.: noite-do-filme"
            className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-white outline-none focus:border-indigo-500"
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            disabled={!slug || slug.length < 2}
            onClick={() => go(slug)}
            className="rounded-lg bg-white/10 px-4 py-2.5 hover:bg-white/20 disabled:opacity-40"
          >
            Criar/entrar em sala pública
          </button>
          <button onClick={() => go(makePrivateRoomName(slug || name || "sala"))} className="rounded-lg bg-accent px-4 py-2.5 text-white hover:opacity-90">
            Criar sala privada
          </button>
        </div>
        <p className="text-xs text-zinc-500">Salas privadas têm um código aleatório e não aparecem na lista — só entra quem tiver o link.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-400">Salas públicas</h2>
        {rooms.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-zinc-500">Nenhuma sala pública aberta agora.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {rooms.map((r) => (
              <li key={r.name}>
                <button onClick={() => go(r.name)} className="flex w-full items-center justify-between rounded-xl border border-line bg-panel p-4 text-left hover:border-indigo-500">
                  <span className="truncate font-medium">{r.name}</span>
                  <span className="flex items-center gap-2 text-xs text-zinc-400">
                    {r.live && <span className="rounded bg-live px-1.5 py-0.5 text-white">AO VIVO</span>}
                    {r.members} 👤
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
