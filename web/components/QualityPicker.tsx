"use client";

import { useState } from "react";
import { CAMERA_PRESETS, SCREEN_PRESETS, bitrateLabel, gbPerHour, type QualityPreset } from "@/lib/quality";
import { CameraIcon, FileVideoIcon, ScreenIcon, XIcon } from "./icons";

export type PickerKind = "screen" | "camera" | "file";

const TITLES: Record<PickerKind, { title: string; action: string; Icon: typeof ScreenIcon }> = {
  screen: { title: "Compartilhar tela", action: "Escolher tela e transmitir", Icon: ScreenIcon },
  camera: { title: "Ligar câmera", action: "Ligar câmera", Icon: CameraIcon },
  file: { title: "Transmitir arquivo de vídeo", action: "Escolher arquivo", Icon: FileVideoIcon },
};

/**
 * Pergunta a qualidade antes de abrir a transmissão. A última escolha vem marcada.
 * Arquivos usam as mesmas opções da tela (só o bitrate importa, a resolução é a do arquivo).
 */
export function QualityPicker({
  kind,
  initial,
  systemAudio: initialAudio,
  onConfirm,
  onClose,
}: {
  kind: PickerKind;
  initial: string;
  systemAudio: boolean;
  onConfirm: (quality: string, systemAudio: boolean) => void;
  onClose: () => void;
}) {
  const presets: QualityPreset<string>[] = kind === "camera" ? CAMERA_PRESETS : SCREEN_PRESETS;
  const [choice, setChoice] = useState(presets.some((p) => p.id === initial) ? initial : presets[1].id);
  const [audio, setAudio] = useState(initialAudio);
  const { title, action, Icon } = TITLES[kind];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quality-title"
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl border border-line bg-panel shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-line p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-indigo-300">
            <Icon />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="quality-title" className="font-semibold">
              {title}
            </h2>
            <p className="text-sm text-zinc-400">Escolha a qualidade da transmissão.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Fechar">
            <XIcon />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4" role="radiogroup" aria-label="Qualidade">
          {presets.map((p) => {
            const on = p.id === choice;
            return (
              <label
                key={p.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                  on ? "border-accent bg-accent/10" : "border-line bg-panel-2 hover:border-zinc-600"
                }`}
              >
                <input type="radio" name="quality" value={p.id} checked={on} onChange={() => setChoice(p.id)} className="mt-1 accent-indigo-500" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{p.label}</span>
                    <span className="text-sm text-zinc-400">{kind === "file" ? "teto de bitrate" : p.detail}</span>
                    {p.id === presets[0].id && (
                      <span className="rounded bg-ok/15 px-1.5 py-0.5 text-[11px] font-medium text-ok">Mais leve</span>
                    )}
                  </span>
                  {p.hint && <span className="mt-0.5 block text-xs text-zinc-500">{p.hint}</span>}
                </span>
                <span className="shrink-0 text-right text-xs tabular-nums text-zinc-400">
                  <span className="block text-zinc-300">{bitrateLabel(p.bitrate)}</span>~{gbPerHour(p.bitrate)} GB/h
                </span>
              </label>
            );
          })}
        </div>

        <footer className="space-y-3 border-t border-line p-4">
          {kind === "screen" && (
            <label className="flex items-center justify-between gap-4 text-sm">
              Transmitir também o áudio da tela ou aba
              <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} className="h-4 w-4 accent-indigo-500" />
            </label>
          )}
          <p className="text-xs text-zinc-500">
            O consumo por hora vale para cada espectador. Quem está em rede restrita (4G, rede corporativa) recebe pelo servidor TURN, e as opções
            mais leves reduzem esse gasto.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button className="rounded-lg px-4 py-2.5 hover:bg-white/10" onClick={onClose}>
              Cancelar
            </button>
            <button autoFocus className="rounded-lg bg-accent px-4 py-2.5 font-medium text-white hover:opacity-90" onClick={() => onConfirm(choice, audio)}>
              {action}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
