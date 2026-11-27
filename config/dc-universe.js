// Film-only membership, verified against DC announcements and public TMDB IDs.
// New DCU continuity is independent of DCEU, Elseworlds and animated timelines.
export const dcUniverse = {
 dcu:[1061474,1081003,1400940,1523140,1081004,1797314],
 batman:[2661,268,364,414,415,272,155,49026,414906,806704,209112,141052,791373,1081004],
 superman:[1924,8536,9531,11411,1452,49521,209112,141052,791373,1061474,1523140],
};

export const dcShelfDefinitions = [
 {key:'dcu',id:'dc-universo-atual',title:'DCU — Universo atual',icon:'globe',intro:'Os filmes da nova continuidade da DC Studios, iniciada no cinema com Superman (2025), e seus próximos capítulos confirmados.'},
 {key:'recent',id:'dc-mais-recentes',title:'Mais recentes',icon:'sparkle',intro:'Os últimos lançamentos da DC, seguidos pelos próximos filmes do catálogo.'},
 {key:'animation',id:'dc-animacoes',title:'Animações da DC',icon:'film',intro:'Todas as animações disponíveis neste catálogo, reunindo diferentes épocas e continuidades.'},
 {key:'batman',id:'dc-batman',title:'Batman',icon:'moon',intro:'De Gotham às alianças da Liga da Justiça: filmes e animações do Cavaleiro das Trevas.'},
 {key:'superman',id:'dc-superman',title:'Superman',icon:'shield',intro:'As diferentes gerações do Homem de Aço, no cinema e na animação.'},
];
