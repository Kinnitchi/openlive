// Predefinições de qualidade oferecidas antes de começar a transmitir.
// O bitrate é o teto por conexão: quem cai no TURN consome esse valor no relay,
// então as opções leves são as que mais economizam.

export type ScreenQuality = "720p15" | "720p30" | "1080p30" | "1080p60" | "source";
export type CameraQuality = "360p" | "540p" | "720p";

export interface QualityPreset<Q extends string> {
  id: Q;
  label: string;
  detail: string;
  bitrate: number;
  constraints: MediaTrackConstraints;
  hint?: string;
}

const mbps = (bps: number) => `${(bps / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} Mbps`;
// GB por hora para uma conexão no teto do bitrate
export const gbPerHour = (bps: number) => ((bps * 3600) / 8 / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export const SCREEN_PRESETS: QualityPreset<ScreenQuality>[] = [
  {
    id: "720p15",
    label: "Econômica",
    detail: "720p · 15 fps",
    bitrate: 1_000_000,
    constraints: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15, max: 15 } },
    hint: "Slides, código e documentos. Funciona bem em 4G e gasta pouco.",
  },
  {
    id: "720p30",
    label: "Padrão",
    detail: "720p · 30 fps",
    bitrate: 2_500_000,
    constraints: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    hint: "Bom equilíbrio para a maioria das transmissões.",
  },
  {
    id: "1080p30",
    label: "Alta",
    detail: "1080p · 30 fps",
    bitrate: 4_500_000,
    constraints: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
    hint: "Texto pequeno e vídeos nítidos.",
  },
  {
    id: "1080p60",
    label: "Jogos",
    detail: "1080p · 60 fps",
    bitrate: 8_000_000,
    constraints: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
    hint: "Movimento rápido. Exige boa conexão de todos.",
  },
  {
    id: "source",
    label: "Original",
    detail: "Resolução da tela · 60 fps",
    bitrate: 12_000_000,
    constraints: { frameRate: { ideal: 60 } },
    hint: "Máxima qualidade. Só para redes locais ou poucos espectadores.",
  },
];

export const CAMERA_PRESETS: QualityPreset<CameraQuality>[] = [
  {
    id: "360p",
    label: "Econômica",
    detail: "360p · 24 fps",
    bitrate: 400_000,
    constraints: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 24 } },
    hint: "Ideal para 4G e salas grandes.",
  },
  {
    id: "540p",
    label: "Padrão",
    detail: "540p · 30 fps",
    bitrate: 800_000,
    constraints: { width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 30 } },
  },
  {
    id: "720p",
    label: "Alta",
    detail: "720p · 30 fps",
    bitrate: 1_500_000,
    constraints: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  },
];

export const screenPreset = (id: ScreenQuality) => SCREEN_PRESETS.find((p) => p.id === id) ?? SCREEN_PRESETS[1];
export const cameraPreset = (id: CameraQuality) => CAMERA_PRESETS.find((p) => p.id === id) ?? CAMERA_PRESETS[1];
export const bitrateLabel = mbps;
