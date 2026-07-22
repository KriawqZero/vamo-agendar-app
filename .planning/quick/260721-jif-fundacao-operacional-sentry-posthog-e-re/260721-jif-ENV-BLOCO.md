# Bloco para o `.env.example` — etapa preparatória "Fundação operacional"

Colar no fim do `.env.example`, **sem duplicar o que já estiver lá**; nunca preencher valor real neste arquivo (ele é versionado).

```bash
# Sentry — sem DSN o SDK não inicializa (no-op explícito, não erro)
NEXT_PUBLIC_SENTRY_DSN=

# Resend — sem a chave o envio é no-op silencioso (EML-05)
RESEND_API_KEY=

# --- As três abaixo: cole APENAS se ainda não estiverem no arquivo ---

# PostHog — sem ela client e server são no-op total
NEXT_PUBLIC_POSTHOG_KEY=

# PostHog — obrigatória APENAS se o projeto for da região EU (https://eu.i.posthog.com)
NEXT_PUBLIC_POSTHOG_HOST=

# Salt do hash de tenant — passa a ser obrigatória em produção; nunca trocar depois
ANALYTICS_TENANT_SALT=
```

## Por que este arquivo existe em vez de a edição já estar feita

O executor do plano **não tem permissão de leitura nem de escrita em `.env*`** nesta sessão (verificado: `Read` e `Bash` negados). Ele não consegue nem conferir o que já existe no `.env.example` — por isso as três últimas variáveis estão marcadas como "cole apenas se ainda não estiver lá": essa decisão é sua, porque só você enxerga o arquivo.

## Cuidados

- **Nunca** preencher valor real aqui nem no `.env.example`. Só os **nomes**, com valor vazio.
- `ANALYTICS_TENANT_SALT` era opcional por design até esta etapa. Agora a ausência **derruba o boot em produção**. Gere uma string aleatória longa e **nunca a troque depois** — trocar desconecta os `distinct_id` históricos do PostHog.
- Se o projeto do PostHog for da região **EU**, `NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com` deixa de ser opcional. Errar isso faz nenhum evento aparecer, **sem nenhuma mensagem de erro**.
- Os valores reais vão no seu `.env.local` e nas variáveis do serviço no Railway — nunca no chat.

## Lista completa das obrigatórias em produção

A partir desta etapa, subir em produção sem qualquer uma destas treze derruba o boot de propósito, com a lista completa dos ausentes no log do Railway (`An error occurred while loading instrumentation hook: Variáveis obrigatórias ausentes em produção: …`). Confira **antes** do próximo deploy:

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `QSTASH_TOKEN`, `QSTASH_URL`, `QSTASH_CURRENT_SIGNING_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_GLOBAL_API_KEY`, `APP_URL`, `ANALYTICS_TENANT_SALT`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_SENTRY_DSN`, `RESEND_API_KEY`

As três que provavelmente **não existem** no Railway hoje, e são a causa mais provável de um crash-loop: `ANALYTICS_TENANT_SALT`, `NEXT_PUBLIC_SENTRY_DSN` e `RESEND_API_KEY`.

`SENTRY_ORG` e `SENTRY_PROJECT` **não** entram nesta lista: só afetam upload de source map, que esta etapa não faz.
