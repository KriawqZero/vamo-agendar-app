import * as React from 'react';
import { Button, Section, Text } from 'react-email';
import { LayoutBase } from './layout/LayoutBase';

export interface BoasVindasProps {
  nomeProfissional: string;
  nomeEstabelecimento: string;
  slug: string;
  urlBase?: string;
}

export const BoasVindas: React.FC<BoasVindasProps> = ({
  nomeProfissional,
  nomeEstabelecimento,
  slug,
  urlBase = 'https://vamoagendar.com.br',
}) => {
  const urlLimpa = urlBase.replace(/\/$/, '');
  const urlBooking = `${urlLimpa}/book/${slug}`;

  return (
    <LayoutBase
      titulo="Sua agenda online está pronta!"
      previewText={`Boas-vindas ao VamoAgendar, ${nomeProfissional}!`}
    >
      <Text style={textStyle}>
        Olá, <strong>{nomeProfissional}</strong>!
      </Text>
      <Text style={textStyle}>
        Sua conta para <strong>{nomeEstabelecimento}</strong> foi configurada com sucesso.
        Agora seus clientes já podem agendar horários diretamente na sua página pública de forma simples e rápida.
      </Text>

      <Section style={linkBoxStyle}>
        <Text style={linkLabelStyle}>Seu link público de agendamento:</Text>
        <Text style={linkValueStyle}>{urlBooking}</Text>
      </Section>

      <Section style={buttonContainerStyle}>
        <Button href={urlBooking} style={buttonStyle}>
          Ver minha página de agendamento
        </Button>
      </Section>

      <Text style={subtextStyle}>
        Dica: você pode compartilhar este link na bio do seu Instagram, WhatsApp ou enviar direto aos seus clientes para começarem a agendar.
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

const linkBoxStyle: React.CSSProperties = {
  backgroundColor: '#f4f4f5',
  borderRadius: '6px',
  border: '1px solid #e4e4e7',
  padding: '16px',
  margin: '24px 0',
  textAlign: 'center' as const,
};

const linkLabelStyle: React.CSSProperties = {
  color: '#52525b',
  fontSize: '13px',
  fontWeight: '500',
  margin: '0 0 4px 0',
};

const linkValueStyle: React.CSSProperties = {
  color: '#18181b',
  fontSize: '15px',
  fontWeight: '700',
  wordBreak: 'break-all' as const,
  margin: '0',
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

export default BoasVindas;
