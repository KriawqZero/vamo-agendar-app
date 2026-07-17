'use client'

import { useEffect, useRef } from 'react'
import { formatarTelefone } from '@/lib/telefone'

interface EtapaContatoProps {
    formAction: (formData: FormData) => void
    erro: string | null
    /** Nome/telefone vivem no BookingApp: voltar de etapa não apaga o que foi digitado. */
    nome: string
    onNomeChange: (valor: string) => void
    telefone: string
    onTelefoneChange: (valor: string) => void
    autoFoco: boolean
}

/**
 * Dados de contato — Fricção Zero: só nome e WhatsApp, sem cadastro. O submit fica
 * no CTA da barra inferior (<button form="form-contato">); a validação/envio vive
 * no useActionState do BookingApp.
 */
export default function EtapaContato({
    formAction,
    erro,
    nome,
    onNomeChange,
    telefone,
    onTelefoneChange,
    autoFoco,
}: EtapaContatoProps) {
    const tituloRef = useRef<HTMLHeadingElement>(null)
    useEffect(() => {
        if (autoFoco) tituloRef.current?.focus()
    }, [autoFoco])

    return (
        <section className="aparecer-rapido">
            <h2
                ref={tituloRef}
                tabIndex={-1}
                className="scroll-mt-24 font-display text-lg font-semibold outline-none"
            >
                Seus dados
            </h2>
            <p className="mt-1 text-sm text-nevoa">
                Sem cadastro — seus dados servem só para este agendamento.
            </p>

            <form id="form-contato" action={formAction} className="mt-4 space-y-4">
                {erro && (
                    <p
                        role="alert"
                        className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-400"
                    >
                        {erro}
                    </p>
                )}

                <div className="space-y-1.5">
                    <label htmlFor="contato-nome" className="block text-sm font-medium">
                        Seu nome
                    </label>
                    <input
                        id="contato-nome"
                        name="nome"
                        type="text"
                        required
                        autoComplete="name"
                        value={nome}
                        onChange={(e) => onNomeChange(e.target.value)}
                        placeholder="Como quer ser chamado"
                        className="min-h-12 w-full rounded-xl border border-fio bg-bastidor px-4 text-sm outline-hidden transition-all duration-200 focus:border-[var(--acento,var(--marca))]"
                    />
                </div>

                <div className="space-y-1.5">
                    <label htmlFor="contato-telefone" className="block text-sm font-medium">
                        WhatsApp
                    </label>
                    <input
                        id="contato-telefone"
                        name="telefone"
                        type="tel"
                        required
                        autoComplete="tel-national"
                        inputMode="numeric"
                        value={telefone}
                        onChange={(e) => onTelefoneChange(formatarTelefone(e.target.value))}
                        placeholder="(11) 99999-9999"
                        className="min-h-12 w-full rounded-xl border border-fio bg-bastidor px-4 font-mono text-sm outline-hidden transition-all duration-200 focus:border-[var(--acento,var(--marca))]"
                    />
                    <p className="text-xs text-penumbra">
                        O estabelecimento usa este número para confirmar seu horário.
                    </p>
                </div>
            </form>
        </section>
    )
}
