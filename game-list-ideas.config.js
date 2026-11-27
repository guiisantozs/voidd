// Inspiration only: no catalog entries are added when choosing an idea.
export const gameIdeaThemes=['Todos','Gêneros','Momentos','Backlog','Franquias','Plataformas','Décadas','Primeiros passos'];
export const gameIdeaIcons={'Gêneros':'gamepad','Momentos':'users','Backlog':'clock','Franquias':'grid','Plataformas':'monitor','Décadas':'calendar','Primeiros passos':'sparkle'};
const groups={
  'Gêneros':[
    ['RPGs para se perder por 100 horas','Mundos enormes, personagens marcantes e jornadas para explorar sem pressa.'],
    ['Soulslikes que machucam','Desafios que pedem persistência e fazem cada vitória valer a pena.'],
    ['Roguelikes viciantes','Só mais uma tentativa: jogos para recomeçar e descobrir novos caminhos.'],
    ['Terror para jogar de luz apagada','Atmosferas inquietantes e sustos para testar a sua coragem.'],
    ['Indies imperdíveis','Jogos independentes que merecem um lugar entre seus favoritos.'],
    ['Metroidvanias essenciais','Mapas interligados, novas habilidades e segredos em cada canto.'],
  ],
  'Momentos':[
    ['Jogos para jogar com os amigos','Encontros cooperativos e disputas para reunir o grupo.'],
    ['Co-op de sofá','Divida a tela e a aventura com quem está ao seu lado.'],
    ['Jogos para chorar','Histórias e personagens que continuam com você depois dos créditos.'],
    ['Jogos curtos de fim de semana','Aventuras para começar e terminar nos dias de descanso.'],
    ['Para jogar de madrugada','Jogos que combinam com fones de ouvido e uma noite tranquila.'],
    ['Jogos para relaxar','Experiências acolhedoras para desacelerar no seu ritmo.'],
  ],
  'Backlog':[
    ['Comprei e nunca abri','Dê uma nova chance aos jogos que já estão na sua biblioteca.'],
    ['Quero zerar este ano','Organize as campanhas que você quer concluir nos próximos meses.'],
    ['Jogos de menos de 10 horas','Sua seleção de campanhas curtas para encaixar na rotina.'],
    ['Platinas fáceis','Reúna os jogos cujas conquistas você considera mais acessíveis.'],
  ],
  'Franquias':[
    ['Zelda na ordem certa','Escolha sua ordem para explorar as aventuras de Hyrule.'],
    ['Resident Evil do começo ao fim','Organize sua jornada pelos capítulos do survival horror.'],
    ['Tudo da FromSoftware','Sua seleção de jogos do estúdio para conhecer ou revisitar.'],
    ['Rockstar essencial','Mundos abertos e histórias do estúdio que você quer jogar.'],
  ],
  'Plataformas':[
    ['Exclusivos de PlayStation','Reúna os jogos que marcaram sua experiência no PlayStation.'],
    ['Melhores do Switch','Sua seleção pessoal para jogar na TV ou levar com você.'],
    ['Clássicos do PC','Jogos que fizeram história no teclado e no mouse.'],
    ['Retrô que envelheceu bem','Clássicos que continuam divertidos muitas gerações depois.'],
  ],
  'Décadas':[
    ['Anos 90 no PS1','Volte à era dos primeiros grandes mundos em três dimensões.'],
    ['Era PS2','Reúna os jogos que definiram sua geração de PlayStation 2.'],
    ['Clássicos do 16 bits','Aventuras e desafios que marcaram a geração de 16 bits.'],
  ],
  'Primeiros passos':[
    ['Meus 10 jogos favoritos','Uma seleção pessoal dos jogos que você mais gosta.'],
    ['Os jogos da minha vida','Guarde as experiências que marcaram diferentes fases da sua história.'],
    ['Jogos que quero recomendar','Aquelas descobertas que você sempre indica a alguém.'],
  ],
};
export const gameListIdeas=Object.entries(groups).flatMap(([theme,rows],group)=>rows.map(([title,description],index)=>({id:`game-${group}-${index}`,theme,title,description,media_types:['jogos']})));
