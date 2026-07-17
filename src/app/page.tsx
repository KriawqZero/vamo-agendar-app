import Link from 'next/link'
import { auth, currentUser } from '@clerk/nextjs/server'
import { createClient } from '@/lib/supabase/server'
import { obterAssinaturaVigente } from '@/lib/assinaturas'
import { PLANOS, type PlanoId } from '@/lib/planos'
import DemoAgendamento from './DemoAgendamento'
import Reveal from './Reveal'
import LuzAmbiente from './LuzAmbiente'
import LogoMarca from './LogoMarca'
import SeletorTema from './SeletorTema'
import DiaNoite from './DiaNoite'
import CapturaEvento from '@/components/analytics/CapturaEvento'

/**
 * Landing page pública. Um único palco contínuo — sem faixas, sem bordas
 * de seção. A história de um dia inteiro contada em momentos que flutuam
 * com espaçamento generoso e composição assimétrica; horários fantasma
 * gigantes marcam o tempo. O único card é o widget de demo, porque ele é
 * um celular aceso. O palco tem duas iluminações (tokens claro/escuro) e a
 * narrativa muda de horário com elas: à noite são 22:31 (você já dormiu);
 * de manhã são 06:47 (você ainda nem abriu). Em ambas, o WhatsApp estaria
 * mudo — e o link, trabalhando. Textos que dependem da hora usam DiaNoite.
 */

// Preço cheio pós-lançamento (o selo -50% de PLANOS referencia estes valores;
// regra em docs/07-PLANOS_E_MONETIZACAO.md)
const PRECO_ORIGINAL: Record<PlanoId, number | null> = {
    gratuito: null,
    plus: 19.9,
    pro: 29.9,
}

