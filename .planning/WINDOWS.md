---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-07-22T05:31:18.919Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | deviation | src/lib/whatsapp-helper.ts |  | Parametro secret segue na URL publicada do QStash (Deferred): remover apos a fila drenar, ~14 dias | open |  | 2026-07-22T05:31:18.919Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "01",
    "file": "src/lib/whatsapp-helper.ts",
    "line": null,
    "description": "Parametro secret segue na URL publicada do QStash (Deferred): remover apos a fila drenar, ~14 dias",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-22T05:31:18.919Z",
    "resolved_at": null
  }
]
````
