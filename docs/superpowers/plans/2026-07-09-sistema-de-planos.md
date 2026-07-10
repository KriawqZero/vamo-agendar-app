# Sistema de Planos (Gratuito/Plus/Pro) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estrutura de planos com limites e gating (sem checkout), pronta para a integração Asaas futura, com plano alterável via SQL manual.

**Architecture:** Tabela `assinaturas` no formato Asaas (gratuito = ausência de linha vigente; RLS só permite SELECT ao dono). Fonte da verdade dos planos em `src/lib/planos.ts`; leitura via `obterAssinaturaVigente()`. Enforcement nas Server Actions; UI com página de planos, banner de inadimplência e cadeados.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (SQL puro, RLS), Clerk, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-09-sistema-de-planos-design.md` (ler antes de começar).

## Global Constraints

- Gerenciador de pacotes: **pnpm**; comandos dentro de `vamo-agendar-app/`.
- **Não há framework de testes.** Verificação por task = `pnpm exec tsc --noEmit` + SQL de verificação de RLS via impersonação (padrão abaixo) + checagem manual descrita.
- Supabase CLI **não está instalável no ambiente**: migrations são aplicadas no projeto remoto via MCP `mcp__supabase__apply_migration` e **espelhadas** em `supabase/migrations/<versão>_<nome>.sql` (obter versão com `mcp__supabase__list_migrations` após aplicar). Schemas declarativos em `supabase/schemas/` continuam sendo a fonte da verdade.
- RLS: políticas granulares por ação, role explícita, `(SELECT auth.jwt() ->> 'org_id')` em subquery. `COMMENT ON` em tabelas e políticas.
- Domínio em pt-BR (`obterAssinaturaVigente`, `assinaturas`); tabelas no plural, colunas no singular.
- UI: Tailwind v4, paleta `zinc`, mobile-first, Server Components por padrão, mutações só via Server Actions.
- **A working tree contém mudanças anteriores não commitadas.** Em todo commit, usar `git add <caminhos explícitos>` — nunca `git add -A`/`git add .`.
- Mensagens de erro ao usuário em pt-BR, amigáveis, citando o plano necessário.

### Padrão de verificação RLS por impersonação (usado em várias tasks)

Executar via `mcp__supabase__execute_sql`:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","org_id":"org_IMPERSONADO"}', true);
-- ... statement sob teste ...
rollback;
```

---

### Task 1: Banco — tabela `assinaturas` + colunas de personalização

**Files:**
- Create: `supabase/schemas/08_assinaturas.sql`
- Modify: `supabase/schemas/01_perfis_empresas.sql` (adicionar 2 colunas no CREATE TABLE)
- Create (espelho pós-aplicação): `supabase/migrations/<versão>_assinaturas_e_personalizacao.sql`

**Interfaces:**
- Produces: tabela `public.assinaturas` (colunas abaixo) e colunas `perfis_empresas.cor_marca text NULL`, `perfis_empresas.logo_url text NULL`. Tasks 2+ dependem desses nomes exatos.

- [ ] **Step 1: Criar `supabase/schemas/08_assinaturas.sql`**

```sql
CREATE TABLE assinaturas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id text NOT NULL,
    plano text NOT NULL CHECK (plano IN ('plus', 'pro')),
    ciclo text NOT NULL CHECK (ciclo IN ('MONTHLY', 'YEARLY')), -- enum idêntico ao cycle do Asaas
    valor numeric(10,2) NOT NULL,
    status text NOT NULL CHECK (status IN ('ativa', 'inadimplente', 'cancelada')),
    asaas_customer_id text,      -- cus_..., preenchido quando o checkout Asaas existir
    asaas_subscription_id text,  -- sub_..., idem
    proximo_vencimento date,     -- espelho do nextDueDate do Asaas
    url_fatura_pendente text,    -- invoiceUrl do pagamento em atraso (banner de inadimplência)
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES perfis_empresas(tenant_id) ON DELETE CASCADE
);

-- Uma única assinatura vigente (ativa ou inadimplente) por tenant
CREATE UNIQUE INDEX uq_assinatura_vigente_por_tenant
ON assinaturas (tenant_id)
WHERE status IN ('ativa', 'inadimplente');

-- Habilitar RLS
ALTER TABLE assinaturas ENABLE ROW LEVEL SECURITY;

-- Política: o tenant autenticado só LÊ a própria assinatura.
-- Não há políticas de INSERT/UPDATE/DELETE para authenticated/anon de propósito:
-- quem escreve é o dono do banco (SQL manual na fase de testes; webhook Asaas com
-- service_role no futuro). Isso torna o plano infraudável pelo cliente.
CREATE POLICY "Permitir SELECT do próprio tenant para autenticados"
ON assinaturas FOR SELECT TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- Comentários
COMMENT ON TABLE assinaturas IS 'Assinatura de plano pago (plus/pro) de cada tenant, no formato da integração Asaas. Plano Gratuito = ausência de linha vigente.';
COMMENT ON COLUMN assinaturas.ciclo IS 'Ciclo de cobrança no enum do Asaas (MONTHLY/YEARLY).';
COMMENT ON COLUMN assinaturas.status IS 'ativa = em dia; inadimplente = mantém benefícios + banner de pagamento pendente; cancelada = volta ao Gratuito.';
COMMENT ON COLUMN assinaturas.url_fatura_pendente IS 'invoiceUrl da cobrança em atraso no Asaas, usada no banner de inadimplência.';
COMMENT ON POLICY "Permitir SELECT do próprio tenant para autenticados" ON assinaturas IS 'Leitura restrita ao tenant; escrita reservada ao backend (SQL manual/webhook Asaas), sem política para roles de API.';
```

- [ ] **Step 2: Adicionar colunas de personalização em `supabase/schemas/01_perfis_empresas.sql`**

