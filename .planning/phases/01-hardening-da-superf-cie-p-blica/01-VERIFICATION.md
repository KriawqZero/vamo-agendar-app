---
phase: 01-hardening-da-superf-cie-p-blica
verified: 2026-07-22T22:22:36Z
status: gaps_found
score: 5/5 Success Criteria verificados por medição direta; 3 gaps de fase reproduzidos por medição própria
behavior_unverified: 0
overrides_applied: 0
re_verification:
    previous_status: gaps_found
    previous_score: 11/13
    rodada: 4
    head_medido: 7937aed
    gaps_closed:
        - "Gap da 3ª rodada #1 — o harness de superfície anônima já não sai 0 declarando fechamento quando não tem o que medir. Reproduzido por mim em diretório isolado, com `.env.local` sintético apontando para um host RFC-2606 inexistente: EXIT 2, stderr `não consigo provar que o alvo é o banco DESTE projeto`, e a frase `a role anon não devolveu linha nenhuma` AUSENTE da saída (0 ocorrências). O veredito `[ALVO]` (referência + canário) e o gate `ESPERADAS -eq 0 → exit 2` estão nas linhas 445-490 e 519-524 de `scripts/verificar-superficie-anon.sh`. O controle `scripts/verificar-controle-harness-anon.sh` roda por mim com 4/4 vereditos APROVADOS (ALVO_MORTO, PROJETO_ERRADO, TUDO_NEGADO, CONTROLE)"
        - "Gap da 3ª rodada #2 — a superfície pública anônima não entrega mais um jeito de derrubar o processo com uma requisição. Medido por HTTP contra `next start` sobre build de produção, slug real `avantis`, id de action derivado do manifesto (`70efdce3…`), sem sessão: `duracaoMinutos=-100000/-5000000/999999999` → `{ok:false,motivo:'servico_invalido'}` em 9-10 ms / 109 bytes (era 26.751 ms / 19,29 MB). A guarda de fronteira está em `public-booking.ts:646-656` (antes de `createAdminClient()`) e o contrato na função pura em `booking-engine.ts:154` (`if (!Number.isInteger(duracaoMinutos) || duracaoMinutos <= 0) return []`). `dateStr` malformado (`nao-e-uma-data`, `2027-02-30`, `19999-12-31`) → `{ok:false,motivo:'data_invalida'}`, já não devolve `{ok:true,slots:[]}`. Harness `verificar-travessia-server-action.sh` rodado por mim: 7/7 vereditos APROVADOS contra build de produção"
    gaps_remaining: []
    regressions:
        - "Nenhuma regressão de comportamento. Medido por mim sobre o HEAD `7937aed`: `pnpm test` 15 arquivos / 235 testes / exit 0; `pnpm lint` exit 0. Booking legítimo `dur=30` continua devolvendo a grade completa (2.180 bytes, 08:00…17:30) em 890 ms"
    novos_achados:
        - "CR-01 do 01-REVIEW.md REPRODUZIDO POR MEDIÇÃO (stub HTTP local, não leitura): o falso-verde do harness de superfície mudou de eixo mais uma vez. Alvo parcialmente aberto (perfis_empresas fechada com 42501, as outras 7 tabelas reabertas a anon mas vazias → `200 []`) faz o harness sair 0 imprimindo `11 checagem(ns), 4 com prova positiva, 0 reprovada(s)` e a frase de fechamento. 7 de 9 tabelas ABERTAS a anon e o instrumento que o ROADMAP cita como prova de SEG-01/02/03 declara fechamento. É gap de fase, não falsificação de Success Criteria"
        - "CR-02 do 01-REVIEW.md REPRODUZIDO POR MEDIÇÃO E PERSISTÊNCIA REAL: `clienteNome` de 200.000 caracteres e `clienteEmail` inválido de 5.015 caracteres atravessaram `criarAgendamentoPublico` e viraram uma linha real na tabela `clientes` do tenant `avantis` (id `b9996be6…`, `len(nome)=200000`, `len(email)=5015`), via `createAdminClient()` com RLS ignorado. Confirmei por leitura sob `service_role` e removi a linha (DELETE 204). Escrita anônima sem teto de campo num fluxo público — não deferida a nenhuma fase posterior"
        - "WR-03 do 01-REVIEW.md CONFIRMADO por leitura: `docs/PENDENCIAS.md:812-814,830` segue afirmando que o INSERT direto pela Data API contorna a action e que a proteção seria `Impossível contornar escrevendo direto na Data API (garantido pelo item de integridade)` — factualmente falso depois de `20260722060000` + `20260722055941` desta fase, que revogaram a Data API de `anon` (medido: anon POST → 42501). A Definition of Done §6 do CLAUDE.md exige atualizar PENDENCIAS quando a fase destrava uma tarefa"
