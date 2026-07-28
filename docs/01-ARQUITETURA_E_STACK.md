# 01 - Arquitetura e Stack Oficial

Este documento define a arquitetura e a stack tecnológica oficial do **VamoAgendar**, um SaaS B2B2C de agendamento online focado em profissionais independentes e pequenas empresas no Brasil.

---

## 🚀 Stack Oficial e Definitiva

Toda a engenharia do projeto deve seguir estritamente as tecnologias e ferramentas abaixo:

1. **Frontend & API:**
   * **Next.js 16 (App Router):** Roteamento avançado, Server Components por padrão para performance e SEO, e Server Actions para mutação de dados.
   * **React 19:** Utilização das novidades do React 19 (Server Actions, hooks nativos de formulários).
   * **Tailwind CSS v4:** Estilização utilitária de última geração, mantendo foco total em responsividade e design *mobile-first*.

2. **Autenticação & Multi-tenant:**
   * **Clerk:** Provedor oficial de identidade. Utiliza a funcionalidade de **Organizations** para estruturar e isolar as empresas (tenants).

3. **Banco de Dados:**
   * **Supabase (PostgreSQL):** Utilização do cliente oficial `@supabase/ssr` para comunicação direta, tirando proveito das políticas de segurança baseadas em linha (RLS - Row Level Security).
   * **NÃO UTILIZA ORM:** Qualquer ORM (como Prisma ou Drizzle) está explicitamente descartado. O acesso é feito via Supabase Client padrão.

4. **Pagamentos & Assinaturas:**
   * **Asaas:** Gateway de pagamento focado no mercado brasileiro, gerenciando Pix e planos de assinatura pré-pagos via links de checkout.

5. **Mensageria & Filas:**
   * **Upstash QStash:** Escalabilidade de filas *serverless* para agendamento de tarefas em background e envio de lembretes futuros.
   * **Upstash Redis (`@upstash/ratelimit` + `@upstash/redis`):** Contador do rate limit anti-abuso do booking público, acessado por **HTTP/REST** (nunca TCP). Mesma conta do QStash. Ver a seção "Anti-abuso do booking público" abaixo.

6. **Notificações:**
   * **Resend (SDK `resend`):** Disparo de e-mails transacionais (boas-vindas, confirmação, faturamento). Remetente verificado `naoresponda@mail.vamoagendar.com.br`. Todo envio passa pelo wrapper `src/lib/email/enviar.ts`, que nunca lança e é no-op silencioso sem `RESEND_API_KEY` (EML-05) — nenhum chamador fala com o SDK direto.
   * **Evolution API:** Gateway oficial (self-hosted, gratuito) para integração de WhatsApp via QR Code — notificações instantâneas de agendamento e lembretes aos clientes finais. Toda decisão que tangencie WhatsApp deve ser pensada em cima da Evolution API (instância por tenant; apikey global para gestão, `hash.apikey` da instância para envio).

7. **Observabilidade:**
   * **Sentry (`@sentry/nextjs`):** Error tracking de servidor e de browser, inicializado por `src/instrumentation.ts` e `src/instrumentation-client.ts`. `onRequestError` é o que faz exceção de Server Action chegar ao painel. As travas anti-PII vivem no código versionado (`src/lib/observabilidade/opcoes-sentry.ts`), nunca em toggle de painel; Session Replay não é instalado. Sem `NEXT_PUBLIC_SENTRY_DSN` o SDK não inicializa (no-op explícito).
   * **PostHog:** Eventos de funil (ver `docs/08-ANALYTICS_E_FUNIL.md`). No-op sem credencial.

---

## 🏢 Modelo de Negócio Multi-tenant B2B2C

O **VamoAgendar** opera em um modelo com duas frentes claras:
* **B2B (Business-to-Business):** A plataforma atende profissionais e pequenas empresas (tenants) que assinam o SaaS para gerenciar seus horários, funcionários, serviços e configurações.
* **B2C (Business-to-Consumer):** A plataforma fornece uma página pública de agendamento ("Link na Bio") para que os clientes finais desses profissionais possam selecionar serviços, profissionais e agendar horários de forma totalmente autônoma.

O isolamento dos dados de cada empresa é garantido no banco de dados (Supabase) a nível de linha (RLS), utilizando a identificação de organização fornecida pelo Clerk (`org_id`).

---

## 🛡️ Anti-abuso do booking público (rate limit + honeypot)

Entregue na Phase 03 (2026-07-27). O booking público não tem login, cadastro nem CAPTCHA
— Fricção Zero é inegociável —, então a defesa contra script que enche agenda é
inteiramente invisível para o cliente legítimo. São **dois eixos independentes**, e nenhum
dos dois fecha o problema sozinho: o rate limit conta volume, o honeypot distingue
comportamento. Script que chama a Server Action direto não preenche formulário (cai só no
rate limit); bot de formulário dentro do orçamento passa pelo contador (cai só no
honeypot).

