# Evolution API — ambiente local (WhatsApp do VamoAgendar)

Stack local do gateway de WhatsApp (Evolution API **v2.3.7** + PostgreSQL 15 + Redis 7).
Pesquisa e decisões: a v2 exige Postgres e Redis próprios; a imagem oficial atual é
`evoapicloud/evolution-api` (a antiga `atendai/...` ficou para trás) e a tag `latest`
aponta para release candidate — por isso fixamos a última estável.

## Subir / derrubar

```bash
cd docker/evolution
docker compose up -d      # sobe api + postgres + redis
docker compose logs -f evolution-api   # acompanhar logs
docker compose down       # derruba (volumes/instâncias são preservados)
```

## Configuração

- `.env` (gitignored) — configuração real. Modelo comentado em `.env.example`.
- `AUTHENTICATION_API_KEY` é a **apikey global** — precisa ser **idêntica** à
  `EVOLUTION_GLOBAL_API_KEY` do `.env.local` do app (o app a usa para criar instâncias
  e buscar QR Code). `EVOLUTION_API_URL` do app = `http://localhost:8080`.
- Cada tenant ganha uma instância própria (`instancia-<orgId>`), criada pelo app via
  `POST /instance/create`; o token retornado em `hash.apikey` é salvo em
  `whatsapp_configs.instance_token` e usado nos envios.

## Verificar saúde

```bash
curl -s http://localhost:8080 | head -c 200   # deve responder JSON com versão
docker compose ps                              # 3 serviços "Up"
```

## Dados persistentes

Volumes Docker: `evolution_instances` (sessões WhatsApp), `evolution_postgres`,
`evolution_redis`. Apagar os volumes = desconectar todos os WhatsApps pareados.

## Avisos

- **Só para desenvolvimento**: porta exposta sem TLS; em produção a Evolution API deve
  ficar atrás de HTTPS com `SERVER_URL` público correto.
- `DEL_INSTANCE=false`: instância desconectada não é apagada sozinha.
- Se o QR Code parar de ser aceito pelo WhatsApp após atualização do app do celular,
  verifique issues recentes do repositório `EvolutionAPI/evolution-api` sobre
  `CONFIG_SESSION_PHONE_VERSION` (problema recorrente do ecossistema Baileys).
