import { SignIn } from '@clerk/nextjs'
import PalcoAuth from '@/app/PalcoAuth'

export default function SignInPage() {
    return (
        <PalcoAuth
            horaFantasma="de volta"
            eyebrow="bom te ver de novo"
            titulo={
                <>
                    Sua agenda <span className="text-marca">não parou</span> enquanto você esteve
                    fora.
                </>
            }
            descricao="Entre para ver o que mudou — e o que já está marcado para os próximos dias."
        >
            <SignIn />
        </PalcoAuth>
    )
}