gaps:
    - truth: "O instrumento que o projeto cita como prova de SEG-01/02/03 não pode imprimir afirmação positiva de fechamento sem uma prova positiva POR TABELA (must-have de 01-15/01-17: 'checagem que não prova nada não pode passar')"
      status: failed
      reason: >-
          MEDIDO, NÃO INFERIDO. Montei um stub HTTP local (`perfis_empresas` respondendo
          `42501`, o canário respondendo `PGRST205`, e as outras 7 tabelas declaradas
          respondendo `200 []` — o estado exato de uma tabela reaberta a `anon` mas vazia)
          e rodei `scripts/verificar-superficie-anon.sh` contra ele num diretório isolado.
          Resultado: EXIT 0, veredito `[ALVO]` presente (a referência `perfis_empresas`
          basta), `[COBERTURA] 9 declarada(s), 9 coberta(s)`, e a última linha
          `Resumo: 11 checagem(ns), 4 com prova positiva, 0 reprovada(s) — a role anon não
          devolveu linha nenhuma.` Sete tabelas ABERTAS a `anon`, e o instrumento declara
          fechamento com exit 0.
          A causa: `ESPERADAS` é um contador GLOBAL (`:216`), `marcar_checada` roda ANTES
          do curl (`:288,:320`), então `COBERTURA` mede TENTATIVA de requisição e não PROVA
          de fechamento; `200 []` vira `INCONCLUSIVO` (`:286-291`) e `INCONCLUSIVAS` não
          entra em gate de exit code nenhum (só `ESPERADAS -eq 0` e `REPROVADAS -eq 0`
          decidem). O controle `verificar-controle-harness-anon.sh` NÃO cobre este cenário:
          seus três estados negativos (morto, projeto errado, nega-tudo) são estados
          GLOBAIS do alvo; nenhum monta um alvo PARCIALMENTE aberto. É o WR-08/gap-da-3ª
          exatamente, uma granularidade abaixo — a mesma classe de falso-verde que esta
          fase reprovou três vezes.
          Por que é gap e não aviso: o `ROADMAP.md:195` e o `01-04-PLAN.md:170` nomeiam o
          exit 0 deste script como prova de SEG-01/02/03, e o plano 01-19 registrou a
          credibilidade do instrumento como restaurada ("nenhum documento volta a citar o
          exit 0 sem nomear o controle que o sustenta") — mas o controle que o sustenta não
          testa o caso que eu reproduzi. NÃO contamina os Success Criteria: a postura REAL
          é correta e eu a medi direto (as 9 tabelas devolvem 42501 a `anon` AGORA), sem
          depender deste harness.
      artifacts:
          - path: "scripts/verificar-superficie-anon.sh"
            issue: "contador ESPERADAS global (:216) + marcar_checada antes do curl (:288,:320) + INCONCLUSIVO fora de qualquer gate → exit 0 com 7/9 tabelas abertas-mas-vazias"
          - path: "scripts/verificar-controle-harness-anon.sh"
            issue: "os três estados negativos são globais; falta um quinto veredito ALVO_PARCIAL que exija reprovação num alvo parcialmente aberto"
      missing:
          - "Prova positiva e cobertura POR TABELA: `declare -A VEREDITO_POR_TABELA`; `COBERTURA` reprova toda tabela declarada cujo veredito não seja ESPERADO (INCONCLUSIVO/AUSENTE não é prova)"
          - "Quinto veredito `ALVO_PARCIAL` no controle: um stub que responde 42501 num caminho e `200 []` nos demais tem de fazer o harness REPROVAR — senão o conserto fecha um eixo e abre outro pela terceira vez"
          - "Enquanto o controle não cobrir o alvo parcial, nenhum documento pode citar o exit 0 deste script como prova de fechamento — só a leitura tabela a tabela do relatório"
    - truth: "A superfície pública de ESCRITA não persiste dado de terceiro sem teto de tamanho nem validação de formato (o caminho que a 3ª rodada endureceu na LEITURA e deixou aberto na ESCRITA)"
      status: resolved
      resolution: >-
          RESOLVIDO no fix 738a896: `criarAgendamentoPublico` passou a recusar, ANTES de
          `createAdminClient()`, `clienteNome` fora de 1..120 chars (após trim) e
          `clienteEmail` opcional que exceda 254 chars ou não case um `@` com domínio
          (`email_invalido`, oitavo membro de `MotivoPublico`). Prova hermética em
          `src/app/actions/__tests__/public-booking-validacao.test.ts` (commit vermelho
          e7adc01): nome de 200.000 chars e e-mail malformado são rejeitados SEM que
          `createAdminClient` seja chamado. Verificado: `pnpm test` 16 arq / 241 testes,
          `pnpm lint` limpo, `pnpm build` exit 0. Pendências não fechadas por este fix
          (fora do escopo do CR-02): o CHECK espelhado no banco (`06_clientes.sql`) e a
          sonda em `verificar-travessia-server-action.sh` seguem em `missing` abaixo.
      reason: >-
          MEDIDO E PERSISTIDO. Chamei `criarAgendamentoPublico` por HTTP contra `next start`
          de produção, slug real `avantis`, sem sessão, com `clienteNome` de 200.000
          caracteres e `clienteEmail` inválido de 5.015 caracteres (`nao-e-email<<>>xxxx…`).
          Resposta `{ok:true,agendamento:{id:fb20e63c…,status:confirmado}}` em 3,7 s. Conferi
          por leitura sob `service_role`: virou linha real em `clientes` (id `b9996be6…`,
          `len(nome)=200000`, `len(email)=5015`, e-mail sintaticamente inválido gravado
          cru). Removi a linha depois de medir (DELETE 204, resíduo `[]`).
          `criarAgendamentoPublico` endureceu `clienteTelefone` (10-11 dígitos, `:326-328`)
          e `dataHora` (`isNaN`, `:332-334`), mas `clienteNome`/`clienteEmail` só passam por
          `!clienteNome` (truthy) e `?.trim() || null` (`:322,:448-450`). Sem limite de
          comprimento, sem checagem de formato de e-mail, e `clientes.nome`/`email` são
          `text` sem `CHECK` (`06_clientes.sql`). O `INSERT` usa `createAdminClient()` — RLS
          ignorado, e a própria action é, por desenho, "o porteiro que substitui o RLS". O
          único teto é `serverActions.bodySizeLimit` (6 MB).
          Ressalvas honestas: (a) NÃO falsifica SC2 — o POST direto na Data API está
          rejeitado (medi anon POST clientes/agendamentos → 42501), e o booking "como antes"
          é a Server Action, que funciona; (b) a ausência de validação é PRÉ-EXISTENTE ao
          pivô (master já não validava). É gap porque a fase se chama "hardening da
          superfície pública", o milestone é abrir ao público, o e-mail sem checagem é o
          campo que o Resend vai consumir na Phase 4, e isto NÃO está deferido: conferi que
          a Phase 3 é rate limiting (deixa a PRIMEIRA requisição passar; uma basta para
          gravar 6 MB), não validação de campo.
      artifacts:
          - path: "src/app/actions/public-booking.ts"
            issue: "linhas 322,448-450 — clienteNome/clienteEmail sem teto de tamanho nem validação de formato antes do INSERT com createAdminClient()"
          - path: "supabase/schemas/06_clientes.sql"
            issue: "nome/email são text sem CHECK de char_length"
      missing:
          - "Teto e formato na fronteira da action: `MAX_NOME_CLIENTE`/`MAX_EMAIL_CLIENTE` e um regex de e-mail, devolvendo `campos_obrigatorios` (já é membro de MotivoPublico, não edita cópia)"
          - "Espelhar o teto no banco: `CHECK (char_length(nome) <= 120)` em `06_clientes.sql`, migration via `db diff` (mesmo padrão de `perfis_empresas.endereco`)"
          - "Sonda nova em `verificar-travessia-server-action.sh` com nome absurdo exigindo `campos_obrigatorios`, para a guarda não sumir sem aviso"
    - truth: "docs/PENDENCIAS.md fica coerente com o código depois desta fase (Definition of Done §6 do CLAUDE.md)"
      status: partial
      reason: >-
          CONFIRMADO por leitura de `docs/PENDENCIAS.md:807-838`. A seção "Rate limiting e
          proteção contra agendamentos falsos/abuso" não foi tocada no diff da fase e segue
          afirmando `o INSERT direto pela Data API contorna qualquer proteção que fosse
          colocada na action — este item depende do item de integridade acima` e
          `Impossível contornar escrevendo direto na Data API (garantido pelo item de
          integridade)`. As duas afirmações ficaram FALSAS nesta fase:
          `20260722060000_fecha_data_api_para_anon.sql` (`revoke all on all tables in schema
          public from anon`) somado a `20260722055941_fecha_policies_anon.sql` removeu o
          caminho de escrita anônima pela Data API — medi anon POST clientes/agendamentos →
          42501. A dependência declarada não existe mais e o rate limit na action passou a
          ser suficiente: a fase DESTRAVOU esta tarefa e o documento descreve o mundo
          anterior. Quem ler o backlog na Phase 3 vai deferir de novo pelo motivo errado.
          O plano 01-19 tocou PENDENCIAS (fechou o item do webhook e o do laço público,
          abriu o da escapada de plataforma) mas não corrigiu esta seção.
      artifacts:
          - path: "docs/PENDENCIAS.md"
            issue: "linhas 812-814 e 830 — dependência do 'item de integridade' e 'Impossível contornar pela Data API' agora factualmente falsas"
      missing:
          - "Reescrever o 'Estado atual verificado' e as dependências da seção de rate limiting: a Data API já não é caminho de escrita anônima; o rate limit na action é suficiente e a tarefa está destravada para a Phase 3"
deferred: []
behavior_unverified_items: []
human_verification:
    - test: "Wizard completo de /book/[slug] no navegador, em `next start` sobre build de produção — nunca em `pnpm dev`"
      expected: "Serviço → data/hora → contato → 'Horário confirmado!', e a linha aparecendo na agenda do dashboard, sem fricção nova"
      why_human: "Renderização e fluxo de tela não se inferem de código HTTP nem de suíte. Item 1 de docs/PENDENCIAS.md"
    - test: "Recuperação de double-booking NA TELA, em `next start`"
      expected: "Aviso âmbar 'Este horário já foi preenchido ou está indisponível. Por favor, selecione outro.', volta para a etapa de data/hora, grade refeita"
      why_human: "O discriminante atravessa a fronteira (veredito ESCRITA_VALIDACAO medido), mas quem vê a tela é o olho humano. Item 2 de docs/PENDENCIAS.md"
    - test: "Caixa de erro de slots NA TELA, em `next start`"
      expected: "'Não foi possível carregar os horários. Tente de novo.' com role=\"alert\" e o botão 'Tentar de novo' reexecutando a busca"
      why_human: "Item 3 de docs/PENDENCIAS.md"
    - test: "Dashboard tela a tela sob as policies tenant-scoped, incluindo reativar um serviço inativo"
      expected: "Nenhuma tela degrada em branco depois do DROP das policies residuais do plano 01-08"
      why_human: "Item 4 de docs/PENDENCIAS.md"
    - test: "Personalização por plano na página pública"
      expected: "Pro exibe cor/logo/capa; gratuito não exibe nada disso — inclusive durante degradação de leitura de assinaturas"
      why_human: "Com o RLS fora do caminho público (D-02), a sanitização por plano é defesa única. Item 5 de docs/PENDENCIAS.md"
    - test: "Lembrete do QStash ponta a ponta, com a URL de destino já sem query string"
      expected: "A mensagem chega; nenhum 401 no log (401 indicaria mismatch de URL atrás do proxy — WR-04 deferido)"
      why_human: "O caminho de falha é inteiramente silencioso por design. Item 6 de docs/PENDENCIAS.md"
    - test: "Backstops visuais com dado extremo (20+ serviços, horizonte_maximo_dias = 30, nomes longos)"
      expected: "Layout não quebra em mobile nem em desktop"
      why_human: "São as truths verification: backstop dos planos 01-10 e 01-12. Item 7 de docs/PENDENCIAS.md"
    - test: "Rotação das signing keys do QStash no painel da Upstash"
      expected: "Chaves rotacionadas antes de 2026-08-05 (a chave HMAC já circulou em URL publicada e em log — resíduo registrado em docs/PENDENCIAS.md:806)"
      why_human: "Só o owner tem acesso ao painel; nenhum executor pode marcar este item"
---

# Phase 1: Hardening da superfície pública — Relatório de verificação (4ª rodada)

**Goal da fase:** A chave publicável que vai no bundle deixa de dar acesso a qualquer coisa além do estritamente necessário para a página pública funcionar, e o webhook de lembrete só aceita quem o QStash assinou
**Verificado:** 2026-07-22T22:22:36Z, sobre o HEAD `7937aed`
**Status:** gaps_found
**Reverificação:** Sim — 4ª passagem, depois da 3ª rodada de fechamento de gaps (planos 01-17 a 01-19)

## Nota de método, antes de qualquer veredito

Esta rodada teve, pela primeira vez nas quatro, acesso de DDL ao banco de dev — o
`SUPABASE_POSTGRES_PASSWORD` do `.env.local` abre o pooler `aws-1-sa-east-1` como
`postgres`. Usei isso para medir o SC4 por caminho direto (criar objeto descartável,
conferir `has_table_privilege`/`has_function_privilege`, provar via HTTP, remover), o que
a 3ª rodada não conseguiu e deixou como PRESENTE-NÃO-EXERCITADO. Também confirmei a
identidade do alvo por dois lados: mesmas 9 tabelas em `pg_tables`, mesmo `slug=avantis`,
mesmo host que respondeu por HTTP. Onde medi por HTTP, medi contra a URL do
`.env.local`; onde medi por SQL, contra o mesmo banco.

A disciplina desta fase — "critério que lê como satisfeito enquanto a medição diz outra
coisa é o defeito" — foi aplicada ao instrumento da própria fase. Rodei os quatro
harnesses, mas não herdei o exit code de nenhum como prova: os cinco Success Criteria
foram remedidos por medição independente (HTTP anônimo direto com controle positivo de
identidade sob `service_role`, e DDL via psql para o SC4). Onde o harness e a minha
medição concordam, digo. Onde o harness sai 0 mas eu reproduzi um estado em que ele não
deveria (CR-01), reprovo o instrumento e mantenho o Success Criteria verde pela medição
direta — porque a postura real está certa e a falha é do instrumento, não do portão.

## Alcance do goal

### Truths observáveis

| # | Truth | Status | Evidência |
|---|---|---|---|
| 1 | **SC1** — `curl` anônimo em `perfis_empresas` não devolve a lista de profissionais, nem `telefone_contato`, nem o `org_id` | ✓ VERIFICADO | Medido por mim. `select=*`, `tenant_id`, `telefone_contato`, `slug`, `nome_estabelecimento` → **HTTP 401 / 42501** `permission denied for table perfis_empresas`. Controle positivo: a mesma URL sob `service_role` devolve `[{"tenant_id":"org_3GQ4…"}]` (508 bytes) |
| 2 | **SC2a** — POST anônimo em `agendamentos` e `clientes` é rejeitado | ✓ VERIFICADO | Medido com colunas corretas do schema (`data_hora`, `cliente_id`, `servico_id`): os dois → **401 / 42501**, com o `hint` do Postgres pedindo o `GRANT INSERT` que não existe |
| 3 | **SC2b** — o booking público continua funcionando **exatamente como antes** | ✓ VERIFICADO | Três medições: (a) `verificar-travessia-server-action.sh` → **7/7** contra `next start`; (b) sonda HTTP minha, slug `avantis`, `dur=30` → grade completa (08:00…17:30), 2.180 bytes em 890 ms; (c) `pnpm test` 235/235. Regra: escrita legítima grava (medi um agendamento real chegando a `confirmado`) |
| 4 | **SC3** — `agendamentos` e `excecoes_agenda` sem `cliente_id` e sem `motivo` para `anon` | ✓ VERIFICADO | Medido: `?select=cliente_id`, `?select=motivo`, `?select=data_hora`, `?select=servico_id` → 401/42501. Satisfeito com folga — `anon` não lê coluna nenhuma das duas tabelas (∅ ⊂ colunas da engine) |
| 5 | **SC4** — tabela (e função) nova não aparece na Data API sem GRANT explícito | ✓ VERIFICADO — antes PRESENTE-NÃO-EXERCITADO | **Medido por DDL nesta rodada.** Criei `sonda_sc4_verificador_zzz` (tabela) e `sonda_sc4_funcao_zzz()` (função) como `postgres`. `has_*_privilege`: `anon`/`authenticated` → `f/f/f`; `service_role` → `t/t/t`. Por HTTP: anon GET tabela → 42501, anon POST rpc → 42501; `service_role` → 200 com a linha e o retorno. Objetos removidos depois de medir (sem resíduo). `pg_default_acl`: `public/tables` e `public/functions` só carregam `postgres` e `service_role` |
| 6 | **SC5a** — POST sem assinatura válida do QStash é rejeitado | ✓ VERIFICADO | Veredito `WEBHOOK` de `verificar-fail-fast-boot.sh`, rodado por mim: **401 sem assinatura \| 401 com `?secret=` legado \| 401 com `Upstash-Signature` forjado \| 200 no controle GET /**. Código: `qstash-assinatura.ts` sem caminho permissivo (chave ausente lança; `receiver.verify` no `try` devolve `false` no catch) |
| 7 | **SC5b** — a aplicação **não sobe** sem as chaves de assinatura | ✓ VERIFICADO | Veredito `MORTE`, rodado por mim: `next start` encerrou com **código 1**, nomeou `QSTASH_NEXT_SIGNING_KEY` em stderr, porta recusou conexão. Reproduzi na mão: com as obrigatórias ausentes o boot imprime `[boot] Encerrando o processo com código 1`. `QSTASH_NEXT_SIGNING_KEY` está na lista `OBRIGATORIAS_EM_PRODUCAO` (`env.ts:37-51`). Veredito `BUILD`: `pnpm build` sai 0 com a variável vazia |
| 8 | **GOAL, 2ª metade** — "o webhook de lembrete só aceita quem o QStash assinou" | ✓ VERIFICADO | `whatsapp-helper.ts` publica `${APP_URL}/api/webhooks/lembrete` sem query string; a rota autentica pela assinatura ANTES de parsear o corpo (`route.ts:16-43`) |
| 9 | **01-15/01-17** — "checagem que não prova nada não pode passar" | ✗ **REPROVADO** (gap 1) | O eixo alvo-morto e o eixo zero-prova estão fechados (reproduzi: alvo inalcançável → exit 2). Mas reproduzi um TERCEIRO eixo com stub: alvo parcialmente aberto (7/9 tabelas `200 []`) → **exit 0**, `4 com prova positiva, 0 reprovada(s)`, frase de fechamento impressa. Mesma classe, granularidade de tabela |
| 10 | **01-18** — entrada hostil não derruba o processo | ✓ VERIFICADO — gap da 3ª rodada fechado | `dur=-5000000` → `servico_invalido` em 9 ms / 109 bytes (era 26.751 ms / 19,29 MB). Guarda na fronteira (`public-booking.ts:646-656`, antes de I/O) e no contrato puro (`booking-engine.ts:154`). `dateStr` malformado → `data_invalida`, não mais `{ok:true,slots:[]}` |
| 11 | **01-10/01-12** — erro esperado atravessa a fronteira de flight com identidade preservada | ✓ VERIFICADO | Harness `verificar-travessia-server-action.sh` por mim: `SLOTS_ERRO` carrega `slug_invalido`, `ESCRITA_VALIDACAO` carrega `campos_obrigatorios`, `ENTRADA_HOSTIL`/`DATA_HOSTIL` recusam na fronteira sem `slug_invalido`, `SEM_VAZAMENTO` limpo. Nenhum `digest` opaco |
| 12 | **Requisitos SEG-01..05** declarados no PLAN batem com REQUIREMENTS.md | ✓ VERIFICADO | Os cinco IDs aparecem nos frontmatters (01-17: SEG-01/02/03; 01-18: SEG-01/02; 01-19: SEG-04/05) e todos constam de `REQUIREMENTS.md:13-17` mapeados à Phase 1 (`:209`). Nenhum órfão, nenhum a mais |

**Score:** 5/5 Success Criteria do ROADMAP verificados por medição direta. O GOAL da fase
está alcançado. Reprovam 3 truths de fase (gap 1 instrumento, gap 2 escrita sem teto, gap
3 doc incoerente) que não falsificam nenhum Success Criteria mas pertencem à carta da
fase e à sua Definition of Done.

### Por que gaps_found com o goal alcançado

O GOAL literal — a chave publicável não dá acesso a nada além do necessário, e o webhook
só aceita quem o QStash assinou — está VERDADEIRO no banco, e eu medi cada metade direto.
O que reprova é uma camada abaixo do goal, e é medido, não inferido:

- **A escrita pública não recebeu o endurecimento que a leitura recebeu (gap 2).** A 3ª
  rodada fechou o laço síncrono na LEITURA com teto (`DURACAO_MAXIMA_MINUTOS`), formato
  (`FORMATO_DATA_ISO`) e semântica (`ehDataDeCalendario`). O caminho de ESCRITA — o único
  que PERSISTE dado de terceiro — não ganhou nenhum dos três para `clienteNome`/`email`.
  Eu gravei 200 KB de texto arbitrário na tabela `clientes` de um profissional, anônimo,
  sem sessão, RLS ignorado. Numa fase chamada "hardening da superfície pública", com o
  milestone "abrir ao público" e a Fricção Zero proibindo CAPTCHA, a validação de entrada
  é a única defesa — e ela ficou pela metade.

- **O instrumento de prova ainda pode dar falso-verde (gap 1).** O `ROADMAP.md:195` e o
  `01-04-PLAN.md:170` citam o exit 0 de `verificar-superficie-anon.sh` como a prova de
  SEG-01/02/03. Eu reproduzi um estado (alvo parcialmente aberto) em que ele sai 0
  declarando fechamento com 7 de 9 tabelas abertas. Esta fase reprovou três vezes por
  "critério que lê como satisfeito enquanto a medição diz outra coisa"; a regra vale para
  a régua da própria fase. NÃO uso o exit 0 dele como prova aqui — por isso o SC continua
  verde: medi direto.

- **O backlog descreve o mundo anterior (gap 3).** A seção de rate limiting em PENDENCIAS
  ainda diz que a Data API contorna a action; esta fase revogou a Data API de `anon`. A
  Definition of Done §6 exige atualizar o documento quando a fase destrava uma tarefa.

Nenhum dos três está deferido a fase posterior: a Phase 3 é rate limiting (teto de
REPETIÇÃO, deixa a primeira requisição passar), não validação de campo nem conserto de
instrumento.

### Required Artifacts

| Artefato | Esperado | Status | Detalhe |
|---|---|---|---|
| `scripts/verificar-superficie-anon.sh` | harness com prova positiva e identidade do alvo | ⚠️ PARCIAL | Fecha alvo-morto e zero-prova; falso-verde no alvo parcialmente aberto (gap 1) |
| `scripts/verificar-controle-harness-anon.sh` | controle re-executável, reprova nos estados de falha | ⚠️ PARCIAL | 4/4 nos três estados globais; falta o quinto (alvo parcial) |
| `src/app/actions/public-booking.ts` | fronteira valida `dateStr`/`duracaoMinutos`; escrita sanitiza campos | ⚠️ PARCIAL | Leitura endurecida (medido); escrita sem teto de nome/e-mail (gap 2) |
| `src/lib/booking-engine.ts` | guarda de profundidade em `gerarSlotsAntiBuraco` | ✓ VERIFICADO | `:154` recusa duração ≤ 0/não-inteira; medido 66 k→0 entradas |
| `src/app/actions/agendamentos.ts` | `obterSlotsDashboard` valida `duracaoMinutos` | ✓ VERIFICADO | Simetria com o público (existente + confirmado por lint/test) |
| `src/lib/env.ts` | `QSTASH_NEXT_SIGNING_KEY` na lista obrigatória | ✓ VERIFICADO | `:44` na `OBRIGATORIAS_EM_PRODUCAO`; boot morre code 1 (medido) |
| `src/lib/qstash-assinatura.ts` | sem caminho permissivo | ✓ VERIFICADO | Chave ausente lança; verify no try/catch → false |
| migrations de privilégio (5) | REVOKE/ALTER DEFAULT PRIVILEGES coerentes | ✓ VERIFICADO | `pg_default_acl` medido: `public` tables/functions só `postgres`+`service_role` |
| `docs/03-PADROES_DE_BANCO_DE_DADOS.md` | regra SC4 qualificada pela role criadora | ✓ VERIFICADO | §Privilégios da Data API (:78-160) qualifica por `postgres` e nomeia a escapada de plataforma; bate com meu `pg_default_acl` |
| `docs/PENDENCIAS.md` | coerente com o código pós-fase | ⚠️ PARCIAL | Seção de rate limiting desatualizada (gap 3) |

### Key Link Verification

| De | Para | Via | Status | Detalhe |
|---|---|---|---|---|
| chave publicável (`anon`) | 9 tabelas + 2 funções | Data API PostgREST | ✓ FECHADO | Medido: 42501 em todas |
| `obterSlotsPublicos` (fronteira) | `createAdminClient()` / engine | guarda antes do I/O | ✓ WIRED | Recusa em 9 ms sem tocar o banco |
| `criarAgendamentoPublico` | `clientes.INSERT` | `createAdminClient()` | ⚠️ SEM TETO | Persiste campo arbitrário (gap 2) |
| webhook | assinatura QStash | `verificarAssinaturaQstash` antes do parse | ✓ WIRED | 401 em 3 cenários hostis |
| `next start` prod | boot | `validarEnvObrigatorio` | ✓ WIRED | code 1 sem `QSTASH_NEXT_SIGNING_KEY` |
| exit 0 do harness | prova de SEG-01/02/03 | citado em ROADMAP/PLAN | ⚠️ FRÁGIL | Falso-verde no alvo parcial (gap 1) |

### Behavioral Spot-Checks

| Comportamento | Comando | Resultado | Status |
|---|---|---|---|
| GET anônimo nas 9 tabelas | fetch com chave publicável | 9× HTTP 401/42501 | ✓ PASS |
| POST anônimo clientes/agendamentos | fetch com chave publicável | 401/42501 | ✓ PASS |
| SC4 objeto novo | DDL psql + `has_*_privilege` + HTTP | anon f/f/f, service t/t/t | ✓ PASS |
| DoS por `duracaoMinutos` negativo | Next-Action HTTP contra prod | `servico_invalido`, 9 ms | ✓ PASS |
| Escrita com nome de 200 KB | Next-Action HTTP contra prod | **linha persistida** | ✗ FAIL (gap 2) |
| Harness alvo parcialmente aberto | stub HTTP local | **exit 0 declara fechamento** | ✗ FAIL (gap 1) |
| Harness alvo morto | dir isolado, host RFC-2606 | exit 2, frase ausente | ✓ PASS |
| `pnpm test` / `pnpm lint` | por mim, HEAD 7937aed | 235/235 / exit 0 | ✓ PASS |

### Probe Execution

| Probe | Comando | Resultado | Status |
|---|---|---|---|
| `scripts/verificar-superficie-anon.sh` | `bash …` (alvo real) | exit 0, 11 ESPERADO | PASS (mas ver gap 1 sobre alvo parcial) |
| `scripts/verificar-controle-harness-anon.sh` | `bash …` | exit 0, 4/4 | PASS |
| `scripts/verificar-travessia-server-action.sh` | `bash …` | exit 0, 7/7 | PASS |
| `scripts/verificar-fail-fast-boot.sh` | `bash …` | exit 0, 4/4 | PASS |

### Requirements Coverage

| Requisito | Plano de origem | Descrição | Status | Evidência |
|---|---|---|---|---|
| SEG-01 | 01-17, 01-18 | anon não insere agendamento/cliente pela Data API | ✓ SATISFEITO | POST anon → 42501 (medido) |
| SEG-02 | 01-17 | `perfis_empresas` não enumerável | ✓ SATISFEITO | GET anon → 42501 em toda projeção |
| SEG-03 | 01-17, 01-18 | `agendamentos`/`excecoes_agenda` só colunas da engine | ✓ SATISFEITO | anon não lê coluna nenhuma → 42501 |
| SEG-04 | 01-19 | coluna/objeto novo nasce sem acesso anon | ✓ SATISFEITO | DDL: objeto novo f/f/f para anon (medido) |
| SEG-05 | 01-19 | webhook assinado + boot morre sem chaves | ✓ SATISFEITO | WEBHOOK + MORTE (medido) |

Todos os 5 IDs declarados nos planos constam de REQUIREMENTS.md e mapeiam à Phase 1.
Nenhum órfão. Observação: `REQUIREMENTS.md:147-151` ainda marca os cinco como "Gaps Found"
na tabela de status — a marcação é do fluxo de verificação, não do executor (o plano 01-19
honrou a proibição de tocar REQUIREMENTS.md).

### Anti-Patterns Found

| Arquivo | Linha | Padrão | Severidade | Impacto |
|---|---|---|---|---|
| — | — | Nenhum marcador `TBD`/`FIXME`/`XXX` real | ℹ️ Info | As ocorrências de grep são "XXXX" (máscara de telefone) e "TODOS" (pt-BR), não débito |
| `public-booking.ts` | 448-450 | `?.trim() \|\| null` sem teto | ⚠️ Warning | É o gap 2, já contabilizado |

### Verificação humana necessária

Oito itens (os 7 de UAT de tela de `docs/PENDENCIAS.md` + a rotação de chave do owner) —
ver frontmatter `human_verification`. Não os toco: renderização, fluxo de tela e acesso a
painel de terceiro não se inferem de código, e a contagem "7 abertas / 0 marcadas" é o
controle automatizado disso. Estes NÃO alteram a decisão gaps_found (regra 1 tem
precedência), mas ficam preservados para o checkpoint humano.

### Resumo dos gaps

O goal está alcançado e os cinco Success Criteria estão verdes por medição minha. O que
falta é o acabamento da própria carta da fase: (1) a régua que o projeto cita como prova
ainda dá falso-verde num alvo parcialmente aberto — reproduzi; (2) a escrita pública
persiste dado de terceiro sem teto — gravei 200 KB anônimos e removi; (3) o backlog
descreve o mundo pré-fase na seção de rate limiting. Nenhum depende de infraestrutura nem
está deferido. Os três são fecháveis em `scripts/` + `src/app/actions/public-booking.ts` +
`supabase/schemas/06_clientes.sql` + `docs/PENDENCIAS.md`, sem tocar o caminho que já
passou.

---

_Verificado: 2026-07-22T22:22:36Z, HEAD `7937aed`_
_Verificador: Claude (gsd-verifier) — medição própria por HTTP anônimo, Next-Action contra build de produção, e DDL via psql no pooler aws-1-sa-east-1_
