---
status: temporario
gerado: 2026-07-15 18:53
agente: banco
modelo: sonnet
---

# Auditoria de Banco de Dados — VamoAgendar

Escopo: análise estática de `supabase/schemas/`, `supabase/migrations/` e das queries reais em
`src/` (grep por `.from(`, `.eq(`, `.gte(` etc.). Nenhum comando foi executado contra banco
local ou remoto — apenas leitura de arquivos.

## Resumo por severidade

| Severidade | Qtde |
|---|---|
| CRITICO | 1 |
| ALTO | 2 |
| MEDIO | 4 |
| BAIXO | 3 |

---

## CRITICO

### C1 — Conflito de horário garantido só em código (check-then-act), sem constraint no banco

**Evidência**: `supabase/schemas/07_agendamentos.sql` não tem nenhum `UNIQUE`/`EXCLUDE` que impeça
dois agendamentos sobrepostos para o mesmo tenant. A única defesa é a re-execução de
`obterSlotsDisponiveis()` (`src/lib/booking-engine.ts`) logo antes do `INSERT`, tanto no fluxo
público (`src/app/actions/public-booking.ts:80-97`) quanto no manual do dashboard
(`src/app/actions/agendamentos.ts:302-314` e `:394-406`). É um clássico *check-then-act*: entre o
`SELECT` que confirma o slot livre e o `INSERT` que grava o agendamento, não há lock nem
constraint — duas requisições concorrentes para o mesmo horário podem ambas passar na validação e
ambas inserir. Confirmado por grep: nenhuma ocorrência de `EXCLUDE`, `btree_gist`, `advisory` ou
lock explícito em todo `supabase/` e `src/`.

**Correção sugerida**: constraint de exclusão por intervalo (`EXCLUDE USING gist`), que é a
ferramenta correta do Postgres para "nenhum par de linhas pode se sobrepor no tempo para a mesma
chave". Isso exige duas mudanças de schema:

1. Habilitar a extensão `btree_gist`.
2. Denormalizar `duracao_minutos` (e idealmente `preco`) para dentro de `agendamentos` no momento
   do INSERT — hoje a duração só existe em `servicos.duracao_minutos` e é lida via join (ver
   achado A2 abaixo, mesma causa raiz).

```sql
create extension if not exists btree_gist;

alter table agendamentos add column duracao_minutos integer not null default 30;

alter table agendamentos add column periodo tstzrange
  generated always as (
    tstzrange(data_hora, data_hora + (duracao_minutos || ' minutes')::interval, '[)')
  ) stored;

alter table agendamentos add constraint sem_conflito_horario
  exclude using gist (tenant_id with =, periodo with &&)
  where (status <> 'cancelado');
```

Alternativa mais barata de implementar (não resolve o problema de raiz, mas reduz a janela):
mover a checagem+insert para uma function Postgres (`SECURITY DEFINER`) chamada via RPC, usando
`pg_advisory_xact_lock(hashtext(tenant_id))` para serializar por tenant dentro da transação. Mais
simples de escrever, mas serializa todo o tenant (inclusive slots que não colidem) e ainda depende
de disciplina de uso — a `EXCLUDE` é a solução correta e a que resta válida mesmo se alguém um dia
escrever direto no banco.

---

## ALTO

### A1 — Sem índice de apoio para a query mais quente do sistema: `agendamentos(tenant_id, data_hora)`

**Evidência**: `supabase/schemas/07_agendamentos.sql` só declara a PK (`id`); não há nenhum outro
índice na tabela. As duas leituras mais frequentes do produto filtram por `tenant_id` + intervalo
de `data_hora`:

- `src/lib/booking-engine.ts:108-120` — roda a cada dia consultado no calendário público e a cada
  tentativa de reserva (a engine é re-executada antes do INSERT, ver C1).
- `src/app/actions/agendamentos.ts:39-71` (`listarAgendamentos`) — tela principal do dashboard.

Ambas fazem `.eq('tenant_id', ...).neq('status','cancelado').gte('data_hora', ...).lt('data_hora', ...)`.
Sem índice composto, cada leitura é sequential scan sobre toda a tabela `agendamentos`; como essa
é a tabela que mais cresce (todo agendamento de todo tenant, para sempre), a degradação é
progressiva e vai bater primeiro exatamente no fluxo público — o mais sensível a latência
(cliente final decidindo se agenda ou desiste).

