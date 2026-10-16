"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomApi } from "@/hooks/useRoom";
import type { ChatMessage } from "@/lib/protocol";
import { ReplyIcon, SendIcon, XIcon } from "./icons";

const QUICK_EMOJIS = ["😂", "🔥", "👏", "😮", "❤️", "💀", "🎉", "👀"];

function linkify(text: string) {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="text-indigo-400 underline break-all">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

export function Chat({ api }: { api: RoomApi }) {
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const byId = new Map(api.chat.map((m) => [m.id, m]));

  useEffect(() => {
    const el = listRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [api.chat]);

  const onChange = (v: string) => {
    setText(v);
    if (!typingTimer.current) api.actions.setTyping(true);
    else clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      api.actions.setTyping(false);
      typingTimer.current = null;
    }, 2500);
  };

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    // "/gif <url>" envia uma imagem; o original usa um seletor de GIFs (Tenor/Giphy).
    if (t.startsWith("/gif ")) api.actions.sendGif(t.slice(5).trim());
    else api.actions.sendChat(t, replyTo?.id);
    setText("");
    setReplyTo(null);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = null;
    api.actions.setTyping(false);
  };

  const typing = [...api.peers.values()].filter((p) => p.typing && p.id !== api.selfId);

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-xl border border-line bg-panel">
      <div className="border-b border-line px-3 py-2 text-sm font-medium">Chat</div>
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        {api.chat.length === 0 && <p className="pt-8 text-center text-zinc-500">Nenhuma mensagem ainda.</p>}
        {api.chat.map((m) =>
          m.kind === "system" ? (
            <div key={m.id} className="text-center text-xs text-zinc-500">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className="group">
              {m.replyTo && byId.get(m.replyTo) && (
                <div className="mb-0.5 truncate border-l-2 border-zinc-600 pl-2 text-xs text-zinc-500">
                  {byId.get(m.replyTo)!.name}: {byId.get(m.replyTo)!.text}
                </div>
              )}
              <div className="flex items-baseline gap-2">
                <span className="font-semibold" style={{ color: m.color }}>
                  {m.name}
                </span>
                <span className="text-[10px] text-zinc-600">{new Date(m.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                <button className="ml-auto text-zinc-500 opacity-0 group-hover:opacity-100" onClick={() => setReplyTo(m)} title="Responder">
                  <ReplyIcon width={14} height={14} />
                </button>
              </div>
              {m.kind === "gif" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.text} alt="gif" className="mt-1 max-h-48 rounded-lg" loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <p className="whitespace-pre-wrap break-words text-zinc-200">{linkify(m.text)}</p>
              )}
            </div>
          ),
        )}
      </div>
      <div className="h-5 px-3 text-[11px] text-zinc-500">
        {typing.length > 0 && `${typing.map((p) => p.name).join(", ")} ${typing.length > 1 ? "estão" : "está"} digitando…`}
      </div>
      {replyTo && (
        <div className="mx-2 flex items-center gap-2 rounded-t-lg bg-panel-2 px-2 py-1 text-xs text-zinc-400">
          <span className="truncate">Respondendo {replyTo.name}</span>
          <button className="ml-auto" onClick={() => setReplyTo(null)}>
            <XIcon width={12} height={12} />
          </button>
        </div>
      )}
      <div className="flex gap-1 px-2 pb-1">
        {QUICK_EMOJIS.map((e) => (
          <button key={e} className="rounded p-1 text-base hover:bg-white/10" onClick={() => api.actions.react(e)} title="Reagir">
            {e}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2 p-2 pt-0"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          value={text}
          onChange={(e) => onChange(e.target.value)}
          maxLength={1000}
          placeholder="Digite uma mensagem… (/gif url)"
          className="min-w-0 flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <button className="rounded-lg bg-accent px-3 text-white disabled:opacity-40" disabled={!text.trim()} title="Enviar">
          <SendIcon width={16} height={16} />
        </button>
      </form>
    </aside>
  );
}
