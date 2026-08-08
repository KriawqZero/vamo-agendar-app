---
phase: 4
slug: canal-de-e-mail-transacional
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-07
---

# Phase 4 — Validation Strategy

> Contrato de validação da fase, usado para amostragem de feedback durante a execução.
> Derivado de `04-RESEARCH.md` §"Validation Architecture". O mapa por tarefa é preenchido
> depois que os PLAN.md existirem.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.10 |
| **Config file** | `vitest.config.ts` (alias `@` → `src`; `env` com stubs de módulo) |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test && pnpm lint && npx tsc --noEmit && pnpm build` |
| **Integration (opt-in)** | `EXIGIR_INTEGRACAO=1 vitest run <suíte>` |
| **Estimated runtime** | ~10 s (`pnpm test`); suíte completa dominada pelo `pnpm build` |

⚠️ O `exclude` condicional de `vitest.config.ts:11` cita **um arquivo literal**
(`public-booking-escrita.test.ts`), e o script `test:integracao` do `package.json` aponta
para o mesmo arquivo único. Acrescentar a segunda suíte de integração desta fase exige
generalizar os dois para lista — é tarefa de Wave 0, não detalhe de implementação.

---

## Sampling Rate

- **After every task commit:** `pnpm test`
- **After every plan wave:** `pnpm test && pnpm lint && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** os quatro verdes + `pnpm build`
- **Max feedback latency:** ~10 s no comando rápido

`npx tsc --noEmit` é gate próprio e não redundante: `pnpm test` e `pnpm build` não pegam
erro de tipo em arquivo `.test.ts`.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _pendente_ | — | — | EML-01 / EML-04 / EML-06 | — | — | — | — | — | ⬜ pending |

*Preenchido por `/gsd-validate-phase` depois que os PLAN.md existirem.*
*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Success Criteria → prova

| SC | Comportamento | Tipo | Evidência | Existe? |
|----|---------------|------|-----------|---------|
| **SC1** | Conta nova recebe e-mail com o `/book/[slug]` | unit | HTML contém o link absoluto do slug; `idempotencyKey === 'boas-vindas/<tenantId>'`; INSERT antes do envio | ❌ Wave 0 |
| SC1 | Segunda carga do dashboard não reenvia | unit | `23505` no INSERT ⇒ `enviarEmail` não é chamado | ❌ Wave 0 |
| SC1 | Falha de envio libera a trava | unit | `enviarEmail` `{ ok:false }` ⇒ `UPDATE status='falhou'` | ❌ Wave 0 |
| SC1 | Trava real sob concorrência | **integração** | `EXIGIR_INTEGRACAO=1`: duas inserções concorrentes, exatamente uma sobrevive | ❌ Wave 0 |
| **SC2** (metade desta fase) | `"<Estabelecimento> via VamoAgendar" <naoresponda@…>` | unit | `src/lib/__tests__/email-remetente.test.ts` | ✅ existe |
| SC2 | `replyTo` ausente não bloqueia o envio (D-03) | unit | caso novo em `src/lib/__tests__/email-enviar.test.ts`; guarda de `para`/`assunto` intacta | ✅ arquivo existe |
| **SC3** | Assinatura inválida ⇒ 401 | unit | suíte nova do route handler (sem headers, forjada, válida) | ❌ Wave 0 |
| SC3 | `source_id: null` ⇒ 200 sem I/O | unit | mesma suíte | ❌ Wave 0 |
| SC3 | Cruzamento `source_id` → `tenant_id` + Issue sintética | unit | rótulo estático e `tenantHash`; nenhuma chamada carrega o endereço | ❌ Wave 0 |
| SC3 | 🔒 nunca-PII | unit | serializar todos os argumentos de log/Sentry/insert e afirmar ausência da string do e-mail | ❌ Wave 0 |
| SC3 | Supressão real chega e é processada | **UAT humano** | owner suprime endereço no painel do Resend e confere a Issue no Sentry | — |
| **SC4** | Chegada em Gmail / Outlook / domínio corporativo, com a aba registrada | **UAT humano** | registrar destinatário, cliente e aba (Principal / Promoções / Spam) | — |

**SC2 fecha pela metade nesta fase por decisão travada (D-04):** a metade "responder vai
para o profissional" migra para a Phase 5, onde o destinatário é o cliente final.

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/email-boas-vindas.test.ts` — SC1 (orquestração, idempotência, retentativa)
- [ ] `src/app/api/webhooks/__tests__/resend.test.ts` — SC3 (assinatura, `source_id` nulo, nunca-PII)
- [ ] Suíte de integração do índice único parcial + generalizar o `exclude` condicional de
      `vitest.config.ts` e o script `test:integracao` de arquivo único para lista
- [ ] Casos novos em `src/lib/__tests__/email-enviar.test.ts` para D-03

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
