import React, { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { obterDadosBookingPublico } from '@/app/actions/public-booking'
import { hashTenantId } from '@/lib/analytics/tenant'
import { corTextoSobre } from '@/lib/cores'
import BookingApp from './BookingApp'

interface PageProps {
    params: Promise<{ slug: string }>
}

// generateMetadata e a página compartilham a mesma busca (uma query por request).
const obterDadosCached = cache(obterDadosBookingPublico)

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params
    const dados = await obterDadosCached(slug)
    if (!dados) {
        return { title: 'Agenda não encontrada · VamoAgendar' }
    }

    const titulo = `${dados.perfil.nome_estabelecimento} · Agendar horário`
    const descricao =
        dados.perfil.descricao ||
        `Agende seu horário em ${dados.perfil.nome_estabelecimento} em menos de um minuto — sem cadastro.`

    return {
        title: titulo,
        description: descricao,
        openGraph: {
            title: titulo,
            description: descricao,
            // Capa do tenant (Pro) como OG; sem capa, a arte padrão do produto.
            images: [dados.personalizacao.capaUrl ?? '/og.png'],
        },
    }
}

export default async function BookingPage({ params }: PageProps) {
    const { slug } = await params
    const dados = await obterDadosCached(slug)

    if (!dados) {
        notFound()
    }

    const { perfil, personalizacao, servicos } = dados

    // Acento do tenant (Pro): CSS vars consumidas pelas classes de ./acento.ts.
    // Texto sobre o acento calculado no servidor por contraste WCAG.
    const estiloAcento = personalizacao.corMarca
        ? ({
              '--acento': personalizacao.corMarca,
              '--acento-texto': corTextoSobre(personalizacao.corMarca),
          } as React.CSSProperties)
        : undefined

    return (
        <div style={estiloAcento} className="min-h-dvh bg-palco font-sans text-giz">
            <BookingApp
                perfil={{
                    tenant_id: perfil.tenant_id,
                    nome_estabelecimento: perfil.nome_estabelecimento,
                    descricao: perfil.descricao,
                    instagram: perfil.instagram,
                    endereco: perfil.endereco,
                    timezone: perfil.timezone,
                    horizonte_maximo_dias: perfil.horizonte_maximo_dias,
                }}
                personalizacao={personalizacao}
                servicos={servicos}
                // Pseudônimo do tenant para analytics — o org_id cru nunca vai como propriedade
                tenantHash={hashTenantId(perfil.tenant_id)}
            />
        </div>
    )
}