const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`

// Textura de filme (fractal noise) sobre a página inteira
const RUIDO =
    "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

function Check() {
    return (
        <svg
            viewBox="0 0 16 16"
            className="mx-auto h-4 w-4 text-marca"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
        >
            <path d="M3 8.5l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

const LINHAS_COMPARACAO: {
    rotulo: string
    valor: (p: (typeof PLANOS)[PlanoId]) => string | boolean
}[] = [
    {
        rotulo: 'Serviços ativos',
        valor: (p) =>
            p.limiteServicosAtivos === null ? 'Ilimitados' : `Até ${p.limiteServicosAtivos}`,
    },
    { rotulo: 'Página de agendamento com link', valor: () => true },
    { rotulo: 'Link personalizado (/sua-marca)', valor: (p) => p.recursos.linkPersonalizado },
    { rotulo: 'Cor da sua marca', valor: (p) => p.recursos.corPersonalizada },
    { rotulo: 'Sua logo na página', valor: (p) => p.recursos.logoPersonalizado },
    { rotulo: 'Imagem de capa na sua página', valor: (p) => p.recursos.capaPersonalizada },
    { rotulo: 'Confirmação e lembrete por WhatsApp', valor: (p) => p.recursos.whatsapp },
]

export default async function Home() {
    const user = await currentUser()
    const primeiroNome = user?.firstName ?? user?.username ?? null

    // Plano vigente do tenant logado (gratuito quando não há assinatura ativa)
    let planoAtual: PlanoId | null = null
    if (user) {
        const { orgId } = await auth()
        if (orgId) {
            const supabase = await createClient()
            const { plano } = await obterAssinaturaVigente(supabase, orgId)
            planoAtual = plano
        } else {
            planoAtual = 'gratuito'
        }
    }

    const planos = [PLANOS.gratuito, PLANOS.plus, PLANOS.pro]
    const ordem: Record<PlanoId, number> = { gratuito: 0, plus: 1, pro: 2 }
    // Deslogado: destaca o Pro (venda). Logado: destaca o plano atual (feedback).
    const colunaDestacada: PlanoId = planoAtual ?? 'pro'
    const destaque = (id: PlanoId) => (id === colunaDestacada ? 'bg-marca-forte/[0.08]' : '')

    return (
        <div className="relative flex-1 overflow-x-clip bg-palco text-giz">
            {/* Funil: visita à landing (UTMs iniciais são anexadas pelo posthog-js) */}
            <CapturaEvento evento="landing_viewed" propriedades={{ nicho: 'geral' }} />
            {/* Atmosfera: grão de filme + luz que segue o cursor */}
            <div
                aria-hidden
                className="pointer-events-none fixed inset-0 z-40 opacity-[0.03]"
                style={{ backgroundImage: RUIDO }}
            />
            <LuzAmbiente />

            {/* Cabeçalho */}
            <header className="absolute inset-x-0 top-0 z-30">
                <div className="mx-auto flex h-24 max-w-[90rem] items-center justify-between px-6 sm:px-10 lg:px-16">
                    <Link href="/" className="aparecer" style={{ animationDelay: '100ms' }}>
                        <LogoMarca className="h-9 w-auto" priority />
                    </Link>
                    <nav
                        className="aparecer flex items-center gap-2 sm:gap-6"
                        style={{ animationDelay: '250ms' }}
                    >
                        <SeletorTema className="hidden sm:inline-flex" />
                        {user ? (
                            <>
                                <span className="max-w-[10rem] truncate text-sm text-nevoa">
                                    Olá,{' '}
                                    <span className="font-medium text-giz">
                                        {primeiroNome ?? 'você'}
                                    </span>
                                </span>
                                <Link
                                    href="/dashboard"
                                    className="rounded-full bg-gradient-to-br from-[#3DBAED] to-[#3961D5] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110"
                                >
                                    Abrir painel
                                </Link>
                            </>
                        ) : (
                            <>
                                <a
                                    href="#planos"
                                    className="hidden text-sm text-penumbra transition-colors hover:text-giz sm:block"
                                >
                                    Planos
                                </a>
                                <Link
                                    href="/sign-in"
                                    className="px-2 py-2 text-sm text-penumbra transition-colors hover:text-giz"
                                >
                                    Entrar
                                </Link>
                                <Link
                                    href="/sign-up"
                                    className="rounded-full bg-gradient-to-br from-[#3DBAED] to-[#3961D5] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110"
                                >
                                    Cadastrar
                                </Link>
                            </>
                        )}
                    </nav>
                </div>
            </header>

            <main className="relative z-10 mx-auto max-w-[90rem] px-6 sm:px-10 lg:px-16">
                {/* ── 22:31 / 06:47 — a abertura ─────────────────────── */}
                <section className="relative pt-44 sm:pt-52">
                    <span
                        aria-hidden
                        className="pointer-events-none absolute -right-8 top-16 select-none font-mono text-[clamp(7rem,26vw,22rem)] font-bold leading-none tracking-tighter text-fantasma sm:top-4"
                    >
                        <DiaNoite dia="06:47" noite="22:31" />
                    </span>

                    <div className="relative">
                        <div className="mascara">
                            <p
                                className="font-mono text-xs uppercase tracking-[0.3em] text-marca"
                                style={{ animationDelay: '350ms' }}
                            >
                                <DiaNoite
                                    dia="terça-feira, 06:47 — o expediente nem começou"
                                    noite="terça-feira, 22:31 — você já foi dormir"
                                />
                            </p>
                        </div>
                        <h1 className="mt-8 font-display text-[clamp(2.75rem,8vw,7rem)] font-extrabold leading-[0.98] tracking-[-0.035em]">
                            <span className="mascara block">
                                <span className="block" style={{ animationDelay: '450ms' }}>
                                    Um cliente acabou
                                </span>
                            </span>
                            <span className="mascara block">
                                <span className="block" style={{ animationDelay: '580ms' }}>
                                    de marcar <span className="text-marca">com você.</span>
                                </span>
                            </span>
                        </h1>
                    </div>

                    <div className="relative mt-16 grid gap-14 lg:grid-cols-12 lg:gap-8">
                        <div className="lg:col-span-5">
                            <p
                                className="aparecer max-w-md text-lg leading-relaxed text-nevoa"
                                style={{ animationDelay: '950ms' }}
                            >
                                Você não respondeu mensagem nenhuma. Seu link mostrou os horários
                                realmente livres, ele escolheu um, e a confirmação já chegou no
                                WhatsApp dele.{' '}
                                <DiaNoite
                                    dia="Seu dia ainda nem começou — e a agenda já está mais cheia."
                                    noite="Amanhã sua agenda acorda mais cheia."
                                />
                            </p>
                            <div
                                className="aparecer mt-9 flex flex-wrap items-center gap-6"
                                style={{ animationDelay: '1100ms' }}
                            >
                                <Link
                                    href={user ? '/dashboard' : '/sign-up'}
                                    className="rounded-full bg-gradient-to-br from-[#3DBAED] to-[#3961D5] px-7 py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_40px_rgba(61,186,237,0.25)]"
                                >
                                    {user ? 'Ir para o painel' : 'Criar conta grátis'}
                                </Link>
                                <a
                                    href="#manha"
                                    className="text-sm text-penumbra underline decoration-penumbra/50 underline-offset-4 transition-colors hover:text-giz"
                                >
                                    Ver o resto do dia
                                </a>
                            </div>
                            {!user && (
                                <p
                                    className="aparecer mt-8 font-mono text-xs uppercase tracking-widest text-penumbra/75"
                                    style={{ animationDelay: '1250ms' }}
                                >
                                    Grátis para começar · Sem cartão de crédito
                                </p>
                            )}
                        </div>

                        <div
                            className="aparecer lg:col-span-5 lg:col-start-8"
                            style={{ animationDelay: '800ms' }}
                        >
                            {/* O celular aceso no escuro */}
                            <div className="relative">
                                <div
                                    aria-hidden
                                    className="absolute -inset-12 rounded-full bg-[#ACC6FF]/40 blur-3xl dark:bg-marca-forte/[0.09]"
                                />
                                <div className="relative">
                                    <DemoAgendamento />
                                </div>
                            </div>
                            <p className="mt-4 text-center font-mono text-xs text-penumbra/75">
                                demonstração real — pode clicar
                            </p>
                        </div>
                    </div>
                </section>

                {/* ── 09:12 — o diálogo que interrompe ───────────────── */}
                <section id="manha" className="relative pt-[clamp(10rem,20vw,18rem)]">
                    <span
                        aria-hidden
                        className="pointer-events-none absolute -left-10 top-8 select-none font-mono text-[clamp(6rem,22vw,18rem)] font-bold leading-none tracking-tighter text-fantasma"
                    >
                        09:12
                    </span>

                    <div className="relative">
                        <Reveal>
                            <p className="font-mono text-xs uppercase tracking-[0.3em] text-marca">
                                09:12 — no meio de um atendimento, seu celular vibra
                            </p>
                        </Reveal>

                        <div className="mt-14 space-y-7 font-display font-semibold leading-tight tracking-[-0.02em]">
                            <Reveal>
                                <p className="text-[clamp(1.5rem,3.6vw,2.75rem)] text-giz">
                                    — Oi! Tem horário na quinta?
                                </p>
                            </Reveal>
                            <Reveal delay={100}>
                                <p className="ml-[8%] text-[clamp(1.5rem,3.6vw,2.75rem)] text-penumbra/75">
                                    — Tenho 9h ou 15h30!
                                </p>
                            </Reveal>
                            <Reveal delay={200}>
                                <p className="ml-[16%] text-[clamp(1.5rem,3.6vw,2.75rem)] text-giz">
                                    — 9h não consigo… não tem outro de tarde?
                                </p>
                            </Reveal>
                            <Reveal delay={300}>
                                <p className="ml-[24%] text-[clamp(1.5rem,3.6vw,2.75rem)] text-penumbra/75">
                                    — Deixa eu ver aqui e te falo
                                </p>
                            </Reveal>
                        </div>

                        <Reveal delay={400}>
                            <p className="ml-auto mt-14 max-w-xs text-right text-penumbra">
                                A última frase é sua. Agora multiplique essa conversa por todos os
                                clientes de uma semana.
                            </p>
                        </Reveal>
                    </div>
                </section>

                {/* ── A virada ───────────────────────────────────────── */}
                <section className="relative pt-[clamp(10rem,20vw,18rem)]">
                    <Reveal>
                        <h2 className="max-w-5xl font-display text-[clamp(2.5rem,7vw,6rem)] font-extrabold leading-[1.0] tracking-[-0.03em]">
                            Essa conversa <span className="text-marca">não precisa existir.</span>
                        </h2>
                    </Reveal>
                    <div className="mt-14 lg:ml-[38%]">
                        <Reveal delay={150}>
                            <p className="max-w-xl text-lg leading-relaxed text-nevoa">
                                Seu link de agendamento mostra apenas os horários realmente livres —
                                calculados a partir dos seus horários de atendimento, dos seus
                                serviços e das suas folgas. Quem escolhe é o cliente; quem manda na
                                agenda é você.
                            </p>
                        </Reveal>
                        <Reveal delay={250}>
                            <p className="mt-10 inline-block border-b border-marca/40 pb-3 font-mono text-[clamp(1.1rem,2.6vw,1.75rem)] text-nevoa">
                                vamoagendar.com.br/<span className="text-marca">sua-marca</span>
                            </p>
                            <p className="mt-4 text-sm text-penumbra">
                                Na bio do Instagram, no WhatsApp Business, onde seus clientes
                                estiverem.
                            </p>
                        </Reveal>
                    </div>
                </section>

                {/* ── O dia com VamoAgendar — dois momentos deslocados ── */}
                <section className="relative pt-[clamp(10rem,20vw,18rem)]">
                    <span
                        aria-hidden
                        className="pointer-events-none absolute right-0 top-1/3 select-none font-mono text-[clamp(6rem,20vw,16rem)] font-bold leading-none tracking-tighter text-fantasma"
                    >
                        08:00
                    </span>

                    <div className="relative max-w-md">
                        <Reveal>
                            <p className="font-mono text-sm text-marca">08:00</p>
                            <h3 className="mt-4 font-display text-[clamp(1.6rem,3vw,2.25rem)] font-bold leading-snug tracking-[-0.02em]">
                                O lembrete sai sozinho, direto no WhatsApp.
                            </h3>
                            <p className="mt-5 leading-relaxed text-nevoa">
                                Confirmação na hora do agendamento e lembrete antes do horário, com
                                a sua mensagem. Menos falta, menos buraco na agenda.{' '}
                                <span className="text-penumbra/75">(plano Pro)</span>
                            </p>
                        </Reveal>
                    </div>

                    <div className="relative mt-24 max-w-md lg:ml-[46%] lg:mt-32">
                        <Reveal>
                            <p className="font-mono text-sm text-marca">o dia inteiro</p>
                            <h3 className="mt-4 font-display text-[clamp(1.6rem,3vw,2.25rem)] font-bold leading-snug tracking-[-0.02em]">
                                Com a sua marca em tudo.
                            </h3>
                            <p className="mt-5 leading-relaxed text-nevoa">
                                Link personalizado com o seu nome, as cores da sua identidade e a
                                sua logo na página. O cliente sente que está agendando com você —
                                porque está.{' '}
                                <span className="text-penumbra/75">(planos Plus e Pro)</span>
                            </p>
                        </Reveal>
                    </div>
                </section>

                {/* ── Planos ─────────────────────────────────────────── */}
                <section id="planos" className="relative pt-[clamp(10rem,20vw,18rem)]">
                    <Reveal>
                        <p className="font-mono text-xs uppercase tracking-[0.3em] text-penumbra">
                            Planos
                        </p>
                        <h2 className="mt-5 max-w-3xl font-display text-[clamp(2.25rem,5vw,4rem)] font-extrabold leading-[1.02] tracking-[-0.03em]">
                            Comece grátis. Cresça quando fizer sentido.
                        </h2>
                        <p className="mt-6 max-w-xl leading-relaxed text-nevoa">
                            Sem fidelidade e sem cartão para começar. Os valores abaixo já têm{' '}
                            <span className="font-medium text-marca">
                                50% de desconto de lançamento
                            </span>
                            .
                        </p>
                    </Reveal>

                    <Reveal delay={150}>
                        <div className="mt-14 overflow-x-auto">
                            <table className="w-full min-w-[36rem] border-collapse text-sm">
                                <thead>
                                    <tr className="border-b border-fio-forte align-bottom">
                                        <th scope="col" className="w-1/3 pb-6" />
                                        {planos.map((p) => (
                                            <th
                                                key={p.id}
                                                scope="col"
                                                className={`px-4 pb-6 pt-4 text-left font-normal ${destaque(p.id)}`}
                                            >
                                                <p className="font-display text-base font-bold text-giz">
                                                    {p.nome}
                                                    {planoAtual === p.id && (
                                                        <span className="ml-2 rounded-full border border-marca/40 px-2 py-0.5 align-middle font-mono text-[10px] font-normal uppercase tracking-widest text-marca">
                                                            atual
                                                        </span>
                                                    )}
                                                </p>
                                                <p className="mt-2 font-mono text-2xl text-giz">
                                                    {brl(p.precoMensal)}
                                                    <span className="text-xs text-penumbra">
                                                        {' '}
                                                        /mês
                                                    </span>
                                                </p>
                                                <p className="mt-1 h-4 font-mono text-xs text-penumbra/75">
                                                    {PRECO_ORIGINAL[p.id] !== null ? (
                                                        <s>{brl(PRECO_ORIGINAL[p.id]!)}</s>
                                                    ) : null}
                                                </p>
                                                <p className="mt-1 text-xs text-penumbra">
                                                    {p.precoAnual !== null
                                                        ? `ou ${brl(p.precoAnual)}/ano`
                                                        : p.descricao}
                                                </p>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {LINHAS_COMPARACAO.map((linha) => (
                                        <tr key={linha.rotulo} className="border-b border-fio">
                                            <th
                                                scope="row"
                                                className="py-4 pr-4 text-left font-normal text-nevoa"
                                            >
                                                {linha.rotulo}
                                            </th>
                                            {planos.map((p) => {
                                                const v = linha.valor(p)
                                                return (
                                                    <td
                                                        key={p.id}
                                                        className={`px-4 py-4 text-center ${destaque(p.id)}`}
                                                    >
                                                        {typeof v === 'string' ? (
                                                            <span className="text-giz">{v}</span>
                                                        ) : v ? (
                                                            <Check />
                                                        ) : (
                                                            <span className="text-penumbra/40">
                                                                —
                                                            </span>
                                                        )}
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td className="pt-6" />
                                        {planos.map((p) => (
                                            <td
                                                key={p.id}
                                                className={`px-4 pb-4 pt-6 ${destaque(p.id)}`}
                                            >
                                                {planoAtual === p.id ? (
                                                    <span className="block cursor-default rounded-full border border-marca/40 py-2.5 text-center font-mono text-xs uppercase tracking-widest text-marca">
                                                        plano atual
                                                    </span>
                                                ) : (
                                                    <Link
                                                        href={
                                                            user ? '/dashboard/plano' : '/sign-up'
                                                        }
                                                        className={`block rounded-full py-2.5 text-center text-sm font-semibold transition-colors duration-200 ${
                                                            (
                                                                planoAtual
                                                                    ? ordem[p.id] >
                                                                      ordem[planoAtual]
                                                                    : p.id === 'pro'
                                                            )
                                                                ? 'bg-gradient-to-br from-[#3DBAED] to-[#3961D5] text-white hover:brightness-110'
                                                                : 'border border-fio-forte text-nevoa hover:border-penumbra hover:text-giz'
                                                        }`}
                                                    >
                                                        {planoAtual
                                                            ? ordem[p.id] > ordem[planoAtual]
                                                                ? `Assinar ${p.nome}`
                                                                : `Voltar ao ${p.nome}`
                                                            : p.id === 'gratuito'
                                                              ? 'Começar grátis'
                                                              : `Assinar ${p.nome}`}
                                                    </Link>
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </Reveal>

                    <Reveal delay={250}>
                        <p className="mt-8 max-w-lg text-xs leading-relaxed text-penumbra/75">
                            Todos os planos incluem agenda inteligente sem conflito de horários,
                            exceções para feriados e folgas, e painel de controle completo.
                        </p>
                    </Reveal>
                </section>

                {/* ── O fecho — hoje à noite ─────────────────────────── */}
                <section className="relative pb-24 pt-[clamp(10rem,22vw,20rem)]">
                    <span
                        aria-hidden
                        className="pointer-events-none absolute -left-6 bottom-0 select-none font-mono text-[clamp(5rem,18vw,14rem)] font-bold lowercase leading-none tracking-tighter text-fantasma"
                    >
                        <DiaNoite dia="cedo" noite="amanhã" />
                    </span>

                    <div className="relative">
                        <Reveal>
                            <p className="font-mono text-xs uppercase tracking-[0.3em] text-marca">
                                <DiaNoite dia="amanhã, 06:47" noite="hoje à noite" />
                            </p>
                            <h2 className="mt-7 max-w-4xl font-display text-[clamp(2.5rem,6.5vw,5.5rem)] font-extrabold leading-[1.0] tracking-[-0.03em]">
                                <DiaNoite
                                    dia="Chegue. Sua agenda começou sem você."
                                    noite="Durma. Sua agenda continua acordada."
                                />
                            </h2>
                        </Reveal>
                        <Reveal delay={150}>
                            <p className="mt-8 max-w-md leading-relaxed text-nevoa">
                                {user
                                    ? 'Seus serviços e seu link estão a um clique. Continue de onde parou.'
                                    : 'Crie a conta, cadastre seus serviços e compartilhe seu link. Em poucos minutos está no ar — trabalhando nos horários em que você não está.'}
                            </p>
                            <Link
                                href={user ? '/dashboard' : '/sign-up'}
                                className="mt-10 inline-block rounded-full bg-gradient-to-br from-[#3DBAED] to-[#3961D5] px-8 py-4 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_40px_rgba(61,186,237,0.25)]"
                            >
                                {user ? 'Ir para o painel' : 'Criar conta grátis'}
                            </Link>
                        </Reveal>
                    </div>
                </section>
            </main>

            <footer className="relative z-10">
                <div className="mx-auto flex max-w-[90rem] flex-col items-start justify-between gap-4 border-t border-fio px-6 py-10 sm:flex-row sm:items-center sm:px-10 lg:px-16">
                    <p className="text-sm text-penumbra/75">
                        VamoAgendar — agendamento online para profissionais.
                    </p>
                    <nav className="flex gap-6 text-sm text-penumbra/75">
                        {user ? (
                            <Link href="/dashboard" className="transition-colors hover:text-giz">
                                Ir para o painel
                            </Link>
                        ) : (
                            <>
                                <a href="#planos" className="transition-colors hover:text-giz">
                                    Planos
                                </a>
                                <Link href="/sign-in" className="transition-colors hover:text-giz">
                                    Entrar
                                </Link>
                                <Link href="/sign-up" className="transition-colors hover:text-giz">
                                    Criar conta
                                </Link>
                            </>
                        )}
                    </nav>
                </div>
            </footer>
        </div>
    )
}
