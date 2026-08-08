import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import EtapaContato from '../[slug]/etapas/EtapaContato'

const RAIZ = process.cwd()
const FONTE_ETAPA_CONTATO = readFileSync(
    join(RAIZ, 'src/app/book/[slug]/etapas/EtapaContato.tsx'),
    'utf8',
)

describe('EtapaContato UI Component', () => {
    it('renderiza os campos Nome, WhatsApp e E-mail', () => {
        const html = renderToStaticMarkup(
            React.createElement(EtapaContato, {
                formAction: vi.fn(),
                erro: null,
                nome: 'Maria',
                onNomeChange: vi.fn(),
                telefone: '11999999999',
                onTelefoneChange: vi.fn(),
                email: 'maria@exemplo.com',
                onEmailChange: vi.fn(),
                autoFoco: false,
            })
        )

        expect(html).toContain('Seu nome')
        expect(html).toContain('WhatsApp')
        expect(html).toContain('E-mail')
        expect(html).toContain('maria@exemplo.com')
    })

    it('aplica atributo required no Nome, enquanto WhatsApp e E-mail são opcionais', () => {
        expect(FONTE_ETAPA_CONTATO).toContain('id="contato-nome"')
        expect(FONTE_ETAPA_CONTATO).toContain('required')
        expect(FONTE_ETAPA_CONTATO).toContain('id="contato-telefone"')
        expect(FONTE_ETAPA_CONTATO).toContain('id="contato-email"')
    })

    it('exibe mensagem de erro caso o estado erro seja informado', () => {
        const mensagemErro = 'Informe pelo menos um meio de contato (WhatsApp ou E-mail) para receber sua confirmação.'
        const html = renderToStaticMarkup(
            React.createElement(EtapaContato, {
                formAction: vi.fn(),
                erro: mensagemErro,
                nome: 'João',
                onNomeChange: vi.fn(),
                telefone: '',
                onTelefoneChange: vi.fn(),
                email: '',
                onEmailChange: vi.fn(),
                autoFoco: false,
            })
        )

        expect(html).toContain(mensagemErro)
    })

    it('mantém o campo armadilha honeypot (info_adicional) com os atributos de segurança', () => {
        expect(FONTE_ETAPA_CONTATO).toContain('name="info_adicional"')
        expect(FONTE_ETAPA_CONTATO).toContain('tabIndex={-1}')
        expect(FONTE_ETAPA_CONTATO).toContain('aria-hidden="true"')
    })
})
