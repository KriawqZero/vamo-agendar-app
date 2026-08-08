---
phase: 05-contato-flexivel-no-booking
plan: 05-01
title: Migration de Schema clientes e RPC de Deduplicação Atômica
status: completed
date: "2026-08-08"
---

# Summary 05-01: Migration de Schema clientes e RPC de Deduplicação Atômica

## Accomplishments
1. Verificada a migration `supabase/migrations/20260808100000_contato_flexivel_clientes.sql` que torna `telefone` opcional (DROP NOT NULL), adiciona `CHECK (telefone IS NOT NULL OR email IS NOT NULL)` e cria o índice `idx_clientes_tenant_email`.
2. Confirmada a atualização da RPC `reaproveitar_ou_criar_cliente` priorizando a busca por WhatsApp (1º) e por E-mail (2º) com atualização atômica de campos faltantes.
3. Ajustada a invocação em `src/app/actions/public-booking.ts` para repassar `p_telefone: telefoneLimpo || null`.
4. Confirmada a suíte `src/app/actions/__tests__/public-booking-dedupe.test.ts` cobrindo cenários de deduplicação e busca por contato flexível.

## Verification
- `pnpm test`: 426/426 testes em 33 arquivos passaram.
- `npx tsc --noEmit`: 0 erros.
