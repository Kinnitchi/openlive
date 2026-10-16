"use client";
import { useEffect, useState } from "react";

// Detector de fala via AnalyserNode (RMS acima de um limiar).
let ctx: AudioContext | null = null;

export function useSpeaking(stream?: MediaStream | null) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    const track = stream?.getAudioTracks()[0];
    if (!stream || !track) return setSpeaking(false);
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    let last = false;
    const id = setInterval(() => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const on = Math.sqrt(sum / buf.length) > 0.04;
      if (on !== last) setSpeaking((last = on));
    }, 120);
    return () => {
      clearInterval(id);
      src.disconnect();
    };
  }, [stream]);
  return speaking;
}
