export const gameDetailTabs = [['visao-geral','Visão geral'],['sua-jornada','Sua avaliação'],['meu-historico','Meu histórico'],['comunidade','Comunidade'],['amigos','Amigos'],['midia','Mídias'],['jogos-parecidos','Jogos parecidos']];
export function gameDetailTab(hash, tabs = gameDetailTabs) {
  const id = String(hash || '').replace(/^#/, '');
  if (id === 'listas-status') return 'sua-jornada';
  if (id === 'detalhes') return 'visao-geral';
  return tabs.some(([key]) => key === id) ? id : 'visao-geral';
}
