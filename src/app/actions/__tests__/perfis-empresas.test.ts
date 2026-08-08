import { describe, expect, it, vi, beforeEach } from 'vitest';
import { salvarPerfilEmpresa } from '../perfis-empresas';
import * as clerkServer from '@clerk/nextjs/server';
import * as supabaseServer from '@/lib/supabase/server';
import * as assinaturasModule from '@/lib/assinaturas';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/assinaturas', () => ({
  obterAssinaturaVigente: vi.fn(),
}));

describe('salvarPerfilEmpresa - emailContato', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clerkServer.auth).mockResolvedValue({ orgId: 'org_test123' } as unknown as Awaited<ReturnType<typeof clerkServer.auth>>);
    vi.mocked(assinaturasModule.obterAssinaturaVigente).mockResolvedValue({
      plano: 'gratuito',
      inadimplente: false,
      urlFaturaPendente: null,
    });
  });

  it('lança erro amigável quando e-mail de contato é inválido', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { slug_gratuito: 'slug-teste', slug: 'slug-teste' },
      error: null,
    });
    vi.mocked(supabaseServer.createClient).mockResolvedValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
    } as unknown as Awaited<ReturnType<typeof supabaseServer.createClient>>);

    await expect(
      salvarPerfilEmpresa({
        slug: 'slug-teste',
        nomeEstabelecimento: 'Barbearia Teste',
        emailContato: 'email_invalido_sem_arroba',
      })
    ).rejects.toThrow('E-mail de contato inválido.');
  });

  it('salva o perfil com sucesso quando e-mail de contato é válido', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { slug_gratuito: 'slug-teste', slug: 'slug-teste' },
      error: null,
    });
    const mockSingleInsert = vi.fn().mockResolvedValue({
      data: { tenant_id: 'org_test123', slug: 'slug-teste', email_contato: 'contato@top.com' },
      error: null,
    });

    const mockUpsert = vi.fn().mockReturnValue({
      select: () => ({ single: mockSingleInsert }),
    });

    vi.mocked(supabaseServer.createClient).mockResolvedValue({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
        upsert: mockUpsert,
      }),
    } as unknown as Awaited<ReturnType<typeof supabaseServer.createClient>>);

    const res = await salvarPerfilEmpresa({
      slug: 'slug-teste',
      nomeEstabelecimento: 'Barbearia Teste',
      emailContato: 'contato@top.com',
    });

    expect(res.email_contato).toBe('contato@top.com');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email_contato: 'contato@top.com',
      }),
      expect.anything()
    );
  });
});
