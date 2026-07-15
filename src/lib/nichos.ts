/**
 * Fonte da verdade das landings verticais (/para/[nicho]).
 * Cada nicho adapta a mesma história da landing principal — a conversa
 * repetitiva de WhatsApp que não precisa existir — para a rotina real da
 * profissão. Copy honesta: WhatsApp automático é plano Pro; nada de
 * multi-profissional, pagamento pelo app ou aplicativo nativo.
 * Direção de produto em docs/PENDENCIAS.md §6.
 */

export interface ServicoNicho {
    nome: string
    duracaoMinutos: number
    preco: string
}

export interface FalaConversa {
    /** 'cliente' = mensagem recebida; 'voce' = sua resposta */
    autor: 'cliente' | 'voce'
    texto: string
}

export interface RespostaNicho {
    pergunta: string
    resposta: string
}

export interface BeneficioNicho {
    titulo: string
    texto: string
}

export interface NichoLanding {
    slug: string
    /** Nome do nicho em minúsculas, para frases corridas ("para manicures") */
    nome: string
    /** Rótulo curto do eyebrow do hero */
    rotulo: string
    /** "suas clientes" / "seus clientes" — concordância nas frases do template */
    expressaoClientes: string
    heroTitulo: string
    /** Fecho do título, renderizado na cor da marca */
    heroDestaque: string
    heroSubtitulo: string
    /** A dor: a conversa que se repete no WhatsApp/direct do nicho */
    dor: {
        rotulo: string
        conversa: FalaConversa[]
        fecho: string
    }
    beneficios: BeneficioNicho[]
    /** Estabelecimento fictício da demonstração */
    demo: {
        estudio: string
        iniciais: string
        ramo: string
    }
    servicosDemo: ServicoNicho[]
    /** Como o cliente agenda / como você configura / como o WhatsApp ajuda / o que NÃO é */
    comoFunciona: RespostaNicho[]
    seo: {
        title: string
        description: string
    }
}

