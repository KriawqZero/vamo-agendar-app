/**
 * Pino das cópias públicas do booking.
 *
 * Por que existe: as strings desta suíte são contrato VERBATIM do `01-UI-SPEC`
 * (§"Copywriting Contract" e §"Regra sobre erros novos") e acabaram de MUDAR DE
 * CASA — saíram do servidor, onde nunca chegavam ao navegador em build de
 * produção, e passaram a morar no cliente. Mudança de transporte é exatamente o
 * tipo de refatoração que reescreve um texto sem ninguém ver.
 *
 * Suíte HERMÉTICA (sem rede, sem banco): entra no glob padrão do vitest, ao
 * contrário da de integração do caminho de escrita.
 *
 * O que ela NÃO cobre, e onde isso é coberto: que a cópia chega à TELA dentro da
 * caixa vermelha com `role="alert"`, e que o erro atravessa a fronteira de flight
 * em produção. A travessia é provada por
 * `scripts/verificar-travessia-server-action.sh`; a renderização continua sendo
 * item de olho humano em `docs/PENDENCIAS.md` §"UAT humano pendente da Phase 1".
 */

import { describe, expect, it } from 'vitest'

import type { MotivoPublico } from '@/app/actions/public-booking'
import * as mensagens from '@/app/book/[slug]/mensagens'
import {
    COPY_ERRO_SLOTS,
    COPY_ERRO_SLOTS_FALLBACK,
    mensagemDeMotivo,
} from '@/app/book/[slug]/mensagens'

/**
 * Todos os membros de `MotivoPublico`. O `satisfies` faz o compilador reprovar
 * um literal que não pertença à união — membro renomeado no servidor quebra
 * aqui, em vez de sumir da tela em silêncio.
 */
const TODOS_OS_MOTIVOS = [
    'campos_obrigatorios',
    'telefone_invalido',
    'data_invalida',
    'slug_invalido',
    'servico_invalido',
    'slot_indisponivel',
    'erro_interno',
] as const satisfies readonly MotivoPublico[]

/**
 * Identificadores internos que nunca podem aparecer numa caixa visível ao
 * cliente final (regra do CLAUDE.md, e aqui ela é literalmente visível).
 * `slug-` casa com slug de visitante ecoado de volta.
 */
const PROIBIDOS = ['org_', 'PGRST', 'tenant', 'slug-'] as const

/** União de tudo que `mensagens.ts` exporta: as cópias (tipo literal) e o mapeador. */
type ExportacaoDeMensagem = (typeof mensagens)[keyof typeof mensagens]

describe('cópias públicas do booking', () => {
    it('mantém a cópia da caixa de erro de slots byte a byte', () => {
        // Igualdade ESTRITA, não `contains`: a string inteira vai para a tela.
        expect(COPY_ERRO_SLOTS).toBe('Não foi possível carregar os horários. Tente de novo.')
    })

    it('mantém a cópia de fallback do cliente byte a byte', () => {
        expect(COPY_ERRO_SLOTS_FALLBACK).toBe('Erro ao carregar horários disponíveis.')
    })

    it('traduz o discriminante `slug_invalido` para a cópia contratada', () => {
        expect(mensagemDeMotivo('slug_invalido')).toBe(COPY_ERRO_SLOTS)
    })

    it('devolve texto acionável para TODOS os membros de MotivoPublico', () => {
        // Sem isto, um membro novo no servidor renderizaria `undefined` na caixa.
        for (const motivo of TODOS_OS_MOTIVOS) {
            const copia = mensagemDeMotivo(motivo)
            expect(copia, `motivo sem cópia: ${motivo}`).toBeTruthy()
            expect(typeof copia).toBe('string')
        }
    })

    it('não vaza identificador interno em NENHUMA cópia exportada', () => {
        // Iteração sobre o módulo (não sobre uma lista escrita à mão): cópia
        // acrescentada no futuro já nasce sob a regra, sem alguém lembrar de
        // acrescentar caso de teste.
        // O predicado narra para os membros STRING da união exportada pelo
        // módulo — `[string, string]` não é subtipo do que `Object.entries`
        // devolve (as cópias têm tipo literal, e `mensagemDeMotivo` é função),
        // e o compilador reprova o predicado antes de reprovar o teste.
        const copiasExportadas = Object.entries(mensagens).filter(
            (par): par is [string, Extract<ExportacaoDeMensagem, string>] =>
                typeof par[1] === 'string',
        )
        expect(copiasExportadas.length).toBeGreaterThan(0)

        for (const [nome, copia] of copiasExportadas) {
            for (const proibido of PROIBIDOS) {
                expect(copia, `${nome} vaza "${proibido}"`).not.toContain(proibido)
            }
        }
    })

    it('não vaza identificador interno em nenhuma tradução de motivo', () => {
        for (const motivo of TODOS_OS_MOTIVOS) {
            const copia = mensagemDeMotivo(motivo)
            for (const proibido of PROIBIDOS) {
                expect(copia, `mensagemDeMotivo('${motivo}') vaza "${proibido}"`).not.toContain(
                    proibido,
                )
            }
        }
    })
})
