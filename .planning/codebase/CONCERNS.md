# Codebase Concerns

**Analysis Date:** 2026-07-20

> Fonte primária: `docs/PENDENCIAS.md` (lista viva, auditada em código/banco pelo próprio time) + varredura de código. Muitos itens abaixo são **conscientemente adiados** para a etapa "Obrigatório antes do lançamento público" — não são desconhecidos, são dívidas priorizadas.

## Tech Debt

**Políticas RLS `anon` largas demais (Data API exposta):**
- Issue: INSERT `anon` em `agendamentos`/`clientes` exige apenas `tenant_id IS NOT NULL` — qualquer visitante escreve direto pela Data API, contornando a Server Action (engine, validações, gating de plano), inclusive forjando `status`/`data_hora`. SELECT `anon` em `agendamentos` é `USING (true)` com todas as colunas (agenda completa de todos os tenants listável, incluindo `cliente_id`); `excecoes_agenda` expõe `motivo` de bloqueios.
- Files: `supabase/schemas/06_clientes.sql`, `supabase/schemas/07_agendamentos.sql`, `supabase/schemas/04_excecoes_agenda.sql`, `supabase/schemas/08_assinaturas.sql`, `supabase/schemas/01_perfis_empresas.sql`
- Impact: bypass total das proteções da action; vazamento de dados operacionais entre tenants.
- Fix approach: remover políticas de INSERT `anon` (escrita operacional já migrou para `createAdminClient()` pós-validação na action — P0.2), estreitar SELECTs com GRANT por coluna (padrão já usado em `assinaturas`), `revoke insert/update/delete` em `assinaturas` para `anon`/`authenticated`.

**FK `assinaturas.tenant_id` com `ON DELETE CASCADE`:**
- Issue: tenant que apaga o próprio perfil destrói a linha de assinatura/vínculo Asaas.
- Files: `supabase/schemas/08_assinaturas.sql`
- Impact: perda de histórico de billing.
- Fix approach: trocar para `RESTRICT` (migration via `supabase db diff`).

**FKs de `agendamentos` sem pertencimento conjunto:**
- Issue: `cliente_id` e `servico_id` são validados individualmente, mas nada garante no banco que ambos pertencem ao mesmo `tenant_id` do agendamento (validação só na action).
- Files: `supabase/schemas/07_agendamentos.sql`
- Fix approach: FK composta `(tenant_id, servico_id)` ou trigger.

**Limite de serviços checado só na aplicação:**
- Issue: duas criações simultâneas podem ultrapassar o limite do plano (checagem app-layer por design).
- Files: `src/app/actions/servicos.ts`
- Fix approach: trigger no banco, se/quando o billing real exigir.

**`WhatsappClient.tsx` fora do sistema de tokens visuais:**
- Issue: usa `zinc-*`/`emerald` herdados em vez dos tokens `palco/bastidor/fio/giz/marca` — página destoa da área logada.
- Files: `src/app/dashboard/whatsapp/WhatsappClient.tsx` (754 linhas, também um dos maiores arquivos)
- Impact: só visual/consistência; sem impacto funcional.

**Melhorias baratas pendentes (P1.9):**
- Queries de contagem do checklist de onboarding não checam `error` (falha silenciosa vira "não configurado") e rodam sequenciais — `src/app/dashboard/page.tsx`; paralelizar com `Promise.all`.
- Falta `cache()` (React) em `obterAssinaturaVigente` — `src/lib/assinaturas.ts` (layout + page da rota `/dashboard/plano` consultam duas vezes).
- `<a href="/dashboard/plano">` deveria ser `<Link>` em `src/app/dashboard/servicos/ServicosClient.tsx:151` e `src/app/dashboard/agenda/AgendaClient.tsx:310`.

**Configurações do painel Clerk possivelmente não aplicadas (P1.10):**
- Issue: limite de criação de org = 1, criação automática da primeira org, membership limit = 1, remoção de permissões `org:sys_memberships`/`org:sys_domains`, e `hidePersonal` no `<OrganizationSwitcher>` (verificado 2026-07-11: não aplicado no código).
- Files: layout do dashboard (`src/app/dashboard/layout.tsx`) + painel Clerk (fora do repo).

## Known Bugs

**Engine ignora agendamento que atravessa a meia-noite:**
- Symptoms: agendamento iniciado à noite da véspera com duração longa não é subtraído dos slots do dia seguinte — double-booking possível na madrugada.
- Files: `src/lib/booking-engine.ts:266-282` (`limitesDoDia` filtra `data_hora` dentro do próprio dia)
- Trigger: janelas noturnas + serviços longos (raro no perfil atual de tenants).
- Workaround: não aceitar tenants com horário estendido até corrigir (registrado em PENDENCIAS pré-lançamento).

