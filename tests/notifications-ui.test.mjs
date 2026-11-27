import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transform } from 'next/dist/build/swc/index.js';
import * as notifications from '../lib/notifications.js';

// Render the actual JSX with the same compiler used by Next. Only account,
// routing and decorative components are replaced; no network or secrets.
const source = await fs.readFile(new URL('../components/notifications/Notifications.js', import.meta.url), 'utf8');
const { code } = await transform(source, {
  filename: 'Notifications.js',
  jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } },
  module: { type: 'commonjs' },
});
let actionError = false;
const dependencies = {
  react: React,
  'next/link': () => null,
  'next/router': { useRouter: () => ({}) },
  '../Icon': () => null,
  '../AccountProvider': { useAccount: () => ({}) },
  '../profile/ProfileUI': { ProfileAvatar: () => null,ProfilePoster: ({item}) => React.createElement('span',null,item.titulo) },
  './NotificationProvider': { useNotifications: () => ({ actionError, mutate: async () => true }) },
  '../../lib/notifications': notifications,
  '../../lib/friends': { connectionTime: () => 'Agora' },
  '../../lib/social-community': {socialRpc:async()=>null,socialError:()=>''},
  '../../lib/lists': {listsChanged(){}},
};
const compiled = { exports: {} };
vm.runInNewContext(code, { exports: compiled.exports, React, require: name => {
  if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
  return dependencies[name];
} });
const render = props => renderToStaticMarkup(React.createElement(compiled.exports.NotificationList, { rows: [], retry() {}, ...props }));

test('the full page reports query failure without a retry button or a false empty state', () => {
  const html = render({ error: true });
  assert.match(html, /Não foi possível carregar/);
  assert.doesNotMatch(html, /Tentar novamente/);
  assert.doesNotMatch(html, /Nenhuma notificação/);
});

test('empty notifications leave the list blank without a no-notifications message', () => {
  assert.doesNotMatch(render({}), /Nenhuma notificação/);
  assert.match(render({}), /Últimas 24 horas/);
  const loading = render({ loading: true });
  assert.match(loading, /Carregando notificações/);
  assert.doesNotMatch(loading, /Nenhuma notificação/);
});

test('the full page keeps action errors visible without retry controls', () => {
  actionError = true;
  try {
    assert.match(render({}), /Não foi possível carregar/);
    assert.doesNotMatch(render({}), /Tentar novamente/);
    assert.doesNotMatch(render({}), /Nenhuma notificação/);
  } finally { actionError = false; }
});

test('the bell stays quiet for empty inboxes and query failures while retaining real notifications', () => {
  for (const error of [false, true]) {
    const html = render({ quiet: true, error });
    assert.doesNotMatch(html, /Tentar novamente|Nenhuma notificação|Não foi possível/);
  }
  const html = render({ quiet: true, rows: [{ id: 'one', type: 'follower', actor_id: 'actor', entity_type: 'profile', entity_id: 'actor', created_at: '2026-10-23T12:00:00Z', data: { actor_name: 'Ana' } }] });
  assert.match(html, /Ana começou a seguir você/);
});

test('recommendation notifications show the actual work and personal message, while nominal invites offer both responses',()=>{
 const base={id:'one',actor_id:'actor',created_at:'2026-10-27T12:00:00Z'};
 const html=render({rows:[{...base,type:'work_recommendation',entity_type:'recommendation',entity_id:'rec',data:{actor_name:'Ana',title:'Portal',message:'Jogue comigo',work:{id:12,categoria:'jogos',titulo:'Portal'}}}]});
 assert.match(html,/Ana recomendou Portal/);assert.match(html,/Jogue comigo/);assert.match(html,/href="\/obra\/jogos\/12"/);
 const invite=render({rows:[{...base,type:'list_invite',entity_type:'list',entity_id:'list',data:{actor_username:'ana',title:'Nosso grupo'}}]});
 assert.match(invite,/@ana convidou/);assert.match(invite,/Nosso grupo/);assert.match(invite,/Aceitar/);assert.match(invite,/Recusar/);
});