**Correção sugerida**:
```sql
create index idx_agendamentos_tenant_data_hora
  on agendamentos (tenant_id, data_hora)
  where status <> 'cancelado';
```
Índice parcial porque toda query relevante já exclui `cancelado` — reduz tamanho e leitura.

### A2 — `duracao_minutos`/`preco` não são gravados no agendamento; a engine relê o valor ATUAL do serviço

**Evidência**: `agendamentos` não tem coluna própria de duração ou preço; toda leitura junta com
`servicos` para obter esses valores — `src/lib/booking-engine.ts:110-115` (`servicos(duracao_minutos)`
no select de agendamentos existentes) e `src/app/actions/agendamentos.ts:51-56` (`servicos(preco,
duracao_minutos)` na listagem do dashboard). Isso significa que a janela de tempo ocupada por um
agendamento **já confirmado** é recalculada com a duração **atual** do serviço, não a duração
vigente no momento em que o cliente reservou. Consequência prática: se o profissional editar a
duração de um serviço (`src/app/actions/servicos.ts:salvarServico`) depois que já existem
agendamentos futuros contra ele, a disponibilidade de todos esses agendamentos muda
retroativamente — pode liberar minutos que na prática ainda estão comprometidos (abrindo brecha
para um segundo cliente agendar em cima) ou bloquear minutos a mais do que o necessário. O mesmo
vale para `preco`: qualquer relatório financeiro que junte `agendamentos` com `servicos.preco`
mostra o preço de hoje, não o preço cobrado na data do agendamento.

**Correção sugerida**: snapshot no INSERT — adicionar `duracao_minutos integer not null` e
`preco numeric(10,2) not null` em `agendamentos`, preenchidos a partir de `servicos` no momento da
criação (`public-booking.ts` e `agendamentos.ts` já leem `servico.duracao_minutos` antes do
insert — é questão de persistir esse valor em vez de descartá-lo). `booking-engine.ts` passa a ler
`ag.duracao_minutos` diretamente, sem join. Isso também é pré-requisito para a coluna gerada
`periodo` do achado C1.

---

## MEDIO

### M1 — Tabelas centrais sem índice em `tenant_id`

**Evidência**: `servicos`, `clientes` e `excecoes_agenda` não têm nenhum índice cuja coluna líder
seja `tenant_id` (`horarios_funcionamento` e `whatsapp_configs` já têm por acidente, via
`UNIQUE(tenant_id, dia_semana)` e `UNIQUE(tenant_id)` respectivamente). Toda política RLS dessas
tabelas filtra por `tenant_id = (SELECT auth.jwt() ->> 'org_id')`, e o código faz o mesmo filtro
diretamente em praticamente toda função: `src/app/actions/servicos.ts:32`,
`src/app/actions/clientes.ts:21`, `src/app/actions/agenda.ts:130-134` (`excecoes_agenda` +
`gte('data', ...)`). Hoje o volume por tenant é pequeno (poucos serviços, poucos clientes por
negócio pequeno) então o impacto real é baixo nesta fase — mas cresce junto com a base de tenants
e é o padrão recomendado pela skill de Supabase/Postgres para RLS com subquery de JWT (índice
suporta o initPlan). `assinaturas` está coberta na prática pelo índice único parcial
`uq_assinatura_vigente_por_tenant` (`tenant_id`) `WHERE status IN ('ativa','inadimplente')`,
porque as duas únicas leituras do código (`src/lib/assinaturas.ts:25` e `:58`) sempre filtram por
esse mesmo conjunto de status — não precisa de índice adicional.

**Correção sugerida**:
```sql
create index idx_servicos_tenant_id on servicos (tenant_id);
create index idx_clientes_tenant_id on clientes (tenant_id);
create index idx_excecoes_agenda_tenant_data on excecoes_agenda (tenant_id, data);
```

### M2 — Sem `UNIQUE (tenant_id, telefone)` em `clientes` — mesma classe de race do achado C1

**Evidência**: o "reaproveitamento de cliente existente por telefone" é sempre `SELECT` seguido de
`INSERT` condicional, sem lock: `src/app/actions/public-booking.ts:109-141` e
`src/app/actions/agendamentos.ts:267-300`. Duas requisições concorrentes do mesmo número de
WhatsApp para o mesmo tenant (ex.: cliente clica "confirmar" duas vezes, ou dois tabs) podem
ambas não encontrar o registro existente e criar dois `clientes` duplicados com o mesmo telefone.
Consequência menor que C1 (não perde uma reserva, mas fragmenta o histórico do cliente e polui o
CRM), porém a causa é idêntica.

