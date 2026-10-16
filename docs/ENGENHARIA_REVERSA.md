# Engenharia reversa — GoLive (golive.nemtudo.me)

Análise feita a partir da página de uma sala privada (`/watch/priv-<nome>-<6 dígitos>`), inspecionando DOM, recursos carregados e os chunks JS públicos. Nenhum código do original foi copiado. O OpenLive é uma reimplementação própria da mesma arquitetura.

## Stack identificada

| Camada | O que foi encontrado |
|---|---|
| Frontend | **Next.js (App Router) + Turbopack** (`/_next/static/chunks/turbopack-*.js`, payload RSC `self.__next_f`), React, Tailwind (classes utilitárias), tema escuro `#09090b` |
| i18n | chaves do tipo `useRoomMedia.couldNotStartSharingCheckThe` |
| Sinalização | **WebSocket puro** em `wss://apigolive.nemtudo.me/ws`. Há fallback que troca `localhost` pelo host da página (replicado em `lib/config.ts`) |
| API HTTP | mesmo host da sinalização: `/ice-servers`, `/stats`, `/features`, `/features/track`, `/push/prefs`, `/push/config`, `/guest/points`, `/partner`, `/emojis/picker` |
| Mídia | **WebRTC P2P sem SFU**: `RTCPeerConnection` por par, `getDisplayMedia`, `getUserMedia`, `HTMLVideoElement.captureStream()` para transmitir arquivos |
| NAT | `/ice-servers` devolve STUN/TURN; opção “forçar relay” (`iceTransportPolicy: relay`) e “TURN dedicado” |
| Anti-bot | Cloudflare Turnstile |
| Outros | Web Push (FCM + webpush), analytics próprio + GA, Twemoji/emojibase via jsDelivr, anúncios (Monetag) e “parceiros” |

## Distribuição de mídia: cascata P2P

O ponto mais interessante. Como não há SFU, quem transmite enviaria um stream por viewer e estouraria o upload. O cliente tem:

- `setChildren(children)` com `tier` por filho, `openChild`/`closeChild("reparent")`, `giveBackToRoot`.
- Mensagens `relay-assign`, `route`, `relay-nack`, `reconnect-request`, `capacity`.
- Eventos de telemetria `cascade_engage`, `cascade_release`, `relay_promoted`, `relay_nack`.

Ou seja: o **servidor monta uma árvore**. A origem envia para poucos viewers, e eles **retransmitem** (re-encode no navegador) para outros. Se um relay falha, o filho manda `relay-nack` e o servidor tira aquele nó da função de relay.

## Protocolo (inferido)

Envelope JSON `{type, ...}` num único socket. Tipos observados (lista parcial):

- **Sala**: `join`, `leave`, `presence`, `register`, `time-sync`, `room-kick`, `room-ban`, `room-unban`, `room-silence`, `room-permissions-set`, `room-admin-add/remove`, `room-member-limit`, `room-info-set`, `room-theme-set`, `room-capture-protection`, `room-convert-to-group`
- **Mídia**: `sharing`, `mic`, `mics-muted`, `signal` `{to, data}` com `data.kind` ∈ `offer | answer | ice | resume | quality | stop | route | relay-assign | relay-nack | reconnect-request`, papel `role: viewer`
- **Chat**: `chat` (`kind: gif`, `replyTo`), `typing`, menções, enquetes, reações
- **Vídeo/música sincronizados**: `video-source-add/remove/state/control-mode`, `music-*` (fila, shuffle) e ações `toggle | next | previous | seek | playAt`
- **Arquivo**: `file-control`, `file-audio-tracks/choice/query` (escolha de faixa de áudio)
- **Ferramentas**: quadro branco (`tool-stroke*`, `tool-sheet`, `tool-poll-*`, `tool-task`), `hand-raise/grant/revoke`, gravação, transcrição ao vivo, token OBS

## Qualidade de vídeo

- Presets de bitrate (`bitrate_maximo`), “smart quality”, degradação `text` vs `motion` via `contentHint`.
- Preferência de codec (`applyVideoCodecPreferences`) e detecção de encoder por hardware.
- No desktop há captura nativa (WGC/DXGI) com fallback para `getDisplayMedia`.

## O que o OpenLive implementa

| Recurso | Status |
|---|---|
| Salas públicas e privadas (`priv-<nome>-<n>`), lista de salas e contador online | ✅ |
| Tela (com áudio do sistema), câmera e microfone | ✅ |
| Transmissão de arquivo local com controle remoto (play/pause/seek) e modo “só o dono controla” | ✅ |
| Árvore de relay em cascata com `route`, `relay-nack` e watchdog | ✅ |
| `/ice-servers` com TURN REST (HMAC) ou credencial fixa, e opção “forçar TURN” | ✅ |
| Chat com respostas, GIF por URL, digitando…, reações flutuantes | ✅ |
| Dono da sala: desligar microfone, expulsar/banir; posse recuperada ao reconectar | ✅ |
| Indicador de fala, “silenciar tudo”, presets de qualidade e bitrate | ✅ |
| Reconexão automática do WebSocket com re-anúncio das transmissões | ✅ |
| Quadro branco, música, contas, push, DMs, gravação, Turnstile, anúncios | ❌ fora do escopo |
