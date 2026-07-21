# Requirements: VamoAgendar — Lançamento Público

**Defined:** 2026-07-20
**Core Value:** Um agendamento real, feito por um cliente final que nunca ouviu falar do VamoAgendar, cair na agenda do profissional sem que nada quebre no caminho.

## v1 Requirements

Requisitos para abrir o produto ao público. O produto já está construído — estes são os
requisitos que faltam para receber tráfego real com segurança.

### Rede de proteção do banco

- [ ] **BKP-01**: Owner consegue restaurar o banco a partir de um dump próprio, verificado por restauração real em ambiente descartável
- [ ] **BKP-02**: Nenhuma migration destrutiva é aplicada sem um dump imediatamente anterior
- [ ] **BKP-03**: O projeto Supabase não é pausado por inatividade (keep-alive periódico)

### Superfície pública e integridade multi-tenant

- [ ] **SEG-01**: Visitante anônimo não consegue inserir agendamento nem cliente direto na Data API, contornando a Server Action
- [ ] **SEG-02**: `perfis_empresas` deixa de ser enumerável — a lista de profissionais da plataforma não é obtível com a chave publicável
- [ ] **SEG-03**: `agendamentos` e `excecoes_agenda` expõem a `anon` apenas as colunas que a engine de disponibilidade consome
- [ ] **SEG-04**: Coluna nova em tabela com leitura pública nasce sem acesso `anon` por padrão (regra escrita e privilégio revogado por default)
- [ ] **SEG-05**: Webhook de lembrete só aceita requisições com assinatura válida do QStash; a aplicação não sobe sem as chaves configuradas

### Correção da agenda

- [ ] **AGE-01**: Um agendamento guarda o próprio horário de término, imune a edições posteriores da duração do serviço
- [ ] **AGE-02**: Serviço desativado não faz a engine assumir duração arbitrária ao calcular ocupação
- [ ] **AGE-03**: Duas requisições simultâneas para o mesmo intervalo nunca resultam em dois agendamentos ativos sobrepostos
- [ ] **AGE-04**: Ao perder a corrida, o cliente final vê mensagem amigável — nunca erro do banco com dados de outro tenant
- [ ] **AGE-05**: Dois clientes com o mesmo telefone no mesmo tenant nunca viram registros duplicados

### Anti-abuso

- [ ] **ABU-01**: Script repetindo requisições não consegue lotar a agenda de um profissional
- [ ] **ABU-02**: Cliente legítimo não percebe nenhuma fricção nova (sem CAPTCHA, sem etapa extra)
- [ ] **ABU-03**: Owner consegue ver se o limite está barrando gente legítima

### Diferencial visível

- [ ] **DIF-01**: Profissional vê quantos horários invendáveis a grade anti-buraco evitou na agenda dele
- [ ] **DIF-02**: Profissional consegue exibir todos os horários quando quiser ignorar a regra anti-buraco

### Planos e preço

- [ ] **PLA-01**: O plano Plus não existe mais no produto nem no banco
- [ ] **PLA-02**: Pro custa R$ 39,90; quem assina até 02/02/2027 paga R$ 29,90 permanentemente
- [ ] **PLA-03**: O preço travado sobrevive a cancelamento e nova assinatura do mesmo tenant
- [ ] **PLA-04**: O percentual de desconto exibido é derivado dos preços reais, nunca escrito à mão

### Cobrança

- [ ] **COB-01**: Profissional informa CPF ou CNPJ no cadastro, validado antes de chegar ao Asaas
- [ ] **COB-02**: Profissional assina o Pro sozinho pelo dashboard, sem intervenção do owner
- [ ] **COB-03**: Cliques repetidos em "assinar" nunca geram duas cobranças
- [ ] **COB-04**: O plano só é liberado quando o pagamento é confirmado — nenhum caminho permite um tenant se auto-promover
- [ ] **COB-05**: O mesmo evento do Asaas entregue duas vezes não duplica efeito
- [ ] **COB-06**: Uma falha de e-mail ou de terceiro nunca derruba o processamento de cobrança
- [ ] **COB-07**: Owner consegue virar de sandbox para produção seguindo um checklist escrito, sem risco de cobrar de verdade achando que é teste
- [ ] **COB-08**: Assinante inadimplente é rebaixado após 10 dias, em degraus (aviso → e-mail → downgrade), sem destruir dados de personalização