**Correção sugerida**: `ALTER TABLE clientes ADD CONSTRAINT uq_clientes_tenant_telefone UNIQUE (tenant_id, telefone);`
e tratar o erro `23505` no INSERT como "corrida perdida, buscar de novo" (mesmo padrão usado hoje
para `23503` em `src/app/actions/servicos.ts:180`). Esse UNIQUE também serve de índice de apoio
para os lookups por telefone, reduzindo a necessidade de um índice separado.

### M3 — `excecoes_agenda` sem CHECK garantindo consistência entre `hora_inicio`/`hora_fim`

**Evidência**: `salvarExcecaoAgenda` (`src/app/actions/agenda.ts:159-167`) grava
`hora_inicio: input.hora_inicio || null` e `hora_fim: input.hora_fim || null` de forma
independente — nada no banco nem na action impede uma linha com apenas um dos dois preenchidos.
A engine trata esse caso de forma silenciosa e potencialmente contraintuitiva:
`booking-engine.ts:89` só considera "dia inteiro bloqueado" quando **ambos** são nulos, e
`booking-engine.ts:95-96` só considera "bloqueio parcial" quando **ambos** estão preenchidos. Uma
linha com só `hora_inicio` setado (ex.: bug de UI, ou edição manual) não cai em nenhum dos dois
casos — é um bloqueio "fantasma": existe na tabela, aparece na listagem do dashboard
(`AgendaClient.tsx`), mas não afeta a disponibilidade real. O profissional acredita que bloqueou
um horário e continua recebendo agendamentos nele.

**Correção sugerida**: `ALTER TABLE excecoes_agenda ADD CONSTRAINT chk_excecao_horario_consistente CHECK ((hora_inicio IS NULL) = (hora_fim IS NULL));`

### M4 — `agendamentos.cliente_id` usa `ON DELETE CASCADE`

**Evidência**: `supabase/schemas/07_agendamentos.sql:11` — `CONSTRAINT fk_cliente FOREIGN KEY
(cliente_id) REFERENCES clientes(id) ON DELETE CASCADE`. A tabela `clientes` já tem política RLS
de `DELETE` para `authenticated` (`06_clientes.sql:31-33`), mesmo que hoje nenhuma Server Action
exponha essa exclusão (`grep` em `src/app/actions/clientes.ts` só encontrou `listarClientes`).
Ainda assim, a policy existe e o cascade está armado: se algum fluxo futuro (ou um UPDATE direto
via SQL/dashboard do Supabase) apagar um `cliente`, todo o histórico de `agendamentos` dele some
junto — inclusive agendamentos `concluido` que representam receita já realizada. `servico_id` no
mesmo arquivo usa `ON DELETE RESTRICT` corretamente, pelo motivo inverso (proteger histórico); a
mesma lógica deveria valer para `cliente_id`.

**Correção sugerida**: trocar para `ON DELETE RESTRICT` (força desativar/anonimizar o cliente em
vez de apagá-lo, preservando o histórico) — coerente com o padrão já adotado para `servico_id`.

---

## BAIXO

### B1 — Faltam `CHECK` de domínio em `servicos` (validados só na Server Action)

`servicos.duracao_minutos` e `servicos.preco` não têm `CHECK` no banco; a única barreira é
`src/app/actions/servicos.ts:52` (`input.preco < 0 || input.duracaoMinutos <= 0` rejeitado antes
do INSERT/UPDATE). Qualquer escrita fora dessa action (SQL manual, futura migration de dados,
outra rota) pode gravar duração zero/negativa ou preço negativo sem erro.
**Correção**: `CHECK (duracao_minutos > 0)` e `CHECK (preco >= 0)`.

### B2 — Falta `CHECK (hora_inicio < hora_fim)` em `horarios_funcionamento`

Uma linha com `hora_fim <= hora_inicio` não quebra nada de forma visível (o loop de geração de
slots em `booking-engine.ts:162` simplesmente não itera, produzindo zero slots), mas é dado
inconsistente sem qualquer aviso — o profissional configuraria um dia "aberto" que na prática
nunca tem horário disponível, sem sinal de erro.

