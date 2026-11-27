# Ambiente e integrações

Use um projeto Supabase independente para desenvolvimento/homologação. Não copie credenciais ou dados de produção para testes. O `.env.example` contém somente nomes e valores vazios; `.env.local` não entra no Git.

| Variáveis | Local e uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Navegador: URL HTTPS e publishable/anon key. Nunca service role. |
| `TMDB_API_KEY` | Servidor: filmes, séries e imagens. |
| `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` | Servidor: cadastro Twitch/IGDB. |
| `GAME_CATALOG_PROVIDER`, `RAWG_API_KEY` | Servidor: vazio usa IGDB; `rawg` seleciona modo legado com chave própria. |
| `FANART_API_KEY` | Servidor: complemento opcional de arte. |
| `ANIME_CATALOG_PROVIDER`, `JIKAN_EDGE_BASE_URL` | Servidor: mantenha o padrão Jikan-Edge ou configure um endpoint autorizado. Não use endpoints HTTP de terceiros. |
| `SUPABASE_SERVICE_ROLE_KEY` | Somente servidor: caches e operações administrativas previstas. Nunca prefixar com `NEXT_PUBLIC_`. |
| `STEAM_WEB_API_KEY`, `STEAM_SITE_URL` | Servidor: importação Steam e origem exata do ambiente. Produção exige HTTPS; localhost pode usar HTTP para desenvolvimento. |
| `VOID_ALLOWED_ORIGINS` | Configurar separadamente na Edge Function: origens exatas separadas por vírgula. |
| `VOID_SEARCH_REQUESTS_PER_MINUTE` | Servidor: limite por IP e instância. |
| `VOID_{TMDB,IGDB,RAWG}_{MINUTE,DAILY}_BUDGET` | Orçamentos locais opcionais, por instância; não são cotas globais. |
| `VOID_GLOBAL_BUDGETS_ENABLED` | `1` habilita as cotas compartilhadas opcionais após revisão da migration correspondente. |
| `VOID_GLOBAL_{TMDB,RAWG,IGDB,TWITCH,ANILIST,FANART,JIKAN,STEAM}_{MINUTE,DAILY}` | Expanda cada combinação. Limites positivos por provedor/projeto; escolha com base nas cotas reais. Configuração ausente ou banco indisponível bloqueiam a chamada quando a proteção está habilitada. |

As cotas compartilhadas limitam as chamadas externas cobertas pelos transportes de catálogo/Steam. Não substituem controles de tráfego de entrada, limites Auth, orçamento financeiro do provedor ou proteção de borda. Permanecem desativadas por padrão até a revisão e configuração do ambiente.

## Supabase novo

Em um projeto descartável com Auth e Storage, revise e aplique os arquivos de `supabase/migrations/` em ordem de nome. Eles criam schema e regras, sem dumps de usuários. **Não reaplique esse conjunto em um projeto existente**; reconciliação de históricos é uma operação separada do mantenedor.

Configure Site URL e redirects exatos de `/conta` e `/verificar-email`. O modelo atual permite acesso imediato ao Auth e verificação opcional de posse do e-mail, separadamente. Configure SMTP, templates e limites de envio no projeto escolhido e valide-os com contas sintéticas.

A Edge Function `void-email-verification` usa variáveis do runtime Supabase (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) e `VOID_ALLOWED_ORIGINS`. Deploy de função e aplicação de migrations são etapas manuais aprovadas; não ocorrem ao instalar dependências ou executar CI.

## Ambientes

Use projetos, chaves, redirects e dados separados para desenvolvimento, homologação e produção. Cadastre as variáveis em cada ambiente Vercel de forma explícita. Não reutilize uma chave administrativa de produção em Preview. A CI executa fixtures e banco em memória, sem secrets reais.
