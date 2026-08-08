export type EmailLogStatus = 'pendente' | 'enviado' | 'falhou';

export interface TbEmailLog {
  id: string;
  tenant_id: string;
  chave_idempotencia: string;
  tipo_email: string;
  status: EmailLogStatus;
  resend_id: string | null;
  erro: string | null;
  tentativas: number;
  criado_em: string;
  atualizado_em: string;
}

export interface TbEmailLogInsert {
  id?: string;
  tenant_id: string;
  chave_idempotencia: string;
  tipo_email: string;
  status: EmailLogStatus;
  resend_id?: string | null;
  erro?: string | null;
  tentativas?: number;
  criado_em?: string;
  atualizado_em?: string;
}

export interface TbEmailLogUpdate {
  id?: string;
  tenant_id?: string;
  chave_idempotencia?: string;
  tipo_email?: string;
  status?: EmailLogStatus;
  resend_id?: string | null;
  erro?: string | null;
  tentativas?: number;
  criado_em?: string;
  atualizado_em?: string;
}
