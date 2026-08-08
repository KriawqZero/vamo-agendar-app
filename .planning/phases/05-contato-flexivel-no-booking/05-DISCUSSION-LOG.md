# Phase 05 — Discussion Log

> Registro histórico das perguntas apresentadas e escolhas do usuário durante a discussão da Fase 05.

---

## Areas Discussed

### Area 1: Validação & Campos de Contato
- **Pergunta**: Como deseja definir a regra de obrigatoriedade dos campos no formulário e Server Action?
- **Opções apresentadas**:
  1. Nome obrigatório; WhatsApp e E-mail opcionais (pelo menos um obrigatório); validação em UI + Server Action.
  2. WhatsApp obrigatório e E-mail adicional opcional.
  3. Regra personalizada.
- **Escolha do Usuário**: Opção 1 — Nome obrigatório; WhatsApp e E-mail opcionais, exigindo pelo menos um dos dois. Rejeita se ambos estiverem vazios.

### Area 2: Deduplicação de Clientes
- **Pergunta**: Quando o cliente informa tanto WhatsApp quanto E-mail, qual a ordem de precedência no banco e envio?
- **Opções apresentadas**:
  1. Priorizar busca por WhatsApp; se não encontrar, buscar por E-mail. Atualizar o campo ausente se encontrado.
  2. Priorizar busca por E-mail; se não encontrar, buscar por WhatsApp.
  3. Reaproveitar apenas se ambos baterem.
- **Escolha do Usuário**: Priorizar busca por WhatsApp, em seguida por E-mail. Se o cliente informou ambos os canais, **envia a confirmação em ambos os canais (E-mail E WhatsApp)**.

### Area 3: Envio Assíncrono via Next.js `after()`
- **Pergunta**: Como deseja tratar a resposta da UI em relação ao envio das notificações?
- **Opções apresentadas**:
  1. Confirmar uso de `after()`: Agendamento gravado devolve sucesso imediato à UI; disparos de e-mail/WhatsApp rodam no `after()` sem travar a resposta.
  2. Manter envio síncrono.
- **Escolha do Usuário**: Opção 1 — Devolver sucesso imediato na Server Action assim que o agendamento for persistido no Postgres, delegando envios ao `after()`.
