import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

// As suítes de integração ESCREVEM e APAGAM em banco de dados/serviços externos.
// `pnpm test` é a Definition of Done do projeto e precisa continuar hermético —
// sem rede, sem banco — então estas suítes ficam FORA do glob padrão e só são
// coletadas com EXIGIR_INTEGRACAO=1. O único dono dessa variável é o script
// `test:integracao`.
const SUITES_INTEGRACAO = [
    'src/app/actions/__tests__/public-booking-escrita.test.ts',
    'src/**/*.integration.test.ts'
]
const integracaoHabilitada = process.env.EXIGIR_INTEGRACAO === '1'

export default defineConfig({
    // O tsconfig.json já declara `@/* → ./src/*`, mas o vitest não lê `paths`
    // do tsconfig: sem este alias qualquer suíte que toque `src/app/` falha no
    // import antes de rodar um caso sequer.
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    test: {
        include: ['src/**/*.test.ts'],
        exclude: [
            ...configDefaults.exclude,
            ...(integracaoHabilitada ? [] : SUITES_INTEGRACAO),
        ],
        env: {
            QSTASH_TOKEN: 'token-teste',
            QSTASH_URL: 'https://qstash.local',
            QSTASH_CURRENT_SIGNING_KEY: 'sig-atual-teste',
            QSTASH_NEXT_SIGNING_KEY: 'sig-proxima-teste',
            EVOLUTION_API_URL: 'http://evolution.local',
            ANALYTICS_TENANT_SALT: 'salt-de-teste'
        }
    }
})