No `CREATE TABLE perfis_empresas`, adicionar após a coluna `telefone_contato` (ajustar vírgulas):

```sql
    cor_marca text,  -- cor de destaque da página pública (recurso Plus+; ainda não consumido pelo booking)
    logo_url text,   -- URL do logo na página pública (recurso Pro; ainda não consumido pelo booking)
```

E ao final do arquivo:

```sql
COMMENT ON COLUMN perfis_empresas.cor_marca IS 'Cor de destaque da página pública de booking (recurso do plano Plus+). Ainda não aplicada na UI pública.';
COMMENT ON COLUMN perfis_empresas.logo_url IS 'URL do logo exibido na página pública de booking (recurso do plano Pro). Ainda não aplicada na UI pública.';
```

- [ ] **Step 3: Aplicar migration no remoto via MCP**

Chamar `mcp__supabase__apply_migration` com `name: "assinaturas_e_personalizacao"` e `query` = conteúdo do Step 1 **mais**:

```sql
alter table public.perfis_empresas add column cor_marca text;
alter table public.perfis_empresas add column logo_url text;
comment on column public.perfis_empresas.cor_marca is 'Cor de destaque da página pública de booking (recurso do plano Plus+). Ainda não aplicada na UI pública.';
comment on column public.perfis_empresas.logo_url is 'URL do logo exibido na página pública de booking (recurso do plano Pro). Ainda não aplicada na UI pública.';
```

(No SQL da migration, prefixar a tabela como `public.assinaturas` e escrever tudo em minúsculas, estilo das migrations existentes.)

- [ ] **Step 4: Espelhar a migration no repo**

Obter a versão com `mcp__supabase__list_migrations` e criar `supabase/migrations/<versão>_assinaturas_e_personalizacao.sql` com o SQL exato aplicado.

- [ ] **Step 5: Verificar RLS por impersonação**

Via `mcp__supabase__execute_sql` (tenant real: `org_3GH4IwQu0s3jzPayU9EVsWuon0M`):

a) INSERT como authenticated → deve FALHAR com erro 42501 (RLS):

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","org_id":"org_3GH4IwQu0s3jzPayU9EVsWuon0M"}', true);
insert into public.assinaturas (tenant_id, plano, ciclo, valor, status)
values ('org_3GH4IwQu0s3jzPayU9EVsWuon0M', 'pro', 'MONTHLY', 14.90, 'ativa');
rollback;
```

b) SELECT do próprio tenant → deve retornar 0 linhas SEM erro (e, após inserir uma linha como admin dentro da transação, retornar 1):

```sql
begin;
insert into public.assinaturas (tenant_id, plano, ciclo, valor, status)
values ('org_3GH4IwQu0s3jzPayU9EVsWuon0M', 'pro', 'MONTHLY', 14.90, 'ativa');
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","org_id":"org_3GH4IwQu0s3jzPayU9EVsWuon0M"}', true);
select plano, status from public.assinaturas; -- esperado: 1 linha (pro, ativa)
select set_config('request.jwt.claims', '{"role":"authenticated","org_id":"org_OUTRO"}', true);
select plano, status from public.assinaturas; -- esperado: 0 linhas
rollback;
```

c) Índice único: inserir 2ª assinatura ativa para o mesmo tenant (como admin) → deve FALHAR com violação de unique.

- [ ] **Step 6: Commit**

```bash
git add supabase/schemas/08_assinaturas.sql supabase/schemas/01_perfis_empresas.sql supabase/migrations/*assinaturas_e_personalizacao.sql
git commit -m "feat(db): tabela assinaturas no formato Asaas + colunas de personalização"
```

---

### Task 2: Fonte da verdade — `src/lib/planos.ts` e `src/lib/assinaturas.ts`

**Files:**
- Create: `src/lib/planos.ts`
- Create: `src/lib/assinaturas.ts`

**Interfaces:**
- Produces (usado por TODAS as tasks seguintes):
  - `type PlanoId = 'gratuito' | 'plus' | 'pro'`
  - `PLANOS: Record<PlanoId, DefinicaoPlano>` com `limiteServicosAtivos: number | null` e `recursos: { linkPersonalizado; corPersonalizada; logoPersonalizado; whatsapp }`
  - `obterAssinaturaVigente(supabase, tenantId): Promise<AssinaturaVigente>` onde `AssinaturaVigente = { plano: PlanoId; inadimplente: boolean; urlFaturaPendente: string | null }`

- [ ] **Step 1: Criar `src/lib/planos.ts`**

```ts
/**
 * Fonte da verdade dos planos do VamoAgendar.
 * UI e validações leem EXCLUSIVAMENTE daqui — alterar preço/limite é alterar este arquivo.
 * Regra de negócio completa em docs/07-PLANOS_E_MONETIZACAO.md.
 */

export type PlanoId = 'gratuito' | 'plus' | 'pro'

export interface DefinicaoPlano {
    id: PlanoId
    nome: string
    precoMensal: number
    precoAnual: number | null
    seloDesconto: string | null
    descricao: string
    /** null = ilimitado. Conta apenas serviços com ativo = true. */
    limiteServicosAtivos: number | null
    recursos: {
        linkPersonalizado: boolean
        corPersonalizada: boolean
        logoPersonalizado: boolean
        whatsapp: boolean
    }
}

