import type { Metadata } from 'next'
import Link from 'next/link'
import { NICHOS } from '@/lib/nichos'
import { PLANOS, type PlanoId } from '@/lib/planos'
import DemoAgendamento from '../../DemoAgendamento'
import Reveal from '../../Reveal'
import LuzAmbiente from '../../LuzAmbiente'
import LogoMarca from '../../LogoMarca'
import SeletorTema from '../../SeletorTema'
import DiaNoite from '../../DiaNoite'
import CapturaEvento from '@/components/analytics/CapturaEvento'

/**
 * Landing vertical por nicho (/para/[nicho]) — irmã da landing principal:
 * mesmo palco, mesmos tokens, mesma voz; muda a dor, a demo e a copy.
 * SSG puro: nada de auth()/cookies()/headers() aqui nem nos imports —
 * a página é 100% estática e serve deslogada por definição.
 * Conteúdo por nicho em src/lib/nichos.ts.
 */

export const dynamicParams = false

export function generateStaticParams() {
    return Object.keys(NICHOS).map((nicho) => ({ nicho }))
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ nicho: string }>
}): Promise<Metadata> {
    const { nicho } = await params
    const dados = NICHOS[nicho]
    return {
        title: dados.seo.title,
        description: dados.seo.description,
        alternates: { canonical: `/para/${dados.slug}` },
        // O merge de metadata é RASO: redefinir openGraph aqui descarta o objeto
        // inteiro do layout raiz — por isso imagem/siteName/locale/type são
        // repetidos (sem eles o preview no WhatsApp sairia sem imagem).
        openGraph: {
            title: dados.seo.title,
            description: dados.seo.description,
            url: `https://vamoagendar.com.br/para/${dados.slug}`,
            siteName: 'VamoAgendar',
            images: [
                {
                    url: '/og.png',
                    width: 1200,
                    height: 630,
                    alt: 'VamoAgendar — Seus clientes agendam sozinhos',
                },
            ],
            locale: 'pt_BR',
            type: 'website',
        },
        twitter: {
            card: 'summary_large_image',
            title: dados.seo.title,
            description: dados.seo.description,
        },
    }
}

// Mesmos preços cheios da landing principal (regra em docs/07-PLANOS_E_MONETIZACAO.md)
const PRECO_ORIGINAL: Record<PlanoId, number | null> = {
    gratuito: null,
    plus: 19.9,
    pro: 29.9,
}

