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
    COPY_CAMPOS_OBRIGATORIOS,
    COPY_DATA_INVALIDA,
    COPY_ERRO_CONFIRMACAO,
    COPY_ERRO_CONTATO,
    COPY_ERRO_SLOTS,
    COPY_ERRO_SLOTS_FALLBACK,
    COPY_ESTABELECIMENTO_INVALIDO,
    COPY_FALLBACK_ENVIO,
    COPY_SERVICO_INVALIDO,
    COPY_SLOT_INDISPONIVEL,
    COPY_TELEFONE_INVALIDO,
    mensagemDeEnvio,
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

    // -----------------------------------------------------------------------
    // Cópias do caminho de ESCRITA — saíram da action nesta rodada (01-12).
    // As duas primeiras são contrato explícito do 01-UI-SPEC; as demais foram
    // copiadas VERBATIM das mensagens que as exceções carregavam.
    // -----------------------------------------------------------------------

    it('mantém a cópia do aviso de double-booking byte a byte', () => {
        // É a cópia que a Phase 2 §SC4 exige ver na tela quando alguém perde a
        // corrida pelo slot. Um byte diferente aqui é regressão de contrato.
        expect(COPY_SLOT_INDISPONIVEL).toBe(
            'Este horário já foi preenchido ou está indisponível. Por favor, selecione outro.',
        )
    })

    it('mantém a cópia de fallback do envio byte a byte', () => {
        expect(COPY_FALLBACK_ENVIO).toBe(
            'Não foi possível confirmar o agendamento. Tente outro horário.',
        )
    })

    it('mantém as cópias de falha de infraestrutura do envio byte a byte', () => {
        expect(COPY_ERRO_CONTATO).toBe('Erro ao processar dados de contato.')
        expect(COPY_ERRO_CONFIRMACAO).toBe('Erro ao confirmar o agendamento.')
    })

    it('mantém as cópias de validação do envio byte a byte', () => {
        expect(COPY_CAMPOS_OBRIGATORIOS).toBe('Preencha todos os campos obrigatórios.')
        expect(COPY_TELEFONE_INVALIDO).toBe(
            'Número de WhatsApp inválido. Informe o DDD e o número.',
        )
        expect(COPY_DATA_INVALIDA).toBe('Data e horário inválidos.')
        expect(COPY_ESTABELECIMENTO_INVALIDO).toBe('Estabelecimento inválido ou indisponível.')
        expect(COPY_SERVICO_INVALIDO).toBe('Serviço inválido ou indisponível.')
    })

    it('traduz `slot_indisponivel` do envio para o aviso âmbar contratado', () => {
        expect(mensagemDeEnvio('slot_indisponivel')).toBe(COPY_SLOT_INDISPONIVEL)
    })

    it('mantém as DUAS superfícies com cópias próprias para o mesmo discriminante', () => {
        // A razão de existirem dois mapeadores, escrita como asserção: a caixa
        // de horários e o envio têm cópias diferentes e ambas travadas para
        // `slug_invalido`. Um mapeador só obrigaria a reescrever uma das duas.
        expect(mensagemDeMotivo('slug_invalido')).toBe(COPY_ERRO_SLOTS)
        expect(mensagemDeEnvio('slug_invalido')).toBe(COPY_ESTABELECIMENTO_INVALIDO)
        expect(mensagemDeMotivo('slug_invalido')).not.toBe(mensagemDeEnvio('slug_invalido'))
    })

    it('devolve texto acionável para TODOS os membros no caminho de envio', () => {
        for (const motivo of TODOS_OS_MOTIVOS) {
            const copia = mensagemDeEnvio(motivo)
            expect(copia, `motivo sem cópia de envio: ${motivo}`).toBeTruthy()
            expect(typeof copia).toBe('string')
        }
    })

    it('não vaza identificador interno em nenhuma tradução de envio', () => {
        for (const motivo of TODOS_OS_MOTIVOS) {
            const copia = mensagemDeEnvio(motivo)
            for (const proibido of PROIBIDOS) {
                expect(copia, `mensagemDeEnvio('${motivo}') vaza "${proibido}"`).not.toContain(
                    proibido,
                )
            }
        }
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
