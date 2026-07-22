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
 * As duas strings abaixo são contrato VERBATIM do `01-UI-SPEC` §"Copywriting
 * Contract" e §"Regra sobre erros novos". Esta refatoração muda o transporte,
 * nunca a redação: alterar um byte aqui quebra `mensagens.test.ts`.
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

/**
 * Cópia da caixa de horários para cada membro de `MotivoPublico`.
 *
 * Todos apontam para a mesma constante, e isso é a descrição honesta do estado
 * atual — não preguiça: a caixa de horários tem UMA cópia contratada, e o botão
 * "Tentar de novo" embaixo dela é a única ação possível qualquer que seja a
 * causa. O `Record` sobre a união inteira é o que garante que um membro novo em
 * `MotivoPublico` não compile sem alguém decidir o que a tela diz.
 *
 * ⚠️ O caminho de ESCRITA (`criarAgendamentoPublico`) tem cópias PRÓPRIAS e
 * diferentes para os mesmos discriminantes — `slug_invalido` lá é
 * "Estabelecimento inválido ou indisponível.". Elas continuam morando na action
 * até o plano 01-12 convertê-la: duplicá-las aqui agora criaria duas fontes para
 * a mesma string, que é exatamente o defeito que este módulo existe para impedir.
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
 * Traduz o discriminante da action para a cópia da caixa de horários.
 *
 * O `??` não é defensivismo decorativo: o cliente que roda no navegador do
 * visitante pode ser o bundle da versão ANTERIOR ao deploy, recebendo um
 * `motivo` que ele não conhece. Sem o fallback, a caixa mostraria `undefined`.
 */
export function mensagemDeMotivo(motivo: MotivoPublico): string {
    return COPIA_DA_CAIXA_DE_HORARIOS[motivo] ?? COPY_ERRO_SLOTS_FALLBACK
}
