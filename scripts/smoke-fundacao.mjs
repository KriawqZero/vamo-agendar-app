#!/usr/bin/env node
/**
 * Smoke test da fundação operacional: Sentry e Resend.
 *
 * O que este script exercita: CREDENCIAIS, DNS e ENTREGA — coisas que só
 * existem com secret de verdade e caixa de entrada de verdade. Ele NÃO testa a
 * lógica do wrapper (`enviarEmail`), que é coberta por teste unitário em
 * `src/lib/__tests__/email-enviar.test.ts`. São dois níveis de garantia
 * diferentes; não confundir um com o outro.
 *
 * Quem roda: o OWNER, no terminal dele. O executor do plano nunca roda com
 * credencial — ele não tem acesso a `.env*`.
 *
 * Uso:
 *   node --env-file=.env.local scripts/smoke-fundacao.mjs SEU-EMAIL@exemplo.com
 *   node --env-file=.env.local scripts/smoke-fundacao.mjs --sentry
 *   node --env-file=.env.local scripts/smoke-fundacao.mjs SEU-EMAIL@exemplo.com --sentry
 *
 * As duas verificações são INDEPENDENTES (WR-07): o destinatário libera o
 * e-mail, `--sentry` libera o evento sintético. Antes, validar o Sentry
 * obrigava a queimar um e-mail do teto diário do Free.
 *
 * Sem nenhum dos dois nada é enviado: o script só diagnostica a presença de
 * credencial e imprime uma linha por produto. Nunca lança e sai sempre com
 * código 0 — o diagnóstico está nas linhas impressas, não no exit code.
 */

const REMETENTE = 'naoresponda@mail.vamoagendar.com.br'
const NOME_TESTE = 'Smoke Test'

const argumentos = process.argv.slice(2)
const enviarEventoSentry = argumentos.includes('--sentry')
const destinatario = argumentos.find((arg) => !arg.startsWith('--'))

if (!destinatario && !enviarEventoSentry) {
    console.log('Uso: node --env-file=.env.local scripts/smoke-fundacao.mjs SEU-EMAIL@exemplo.com')
    console.log('     node --env-file=.env.local scripts/smoke-fundacao.mjs --sentry')
    console.log('Sem destinatário e sem --sentry, segue só o diagnóstico de credenciais.')
}

async function testarResend() {
    const apiKey = process.env.RESEND_API_KEY?.trim()
    if (!apiKey) {
        // Mesmo estado do EML-05: ausência de credencial é desligamento
        // explícito, não erro.
        console.log('resend: desativado')
        return
    }

    if (!destinatario) {
        console.log('resend: configurado (sem destinatário, nada enviado)')
        return
    }

    try {
        const { Resend } = await import('resend')
        const resend = new Resend(apiKey)

        const { data, error } = await resend.emails.send({
            from: `${NOME_TESTE} via VamoAgendar <${REMETENTE}>`,
            to: destinatario,
            replyTo: destinatario,
            subject: 'Smoke test da fundação operacional — VamoAgendar',
            html: [
                '<p>Se você está lendo isto, o canal de e-mail transacional está de pé.</p>',
                '<p>Confira: o remetente aparece como <strong>… via VamoAgendar</strong>,',
                'responder endereça o reply-to, e anote em qual aba esta mensagem caiu',
                '(Principal, Promoções ou Spam) — é insumo direto da Phase 4.</p>',
            ].join(' '),
        })

        if (error) {
            console.log(`resend: falha motivo=${error.name} status=${error.statusCode ?? '-'}`)
            return
        }

        console.log(`resend: ok id=${data?.id ?? '(sem id)'}`)
    } catch (err) {
        console.log(`resend: falha motivo=excecao (${err?.message ?? 'sem mensagem'})`)
    }
}

async function testarSentry() {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()
    if (!dsn) {
        console.log('sentry: desativado')
        return
    }

    // Fora do runtime do Next, `@sentry/nextjs` pode não resolver; `@sentry/node`
    // é o fallback natural. Falhando os dois, instruímos a verificação manual em
    // vez de estourar.
    let Sentry = null
    for (const pacote of ['@sentry/nextjs', '@sentry/node']) {
        try {
            const mod = await import(pacote)
            // Interop CJS/ESM: importado por Node cru, `@sentry/nextjs` expõe
            // `init` no namespace mas mantém `captureException`/`flush` só no
            // `default`. Normaliza para o objeto que de fato tem a captura.
            Sentry = mod?.captureException ? mod : (mod?.default ?? mod)
            break
        } catch {
            // tenta o próximo
        }
    }

    if (!Sentry?.init || !Sentry?.captureException) {
        console.log('sentry: indisponivel (SDK não carregou fora do runtime do Next)')
        console.log('        verifique pelo produto: provoque um erro em /dashboard e olhe Issues')
        return
    }

    if (!enviarEventoSentry) {
        console.log('sentry: configurado (sem --sentry, nenhum evento enviado)')
        return
    }

    try {
        // ⚠️ Este init é DUPLICATA das travas de
        // `src/lib/observabilidade/opcoes-sentry.ts`, e não pode importá-lo:
        // este é um `.mjs` rodado pelo Node cru, sem transpilar TypeScript. A
        // fonte da verdade continua sendo o arquivo TS — o que está aqui é o
        // mínimo para que UM evento sintético não carregue nada. Ao mexer nas
        // opções de lá, conferir se este bloco ainda faz sentido.
        Sentry.init({
            dsn,
            tracesSampleRate: 0,
            sendDefaultPii: false,
            dataCollection: {
                userInfo: false,
                cookies: false,
                httpBodies: [],
                urlQueryParams: false,
                httpHeaders: { request: { allow: [] }, response: { allow: [] } },
                genAI: { inputs: false, outputs: false },
                stackFrameVariables: false,
                databaseQueryData: false,
            },
            // O evento é sintético e local, mas a trava é a mesma do produto:
            // nada de request, nada de usuário, nenhum breadcrumb.
            beforeSend: (evento) => {
                delete evento.request
                delete evento.extra
                evento.user = { ip_address: null }
                return evento
            },
            beforeBreadcrumb: () => null,
        })
        Sentry.captureException(new Error('Smoke test da fundação operacional (evento sintético)'))
        await Sentry.flush(5000)
        console.log('sentry: ok evento enviado (confira em Issues)')
    } catch (err) {
        console.log(`sentry: falha motivo=excecao (${err?.message ?? 'sem mensagem'})`)
    }
}

await testarResend()
await testarSentry()

process.exit(0)
