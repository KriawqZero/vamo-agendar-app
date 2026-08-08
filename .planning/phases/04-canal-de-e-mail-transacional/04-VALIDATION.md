---
phase: 4
slug: canal-de-e-mail-transacional
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-07
---

# Phase 4 — Validation Strategy

> Contrato de validação da fase, usado para amostragem de feedback durante a execução.
> Derivado de `04-RESEARCH.md` §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.10 |
| **Config file** | `vitest.config.ts` (alias `@` → `src`; `env` com stubs de módulo) |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test && pnpm lint && npx tsc --noEmit && pnpm build` |
| **Integration (opt-in)** | `EXIGIR_INTEGRACAO=1 vitest run` |
| **Estimated runtime** | ~10 s (`pnpm test`); suíte completa dominada pelo `pnpm build` |

---

## Sampling Rate

- **After every task commit:** `pnpm test`
- **After every plan wave:** `pnpm test && pnpm lint && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** os quatro verdes + `pnpm build`
- **Max feedback latency:** ~10 s no comando rápido

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 04-01 | 1 | EML-01 | Tabela tb_email_log + índice único parcial | db | pnpm test | ✅ | ✅ green |
| 04-01-02 | 04-01 | 1 | EML-01 | Tipos TypeScript da base | type | npx tsc --noEmit | ✅ | ✅ green |
| 04-01-03 | 04-01 | 1 | EML-01 | Suítes de integração generalizadas | config | pnpm test | ✅ | ✅ green |
| 04-02-01 | 04-02 | 1 | EML-01 | Layout base React Email | unit | pnpm test | ✅ | ✅ green |
| 04-02-02 | 04-02 | 1 | EML-01/04 | Template BoasVindas com /book/[slug] | unit | pnpm test | ✅ | ✅ green |
| 04-02-03 | 04-02 | 1 | EML-01 | Teste de renderização HTML | unit | pnpm test src/emails/__tests__/BoasVindas.test.tsx | ✅ | ✅ green |
| 04-03-01 | 04-03 | 2 | EML-01 | Serviço orquestrador de envio de e-mail | unit | pnpm test | ✅ | ✅ green |
| 04-03-02 | 04-03 | 2 | EML-01 | Gatilho no DashboardLayout | integration | pnpm test && npx tsc --noEmit | ✅ | ✅ green |
| 04-03-03 | 04-03 | 2 | EML-01 | Teste idempotência e retentativa | unit | pnpm test src/lib/__tests__/email-boas-vindas.test.ts | ✅ | ✅ green |
| 04-04-01 | 04-04 | 2 | EML-06 | Route handler /api/webhooks/resend | integration | pnpm test | ✅ | ✅ green |
| 04-04-02 | 04-04 | 2 | EML-06 | Testes Svix e NUNCA-PII | unit | pnpm test src/app/api/webhooks/resend/__tests__/route.test.ts | ✅ | ✅ green |
| 04-05-01 | 04-05 | 2 | EML-04 | Validação e Server Action de emailContato | unit | pnpm test src/app/actions/__tests__/perfis-empresas.test.ts | ✅ | ✅ green |
| 04-05-02 | 04-05 | 2 | EML-04 | Campo UI de e-mail de contato | ui | pnpm test && npx tsc --noEmit | ✅ | ✅ green |
| 04-06-01 | 04-06 | 3 | EML-01..06 | Atualização do mapa de validação | docs | pnpm test | ✅ | ✅ green |
| 04-06-02 | 04-06 | 3 | EML-01..06 | Registro de pendências do owner | docs | git status | ✅ | ✅ green |
| 04-06-03 | 04-06 | 3 | EML-01..06 | Execução do gate completo de 4 comandos | gate | pnpm test && pnpm lint && npx tsc --noEmit && pnpm build | ✅ | ✅ green |

---

## Success Criteria → prova

| SC | Comportamento | Tipo | Evidência | Existe? |
|----|---------------|------|-----------|---------|
| **SC1** | Conta nova recebe e-mail com o `/book/[slug]` | unit | HTML contém o link absoluto do slug; `idempotencyKey === 'boas-vindas/<tenantId>'`; INSERT antes do envio | ✅ `email-boas-vindas.test.ts` |
| SC1 | Segunda carga do dashboard não reenvia | unit | `23505` no INSERT ⇒ `enviarEmail` não é chamado | ✅ `email-boas-vindas.test.ts` |
| SC1 | Falha de envio libera a trava | unit | `enviarEmail` `{ ok:false }` ⇒ `UPDATE status='falhou'` | ✅ `email-boas-vindas.test.ts` |
| **SC2** (metade desta fase) | `"<Estabelecimento> via VamoAgendar" <naoresponda@…>` | unit | `src/lib/__tests__/email-remetente.test.ts` | ✅ existe |
| SC2 | `replyTo` ausente não bloqueia o envio (D-03) | unit | `src/lib/__tests__/email-enviar.test.ts` | ✅ existe |
| **SC3** | Assinatura inválida ⇒ 401 | unit | `route.test.ts` | ✅ existe |
| SC3 | `source_id: null` ⇒ 200 sem I/O | unit | `route.test.ts` | ✅ existe |
| SC3 | Cruzamento `source_id` → `tenant_id` + Issue sintética | unit | `route.test.ts` | ✅ existe |
| SC3 | 🔒 nunca-PII | unit | `route.test.ts` | ✅ existe |
| SC3 | Supressão real chega e é processada | **UAT humano** | owner suprime endereço no painel do Resend e confere a Issue no Sentry | Dono: owner |
| **SC4** | Chegada em Gmail / Outlook / domínio corporativo, com a aba registrada | **UAT humano** | registrar destinatário, cliente e aba (Principal / Promoções / Spam) | Dono: owner |

---

## Wave 0 Requirements

- [x] `src/lib/__tests__/email-boas-vindas.test.ts` — SC1 (orquestração, idempotência, retentativa)
- [x] `src/app/api/webhooks/resend/__tests__/route.test.ts` — SC3 (assinatura, `source_id` nulo, nunca-PII)
- [x] Suíte de integração do índice único parcial + generalizar `vitest.config.ts` e `package.json`
- [x] Casos de teste em `src/lib/__tests__/email-enviar.test.ts` e `src/app/actions/__tests__/perfis-empresas.test.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chegada em Gmail, Outlook e domínio corporativo, com a aba registrada | EML-01 (SC4) | Classificação de caixa de entrada é decisão de terceiro; nenhum executor observa | Enviar o boas-vindas para uma caixa de cada provedor e registrar destinatário, cliente e aba (Principal / Promoções / Spam). **Dono: owner** |
| Supressão real processada ponta a ponta | EML-06 (SC3) | Depende do webhook provisionado no painel do Resend | Suprimir um endereço no painel e conferir a Issue sintética no Sentry. **Dono: owner** |
| Webhook + segredo provisionados no Resend | EML-06 | Ação de painel, fora do código | Criar o endpoint, assinar `suppression.added`, publicar o segredo no Railway **antes** de `RESEND_WEBHOOK_SECRET` entrar em `OBRIGATORIAS_EM_PRODUCAO`. **Dono: owner** |
| Rastreamento de abertura/clique DESLIGADO no domínio | EML-01 (SC4) | Configuração de painel | Conferir no painel do Resend. **Dono: owner** |
| SPF no subdomínio + DMARC `p=none` com `rua` | EML-01 (SC4) | Registro DNS | Dois registros TXT. Não bloqueiam o envio; sem eles não há relatório. **Dono: owner** |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated
