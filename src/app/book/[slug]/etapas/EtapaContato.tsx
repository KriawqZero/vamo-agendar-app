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

            <form id="form-contato" action={formAction} className="mt-4 space-y-4 lg:max-w-md">
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

                {/*
                 * CAMPO ARMADILHA (honeypot) — defesa complementar ao rate limit
                 * da Phase 3. Bot genérico de formulário preenche tudo o que
                 * encontra; ao preencher este campo ele se identifica sozinho, e
                 * `criarAgendamentoPublico` devolve sucesso PLAUSÍVEL sem criar
                 * nada. Bot que recebe erro tenta de novo; bot que recebe sucesso
                 * vai embora — por isso a resposta é sucesso falso aqui, e erro
                 * honesto no rate limit (D-07).
                 *
                 * Cada atributo existe por um motivo, e nenhum é decorativo:
                 *
                 * - `name="info_adicional"`: nome deliberadamente NEUTRO e fora
                 *   do vocabulário de autofill (nada de website, url, address,
                 *   phone2 — as heurísticas do navegador casam por
                 *   name/autocomplete). Autofill preenchendo este campo é PESSOA
                 *   REAL recebendo sucesso falso, o pior desfecho possível. O
                 *   nome também não denuncia a armadilha no payload nem no
                 *   bundle: quem lê o fonte compilado não a reconhece pelo nome.
                 * - `autoComplete="off"`: a segunda trava contra o autofill.
                 * - `tabIndex={-1}`: fora da ordem de tabulação — quem navega por
                 *   teclado nunca cai aqui.
                 * - `aria-hidden` (wrapper e input): leitor de tela não anuncia,
                 *   e não há `<label>` associado.
                 * - Ocultação por POSICIONAMENTO off-screen, JAMAIS por
                 *   `display:none` ou pelo atributo `hidden`: parte dos bots pula
                 *   campo suprimido, e aí a armadilha não pegaria ninguém.
                 * - ⚠️ O posicionamento é `style` INLINE, e não classe do
                 *   Tailwind (WR-06). `-left-[9999px]` é valor arbitrário, o que
                 *   significa que a classe precisa ser GERADA: se ela deixar de
                 *   ser emitida (mudança de `content`, o bloco migrar para um
                 *   arquivo fora do scan, um utilitário conflitante ganhar
                 *   precedência), o resultado é um `<input type="text">` vazio e
                 *   VISÍVEL no meio do formulário de contato. Style inline não
                 *   depende de geração nenhuma e continua sendo posicionamento,
                 *   não supressão — o modo de falha simplesmente deixa de
                 *   existir, o que é mais barato que testá-lo.
                 * - Campo NÃO CONTROLADO (sem estado React): não participa do
                 *   fluxo de dados legítimo, só viaja no FormData do submit.
                 */}
                <div
                    aria-hidden="true"
                    style={{
                        position: 'absolute',
                        left: '-9999px',
                        top: 0,
                        height: 1,
                        width: 1,
                        overflow: 'hidden',
                    }}
                >
                    <input
                        name="info_adicional"
                        type="text"
                        defaultValue=""
                        autoComplete="off"
                        tabIndex={-1}
                        aria-hidden="true"
                    />
                </div>
            </form>
        </section>
    )
}
