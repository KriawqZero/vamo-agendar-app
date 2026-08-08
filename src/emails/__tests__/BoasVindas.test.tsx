import { describe, expect, it } from 'vitest';
import { render } from 'react-email';
import { BoasVindas } from '../BoasVindas';

describe('Template BoasVindas', () => {
  it('renderiza o e-mail com os dados informados e link absoluto público', async () => {
    const html = await render(
      <BoasVindas
        nomeProfissional="Marcilio"
        nomeEstabelecimento="Barbearia VamoAgendar"
        slug="barbearia-vamoagendar"
        urlBase="https://vamoagendar.com.br"
      />
    );

    expect(html).toContain('Marcilio');
    expect(html).toContain('Barbearia VamoAgendar');
    expect(html).toContain('https://vamoagendar.com.br/book/barbearia-vamoagendar');
    expect(html).toContain('Ver minha página de agendamento');
  });

  it('remove barra final da urlBase ao montar a URL absoluta', async () => {
    const html = await render(
      <BoasVindas
        nomeProfissional="Ana Silva"
        nomeEstabelecimento="Estética Ana"
        slug="estetica-ana"
        urlBase="https://app.vamoagendar.com.br/"
      />
    );

    expect(html).toContain('https://app.vamoagendar.com.br/book/estetica-ana');
  });
});
