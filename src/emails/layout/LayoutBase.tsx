import * as React from 'react';
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'react-email';

interface LayoutBaseProps {
  titulo: string;
  previewText?: string;
  children: React.ReactNode;
}

export const LayoutBase: React.FC<LayoutBaseProps> = ({
  titulo,
  previewText = 'Notificação do VamoAgendar',
  children,
}) => {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={mainStyle}>
        <Container style={containerStyle}>
          {/* Header */}
          <Section style={headerStyle}>
            <Heading as="h1" style={logoStyle}>
              VamoAgendar
            </Heading>
          </Section>

          {/* Main Card */}
          <Section style={cardStyle}>
            {titulo && (
              <Heading as="h2" style={titleStyle}>
                {titulo}
              </Heading>
            )}
            {children}
          </Section>

          {/* Footer */}
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              Você recebeu este e-mail por ter criado uma conta no VamoAgendar.
            </Text>
            <Text style={footerSubtextStyle}>
              © {new Date().getFullYear()} VamoAgendar. Todos os direitos reservados.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

const mainStyle: React.CSSProperties = {
  backgroundColor: '#f4f4f5',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  margin: '0 auto',
  padding: '40px 20px',
};

const containerStyle: React.CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
};

const headerStyle: React.CSSProperties = {
  textAlign: 'center' as const,
  marginBottom: '24px',
};

const logoStyle: React.CSSProperties = {
  color: '#18181b',
  fontSize: '24px',
  fontWeight: '700',
  letterSpacing: '-0.5px',
  margin: '0',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  border: '1px solid #e4e4e7',
  padding: '32px 24px',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
};

const titleStyle: React.CSSProperties = {
  color: '#18181b',
  fontSize: '20px',
  fontWeight: '600',
  marginTop: '0',
  marginBottom: '16px',
};

const footerStyle: React.CSSProperties = {
  textAlign: 'center' as const,
  marginTop: '32px',
};

const footerTextStyle: React.CSSProperties = {
  color: '#71717a',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0 0 4px 0',
};

const footerSubtextStyle: React.CSSProperties = {
  color: '#a1a1aa',
  fontSize: '11px',
  margin: '0',
};
