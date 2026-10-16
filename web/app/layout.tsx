import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenLive — Transmissão de tela em grupo",
  description: "Transmita voz, tela, câmera ou vídeos para várias pessoas direto do navegador. Sem cadastro.",
  robots: { index: false },
};

export const viewport: Viewport = { themeColor: "#09090b", width: "device-width", initialScale: 1, interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
