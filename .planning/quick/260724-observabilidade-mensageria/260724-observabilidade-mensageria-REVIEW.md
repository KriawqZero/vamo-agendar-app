# REVIEW — Code Review Adversarial (Observabilidade Real da Mensageria)

## 1. Perspectiva do Revisor Adversarial

Fiz uma revisão crítica procurando brechas de segurança, regressões de desempenho, vazamentos de PII ou riscos de indisponibilidade.

### Checkpoints Avaliados:

1. **Risco de Vazamento de PII em Sentry Logs / Issues**:
   - *Verificação*: Foi implementada allowlist estrita em `sanitizarAtributosLog` e `beforeSendLog` (`sanitizacao.ts`).
   - *Análise de Risco*: Nomes de parâmetros como `clienteNome`, `clienteTelefone`, `texto`, `instance_token` e `apikey` são ativamente bloqueados. Hashes pseudonimizados (`tenantHash`, `agendamentoHash`) usam `ANALYTICS_TENANT_SALT` (sha256).
   - *Conclusão*: Risco mitigado. Coberto por testes automatizados em `log.test.ts` e `notificacoes-agendamento-observabilidade.test.ts`.

2. **Perigo de Recursão em `registrarDisparo`**:
   - *Verificação*: Se `insert` em `disparos_whatsapp` falhar, a função reporta `auditoria_whatsapp:insert_failed` ao Sentry usando um erro sintético criado com `erroSinteticoSupabase`. A função **NÃO chama `registrarDisparo` novamente**.
   - *Conclusão*: Risco de estouro de pilha/recursão infinita eliminado.

3. **Perigo de Bloqueio do Booking B2C (Fricção Zero)**:
   - *Verificação*: `dispararNotificacoesAgendamento` envolve todo o fluxo num `try/catch` de topo. As funções `reportarExcecaoAguardando` e `reportarFalhaSilenciosaAguardando` possuem `try/catch` interno e teto de `Sentry.flush(2000)`.
   - *Conclusão*: A criação do agendamento B2C nunca é travada por falhas na infraestrutura de observabilidade ou envio.

4. **Desempenho e Overhead de Flush**:
   - *Verificação*: `Sentry.flush(2000)` especifica um timeout máximo de 2 segundos. Em condições normais, o esvaziamento da fila leva < 50ms.
   - *Conclusão*: Baixo overhead, adequado para Server Actions e Route Handlers.

5. **Compatibilidade com Next.js 16 (App Router)**:
   - *Verificação*: `instrumentation.ts` e `instrumentation-client.ts` preservados. `pnpm build` executado com sucesso no Turbopack.

---

## 2. Conclusão da Revisão

Código aprovado sem ressalvas técnicas. Nenhuma regressão encontrada.
