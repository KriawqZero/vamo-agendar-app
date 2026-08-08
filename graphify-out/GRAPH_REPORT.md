# Graph Report - .  (2026-08-05)

## Corpus Check
- Large corpus: 1039 files · ~2,708,298 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 946 nodes · 1877 edges · 73 communities (58 shown, 15 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 44 edges (avg confidence: 0.82)
- Token cost: 384,603 input · 0 output

## Community Hubs (Navigation)
- Actions de Serviços e Imagens
- Agendamentos do Dashboard
- Clientes e UI do Dashboard
- Landing e Componentes Visuais
- Instrumentação PostHog e Sentry
- Integridade da Agenda no Banco
- Contrato Anti-PII e Fail-fast
- Horários, Exceções e Perfil
- Booking Público (UI)
- Dependências de Desenvolvimento
- Dependências de Produção
- E-mail Resend e MCP
- Configuração TypeScript
- Rate Limit e Emissão Pós-Resposta
- Testes de Validação do Booking
- Mensagens e Copy Pública
- Schemas Declarativos do Supabase
- Planos e Perfil Público
- Testes de Escrita do Booking
- Clerk, RLS e Server Actions
- Gating de Plano e Layout
- Observabilidade da Mensageria
- Anti-abuso do Booking Público
- Teste de Corrida do Booking
- Asaas, Inadimplência e Funil
- Privilégios da Data API
- Fail-fast de Env e Boot
- Tipos do Booking Público
- Stack Oficial e WhatsApp
- Migration Baseline do Schema
- Fluxo de Migrations e Comandos
- Testes de Rate Limit
- Teste do Campo Honeypot
- Layout Raiz e Fontes
- Contrato de Runtime Node
- Migration Disparos WhatsApp
- Simulação de Inadimplência
- Proxy e Rotas Públicas
- Migration Assinaturas
- Config ESLint
- Config Next.js
- Config PostCSS
- Nomenclatura do Banco
- Tabela horarios_funcionamento
- Tabela whatsapp_configs
- Tabela perfis_empresas (base)
- Tabela perfis_empresas (schema)
- Tabela perfis_empresas (slug)
- Tabela perfis_empresas (personalização)
- Tabela perfis_empresas (migration)
- Tabela agendamentos

## God Nodes (most connected - your core abstractions)
1. `createClient` - 49 edges
2. `criarAgendamentoPublico()` - 25 edges
3. `obterAssinaturaVigente` - 25 edges
4. `hashTenantId()` - 22 edges
5. `capturarEventoTenant()` - 21 edges
6. `obterSlotsDisponiveis()` - 19 edges
7. `dispararNotificacoesAgendamento()` - 19 edges
8. `diaLocal()` - 19 edges
9. `PLANOS` - 18 edges
10. `classesAcento` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Instruções de review por caminho (path_instructions)` --implements--> `Server Components por padrão, ilhas client mínimas`  [EXTRACTED]
  .coderabbit.yaml → docs/04-PADROES_DE_FRONTEND.md
- `Instruções de review por caminho (path_instructions)` --implements--> `Validação severa na Server Action pública (porteiro do banco)`  [EXTRACTED]
  .coderabbit.yaml → docs/05-PRODUTO_E_VISAO.md
- `GlobalError()` --references--> `Sentry`  [EXTRACTED]
  src/app/global-error.tsx → .mcp.json
- `emitirLogSentryAguardando()` --references--> `Sentry`  [EXTRACTED]
  src/lib/observabilidade/log.ts → .mcp.json
- `reportarExcecaoAguardando()` --references--> `Sentry`  [EXTRACTED]
  src/lib/observabilidade/reportar.ts → .mcp.json

## Import Cycles
- 3-file cycle: `src/app/book/[slug]/BookingApp.tsx -> src/app/book/[slug]/PainelMarca.tsx -> src/app/book/[slug]/ResumoAgendamento.tsx -> src/app/book/[slug]/BookingApp.tsx`
- 3-file cycle: `src/app/book/[slug]/BookingApp.tsx -> src/app/book/[slug]/PainelMarca.tsx -> src/app/book/[slug]/StepperVertical.tsx -> src/app/book/[slug]/BookingApp.tsx`

## Hyperedges (group relationships)
- **Defesa anti-abuso do booking público (Phase 03)** — docs_01_arquitetura_e_stack_anti_abuso_booking_publico, docs_01_arquitetura_e_stack_camadas_rate_limit, docs_01_arquitetura_e_stack_honeypot, docs_01_arquitetura_e_stack_fail_open, docs_01_arquitetura_e_stack_hash_com_sal, docs_01_arquitetura_e_stack_ip_do_visitante, docs_01_arquitetura_e_stack_teto_tenant_criacoes, docs_01_arquitetura_e_stack_bloqueio_e_resposta_honesta, docs_05_produto_e_visao_friccao_zero [EXTRACTED 1.00]
- **Isolamento multi-tenant Clerk → JWT → RLS → privilégios da Data API** — docs_01_arquitetura_e_stack_modelo_b2b2c, docs_02_supabase_clerk_integration_integracao_nativa, docs_02_supabase_clerk_integration_cliente_supabase_servidor, docs_02_supabase_clerk_integration_rls_initplan, docs_03_padroes_de_banco_de_dados_rls_obrigatorio, docs_03_padroes_de_banco_de_dados_privilegios_data_api, docs_03_padroes_de_banco_de_dados_role_anonima_sem_privilegio, docs_02_supabase_clerk_integration_cliente_privilegiado [EXTRACTED 1.00]
- **Ciclo de vida da mensageria WhatsApp (config → disparo → auditoria → gating)** — docs_06_mensageria_e_whatsapp_fluxo_mensageria, docs_06_mensageria_e_whatsapp_whatsapp_configs, docs_06_mensageria_e_whatsapp_evolution_api_v2, docs_06_mensageria_e_whatsapp_maquina_de_estados, docs_06_mensageria_e_whatsapp_disparos_whatsapp, docs_07_planos_e_monetizacao_defesa_em_profundidade_disparos, claude_observabilidade_mensageria_quatro_pilares, claude_regra_falha_silenciosa [EXTRACTED 1.00]
- **Contrato anti-PII travado por teste (Sentry + PostHog)** — docs_09_observabilidade_e_email_contrato_anti_pii, docs_09_observabilidade_e_email_opcoes_posthog, docs_09_observabilidade_e_email_opcoes_sentry, docs_09_observabilidade_e_email_sanitizar_evento_sentry, docs_09_observabilidade_e_email_sanitizar_log_sentry, docs_09_observabilidade_e_email_log_operacional, docs_09_observabilidade_e_email_erro_sintetico_supabase, docs_09_observabilidade_e_email_travas_por_teste [EXTRACTED 1.00]
- **Anti-abuso do booking público (Phase 03) e seu gate de deploy** — docs_pendencias_rate_limiting_anti_abuso, docs_pendencias_rate_limit_quatro_camadas, docs_pendencias_honeypot_sucesso_falso, docs_pendencias_provisionamento_upstash_redis, docs_pendencias_risco_fail_open_cota_upstash, docs_pendencias_issue_ratelimit_redis_unavailable [EXTRACTED 1.00]
- **Gating do sistema de planos nas Server Actions** — docs_superpowers_plans_2026_07_09_sistema_de_planos_planos_ts, docs_superpowers_plans_2026_07_09_sistema_de_planos_obter_assinatura_vigente, docs_superpowers_plans_2026_07_09_sistema_de_planos_limite_servicos_ativos, docs_superpowers_plans_2026_07_09_sistema_de_planos_gating_whatsapp_pro, docs_superpowers_plans_2026_07_09_sistema_de_planos_slug_aleatorio_free, docs_superpowers_plans_2026_07_09_sistema_de_planos_tabela_assinaturas [EXTRACTED 1.00]

## Communities (73 total, 15 thin omitted)

### Community 0 - "Actions de Serviços e Imagens"
Cohesion: 0.06
Nodes (60): assinaturaConfere(), CONFIG_IMAGENS, enviarImagemPerfil(), EXTENSAO_POR_MIME, removerArquivosDoTipo(), removerImagemPerfil(), TipoImagemPerfil, excluirServico() (+52 more)

### Community 1 - "Agendamentos do Dashboard"
Cohesion: 0.09
Nodes (44): atualizarStatusAgendamento(), buscarConflitoWalkin(), ConflitoWalkin, criarAgendamentoManual(), CriarAgendamentoManualParams, ListarParams, obterSlotsDashboard(), remarcarAgendamento() (+36 more)

### Community 2 - "Clientes e UI do Dashboard"
Cohesion: 0.07
Nodes (49): listarAgendamentos(), listarClientes(), EtapaContato(), EtapaContatoProps, Agendamento, brl(), Cliente, DashboardClient() (+41 more)

### Community 3 - "Landing e Componentes Visuais"
Cohesion: 0.06
Nodes (33): DemoAgendamento(), DiaDemo, Etapa, HORARIOS_DEMO, ServicoDemo, SERVICOS_DEMO, DiaNoite(), LogoMarca() (+25 more)

### Community 4 - "Instrumentação PostHog e Sentry"
Cohesion: 0.07
Nodes (42): onRouterTransitionStart, HOST_POSTHOG_PADRAO, hostPostHog(), opcoesInitPostHog, opcoesServidorPostHog, dsnDoSentry(), AtributosLogOperacional, CHAVES_DE_HASH (+34 more)

### Community 5 - "Integridade da Agenda no Banco"
Cohesion: 0.05
Nodes (46): Downgrade para Gratuito = ausência de linha vigente, Índice único: uma linha ativa/inadimplente por tenant, Exclusion constraint ag_sem_sobreposicao (23P01), Objeto criado pelo caminho da plataforma escapa da default privilege, Direção do owner: produto agora, lançamento depois, Fallback de duração 30 min quando o join de serviço não retorna, Grade anti-buraco (gerarSlotsAntiBuraco), Hardening da Data API para anon (Phase 1) (+38 more)

### Community 6 - "Contrato Anti-PII e Fail-fast"
Cohesion: 0.05
Nodes (45): Allowlist, não denylist (campo novo cai fora por construção), ANALYTICS_TENANT_SALT — salt imutável de pseudonimização, Condição esperada de negócio não vai ao Sentry, Contrato anti-PII do booking público, Critério da lista de env obrigatórias: falha em silêncio ou falha tarde, Custo conhecido: +73,6 KB gzip do SDK client em /book/[slug], encerrarBootPorEnvAusente (src/lib/env-boot.ts), enviarEmail — wrapper do Resend que nunca lança (+37 more)

### Community 7 - "Horários, Exceções e Perfil"
Cohesion: 0.09
Nodes (38): ExcecaoInput, excluirExcecaoAgenda(), HorarioFuncionamentoInput, listarExcecoesAgenda(), listarHorariosFuncionamento(), salvarExcecaoAgenda(), salvarHorariosFuncionamento(), ConfiguracoesAgendamentoInput (+30 more)

### Community 8 - "Booking Público (UI)"
Cohesion: 0.12
Nodes (32): classesAcento, BarraInferior(), BarraInferiorProps, BookingApp(), BookingAppProps, DataDisponivel, EtapaBooking, PerfilPublico (+24 more)

### Community 9 - "Dependências de Desenvolvimento"
Cohesion: 0.06
Nodes (34): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, prettier, tailwindcss, @tailwindcss/postcss (+26 more)

### Community 10 - "Dependências de Produção"
Cohesion: 0.06
Nodes (33): @clerk/localizations, @clerk/nextjs, @clerk/ui, next, next-themes, dependencies, @clerk/localizations, @clerk/nextjs (+25 more)

### Community 11 - "E-mail Resend e MCP"
Cohesion: 0.10
Nodes (22): Sentry, supabase, GlobalError(), CLASSIFICACAO, classificarErroResend(), CodigoResend, enviarEmail(), MotivoFalhaEmail (+14 more)

### Community 12 - "Configuração TypeScript"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 13 - "Rate Limit e Emissão Pós-Resposta"
Cohesion: 0.19
Nodes (20): criarAgendamentoPublico(), logarRotinaDepoisDaResposta(), emitirDepoisDaResposta(), permitirEmissao(), permitirUmaVezPorProcesso(), reiniciarEmissoes(), ultimaEmissaoPorChave, hashComSal() (+12 more)

### Community 14 - "Testes de Validação do Booking"
Cohesion: 0.10
Nodes (17): obterDadosBookingPublico(), adminFake, { capturarEventoServidorMock, capturarEventoTenantMock }, { createAdminClientMock }, { dispararNotificacoesAgendamentoMock }, { logAguardandoMock, logOperacionalMock }, { obterSlotsDisponiveisMock }, PARAMS_VALIDOS (+9 more)

### Community 15 - "Mensagens e Copy Pública"
Cohesion: 0.17
Nodes (18): MotivoPublico, COPIA_DA_CAIXA_DE_HORARIOS, COPIA_DO_ENVIO, COPY_CAMPOS_OBRIGATORIOS, COPY_DATA_INVALIDA, COPY_EMAIL_INVALIDO, COPY_ERRO_CONFIRMACAO, COPY_ERRO_CONTATO (+10 more)

### Community 16 - "Schemas Declarativos do Supabase"
Cohesion: 0.12
Nodes (9): perfis_empresas, servicos, horarios_funcionamento, excecoes_agenda, whatsapp_configs, clientes, agendamentos, assinaturas (+1 more)

### Community 17 - "Planos e Perfil Público"
Cohesion: 0.16
Nodes (14): lerPerfilPor(), resolverPerfilPublicoPorSlug(), comLeituraDePlanoFalhando(), AssinaturaVigente, GRATUITO, obterPlanoVigentePublico(), PlanoVigentePublico, rotuloSeguro() (+6 more)

### Community 18 - "Testes de Escrita do Booking"
Cohesion: 0.15
Nodes (12): AgendamentoCriado, ehDataDeCalendario(), obterSlotsPublicos(), bannerPulo(), credenciais, criarComSucesso(), limparTenantDeTeste(), NOMES_CREDENCIAIS (+4 more)

### Community 19 - "Clerk, RLS e Server Actions"
Cohesion: 0.18
Nodes (14): Configuração de code review do CodeRabbit (pt-BR, perfil assertivo), Instruções de review por caminho (path_instructions), Definition of Done do VamoAgendar, Modelo de negócio multi-tenant B2B2C, Tecnologias descartadas no pivô (Prisma/Drizzle, better-auth, Mercado Pago), Cliente Supabase no servidor (createClient com token do Clerk), Configuração necessária nos dashboards Clerk e Supabase, Integração nativa Clerk↔Supabase (third-party auth) (+6 more)

### Community 20 - "Gating de Plano e Layout"
Cohesion: 0.17
Nodes (12): Marketing como premissa contínua (.marketing/), Honeypot info_adicional no formulário público, Armadilhas conhecidas de RLS (RETURNING, usuário logado em página pública, GRANT por coluna), Design mobile-first com Tailwind v4, Idiom de shell split desktop (lg: 1024px+), Layout do booking em três níveis de largura, Regra de negócio sobre pagamentos, Enforcement de plano nas Server Actions (única camada de escrita) (+4 more)

### Community 21 - "Observabilidade da Mensageria"
Cohesion: 0.21
Nodes (12): Quatro pilares de observabilidade da mensageria, Proibição de rodar os wizards do Sentry e do PostHog, Regra de Falha Silenciosa, Fluxo de telas do cliente final (/book/[slug]), Regra da Fricção Zero (B2C), Tabela disparos_whatsapp (log append-only de auditoria), Fluxo de mensageria: confirmação síncrona + lembrete assíncrono, Defesa em profundidade nos pontos de disparo (+4 more)

### Community 22 - "Anti-abuso do Booking Público"
Cohesion: 0.17
Nodes (12): Alternativa recusada: RPC atômica no Postgres como contador, Anti-abuso do booking público (rate limit + honeypot), Quatro camadas de rate limit do booking público, UPSTASH_REDIS_REST_* obrigatórias em produção, Fail-open com teto de ~500 ms, Chave de rate limit pseudonimizada (hashComSal com domínio), Determinação do IP do visitante (x-real-ip, XFF à direita), teto_tenant conta criações, não tentativas (+4 more)

### Community 23 - "Teste de Corrida do Booking"
Cohesion: 0.18
Nodes (10): Capturas, ConfigAdmin, { createAdminClientMock }, criarAdminFake(), montar(), { obterPlanoVigentePublicoMock }, { obterSlotsDisponiveisMock }, PARAMS_VALIDOS (+2 more)

### Community 24 - "Asaas, Inadimplência e Funil"
Cohesion: 0.22
Nodes (11): Bloqueio é condição esperada e a resposta é honesta, Checkout ainda não existe (upgrade 'Em breve'), Regra de inadimplência (mantém benefícios + banner), Roadmap da integração Asaas (customer, subscription, webhook), Troca manual de plano via SQL e índice único parcial, Um cliente PostHog por evento no servidor (flushAt 1 + after()), Eventos deliberadamente fora da taxonomia, Grafia: nome de evento em inglês, propriedade em pt-BR (+3 more)

### Community 25 - "Privilégios da Data API"
Cohesion: 0.20
Nodes (11): obterDadosBookingPublico fora do teto de leitura, Cliente privilegiado createAdminClient (secret key, ignora RLS), Duas armadilhas do REVOKE em function (PUBLIC e escopo global), Bucket imagens-perfis (Supabase Storage sem RLS), Checklists de criação de tabela e de function/RPC, Documentação interna do banco via COMMENT ON, Objeto novo nasce fechado (ALTER DEFAULT PRIVILEGES), Privilégios da Data API — o portão antes do porteiro (+3 more)

### Community 26 - "Fail-fast de Env e Boot"
Cohesion: 0.31
Nodes (6): onRequestError, register(), CODIGO_SAIDA_ENV_AUSENTE, encerrarBootPorEnvAusente(), OBRIGATORIAS_EM_PRODUCAO, validarEnvObrigatorio()

### Community 27 - "Tipos do Booking Público"
Cohesion: 0.20
Nodes (9): RFC-5321, AgendamentoPublicoParams, MotivoLeituraPublica, MotivoSlotsPublicos, PerfilPublicoLinha, ResolucaoPerfil, ResultadoAgendamentoPublico, ResultadoSlots (+1 more)

### Community 28 - "Stack Oficial e WhatsApp"
Cohesion: 0.25
Nodes (8): Next.js 16 tem breaking changes vs. conhecimento de treinamento, Infraestrutura totalmente gerenciada (nada roda local), Stack oficial e definitiva, Server Components por padrão, ilhas client mínimas, Integração com a Evolution API v2 (create/connect/sendText), Substituição de variáveis de template ({{cliente}}, {{empresa}}, ...), Tabela whatsapp_configs (instância + templates por tenant), VamoAgendar (SaaS B2B2C de agendamento)

### Community 29 - "Migration Baseline do Schema"
Cohesion: 0.50
Nodes (7): "public"."agendamentos", "public"."clientes", "public"."excecoes_agenda", "public"."horarios_funcionamento", "public"."perfis_empresas", "public"."servicos", "public"."whatsapp_configs"

### Community 30 - "Fluxo de Migrations e Comandos"
Cohesion: 0.29
Nodes (7): apply_migration não preserva a version do arquivo, supabase db diff não gera GRANT/REVOKE (e gera o contrário), Declarative Database Schema (supabase/schemas + db diff), Máquina de estados da conexão WhatsApp (P0.1), Testes de mensageria sem credenciais reais (mock-evolution), allowBuilds: @sentry/cli desligado de propósito, Comandos do projeto (pnpm dev/build/lint/test)

### Community 31 - "Testes de Rate Limit"
Cohesion: 0.29
Nodes (3): CamadaRateLimit, carregarModulo(), {
    limitMock,
    getRemainingMock,
    reportarMock,
    reportarSincronoMock,
    headersMock,
    configsCriadas,
}

### Community 32 - "Teste do Campo Honeypot"
Cohesion: 0.33
Nodes (4): BLOCO, FONTE_BOOKING_APP, FONTE_ETAPA_CONTATO, RAIZ

### Community 33 - "Layout Raiz e Fontes"
Cohesion: 0.33
Nodes (4): geistMono, geistSans, metadata, poppins

### Community 35 - "Migration Disparos WhatsApp"
Cohesion: 0.50
Nodes (3): "public"."disparos_whatsapp", public.agendamentos, public.perfis_empresas

### Community 36 - "Simulação de Inadimplência"
Cohesion: 0.67
Nodes (3): Simular inadimplência via SQL, Banner global de inadimplência no layout do dashboard, Inadimplência mantém os benefícios do plano + banner persistente

## Ambiguous Edges - Review These
- `Honeypot info_adicional no formulário público` → `Design mobile-first com Tailwind v4`  [AMBIGUOUS]
  docs/01-ARQUITETURA_E_STACK.md · relation: conceptually_related_to

## Knowledge Gaps
- **266 isolated node(s):** `supabase`, `eslintConfig`, `nextConfig`, `name`, `version` (+261 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Honeypot info_adicional no formulário público` and `Design mobile-first com Tailwind v4`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `UploadImagemPerfil()` connect `Actions de Serviços e Imagens` to `Dependências de Produção`, `Horários, Exceções e Perfil`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Dependências de Produção` to `Dependências de Desenvolvimento`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Why does `react` connect `Dependências de Produção` to `Actions de Serviços e Imagens`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **What connects `supabase`, `eslintConfig`, `nextConfig` to the rest of the system?**
  _266 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Actions de Serviços e Imagens` be split into smaller, more focused modules?**
  _Cohesion score 0.06460206460206461 - nodes in this community are weakly interconnected._
- **Should `Agendamentos do Dashboard` be split into smaller, more focused modules?**
  _Cohesion score 0.0855094726062468 - nodes in this community are weakly interconnected._