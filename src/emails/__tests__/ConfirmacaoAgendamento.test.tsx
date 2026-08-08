import { describe, expect, it } from 'vitest';
import { render } from 'react-email';
import { ConfirmacaoAgendamento } from '../ConfirmacaoAgendamento';

describe('Template ConfirmacaoAgendamento', () => {
  it('renderiza o e-mail de confirmação com nome, serviço, data e local', async () => {
    const html = await render(
      <ConfirmacaoAgendamento
        nomeCliente="Carlos Andrade"
        nomeEstabelecimento="Corte & Estilo"
        nomeServico="Corte Masculino + Barba"
        dataHoraFormatada="Segunda, 10 de Agosto às 14:00"
        endereco="Rua das Flores, 123"
        linkBooking="https://vamoagendar.com.br/book/corte-estilo"
      />
    );

    expect(html).toContain('Carlos Andrade');
    expect(html).toContain('Corte &amp; Estilo');
    expect(html).toContain('Corte Masculino + Barba');
    expect(html).toContain('Segunda, 10 de Agosto às 14:00');
    expect(html).toContain('Rua das Flores, 123');
    expect(html).toContain('https://vamoagendar.com.br/book/corte-estilo');
    expect(html).toContain('Agendamento Confirmado!');
  });
});
