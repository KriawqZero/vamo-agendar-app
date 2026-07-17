---
status: temporario
gerado: 2026-07-16 00:05
agente: orquestrador
modelo: fable-5
---

# O que você precisa saber (leitura de 5 minutos)

Versão sem tecniquês da auditoria. Cada seção aponta o arquivo com o detalhe, se um dia quiser.

## 1. O banco está aberto pra qualquer um — resolver antes de tudo

Hoje, qualquer pessoa com um mínimo de conhecimento técnico consegue, **sem login nenhum**:

- ler a agenda completa de todos os estabelecimentos da plataforma;
- criar agendamentos e clientes falsos em qualquer estabelecimento, ignorando a checagem de horário livre.

O site valida tudo certinho, mas dá pra conversar direto com o banco por fora do site, e as regras de acesso (RLS) estão permissivas demais. De quebra: o webhook de lembrete aceita uma senha padrão de fábrica se a variável de ambiente faltar, e o token do WhatsApp de cada cliente vaza pro navegador.

Você já sabia de parte disso (está no PENDENCIAS como "antes do lançamento") — a auditoria confirma que **segue tudo em aberto**. Enquanto existir, não pode haver cliente real. → [[03-seguranca]]

## 2. Dois clientes podem pegar o mesmo horário

A proteção contra agendamento duplo é só no código: duas pessoas confirmando ao mesmo tempo passam as duas. Falta uma trava no próprio banco. É o tipo de bug que destrói a confiança no produto na primeira vez que acontece de verdade. → [[04-banco]]

## 3. Dois bugs bobos que custam cliente agora

- A tela de agendamento promete "WhatsApp **ou** e-mail", mas por baixo só aceita telefone. Quem preenche só e-mail leva um erro genérico **no último passo** — exatamente onde não se pode perder ninguém.
- O telefone do estabelecimento nunca aparece na página de agendamento. O cliente que agendou não tem como cancelar, remarcar nem avisar nada → vira no-show.

Os dois são consertos pequenos. → [[05-ux-produto]]

## 4. Não existe cobrança

Asaas tem **zero linha de código** no projeto. Não há como receber um real de ninguém hoje. É o maior bloco de trabalho pendente e o único realmente grande. → [[07-features]]

## 5. O "WhatsApp-first" precisa de honestidade

Hoje o produto só **envia** WhatsApp (confirmação e lembrete); não recebe nada de volta. E lembrete por WhatsApp todo concorrente grande já tem — isso não vende sozinho.

O diferencial real que você tem e **ninguém no mercado oferece**: WhatsApp incluso na mensalidade, sem cobrar por mensagem. Todos os concorrentes cobram pacote/crédito à parte, e "cobrança inesperada" é a reclamação nº 1 do setor. Como sua Evolution é self-hosted, mensagem custa ≈ zero pra você. É esse o argumento de venda. → [[06-mercado]]

## 6. Preço: o de hoje sinaliza amadorismo

R$ 9,90/14,90 está 5–8x abaixo do mercado (a entrada do setor é R$ 40–80/mês). Preço baixo demais não parece barato — parece produto de fundo de garagem, e é uma âncora cara de subir depois.

Recomendação da auditoria: matar o plano Plus e ter **um plano só** — Pro a **R$ 59,90/mês** (anual R$ 599, preço de fundador R$ 39,90 pros ~50 primeiros), **14 dias grátis sem cartão**, e quem não assina cai pra uma vitrine sem WhatsApp. Com **5 assinantes** a infra inteira está paga. → [[08-precificacao]]

## A ordem do que fazer

1. Fechar o banco (regras RLS + webhook + token que vaza) — seção 1
2. Trava de agendamento duplo + índices no banco — seção 2
3. Bug do telefone/e-mail + telefone visível na página — seção 3
4. Checkout Asaas, já com cancelamento fácil embutido — seção 4
5. Ajustar o preço **antes** do primeiro cliente — seção 6

Tudo é execução conhecida e majoritariamente pequena; só o item 4 é grande.

## O que está bom (de verdade, não consolo)

Dashboard maduro e genuinamente bom no celular; agendamento público sem fricção de verdade; mensageria bem construída; schema do banco organizado, sem gambiarra; custo por cliente ≈ zero — a margem em escala é excelente. A base do produto é boa. O que falta é fundação (segurança e cobrança), não retrabalho.

Nota solta: o CLAUDE.md diz que o projeto não tem testes — tem, 32 passando. Vale atualizar os docs pra não confundir as próximas sessões.