export const NICHOS: Record<string, NichoLanding> = {
    'designer-de-sobrancelhas': {
        slug: 'designer-de-sobrancelhas',
        nome: 'designers de sobrancelhas',
        rotulo: 'para designers de sobrancelhas',
        expressaoClientes: 'suas clientes',
        heroTitulo: 'Você está no meio de um design.',
        heroDestaque: 'O direct não sabe disso.',
        heroSubtitulo:
            'Design, henna, brow lamination — cada atendimento pede as duas mãos e o olhar no milímetro. Enquanto isso, o “que horas tem?” se acumula. Seu link mostra só os horários realmente livres, a cliente escolhe um e confirma sozinha — sem cadastro, sem senha.',
        dor: {
            rotulo: 'a conversa que se repete o dia inteiro',
            conversa: [
                {
                    autor: 'cliente',
                    texto: '— Oi! Tem horário pra design com henna essa semana?',
                },
                { autor: 'voce', texto: '— Tenho quinta 10h ou sexta 16h!' },
                {
                    autor: 'cliente',
                    texto: '— Quinta não consigo… sexta tem mais cedo?',
                },
                {
                    autor: 'voce',
                    texto: '— Te respondo assim que acabar o atendimento',
                },
            ],
            fecho: 'Você respondeu essa conversa hoje entre duas clientes. E ontem. E vai responder amanhã — a menos que o link responda por você.',
        },
        beneficios: [
            {
                titulo: 'O direct volta a ser vitrine',
                texto: 'Seu Instagram mostra o antes e depois; o link marca o horário. Você para de negociar agenda por mensagem no meio dos atendimentos.',
            },
            {
                titulo: 'Cada serviço com o seu tempo',
                texto: 'Design simples, design com henna e brow lamination têm durações diferentes — e a grade só oferece horários em que o serviço escolhido realmente cabe. Sem encavalar cliente.',
            },
            {
                titulo: 'Confirmação e lembrete sem digitar',
                texto: 'No plano Pro, a cliente recebe a confirmação na hora e um lembrete antes do horário, direto no WhatsApp dela. Menos falta por esquecimento, sem você digitar nada.',
            },
        ],
        demo: {
            estudio: 'Estúdio Ana Lima',
            iniciais: 'AL',
            ramo: 'Design de sobrancelhas · São Paulo',
        },
        servicosDemo: [
            { nome: 'Design de sobrancelhas', duracaoMinutos: 40, preco: 'R$ 60' },
            { nome: 'Design + henna', duracaoMinutos: 50, preco: 'R$ 75' },
            { nome: 'Brow lamination', duracaoMinutos: 60, preco: 'R$ 130' },
        ],
        comoFunciona: [
            {
                pergunta: 'Como a cliente agenda?',
                resposta:
                    'Ela abre o seu link — na bio do Instagram ou no WhatsApp —, escolhe o serviço, vê apenas os horários livres de verdade e confirma informando nome e WhatsApp. Sem cadastro, sem senha, sem baixar aplicativo.',
            },
            {
                pergunta: 'Como você configura?',
                resposta:
                    'Cadastre seus serviços com duração e preço, defina os dias e horários em que atende e marque folgas e feriados. Em poucos minutos o link está no ar, calculando a agenda sozinho.',
            },
            {
                pergunta: 'Como o WhatsApp ajuda?',
                resposta:
                    'No plano Pro, o VamoAgendar se conecta ao seu número e envia confirmação na hora do agendamento e lembrete antes do horário, com a sua mensagem. A cliente lembra; você não interrompe o design.',
            },
            {
                pergunta: 'O que o VamoAgendar não tenta ser?',
                resposta:
                    'Não é agenda de equipe — é feito para quem atende sozinha. Não cobra a cliente pelo app: o pagamento do serviço continua do seu jeito. E não é aplicativo para instalar: é um link seu, que abre em qualquer celular.',
            },
        ],
        seo: {
            title: 'Agendamento online para designer de sobrancelhas | VamoAgendar',
            description:
                'Link de agendamento para designers de sobrancelhas: a cliente marca design, henna ou brow lamination sozinha, sem cadastro — e você para de responder “que horas tem?” no direct.',
        },
    },
    'lash-designer': {
        slug: 'lash-designer',
        nome: 'lash designers',
        rotulo: 'para lash designers',
        expressaoClientes: 'suas clientes',
        heroTitulo: 'Duas horas de aplicação.',
        heroDestaque: 'Zero paciência para o celular vibrando.',
        heroSubtitulo:
            'Fio a fio, volume russo, híbrido: sessões longas, precisão fio por fio. Marcar horário não pode depender de você largar a pinça. Seu link segura as marcações — com a duração certa de cada serviço, para nenhuma cliente cair no meio de outra aplicação.',
        dor: {
            rotulo: 'a remarcação que interrompe a aplicação',
            conversa: [
                {
                    autor: 'cliente',
                    texto: '— Amiga, preciso remarcar a manutenção de amanhã!',
                },
                { autor: 'voce', texto: '— Tranquilo! Tenho quinta às 14h' },
                { autor: 'cliente', texto: '— Quinta só consigo depois das 17h… tem?' },
                { autor: 'voce', texto: '— Deixa eu conferir a agenda e te falo' },
            ],
            fecho: 'Uma remarcação simples custou três interrupções no meio de um volume russo. Multiplique pelas manutenções de um mês inteiro.',
        },
        beneficios: [
            {
                titulo: 'Duração real, encaixe certo',
                texto: 'Aplicação de duas horas e manutenção de uma não disputam o mesmo espaço: a grade calcula os horários pela duração de cada serviço e nunca oferece um encaixe que não cabe. Em sessão longa, encaixe errado custa caro.',
            },
            {
                titulo: 'Manutenção marcada sem conversa',
                texto: 'A cliente de sempre entra no link e marca a própria manutenção — inclusive quando você está com as mãos ocupadas ou já foi dormir. Precisou remarcar? Ela escolhe o novo horário pelo link e você libera o antigo no painel quando terminar a aplicação.',
            },
            {
                titulo: 'Menos furo em sessão longa',
                texto: 'Uma falta de duas horas é um buraco caro na agenda. No plano Pro, confirmação na hora e lembrete automático por WhatsApp reduzem o esquecimento — sem você cobrar ninguém.',
            },
        ],
        demo: {
            estudio: 'Beatriz Lash Studio',
            iniciais: 'BL',
            ramo: 'Extensão de cílios · Curitiba',
        },
        servicosDemo: [
            { nome: 'Aplicação fio a fio', duracaoMinutos: 120, preco: 'R$ 160' },
            { nome: 'Volume russo', duracaoMinutos: 150, preco: 'R$ 200' },
            { nome: 'Volume híbrido', duracaoMinutos: 130, preco: 'R$ 180' },
            { nome: 'Manutenção (até 21 dias)', duracaoMinutos: 80, preco: 'R$ 90' },
        ],
        comoFunciona: [
            {
                pergunta: 'Como a cliente agenda?',
                resposta:
                    'Ela abre o seu link, escolhe entre aplicação ou manutenção, vê apenas os horários em que aquele serviço cabe de verdade e confirma com nome e WhatsApp. Sem cadastro, sem senha, sem baixar aplicativo.',
            },
            {
                pergunta: 'Como você configura?',
                resposta:
                    'Cadastre cada serviço com a duração real — aplicação, manutenção, remoção —, defina seus dias e horários de atendimento e marque folgas. O link fica pronto em poucos minutos e a grade respeita o tempo de cada técnica.',
            },
            {
                pergunta: 'Como o WhatsApp ajuda?',
                resposta:
                    'No plano Pro, a cliente recebe a confirmação na hora e um lembrete antes da sessão, no WhatsApp dela, com a sua mensagem. Menos falta em horário longo — e você não precisa parar a aplicação para cobrar confirmação.',
            },
            {
                pergunta: 'O que o VamoAgendar não tenta ser?',
                resposta:
                    'Não é agenda de equipe — é feito para quem atende sozinha. Não cobra a cliente pelo app: o pagamento do serviço continua do seu jeito. E não é aplicativo para instalar: é um link seu, que abre em qualquer celular.',
            },
        ],
        seo: {
            title: 'Agendamento online para lash designer | VamoAgendar',
            description:
                'Link de agendamento para lash designers: aplicações e manutenções com a duração certa, marcadas pelo link sem conversa no WhatsApp, e lembrete automático no plano Pro.',
        },
    },
    manicure: {
        slug: 'manicure',
        nome: 'manicures',
        rotulo: 'para manicures',
        expressaoClientes: 'suas clientes',
        heroTitulo: 'Agenda cheia é ótimo.',
        heroDestaque: 'Furo na agenda, não.',
        heroSubtitulo:
            'Manicure, pedicure, alongamento em gel: sua semana é um encaixe atrás do outro, e cada esquecimento vira cadeira vazia. Seu link mostra só os horários que sobraram de verdade — e, no plano Pro, lembra cada cliente antes do horário.',
        dor: {
            rotulo: 'a vaga que ficou presa no “vou ver e te aviso”',
            conversa: [
                { autor: 'cliente', texto: '— Oi! Consegue me encaixar no sábado?' },
                { autor: 'voce', texto: '— Sábado tenho 8h ou 16h40!' },
                { autor: 'cliente', texto: '— Vou ver com meu marido e te aviso!' },
                {
                    autor: 'voce',
                    texto: '— Fechou? Preciso confirmar pra segurar a vaga…',
                },
            ],
            fecho: 'Enquanto ela “vê e avisa”, duas vagas ficam presas. No link, quem quer o horário confirma na hora — e ele some para as outras.',
        },
        beneficios: [
            {
                titulo: 'Lembrete que segura o horário',
                texto: 'No plano Pro, a cliente recebe confirmação na hora e lembrete automático antes do horário, no WhatsApp dela. Esquecer fica difícil — e a sua cadeira não fica vazia.',
            },
            {
                titulo: 'Sábado lotado sem bate-volta de mensagem',
                texto: 'O link mostra apenas os horários que ainda estão livres. Quem escolhe, confirma na hora — nada de vaga presa esperando resposta enquanto outra cliente queria o mesmo horário.',
            },
            {
                titulo: 'Cada serviço no seu tempo',
                texto: 'Esmaltação em gel não ocupa o espaço de um alongamento: com a duração certa de cada serviço, a grade encaixa mais clientes no dia sem atropelar ninguém.',
            },
        ],
        demo: {
            estudio: 'Espaço Duda Nails',
            iniciais: 'DN',
            ramo: 'Manicure e pedicure · Belo Horizonte',
        },
        servicosDemo: [
            { nome: 'Manicure', duracaoMinutos: 40, preco: 'R$ 35' },
            { nome: 'Manicure + pedicure', duracaoMinutos: 80, preco: 'R$ 65' },
            { nome: 'Esmaltação em gel', duracaoMinutos: 60, preco: 'R$ 55' },
            { nome: 'Alongamento em gel', duracaoMinutos: 150, preco: 'R$ 180' },
        ],
        comoFunciona: [
            {
                pergunta: 'Como a cliente agenda?',
                resposta:
                    'Ela abre o seu link — na bio ou no WhatsApp —, escolhe o serviço, vê só os horários livres e confirma com nome e WhatsApp. Sem cadastro, sem senha, sem baixar aplicativo.',
            },
            {
                pergunta: 'Como você configura?',
                resposta:
                    'Cadastre seus serviços com duração e preço, defina os dias e horários em que atende e marque folgas e feriados. Em poucos minutos o link está no ar — e a agenda para de depender do seu caderninho.',
            },
            {
                pergunta: 'Como o WhatsApp ajuda?',
                resposta:
                    'No plano Pro, o VamoAgendar se conecta ao seu número e envia confirmação na hora e lembrete antes do horário, com a sua mensagem. É o lembrete que reduz falta — automático, todos os dias.',
            },
            {
                pergunta: 'O que o VamoAgendar não tenta ser?',
                resposta:
                    'Não é agenda de salão com várias profissionais — é feito para quem atende sozinha. Não cobra a cliente pelo app: o pagamento continua do seu jeito. E não é aplicativo para instalar: é um link seu, em qualquer celular.',
            },
        ],
        seo: {
            title: 'Agendamento online para manicure | VamoAgendar',
            description:
                'Link de agendamento para manicures: a cliente marca manicure, pedicure ou alongamento sozinha, sem cadastro — e o lembrete automático do plano Pro reduz as faltas.',
        },
    },
    barbeiro: {
        slug: 'barbeiro',
        nome: 'barbeiros',
        rotulo: 'para barbeiros',
        expressaoClientes: 'seus clientes',
        heroTitulo: 'Cliente na cadeira, máquina ligada.',
        heroDestaque: 'Quem responde o WhatsApp é o link.',
        heroSubtitulo:
            'Corte, barba, acabamento: o dia rende quando a cadeira não para. Mas cada “tem horário aí?” no meio do corte é a máquina desligada e o cliente esperando. Seu link mostra só os horários realmente livres, o cliente escolhe um e confirma sozinho — sem cadastro, sem senha.',
        dor: {
            rotulo: 'o encaixe negociado no meio do corte',
            conversa: [
                { autor: 'cliente', texto: '— E aí! Consegue me encaixar hoje ainda?' },
                { autor: 'voce', texto: '— Hoje só 18h30, fechou?' },
                { autor: 'cliente', texto: '— 18h30 não dá… e amanhã cedo?' },
                { autor: 'voce', texto: '— Te falo quando terminar esse corte' },
            ],
            fecho: 'Cada resposta dessas é a máquina desligada e o cliente da cadeira esperando. No link, quem quer horário acha sozinho o que serve — e confirma na hora.',
        },
        beneficios: [
            {
                titulo: 'O corte não para pra responder mensagem',
                texto: 'Quem quer horário abre o link, vê o que está livre de verdade e resolve sozinho. Você fica na máquina, no acabamento e na conversa com o cliente da cadeira — não no celular.',
            },
            {
                titulo: 'Corte e corte + barba, cada um no seu tempo',
                texto: 'O combo não ocupa o espaço de um corte simples: a grade calcula os horários pela duração de cada serviço e nunca oferece um encaixe que não cabe. Sem atrasar a fila do dia.',
            },
            {
                titulo: 'Menos cadeira vazia no fim de tarde',
                texto: 'No plano Pro, o cliente recebe a confirmação na hora e um lembrete antes do horário, direto no WhatsApp dele. Esquecer fica difícil — e o horário nobre não vira furo.',
            },
        ],
        demo: {
            estudio: 'Barbearia do Vini',
            iniciais: 'BV',
            ramo: 'Cortes e barba · Goiânia',
        },
        servicosDemo: [
            { nome: 'Corte', duracaoMinutos: 30, preco: 'R$ 40' },
            { nome: 'Barba', duracaoMinutos: 30, preco: 'R$ 35' },
            { nome: 'Corte + barba', duracaoMinutos: 60, preco: 'R$ 65' },
            { nome: 'Acabamento (pezinho)', duracaoMinutos: 15, preco: 'R$ 20' },
        ],
        comoFunciona: [
            {
                pergunta: 'Como o cliente agenda?',
                resposta:
                    'Ele abre o seu link — na bio, no status ou fixado no WhatsApp —, escolhe corte, barba ou o combo, vê só os horários livres de verdade e confirma com nome e WhatsApp. Sem cadastro, sem senha, sem baixar aplicativo.',
            },
            {
                pergunta: 'Como você configura?',
                resposta:
                    'Cadastre seus serviços com duração e preço, defina os dias e horários em que atende e marque folgas e feriados. Em poucos minutos o link está no ar, calculando a agenda sozinho.',
            },
            {
                pergunta: 'Como o WhatsApp ajuda?',
                resposta:
                    'No plano Pro, o VamoAgendar se conecta ao seu número e envia confirmação na hora e lembrete antes do horário, com a sua mensagem. O cliente lembra do corte — e você não solta a máquina pra cobrar confirmação.',
            },
            {
                pergunta: 'O que o VamoAgendar não tenta ser?',
                resposta:
                    'Não é sistema de barbearia com várias cadeiras e vários barbeiros — é feito para quem atende sozinho. Não cobra o cliente pelo app: o pagamento do corte continua do seu jeito. E não é aplicativo para instalar: é um link seu, que abre em qualquer celular.',
            },
        ],
        seo: {
            title: 'Agendamento online para barbeiro | VamoAgendar',
            description:
                'Link de agendamento para barbeiros: o cliente marca corte, barba ou combo sozinho, sem cadastro — e o lembrete automático do plano Pro reduz as faltas.',
        },
    },
}
