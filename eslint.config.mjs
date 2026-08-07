import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Artefatos auxiliares fora do código-fonte:
    ".agents/**",
    ".obsidian/**",
    // Gerado pelo CLI do Supabase em `supabase start` (runtime das Edge
    // Functions, já minificado). É `.gitignore`d, mas o flat config do ESLint 9
    // não lê o .gitignore — sem esta linha, subir a stack local passa a
    // REPROVAR `pnpm lint` com ~150 erros em código que não é nosso.
    "supabase/.temp/**",
  ]),
]);

export default eslintConfig;
