"use client";

import { useEffect, useState } from "react";
import { RoomView } from "@/components/RoomView";
import { getName, setName } from "@/lib/identity";

export function WatchClient({ room }: { room: string }) {
  const [name, setNameState] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const n = getName();
    setNameState(n);
    setDraft(n);
  }, []);

  if (!/^[a-zA-Z0-9_-]{2,64}$/.test(room))
    return <p className="p-8 text-center">Nome de sala inválido.</p>;
  if (name === null) return null;
  if (name) return <RoomView room={room} name={name} />;

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form
        className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-panel p-6"
        onSubmit={(e) => {
          e.preventDefault();
          const n = draft.trim();
          if (!n) return;
          setName(n);
          setNameState(n);
        }}
      >
        <h1 className="text-lg font-semibold">Entrar na sala</h1>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={32}
          placeholder="Seu nome"
          className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 outline-none focus:border-indigo-500"
        />
        <button className="w-full rounded-lg bg-accent py-2 text-white disabled:opacity-40" disabled={!draft.trim()}>
          Entrar
        </button>
      </form>
    </div>
  );
}
