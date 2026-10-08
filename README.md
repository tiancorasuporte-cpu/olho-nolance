# Olho no Lance

Sistema web para câmeras RTSP em campos e quadras: buffer contínuo, botão **OLHO NO LANCE** que salva os últimos 30 segundos, preview ao vivo, multi-quadra, roles e tokens para botão físico.

## Stack

| Serviço | Tech | Porta |
|---------|------|-------|
| `web` | Bun + React + Vite + TanStack | 8080 |
| `api` | FastAPI + SQLAlchemy + Postgres | 8000 |
| `media` | FastAPI + FFmpeg (HLS + clip) | 8001 |
| `postgres` | PostgreSQL 16 | 5432 |

Tabelas são criadas automaticamente na subida da API (`ensure_schema`), no mesmo espírito do `automacao-omie`.

## Subir com Docker

```bash
cp .env.example .env
docker compose up --build
```

Aguarde o health do Postgres e a API. Acesse:

- Web (neste PC): http://localhost:3080  
- Web (outra máquina na rede): http://IP-DO-SERVIDOR:3080  
- API docs: http://localhost:8000/docs  
- Media health: http://localhost:8001/health  

Na rede, use o IP do servidor (ex.: `http://192.168.0.10:3080`). O front detecta o host e chama API/media nesse mesmo IP. Libere no Firewall do Windows as portas **3080**, **8000** e **8001** (entrada TCP).

**Login inicial:** o superadmin é criado na primeira subida com `SUPERADMIN_USER` / `SUPERADMIN_PASSWORD` do `.env`. Defina uma senha forte antes de expor o sistema na internet.

## Fluxo rápido de teste

1. Entre na web e vá em **Quadras** → crie uma quadra.
2. Abra a quadra → cadastre a câmera (`rtsp://...`) e aguarde status `streaming`.
3. Em **Ao vivo** → selecione a câmera, veja o HLS e clique em **OLHO NO LANCE**.
4. Em **Histórico** → baixe o MP4 quando status for `ready`.

### Botão físico (device token)

1. Em **Quadras** → abra a quadra → na câmera, em **Botões**, gere um token (copie na hora).
2. Acione:

```bash
curl -X POST http://localhost:8000/clips/button \
  -H "Content-Type: application/json" \
  -H "X-Device-Token: SEU_TOKEN" \
  -d '{"camera_id": 1, "source": "button"}'
```

Se o device já tiver `camera_id` vinculado, o body pode ser `{}`.

## Roles

- **superadmin / admin** — CRUD de quadras, câmeras, usuários, devices e todos os clipes  
- **operator** — vê só as quadras liberadas, aciona o botão e baixa clipes  

## Acesso externo (Cloudflare Tunnel + nginx)

O container `web` é um **nginx**: serve o site e encaminha `/api` → API e `/media` → media, tudo
no mesmo endereço (porta 3080). O front sempre chama `/api` e `/media` da própria origem.

Para publicar com HTTPS sem abrir portas no roteador:

1. No `.env`: acrescente `;docker-compose.tunnel.yml` ao `COMPOSE_FILE` e defina `CLOUDFLARE_TUNNEL_TOKEN`.
2. No painel Cloudflare (Zero Trust → Networks → Tunnels → seu túnel → Public Hostname):
   hostname desejado → **Service: HTTP**, **URL: `web:8080`**.
3. `docker compose up -d`.

Botões ESP32 podem usar `https://SEU-DOMINIO/api/clips/button` (mesmo header `X-Device-Token`).

## Desempenho e hardware

- **Câmeras em H.264**: o vídeo é copiado sem recodificar (~0,05 thread por câmera). Câmeras em
  H.265/HEVC precisam ser convertidas para o navegador (~0,8 thread por câmera) — configure o
  *stream principal* da câmera em **H.264**, 1080p, 20–30 fps, intervalo de I-frame = fps.
  `GET :8001/health` mostra o modo de cada câmera (`copy` ou `transcode`).
- **Lances** são montados numa fila (botão responde em ~2 s; o vídeo fica pronto em seguida).
- **GPU NVIDIA (NVENC)**: `docker-compose.gpu.yml` monta os lances na placa (~10 s por lance).
  Ativado via `COMPOSE_FILE` no `.env`; remova essa linha em servidor sem placa NVIDIA.
- **Buffer do replay em RAM** (tmpfs). Ajuste `BUFFERS_RAM` (~40 MB por câmera; padrão `1g`).
- Variáveis do media: `STREAM_MODE` (auto|copy|transcode), `CLIP_ENCODER` (auto|nvenc|cpu),
  `CLIP_RENDER_WORKERS` (0 = automático).

## Variáveis principais

Veja `.env.example`: `DATABASE_URL`, `JWT_SECRET`, `MEDIA_INTERNAL_TOKEN`, `VITE_API_URL`, `VITE_MEDIA_URL`.

## Desenvolvimento local (sem Docker da web)

Com a API/media/postgres no compose:

```bash
cd web
bun install
bun run dev
```

## Estrutura

```
olho-nolance/
  docker-compose.yml
  api/          # FastAPI
  media/        # FFmpeg workers
  web/          # React UI
```
