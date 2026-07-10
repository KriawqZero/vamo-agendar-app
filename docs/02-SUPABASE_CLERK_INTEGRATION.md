# 02 - Integração Supabase + Clerk (integração nativa)

Este documento detalha o mecanismo de autenticação e autorização unificado entre o
**Clerk** (identidade e multi-tenancy) e o **Supabase** (banco de dados).

> [!IMPORTANT]
> Usamos a **integração nativa** (third-party auth). O fluxo antigo de **JWT template**
> (`getToken({ template: 'supabase' })`) foi **depreciado pelo Clerk em abril/2025** e
> **não funciona** nesta instância (retorna 404 "Not Found"). Nunca reintroduza
> `template: 'supabase'` no código.

---

## 🔗 Fluxo de Autenticação Sem Sincronização de Banco

Não há webhooks nem tabelas de usuários sincronizadas. O isolamento multi-tenant
funciona assim:

1. O Clerk emite o **session token padrão** do usuário, contendo o claim customizado
   `org_id` (organização ativa = tenant).
2. `createClient()` (em `src/lib/supabase/server.ts`) injeta esse token no header
   `Authorization` de toda chamada ao Supabase — **apenas quando há sessão**.
3. O Supabase valida a assinatura do JWT contra as chaves públicas do Clerk
   (third-party auth) e aplica as políticas RLS usando os claims.
4. Sem sessão (fluxo público B2C), nenhum header é enviado e a requisição cai na role
   `anon` — um `Bearer null` seria rejeitado pelo PostgREST.

---

## ⚙️ Configuração necessária nos dashboards (feita em 2026-07-09)

Se a instância do Clerk ou o projeto Supabase forem recriados, refaça:

1. **Clerk Dashboard → Configure → Integrations → Supabase**: ativar a integração
   (adiciona o claim `role: "authenticated"` aos session tokens) e copiar o
   **Clerk domain**.
2. **Supabase Dashboard → Authentication → Sign In / Providers → Third Party Auth**:
   adicionar **Clerk** com o domain copiado.
3. **Clerk Dashboard → Sessions → Customize session token**: adicionar o claim que o
   RLS consome (instâncias novas emitem o id da organização como `o.id`, não `org_id`):

   ```json
   { "org_id": "{{org.id}}" }
   ```

   Sem esse claim, mutações B2B falham com "new row violates row-level security
   policy" mesmo com o usuário logado e organização ativa.

---

## 🛠️ Cliente Supabase no servidor (`src/lib/supabase/server.ts`)

Padrão do código real (mantenha este doc em sincronia se alterá-lo):

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'

export async function createClient() {
    const cookieStore = await cookies()
    const { getToken } = await auth()

    // Integração nativa Clerk ↔ Supabase (third-party auth): o session token padrão
    // do Clerk já é aceito pelo Supabase — o fluxo de JWT template foi depreciado.
    // Retorna null quando não há sessão (fluxo B2C anônimo).
    const supabaseAccessToken = await getToken()

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
            cookies: { /* getAll/setAll padrão do @supabase/ssr */ },
            // Sem sessão, omitimos o header para a requisição cair na role `anon`
            ...(supabaseAccessToken && {
                global: {
                    headers: {
                        Authorization: `Bearer ${supabaseAccessToken}`,
                    },
                },
            }),
        }
    )
}
```

O **mesmo** `createClient()` serve os dois mundos: B2B autenticado (dashboard, role
`authenticated`) e B2C público (booking, role `anon`).

---

## ⚡ Server Action modelo com RLS

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'

export async function exemploMutacaoB2B(input: unknown) {
    // 1. Valida a organização ativa no Clerk
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    // 2. Cliente com o token injetado
    const supabase = await createClient()

    // 3. Mutação sempre com tenant_id = orgId. O RLS rejeita se o claim não bater.
    const { data, error } = await supabase
        .from('alguma_tabela')
        .insert({ tenant_id: orgId /* , ...campos */ })
        .select()
        .single()

    if (error) throw new Error('Erro ao salvar.')
    return data
}
```

---

## 🛡️ RLS: performance crítica (initPlan)

As políticas comparam `tenant_id = (SELECT auth.jwt() ->> 'org_id')`. O `SELECT`
envolvendo `auth.jwt()` é **obrigatório**: força o Postgres a avaliar a função uma
única vez por statement (initPlan) em vez de por linha.

```sql
-- ❌ Ruim (avalia por linha)
USING (tenant_id = (auth.jwt() ->> 'org_id'))

-- ✅ Correto (initPlan)
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))
```

---

## ⚠️ Armadilhas conhecidas

- **INSERT/UPDATE ... RETURNING exige passar na política de SELECT**: o `.select()`
  do supabase-js adiciona RETURNING, e a linha resultante precisa ser visível pela
  política de SELECT da role. Por isso tabelas com SELECT público filtrado (ex.:
  `ativo = true`) têm também uma política de SELECT do próprio tenant.
- **Usuário logado numa página pública de outro tenant** roda como `authenticated`,
  não `anon` — políticas públicas devem contemplar `TO anon, authenticated` quando o
  dado precisa ser visível no fluxo B2C.
- **GRANT por coluna**: em `assinaturas`, a role `anon` só lê
  `tenant_id/plano/status` — o código público usa `obterPlanoVigentePublico()`
  (nunca `obterAssinaturaVigente`, que selecionaria coluna proibida).
- **Cliente privilegiado (`src/lib/supabase/admin.ts`)**: a fase de DISPARO da
  mensageria (confirmação no booking anônimo e webhook de lembrete) usa a secret key
  (`SUPABASE_SECRET_KEY`, ignora RLS) porque precisa ler `whatsapp_configs`
  (`instance_token`) e `clientes` sem sessão. Uso restrito a esses pontos — mutações
  de tenant continuam nas Server Actions com RLS.
