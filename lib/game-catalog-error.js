// Only fixed messages leave the server, never provider diagnostics or credentials.
export const GAME_CATALOG_CONFIGURATION_MESSAGE = 'Catálogo de jogos indisponível: a configuração do provedor precisa ser atualizada.';

export function gameCatalogError(error, fallback) {
  const configuration = error?.message === 'CONFIG' || error?.message === 'IGDB_CONFIG' || error?.status === 401 || error?.status === 403;
  return {
    status: configuration ? 503 : 502,
    body: {
      code: configuration ? 'GAME_CATALOG_CONFIGURATION' : 'GAME_CATALOG_UNAVAILABLE',
      erro: configuration ? GAME_CATALOG_CONFIGURATION_MESSAGE : fallback,
    },
  };
}
