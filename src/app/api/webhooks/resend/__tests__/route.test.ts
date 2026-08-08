import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';
import * as adminModule from '@/lib/supabase/admin';
import * as reportarModule from '@/lib/observabilidade/reportar';

const verifyMock = vi.fn((options: any) => {
  if (options.webhookSecret !== 'whsec_valido') {
    throw new Error('Assinatura inválida');
  }
  if (options.headers?.signature === 'sig_invalida') {
    throw new Error('Assinatura inválida');
  }
  if (options.headers?.id === 'msg_sem_source') {
    return {
      type: 'suppression.added',
      data: { email: 'vazado@exemplo.com', email_id: null },
    };
  }
  return {
    type: 'suppression.added',
    data: {
      email: 'cliente-sigiloso@exemplo.com',
      email_id: 'resend-123',
    },
  };
});

vi.mock('resend', () => {
  return {
    Resend: class {
      webhooks = {
        verify: verifyMock,
      };
    },
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/observabilidade/reportar', () => ({
  reportarExcecao: vi.fn(),
}));

describe('Route Handler POST /api/webhooks/resend', () => {
  const envOriginal = process.env.RESEND_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_valido';
  });

  afterEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = envOriginal;
  });

  it('retorna 401 se os headers de verificação do Svix estiverem ausentes', async () => {
    const req = new NextRequest('http://localhost/api/webhooks/resend', {
      method: 'POST',
      body: JSON.stringify({ type: 'suppression.added' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.erro).toContain('Headers de verificação de webhook ausentes');
  });

  it('retorna 503 se RESEND_WEBHOOK_SECRET não estiver configurado', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;

    const req = new NextRequest('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'svix-id': 'id_123',
        'svix-timestamp': '12345678',
        'svix-signature': 'v1,sig123',
      },
      body: JSON.stringify({ type: 'suppression.added' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  it('retorna 401 para assinatura inválida', async () => {
    const req = new NextRequest('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'svix-id': 'id_123',
        'svix-timestamp': '12345678',
        'svix-signature': 'sig_invalida',
      },
      body: JSON.stringify({ type: 'suppression.added' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('retorna 200 sem I/O quando source_id é nulo', async () => {
    const req = new NextRequest('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'svix-id': 'msg_sem_source',
        'svix-timestamp': '12345678',
        'svix-signature': 'v1,valida',
      },
      body: JSON.stringify({ type: 'suppression.added' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processado).toBe(false);
  });

  it('processa supressão válida com cruzamento NUNCA-PII', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { tenant_id: 'org_tenant_abc123' },
      error: null,
    });

    vi.mocked(adminModule.createAdminClient).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
    } as any);

    const req = new NextRequest('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'svix-id': 'msg_valida',
        'svix-timestamp': '12345678',
        'svix-signature': 'v1,valida',
      },
      body: JSON.stringify({
        type: 'suppression.added',
        data: { email: 'cliente-sigiloso@exemplo.com', email_id: 'resend-123' },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    // Afirmação NUNCA-PII: o e-mail 'cliente-sigiloso@exemplo.com' NUNCA deve ser passado ao logger/Sentry
    expect(reportarModule.reportarExcecao).toHaveBeenCalledTimes(1);
    const [erro, meta] = vi.mocked(reportarModule.reportarExcecao).mock.calls[0];

    expect((erro as Error).message).toBe('resend:supressao_adicionada');
    expect(JSON.stringify(meta)).not.toContain('cliente-sigiloso@exemplo.com');
  });
});
