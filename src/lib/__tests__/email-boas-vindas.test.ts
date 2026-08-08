import { describe, expect, it, vi, beforeEach } from 'vitest';
import { garantirEnvioBoasVindas } from '../email-boas-vindas';
import * as enviarModule from '../email/enviar';
import * as adminModule from '../supabase/admin';

vi.mock('../email/enviar', () => ({
  enviarEmail: vi.fn(),
}));

vi.mock('../supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

describe('garantirEnvioBoasVindas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispara o e-mail de boas-vindas com sucesso na primeira tentativa', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'log-uuid-1', status: 'pendente' },
          error: null,
        }),
      }),
    });

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    vi.mocked(adminModule.createAdminClient).mockReturnValue({
      from: (tabela: string) => {
        if (tabela === 'tb_email_log') {
          return { insert: mockInsert, update: mockUpdate };
        }
        return {};
      },
    } as any);

    vi.mocked(enviarModule.enviarEmail).mockResolvedValue({
      ok: true,
      id: 'resend-msg-123',
    });

    const res = await garantirEnvioBoasVindas({
      tenantId: 'tenant-123',
      email: 'barbeiro@exemplo.com',
      nomeProfissional: 'Marcilio',
      nomeEstabelecimento: 'Barbearia Top',
      slug: 'barbearia-top',
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.id).toBe('resend-msg-123');
    }
    expect(enviarModule.enviarEmail).toHaveBeenCalledTimes(1);
    expect(enviarModule.enviarEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        para: 'barbeiro@exemplo.com',
        replyTo: 'barbeiro@exemplo.com',
        idempotencyKey: 'boas-vindas/tenant-123',
      })
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'enviado',
        resend_id: 'resend-msg-123',
      })
    );
  });

  it('ignora silenciosamente o disparo se a chave de idempotência já existir (erro 23505)', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: '23505', message: 'duplicate key value' },
        }),
      }),
    });

    vi.mocked(adminModule.createAdminClient).mockReturnValue({
      from: () => ({ insert: mockInsert }),
    } as any);

    const res = await garantirEnvioBoasVindas({
      tenantId: 'tenant-123',
      email: 'barbeiro@exemplo.com',
      nomeProfissional: 'Marcilio',
      nomeEstabelecimento: 'Barbearia Top',
      slug: 'barbearia-top',
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ignoradoPorIdempotencia).toBe(true);
    }
    expect(enviarModule.enviarEmail).not.toHaveBeenCalled();
  });

  it('atualiza status para falhou quando o envio de e-mail falha', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'log-uuid-2', status: 'pendente' },
          error: null,
        }),
      }),
    });

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    vi.mocked(adminModule.createAdminClient).mockReturnValue({
      from: () => ({ insert: mockInsert, update: mockUpdate }),
    } as any);

    vi.mocked(enviarModule.enviarEmail).mockResolvedValue({
      ok: false,
      motivo: 'falha_transporte',
    });

    const res = await garantirEnvioBoasVindas({
      tenantId: 'tenant-123',
      email: 'barbeiro@exemplo.com',
      nomeProfissional: 'Marcilio',
      nomeEstabelecimento: 'Barbearia Top',
      slug: 'barbearia-top',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.motivo).toBe('falha_transporte');
    }
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'falhou',
        erro: 'falha_transporte',
      })
    );
  });
});