### Comunicação por e-mail

- [ ] **EML-01**: Profissional recebe e-mail de boas-vindas com o link de agendamento pronto para compartilhar
- [ ] **EML-02**: Profissional recebe recibo do VamoAgendar quando a assinatura é confirmada
- [ ] **EML-03**: Cliente final recebe confirmação do agendamento por e-mail
- [ ] **EML-04**: E-mails chegam identificados pelo estabelecimento, com resposta indo para o profissional
- [ ] **EML-05**: O produto funciona normalmente sem credencial de e-mail configurada (no-op silencioso)
- [ ] **EML-06**: Endereço inválido não degrada a reputação do domínio (supressão de bounce)

### Booking público

- [ ] **BOO-01**: Cliente final pode agendar informando e-mail **ou** WhatsApp — pelo menos um dos dois
- [ ] **BOO-02**: A tela de sucesso aparece assim que o agendamento é gravado, sem esperar envio de mensagem
- [ ] **BOO-03**: Cliente que já agendou antes é reconhecido por qualquer um dos contatos, sem criar duplicata

### Autonomia do cliente final

Table stakes que toda a concorrência entrega. Resolvido preservando a Fricção Zero: link
individual assinado, enviado junto da confirmação e do lembrete — sem conta, sem senha,
sem código.

- [ ] **AUT-01**: Cliente final abre o próprio agendamento por um link recebido, sem login, cadastro ou código
- [ ] **AUT-02**: Cliente final cancela o agendamento por esse link, e o horário volta a ficar disponível imediatamente
- [ ] **AUT-03**: Cliente final remarca escolhendo um novo horário na mesma tela, sem precisar refazer o agendamento
- [ ] **AUT-04**: Remarcação nunca gera sobreposição — passa pela mesma validação do agendamento normal
- [ ] **AUT-05**: Profissional define a antecedência mínima para o cliente cancelar ou remarcar sozinho
- [ ] **AUT-06**: Passado o prazo, o link mostra o contato do estabelecimento em vez de permitir a ação
- [ ] **AUT-07**: O lembrete é cancelado ou realinhado conforme a ação do cliente
- [ ] **AUT-08**: Profissional fica sabendo do cancelamento ou da remarcação pela agenda e por e-mail
- [ ] **AUT-09**: O link serve a um único agendamento, não é adivinhável e não dá acesso a nenhum outro dado

### Obrigações de lançamento

- [ ] **JUR-01**: Termos de uso e política de privacidade publicados, nomeando os subprocessadores reais e a base legal por finalidade
- [ ] **JUR-02**: Cliente e profissional têm canal de suporte visível no produto
- [ ] **JUR-03**: Pedido de exclusão de dados é atendível sem destruir a agenda do profissional

### Operação e go-live

- [ ] **OPE-01**: Owner vê num só lugar se o sistema está saudável: instâncias de WhatsApp conectadas, disparos com erro nas últimas 24h, agendamentos do dia e último evento de cobrança recebido
- [ ] **OPE-02**: Exceções não tratadas em produção chegam ao owner sem depender de alguém reclamar
- [ ] **OPE-03**: Métricas de funil chegando em produção, verificadas com evento real
- [ ] **OPE-04**: Banco de produção sem dados de teste, preservando um tenant do owner claramente identificado
- [ ] **OPE-05**: Migrations aplicadas passam a ser imutáveis (fase DEV encerrada)

### Ativação dos primeiros usuários

