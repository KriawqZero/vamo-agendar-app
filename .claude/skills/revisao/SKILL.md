---
name: revisao
description: Use quando for revisar o branch atual antes de merge (invocar com /revisao [ref-base opcional]).
disable-model-invocation: true
---

# Revisão paranoica pré-merge

Papel: **encontrar problemas, não validar o trabalho**. O melhor resultado possível
é um achado real que impediria um bug em produção; "nada encontrado" só é aceitável
depois de procurar de verdade.

## 1. Obter o diff

```bash
git diff master...HEAD
```

Se `$ARGUMENTS` contiver um ref, usar `git diff $ARGUMENTS...HEAD` (o branch
principal deste repositório é `master`; não existe `main`). Ler o diff completo —
não amostrar arquivos.

## 2. Revisar nesta ordem de severidade

### 🔴 Segurança (bloqueia sozinho)

- Tabela/query Supabase sem RLS, política `FOR ALL`, ou política sem
  `tenant_id = (SELECT auth.jwt() ->> 'org_id')`.
- `service_role`/`SUPABASE_SECRET_KEY` exposto em código client (`'use client'`,
  componentes, qualquer coisa que vá para o bundle).
- Input de usuário não validado/sanitizado antes de query ou action (especialmente
  no fluxo público `anon`: telefone, slug, ids).
- Secrets hardcoded (tokens, apikeys, URLs com credenciais).

### 🟠 Corretude

- Edge cases não tratados (nulo/vazio, timezone `America/Sao_Paulo`, limites de dia).
- Race conditions (double-booking, checagens app-layer sem proteção no banco).
- Erros engolidos silenciosamente (`catch` vazio, promise sem await, falha de
  integração sem log) — exceto o silêncio intencional documentado do fluxo
  WhatsApp para o cliente final.

### 🟡 Qualidade

- Código morto, imports não usados.
- Tipos `any` (explícitos ou implícitos).
- Duplicação de lógica que já existe em `src/lib/` ou em outra action.

## 3. Formato de cada achado

```
[SEVERIDADE] arquivo:linha — descrição do problema
Sugestão: correção concreta (código ou passo específico, não "considere melhorar")
```

## 4. Veredito final

- **APROVADO** — só se não houver achados 🔴 nem 🟠 abertos; justificar o que foi
  verificado.
- **BLOQUEADO** — listar os achados que bloqueiam e o que precisa mudar.

## Postura adversarial — não negociável

- Não aprovar por cortesia, cansaço ou porque "o autor claramente testou".
- "É só um diff pequeno" → diffs pequenos derrubam produção; revisar igual.
- "Esse padrão já existe no codebase" → padrão existente errado é achado, não
  precedente.
- Na dúvida entre 🟠 e 🟡, classificar como 🟠.
- Um veredito APROVADO sem nenhum achado 🟡 em um diff grande é suspeito —
  reler o diff antes de emitir.
