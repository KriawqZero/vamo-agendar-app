import type { MotivoPublico } from '@/app/actions/public-booking'

/**
 * Cópias públicas do booking — uma constante por caso, e o mapeador que traduz o
 * discriminante devolvido pelas actions para o texto que o cliente final lê.
 *
 * Por que as cópias saíram do servidor: em build de produção a mensagem de uma
 * exceção NÃO atravessa a fronteira de flight (vira um `digest` opaco), então
 * texto produzido no servidor para uma caixa de erro do navegador é texto que
 * nunca chega. O servidor devolve `motivo`; a tela escolhe a cópia. Efeito
 * colateral desejado: a MESMA constante alimenta a UI e a asserção de teste, o
 * que torna cópia divergente impossível por construção.
 *
 * As strings abaixo são contrato VERBATIM do `01-UI-SPEC` §"Copywriting
 * Contract" e §"Regra sobre erros novos". Esta refatoração muda o transporte,
 * nunca a redação: alterar um byte aqui quebra `mensagens.test.ts`.
 *
 * DUAS superfícies consomem este módulo, e cada uma tem o seu mapeador exaustivo:
 * a caixa de horários da etapa de data/hora (`mensagemDeMotivo`, caminho de
 * LEITURA) e o envio do agendamento (`mensagemDeEnvio`, caminho de ESCRITA —
 * aviso âmbar de double-booking e caixa vermelha do formulário de contato).
 *
 * Módulo puro de constantes, sem diretiva: importável do servidor e do cliente.
 */

/** Caixa vermelha da etapa de data/hora — o botão "Tentar de novo" é a saída. */
export const COPY_ERRO_SLOTS = 'Não foi possível carregar os horários. Tente de novo.'

/**
 * Fallback do CLIENTE para o inesperado de verdade (a rede caiu no meio do POST
 * da Server Action, e nenhum `motivo` chegou). Já existia em `BookingApp.tsx` e
 * continua com o texto de sempre.
 */
export const COPY_ERRO_SLOTS_FALLBACK = 'Erro ao carregar horários disponíveis.'

// ---------------------------------------------------------------------------
// Cópias do caminho de ESCRITA (`criarAgendamentoPublico`)
//
// Todas foram COPIADAS VERBATIM das mensagens que as exceções da action
// carregavam antes desta rodada — a refatoração muda o transporte, nunca a
// redação. As duas primeiras são contrato explícito do `01-UI-SPEC`
// §"Copywriting Contract"; as demais nunca chegavam ao navegador em build de
// produção (viravam `digest`), e é justamente por isso que passam a morar aqui.
// ---------------------------------------------------------------------------

/**
 * Aviso ÂMBAR da etapa de data/hora quando outro visitante levou o slot.
 * Contrato do `01-UI-SPEC` (linha "⚠️ Aviso — slot tomado (double-booking)") e
 * o texto que a Phase 2 §SC4 exige ver na tela.
 */
export const COPY_SLOT_INDISPONIVEL =
    'Este horário já foi preenchido ou está indisponível. Por favor, selecione outro.'

/**
 * Fallback do CLIENTE no envio: a rede caiu no meio do POST e nenhum `motivo`
 * voltou. Contrato do `01-UI-SPEC` (linha "Error — fallback de envio").
 */
export const COPY_FALLBACK_ENVIO = 'Não foi possível confirmar o agendamento. Tente outro horário.'

/** Campos obrigatórios ausentes na chamada da action. */
export const COPY_CAMPOS_OBRIGATORIOS = 'Preencha todos os campos obrigatórios.'

/** Telefone fora de 10–11 dígitos revalidado no servidor. */
export const COPY_TELEFONE_INVALIDO = 'Número de WhatsApp inválido. Informe o DDD e o número.'

/** Instante enviado que não parseia. */
export const COPY_DATA_INVALIDA = 'Data e horário inválidos.'

/** Slug que não resolve (ou deixou de ser o efetivo do plano com a aba aberta). */
export const COPY_ESTABELECIMENTO_INVALIDO = 'Estabelecimento inválido ou indisponível.'

/** Serviço inexistente, inativo ou de outro tenant. */
export const COPY_SERVICO_INVALIDO = 'Serviço inválido ou indisponível.'

/**
 * Falha de infraestrutura na etapa de contato (leitura ou escrita em `clientes`).
 *
 * ⚠️ Constante PINADA, hoje sem mapeamento próprio: o discriminante colapsa as
 * três falhas de infraestrutura do caminho de escrita em `erro_interno`, e para
 * o visitante a distinção "não consegui gravar seu contato" x "não consegui
 * gravar o agendamento" não muda nada — as duas significam "não confirmou".
 * Quem precisa da distinção é quem investiga, e ela está preservada onde
 * importa: no `etapa` do `reportarExcecao` (`buscar_cliente`,
 * `cadastrar_cliente`, `criar_agendamento`). O texto continua aqui, byte a byte
 * e sob a asserção da suíte, para que um membro futuro do discriminante o
 * reencontre já travado em vez de reescrito de memória.
 */
export const COPY_ERRO_CONTATO = 'Erro ao processar dados de contato.'

/** Falha de infraestrutura ao gravar o agendamento — e cópia de todo `erro_interno`. */
export const COPY_ERRO_CONFIRMACAO = 'Erro ao confirmar o agendamento.'

/**
 * Cópia da caixa de horários para cada membro de `MotivoPublico`.
 *
 * Todos apontam para a mesma constante, e isso é a descrição honesta do estado
 * atual — não preguiça: a caixa de horários tem UMA cópia contratada, e o botão
 * "Tentar de novo" embaixo dela é a única ação possível qualquer que seja a
 * causa. O `Record` sobre a união inteira é o que garante que um membro novo em
 * `MotivoPublico` não compile sem alguém decidir o que a tela diz.
 */
const COPIA_DA_CAIXA_DE_HORARIOS: Record<MotivoPublico, string> = {
    campos_obrigatorios: COPY_ERRO_SLOTS,
    telefone_invalido: COPY_ERRO_SLOTS,
    data_invalida: COPY_ERRO_SLOTS,
    slug_invalido: COPY_ERRO_SLOTS,
    servico_invalido: COPY_ERRO_SLOTS,
    slot_indisponivel: COPY_ERRO_SLOTS,
    erro_interno: COPY_ERRO_SLOTS,
}

/**
 * Cópia do caminho de ESCRITA para cada membro de `MotivoPublico`.
 *
 * Por que é um segundo `Record` e não o mesmo: as duas superfícies têm cópias
 * DIFERENTES e ambas travadas para o mesmo discriminante — `slug_invalido` na
 * caixa de horários é "Não foi possível carregar os horários. Tente de novo."
 * (§"Regra sobre erros novos" do `01-UI-SPEC`) e no envio é "Estabelecimento
 * inválido ou indisponível.". Um mapeador só obrigaria a REESCREVER uma das
 * duas, que é a única coisa que este plano tem proibido fazer. Fonte única de
 * cópia continua valendo: cada string existe uma vez, neste arquivo.
 *
 * Exaustivo de propósito (sem `default`): membro novo em `MotivoPublico` quebra
 * o `tsc` em vez de cair num texto solto.
 */
const COPIA_DO_ENVIO: Record<MotivoPublico, string> = {
    campos_obrigatorios: COPY_CAMPOS_OBRIGATORIOS,
    telefone_invalido: COPY_TELEFONE_INVALIDO,
    data_invalida: COPY_DATA_INVALIDA,
    slug_invalido: COPY_ESTABELECIMENTO_INVALIDO,
    servico_invalido: COPY_SERVICO_INVALIDO,
    slot_indisponivel: COPY_SLOT_INDISPONIVEL,
    erro_interno: COPY_ERRO_CONFIRMACAO,
}

/**
 * Traduz o discriminante da action para a cópia da caixa de horários.
 *
 * O `??` não é defensivismo decorativo: o cliente que roda no navegador do
 * visitante pode ser o bundle da versão ANTERIOR ao deploy, recebendo um
 * `motivo` que ele não conhece. Sem o fallback, a caixa mostraria `undefined`.
 */
export function mensagemDeMotivo(motivo: MotivoPublico): string {
    return COPIA_DA_CAIXA_DE_HORARIOS[motivo] ?? COPY_ERRO_SLOTS_FALLBACK
}

/**
 * Traduz o discriminante devolvido por `criarAgendamentoPublico` para a cópia
 * que o cliente lê — em DUAS superfícies, com uma fonte só:
 *
 * - `slot_indisponivel` vira o aviso âmbar da etapa de data/hora, depois da
 *   recuperação de double-booking (o slot morto é solto e a grade é refeita);
 * - qualquer outro motivo vira a caixa vermelha do formulário de contato.
 *
 * Mesmo `??` de `mensagemDeMotivo`, pelo mesmo motivo (bundle anterior ao deploy).
 */
export function mensagemDeEnvio(motivo: MotivoPublico): string {
    return COPIA_DO_ENVIO[motivo] ?? COPY_FALLBACK_ENVIO
}