- [ ] **ATI-01**: Primeiros profissionais convidados em ritmo escalonado, sem vários números de WhatsApp novos disparando na mesma semana
- [ ] **ATI-02**: Owner assina o próprio produto com pagamento real antes do primeiro convite
- [ ] **ATI-03**: Owner tem um caminho para coletar feedback dos primeiros usuários dentro do produto

## v2 Requirements

Reconhecidos e adiados. Não entram neste roadmap.

### Canal oficial da plataforma

- **CAN-01**: VamoAgendar fala com o profissional por WhatsApp (cancelamentos, faturas, avisos) usando a **API oficial da Meta**, não a Evolution — um número da plataforma disparando para toda a base via Baileys concentraria o maior risco de banimento do produto
- **CAN-02**: Profissional escolhe quais avisos quer receber por WhatsApp

### Pagamento do serviço

- **PAG-01**: Profissional pode exigir sinal ou pagamento antecipado via PIX para confirmar o agendamento

### Operação

- **OPS-01**: Owner reconcilia assinaturas divergentes sob demanda, comparando com o Asaas
- **OPS-02**: Faturamento previsto do mês visível no dashboard do profissional

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cobrança anual | Só mensal por ora — simplifica o checkout para uma única assinatura mensal e nada indica demanda |
| Cobrança em produção no go-live | A conta Asaas só tem sandbox; a virada de chave acontece quando a verificação aprovar, sem retrabalho |
| Diferencial competitivo novo | Criar um leva mais que este milestone; o que existe (grade anti-buraco) entra no escopo apenas para ser tornado visível |
| Backup gerenciado do banco | Supabase permanece no plano Free por decisão do owner; mitigado por dump próprio |
| Multi-profissional e multi-filial | Em "Depois de evidência" — gatilho é profissional real deixando de adotar por essa ausência |
| Migração para WhatsApp Cloud API oficial | Gatilho é validação do canal com pilotos reais mais crescimento de volume |
| App nativo | Gatilho é retenção comprovada no mobile web mais pedido recorrente |
| Tráfego pago | Divulgação orgânica primeiro; mídia paga só depois que o funil mostrar conversão |
| Controle financeiro, estoque, CRM avançado, marketplace | O produto não tenta ser ERP (`docs/05`) |

## Traceability

Preenchida na criação do roadmap (2026-07-20). Cada requisito v1 mapeia para **exatamente
uma** fase de `.planning/ROADMAP.md`.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BKP-01 | Phase 1 | Pending |
| BKP-02 | Phase 1 | Pending |
| BKP-03 | Phase 1 | Pending |
| SEG-01 | Phase 2 | Pending |
| SEG-02 | Phase 2 | Pending |
| SEG-03 | Phase 2 | Pending |
| SEG-04 | Phase 2 | Pending |
| SEG-05 | Phase 2 | Pending |
| AGE-01 | Phase 3 | Pending |
| AGE-02 | Phase 3 | Pending |
| AGE-03 | Phase 3 | Pending |
| AGE-04 | Phase 3 | Pending |
| AGE-05 | Phase 3 | Pending |
| ABU-01 | Phase 4 | Pending |
| ABU-02 | Phase 4 | Pending |
| ABU-03 | Phase 4 | Pending |
| DIF-01 | Phase 7 | Pending |
| DIF-02 | Phase 7 | Pending |
| PLA-01 | Phase 8 | Pending |
| PLA-02 | Phase 8 | Pending |
| PLA-03 | Phase 8 | Pending |
| PLA-04 | Phase 8 | Pending |
| COB-01 | Phase 10 | Pending |
| COB-02 | Phase 10 | Pending |
| COB-03 | Phase 10 | Pending |
| COB-04 | Phase 10 | Pending |
| COB-05 | Phase 10 | Pending |
| COB-06 | Phase 10 | Pending |
| COB-07 | Phase 10 | Pending |
| COB-08 | Phase 10 | Pending |
| EML-01 | Phase 5 | Pending |
| EML-02 | Phase 10 | Pending |
| EML-03 | Phase 6 | Pending |
| EML-04 | Phase 5 | Pending |
| EML-05 | Phase 5 | Pending |
| EML-06 | Phase 5 | Pending |
| BOO-01 | Phase 6 | Pending |
| BOO-02 | Phase 6 | Pending |
| BOO-03 | Phase 6 | Pending |
| AUT-01 | Phase 9 | Pending |
| AUT-02 | Phase 9 | Pending |
| AUT-03 | Phase 9 | Pending |
| AUT-04 | Phase 9 | Pending |
| AUT-05 | Phase 9 | Pending |
| AUT-06 | Phase 9 | Pending |
| AUT-07 | Phase 9 | Pending |
| AUT-08 | Phase 9 | Pending |
| AUT-09 | Phase 9 | Pending |
| JUR-01 | Phase 11 | Pending |
| JUR-02 | Phase 11 | Pending |
| JUR-03 | Phase 11 | Pending |
| OPE-01 | Phase 12 | Pending |
| OPE-02 | Phase 12 | Pending |
| OPE-03 | Phase 12 | Pending |
| OPE-04 | Phase 12 | Pending |
| OPE-05 | Phase 12 | Pending |
| ATI-01 | Phase 13 | Pending |
| ATI-02 | Phase 13 | Pending |
| ATI-03 | Phase 13 | Pending |

