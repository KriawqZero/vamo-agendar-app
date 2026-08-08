import * as React from 'react';
import { Button, Section, Text } from 'react-email';
import { LayoutBase } from './layout/LayoutBase';

export interface ConfirmacaoAgendamentoProps {
  nomeCliente: string;
  nomeEstabelecimento: string;
  nomeServico: string;
  dataHoraFormatada: string;
  endereco?: string;
  linkBooking?: string;
}

export const ConfirmacaoAgendamento: React.FC<ConfirmacaoAgendamentoProps> = ({
  nomeCliente,
  nomeEstabelecimento,
  nomeServico,
  dataHoraFormatada,
  endereco,
  linkBooking,
}) => {
  return (
    <LayoutBase
      titulo="Agendamento Confirmado!"
      previewText={`Seu agendamento em ${nomeEstabelecimento} está confirmado!`}
    >
      <Text style={textStyle}>
        Olá, <strong>{nomeCliente}</strong>!
      </Text>
      <Text style={textStyle}>
        Seu agendamento em <strong>{nomeEstabelecimento}</strong> foi realizado com sucesso.
        Confira abaixo os detalhes:
      </Text>

      <Section style={detailsBoxStyle}>
        <Text style={detailRowStyle}>
          <strong>Serviço:</strong> {nomeServico}
        </Text>
        <Text style={detailRowStyle}>
          <strong>Data e Horário:</strong> {dataHoraFormatada}
        </Text>
        {endereco && (
          <Text style={detailRowStyle}>
            <strong>Local / Endereço:</strong> {endereco}
          </Text>
        )}
      </Section>

      {linkBooking && (
        <Section style={buttonContainerStyle}>
          <Button href={linkBooking} style={buttonStyle}>
            Ver página de agendamento
          </Button>
        </Section>
      )}

      <Text style={subtextStyle}>
        Caso precise reagendar ou cancelar, entre em contato diretamente com {nomeEstabelecimento}.
      </Text>
    </LayoutBase>
  );
};

const textStyle: React.CSSProperties = {
  color: '#27272a',
  fontSize: '15px',
  lineHeight: '24px',
  marginBottom: '16px',
};

const detailsBoxStyle: React.CSSProperties = {
  backgroundColor: '#f4f4f5',
  borderRadius: '8px',
  border: '1px solid #e4e4e7',
  padding: '18px',
  margin: '24px 0',
};

const detailRowStyle: React.CSSProperties = {
  color: '#18181b',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '4px 0',
};

const buttonContainerStyle: React.CSSProperties = {
  textAlign: 'center' as const,
  margin: '28px 0',
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: '#18181b',
  color: '#ffffff',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
};

const subtextStyle: React.CSSProperties = {
  color: '#71717a',
  fontSize: '13px',
  lineHeight: '20px',
  marginTop: '20px',
  marginBottom: '0',
};

export default ConfirmacaoAgendamento;
