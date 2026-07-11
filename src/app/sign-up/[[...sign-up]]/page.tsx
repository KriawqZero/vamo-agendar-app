import { SignUp } from '@clerk/nextjs'
import PalcoAuth from '@/app/PalcoAuth'
import DiaNoite from '@/app/DiaNoite'

export default function SignUpPage() {
    return (
        <PalcoAuth
            horaFantasma={<DiaNoite dia="06:47" noite="22:31" />}
            eyebrow="grátis · sem cartão · leva um minuto"
            titulo={
                <>
                    Você está a um passo de uma agenda que{' '}
                    <span className="text-marca">trabalha sozinha</span>.
                </>
            }
            momentos={[
                { hora: 'agora', texto: 'você cria sua conta' },
                { hora: '+5 min', texto: 'serviços e horários configurados' },
                { hora: 'hoje', texto: 'seu link na bio do Instagram' },
                {
                    hora: <DiaNoite dia="06:47" noite="22:31" />,
                    texto: (
                        <DiaNoite
                            dia="um cliente agenda antes do expediente"
                            noite="um cliente agenda enquanto você dorme"
                        />
                    ),
                },
            ]}
        >
            <SignUp />
        </PalcoAuth>
    )
}
