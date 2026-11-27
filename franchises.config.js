// IDs discovered through TMDB search endpoints; see UNIVERSOS.md for provenance and scope.
// fontes supports colecoes, keywords, empresas and filmes (arrays of TMDB IDs, unioned).
// Original local artwork: crop is an SVG viewBox; invert handles dark logos on white.
const franchiseLogos = {
  'marvel-mcu': { src:'/universos/marvel.jpg', width:1200, height:632, crop:'242 206 716 272', levels:[.8,.97] },
  'star-wars': { src:'/universos/star.jpg', width:850, height:448, crop:'48 50 754 336', levels:[.3,.8] },
  'harry-potter': { src:'/universos/harry.jpg', width:1199, height:507, crop:'225 112 750 321' },
  dc: { src:'/universos/dc.jpg', width:1200, height:675, crop:'335 92 530 493', invert:true },
  jurassic: { src:'/universos/jurassic.jpg', width:736, height:736, crop:'86 85 564 564' },
  'terra-media': { src:'/universos/lord.jpg', width:1080, height:1080, crop:'124 218 838 653' },
  'velozes-e-furiosos': { src:'/universos/velozes.jpg', width:600, height:600, crop:'36 227 526 147' },
  matrix: { src:'/universos/matrix.jpg', width:1199, height:722, crop:'40 223 1118 246', invert:true },
  'piratas-do-caribe': { src:'/universos/piratas.jpg', width:1000, height:546, crop:'124 100 708 292', levels:[.08,.48] },
  'toy-story': { src:'/universos/toy.jpg', width:663, height:462, crop:'20 5 601 442', invert:true },
};
export const franchises = [
  { slug:'marvel-mcu', nome:'Marvel (MCU)', cor:'#ed5565', descricao:'Os longas do Universo Cinematográfico Marvel, incluindo os próximos títulos cadastrados no TMDB. Sem One-Shots, especiais ou documentários.', fontes:{keywords:[180547]}, excluir_generos:[99,10770], excluir:[76122,76535,119569,211387,253980,413279,441829,505945,758025,1010823,1010821,1010820,1010819,1010818,894205,774752,1439930] },
  { slug:'star-wars', nome:'Star Wars', cor:'#eed36a', descricao:'A saga Skywalker, as histórias derivadas, A Guerra dos Clones e os novos filmes cadastrados no TMDB.', fontes:{colecoes:[10,1797552]}, incluir:[12180,1228710,1417668], ordem_cronologica:[1893,1894,12180,1895,348350,330459,11,1891,1892,1228710,140607,181808,181812] },
  { slug:'harry-potter', nome:'Harry Potter', cor:'#d8b16e', descricao:'Do mundo de Animais Fantásticos à jornada de Harry, Rony e Hermione em Hogwarts.', fontes:{colecoes:[1241,435259]}, ordem_cronologica:[259316,338952,338953,671,672,673,674,675,767,12444,12445] },
  { slug:'dc', nome:'DC', cor:'#69afff', descricao:'DCEU, DCU, Batman, Superman, Coringa e longas de animação. Universos e continuidades diferentes reunidos em um catálogo; sem documentários e curtas selecionados.', fontes:{colecoes:[120794,948485,8537,263,987044],keywords:[229266,312528],empresas:[9993,128064,184898],animacao_empresas:[429],filmes:[272,155,49026,268,364,414,415,414906,2661,1452,14919,15805,16234,21683]}, excluir_generos:[99,10770], excluir:[1255345,355142,1078989,761135,256421,1081412,461834,461833,461838,461836,536584,618346,1529346,1529648,1529650,1529651,1767987,1786298] },
  { slug:'jurassic', nome:'Jurassic Park / World', cor:'#70c89a', descricao:'Do primeiro parque à nova era de Jurassic World. A coleção principal já reúne as duas fases.', fontes:{colecoes:[328]} },
  { slug:'terra-media', nome:'O Senhor dos Anéis / O Hobbit', cor:'#c7b66f', descricao:'As trilogias da Terra-média, A Guerra dos Rohirrim e os próximos filmes cadastrados no TMDB.', fontes:{colecoes:[119,121938]}, incluir:[839033,1090869], ordem_cronologica:[839033,49051,57158,122917,120,121,122] },
  { slug:'velozes-e-furiosos', nome:'Velozes e Furiosos', cor:'#f1a267', descricao:'A saga principal e Hobbs & Shaw, entre corridas, missões e família.', fontes:{colecoes:[9485]}, ordem_cronologica:[9799,584,13804,51497,82992,9615,168259,337339,384018,385128,385687] },
  { slug:'matrix', nome:'Matrix', cor:'#71d394', descricao:'Entre a simulação e o mundo real: os longas da coleção Matrix.', fontes:{colecoes:[2344]} },
  { slug:'piratas-do-caribe', nome:'Piratas do Caribe', cor:'#57c9d0', descricao:'As aventuras de Jack Sparrow pelos mares da coleção Piratas do Caribe.', fontes:{colecoes:[295]} },
  { slug:'toy-story', nome:'Toy Story', cor:'#89b7ff', descricao:'As histórias de Woody, Buzz e seus amigos nos filmes da coleção principal.', fontes:{colecoes:[10194]} },
].map(franchise => ({ ...franchise, ...(franchiseLogos[franchise.slug] ? { logo:franchiseLogos[franchise.slug] } : {}) }));
export const franchiseBySlug = slug => franchises.find(franchise => franchise.slug === slug);
