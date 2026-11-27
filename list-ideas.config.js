// Inspiration only. Never add catalog IDs or works here. Months are inclusive.
export const listIdeas=[
  {id:'natal',media_types:["filmes"],title:'Filmes para ver no Natal',description:'Filmes para assistir durante o período de Natal.',theme:'Datas',months:[12]},
  {id:'halloween',media_types:["filmes"],title:'Maratona de Halloween',description:'Terror, suspense e mistério para assistir em outubro.',theme:'Datas',months:[10]},
  {id:'espaco',media_types:["filmes"],title:'Filmes sobre espaço',description:'Filmes sobre viagens espaciais e outros planetas.',theme:'Gêneros'},
  {id:'batman',media_types:["filmes"],title:'Trilogia Batman',description:'Uma lista para organizar a trilogia que você quer assistir.',theme:'Franquias'},
  {id:'chorar',media_types:["filmes"],title:'Filmes para chorar',description:'Dramas e histórias com carga emocional.',theme:'Momentos'},
  {id:'comfort',media_types:["filmes"],title:'Comfort movies',description:'Filmes que você gosta de rever.',theme:'Momentos'},
  {id:'twists',media_types:["filmes","series"],title:'Plot twists inesquecíveis',description:'Filmes e séries com reviravoltas, sem spoilers.',theme:'Gêneros'},
  {id:'familia',media_types:["filmes"],title:'Filmes para ver em família',description:'Filmes para assistir com a família.',theme:'Momentos'},
  {id:'oitenta',media_types:["filmes","series","jogos"],title:'Anos 80 nostálgicos',description:'Filmes, séries e jogos lançados nos anos 80.',theme:'Décadas'},
  {id:'trilhas',media_types:["filmes","series","jogos","animes"],title:'Melhores trilhas sonoras',description:'Obras que se destacam pela música.',theme:'Momentos'},
  {id:'cult',media_types:["filmes"],title:'Cult que quase ninguém viu',description:'Filmes menos conhecidos que você quer recomendar.',theme:'Gêneros'},
  {id:'domingo',media_types:["filmes"],title:'Filmes de domingo à noite',description:'Filmes para encerrar o fim de semana.',theme:'Momentos'},
  {id:'romances',media_types:["filmes"],title:'Romances para um primeiro encontro',description:'Romances para assistir a dois.',theme:'Momentos',months:[6]},
  {id:'anime',media_types:["animes"],title:'Animes para quem nunca viu anime',description:'Sugestões para quem está começando a assistir anime.',theme:'Primeiros passos'},
  {id:'series',media_types:["series"],title:'Séries para maratonar no fim de semana',description:'Séries para assistir durante o fim de semana.',theme:'Momentos'},
  {id:'multiplayer',media_types:["jogos"],title:'Jogos para jogar com amigos',description:'Jogos cooperativos e competitivos para jogar em grupo.',theme:'Momentos'},
  {id:'indie',media_types:["jogos"],title:'Jogos indie imperdíveis',description:'Uma seleção pessoal de jogos independentes.',theme:'Gêneros'},
  {id:'herois',media_types:["filmes","series","jogos","animes"],title:'Heróis e vilões marcantes',description:'Obras com heróis e vilões que você quer destacar.',theme:'Franquias'},
  {id:'adaptacoes',media_types:["filmes","series","jogos","animes"],title:'Adaptações melhores que o livro',description:'Adaptações que você prefere aos livros originais.',theme:'Gêneros'},
  {id:'noventa',media_types:["filmes","series","jogos","animes"],title:'Obras-primas dos anos 90',description:'Obras dos anos 90 que você considera essenciais.',theme:'Décadas'},
];
export function seasonalIdeas(date=new Date()) {
  const month=Number(new Intl.DateTimeFormat('en-US',{month:'numeric',timeZone:'America/Sao_Paulo'}).format(date));
  return listIdeas.map((idea,index)=>({...idea,inSeason:!!idea.months?.includes(month),index})).sort((a,b)=>Number(b.inSeason)-Number(a.inSeason)||a.index-b.index);
}