**Duração assumida de 30 min para serviço desativado:**
- Symptoms: quando o join `servicos(duracao_minutos)` não retorna (serviço desativado é invisível para `anon`), a engine assume 30 min — janela ocupada pode ficar menor que a real e liberar slot sobreposto.
- Files: `src/lib/booking-engine.ts:143`
- Fix approach: desnormalizar `duracao_minutos` no agendamento ou lookup privilegiado.

**Corrida estreita em `handleSalvarHorarios`:**
- Symptoms: salvar aba Perfil e submeter Horários antes do `router.refresh()` propagar regrava o perfil com valores pré-refresh.
- Files: `src/app/dashboard/agenda/AgendaClient.tsx` (~linhas 350-366)
- Trigger: dois submits em sequência rápida; dano limitado (reverte para valor já persistido).

**`adicionarJanela` sugere janela inválida `23:59–23:59`:**
- Files: `src/app/dashboard/agenda/AgendaClient.tsx:262-273` (via `somarMinutos`)
- Trigger: janela anterior do dia termina às 23:59. Validação visual bloqueia o save (sem corrupção) — beco de UX apenas.

## Security Considerations

**Webhook de lembrete — secret fraco em query string:**
- Risk: o secret trafega em query param e o fallback `'secret-key'` vale nos dois lados quando `QSTASH_CURRENT_SIGNING_KEY` não está setada — endpoint aberto se a env faltar em produção.
- Files: `src/app/api/webhooks/lembrete/route.ts` (linhas 12-20)
- Current mitigation: env obrigatória em produção (por convenção, não por código); webhook re-checa status do agendamento.
- Recommendations: falhar hard sem a env; migrar para verificação da assinatura real do QStash (header `Upstash-Signature`).

**Data API `anon` (ver Tech Debt acima):**
- Risk: escrita e leitura direta contornando a action é a maior superfície pública hoje. Bloqueia também o rate limiting (proteção na action é inútil enquanto o INSERT direto existir).

**Ausência de rate limiting/anti-abuso no booking público:**
- Risk: script pode lotar a agenda de um profissional (sem rate limit, honeypot ou CAPTCHA — nada existe).
- Files: `src/app/actions/public-booking.ts`, `src/proxy.ts`, `src/app/book/[slug]/BookingApp.tsx`
- Recommendations (já registradas): Upstash Ratelimit por IP/telefone/tenant + honeypot; depende do hardening da Data API primeiro.

**LGPD / privacidade:**
- Risk: fluxo público coleta nome + telefone sem política de privacidade final, sem fluxo de exclusão/exportação de dados.
- Current mitigation: `disparos_whatsapp` já é log sem conteúdo nem telefone (by design).
- Recommendations: itens da seção pré-lançamento de `docs/PENDENCIAS.md`.

## Performance Bottlenecks

**Poucos gargalos reais na fase atual (dev, sem tráfego).** Pontos registrados:
- Queries sequenciais do dashboard (`src/app/dashboard/page.tsx`) — paralelizar.
- Dupla busca de assinatura por request na rota `/dashboard/plano` — `cache()` em `src/lib/assinaturas.ts`.
- Padrão RLS já correto: `auth.jwt()` sempre em subquery (initPlan) — manter em políticas novas.

## Fragile Areas

**Contrato engine ↔ action pública:**
- Files: `src/lib/booking-engine.ts`, `src/app/actions/public-booking.ts`
- Why fragile: a prevenção de double-booking depende de igualdade exata de `datetime` entre a saída da engine e o valor submetido — mudar o formato da saída quebra o contrato silenciosamente.
- Safe modification: qualquer mudança na forma dos slots exige atualizar a validação em `public-booking.ts` e os testes de `src/lib/__tests__/booking-engine.test.ts` juntos.
- Test coverage: engine bem coberta (442 linhas de teste); o contrato em si não tem teste de integração.

**Double-booking não é atômico:**
- Files: `src/app/actions/public-booking.ts`, `supabase/schemas/07_agendamentos.sql`
- Why fragile: o recálculo da engine antes do INSERT não elimina a corrida entre duas requisições simultâneas — ambas veem o slot livre e ambas inserem. Nenhuma exclusion constraint no banco.
- Safe modification: solução planejada (pré-lançamento) é exclusion constraint com `tstzrange` sobre `tenant_id` + intervalo, considerando a duração do serviço; agendamento manual (`src/app/actions/agendamentos.ts`) deve adotar a mesma proteção.

**Clients monolíticos do dashboard:**
- Files: `src/app/dashboard/agenda/AgendaClient.tsx` (1074 linhas), `src/app/dashboard/whatsapp/WhatsappClient.tsx` (754), `src/app/dashboard/DashboardClient.tsx` (706), `src/app/dashboard/NovoAgendamentoModal.tsx` (656)
- Why fragile: muito estado local entrelaçado num arquivo só; as duas corridas de UX conhecidas vivem em `AgendaClient.tsx`.
- Safe modification: mudanças pontuais com verificação manual mobile-first; sem testes de componente hoje.

