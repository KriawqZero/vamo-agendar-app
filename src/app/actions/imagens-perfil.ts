'use server'

import { auth } from '@clerk/nextjs/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLANOS } from '@/lib/planos'
import { obterAssinaturaVigente } from '@/lib/assinaturas'

/**
 * Upload e remoção do logo e da capa da página pública (recursos do plano Pro).
 *
 * As ESCRITAS no Storage usam o cliente privilegiado: neste projeto o postgres não
 * pode criar políticas em storage.objects (owner é supabase_storage_admin), então o
 * bucket ficou default-deny para anon/authenticated e TODA escrita passa por aqui —
 * ver migration 20260717173148_storage_imagens_perfis.sql. O porteiro é esta action:
 * auth() obrigatório, gating de plano e path derivado do orgId no servidor (nunca do
 * input). A atualização de perfis_empresas usa o cliente autenticado (RLS de tabela).
 */

const BUCKET_IMAGENS = 'imagens-perfis'

const CONFIG_IMAGENS = {
    logo: {
        tamanhoMaximoBytes: 2 * 1024 * 1024,
        recurso: 'logoPersonalizado',
        coluna: 'logo_url',
        rotulo: 'O logo na página pública',
    },
    capa: {
        tamanhoMaximoBytes: 5 * 1024 * 1024,
        recurso: 'capaPersonalizada',
        coluna: 'capa_url',
        rotulo: 'A imagem de capa na página pública',
    },
} as const

// Extensão sempre derivada do MIME validado — nunca do nome do arquivo enviado.
const EXTENSAO_POR_MIME: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
}

export type TipoImagemPerfil = keyof typeof CONFIG_IMAGENS

export async function enviarImagemPerfil(formData: FormData): Promise<{ url: string }> {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    const tipo = formData.get('tipo')
    if (tipo !== 'logo' && tipo !== 'capa') {
        throw new Error('Tipo de imagem inválido.')
    }
    const config = CONFIG_IMAGENS[tipo]

    const arquivo = formData.get('arquivo')
    if (!(arquivo instanceof File) || arquivo.size === 0) {
        throw new Error('Selecione uma imagem para enviar.')
    }

    const extensao = EXTENSAO_POR_MIME[arquivo.type]
    if (!extensao) {
        throw new Error('Formato não suportado. Envie uma imagem JPG, PNG ou WebP.')
    }
    if (arquivo.size > config.tamanhoMaximoBytes) {
        const limiteMb = Math.round(config.tamanhoMaximoBytes / (1024 * 1024))
        throw new Error(`Imagem muito grande. O limite para ${tipo} é de ${limiteMb}MB.`)
    }

    const supabase = await createClient()
    const { plano } = await obterAssinaturaVigente(supabase, orgId)
    if (!PLANOS[plano].recursos[config.recurso]) {
        throw new Error(
            `${config.rotulo} é um recurso do plano Pro. Faça upgrade em Plano no menu.`,
        )
    }

    const admin = createAdminClient()
    // Timestamp no nome = cache-busting (o bucket público é cacheado pela CDN).
    const caminho = `${orgId}/${tipo}-${Date.now()}.${extensao}`

    const { error: uploadErro } = await admin.storage
        .from(BUCKET_IMAGENS)
        .upload(caminho, arquivo, { contentType: arquivo.type, cacheControl: '31536000' })

    if (uploadErro) {
        console.error(`Erro ao enviar ${tipo} para o Storage:`, uploadErro.message)
        throw new Error('Não foi possível enviar a imagem. Tente novamente.')
    }

    const {
        data: { publicUrl },
    } = admin.storage.from(BUCKET_IMAGENS).getPublicUrl(caminho)

    // Persiste a URL no perfil com o cliente AUTENTICADO (RLS de tabela garante o
    // tenant). Sem linha de perfil ainda, remove o arquivo para não deixar órfão.
    const { data: atualizado, error: updateErro } = await supabase
        .from('perfis_empresas')
        .update({ [config.coluna]: publicUrl, updated_at: new Date().toISOString() })
        .eq('tenant_id', orgId)
        .select('tenant_id')
        .maybeSingle()

    if (updateErro || !atualizado) {
        await admin.storage
            .from(BUCKET_IMAGENS)
            .remove([caminho])
            .catch(() => {})
        if (updateErro) {
            console.error(`Erro ao gravar ${config.coluna}:`, updateErro.message)
            throw new Error('Não foi possível salvar a imagem no perfil. Tente novamente.')
        }
        throw new Error('Salve o perfil da empresa antes de enviar imagens.')
    }

    // Remove as versões antigas do mesmo tipo (troca) — depois do update, para nunca
    // deixar o perfil apontando para arquivo apagado se algo falhar no meio.
    await removerArquivosDoTipo(admin, orgId, tipo, caminho)

    return { url: publicUrl }
}

/**
 * Remove a imagem (logo ou capa) do Storage e limpa a coluna correspondente.
 * Sem gating de plano: remover é sempre permitido — inclusive pós-downgrade.
 */
export async function removerImagemPerfil(tipo: TipoImagemPerfil): Promise<void> {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }
    if (tipo !== 'logo' && tipo !== 'capa') {
        throw new Error('Tipo de imagem inválido.')
    }
    const config = CONFIG_IMAGENS[tipo]

    const supabase = await createClient()
    const { error: updateErro } = await supabase
        .from('perfis_empresas')
        .update({ [config.coluna]: null, updated_at: new Date().toISOString() })
        .eq('tenant_id', orgId)

    if (updateErro) {
        console.error(`Erro ao limpar ${config.coluna}:`, updateErro.message)
        throw new Error('Não foi possível remover a imagem. Tente novamente.')
    }

    await removerArquivosDoTipo(createAdminClient(), orgId, tipo)
}

// Apaga do bucket os arquivos `<tipo>-*` da pasta do tenant, exceto o recém-enviado.
// Falha aqui não pode quebrar o fluxo (fica só um arquivo órfão até a próxima troca).
async function removerArquivosDoTipo(
    admin: ReturnType<typeof createAdminClient>,
    orgId: string,
    tipo: TipoImagemPerfil,
    exceto?: string,
) {
    try {
        const { data: existentes } = await admin.storage.from(BUCKET_IMAGENS).list(orgId)
        const antigos = (existentes ?? [])
            .filter((objeto) => objeto.name.startsWith(`${tipo}-`))
            .map((objeto) => `${orgId}/${objeto.name}`)
            .filter((caminho) => caminho !== exceto)
        if (antigos.length > 0) {
            await admin.storage.from(BUCKET_IMAGENS).remove(antigos)
        }
    } catch (erro) {
        console.error(`Limpeza de ${tipo} antigo falhou (ignorado):`, erro)
    }
}
