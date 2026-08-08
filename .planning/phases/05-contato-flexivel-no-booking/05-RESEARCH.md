# Phase 05 — Research & Technical Architecture: Contato flexível no booking

> Pesquisa técnica sobre a implementação do booking público com e-mail OU WhatsApp, deduplicação de clientes, template React Email de confirmação e despacho assíncrono via `after()`.

---

## 1. Database Schema (`clientes` & `agendamentos`)

### Análise do Schema Atual
Atualmente a tabela `clientes` possui:
- `telefone TEXT NOT NULL`
- `email TEXT` (opcional)
- `tenant_id TEXT NOT NULL`

### Mudanças Propostas no Banco de Dados
1. Tornar `telefone` opcional (`NULLABLE`).
2. Adicionar constraint `CHECK (telefone IS NOT NULL OR email IS NOT NULL)` na tabela `clientes`.
3. Adicionar índices parciais para otimizar busca por tenant:
   - `CREATE INDEX IF NOT EXISTS idx_clientes_tenant_telefone ON clientes (tenant_id, telefone) WHERE telefone IS NOT NULL;`
   - `CREATE INDEX IF NOT EXISTS idx_clientes_tenant_email ON clientes (tenant_id, email) WHERE email IS NOT NULL;`

### Pré-Voo de Dados
Como a coluna `telefone` era previamente `NOT NULL`, 100% dos clientes existentes já possuem telefone preenchido. A migration de alteração é 100% segura para os dados atuais.

---

## 2. RPC Atômica de Deduplicação (`reaproveitar_ou_criar_cliente`)

### Lógica de Busca e Atualização Atômica
A RPC `reaproveitar_ou_criar_cliente` (ou lógica equivalente em servidor) deve seguir a ordem de precedência:

1. Se `telefone` foi informado, busca cliente no tenant por `(tenant_id, telefone)`.
2. Se encontrado:
   - Se o registro possuir `email` nulo e o visitante tiver informado um `email` novo, atualiza a linha com o e-mail informado.
   - Retorna o `id` do cliente.
3. Se não encontrou por telefone (ou se `telefone` não foi informado) e `email` foi fornecido:
   - Busca cliente no tenant por `(tenant_id, email)`.
   - Se encontrado: atualiza `telefone` caso estivesse em branco e retorna o `id` do cliente.
4. Se nenhum cliente foi encontrado por WhatsApp ou E-mail:
   - Insere um novo cliente em `clientes` com os campos fornecidos (`nome`, `telefone`, `email`).
   - Retorna o `id` do novo cliente.

---

## 3. UI Form (`EtapaContato.tsx`) & Validação no Servidor

### Formulário do Booking Público (`EtapaContato.tsx`)
- Campos de Entrada:
  - **Nome Completo** (obrigatório)
  - **WhatsApp** (opcional, com máscara `(DD) 9XXXX-XXXX`)
  - **E-mail** (opcional, formato e-mail válido)
- Texto orientador: `"Informe pelo menos um meio de contato (WhatsApp ou E-mail) para receber sua confirmação."`

### Regra de Validação (UI e Server Action `public-booking.ts`)
- Se ambos os campos (`telefone` e `email`) estiverem vazios:
  - Exibe/retorna mensagem de erro: `"Informe pelo menos um meio de contato (WhatsApp ou E-mail) para confirmar o agendamento."`.
- Se o e-mail for informado mas tiver sintaxe inválida:
  - Retorna erro `"E-mail inválido."`.
- Se o WhatsApp for informado mas tiver menos de 10 dígitos numéricos:
  - Retorna erro `"Número de WhatsApp inválido."`.

---

## 4. Template React Email & Transporte Multicanais

### Template React Email (`ConfirmacaoAgendamento.tsx`)
- Localizado em `src/emails/ConfirmacaoAgendamento.tsx`.
- Utiliza `LayoutBase.tsx`.
- Conteúdo do e-mail:
  - Nome do profissional / estabelecimento.
  - Nome do serviço e duração.
  - Data e horário formatados no fuso do estabelecimento.
  - Endereço / Link do Instagram do estabelecimento.
  - Link de ação para visualizar a agenda pública.

### Remetente e Assunto
- Assunto: `"<Nome do Estabelecimento> via VamoAgendar: Agendamento Confirmado"`
- Remetente: `montarRemetente(nomeEstabelecimento)` (`"<Estabelecimento> via VamoAgendar" <naoresponda@mail.vamoagendar.com.br>`)
- Reply-To: E-mail de contato do estabelecimento (`email_contato` ou e-mail do usuário no Clerk).

### Lógica de Disparo Multicanais (BOO-03, EML-03)
- **Se apenas WhatsApp foi informado**: dispara confirmação via WhatsApp + agenda lembrete no QStash.
- **Se apenas E-mail foi informado**: dispara confirmação via E-mail (`enviarEmail`).
- **Se AMBOS foram informados**: dispara a confirmação via E-mail **E** via WhatsApp + agenda lembrete no QStash.

---

## 5. Desacoplamento Assíncrono via `after()` (Next.js)

### Fricção Zero & Liberação Instantânea da UI
Para atender ao Success Criteria 3 (a tela de sucesso aparece assim que o agendamento é gravado no banco, sem esperar a latência de APIs externas do Resend ou Evolution API):

- A chamada de criação do agendamento grava os registros em banco dentro de uma transação.
- O disparo de notificações é envolvido em `after()`:

```ts
import { after } from 'next/server';

// Dentro da Server Action criarAgendamentoPublico:
// 1. Grava no banco e obtém agendamentoId

after(async () => {
  // Disparo de WhatsApp, E-mail e QStash em segundo plano
  try {
    if (temEmail) {
      await enviarEmail({ ... });
    }
    if (temWhatsApp) {
      await enviarMensagemWhatsApp({ ... });
      await agendarLembreteQStash({ ... });
    }
  } catch (err) {
    reportarFalhaSilenciosaAguardando(err, 'booking:notificacao_assincrona_falhou');
  }
});

return { ok: true, agendamentoId };
```

- Vantagem: a resposta HTTP devolve `ok: true` para o navegador imediatamente (~50-100ms), e a UI avança para a tela de confirmação sem travamentos.

---

## 6. Validation Architecture & Nyquist Strategy

### Testes Automatizados da Fase
1. **Renderização de Template**: Teste unitário para `ConfirmacaoAgendamento.tsx` garantindo renderização de HTML com dados corretos.
2. **Deduplicação de Clientes**: Teste unitário/integração para a lógica de busca/reaproveitamento por telefone e por e-mail.
3. **Validação de Formulário e Server Action**: Teste garantindo recusa quando ambos os contatos são omitidos.
4. **Execução Assíncrona via `after()`**: Teste de contrato confirmando que falhas nos envios não abortam o resultado de sucesso do agendamento.