export const PLANOS: Record<PlanoId, DefinicaoPlano> = Object.freeze({
    gratuito: {
        id: 'gratuito',
        nome: 'Gratuito',
        precoMensal: 0,
        precoAnual: null,
        seloDesconto: null,
        descricao: 'para sempre',
        limiteServicosAtivos: 2,
        recursos: {
            linkPersonalizado: false,
            corPersonalizada: false,
            logoPersonalizado: false,
            whatsapp: false,
        },
    },
    plus: {
        id: 'plus',
        nome: 'Plus',
        precoMensal: 9.9,
        precoAnual: 99.9,
        seloDesconto: '-50%',
        descricao: 'para quem está crescendo',
        limiteServicosAtivos: null,
        recursos: {
            linkPersonalizado: true,
            corPersonalizada: true,
            logoPersonalizado: false,
            whatsapp: false,
        },
    },
    pro: {
        id: 'pro',
        nome: 'Pro',
        precoMensal: 14.9,
        precoAnual: 149.9,
        seloDesconto: '-50%',
        descricao: 'automação completa',
        limiteServicosAtivos: null,
        recursos: {
            linkPersonalizado: true,
            corPersonalizada: true,
            logoPersonalizado: true,
            whatsapp: true,
        },
    },
} satisfies Record<PlanoId, DefinicaoPlano>)
```

- [ ] **Step 2: Criar `src/lib/assinaturas.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { PLANOS, type PlanoId } from '@/lib/planos'

export interface AssinaturaVigente {
    plano: PlanoId
    inadimplente: boolean
    urlFaturaPendente: string | null
}

const GRATUITO: AssinaturaVigente = { plano: 'gratuito', inadimplente: false, urlFaturaPendente: null }

/**
 * Resolve o plano vigente do tenant a partir da tabela `assinaturas`.
 * - status 'ativa'        → plano da assinatura
 * - status 'inadimplente' → plano mantido + flag para o banner de pagamento pendente
 * - sem linha vigente     → Gratuito
 */
export async function obterAssinaturaVigente(
    supabase: SupabaseClient,
    tenantId: string
): Promise<AssinaturaVigente> {
    const { data, error } = await supabase
        .from('assinaturas')
        .select('plano, status, url_fatura_pendente')
        .eq('tenant_id', tenantId)
        .in('status', ['ativa', 'inadimplente'])
        .maybeSingle()

    if (error) {
        console.error('Erro ao buscar assinatura vigente:', error.message)
        // Falha de leitura não pode derrubar o app: degrada para Gratuito.
        return GRATUITO
    }

    if (!data || !(data.plano in PLANOS)) {
        return GRATUITO
    }

    return {
        plano: data.plano as PlanoId,
        inadimplente: data.status === 'inadimplente',
        urlFaturaPendente: data.url_fatura_pendente ?? null,
    }
}
```

- [ ] **Step 3: Verificar**

Run: `pnpm exec tsc --noEmit` — esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/planos.ts src/lib/assinaturas.ts
git commit -m "feat(planos): fonte da verdade dos planos e leitura da assinatura vigente"
```

---

### Task 3: Enforcement — limite de serviços ativos

**Files:**
- Modify: `src/app/actions/servicos.ts`

**Interfaces:**
- Consumes: `PLANOS`, `obterAssinaturaVigente` (Task 2).
- Produces: `salvarServico` passa a lançar `Error` com mensagem contendo "plano" quando o limite é excedido. Task 7 (UI) usa `listarServicos` + props de plano para desabilitar o botão preventivamente.

- [ ] **Step 1: Adicionar imports e validação de limite em `salvarServico`**

Imports no topo de `src/app/actions/servicos.ts`:

```ts
import { PLANOS } from '@/lib/planos'
import { obterAssinaturaVigente } from '@/lib/assinaturas'
```

Dentro de `salvarServico`, logo após `const supabase = await createClient()` (linha ~53) e **antes** do bloco INSERT/UPDATE, inserir:

```ts
    // Gating de plano: criar serviço ativo ou reativar um inativo não pode
    // exceder o limite de serviços ativos do plano vigente.
    if (input.ativo) {
        const { plano } = await obterAssinaturaVigente(supabase, orgId)
        const limite = PLANOS[plano].limiteServicosAtivos

        if (limite !== null) {
            let query = supabase
                .from('servicos')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', orgId)
                .eq('ativo', true)

            if (input.id) {
                // Em edição, o próprio serviço não conta contra o limite
                query = query.neq('id', input.id)
            }

            const { count, error: countError } = await query

            if (countError) {
                console.error('Erro ao contar serviços ativos:', countError.message)
                throw new Error('Não foi possível validar o limite do seu plano. Tente novamente.')
            }

            if ((count ?? 0) >= limite) {
                throw new Error(
                    `O plano ${PLANOS[plano].nome} permite até ${limite} serviços ativos. ` +
                    'Desative outro serviço ou faça upgrade em Plano no menu.'
                )
            }
        }
    }
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm exec tsc --noEmit` — esperado: sem erros.

- [ ] **Step 3: Verificação funcional via SQL + manual**

