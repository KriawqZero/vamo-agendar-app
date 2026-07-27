# Phase 3 — API Coverage Matrix

**API integrada:** `@upstash/ratelimit` 2.x (sobre `@upstash/redis` REST). Matriz produzida
no planejamento (2026-07-27). Baseline: cobertura total por default; cada OPT-OUT carrega
o motivo. `@upstash/redis` é usado exclusivamente como transporte do Ratelimit — nenhum
comando Redis é chamado diretamente (última linha da matriz).

| capability | decision | reason |
|---|---|---|
| `new Ratelimit({ redis, limiter, prefix, timeout })` | INTEGRATE | — |
| `limit(identifier)` | INTEGRATE | — |
| `Ratelimit.slidingWindow` | INTEGRATE | — |
| opção `timeout` (fail-open nativo, `reason: 'timeout'`) | INTEGRATE | — |
| opção `prefix` (separação das camadas) | INTEGRATE | — |
| `ephemeralCache` (default, escopo de módulo) | INTEGRATE | — |
| `Ratelimit.fixedWindow` | OPT-OUT | proibido pelo ROADMAP — permite o dobro na virada da janela |
| `Ratelimit.tokenBucket` | OPT-OUT | D-01 trava slidingWindow; algoritmo não requerido |
| `Ratelimit.cachedFixedWindow` | OPT-OUT | mesmo motivo do fixedWindow |
| `analytics: true` | OPT-OUT | CONTEXT/D-11 veda como substituto dos pilares próprios; obrigaria aguardar `pending` a cada chamada |
| `blockUntilReady()` | OPT-OUT | espera ativa adiciona latência — viola ABU-02/D-03 (fail-open, nunca esperar) |
| `getRemaining()` / `resetUsedTokens()` | OPT-OUT | não necessário — visibilidade do owner vem dos pilares (D-11); reset manual não é requisito desta fase |
| `enableProtection` / deny list | OPT-OUT | lista de negação gerida na Upstash não é requisito; camadas + honeypot cobrem ABU-01 |
| multi-region (`MultiRegionRatelimit`) | OPT-OUT | um database por ambiente (D-05); produto single-region |
| `@upstash/redis` — comandos diretos além do uso interno da lib | OPT-OUT | Redis é apenas transporte do Ratelimit; nenhum acesso direto (mantém o D-01 reversível e o módulo único como fronteira) |