const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`

// Textura de filme idêntica à da landing principal
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
    {
        rotulo: 'Link personalizado (/sua-marca)',
        valor: (p) => p.recursos.linkPersonalizado,
    },
    { rotulo: 'Cor da sua marca', valor: (p) => p.recursos.corPersonalizada },
    { rotulo: 'Sua logo na página', valor: (p) => p.recursos.logoPersonalizado },
    {
        rotulo: 'Confirmação e lembrete por WhatsApp',
        valor: (p) => p.recursos.whatsapp,
    },
]

export default async function LandingNicho({ params }: { params: Promise<{ nicho: string }> }) {
    const { nicho } = await params
    const dados = NICHOS[nicho]
    const planos = [PLANOS.gratuito, PLANOS.plus, PLANOS.pro]
    // Sempre deslogado (página estática): destaca o Pro, como na principal
    const destaque = (id: PlanoId) => (id === 'pro' ? 'bg-marca-forte/[0.08]' : '')

    return (
        <div className="relative flex-1 overflow-x-clip bg-palco text-giz">
            {/* Funil: visita à landing vertical (UTMs anexadas pelo posthog-js) */}
            <CapturaEvento evento="landing_viewed" propriedades={{ nicho: dados.slug }} />
            <div
                aria-hidden
                className="pointer-events-none fixed inset-0 z-40 opacity-[0.03]"
                style={{ backgroundImage: RUIDO }}
            />
            <LuzAmbiente />

            {/* Cabeçalho — o logo leva à landing principal */}
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
                    </nav>
                </div>
            </header>

            <main className="relative z-10 mx-auto max-w-[90rem] px-6 sm:px-10 lg:px-16">
                {/* ── Hero — a abertura do filme: o resultado primeiro ── */}
                <section className="relative pt-44 sm:pt-52">
                    <span
                        aria-hidden
                        className="pointer-events-none absolute -right-8 top-16 select-none font-mono text-[clamp(7rem,26vw,22rem)] font-bold leading-none tracking-tighter text-fantasma sm:top-4"
                    >
                        {dados.abertura.hora}
                    </span>

                    <div className="relative">
                        <div className="mascara">
                            <p
                                className="font-mono text-xs uppercase tracking-[0.3em] text-marca"
                                style={{ animationDelay: '350ms' }}
                            >
                                {dados.abertura.eyebrow}
                            </p>
                        </div>
                        <h1 className="mt-8 font-display text-[clamp(2.5rem,6.5vw,5.75rem)] font-extrabold leading-[1.0] tracking-[-0.035em]">
                            <span className="mascara block">
                                <span className="block" style={{ animationDelay: '450ms' }}>
                                    {dados.heroTitulo}
                                </span>
                            </span>
                            <span className="mascara block">
                                <span
                                    className="block text-marca"
                                    style={{ animationDelay: '580ms' }}
                                >
                                    {dados.heroDestaque}
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
                                {dados.heroSubtitulo}
                            </p>
                            <div
                                className="aparecer mt-9 flex flex-wrap items-center gap-6"
                                style={{ animationDelay: '1100ms' }}
                            >
                                <Link
                                    href="/sign-up"
                                    className="rounded-full bg-gradient-to-br from-[#3DBAED] to-[#3961D5] px-7 py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_40px_rgba(61,186,237,0.25)]"
                                >
                                    Criar conta grátis
                                </Link>
                                <a
                                    href="#como-funciona"
                                    className="text-sm text-penumbra underline decoration-penumbra/50 underline-offset-4 transition-colors hover:text-giz"
                                >
                                    Ver como funciona
                                </a>
                            </div>
                            <p
                                className="aparecer mt-8 font-mono text-xs uppercase tracking-widest text-penumbra/75"
                                style={{ animationDelay: '1250ms' }}
                            >
                                Grátis para começar · Sem cartão de crédito
                            </p>
                        </div>

                        <div
                            className="aparecer lg:col-span-5 lg:col-start-8"
                            style={{ animationDelay: '800ms' }}
                        >
                            {/* O celular aceso — a demo com os serviços do nicho */}
                            <div className="relative">
                                <div
                                    aria-hidden
                                    className="absolute -inset-12 rounded-full bg-[#ACC6FF]/40 blur-3xl dark:bg-marca-forte/[0.09]"
                                />
                                <div className="relative">
                                    <DemoAgendamento
                                        servicos={dados.servicosDemo}
                                        estudio={dados.demo.estudio}
                                        iniciais={dados.demo.iniciais}
                                        ramo={dados.demo.ramo}
                                    />
                                </div>
                            </div>
                            <p className="mt-4 text-center font-mono text-xs text-penumbra/75">
                                demonstração real — pode clicar
                            </p>
                        </div>
                    </div>
                </section>

                {/* ── A conversa que se repete ───────────────────────── */}
                <section className="relative pt-[clamp(10rem,20vw,18rem)]">
                    <span
                        aria-hidden
                        className="pointer-events-none absolute -left-10 top-8 select-none font-mono text-[clamp(6rem,22vw,18rem)] font-bold leading-none tracking-tighter text-fantasma"
                    >
                        {dados.dor.hora}
                    </span>

                    <div className="relative">
                        <Reveal>
                            <p className="font-mono text-xs uppercase tracking-[0.3em] text-marca">
                                {dados.dor.hora} — {dados.dor.rotulo}
                            </p>
                        </Reveal>

                        <div className="mt-14 space-y-7 font-display font-semibold leading-tight tracking-[-0.02em]">
                            {dados.dor.conversa.map((fala, i) => (
                                <Reveal key={i} delay={i * 100}>
                                    <p
                                        className={`text-[clamp(1.4rem,3.4vw,2.5rem)] ${
                                            fala.autor === 'cliente'
                                                ? 'text-giz'
                                                : 'text-penumbra/75'
                                        }`}
                                        style={{ marginLeft: `${i * 8}%` }}
                                    >
                                        {fala.texto}
                                    </p>
                                </Reveal>
                            ))}
                        </div>

                        <Reveal delay={400}>
                            <p className="ml-auto mt-14 max-w-sm text-right text-penumbra">
                                {dados.dor.fecho}
                            </p>
                        </Reveal>
                    </div>
                </section>

                {/* ── A virada ───────────────────────────────────────── */}
                <section className="relative pt-[clamp(10rem,20vw,18rem)]">
                    <Reveal>
                        <h2 className="max-w-5xl font-display text-[clamp(2.25rem,6vw,5rem)] font-extrabold leading-[1.0] tracking-[-0.03em]">
                            Essa conversa <span className="text-marca">não precisa existir.</span>
                        </h2>
                    </Reveal>
                    <div className="mt-14 lg:ml-[38%]">
                        <Reveal delay={150}>
                            <p className="mt-2 inline-block border-b border-marca/40 pb-3 font-mono text-[clamp(1.1rem,2.6vw,1.75rem)] text-nevoa">
                                vamoagendar.com.br/<span className="text-marca">sua-marca</span>
                            </p>
                            <p className="mt-4 max-w-md text-sm text-penumbra">
                                Na bio do Instagram, no WhatsApp Business, onde{' '}
                                {dados.expressaoClientes} estiverem — mostrando só os horários
                                realmente livres.
                            </p>
                        </Reveal>
                    </div>
                </section>

                {/* ── Benefícios do nicho — blocos deslocados ────────── */}
                <section className="relative pt-[clamp(10rem,20vw,18rem)]">
                    <span
                        aria-hidden
                        className="pointer-events-none absolute right-0 top-1/3 select-none font-mono text-[clamp(6rem,20vw,16rem)] font-bold leading-none tracking-tighter text-fantasma"
                    >
                        {dados.beneficios[0].hora}
                    </span>

                    {dados.beneficios.map((b, i) => (
                        <div
                            key={b.titulo}
                            className={`relative max-w-md ${
                                i === 0 ? '' : 'mt-24 lg:mt-32'
                            } ${i % 2 === 1 ? 'lg:ml-[46%]' : ''}`}
                        >
                            <Reveal>
                                <p className="font-mono text-sm text-marca">{b.hora}</p>
                                <h3 className="mt-4 font-display text-[clamp(1.6rem,3vw,2.25rem)] font-bold leading-snug tracking-[-0.02em]">
                                    {b.titulo}
                                </h3>
                                <p className="mt-5 leading-relaxed text-nevoa">{b.texto}</p>
                            </Reveal>
                        </div>
                    ))}
                </section>

                {/* ── Como funciona — as quatro respostas ────────────── */}
                <section id="como-funciona" className="relative pt-[clamp(10rem,20vw,18rem)]">
                    <Reveal>
                        <p className="font-mono text-xs uppercase tracking-[0.3em] text-penumbra">
                            Como funciona
                        </p>
                        <h2 className="mt-5 max-w-3xl font-display text-[clamp(2rem,4.5vw,3.5rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
                            Sem mistério, sem promessa que não cumprimos.
                        </h2>
                    </Reveal>
                    <div className="mt-14 grid gap-x-12 gap-y-14 md:grid-cols-2">
                        {dados.comoFunciona.map((item, i) => (
                            <Reveal key={item.pergunta} delay={(i % 2) * 100}>
                                <h3 className="font-display text-lg font-bold tracking-[-0.01em] text-giz">
                                    {item.pergunta}
                                </h3>
                                <p className="mt-3 leading-relaxed text-nevoa">{item.resposta}</p>
                            </Reveal>
                        ))}
                    </div>
                </section>

                {/* ── Planos — fonte única: src/lib/planos.ts ────────── */}
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
                                                <Link
                                                    href="/sign-up"
                                                    className={`block rounded-full py-2.5 text-center text-sm font-semibold transition-colors duration-200 ${
                                                        p.id === 'pro'
                                                            ? 'bg-gradient-to-br from-[#3DBAED] to-[#3961D5] text-white hover:brightness-110'
                                                            : 'border border-fio-forte text-nevoa hover:border-penumbra hover:text-giz'
                                                    }`}
                                                >
                                                    {p.id === 'gratuito'
                                                        ? 'Começar grátis'
                                                        : `Assinar ${p.nome}`}
                                                </Link>
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

                {/* ── O fecho ────────────────────────────────────────── */}
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
                                Crie a conta, cadastre seus serviços e compartilhe seu link. Em
                                poucos minutos está no ar — marcando horário enquanto você atende.
                            </p>
                            <Link
                                href="/sign-up"
                                className="mt-10 inline-block rounded-full bg-gradient-to-br from-[#3DBAED] to-[#3961D5] px-8 py-4 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_40px_rgba(61,186,237,0.25)]"
                            >
                                Criar conta grátis
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
                        <Link href="/" className="transition-colors hover:text-giz">
                            Página principal
                        </Link>
                        <a href="#planos" className="transition-colors hover:text-giz">
                            Planos
                        </a>
                        <Link href="/sign-up" className="transition-colors hover:text-giz">
                            Criar conta
                        </Link>
                    </nav>
                </div>
            </footer>
        </div>
    )
}
