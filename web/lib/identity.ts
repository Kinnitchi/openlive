import type { CameraQuality, ScreenQuality } from "./quality";

// Identidade de convidado (sem cadastro): nome + clientId persistentes no navegador.
function safeGet(k: string) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSet(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch {}
}

export function getClientId() {
  let id = safeGet("ol:clientId");
  if (!id) {
    id = crypto.randomUUID();
    safeSet("ol:clientId", id);
  }
  return id;
}

export function getName() {
  return safeGet("ol:name") ?? "";
}
export function setName(n: string) {
  safeSet("ol:name", n);
}

export interface Prefs {
  forceRelay: boolean;
  screenQuality: ScreenQuality;
  cameraQuality: CameraQuality;
  systemAudio: boolean;
  noiseSuppression: boolean;
}
const DEFAULT_PREFS: Prefs = { forceRelay: false, screenQuality: "720p30", cameraQuality: "540p", systemAudio: true, noiseSuppression: true };

export function getPrefs(): Prefs {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(safeGet("ol:prefs") ?? "{}") }; } catch { return DEFAULT_PREFS; }
}
export function setPrefs(p: Prefs) {
  safeSet("ol:prefs", JSON.stringify(p));
}
