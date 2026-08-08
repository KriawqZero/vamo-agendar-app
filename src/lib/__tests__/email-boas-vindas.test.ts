import { describe, expect, it, vi, beforeEach } from 'vitest';
import { garantirEnvioBoasVindas } from '../email-boas-vindas';
import * as adminModule from '@/lib/supabase/admin';
import * as enviarModule from '@/lib/email/enviar';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/email/enviar', () => ({
  enviarEmail: vi.fn(),
}));

describe('garantirEnvioBoasVindas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna idempotência se a chave única 23505 for violada no INSERT', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: () => ({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint' },
        }),
      }),
    });

    vi.mocked(adminModule.createAdminClient).mockReturnValue({
      from: () => ({ insert: mockInsert }),
    } as unknown as ReturnType<typeof adminModule.createAdminClient>);

    const res = await garantirEnvioBoasVindas({
      tenantId: 'tenant_123',
      email: 'proprietario@salao.com',
      nomeProfissional: 'Maria',
      nomeEstabelecimento: 'Espaço Maria',
      slug: 'espaco-maria',
    });

    expect(res).toEqual({ ok: true, ignoradoPorIdempotencia: true });
    expect(enviarModule.enviarEmail).not.toHaveBeenCalled();
  });

  it('envia e-mail com sucesso e atualiza log para enviado', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockInsert = vi.fn().mockReturnValue({
      select: () => ({
        single: vi.fn().mockResolvedValue({
          data: { id: 'log_uuid_1', status: 'pendente' },
          error: null,
        }),
      }),
    });

    vi.mocked(adminModule.createAdminClient).mockReturnValue({
      from: () => ({
        insert: mockInsert,
        update: mockUpdate,
      }),
    } as unknown as ReturnType<typeof adminModule.createAdminClient>);

    vi.mocked(enviarModule.enviarEmail).mockResolvedValue({
      ok: true,
      id: 'resend_msg_99',
    });

    const res = await garantirEnvioBoasVindas({
      tenantId: 'tenant_456',
      email: 'joao@barbearia.com',
      nomeProfissional: 'João',
      nomeEstabelecimento: 'Barbearia João',
      slug: 'barbearia-joao',
    });

    expect(res).toEqual({ ok: true, id: 'resend_msg_99' });
    expect(enviarModule.enviarEmail).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'enviado',
        resend_id: 'resend_msg_99',
      })
    );
  });

  it('atualiza o log para falhou caso enviarEmail retorne ok: false', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockInsert = vi.fn().mockReturnValue({
      select: () => ({
        single: vi.fn().mockResolvedValue({
          data: { id: 'log_uuid_2', status: 'pendente' },
          error: null,
        }),
      }),
    });

    vi.mocked(adminModule.createAdminClient).mockReturnValue({
      from: () => ({
        insert: mockInsert,
        update: mockUpdate,
      }),
    } as unknown as ReturnType<typeof adminModule.createAdminClient>);

    vi.mocked(enviarModule.enviarEmail).mockResolvedValue({
      ok: false,
      motivo: 'config_ausente',
    });

    const res = await garantirEnvioBoasVindas({
      tenantId: 'tenant_789',
      email: 'carla@estetica.com',
      nomeProfissional: 'Carla',
      nomeEstabelecimento: 'Estética Carla',
      slug: 'estetica-carla',
    });

    expect(res).toEqual({ ok: false, motivo: 'config_ausente' });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'falhou',
        erro: 'config_ausente',
      })
    );
  });
});
