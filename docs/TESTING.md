# Testes e qualidade incremental

```sh
npm ci --ignore-scripts
npm run lint
npm run typecheck
npm run format:check
npm test
npm run test:sql
npm run build
npm audit
```

Node Test Runner cobre modelos, APIs, sincronização e regras de apresentação com fixtures. `test:sql` executa onze runners em PostgreSQL PGlite em memória, sem rede, com substitutos mínimos de Auth/Storage. Um replay local não substitui Supabase Auth, Storage HTTP ou teste de homologação.

`typecheck` verifica `security-headers`, `account-sync`, `account-cache-lifecycle` e `global-provider-budget` com JSDoc/checkJs estrito. O restante permanece JavaScript sem promessa de cobertura estática completa. `format:check` aplica Prettier aos mesmos módulos; novas ampliações devem acompanhar alterações funcionais, sem reformatação de toda a base.

## Navegador

Playwright é dependência de desenvolvimento fixada no lockfile. Instale o navegador de teste com `npx playwright install chromium` ou defina `VOID_TEST_BROWSER` com um executablePath existente.

Compile com **configuração sintética**, não produção, para executar os runners de contas simuladas:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL='https://voidfixture.supabase.co'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture'
npm.cmd run build
npm.cmd start -- -p 3111
```

Em outro terminal:

```powershell
$env:GAME_COLLECTION_TEST_URL='http://127.0.0.1:3111'
node scripts/test-profile-navigation-browser.mjs
node scripts/test-game-collection-browser.mjs
node scripts/test-publication-browser.mjs ./node_modules/playwright/index.mjs http://127.0.0.1:3111
```

Esses testes utilizam respostas simuladas. Não instale uma sessão real para executá-los. O smoke só permite localhost e intercepta APIs; também valida a política de scripts da CSP. Contas, tokens e dados de fixtures são sintéticos. Testes browser não fazem parte de `npm test`.

Para publicação, prepare o índice e execute `npm run check:public`; `check:worktree` inclui arquivos atuais não ignorados. `check:history` cobre apenas os commits alcançáveis desta cópia. `node scripts/check-public-files.mjs --artifacts .next` examina o build. Nenhum scanner garante ausência de todos os segredos possíveis.
