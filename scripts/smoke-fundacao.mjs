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
 *
 * SEM destinatário nada é enviado: o script só diagnostica a presença de
 * credencial e imprime uma linha por produto. Nunca lança e sai sempre com
 * código 0 — o diagnóstico está nas linhas impressas, não no exit code.
 */

const REMETENTE = 'naoresponda@mail.vamoagendar.com.br'
const NOME_TESTE = 'Smoke Test'

const destinatario = process.argv[2]

if (!destinatario) {
    console.log('Uso: node --env-file=.env.local scripts/smoke-fundacao.mjs SEU-EMAIL@exemplo.com')
    console.log('Sem destinatário nada é enviado — segue só o diagnóstico de credenciais.')
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
            Sentry = await import(pacote)
            break
        } catch {
            // tenta o próximo
        }
    }

    if (!Sentry?.init) {
        console.log('sentry: indisponivel (SDK não carregou fora do runtime do Next)')
        console.log('        verifique pelo produto: provoque um erro em /dashboard e olhe Issues')
        return
    }

    if (!destinatario) {
        console.log('sentry: configurado (sem destinatário, nenhum evento enviado)')
        return
    }

    try {
        Sentry.init({ dsn, tracesSampleRate: 0, sendDefaultPii: false })
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
