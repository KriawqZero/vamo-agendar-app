# 04 - Padrões de Frontend & UI

Este documento estabelece as diretrizes e padrões de desenvolvimento para a interface do usuário (UI) e a lógica de cliente no **VamoAgendar**, usando Next.js 16 (App Router) e Tailwind CSS v4.

---

## 🏛️ React Server Components (RSC) vs Client Components

Seguimos a arquitetura híbrida do Next.js App Router para otimizar a velocidade de carregamento, SEO e consumo de banda:

1. **Server Components (Padrão):**
   * Toda página e componente deve ser um Server Component por padrão.
   * Toda busca de dados (data fetching) inicial do banco de dados deve ser executada no servidor utilizando SSR.
   * Evita o envio de códigos JavaScript desnecessários e expõe dados com segurança direto para o HTML inicial.

2. **Client Components (`'use client'`):**
   * Use a diretiva `'use client'` apenas nas chamadas "ilhas de interatividade".
   * Exemplos de uso aceitáveis: formulários de entrada de dados, etapas interativas de fluxo de agendamento (booking steps), botões com estados dinâmicos e calendários/seletores de data interativos.
   * Mantenha os Client Components o mais abaixo possível na árvore de componentes.

---

## ⚡ Mutações via Server Actions

Para criar, atualizar ou excluir dados do banco, **não crie rotas de API adicionais (como `/api/agendamentos/create`)**. Use Next.js Server Actions nativas.

* **Arquivos de Ações:** Agrupe as ações relacionadas em arquivos dedicados na pasta `src/app/actions/` (ex: `agendamentos.ts`, `clientes.ts`).
* **Segurança no Servidor:** Valide a autorização de forma autônoma dentro da action usando o SDK do Clerk (`auth()`) e deixe o RLS agir no Supabase.
* **Validação de Inputs:** Sempre valide e limpe os dados recebidos na Server Action antes de passá-los para o cliente Supabase.

---

## 🎨 Estilização e Design System com Tailwind CSS v4

O visual do **VamoAgendar** deve ser premium, limpo e extremamente focado na usabilidade de dispositivos móveis (*mobile-first*).

1. **Responsividade Mobile-First:**
   * Profissionais autônomos e clientes finais usam a aplicação majoritariamente em smartphones.
   * Toda tela ou componente deve ser perfeitamente visualizado e operável em telas pequenas. Use layouts flexíveis, grids responsivos e paddings adequados para toques de dedos.

2. **Uso de Variáveis do Tailwind v4:**
   * Evite inline styles e CSS customizado arbitrário.
   * Use o sistema de design integrado do Tailwind v4 para manter consistência em cores, sombras, cantos arredondados e transições de estado (hover, focus, disabled).

3. **Micro-interações:**
   * Adicione efeitos de transição suaves em botões, inputs e links (`transition-all duration-200`).
   * Forneça feedbacks visuais claros de estados pendentes (ex: `disabled` ou *spinners* de loading durante a submissão de formulários com o hook `useActionState` ou `useFormStatus` do React 19).
