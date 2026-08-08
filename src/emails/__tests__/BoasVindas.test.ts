import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BoasVindas } from '../BoasVindas';

describe('Template BoasVindas', () => {
  it('renderiza o HTML com o nome do profissional, nome do estabelecimento e link de agendamento', () => {
    const html = renderToStaticMarkup(
      React.createElement(BoasVindas, {
        nomeProfissional: 'Maria Silva',
        nomeEstabelecimento: 'Salão da Maria',
        slug: 'salao-da-maria',
        urlBase: 'https://vamoagendar.com.br',
      })
    );

    expect(html).toContain('Maria Silva');
    expect(html).toContain('Salão da Maria');
    expect(html).toContain('https://vamoagendar.com.br/book/salao-da-maria');
    expect(html).toContain('Ver minha página de agendamento');
  });

  it('remove barra final da urlBase ao montar o link booking', () => {
    const html = renderToStaticMarkup(
      React.createElement(BoasVindas, {
        nomeProfissional: 'Carlos Lima',
        nomeEstabelecimento: 'Barbearia Lima',
        slug: 'barbearia-lima',
        urlBase: 'https://vamoagendar.com.br/',
      })
    );

    expect(html).toContain('https://vamoagendar.com.br/book/barbearia-lima');
    expect(html).not.toContain('https://vamoagendar.com.br//book');
  });
});
