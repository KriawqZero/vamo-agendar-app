import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashTenantId } from '@/lib/analytics/tenant';
import { reportarExcecao } from '@/lib/observabilidade/reportar';

interface ResendEventPayload {
  type?: string;
  event?: string;
  data?: {
    email_id?: string;
    source_id?: string;
    id?: string;
    [key: string]: unknown;
  };
}

export async function POST(req: NextRequest) {
  const svixId = req.headers.get('svix-id') || req.headers.get('webhook-id');
  const svixTimestamp = req.headers.get('svix-timestamp') || req.headers.get('webhook-timestamp');
  const svixSignature = req.headers.get('svix-signature') || req.headers.get('webhook-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { erro: 'Headers de verificação de webhook ausentes' },
      { status: 401 }
    );
  }

  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json(
      { erro: 'RESEND_WEBHOOK_SECRET não configurado' },
      { status: 503 }
    );
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ erro: 'Erro ao ler corpo da requisição' }, { status: 400 });
  }

  let evento: ResendEventPayload | undefined;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy');
    evento = resend.webhooks.verify({
      payload: rawBody,
      webhookSecret,
      headers: {
        id: svixId,
        timestamp: svixTimestamp,
        signature: svixSignature,
      },
    }) as unknown as ResendEventPayload;
  } catch {
    return NextResponse.json({ erro: 'Assinatura de webhook inválida' }, { status: 401 });
  }

  // Mapeia eventos de supressão / hard bounce
  const tipoEvento = evento?.type || evento?.event;
  if (tipoEvento === 'suppression.added' || tipoEvento === 'email.bounced') {
    const data = evento?.data || {};
    const resendId = data.email_id || data.source_id || data.id;

    if (!resendId) {
      // source_id nulo -> responde 200 OK sem I/O
      return NextResponse.json({ ok: true, processado: false }, { status: 200 });
    }

    // Busca o tenant associado via tb_email_log
    const supabase = createAdminClient();
    const { data: logEntry } = await supabase
      .from('tb_email_log')
      .select('tenant_id')
      .eq('resend_id', resendId)
      .maybeSingle();

    if (logEntry?.tenant_id) {
      const tenantHash = hashTenantId(logEntry.tenant_id);
      // NUNCA-PII: apenas o rótulo estático e o hash pseudonimizador do tenant entram na telemetria
      reportarExcecao(new Error('resend:supressao_adicionada'), {
        tenantHash,
        tipoEvento,
      });
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
