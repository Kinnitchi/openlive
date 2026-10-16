"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SignalingClient, type ConnState } from "@/lib/signaling";
import { MediaEngine, type RemoteStream } from "@/lib/rtc";
import { cameraPreset, screenPreset, type CameraQuality, type ScreenQuality } from "@/lib/quality";
import { httpBase, signalingUrl } from "@/lib/config";
import { getClientId, getPrefs, setPrefs as savePrefs, type Prefs } from "@/lib/identity";
import type { Channel, ChatMessage, ControlMode, FileAction, FileState, PeerInfo, ServerMsg } from "@/lib/protocol";

export interface Reaction {
  id: number;
  emoji: string;
  name: string;
  x: number;
}

export function useRoom(room: string, name: string) {
  const [conn, setConn] = useState<ConnState>("connecting");
  const [selfId, setSelfId] = useState("");
  const [peers, setPeers] = useState<Map<string, PeerInfo>>(new Map());
  const [ownerId, setOwnerId] = useState("");
  const [controlMode, setControlMode] = useState<ControlMode>("everyone");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [fileStates, setFileStates] = useState<Map<string, FileState>>(new Map());
  const [remote, setRemote] = useState<RemoteStream[]>([]);
  const [localStreams, setLocalStreams] = useState<Map<Channel, MediaStream>>(new Map());
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [kicked, setKicked] = useState<string | null>(null);
  const [deafened, setDeafened] = useState(false);
  const [prefs, setPrefsState] = useState<Prefs>(getPrefs);
  const [relayLoad, setRelayLoad] = useState(0);

  const sigRef = useRef<SignalingClient | null>(null);
  const engRef = useRef<MediaEngine | null>(null);
  const fileVideoRef = useRef<HTMLVideoElement | null>(null);
  const fileTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const peersRef = useRef(peers);
  peersRef.current = peers;

  const notify = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 4000);
  }, []);

  // ---------- conexão ----------
  useEffect(() => {
    if (!name) return;
    const clientId = getClientId();
    let sig: SignalingClient;
    const engine = new MediaEngine(
      (to, data) => sig.send({ type: "signal", to, data }),
      (origin, channel) => sig.send({ type: "relay-nack", origin, channel }),
      () => {
        setRemote(engine.remoteStreams());
        setLocalStreams(new Map(engine.local));
        setRelayLoad(engine.relayLoad());
      },
    );
    const p = getPrefs();
    engine.forceRelay = p.forceRelay;
    engine.screenBitrate = screenPreset(p.screenQuality).bitrate;
    engine.cameraBitrate = cameraPreset(p.cameraQuality).bitrate;
    engRef.current = engine;

    fetch(`${httpBase()}/ice-servers`)
      .then((r) => r.json())
      .then((j) => j.iceServers?.length && (engine.iceServers = j.iceServers))
      .catch(() => {});

    sig = new SignalingClient(signalingUrl(), () => {
      engine.resetRemote();
      sig.send({ type: "join", room, name, clientId });
    });
    sigRef.current = sig;
    sig.onState(setConn);

    sig.on((msg: ServerMsg) => {
      switch (msg.type) {
        case "welcome": {
          engine.selfId = msg.selfId;
          setSelfId(msg.selfId);
          setOwnerId(msg.ownerId);
          setControlMode(msg.controlMode);
          setPeers(new Map(msg.peers.map((p) => [p.id, p])));
          setChat(msg.chat);
          setFileStates(new Map());
          // Reconexão: re-anuncia o que eu já estava transmitindo.
          for (const ch of engine.local.keys()) sig.send({ type: "sharing", channel: ch, active: true });
          break;
        }
        case "peer-joined":
        case "peer-update":
          setPeers((m) => new Map(m).set(msg.peer.id, msg.peer));
          break;
        case "peer-left":
          setPeers((m) => {
            const n = new Map(m);
            n.delete(msg.id);
            return n;
          });
          setFileStates((m) => {
            const n = new Map(m);
            n.delete(msg.id);
            return n;
          });
          break;
        case "owner":
          setOwnerId(msg.id);
          break;
        case "control-mode":
          setControlMode(msg.mode);
          break;
        case "chat":
          setChat((c) => [...c.slice(-199), msg.msg]);
          break;
        case "reaction": {
          const id = Date.now() + Math.random();
          const who = peersRef.current.get(msg.from)?.name ?? "";
          setReactions((r) => [...r, { id, emoji: msg.emoji, name: who, x: 10 + Math.random() * 80 }]);
          setTimeout(() => setReactions((r) => r.filter((x) => x.id !== id)), 2700);
          break;
        }
        case "signal":
          engine.signal(msg.from, msg.data);
          break;
        case "route":
          engine.route(msg.origin, msg.channel, msg.parent, msg.children);
          break;
        case "route-end":
          engine.routeEnd(msg.origin, msg.channel);
          break;
        case "file-state":
          setFileStates((m) => new Map(m).set(msg.state.origin, msg.state));
          break;
        case "file-control": {
          const v = fileVideoRef.current;
          if (!v) break;
          if (msg.action === "toggle") v.paused ? v.play().catch(() => {}) : v.pause();
          else if (msg.action === "seek") v.currentTime = msg.time ?? 0;
          else if (msg.action === "playAt") {
            v.currentTime = msg.time ?? 0;
            v.play().catch(() => {});
          }
          break;
        }
        case "silenced":
          if (engine.local.has("mic")) {
            engine.removeLocal("mic");
            sig.send({ type: "sharing", channel: "mic", active: false });
            notify("O dono da sala desligou seu microfone");
          }
          break;
        case "kicked":
          setKicked(msg.reason);
          engine.destroy();
          sig.close();
          break;
        case "error":
          notify(msg.message);
          break;
      }
    });
    sig.connect();

    return () => {
      sig.send({ type: "leave" });
      sig.close();
      engine.destroy();
      if (fileTimer.current) clearInterval(fileTimer.current);
      fileVideoRef.current?.pause();
    };
  }, [room, name, notify]);

  // ---------- compartilhamento ----------
  const startShare = useCallback(
    (ch: Channel, stream: MediaStream) => {
      const eng = engRef.current!;
      if (eng.local.has(ch)) eng.removeLocal(ch);
      eng.addLocal(ch, stream);
      for (const t of stream.getTracks()) t.addEventListener("ended", () => stopShare(ch));
      sigRef.current!.send({ type: "sharing", channel: ch, active: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const stopShare = useCallback((ch: Channel) => {
    const eng = engRef.current;
    if (!eng?.local.has(ch)) return;
    eng.removeLocal(ch);
    sigRef.current?.send({ type: "sharing", channel: ch, active: false });
    if (ch === "file") {
      if (fileTimer.current) clearInterval(fileTimer.current);
      const v = fileVideoRef.current;
      if (v) {
        v.pause();
        URL.revokeObjectURL(v.src);
      }
      fileVideoRef.current = null;
    }
  }, []);

  const toggleMic = useCallback(async () => {
    if (engRef.current?.local.has("mic")) return stopShare("mic");
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, autoGainControl: true, noiseSuppression: prefs.noiseSuppression },
      });
      startShare("mic", s);
    } catch {
      notify("Não foi possível acessar o microfone");
    }
  }, [prefs.noiseSuppression, startShare, stopShare, notify]);

  /** Grava a escolha de qualidade (fica pré-selecionada na próxima vez) e aplica o bitrate. */
  const rememberQuality = useCallback((patch: Partial<Pick<Prefs, "screenQuality" | "cameraQuality" | "systemAudio">>) => {
    const next = { ...getPrefs(), ...patch };
    savePrefs(next);
    setPrefsState(next);
    const eng = engRef.current;
    if (eng) {
      eng.setScreenBitrate(screenPreset(next.screenQuality).bitrate);
      eng.setCameraBitrate(cameraPreset(next.cameraQuality).bitrate);
    }
  }, []);

  const startCamera = useCallback(async (quality: CameraQuality) => {
    rememberQuality({ cameraQuality: quality });
    if (engRef.current?.local.has("camera")) stopShare("camera");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: cameraPreset(quality).constraints });
      s.getVideoTracks()[0].contentHint = "motion";
      startShare("camera", s);
    } catch {
      notify("Não foi possível acessar a câmera");
    }
  }, [rememberQuality, startShare, stopShare, notify]);

  const startScreen = useCallback(
    async (quality: ScreenQuality, systemAudio: boolean) => {
      if (!navigator.mediaDevices?.getDisplayMedia) return notify("Seu navegador não suporta compartilhamento de tela");
      rememberQuality({ screenQuality: quality, systemAudio });
      try {
        const s = await navigator.mediaDevices.getDisplayMedia({ video: screenPreset(quality).constraints, audio: systemAudio });
        s.getVideoTracks()[0].contentHint = quality === "1080p60" || quality === "source" ? "motion" : "detail";
        startShare("screen", s);
      } catch (e) {
        if ((e as DOMException)?.name !== "NotAllowedError") notify("Não foi possível compartilhar a tela");
      }
    },
    [rememberQuality, startShare, notify],
  );

  /** Transmite um arquivo de vídeo local via HTMLVideoElement.captureStream(). */
  const shareFile = useCallback(
    async (file: File) => {
      stopShare("file");
      const v = document.createElement("video");
      v.src = URL.createObjectURL(file);
      v.playsInline = true;
      v.controls = true;
      v.className = "h-full w-full bg-black object-contain";
      fileVideoRef.current = v;
      try {
        await v.play();
      } catch {
        return notify("Seu navegador não conseguiu reproduzir esse arquivo");
      }
      const capture = (v as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream });
      const stream = capture.captureStream?.() ?? capture.mozCaptureStream?.();
      if (!stream) return notify("Seu navegador não permite transmitir arquivos");
      startShare("file", stream);
      // captureStream recria tracks quando a fonte muda; mantém o engine em dia.
      stream.onaddtrack = () => engRef.current?.addLocal("file", stream);

      const report = () =>
        sigRef.current?.send({
          type: "file-state",
          state: { paused: v.paused, time: v.currentTime, duration: v.duration || 0, title: file.name },
        });
      for (const ev of ["play", "pause", "seeked", "loadedmetadata"]) v.addEventListener(ev, report);
      v.addEventListener("ended", () => report());
      fileTimer.current = setInterval(report, 2000);
      report();
    },
    [startShare, stopShare, notify],
  );

  // ---------- chat / misc ----------
  const sig = () => sigRef.current;
  const actions = {
    sendChat: (text: string, replyTo?: string) => sig()?.send({ type: "chat", text, replyTo }),
    sendGif: (url: string) => sig()?.send({ type: "chat", kind: "gif", text: url }),
    setTyping: (typing: boolean) => sig()?.send({ type: "typing", typing }),
    react: (emoji: string) => sig()?.send({ type: "reaction", emoji }),
    fileControl: (to: string, action: FileAction, time?: number) => {
      if (to === selfId) {
        const v = fileVideoRef.current;
        if (v && action === "toggle") v.paused ? v.play() : v.pause();
        return;
      }
      sig()?.send({ type: "file-control", to, action, time });
    },
    kick: (target: string) => sig()?.send({ type: "room-kick", target }),
    silence: (target: string) => sig()?.send({ type: "room-silence", target }),
    setControlMode: (mode: ControlMode) => sig()?.send({ type: "control-mode", mode }),
    rename: (n: string) => sig()?.send({ type: "set-name", name: n }),
    setPrefs: (p: Prefs) => {
      savePrefs(p);
      setPrefsState(p);
      const eng = engRef.current;
      if (eng) {
        eng.forceRelay = p.forceRelay;
        eng.setScreenBitrate(screenPreset(p.screenQuality).bitrate);
        eng.setCameraBitrate(cameraPreset(p.cameraQuality).bitrate);
      }
    },
    toggleMic,
    startCamera,
    startScreen,
    /** Arquivos usam o mesmo teto de bitrate da tela. */
    setFileQuality: (quality: ScreenQuality) => rememberQuality({ screenQuality: quality }),
    shareFile,
    stopShare,
    setDeafened,
  };

  return {
    conn,
    selfId,
    peers,
    ownerId,
    controlMode,
    chat,
    fileStates,
    remote,
    localStreams,
    reactions,
    toast,
    kicked,
    deafened,
    prefs,
    relayLoad,
    rtt: sigRef.current?.rtt ?? 0,
    fileVideo: fileVideoRef,
    actions,
  };
}

export type RoomApi = ReturnType<typeof useRoom>;
