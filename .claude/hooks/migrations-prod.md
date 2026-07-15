# Hook de imutabilidade de migrations (INATIVO — ativar no go-live)

Bloqueia `Edit`/`Write` em arquivos **já existentes** dentro de `supabase/migrations/`,
mas **permite a criação de migrations novas** (arquivo que ainda não existe no disco).
Enquanto o projeto está em fase DEV (ver seção "Banco de dados" do `CLAUDE.md`),
este hook fica desativado de propósito.

O comando abaixo foi testado em 2026-07-15 nos três cenários (editar migration
existente → nega; criar migration nova → permite; arquivo fora de migrations → ignora).

## Bloco pronto para ativação

Adicionar esta entrada ao array `hooks.PreToolUse` do `.claude/settings.json`
(junto das entradas já existentes — **não** substituir o array):

```json
{
  "matcher": "Edit|Write",
  "hooks": [
    {
      "type": "command",
      "command": "f=$(jq -r '.tool_input.file_path // empty'); case \"$f\" in */supabase/migrations/*) if [ -e \"$f\" ]; then echo '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"Migrations aplicadas são imutáveis em produção: crie uma NOVA migration (supabase db diff) em vez de editar arquivos existentes em supabase/migrations/.\"}}'; fi;; esac; exit 0",
      "statusMessage": "Protegendo migrations aplicadas..."
    }
  ]
}
```

## Passos de ativação (go-live)

1. Copiar o bloco acima para dentro de `hooks.PreToolUse` em `.claude/settings.json`.
2. Validar a sintaxe:
   ```bash
   jq -e '.hooks.PreToolUse[] | select(.matcher == "Edit|Write") | .hooks[0].command' .claude/settings.json
   ```
3. Testar o comando isoladamente (deve imprimir o JSON de deny):
   ```bash
   echo '{"tool_input":{"file_path":"'$(pwd)'/supabase/migrations/20260708233747_baseline_schema_inicial.sql"}}' \
     | bash -c "$(jq -r '.hooks.PreToolUse[] | select(.matcher == "Edit|Write") | .hooks[0].command' .claude/settings.json)"
   ```
4. Completar os demais passos do go-live de banco no checklist
   (`docs/PENDENCIAS.md` → "Obrigatório antes do lançamento público" →
   "Demais preparações de lançamento" → "Go-live do banco").

## Limitações conhecidas

- Cobre apenas as ferramentas `Edit`/`Write` do Claude Code. Comandos Bash
  (`sed -i`, `>>` etc.) não passam por este matcher — se quiser fechar também esse
  caminho, adicionar uma entrada análoga com `"matcher": "Bash"` inspecionando
  `.tool_input.command`.
- O padrão `*/supabase/migrations/*` casa o caminho absoluto em qualquer profundidade;
  como só há um diretório `supabase/migrations/` no repositório, isso é suficiente.
