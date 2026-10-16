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
  screenQuality: "720p30" | "1080p30" | "1080p60" | "source";
  systemAudio: boolean;
  noiseSuppression: boolean;
}
const DEFAULT_PREFS: Prefs = { forceRelay: false, screenQuality: "1080p30", systemAudio: true, noiseSuppression: true };

export function getPrefs(): Prefs {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(safeGet("ol:prefs") ?? "{}") }; } catch { return DEFAULT_PREFS; }
}
export function setPrefs(p: Prefs) {
  safeSet("ol:prefs", JSON.stringify(p));
}
