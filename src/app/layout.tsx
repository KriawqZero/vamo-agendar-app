import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";
import { ptBR } from "@clerk/localizations";
import { ThemeProvider } from "next-themes";
import { dark, neobrutalism, shadcn } from "@clerk/ui/themes";
import AnalyticsProvider from "@/components/analytics/AnalyticsProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Fonte oficial da marca (ver artes-aprovadas-design/Mini-manual.pdf):
// usada nos títulos/display; o corpo do produto continua em Geist.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://vamoagendar.com.br"),
  title: "VamoAgendar — Seus clientes agendam sozinhos",
  description:
    "Agendamento online para profissionais: compartilhe um link, seus clientes escolhem serviço e horário sem cadastro, e você recebe confirmação e lembretes automáticos.",
  openGraph: {
    title: "VamoAgendar — Seus clientes agendam sozinhos",
    description:
      "Agendamento online para profissionais: compartilhe um link, seus clientes escolhem serviço e horário sem cadastro, e você recebe confirmação e lembretes automáticos.",
    url: "https://vamoagendar.com.br",
    siteName: "VamoAgendar",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "VamoAgendar — Seus clientes agendam sozinhos",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "VamoAgendar — Seus clientes agendam sozinhos",
    description:
      "Agendamento online para profissionais: compartilhe um link, seus clientes escolhem serviço e horário sem cadastro, e você recebe confirmação e lembretes automáticos.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          storageKey="va:tema"
          disableTransitionOnChange
        >
          {/* O tema 'simple' segue o color-scheme do html (setado pelo
              next-themes): claro no palco de dia, escuro à noite. */}
          <ClerkProvider localization={ptBR}>
            <AnalyticsProvider />
            {children}
          </ClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}