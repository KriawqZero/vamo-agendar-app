import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

// A suíte de integração do booking público ESCREVE e APAGA no Supabase de dev.
// `pnpm test` é a Definition of Done do projeto e precisa continuar hermético —
// sem rede, sem banco — então esta suíte fica FORA do glob padrão e só é
// coletada com EXIGIR_INTEGRACAO=1. O único dono dessa variável é o script
// `test:integracao`. Sem o exclude, todo `pnpm test` de toda fase futura
// passaria a escrever no banco compartilhado, inclusive em execuções paralelas.
const SUITE_INTEGRACAO = 'src/app/actions/__tests__/public-booking-escrita.test.ts'
const integracaoHabilitada = process.env.EXIGIR_INTEGRACAO === '1'

export default defineConfig({
    // O tsconfig.json já declara `@/* → ./src/*`, mas o vitest não lê `paths`
    // do tsconfig: sem este alias qualquer suíte que toque `src/app/` falha no
    // import antes de rodar um caso sequer (as suítes de `src/lib/__tests__/`
    // só sobreviviam porque importam por caminho relativo).
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    test: {
        include: ['src/**/*.test.ts'],
        // Espalhar configDefaults.exclude é obrigatório: sobrescrever `exclude`
        // sem eles descartaria node_modules e .git do filtro padrão.
        exclude: [
            ...configDefaults.exclude,
            ...(integracaoHabilitada ? [] : [SUITE_INTEGRACAO]),
        ],
        // Vars consumidas no load dos módulos testados (ex.: QSTASH_TOKEN em
        // whatsapp-helper.ts) precisam existir antes do import — stub por teste
        // não alcança constantes de módulo.
        env: {
            QSTASH_TOKEN: 'token-teste',
            QSTASH_URL: 'https://qstash.local',
            QSTASH_CURRENT_SIGNING_KEY: 'sig-atual-teste',
            QSTASH_NEXT_SIGNING_KEY: 'sig-proxima-teste',
            EVOLUTION_API_URL: 'http://evolution.local'
        }
    }
})