O tenant de teste `org_3GH4IwQu0s3jzPayU9EVsWuon0M` não tem assinatura → é Gratuito (limite 2). No app (`/dashboard/servicos`): com 2 serviços ativos, criar um 3º ativo → deve exibir o erro com a mensagem do plano. Criar um 3º **inativo** → deve funcionar. Em seguida, ativar o Pro via SQL (`insert into assinaturas (tenant_id, plano, ciclo, valor, status) values ('org_3GH4IwQu0s3jzPayU9EVsWuon0M','pro','MONTHLY',14.90,'ativa');`) e repetir a criação ativa → deve funcionar. Ao final, remover a assinatura de teste (`delete from assinaturas where tenant_id = 'org_3GH4IwQu0s3jzPayU9EVsWuon0M';`) se as tasks seguintes precisarem do estado Gratuito.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/servicos.ts
git commit -m "feat(planos): limite de serviços ativos por plano em salvarServico"
```

---

### Task 4: Enforcement — slug aleatório no Free + gating de cor/logo

**Files:**
- Modify: `src/app/actions/perfis-empresas.ts`

**Interfaces:**
- Consumes: `PLANOS`, `obterAssinaturaVigente` (Task 2); colunas `cor_marca`/`logo_url` (Task 1).
- Produces: `PerfilEmpresaInput` ganha `corMarca?: string | null` e `logoUrl?: string | null`. `salvarPerfilEmpresa` gera slug aleatório no Free e rejeita alteração de slug/cor/logo sem plano. Task 8 (UI) envia os novos campos.

- [ ] **Step 1: Atualizar interface e imports**

```ts
import { PLANOS } from '@/lib/planos'
import { obterAssinaturaVigente } from '@/lib/assinaturas'
```

```ts
interface PerfilEmpresaInput {
    slug: string;
    nomeEstabelecimento: string;
    descricao?: string;
    telefoneContato?: string;
    corMarca?: string | null;
    logoUrl?: string | null;
}
```

- [ ] **Step 2: Reescrever a validação de slug e o payload em `salvarPerfilEmpresa`**

Substituir o trecho entre a sanitização do slug (mantém o pipeline de `slugFormatado` existente, linhas ~47–59) e o `upsert` por:

```ts
    const supabase = await createClient()

    const { plano } = await obterAssinaturaVigente(supabase, orgId)
    const recursos = PLANOS[plano].recursos

    // Busca o perfil atual para decidir slug e detectar alterações bloqueadas
    const { data: perfilAtual, error: perfilError } = await supabase
        .from('perfis_empresas')
        .select('slug, cor_marca, logo_url')
        .eq('tenant_id', orgId)
        .maybeSingle()

    if (perfilError) {
        console.error('Erro ao buscar perfil atual:', perfilError.message)
        throw new Error('Erro ao validar o perfil atual. Tente novamente.')
    }

    // Regra de slug por plano:
    // - Plus/Pro: slug livre (comportamento atual).
    // - Gratuito: slug é um código aleatório gerado pelo sistema; alterações são rejeitadas.
    let slugFinal = slugFormatado
    if (!recursos.linkPersonalizado) {
        if (!perfilAtual) {
            slugFinal = gerarSlugAleatorio()
        } else if (slugFormatado !== perfilAtual.slug) {
            throw new Error(
                'Personalizar o link é um recurso do plano Plus. ' +
                'Faça upgrade em Plano no menu para escolher seu link.'
            )
        } else {
            slugFinal = perfilAtual.slug
        }
    }

    // Gating de personalização visual
    const corMarcaNova = input.corMarca?.trim() || null
    const logoUrlNovo = input.logoUrl?.trim() || null

    if (corMarcaNova !== (perfilAtual?.cor_marca ?? null) && !recursos.corPersonalizada) {
        throw new Error('Cor personalizada é um recurso do plano Plus. Faça upgrade em Plano no menu.')
    }
    if (logoUrlNovo !== (perfilAtual?.logo_url ?? null) && !recursos.logoPersonalizado) {
        throw new Error('Logo personalizado é um recurso do plano Pro. Faça upgrade em Plano no menu.')
    }

    const payload = {
        tenant_id: orgId,
        slug: slugFinal,
        nome_estabelecimento: input.nomeEstabelecimento.trim(),
        descricao: input.descricao?.trim() || null,
        telefone_contato: input.telefoneContato?.replace(/\D/g, '') || null,
        cor_marca: corMarcaNova,
        logo_url: logoUrlNovo,
        updated_at: new Date().toISOString()
    }
```

Atenção: no Free com perfil novo, o `slugFormatado` do input é ignorado — portanto a validação existente `if (!slugFormatado || slugFormatado.length < 3)` deve rodar **apenas** quando `recursos.linkPersonalizado === true` (mover o `if` para dentro dessa condição, após obter `recursos`). Reordenar: obter `supabase`/plano/perfil **antes** das validações de slug.

- [ ] **Step 3: Adicionar o gerador de slug aleatório (mesmo arquivo, fora das actions)**

```ts
// 8 caracteres base36 — link opaco do plano Gratuito (ex.: /book/x7k2m9qa)
function gerarSlugAleatorio(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map((b) => (b % 36).toString(36))
        .join('')
}
```

- [ ] **Step 4: Verificar tipos**

Run: `pnpm exec tsc --noEmit` — esperado: sem erros.

- [ ] **Step 5: Verificação manual**

Tenant Gratuito em `/dashboard/agenda`: tentar trocar o slug → erro "recurso do plano Plus". Ativar Plus via SQL → trocar slug funciona. (O tenant de teste já tem perfil com slug `avantis-studio`; a regra de "perfil novo gera aleatório" pode ser verificada com uma org nova ou aceita por inspeção de código.)

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/perfis-empresas.ts
git commit -m "feat(planos): gating de slug, cor e logo por plano no perfil da empresa"
```

---

### Task 5: Enforcement — WhatsApp exclusivo do Pro (actions + defesa nos disparos)

**Files:**
- Modify: `src/app/actions/whatsapp.ts`
- Modify: `src/app/actions/public-booking.ts:144`
- Modify: `src/app/api/webhooks/lembrete/route.ts` (após carregar o agendamento)

**Interfaces:**
- Consumes: `PLANOS`, `obterAssinaturaVigente` (Task 2).
- Produces: `criarInstanciaWhatsApp` e `salvarTemplatesMensagem` lançam erro para não-Pro; disparos de confirmação/lembrete silenciosamente pulam tenants não-Pro.

- [ ] **Step 1: Gating nas actions de escrita do WhatsApp**

Em `src/app/actions/whatsapp.ts`, adicionar imports:

```ts
import { PLANOS } from '@/lib/planos'
import { obterAssinaturaVigente } from '@/lib/assinaturas'
```

Criar helper no topo do arquivo (após os consts):

