# 06 - Mensageria e Integração WhatsApp (Evolution API + QStash)

Este documento define os padrões, fluxos e payloads da arquitetura de mensageria via WhatsApp e agendamentos de lembretes em background do **VamoAgendar**.

---

## 🔄 Fluxo de Mensagens e Ciclo de Vida

O VamoAgendar possui um fluxo de mensagens simples e direto, focado exclusivamente em **notificar** e **lembrar** o cliente final.

```mermaid
sequenceDiagram
    participant Cliente as Cliente Final (B2C)
    participant Next as Next.js Server Actions
    participant Supabase as Supabase DB
    participant Evo as Evolution API (Docker)
    participant QStash as Upstash QStash (Queues)
    
    Cliente->>Next: Solicita Agendamento (Nome, WhatsApp, Data/Hora)
    Next->>Supabase: Insere agendamento (status: pendente/confirmado)
    
    rect rgb(240, 248, 255)
        Note over Next, Evo: Confirmação Imediata (Síncrona)
        Next->>Evo: Envia Mensagem de Confirmação (Send Text)
        Evo-->>Cliente: [WhatsApp] Mensagem de Confirmação
    end

    rect rgb(245, 245, 245)
        Note over Next, QStash: Lembrete Futuro (Assíncrono)
        Next->>QStash: Agenda Chamada HTTP para X minutos antes do horário
        Note over QStash: Aguarda no tempo programado...
        QStash->>Next: Invoca Webhook /api/webhooks/lembrete (Payload do agendamento)
        Next->>Evo: Envia Mensagem de Lembrete (Send Text)
        Evo-->>Cliente: [WhatsApp] Mensagem de Lembrete
    end
```

---

## 🗄️ Modelagem de Dados: Tabela `whatsapp_configs`

Cada organização/tenant possui sua própria conexão de WhatsApp. As configurações de conexão e os textos das mensagens são armazenados na tabela `whatsapp_configs`.

### Estrutura do Schema

```sql
CREATE TABLE whatsapp_configs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id text NOT NULL UNIQUE,
    instance_name text NOT NULL UNIQUE,
    instance_token text, -- O apikey de autenticação retornado pela Evolution API para esta instância
    status text NOT NULL DEFAULT 'desconectado' CHECK (status IN ('desconectado', 'conectando', 'aguardando_qrcode', 'conectado', 'instavel', 'falha')),
    ultima_verificacao_em timestamp with time zone, -- Última sincronização de status com o gateway
    mensagem_confirmacao text NOT NULL DEFAULT 'Olá {{cliente}}, seu agendamento em {{empresa}} para {{data_hora}} está confirmado!',
    mensagem_lembrete text NOT NULL DEFAULT 'Olá {{cliente}}, passando para lembrar do seu agendamento em {{empresa}} no dia {{data}} às {{hora}}.',
    tempo_lembrete_minutos integer NOT NULL DEFAULT 120, -- Padrão de 2 horas antes
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ativação do RLS
ALTER TABLE whatsapp_configs ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS (B2B - Apenas donos do Tenant)
CREATE POLICY "Permitir SELECT para membros da org autenticados" 
ON whatsapp_configs FOR SELECT TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir INSERT para membros da org autenticados" 
ON whatsapp_configs FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir UPDATE para membros da org autenticados" 
ON whatsapp_configs FOR UPDATE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

COMMENT ON TABLE whatsapp_configs IS 'Armazena as configurações de integração e instâncias do WhatsApp da Evolution API para cada tenant.';
```

---

## 🔗 Integração com a Evolution API (v2)

A comunicação com a Evolution API é protegida pela chave de API global (para gerenciamento de instâncias) e pela chave de API específica da instância (para envio de mensagens).

### 1. Criar Instância (`POST`)
Ao clicar em "Conectar WhatsApp" no painel, o Next.js cria a instância no gateway.
* **Endpoint:** `POST {EVOLUTION_API_URL}/instance/create`
* **Header:** `apikey: {EVOLUTION_GLOBAL_API_KEY}`
* **Payload:**
  ```json
  {
    "instanceName": "instancia_org_xxxxxx",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }
  ```
* **Campos Relevantes da Resposta (HTTP 201):**
  * `instance.instanceName`: Nome da instância criada.
  * `hash.apikey`: O token da instância gerado pela Evolution API. **Salvamos este valor no campo `instance_token` no banco.**

### 2. Conectar (Obter QR Code em base64)
Para mostrar o QR Code na tela de conexão para o profissional escanear.
* **Endpoint:** `GET {EVOLUTION_API_URL}/instance/connect/{instanceName}`
* **Header:** `apikey: {EVOLUTION_GLOBAL_API_KEY}`
* **Resposta (HTTP 200):** Retorna o QR Code codificado em base64 (string que começa com `data:image/png;base64,...`) e o código de texto puro para pareamento.

### 3. Enviar Mensagem de Texto (`POST`)
Para enviar notificações e lembretes aos clientes.
* **Endpoint:** `POST {EVOLUTION_API_URL}/message/sendText/{instanceName}`
* **Header:** `apikey: {INSTANCE_TOKEN}` (O token específico da instância recuperado da tabela `whatsapp_configs`)
* **Payload:**
  ```json
  {
    "number": "5511999999999",
    "text": "Texto final com as variáveis substituídas..."
  }
  ```

---

## 📝 Substituição de Variáveis via Código

Antes de realizar a requisição de disparo para a Evolution API, a Server Action ou o Webhook de lembrete deve processar e substituir as variáveis do template do banco usando os dados do cliente e da empresa.

### Regra de Substituição (Next.js Helper)

Criaremos uma função utilitária para substituir as chaves dinâmicas:

