/**
 * Fonte da verdade das landings verticais (/para/[nicho]).
 * Cada nicho conta o MESMO filme da landing principal — um dia narrado no
 * relógio, abrindo pelo resultado (a marcação que chegou sozinha), passando
 * pela conversa que interrompe e fechando com os momentos em que o link
 * trabalha — ambientado na rotina real da profissão, com horários plausíveis.
 * Copy honesta: WhatsApp automático é plano Pro; nada de multi-profissional,
 * pagamento pelo app ou aplicativo nativo.
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
    /** Momento do dia em que o benefício acontece ("07:50") — substitui numeração */
    hora: string
    titulo: string
    texto: string
}

export interface NichoLanding {
    slug: string
    /** "suas clientes" / "seus clientes" — concordância nas frases do template */
    expressaoClientes: string
    /** Abertura do filme: o resultado chega fora do expediente */
    abertura: {
        /** Relógio gigante do hero ("22:31") */
        hora: string
        /** Eyebrow do hero ("sábado, 22:31 — a barbearia já fechou") */
        eyebrow: string
    }
    heroTitulo: string
    /** Fecho do título, renderizado na cor da marca */
    heroDestaque: string
    heroSubtitulo: string
    /** A cena que interrompe: a conversa de agenda no meio do atendimento */
    dor: {
        /** Horário da cena ("10:40") — relógio gigante e rótulo da seção */
        hora: string
        rotulo: string
        conversa: FalaConversa[]
        fecho: string
    }
    /** Momentos do dia em ordem cronológica (o relógio gigante usa o primeiro) */
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
        expressaoClientes: 'suas clientes',
        abertura: {
            hora: '21:58',
            eyebrow: 'terça-feira, 21:58 — o estúdio já fechou',
        },
        heroTitulo: 'Design com henna marcado pra quinta.',
        heroDestaque: 'Você nem pegou o celular.',
        heroSubtitulo:
            'O link na sua bio mostrou os horários realmente livres, a cliente escolheu um e confirmou sozinha — sem cadastro, sem senha, sem você largar o que estava fazendo. O direct fica pro antes e depois.',
        dor: {
            hora: '10:15',
            rotulo: 'no milímetro do fio, o direct chama',
            conversa: [
                { autor: 'cliente', texto: '— Oi! Tem horário pra design com henna essa semana?' },
                { autor: 'voce', texto: '— Tenho quinta 10h ou sexta 16h!' },
                { autor: 'cliente', texto: '— Quinta não consigo… sexta tem mais cedo?' },
                { autor: 'voce', texto: '— Te respondo assim que acabar o atendimento' },
            ],
            fecho: 'Você respondeu essa conversa hoje entre duas clientes. E ontem. E vai responder amanhã — a menos que o link responda por você.',
        },
        beneficios: [
            {
                hora: '08:40',
                titulo: 'O lembrete saiu antes do primeiro design',
                texto: 'No plano Pro, cada cliente recebe a confirmação na hora que marca e um lembrete antes do horário, no WhatsApp dela. Menos falta por esquecimento — sem você digitar nada.',
            },
            {
                hora: '11:20',
                titulo: 'A cliente das 11h não caiu em cima da das 10h',
                texto: 'Design simples, design com henna e brow lamination têm durações diferentes — e a grade só oferece horários em que o serviço escolhido realmente cabe. Sem encavalar cliente.',
            },
            {
                hora: '16:00',
                titulo: 'O direct volta a ser vitrine',
                texto: 'Seu Instagram mostra o antes e depois; o link na bio marca o horário. Você para de negociar agenda por mensagem no meio dos atendimentos.',
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
        expressaoClientes: 'suas clientes',
        abertura: {
            hora: '15:12',
            eyebrow: 'quarta-feira, 15:12 — duas horas de aplicação pela frente',
        },
        heroTitulo: 'Uma manutenção acabou de cair na agenda.',
        heroDestaque: 'Sua pinça nem parou.',
        heroSubtitulo:
            'A cliente de sempre entrou no link, escolheu o horário da manutenção e confirmou sozinha — enquanto você fechava mais um fio a fio. Sem cadastro, sem senha, sem “deixa eu ver aqui e te falo”.',
        dor: {
            hora: '11:05',
            rotulo: 'a remarcação que interrompe a aplicação',
            conversa: [
                { autor: 'cliente', texto: '— Amiga, preciso remarcar a manutenção de amanhã!' },
                { autor: 'voce', texto: '— Tranquilo! Tenho quinta às 14h' },
                { autor: 'cliente', texto: '— Quinta só consigo depois das 17h… tem?' },
                { autor: 'voce', texto: '— Deixa eu conferir a agenda e te falo' },
            ],
            fecho: 'Uma remarcação simples custou três interrupções no meio de um volume russo. Multiplique pelas manutenções de um mês inteiro.',
        },
        beneficios: [
            {
                hora: '08:30',
                titulo: 'O lembrete da sessão de duas horas já saiu',
                texto: 'Uma falta de duas horas é um buraco caro na agenda. No plano Pro, confirmação na hora e lembrete automático no WhatsApp da cliente reduzem o esquecimento — sem você cobrar ninguém.',
            },
            {
                hora: '13:00',
                titulo: 'A manutenção entrou onde ela cabe',
                texto: 'Aplicação de duas horas e manutenção de oitenta minutos não disputam o mesmo espaço: a grade calcula os horários pela duração real de cada serviço e nunca oferece um encaixe que não cabe. Em sessão longa, encaixe errado custa caro.',
            },
            {
                hora: '22:40',
                titulo: 'A cliente marcou; você já tinha ido dormir',
                texto: 'Quem precisa remarcar escolhe o novo horário pelo link, a qualquer hora — e você libera o antigo no painel quando terminar a aplicação. Nenhuma conversa no meio do fio a fio.',
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
        expressaoClientes: 'suas clientes',
        abertura: {
            hora: '20:22',
            eyebrow: 'sexta-feira, 20:22 — a agenda de amanhã se fechando sozinha',
        },
        heroTitulo: 'O sábado acabou de lotar.',
        heroDestaque: 'Você não respondeu ninguém.',
        heroSubtitulo:
            'Seu link mostra só os horários que sobraram de verdade. Quem quer a vaga confirma na hora — e ela some para as outras. Sem cadastro, sem senha, sem “vou ver e te aviso”.',
        dor: {
            hora: '09:40',
            rotulo: 'a vaga que ficou presa no “vou ver e te aviso”',
            conversa: [
                { autor: 'cliente', texto: '— Oi! Consegue me encaixar no sábado?' },
                { autor: 'voce', texto: '— Sábado tenho 8h ou 16h40!' },
                { autor: 'cliente', texto: '— Vou ver com meu marido e te aviso!' },
                { autor: 'voce', texto: '— Fechou? Preciso confirmar pra segurar a vaga…' },
            ],
            fecho: 'Enquanto ela “vê e avisa”, duas vagas ficam presas. No link, quem quer o horário confirma na hora — e ele some para as outras.',
        },
        beneficios: [
            {
                hora: '07:30',
                titulo: 'O lembrete saiu antes da primeira cliente',
                texto: 'No plano Pro, a cliente recebe confirmação na hora e lembrete automático antes do horário, no WhatsApp dela. Esquecer fica difícil — e a sua cadeira não fica vazia.',
            },
            {
                hora: '10:20',
                titulo: 'O alongamento entrou com o tempo dele',
                texto: 'Esmaltação em gel não ocupa o espaço de um alongamento: com a duração certa de cada serviço, a grade encaixa mais clientes no dia sem atropelar ninguém.',
            },
            {
                hora: '16:50',
                titulo: 'A última vaga do sábado saiu sozinha',
                texto: 'O link mostra apenas os horários que ainda estão livres. Quem escolhe, confirma na hora — nada de vaga presa esperando resposta enquanto outra cliente queria o mesmo horário.',
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
        expressaoClientes: 'seus clientes',
        abertura: {
            hora: '22:31',
            eyebrow: 'sábado, 22:31 — a barbearia já fechou',
        },
        heroTitulo: 'Caiu mais um corte na agenda.',
        heroDestaque: 'Você nem viu.',
        heroSubtitulo:
            'Você tava jantando. Seu link mostrou os horários que sobraram do sábado, o cliente escolheu um e a confirmação já chegou no WhatsApp dele — sem cadastro, sem senha, sem você responder nada.',
        dor: {
            hora: '10:40',
            rotulo: 'cliente na cadeira, celular vibrando',
            conversa: [
                { autor: 'cliente', texto: '— E aí! Consegue me encaixar hoje ainda?' },
                { autor: 'voce', texto: '— Hoje só 18h30, fechou?' },
                { autor: 'cliente', texto: '— 18h30 não dá… e amanhã cedo?' },
                { autor: 'voce', texto: '— Te falo quando terminar esse corte' },
            ],
            fecho: 'Cada resposta dessas é a máquina desligada e o cliente da cadeira esperando. Multiplique por um sábado inteiro.',
        },
        beneficios: [
            {
                hora: '07:50',
                titulo: 'O lembrete do primeiro corte já saiu',
                texto: 'No plano Pro, o cliente recebe a confirmação na hora que marca e um lembrete antes do horário, direto no WhatsApp dele. Esquecer fica difícil — e você não digitou nada.',
            },
            {
                hora: '14:00',
                titulo: 'O combo entrou com o tempo certo',
                texto: 'Corte + barba não ocupa o espaço de um corte simples: a grade calcula cada horário pela duração real do serviço e nunca oferece um encaixe que não cabe. O corte das 15h não atrasa.',
            },
            {
                hora: '18:30',
                titulo: 'O horário nobre não virou furo',
                texto: 'Fim de tarde é o horário que todo mundo quer — e o que mais dói quando fica vazio. Quem quer horário abre o link, vê o que sobrou de verdade e confirma na hora. Nada de vaga presa no “te falo depois”.',
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