```ts
async function exigirPlanoComWhatsapp(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string) {
    const { plano } = await obterAssinaturaVigente(supabase, orgId)
    if (!PLANOS[plano].recursos.whatsapp) {
        throw new Error('A integração com WhatsApp é um recurso do plano Pro. Faça upgrade em Plano no menu.')
    }
}
```

Em `salvarTemplatesMensagem` (após `const supabase = await createClient()`) e em `criarInstanciaWhatsApp` (após `const supabase = await createClient()`), inserir:

```ts
    await exigirPlanoComWhatsapp(supabase, orgId)
```

(`obterWhatsappConfig`, `obterQrCodeWhatsApp` e `desconectarWhatsApp` permanecem sem gating: leitura e desconexão devem funcionar para um tenant rebaixado limpar a integração.)

- [ ] **Step 2: Defesa no disparo da confirmação (public-booking)**

Em `src/app/actions/public-booking.ts`, adicionar imports:

```ts
import { PLANOS } from '@/lib/planos'
import { obterAssinaturaVigente } from '@/lib/assinaturas'
```

Na condição da linha 144, trocar:

```ts
        if (config && config.status === 'conectado' && config.instance_token) {
```

por:

```ts
        const { plano } = await obterAssinaturaVigente(supabase, tenantId)

        if (config && config.status === 'conectado' && config.instance_token && PLANOS[plano].recursos.whatsapp) {
```

**Atenção**: essa leitura roda com o client `anon` (fluxo público) e a tabela `assinaturas` não tem política de SELECT para `anon` — a query retorna 0 linhas e `obterAssinaturaVigente` devolve `gratuito`, o que **bloquearia o envio para todos**. Portanto este step exige adicionar ao schema/migration da Task 1 (se ainda não aplicado) ou em nova migration `select_assinaturas_anon`:

```sql
create policy "Permitir SELECT público para verificação de recursos"
on public.assinaturas for select to anon
using (true);

comment on policy "Permitir SELECT público para verificação de recursos" on public.assinaturas is
'O fluxo público de booking precisa saber se o tenant tem WhatsApp habilitado no plano. Exposição aceitável: plano/status não são dados sensíveis.';
```

Espelhar como migration (mesmo fluxo MCP da Task 1) e registrar no schema `08_assinaturas.sql`.

- [ ] **Step 3: Defesa no webhook do lembrete**

Em `src/app/api/webhooks/lembrete/route.ts`, adicionar imports:

```ts
import { PLANOS } from '@/lib/planos'
import { obterAssinaturaVigente } from '@/lib/assinaturas'
```

Logo após o check de `status === 'cancelado'`, inserir:

```ts
        // Tenant rebaixado após agendar: lembrete não é mais um recurso do plano dele
        const { plano } = await obterAssinaturaVigente(supabase, tenantId)
        if (!PLANOS[plano].recursos.whatsapp) {
            console.log(`Lembrete ignorado. Tenant ${tenantId} não possui WhatsApp no plano vigente.`)
            return NextResponse.json({ success: true, message: 'Plano sem WhatsApp. Lembrete ignorado.' })
        }
```

- [ ] **Step 4: Verificar**

