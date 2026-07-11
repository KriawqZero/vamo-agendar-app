import Image from 'next/image'

/**
 * Logo oficial nas duas variantes do manual: wordmark branco sobre fundo
 * escuro, wordmark roxo sobre fundo claro. A troca é por CSS (classe dark
 * no <html>), sem JS — não pisca na hidratação.
 */
export default function LogoMarca({
    className = 'h-8 w-auto',
    priority = false,
}: {
    className?: string
    priority?: boolean
}) {
    return (
        <>
            <Image
                src="/logo-fundo-claro.svg"
                alt="VamoAgendar"
                width={124}
                height={40}
                priority={priority}
                className={`dark:hidden ${className}`}
            />
            <Image
                src="/logo-fundo-escuro.svg"
                alt="VamoAgendar"
                width={124}
                height={40}
                priority={priority}
                className={`hidden dark:block ${className}`}
            />
        </>
    )
}
