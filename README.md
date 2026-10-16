# OpenLive

Transmissão de tela, câmera, voz e vídeos em grupo, direto do navegador e sem cadastro. É uma reimplementação da arquitetura do GoLive (veja `docs/ENGENHARIA_REVERSA.md`).

```
openlive/
├─ server/   Node + ws: sinalização, salas, árvore de relay, /ice-servers, /stats, /rooms
├─ web/      Next.js 15 (App Router) + React 19 + Tailwind 4
└─ docs/     engenharia reversa do original
```

## Rodando local

```bash
# terminal 1: sinalização (porta 8787)
cd server && npm install && npm run dev

# terminal 2: front (porta 3000)
cd web && npm install && cp .env.example .env.local && npm run dev
```

Abra http://localhost:3000 em duas abas ou dois navegadores. Para testar outro dispositivo da rede, acesse `http://SEU_IP:3000`: o front troca `localhost` pelo IP sozinho. Atenção: tela, câmera e microfone exigem **HTTPS** fora do localhost.

## Como funciona

1. O cliente abre um WebSocket em `/ws` e envia `join {room, name, clientId}`.
2. Ao compartilhar algo, envia `sharing {channel, active}` (`channel` = `screen | camera | mic | file`).
3. Para cada transmissão, o servidor monta uma **árvore** (`server/src/tree.ts`) e manda `route {origin, channel, parent, children}` a cada nó.
4. Cada nó cria um `RTCPeerConnection` por filho e envia a oferta via `signal`. Quem recebe de um pai **repassa as mesmas tracks** aos próprios filhos (`web/lib/rtc.ts`). Assim o upload de quem transmite fica limitado a `ROOT_CAP` conexões.
5. Se um relay não entregar mídia em 12 s, ou a conexão falhar, o filho envia `relay-nack`. O servidor tira esse relay da árvore e reorganiza.

Arquivos de vídeo são transmitidos com `video.captureStream()`. O dono do arquivo envia `file-state` a cada 2 s, e os outros controlam a reprodução com `file-control` (`toggle | seek | playAt`).

## Variáveis do servidor

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` | 8787 | porta HTTP/WS |
| `ALLOWED_ORIGINS` | (vazio = todas) | origens aceitas no WS, separadas por vírgula |
| `MAX_MEMBERS` | 50 | limite por sala |
| `ROOT_CAP` / `RELAY_CAP` | 4 / 3 | filhos diretos da origem / de cada relay (tela e arquivo) |
| `CAMERA_ROOT_CAP` / `CAMERA_RELAY_CAP` | 6 / 3 | o mesmo para câmera |
| `STUN_URLS` | Google STUN | lista separada por vírgula |
| `TURN_URLS` | — | ex.: `turn:turn.seudominio.com:3478,turns:turn.seudominio.com:5349` |
| `TURN_SECRET` | — | gera credencial temporária (coturn `use-auth-secret`) |
| `TURN_USERNAME` / `TURN_CREDENTIAL` | — | credencial fixa, se não usar `TURN_SECRET` |

No front, `NEXT_PUBLIC_SIGNALING_URL` (padrão `ws://localhost:8787/ws`).

## Produção

- Coloque o servidor atrás de um proxy com TLS (nginx/Caddy) e encaminhe o upgrade de `/ws`.
- **Use um TURN** (coturn). Sem ele, uns 10–20% dos usuários atrás de NAT simétrico ou 4G não conectam. O `docker-compose.yml` sobe um coturn de exemplo.
- Teste a cascata localmente com `ROOT_CAP=1 RELAY_CAP=1`: com 4 abas você vê "via Fulano" nos vídeos.

```bash
docker compose up --build
```

## Testes

Os testes E2E com Playwright (Chromium usando câmera, microfone e tela falsos) validaram:

- a cascata A→B→C→D e a reorganização da árvore quando B sai;
- chat e o indicador "digitando";
- transmissão de arquivo com áudio e pausa remota;
- expulsão e ban.
