import { franchises } from '../franchises.config.js';

// Editorial TV identities. The server validates each original title against TMDB;
// descriptions here describe the selection, never replace provider facts or ratings.
export const seriesUniverses = [
  {slug:'marvel',nome:'Marvel',cor:'#ed5565',descricao:'Heróis, encontros e histórias conectadas nas séries da Marvel. Seleção de produções live-action de diferentes fases da televisão, sem documentários nem especiais.',invitation:'Grandes poderes. Histórias que continuam.',logo:franchises.find(row=>row.slug==='marvel-mcu').logo,
    entries:[
      [85271,'WandaVision'],[84958,'Loki'],[88396,'The Falcon and the Winter Soldier'],[88329,'Hawkeye'],[92749,'Moon Knight'],[92782,'Ms. Marvel'],[92783,'She-Hulk: Attorney at Law'],[114472,'Secret Invasion'],[122226,'Echo'],[138501,'Agatha All Along'],[202555,'Daredevil: Born Again'],[114471,'Ironheart'],
      [61889,"Marvel's Daredevil"],[38472,"Marvel's Jessica Jones"],[62126,"Marvel's Luke Cage"],[62127,"Marvel's Iron Fist"],[62285,"Marvel's The Defenders"],[67178,"Marvel's The Punisher"],[1403,"Marvel's Agents of S.H.I.E.L.D."],[61550,"Marvel's Agent Carter"],
    ]},
  {slug:'senhor-dos-aneis',nome:'O Senhor dos Anéis',cor:'#c7b66f',descricao:'A Terra-média nas séries: comece pela Segunda Era de Os Anéis de Poder.',invitation:'Uma nova jornada pela Terra-média.',logo:franchises.find(row=>row.slug==='terra-media').logo,
    note:'Os Anéis de Poder é uma série; suas temporadas fazem parte do mesmo título. Séries e filmes estão reunidos na página da Terra-média.',entries:[[84773,'The Lord of the Rings: The Rings of Power']]},
  {slug:'game-of-thrones',nome:'Game of Thrones',cor:'#96b5cc',descricao:'Westeros através de diferentes eras: a disputa pelo Trono de Ferro, a dinastia Targaryen e as jornadas de Dunk e Egg.',invitation:'Toda casa tem uma história. Todo trono, um preço.',chronology:[94997,224372,1399],
    note:'A ordem cronológica considera o início de cada série. Temporadas e episódios continuam disponíveis nos detalhes de cada obra.',entries:[[1399,'Game of Thrones'],[94997,'House of the Dragon'],[224372,'A Knight of the Seven Kingdoms']]},
  {slug:'diarios-de-um-vampiro',nome:'Diários de um Vampiro',cor:'#c76b83',descricao:'De Mystic Falls a Nova Orleans: reencontre os Salvatore, os Mikaelson e a nova geração da escola Salvatore.',invitation:'Alguns laços atravessam a eternidade.',
    entries:[[18165,'The Vampire Diaries'],[46896,'The Originals'],[79460,'Legacies']]},
];
export const seriesUniverseBySlug=slug=>seriesUniverses.find(row=>row.slug===slug);
export const seriesUniversePortal=Object.fromEntries(seriesUniverses.map(row=>[row.slug,{accent:row.cor,logo:row.logo,invitation:row.invitation,chronology:row.chronology||[],media:['series']}]));

// Ideas only. They are not published catalogues and do not add works to any list.
export const seriesUniverseIdeas=[
  {nome:'Star Wars',examples:'The Mandalorian, Andor, Ahsoka e Obi-Wan Kenobi',source:'https://www.starwars.com/series'},
  {nome:'The Walking Dead',examples:'The Walking Dead, Fear the Walking Dead, Daryl Dixon e Dead City',source:'https://www.amc.com/shows'},
  {nome:'Star Trek',examples:'The Next Generation, Deep Space Nine, Voyager e Strange New Worlds',source:'https://www.startrek.com/series-and-movies'},
  {nome:'Breaking Bad',examples:'Breaking Bad e Better Call Saul',source:'https://www.amc.com/shows/better-call-saul'},
];
