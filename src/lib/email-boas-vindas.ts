import React from 'react';
import { render } from 'react-email';
import { BoasVindas } from '../emails/BoasVindas';
import { enviarEmail, ResultadoEmail } from './email/enviar';
import { createAdminClient } from './supabase/admin';

export interface ParametrosGarantirEnvioBoasVindas {
  tenantId: string;
  email: string;
  replyTo?: string;
  nomeProfissional: string;
  nomeEstabelecimento: string;
  slug: string;
  urlBase?: string;
}

export type ResultadoEnvioBoasVindas =
  | { ok: true; id?: string; ignoradoPorIdempotencia?: boolean }
  | { ok: false; motivo: string };

export async function garantirEnvioBoasVindas(
  params: ParametrosGarantirEnvioBoasVindas
): Promise<ResultadoEnvioBoasVindas> {
  const chaveIdempotencia = `boas-vindas/${params.tenantId}`;
  const supabase = createAdminClient();

  // 1. Tenta registrar o disparo pendente para travar concorrência
  const { data: logExistente, error: erroInsert } = await supabase
    .from('tb_email_log')
    .insert({
      tenant_id: params.tenantId,
      chave_idempotencia: chaveIdempotencia,
      tipo_email: 'boas-vindas',
      status: 'pendente',
      tentativas: 1,
    })
    .select('id, status')
    .single();

  if (erroInsert) {
    // 23505 = erro de chave única (já existe disparo pendente ou enviado ativo)
    if (erroInsert.code === '23505') {
      return { ok: true, ignoradoPorIdempotencia: true };
    }
    // Erro inesperado na tabela de log
    return { ok: false, motivo: `erro_banco: ${erroInsert.code || erroInsert.message}` };
  }

  const logId = logExistente.id;

  try {
    // 2. Renderiza o template React Email
    const html = await render(
      React.createElement(BoasVindas, {
        nomeProfissional: params.nomeProfissional,
        nomeEstabelecimento: params.nomeEstabelecimento,
        slug: params.slug,
        urlBase: params.urlBase,
      })
    );

    // 3. Dispara o e-mail via wrapper de transporte
    const replyToDestino = params.replyTo?.trim() || params.email;

    const res: ResultadoEmail = await enviarEmail({
      nomeEstabelecimento: params.nomeEstabelecimento,
      para: params.email,
      replyTo: replyToDestino,
      assunto: 'Bem-vindo ao VamoAgendar! Sua agenda online está pronta',
      html,
      idempotencyKey: chaveIdempotencia,
    });

    if (res.ok) {
      await supabase
        .from('tb_email_log')
        .update({
          status: 'enviado',
          resend_id: res.id,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', logId);

      return { ok: true, id: res.id };
    } else {
      await supabase
        .from('tb_email_log')
        .update({
          status: 'falhou',
          erro: res.motivo,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', logId);

      return { ok: false, motivo: res.motivo };
    }
  } catch (err) {
    const mensagemErro = err instanceof Error ? err.message : String(err);
    await supabase
      .from('tb_email_log')
      .update({
        status: 'falhou',
        erro: mensagemErro,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', logId);

    return { ok: false, motivo: 'falha_excecao' };
  }
}
