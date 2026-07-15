import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        // Vars consumidas no load dos módulos testados (ex.: QSTASH_TOKEN em
        // whatsapp-helper.ts) precisam existir antes do import — stub por teste
        // não alcança constantes de módulo.
        env: {
            QSTASH_TOKEN: 'token-teste',
            QSTASH_URL: 'https://qstash.local',
            EVOLUTION_API_URL: 'http://evolution.local'
        }
    }
})
