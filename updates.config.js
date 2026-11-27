// Change the version to announce a new update to each account again.
export const currentUpdate = {
  id: 'gamer',
  version: 'v1',
  enabled: true,
  delay: 1000,
  badge: 'NOVIDADE',
  title: 'Chegou a atualização gamer do void',
  subtitle: 'Escolha seu avatar e confira sua nova coleção e biblioteca gamer.',
  items: [
    { id: 'avatars', icon: 'user', title: 'Novos avatares', description: 'Escolha o avatar que combina com você.', preview: 'avatars' },
    { id: 'collection', icon: 'gamepad', title: 'Nova Minha Coleção gamer', description: 'Seu perfil gamer com nível, XP, jogos e conquistas recentes.' },
    { id: 'library', icon: 'list', title: 'Nova Biblioteca gamer', description: 'Organize seus jogos do seu jeito.' },
  ],
  destination: '/jogos/colecao',
  primaryLabel: 'Conferir agora',
  dismissLabel: 'Depois',
  visual: {
    label: 'PRÉVIA DO SEU NOVO UNIVERSO',
    title: 'Sua história ganha um novo nível.',
    covers: [
      { appid: '1245620', title: 'Elden Ring' },
      { appid: '1091500', title: 'Cyberpunk 2077' },
      { appid: '1593500', title: 'God of War' },
    ],
  },
};
