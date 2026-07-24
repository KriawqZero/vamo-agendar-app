# CONTEXT — Observabilidade Real da Mensageria (Sentry Logs, Issues e PostHog)

## 1. Problema Original Relatado

Foi observado em testes operacionais reais do VamoAgendar:
- Foi criado/testado um agendamento público e/ou manual;
- A confirmação de WhatsApp não foi entregue;
- O lembrete futuro via QStash também não foi entregue;
- Nada apareceu no PostHog Activity;
- Nada apareceu em Sentry Issues;
- Nada apareceu em Sentry Logs;
- Não houve nenhuma linha útil/estruturada nos logs de aplicação do Railway.

## 2. Visão de Arquitetura-Alvo

A observabilidade da mensageria deve ser composta por 4 pilares complementares que respondem a perguntas distintas:

1. **Sentry Issues**: Falhas acionáveis, exceções inesperadas e invariantes quebrados que exigem atenção técnica ou operacional.
2. **Sentry Logs**: Logs estruturados com códigos estáticos e atributos pesquisáveis cobrindo todo o ciclo de vida da operação.
3. **PostHog**: Analytics de produto, taxas agregadas de sucesso/falha e métricas de confiabilidade (sem PII).
4. **PostgreSQL (`disparos_whatsapp`)**: Auditoria exata append-only por tenant e por agendamento para suporte operacional.

## 3. Diretrizes e Limites

- **Sanitização de PII e Secrets**: NUNCA logar nome, telefone, e-mail, texto de mensagem, token de instância, chave de API, payload cru de terceiros ou URL completa em Sentry Logs/Issues/PostHog. Usar hashes pseudonimizados (`tenantHash`, `agendamentoHash`).
- **Nenhum silenciamento de erros**: Erros técnicos ou de transporte devem ser flushed e expostos ao owner, sem quebrar o agendamento do cliente final (Fricção Zero).
- **Sem ORM, sem Session Replay, sem PostHog Error Tracking, sem captura automática de console**: Manter integrações limpas, configuradas explicitamente por código versionado.
- **Fail-safe para o cliente final**: Falhas de mensageria não impedem a conclusão do booking, mas alertam o owner/profissional e registram auditoria.
