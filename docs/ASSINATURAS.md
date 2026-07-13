# 💳 Testes e Simulações de Assinatura

_Snippets úteis extraídos de `docs/07-PLANOS_E_MONETIZACAO.md` para facilitar testes de desenvolvimento._

---

## 🔄 Status da Assinatura

### Simular Inadimplência
Mantém os benefícios da assinatura, mas exibe o banner vermelho no sistema.
```sql
UPDATE assinaturas 
SET status = 'inadimplente'
WHERE tenant_id = 'org_3GQ4ocNNd4Fm6cmgzoCynvxXOxQ';
```

### Voltar a ficar em dia (Ativa)
```sql
UPDATE assinaturas 
SET status = 'ativa'
WHERE tenant_id = 'org_3GQ4ocNNd4Fm6cmgzoCynvxXOxQ';
```

---

## 🚀 Trocas de Plano

### Upgrade para Plano Plus
```sql
UPDATE assinaturas 
SET plano = 'plus', valor = 9.90
WHERE tenant_id = 'org_3GQ4ocNNd4Fm6cmgzoCynvxXOxQ';
```

### Downgrade para Plano Gratuito

> **Nota:** O plano Gratuito significa a **ausência** de uma linha ativa ou inadimplente na tabela para aquele `tenant`.

**Opção 1: Cancelar a assinatura**
```sql
UPDATE assinaturas 
SET status = 'cancelada'
WHERE tenant_id = 'org_3GQ4ocNNd4Fm6cmgzoCynvxXOxQ';
```

**Opção 2: Apagar o registro (Mais limpo para testes)**
```sql
DELETE FROM assinaturas
WHERE tenant_id = 'org_3GQ4ocNNd4Fm6cmgzoCynvxXOxQ';
```

---

## 💡 Lembretes e Boas Práticas

- **Reassinar após Cancelamento:** Se você cancelou (`status = 'cancelada'`) e quer assinar de novo manualmente, prefira executar o `DELETE` (Opção 2) e fazer um novo `INSERT`. 
  - *Motivo:* O índice único do banco só permite **uma** linha `ativa`/`inadimplente` por `tenant`, mas linhas `cancelada` podem se acumular se não houver cuidado.
- **Visualizar no Dashboard:** O painel frontend busca o status do plano a cada renderização. Após rodar o SQL, dê um **refresh (F5)** na página para ver a alteração.