### Backend do contador

**Upstash Redis via REST, com `@upstash/ratelimit`.** Sempre `slidingWindow` — nunca
`fixedWindow`, que libera o dobro do orçamento na virada da janela. Todo o conhecimento
de `@upstash/*` mora em **um arquivo só**, `src/lib/rate-limit.ts` (`verificarLimite`,
`ipDoVisitante`, `hashChaveRateLimit`); as Server Actions nunca falam com a lib crua.

Quatro camadas, cada uma com um vetor de ataque distinto:

| Camada | Janela | Superfície | Papel |
|---|---|---|---|
| `escrita_ip` | 10 / 10 min | `criarAgendamentoPublico` | folgada de propósito — CGNAT de operadora móvel faz clientes reais dividirem IP |
| `escrita_telefone` | 5 / 1 h por tenant | `criarAgendamentoPublico` | a mais apertada; acomoda o caso família e barra ench-agenda com número único |
| `teto_tenant` | 30 **criações** / 1 h | `criarAgendamentoPublico` | **desacelera** o ataque distribuído (IP e telefone rotativos) para dar tempo de reação humana; não o impede |
| `leitura_ip` | 60 / 1 min | `obterSlotsPublicos` | teto folgado contra martelar a grade; quem 60/min barra é script que não lê tela |

⚠️ **"Criações" no `teto_tenant` é literal, e a distinção não é detalhe.** `limit()` é
check-then-consume: usar a mesma chamada para decidir e para contar faria a camada contar
TENTATIVAS, e aí 30 requisições com `servicoId` inexistente negariam agendamento a um
tenant inteiro por uma hora — o atacante bloquearia a agenda sem criar nada, que é o
inverso do risco aceito no D-09. Por isso, e só nesta camada, a decisão vem de
`verificarLimiteSemConsumir` (leitura via `getRemaining`, com teto de latência próprio
porque a lib não aplica o dela ao `getRemaining`) e o token é gasto **depois** do INSERT
bem-sucedido. As outras três consomem na tentativa, que é o comportamento correto delas.

Propriedades que valem para as quatro:

- **Chave pseudonimizada dentro do próprio módulo** (`hashComSal`, sha256 +
  `ANALYTICS_TENANT_SALT` + **domínio**): IP e telefone são dado pessoal e **nunca** entram
  crus no store do fornecedor terceiro. O chamador passa o valor cru e não tem como
  esquecer de hashear. O domínio (`ratelimit`) é o que impede a chave do contador de
  coincidir com o `tenantHash` publicado na telemetria — enquanto as duas funções eram
  idênticas, ler um evento do Sentry bastava para apontar o balde no Redis. Salt ausente
  abre Issue (`hash:sem_salt`) uma vez por processo, em vez de degradar em silêncio.
- **IP do visitante:** `x-real-ip` primeiro (valor único posto pelo proxy, que o cliente
  não consegue estender) e, como fallback, a entrada **mais à direita** de
  `x-forwarded-for` — nunca a primeira, que é texto do cliente quando o proxy apenas anexa.
  Valor sem forma de IP é recusado; IP indeterminável devolve `null`, a camada vira PASSE e
  o estado abre Issue (`ratelimit:ip_indeterminavel`) uma vez por processo. Um balde
  compartilhado ali transformaria header ausente em queda total do booking público.
- **Fail-open com teto de ~500 ms, e o teto é real.** Redis indisponível ou lento **libera**
  a requisição e reporta `ratelimit:redis_unavailable` (Issue sintética, entrega garantida
  por `Sentry.flush`, mas emitida **depois da resposta** via `after()` e no máximo uma vez
  por minuto por camada). Aguardar o flush em linha somava até 2 s por camada ao teto
  declarado — pior caso ~5 s num agendamento legítimo durante a queda do fornecedor, que é
  exatamente o cenário que o fail-open existe para tornar indolor.
- **Bloqueio é condição esperada, não incidente:** vai para Sentry Log (`ratelimit.bloqueio`)
  + PostHog (`booking_rate_limited`), sem Issue. A única exceção é o estouro do teto por
  tenant (`ratelimit:teto_tenant_atingido`) — o sinal raro de ataque real em andamento.
  Toda emissão do caminho de rejeição sai **depois da resposta** e com throttle por
  processo; sem isso, rejeitar custava mais que aceitar exatamente sob flood, e quem
  escolhia o volume de eventos era o atacante. A **taxa do PostHog não é amostrada**: é ela
  que responde "quanto está sendo barrado", e detector amostrado não detecta.