```typescript
interface SubstituicaoParams {
    template: string
    clienteNome: string
    empresaNome: string
    dataHoraStr: string // Ex: "05/07/2026 às 14:00"
}

export function processarMensagemTemplate({
    template,
    clienteNome,
    empresaNome,
    dataHoraStr
}: SubstituicaoParams): string {
    // Quebra a data e hora para templates de lembrete se necessário
    const [dataPart, horaPart] = dataHoraStr.split(" às ");

    return template
        .replace(/{{cliente}}/g, clienteNome)
        .replace(/{{empresa}}/g, empresaNome)
        .replace(/{{data_hora}}/g, dataHoraStr)
        .replace(/{{data}}/g, dataPart || '')
        .replace(/{{hora}}/g, horaPart || '');
}
```

> [!TIP]
> O número do telefone do destinatário na Evolution API deve conter sempre o código do país (`55` para Brasil), o DDD (2 dígitos) e o número do celular. Remova formatações (parênteses, traços, espaços) via Regex no backend antes do envio: `telefone.replace(/\D/g, '')`.

---

## 🚦 Máquina de estados da conexão (P0.1)

O campo `whatsapp_configs.status` reflete o estado **sincronizado com o gateway**, não apenas o último passo do fluxo de pareamento. A action `sincronizarStatusWhatsApp()` (chamada no SSR de `/dashboard/whatsapp`, com timeout de 4 s) consulta `GET /instance/connectionState/{instanceName}` e aplica `mapearEstadoEvolution()`:

| Estado | Significado | Ação disponível na UI |
| --- | --- | --- |
| `desconectado` | Sem instância ativa | Conectar WhatsApp |
| `conectando` | Gateway estabelecendo sessão (`connecting`) | Verificar novamente |
| `aguardando_qrcode` | QR gerado, aguardando pareamento (preservado enquanto o gateway reporta `connecting`/`close` durante o fluxo de pareamento) | QR + polling 5 s (para após 3 falhas consecutivas ou ~2 min → "QR expirado" com regeneração) |
| `conectado` | Sessão confirmada pelo gateway (`open` **sempre** promove a este estado) | Desconectar, mensagem de teste |
| `instavel` | Gateway inalcançável/erro inesperado quando o banco dizia `conectado` | Verificar novamente / Reiniciar conexão |
| `falha` | Instância inexistente no gateway (HTTP 404) — exige reconexão | Tentar novamente (`reiniciarConexaoWhatsApp()`: DELETE da instância + recriação, recuperando instância órfã via "already in use" → `fetchInstances`) |

Regras: `ultima_verificacao_em` marca a última resposta real do gateway; `updated_at` só muda quando a configuração/status muda. O `instance_token` **nunca** é retornado a Client Components (a prop é serializada até o browser) — as actions selecionam colunas explícitas.

## 🧾 Log de disparos: tabela `disparos_whatsapp`

Log **append-only** de auditoria por tenant (ver `supabase/schemas/09_disparos_whatsapp.sql`): `tipo` (`confirmacao` | `lembrete` | `teste`), `status` (`enviado` | `agendado` | `executado` | `falha` | `ignorado` | `cancelado`), `motivo` (código curto: `whatsapp_desconectado`, `agendamento_cancelado`, `plano_sem_whatsapp`, `erro_rede`, `http_<código>`...), `qstash_message_id` e `agendamento_id` (NULL para teste). **Nunca** armazena conteúdo de mensagem nem telefone. RLS: SELECT/INSERT apenas `authenticated` do próprio tenant; sem UPDATE/DELETE; sem `anon` — as escritas do fluxo público/webhook usam `createAdminClient()` no servidor.

Semântica dos registros:
- Booking público: `confirmacao/enviado|falha` + `lembrete/agendado` (com `qstash_message_id`) ou `lembrete/falha`. Se o tenant tem o recurso mas a conexão está inativa: `confirmacao/falha` motivo `whatsapp_desconectado`. Sem config ou plano sem WhatsApp: nada é logado.
- Webhook de lembrete: `lembrete/executado`, `lembrete/falha` (mantendo HTTP 500 para retry do QStash — linhas duplicadas entre tentativas são esperadas) ou `lembrete/ignorado` (motivos acima).
- Cancelamento de agendamento: a action busca o último `lembrete/agendado`, chama `DELETE {QSTASH_URL}/v2/messages/{messageId}` (404 = sucesso brando) e registra `lembrete/cancelado`. O webhook re-checa o status como segunda defesa.
- Mensagem de teste: `teste/enviado|falha` (INSERT via cliente autenticado — é para isso que existe a política de INSERT).

Invariante: **nenhuma falha de mensageria (Evolution, QStash ou o próprio INSERT do log) quebra a criação/cancelamento de agendamento** — `registrarDisparo()` engole o próprio erro e os fluxos ficam em try/catch.

O painel "Últimos disparos" em `/dashboard/whatsapp` (`listarDisparosWhatsApp()`) traduz os motivos para frases amigáveis — é a resposta do suporte para "por que a mensagem não saiu?". Ele substituiu a antiga página `/debug/qstash` (removida; lembrar de apagar a env `DEBUG_QSTASH` dos ambientes).

## 🧪 Testes sem credenciais reais

- `pnpm test` (Vitest): `src/lib/__tests__/whatsapp-helper.test.ts` cobre envio, agendamento/cancelamento no QStash (fetch stubado) e o mapeamento de estados.
- `scripts/mock-evolution.mjs`: gateway falso local (`EVOLUTION_API_URL=http://localhost:8081 pnpm dev`) com estado controlável via `POST /__mock/state?value=open|connecting|close|qrcode|404` — exercita os 6 estados da UI; matar o processo simula queda (estado `instavel`).