Run: `pnpm exec tsc --noEmit` — esperado: sem erros.
Manual: tenant Gratuito → `/dashboard/whatsapp` → tentar criar instância → erro do plano Pro. Com Pro via SQL → funciona.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/whatsapp.ts src/app/actions/public-booking.ts src/app/api/webhooks/lembrete/route.ts supabase/schemas/08_assinaturas.sql supabase/migrations/*select_assinaturas_anon*.sql
git commit -m "feat(planos): integração WhatsApp exclusiva do plano Pro com defesa nos disparos"
```

---

### Task 6: UI — layout (banner de inadimplência + item Plano) e página `/dashboard/plano`

**Files:**
- Modify: `src/app/dashboard/layout.tsx`
- Create: `src/app/dashboard/plano/page.tsx`

**Interfaces:**
- Consumes: `PLANOS`, `obterAssinaturaVigente` (Task 2).
- Produces: rota `/dashboard/plano`; banner global de inadimplência.

- [ ] **Step 1: Tornar o layout async e buscar a assinatura**

Em `src/app/dashboard/layout.tsx`, adicionar imports:

```ts
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@/lib/supabase/server'
import { PLANOS } from '@/lib/planos'
import { obterAssinaturaVigente } from '@/lib/assinaturas'
```

Trocar a assinatura do componente por:

```tsx
export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const { orgId } = await auth()
    let assinatura = { plano: 'gratuito' as const, inadimplente: false, urlFaturaPendente: null as string | null }
    if (orgId) {
        const supabase = await createClient()
        assinatura = await obterAssinaturaVigente(supabase, orgId)
    }
```

- [ ] **Step 2: Adicionar item "Plano" na navegação**

Novo ícone junto aos existentes:

```tsx
const PlanoIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
)
```

Novo `<Link>` após o item WhatsApp (mesmo padrão de classes dos links existentes):

```tsx
                    <Link
                        href="/dashboard/plano"
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-950 dark:hover:text-white shrink-0"
                    >
                        <PlanoIcon />
                        <span className="hidden sm:inline md:inline">Plano</span>
                        <span className="ml-auto hidden md:inline text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                            {PLANOS[assinatura.plano].nome}
                        </span>
                    </Link>
```

- [ ] **Step 3: Banner de inadimplência global**

No `<main>`, antes de `{children}`:

```tsx
                {assinatura.inadimplente && (
                    <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4">
                        <div className="flex-1">
                            <p className="text-sm font-bold text-red-800 dark:text-red-200">
                                Não foi possível realizar seu pagamento
                            </p>
                            <p className="text-xs text-red-700 dark:text-red-300">
                                Resolva o mais rápido possível para não perder os recursos do plano {PLANOS[assinatura.plano].nome}.
                            </p>
                        </div>
                        <a
                            href={assinatura.urlFaturaPendente ?? '/dashboard/plano'}
                            className="shrink-0 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white transition-all duration-200 hover:bg-red-700"
                        >
                            Resolver pagamento
                        </a>
                    </div>
                )}
```

- [ ] **Step 4: Criar `src/app/dashboard/plano/page.tsx`** (Server Component puro)

```tsx
import React from 'react'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@/lib/supabase/server'
import { PLANOS, type DefinicaoPlano, type PlanoId } from '@/lib/planos'
import { obterAssinaturaVigente } from '@/lib/assinaturas'

const formatarPreco = (valor: number) =>
    valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function LinhaRecurso({ liberado, children }: { liberado: boolean; children: React.ReactNode }) {
    return (
        <li className={`flex items-center gap-2 text-sm ${liberado ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-400 dark:text-zinc-600 line-through'}`}>
            <span aria-hidden>{liberado ? '✓' : '✕'}</span>
            {children}
        </li>
    )
}

function CardPlano({ plano, atual }: { plano: DefinicaoPlano; atual: boolean }) {
    const r = plano.recursos
    return (
        <div className={`flex flex-col rounded-2xl border p-6 bg-white dark:bg-zinc-900 transition-all duration-200 ${atual ? 'border-zinc-900 dark:border-zinc-100 shadow-md' : 'border-zinc-200 dark:border-zinc-800'}`}>
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold tracking-tight">{plano.nome}</h2>
                {atual && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
                        Plano atual
                    </span>
                )}
            </div>
            <div className="mt-3">
                <span className="text-3xl font-bold">{formatarPreco(plano.precoMensal)}</span>
                <span className="text-sm text-zinc-500">/mês</span>
                {plano.precoAnual !== null ? (
                    <p className="text-xs text-zinc-500 mt-1">
                        ou {formatarPreco(plano.precoAnual)}/ano{' '}
                        {plano.seloDesconto && (
                            <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                {plano.seloDesconto}
                            </span>
                        )}
                    </p>
                ) : (
                    <p className="text-xs text-zinc-500 mt-1">{plano.descricao}</p>
                )}
            </div>
            <ul className="mt-5 space-y-2 flex-1">
                <LinhaRecurso liberado>
                    {plano.limiteServicosAtivos === null ? 'Serviços ilimitados' : `Até ${plano.limiteServicosAtivos} serviços ativos`}
                </LinhaRecurso>
                <LinhaRecurso liberado>Link de agendamento</LinhaRecurso>
                <LinhaRecurso liberado={r.linkPersonalizado}>Link personalizado</LinhaRecurso>
                <LinhaRecurso liberado={r.corPersonalizada}>Cor personalizada</LinhaRecurso>
                <LinhaRecurso liberado={r.logoPersonalizado}>Logo personalizado</LinhaRecurso>
                <LinhaRecurso liberado={r.whatsapp}>Confirmações e lembretes por WhatsApp</LinhaRecurso>
            </ul>
            {plano.id !== 'gratuito' && !atual && (
                <button
                    disabled
                    className="mt-6 w-full rounded-lg bg-zinc-200 dark:bg-zinc-800 px-4 py-2 text-sm font-bold text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
                    title="O checkout ainda não está disponível"
                >
                    Em breve
                </button>
            )}
        </div>
    )
}

export default async function PlanoPage() {
    const { orgId } = await auth()

    let planoAtual: PlanoId = 'gratuito'
    if (orgId) {
        const supabase = await createClient()
        const assinatura = await obterAssinaturaVigente(supabase, orgId)
        planoAtual = assinatura.plano
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Plano</h1>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                    Compare os planos e recursos do VamoAgendar. A assinatura online estará disponível em breve.
                </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(Object.values(PLANOS) as DefinicaoPlano[]).map((plano) => (
                    <CardPlano key={plano.id} plano={plano} atual={plano.id === planoAtual} />
                ))}
            </div>
        </div>
    )
}
```

- [ ] **Step 5: Verificar**

Run: `pnpm exec tsc --noEmit` — sem erros. Manual: `/dashboard/plano` renderiza os 3 cards, badge do plano na sidebar; simular inadimplência via SQL (`update assinaturas set status='inadimplente' where tenant_id='org_...'`) → banner aparece em todas as telas do dashboard; reverter.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/layout.tsx src/app/dashboard/plano/page.tsx
git commit -m "feat(planos): página de planos, badge na sidebar e banner de inadimplência"
```

---

### Task 7: UI — gating na página de serviços

**Files:**
- Modify: `src/app/dashboard/servicos/page.tsx`
- Modify: `src/app/dashboard/servicos/ServicosClient.tsx`

**Interfaces:**
- Consumes: `PLANOS`, `obterAssinaturaVigente` (Task 2). Erro de limite da Task 3 como fallback.
- Produces: `ServicosClient` ganha props `planoNome: string` e `limiteServicosAtivos: number | null`.

- [ ] **Step 1: `page.tsx` busca o plano e passa props**

Adicionar imports em `src/app/dashboard/servicos/page.tsx`:

```ts
import { createClient } from '@/lib/supabase/server'
import { PLANOS } from '@/lib/planos'
import { obterAssinaturaVigente } from '@/lib/assinaturas'
```

Após `const servicos = await listarServicos()`:

```ts
    const supabase = await createClient()
    const { plano } = await obterAssinaturaVigente(supabase, orgId)
    const definicao = PLANOS[plano]

    return (
        <ServicosClient
            servicos={servicos}
            planoNome={definicao.nome}
            limiteServicosAtivos={definicao.limiteServicosAtivos}
        />
    )
```

- [ ] **Step 2: `ServicosClient.tsx` — props, contador e botão bloqueado**

Ler o arquivo antes de editar. Mudanças:

1. Estender a interface de props:

```ts
interface ServicosClientProps {
    servicos: Servico[];      // tipo existente do arquivo
    planoNome: string;
    limiteServicosAtivos: number | null;
}
```

2. No corpo do componente, calcular:

```ts
    const servicosAtivos = servicos.filter((s) => s.ativo).length
    const limiteAtingido = limiteServicosAtivos !== null && servicosAtivos >= limiteServicosAtivos
```

3. Junto ao cabeçalho da página (acima da tabela/lista), inserir o contador quando houver limite:

```tsx
            {limiteServicosAtivos !== null && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        <span className={`font-bold ${limiteAtingido ? 'text-red-600 dark:text-red-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                            {servicosAtivos}/{limiteServicosAtivos}
                        </span>{' '}
                        serviços ativos · plano {planoNome}
                    </p>
                    {limiteAtingido && (
                        <a href="/dashboard/plano" className="shrink-0 text-xs font-bold text-zinc-900 dark:text-zinc-100 underline underline-offset-2">
                            Fazer upgrade
                        </a>
                    )}
                </div>
            )}
```

4. No botão existente de "novo serviço": quando `limiteAtingido`, adicionar `disabled={limiteAtingido}` + classes de disabled (`disabled:opacity-50 disabled:cursor-not-allowed`) e `title="Limite de serviços ativos do plano atingido"`. **Não** bloquear a edição de serviços existentes (a action da Task 3 já impede reativação acima do limite; se o toggle de ativo existir no formulário de edição, exibir aviso apenas quando a action retornar erro — o tratamento de erro existente do formulário cobre isso).

- [ ] **Step 3: Verificar**

Run: `pnpm exec tsc --noEmit` — sem erros. Manual: tenant Gratuito com 2 ativos → contador "2/2" em vermelho + botão desabilitado + link de upgrade.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/servicos/page.tsx src/app/dashboard/servicos/ServicosClient.tsx
git commit -m "feat(planos): contador e bloqueio de criação de serviços no limite do plano"
```

---

### Task 8: UI — gating na página de agenda (slug, cor, logo)

**Files:**
- Modify: `src/app/dashboard/agenda/page.tsx`
- Modify: `src/app/dashboard/agenda/AgendaClient.tsx`

**Interfaces:**
- Consumes: Task 4 (action aceita `corMarca`/`logoUrl` e rejeita mudanças sem plano); Task 2.
- Produces: `AgendaClient` ganha prop `recursosPlano: { linkPersonalizado: boolean; corPersonalizada: boolean; logoPersonalizado: boolean }`.

- [ ] **Step 1: `page.tsx` busca o plano e passa a prop**

Imports (mesmo padrão da Task 7). Após buscar os dados existentes:

```ts
    const supabase = await createClient()
    const { plano } = await obterAssinaturaVigente(supabase, orgId)
    const { linkPersonalizado, corPersonalizada, logoPersonalizado } = PLANOS[plano].recursos

    return (
        <AgendaClient
            perfilEmpresa={perfilEmpresa}
            horariosFuncionamento={horariosFuncionamento}
            excecoesAgenda={excecoesAgenda}
            recursosPlano={{ linkPersonalizado, corPersonalizada, logoPersonalizado }}
        />
    )
```

- [ ] **Step 2: `AgendaClient.tsx` — campo de slug travado + campos cor/logo**

Ler o arquivo antes de editar (formulário de perfil vive nele). Mudanças:

1. Estender `AgendaClientProps` com `recursosPlano: { linkPersonalizado: boolean; corPersonalizada: boolean; logoPersonalizado: boolean }` e recebê-la no componente.

2. Componente auxiliar de cadeado (no mesmo arquivo):

```tsx
function SeloPlano({ plano }: { plano: 'Plus' | 'Pro' }) {
    return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
            🔒 {plano}
        </span>
    )
}
```

3. No input existente do **slug**: adicionar `disabled={!recursosPlano.linkPersonalizado}` + classes `disabled:opacity-60 disabled:cursor-not-allowed`; ao lado do label, renderizar `{!recursosPlano.linkPersonalizado && <SeloPlano plano="Plus" />}`; abaixo do input, quando bloqueado:

```tsx
{!recursosPlano.linkPersonalizado && (
    <p className="text-xs text-zinc-500 mt-1">
        Personalize seu link no plano Plus.{' '}
        <a href="/dashboard/plano" className="font-bold underline underline-offset-2">Ver planos</a>
    </p>
)}
```

4. Novos campos no formulário do perfil (estado inicial vindo de `perfilEmpresa?.cor_marca` / `perfilEmpresa?.logo_url`, enviados no submit como `corMarca`/`logoUrl` para `salvarPerfilEmpresa`):

```tsx
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Cor da marca {!recursosPlano.corPersonalizada && <SeloPlano plano="Plus" />}
                        </label>
                        <input
                            type="color"
                            value={corMarca || '#18181b'}
                            onChange={(e) => setCorMarca(e.target.value)}
                            disabled={!recursosPlano.corPersonalizada}
                            className="h-10 w-20 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                        <p className="text-xs text-zinc-500 mt-1">Cor de destaque da sua página pública (em breve).</p>
                    </div>

                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Logo (URL) {!recursosPlano.logoPersonalizado && <SeloPlano plano="Pro" />}
                        </label>
                        <input
                            type="url"
                            value={logoUrl}
                            onChange={(e) => setLogoUrl(e.target.value)}
                            disabled={!recursosPlano.logoPersonalizado}
                            placeholder="https://…/logo.png"
                            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                        <p className="text-xs text-zinc-500 mt-1">Logo exibido na sua página pública (em breve).</p>
                    </div>
```

Com estados no componente: `const [corMarca, setCorMarca] = useState<string | null>(perfilEmpresa?.cor_marca ?? null)` e `const [logoUrl, setLogoUrl] = useState<string>(perfilEmpresa?.logo_url ?? '')` (adaptar aos nomes/padrões de estado já usados no arquivo; incluir `cor_marca`/`logo_url` no tipo local de `perfilEmpresa` se houver interface). No submit do perfil, incluir `corMarca: corMarca` e `logoUrl: logoUrl || null`.

- [ ] **Step 3: Verificar**

Run: `pnpm exec tsc --noEmit` — sem erros. Manual: tenant Gratuito → slug desabilitado com selo e CTA; cor com selo Plus; logo com selo Pro. Com Plus via SQL → slug e cor liberados, logo ainda travado.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/agenda/page.tsx src/app/dashboard/agenda/AgendaClient.tsx
git commit -m "feat(planos): cadeados de slug, cor e logo na configuração da agenda"
```

---

### Task 9: UI — upsell na página WhatsApp para não-Pro

**Files:**
- Modify: `src/app/dashboard/whatsapp/page.tsx`

**Interfaces:**
- Consumes: `PLANOS`, `obterAssinaturaVigente` (Task 2). `WhatsappClient` não muda.

- [ ] **Step 1: Gate no Server Component**

Em `src/app/dashboard/whatsapp/page.tsx`, adicionar imports:

```ts
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PLANOS } from '@/lib/planos'
import { obterAssinaturaVigente } from '@/lib/assinaturas'
```

Após o guard de `orgId` e **antes** de `obterWhatsappConfig()`:

```tsx
    const supabase = await createClient()
    const { plano } = await obterAssinaturaVigente(supabase, orgId)

    if (!PLANOS[plano].recursos.whatsapp) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs max-w-xl mx-auto my-12">
                <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4 text-zinc-400 text-2xl">
                    🔒
                </div>
                <h2 className="text-xl font-bold tracking-tight mb-2">WhatsApp é um recurso do plano Pro</h2>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-sm mb-6">
                    Envie confirmações automáticas e lembretes por WhatsApp para seus clientes e reduza faltas.
                    Disponível no plano Pro.
                </p>
                <Link
                    href="/dashboard/plano"
                    className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-5 py-2.5 text-sm font-bold text-white dark:text-zinc-900 transition-all duration-200 hover:opacity-90"
                >
                    Conhecer o plano Pro
                </Link>
            </div>
        )
    }
```

- [ ] **Step 2: Verificar**

Run: `pnpm exec tsc --noEmit` — sem erros. Manual: Gratuito → tela de upsell; Pro via SQL → página normal.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/whatsapp/page.tsx
git commit -m "feat(planos): upsell do Pro na página de WhatsApp para planos sem o recurso"
```

---

### Task 10: Documentação de negócio

**Files:**
- Create: `docs/07-PLANOS_E_MONETIZACAO.md`
- Modify: `CLAUDE.md` (workspace `/mnt/Files/VamoAgendar/vamo-agendar-app/CLAUDE.md`): na seção de tabelas existentes, acrescentar `assinaturas` à lista e uma frase sobre planos apontando para a doc.

- [ ] **Step 1: Criar `docs/07-PLANOS_E_MONETIZACAO.md`**

Conteúdo obrigatório (redigir em pt-BR, estilo das docs existentes):

1. **Tabela dos planos e recursos** — copiar a tabela do spec (`docs/superpowers/specs/2026-07-09-sistema-de-planos-design.md`, seção "Tabela de planos"), incluindo preços e selo -50%.
2. **⚠️ Checkout ainda não existe** — destacar que não há pagamento real; botão "Em breve" na UI.
3. **Troca manual de plano via SQL** (fase de testes) — copiar os 3 SQLs do spec (ativar/inadimplência/cancelar) explicando cada um; lembrar que `gratuito` = ausência de linha vigente e que o índice único impede duas assinaturas vigentes.
4. **Fonte da verdade no código** — `src/lib/planos.ts` (definições/limites/preços) e `src/lib/assinaturas.ts` (`obterAssinaturaVigente`); enforcement nas Server Actions (`servicos.ts`, `perfis-empresas.ts`, `whatsapp.ts`) + defesa nos disparos.
5. **Regra de inadimplência** — mantém benefícios + banner global "Não foi possível realizar seu pagamento" com link para `url_fatura_pendente ?? /dashboard/plano`; carência formal a definir com o billing real.
6. **Roadmap da integração Asaas** — copiar a seção "Integração Asaas futura" do spec (customer → subscription → webhook `/api/webhooks/asaas` e o que cada evento escreve na tabela; sandbox).
7. **Recursos preparados mas não implementados** — `cor_marca`/`logo_url` existem no banco e na UI (bloqueados), mas o booking público ainda não os aplica.

- [ ] **Step 2: Atualizar `CLAUDE.md`**

Na linha "Tabelas existentes: ...", acrescentar `assinaturas` (com nota "planos plus/pro; gratuito = sem linha vigente; ver docs/07-PLANOS_E_MONETIZACAO.md").

- [ ] **Step 3: Commit**

```bash
git add docs/07-PLANOS_E_MONETIZACAO.md CLAUDE.md docs/superpowers/specs/2026-07-09-sistema-de-planos-design.md docs/superpowers/plans/2026-07-09-sistema-de-planos.md
git commit -m "docs(planos): regra de negócio dos planos, troca manual via SQL e roadmap Asaas"
```

---

## Verificação final (após todas as tasks)

1. `pnpm exec tsc --noEmit` e `pnpm lint` limpos.
2. Fluxo manual completo com o tenant de teste: Gratuito (limites ativos) → `insert` Pro via SQL → tudo liberado → `update` para `inadimplente` → banner em todas as telas → `update` para `cancelada` → volta ao Gratuito.
3. Fluxo público `/book/[slug]` continua funcionando em todos os estados de plano (agendar nunca pode quebrar por causa de plano).
