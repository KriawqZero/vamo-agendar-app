import Link from 'next/link'
import LogoMarca from '@/app/LogoMarca'

export default function BookingNaoEncontrado() {
    return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-palco px-6 text-center text-giz">
            <h1 className="font-display text-2xl font-bold tracking-tight">
                Agenda não encontrada
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-nevoa">
                Este link não leva a nenhuma agenda ativa. Confira o endereço com quem enviou — pode
                ter faltado uma letra.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3">
                <span className="text-[10px] uppercase tracking-[0.3em] text-penumbra">
                    Agendamento online por
                </span>
                <Link href="/" aria-label="Conhecer o VamoAgendar">
                    <LogoMarca />
                </Link>
            </div>
        </div>
    )
}
