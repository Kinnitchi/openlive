import { WatchClient } from "./WatchClient";

export default async function WatchPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return <WatchClient room={decodeURIComponent(room)} />;
}

export async function generateMetadata({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  const priv = room.startsWith("priv-");
  return {
    title: priv ? "Sala privada | OpenLive" : `${decodeURIComponent(room)} | OpenLive`,
    description: priv ? "Alguém te convidou para uma sala privada no OpenLive. Abra o link para entrar." : undefined,
  };
}