**Mensageria WhatsApp (Evolution/Baileys):**
- Files: `src/app/actions/whatsapp.ts`, `src/lib/whatsapp-helper.ts`, `src/lib/notificacoes-agendamento.ts`, `src/app/api/webhooks/lembrete/route.ts`
- Why fragile: depende de gateway não-oficial (Baileys — risco de bloqueio cresce com volume); falha de mensageria deve ser silenciosa para o cliente final mas visível ao profissional — regra a preservar em qualquer mudança. Estado atual validado só com mocks; verificação em piloto real recomendada.

**Personalização pública sanitizada por plano:**
- Files: `src/app/actions/public-booking.ts` (`obterDadosBookingPublico`), `src/lib/assinaturas.ts`, `src/lib/planos.ts`
- Why fragile: UI pública NUNCA pode ler `cor_marca`/`logo_url`/`capa_url` cruas — sempre via chave `personalizacao` sanitizada pelo plano vigente. Ler direto vaza recurso Pro para tenants gratuitos.

**Storage sem RLS em `storage.objects`:**
- Files: `src/app/actions/imagens-perfil.ts`, `docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md`
- Why fragile: role postgres não é owner de `storage.objects` neste projeto — toda a segurança do bucket `imagens-perfis` está nas actions (auth + gating Pro + `createAdminClient()`). Qualquer escrita de Storage fora dessas actions fura o modelo. Migrations de Storage são manuais (exceção ao fluxo declarativo).

## Scaling Limits

- **Evolution API/Baileys:** confiável apenas para pilotos controlados; migração para WhatsApp Cloud API oficial é gatilho pós-evidência (`docs/PENDENCIAS.md`, "Depois de evidência").
- **Fase DEV do banco:** migrations editáveis e hard reset permitidos — regras de imutabilidade (`.claude/hooks/migrations-prod.md`) só ativam no go-live. Aplicar `VALIDATE CONSTRAINT` em produção exige pre-flight contra dados legados (ex.: `ck_hora_fim_apos_inicio`).
- **Multi-profissional/multi-filial:** fora do modelo atual (1 tenant = 1 agenda); expansão desenhada mas condicionada a evidência.

## Dependencies at Risk

**Evolution API (Baileys, não-oficial):**
- Risk: bloqueio pelo WhatsApp aumenta com volume; sem SLA.
- Impact: funcionalidade mais crítica do produto (motivo principal de pagar o Pro).
- Migration plan: WhatsApp Cloud API oficial, gatilho definido em `docs/PENDENCIAS.md`.

**Resend:**
- Risk: listado na stack oficial mas não usado em lugar nenhum do código — promessa de "e-mail" não existe (P1.8). E-mail saiu da UI pública em 2026-07-17; regra-alvo "pelo menos um dos dois" fica pendente até o envio existir.

## Missing Critical Features

- **Checkout Asaas + webhooks de cobrança** (`/api/webhooks/asaas` não existe): bloqueia cobrança automática; roadmap em `docs/07-PLANOS_E_MONETIZACAO.md`. Pré-requisito: refazer auditoria da Data API.
- **Cancelamento/reagendamento pelo cliente final:** inexistente; exige decisão sobre link seguro sem login (Fricção Zero).
- **Período de carência da inadimplência:** indefinido (hoje mantém benefícios + banner sem prazo).
- **Observabilidade de produção:** sem error tracking/alertas (log de disparos cobre só mensageria).

## Test Coverage Gaps

**Cobertura atual:** apenas 4 suites unitárias de `src/lib/` — `booking-engine.test.ts`, `horarios.test.ts`, `timezone.test.ts`, `whatsapp-helper.test.ts` (Vitest).

**Sem nenhum teste:**
- Server Actions (`src/app/actions/*.ts`) — incluindo `public-booking.ts`, o caminho mais crítico e exposto. Risk: regressão no fluxo público passa despercebida. Priority: High.
- Pertencimento multi-tenant / políticas RLS (IDs cruzados rejeitados) — Priority: High (pré-lançamento).
- Concorrência de agendamento (corrida nunca gera sobreposição) — Priority: High (depende da constraint atômica).
- Componentes/UI (nenhum teste de componente) — Priority: Low nesta fase.
- Webhook de lembrete (`src/app/api/webhooks/lembrete/route.ts`) — Priority: Medium.

**Asserts frouxos:** `src/lib/__tests__/horarios.test.ts` (ex. linhas 18, 33, 83, 87, 91) checam só `not.toBeNull()` em rejeições, sem travar a mensagem de erro — Priority: Low.

---

*Concerns audit: 2026-07-20*