### B3 — Modelo "1 tenant = 1 agenda" é decisão de produto deliberada, mas é uma limitação estrutural real

Não há tabela `profissionais`; `agendamentos`, `horarios_funcionamento`, `excecoes_agenda` e
`servicos` são todos amarrados direto em `tenant_id`, assumindo um único prestador por
organização. Isso **não é uma gambiarra silenciosa** — é a proposta de valor atual do produto,
explícita em `src/lib/nichos.ts:301` ("Não é agenda de salão com várias profissionais — é feito
para quem atende sozinha") e `:379` (mesmo texto para barbeiro). Registro aqui só para deixar
explícito o custo de uma eventual expansão para "salão com 3 barbeiros": exigiria nova tabela
`profissionais` (com `tenant_id`), `profissional_id` em `agendamentos` e provavelmente em
`horarios_funcionamento`/`excecoes_agenda` (cada profissional tem sua própria agenda), uma tabela
de associação `servicos`↔`profissionais` (nem todo profissional faz todo serviço), e reescrita do
motor de disponibilidade (`booking-engine.ts`) para filtrar/agrupar por profissional em vez de por
tenant. Não é um ajuste incremental — é a mesma ordem de grandeza de C1/A2 somada. Não requer ação
agora; registrar como decisão consciente para não ser redescoberta como "esquecimento" depois.

---

## Notas positivas (sem ação necessária)

- **Coerência schemas ↔ migrations ↔ reset de dev**: conferido migration a migração — todas as
  colunas/constraints/políticas hoje presentes em `supabase/schemas/*.sql` têm migration
  correspondente aplicada (`20260708233747` baseline + as 10 migrations incrementais). Nenhum
  drift encontrado. A lista de `TRUNCATE` em `docs/RESET_AMBIENTE_DEV.md` cobre as 9 tabelas
  atuais. O caveat de `GRANT`/`REVOKE` por coluna (não capturados por `supabase db diff`) já está
  documentado em `docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md` e tratado corretamente nas
  migrations (`20260709193156`, `20260713162247`).
- **Sem colunas/tabelas órfãs**: todo campo "suspeito" checado por grep (`descricao`,
  `telefone_contato`, `cor_marca`, `logo_url`, `exibir_logo`, `excecoes_agenda.motivo`,
  `whatsapp_configs.ultima_verificacao_em`, `instance_token`) tem uso confirmado no código.
  `cor_marca`/`logo_url` estão explicitamente documentados em `docs/07-PLANOS_E_MONETIZACAO.md`
  como "preparados mas não consumidos pelo booking público ainda" — decisão de escopo, não
  esquecimento.
- **Modelagem de enums via `CHECK`** (`status` de agendamentos/assinaturas/whatsapp_configs/
  disparos_whatsapp, `plano`, `ciclo`, `tipo`): apropriado para o estágio atual — são conjuntos
  fixos de estados de negócio, não catálogos editáveis pelo usuário; não é caso de "deveria ser
  tabela".
- **Assinatura/MRR**: `assinaturas` já comporta plano, status (ativa/inadimplente/cancelada),
  ciclo, campos Asaas e índice único parcial anti-duplicidade sem exigir refatoração para o
  roadmap descrito em `docs/07-PLANOS_E_MONETIZACAO.md`. Não há estado `trial` — não é gap, é
  ausência de requisito hoje (Gratuito não é um trial, é o tier permanente); só relevante se o
  produto quiser um free-trial de Pro no futuro.

---

## Achados mais importantes (para o resumo do orquestrador)

1. **[CRITICO]** `agendamentos` não tem constraint de exclusão de horário — a única proteção
   contra double-booking é check-then-act em código, vulnerável a race condition.
2. **[ALTO]** Falta índice composto `agendamentos(tenant_id, data_hora)` — sem apoio para a query
   mais quente do produto (motor de disponibilidade + listagem do dashboard).
3. **[ALTO]** `duracao_minutos`/`preco` não são gravados no agendamento; editar um serviço muda
   retroativamente a disponibilidade calculada para agendamentos já confirmados contra ele.
4. **[MEDIO]** `servicos`, `clientes`, `excecoes_agenda` sem índice em `tenant_id` (RLS + filtro
   aplicativo em praticamente toda query).
5. **[MEDIO]** Falta `UNIQUE (tenant_id, telefone)` em `clientes` — mesma classe de race do
   achado 1, risco de clientes duplicados sob concorrência.
