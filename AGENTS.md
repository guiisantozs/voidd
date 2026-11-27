# VOID — orientação para contribuições

Next.js 15 Pages Router, React 18, JavaScript ESM, CSS próprio e Supabase. Preserve UI, funcionalidades, IDs de catálogo, notas /5, privacidade, dados de visitante e filas offline. Não redesenhe nem migre a stack sem solicitação.

- `pages/api` e integrações de servidor guardam secrets; somente URL e chave pública Supabase podem usar `NEXT_PUBLIC_`.
- Alterações SQL devem ser migrations revisadas, com RLS/grants e testes isolados entre contas. Nenhuma ferramenta de desenvolvimento ou CI deve aplicar migrations em ambiente remoto.
- Dados privados nunca entram em cache público. Logout limpa registros sincronizados; preserve filas e rascunhos não enviados e impeça que respostas antigas restaurem o cache.
- Use os componentes e parsers compartilhados. Mantenha as identidades de mídia e o controle de visibilidade existente.
- Execute `npm run lint`, `npm run typecheck`, `npm run format:check`, testes pertinentes e build antes de entregar mudanças de código. Para SQL, execute `npm run test:sql`.
- Consulte `docs/ENVIRONMENT.md`, `docs/TESTING.md` e `docs/ASSETS.md`. Não coloque dados reais, logs, backups, tokens ou contexto operacional privado neste repositório.
- Publicação, push, deploy e mudanças de produção exigem autorização do mantenedor. Não importe objetos, branches ou histórico de repositórios privados.
