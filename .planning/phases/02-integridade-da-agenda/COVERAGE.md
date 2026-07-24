# Phase 2 — API Coverage Decision

No external API integration: this phase is database integrity work — it adds
`data_hora_fim`, an exclusion constraint, a unique constraint and an atomic
upsert function, and rewires the availability engine and two Server Actions to
read/write those. It does NOT add or change any external integration.
`dispararNotificacoesAgendamento` (Evolution API + QStash) already exists and is
not modified here. No API coverage matrix applies.
