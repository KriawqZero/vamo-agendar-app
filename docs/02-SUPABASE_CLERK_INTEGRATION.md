# 02 - Integração Supabase + Clerk

Este documento detalha o mecanismo de autenticação e autorização unificado entre o **Clerk** (gerenciador de identidade e multi-tenancy) e o **Supabase** (banco de dados).

---

## 🔗 Fluxo de Autenticação Sem Sincronização de Banco

Para manter a simplicidade e performance, **não utilizamos webhooks para sincronizar usuários do Clerk com tabelas locais do Supabase**. Em vez disso, confiamos na integração nativa por JWT (Third-Party Auth).

1. O Clerk gera um token JWT assinado contendo os claims do usuário e a organização ativa (`org_id`).
2. O Next.js intercepta ou solicita esse token usando o SDK do Clerk.
3. O token é injetado nas requisições HTTP para a API do Supabase no header `Authorization: Bearer <TOKEN>`.
4. O Supabase valida a assinatura do JWT contra as chaves públicas do Clerk e extrai os claims para aplicar as regras de **Row Level Security (RLS)**.

---

## 🛠️ Injeção de Token no Supabase SSR Client

A inicialização do cliente Supabase no lado do servidor deve obter dinamicamente o token JWT específico gerado pelo Clerk para o template do Supabase.

### Configuração do Cliente (`src/lib/supabase/server.ts`)

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'

export async function createClient() {
    const cookieStore = await cookies()
    const { getToken } = await auth()

    // Recupera o JWT assinado pelo Clerk configurado para o Supabase
    const supabaseAccessToken = await getToken({ template: 'supabase' })

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // Ignorado em Server Components puros conforme padrão do Next.js
                    }
                },
            },
            global: {
                headers: {
                    // Injeta o JWT do Clerk para validação do RLS no Supabase
                    Authorization: `Bearer ${supabaseAccessToken}`,
                },
            },
        }
    )
}
```

---

## ⚡ Server Action Modelo com RLS

Toda mutação ou consulta que dependa de autorização deve passar pelo cliente injetado. Veja o exemplo de Server Action modelo:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'

export async function criarNovoAgendamento(clienteId: string, dataHora: string) {
    // 1. Valida se o usuário está associado a uma organização ativa no Clerk
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error("Usuário não está associado a nenhuma empresa no Clerk.")
    }

    // 2. Inicializa o cliente com o token injetado
    const supabase = await createClient()

    // 3. Executa a mutação. O RLS do banco rejeitará caso o tenant_id não bata com o JWT!
    const { data, error } = await supabase
        .from('agendamentos')
        .insert({
            tenant_id: orgId, // Vincula a mutação à organização atual
            cliente_id: clienteId,
            data_hora: dataHora,
            status: 'pendente'
        })
        .select()
        .single()

    if (error) {
        console.error("Erro no Supabase RLS/Insert:", error.message)
        throw new Error("Erro ao salvar o agendamento.")
    }

    return data;
}
```

---

## 🛡️ Regras de Segurança no Supabase (RLS & Performance)

O isolamento multi-tenant das tabelas no Supabase é feito com políticas RLS baseadas nos claims do JWT do Clerk.

### Performance Crítica: Evitando Full Table Scan no RLS

Ao escrever políticas de banco, a função `auth.jwt()` do Supabase lê o token JWT e extrai o claim. Chamar essa função diretamente na cláusula `USING` ou `WITH CHECK` pode fazer com que o Postgres a execute para cada linha avaliada, degradando drasticamente o desempenho.

Para forçar o Postgres a executar a função uma única vez (armazenando-a como um `initPlan`), **envolva sempre a chamada em um subquery SELECT**.

#### ❌ Exemplo Incorreto (Ruim para Performance)
```sql
CREATE POLICY "Permitir select para membros da org" ON agendamentos
    FOR SELECT TO authenticated
    USING (tenant_id = (auth.jwt() ->> 'org_id'));
```

#### ✅ Exemplo Correto (Recomendado)
```sql
CREATE POLICY "Permitir select para membros da org" ON agendamentos
    FOR SELECT TO authenticated
    USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));
```

> [!IMPORTANT]
> A subquery `(SELECT auth.jwt() ->> 'org_id')` permite que o planejador do PostgreSQL faça cache do resultado da chamada da função JWT por transação, reduzindo o custo computacional a quase zero.
