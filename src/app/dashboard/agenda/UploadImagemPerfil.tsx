'use client'

import React, { useActionState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
    enviarImagemPerfil,
    removerImagemPerfil,
    type TipoImagemPerfil,
} from '@/app/actions/imagens-perfil'

interface UploadImagemPerfilProps {
    tipo: TipoImagemPerfil
    urlAtual: string | null
    /** Recurso liberado no plano vigente (Pro). Bloqueado: input desabilitado + selo. */
    liberado: boolean
}

const ROTULOS: Record<TipoImagemPerfil, { alt: string; enviar: string; limite: string }> = {
    logo: {
        alt: 'Logo do estabelecimento',
        enviar: 'Enviar logo',
        limite: 'JPG, PNG ou WebP até 2MB',
    },
    capa: { alt: 'Imagem de capa', enviar: 'Enviar capa', limite: 'JPG, PNG ou WebP até 5MB' },
}

/**
 * Upload de logo/capa da página pública (aba Perfil da Empresa). O arquivo é
 * enviado na hora da seleção via Server Action; a troca remove a versão anterior.
 */
export default function UploadImagemPerfil({ tipo, urlAtual, liberado }: UploadImagemPerfilProps) {
    const router = useRouter()
    const idInput = `upload-${tipo}`

    const [erroEnvio, enviarAction, enviando] = useActionState(
        async (_anterior: string | null, formData: FormData) => {
            try {
                await enviarImagemPerfil(formData)
                router.refresh()
                return null
            } catch (err) {
                return err instanceof Error ? err.message : 'Erro ao enviar a imagem.'
            }
        },
        null,
    )

    const [removendo, startRemover] = useTransition()
    const [erroRemocao, setErroRemocao] = React.useState<string | null>(null)
    const handleRemover = () => {
        setErroRemocao(null)
        startRemover(async () => {
            try {
                await removerImagemPerfil(tipo)
                router.refresh()
            } catch (err) {
                setErroRemocao(err instanceof Error ? err.message : 'Erro ao remover a imagem.')
            }
        })
    }

    const ocupado = enviando || removendo
    const erro = erroEnvio ?? erroRemocao

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-3">
                {urlAtual ? (
                    tipo === 'logo' ? (
                        <Image
                            src={urlAtual}
                            alt={ROTULOS.logo.alt}
                            width={40}
                            height={40}
                            className={`h-10 w-10 shrink-0 rounded-lg border border-zinc-200 dark:border-zinc-700 object-cover ${!liberado ? 'opacity-50 grayscale' : ''}`}
                        />
                    ) : (
                        <div
                            className={`relative h-16 w-48 shrink-0 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700 ${!liberado ? 'opacity-50 grayscale' : ''}`}
                        >
                            <Image
                                src={urlAtual}
                                alt={ROTULOS.capa.alt}
                                fill
                                sizes="192px"
                                className="object-cover"
                            />
                        </div>
                    )
                ) : (
                    <div
                        className={`shrink-0 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-400 ${tipo === 'logo' ? 'h-10 w-10 text-lg' : 'h-16 w-48 text-xs'}`}
                    >
                        {tipo === 'logo' ? '?' : 'Sem capa'}
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                    <form action={enviarAction}>
                        <input type="hidden" name="tipo" value={tipo} />
                        <input
                            id={idInput}
                            type="file"
                            name="arquivo"
                            accept="image/jpeg,image/png,image/webp"
                            className="sr-only"
                            disabled={!liberado || ocupado}
                            onChange={(e) => {
                                if (e.target.files?.length) {
                                    // requestSubmit() captura o FormData sincronamente;
                                    // o reset permite reenviar o MESMO arquivo depois
                                    // (remover + reenviar, ou retry após falha).
                                    e.target.form?.requestSubmit()
                                    e.target.value = ''
                                }
                            }}
                        />
                        <label
                            htmlFor={idInput}
                            className={`inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all duration-200 ${
                                liberado && !ocupado
                                    ? 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer'
                                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
                            }`}
                        >
                            {enviando ? 'Enviando…' : urlAtual ? 'Trocar' : ROTULOS[tipo].enviar}
                        </label>
                    </form>
                    {urlAtual && (
                        <button
                            type="button"
                            onClick={handleRemover}
                            disabled={ocupado}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                            {removendo ? 'Removendo…' : 'Remover'}
                        </button>
                    )}
                </div>
            </div>
            <p className="text-xs text-zinc-500">{ROTULOS[tipo].limite}</p>
            {!liberado && urlAtual && (
                <p className="text-xs text-zinc-500">
                    A imagem não é exibida no plano atual — ela volta a aparecer num upgrade para o
                    Pro.
                </p>
            )}
            {erro && (
                <p role="alert" className="text-xs font-semibold text-red-600 dark:text-red-400">
                    {erro}
                </p>
            )}
        </div>
    )
}