- **A resposta ao bloqueio é honesta** (`muitas_tentativas` + copy amigável), nunca sucesso
  falso: sob CGNAT a certeza de bot é baixa, e pessoa real achando que agendou sem ter
  agendado é o pior desfecho possível para a confiança no produto. Vale nas **duas**
  superfícies — na caixa de horários a copy também é a de rate limit, e o botão "Tentar de
  novo" fica em espera por alguns segundos em vez de convidar a queimar outro token.

`obterDadosBookingPublico` fica **fora** do teto de leitura, de propósito: seu contrato é
`null → notFound()`, então bloqueio viraria "estabelecimento não existe" para visitante
legítimo — uma defesa pior que a ausência dela. É o argumento de **UX** que sustenta a
decisão, e ele basta sozinho.

O argumento de **custo** que acompanhava essa decisão ("uma requisição por visita, contra
dezenas de consultas de grade na mesma sessão") **não** se sustenta e foi retirado: ele
assume comportamento de navegador, que é precisamente o que o modelo de ameaça rejeita em
todo o resto — um script chama a action num laço e paga quatro consultas com cliente
privilegiado por requisição, sem teto algum. Fica registrado como **risco residual medido
pelo eixo certo** (carga no Supabase, não número de page loads), a reavaliar se o page load
virar alvo medido.

### Honeypot

Campo armadilha `info_adicional` no formulário público, oculto por **posicionamento
off-screen em `style` inline** (nunca `display:none`/`hidden`, que parte dos bots pula; e
inline em vez de classe utilitária porque valor arbitrário do Tailwind precisa ser GERADO —
classe não emitida deixaria o campo visível no formulário sem nenhum sintoma), fora da
tabulação,
não anunciado por leitor de tela e com nome fora do vocabulário que as heurísticas de
autofill reconhecem. Quem o preenche recebe **sucesso falso** com zero I/O — sem
agendamento, sem cliente, sem WhatsApp, sem lembrete. Bot que recebe erro tenta de novo;
bot que recebe sucesso vai embora. A mentira mora só aqui, onde a certeza de bot é alta.

### Alternativa considerada e NÃO escolhida: RPC atômica no Postgres

O ROADMAP registrava a escolha do backend como decisão do owner com a instrução explícita
de **"escolher um e desprovisionar ou documentar o outro"**. O outro é este, e o racional
da recusa (D-01 do contexto da Phase 03) fica registrado para que ninguém reabra a
discussão sem argumento novo:

- **Orçamento de escrita do Supabase.** Contador de abuso vive num endpoint anônimo — quem
  decide quantos incrementos acontecem é o atacante. Pôr esse contador no Postgres do plano
  Free significa deixar um terceiro escolher quanto do orçamento do banco de produção é
  gasto, e a mesma instância serve a agenda real dos profissionais.
- **Janela deslizante em SQL é código próprio a manter.** A lib traz `slidingWindow`
  pronto, com `ephemeralCache` e timeout, por HTTP/REST.
- **Nenhum fornecedor novo entra na conta.** Upstash já é dependência de produção pelo
  QStash — é a mesma conta, o mesmo painel e o mesmo publicador no registro npm.

**O que se perde escolhendo Redis:** a vantagem real da RPC era zero superfície nova de
infraestrutura — um backend a menos para provisionar, monitorar e pagar. Foi o custo aceito.

**O Redis da Railway não serve como substituto.** Ele pertence à stack da Evolution API e
fala **TCP**; `@upstash/ratelimit` é HTTP/REST. Não é preferência, é incompatibilidade.

### Consequência operacional

`UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` estão na lista de **obrigatórias em
produção** de `src/lib/env.ts`: sem elas o boot de produção encerra com código 1 nomeando
as duas. É deliberado — rate limiter desligado em silêncio é exatamente o falso-verde que
esta defesa existe para eliminar. Em dev, ausência = **no-op declarado com aviso no
console**, e `pnpm build`/`pnpm dev` seguem funcionando. O provisionamento é ação do owner
e gate de deploy: ver `docs/PENDENCIAS.md`.

---

## ⚠️ AVISO IMPORTANTE: Tecnologias Descartadas (Pivô)

Durante as etapas de concepção inicial, foram cogitadas algumas tecnologias que foram **oficialmente descontinuadas e substituídas**. Sob nenhuma circunstância utilize ou instale:

* ❌ **Prisma / Drizzle:** Descartados. O banco é acessado diretamente pelo cliente Supabase.
* ❌ **better-auth:** Substituído pelo **Clerk**.
* ❌ **Mercado Pago:** Substituído pelo **Asaas**.

Qualquer código ou referência remanescente a estas três tecnologias em arquivos legados deve ser desconsiderado ou ativamente refatorado para a Stack Oficial.