### Por fase

| Phase | Nome | Requisitos | Qtd |
|-------|------|------------|-----|
| 1 | Rede de proteção do banco | BKP-01, BKP-02, BKP-03 | 3 |
| 2 | Hardening da superfície pública | SEG-01, SEG-02, SEG-03, SEG-04, SEG-05 | 5 |
| 3 | Integridade da agenda | AGE-01, AGE-02, AGE-03, AGE-04, AGE-05 | 5 |
| 4 | Anti-abuso no booking público | ABU-01, ABU-02, ABU-03 | 3 |
| 5 | Canal de e-mail transacional | EML-01, EML-04, EML-05, EML-06 | 4 |
| 6 | Contato flexível no booking | EML-03, BOO-01, BOO-02, BOO-03 | 4 |
| 7 | Diferencial visível — agenda densa | DIF-01, DIF-02 | 2 |
| 8 | Fim do Plus e preço correto | PLA-01, PLA-02, PLA-03, PLA-04 | 4 |
| 9 | Autonomia do cliente final | AUT-01, AUT-02, AUT-03, AUT-04, AUT-05, AUT-06, AUT-07, AUT-08, AUT-09 | 9 |
| 10 | Cobrança automática ponta a ponta | COB-01, COB-02, COB-03, COB-04, COB-05, COB-06, COB-07, COB-08, EML-02 | 9 |
| 11 | Obrigações jurídicas e LGPD executável | JUR-01, JUR-02, JUR-03 | 3 |
| 12 | Observabilidade e go-live | OPE-01, OPE-02, OPE-03, OPE-04, OPE-05 | 5 |
| 13 | Ativação dos primeiros profissionais | ATI-01, ATI-02, ATI-03 | 3 |

**Coverage:**
- v1 requirements: 59 total
- Mapped to phases: 59
- Unmapped: 0 ✓

**Nota sobre a categoria EML:** os seis requisitos de e-mail estão distribuídos em três
fases porque só assim viram critério verificável. EML-03 (confirmação ao cliente final)
depende do booking coletar e-mail, o que acontece na Phase 6 — hoje o campo não existe na
UI pública. EML-02 (recibo da assinatura) dispara a partir do webhook de cobrança, na
Phase 10, e a pesquisa é explícita que o recibo não pode viver no caminho síncrono do
billing. Os demais (EML-01, EML-04, EML-05, EML-06) são a infraestrutura de envio e ficam
na Phase 5.

---
*Requirements defined: 2026-07-20*
*Last updated: 2026-07-20 after roadmap creation*
