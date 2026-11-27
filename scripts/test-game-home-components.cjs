// React interaction checks, not browser automation. Uses the same optional
// test renderer as test-game-cover-components.cjs; no provider calls or accounts.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const React=require('react'),{transformSync}=require('next/dist/build/swc');
const rendererRequire=createRequire(path.resolve(process.argv[2]||'tmp/cover-component-check/package.json')),{create,act}=rendererRequire('react-test-renderer');
const modules=new Map(),remembered=[],updates=[];let moves=0;
let pageState;
global.window={addEventListener(){},removeEventListener(){}};
function load(file){
 file=path.resolve(file.endsWith('.js')?file:file+'.js');if(modules.has(file))return modules.get(file).exports;
 const module={exports:{}};modules.set(file,module);
 const code=transformSync(fs.readFileSync(file,'utf8'),{filename:file,jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}}).code;
 const local=createRequire(file),resolve=name=>{
  if(name==='next/link')return ({href,children,...props})=>React.createElement('a',{...props,href},children);
  if(name==='next/head')return ({children})=>React.createElement(React.Fragment,null,children);
  if(name==='next/router')return {useRouter:()=>({query:{}})};
  if(name.endsWith('/use-game-highlights'))return {useGameHighlights:()=>({state:pageState,retry(){}})};
  if(name.endsWith('/use-library'))return {useLibrary:()=>library};
  if(name.endsWith('/use-game-search'))return {useGameSearch:()=>({items:[],loading:false,total:0})};
  if(name.endsWith('/GameHero'))return ({highlights})=>React.createElement('section',{'data-section':'hero','data-items':highlights});
  if(name.endsWith('/WeeklyFeature'))return ({state})=>React.createElement('section',{'data-section':'featured','data-items':state.games});
  if(name.endsWith('/RecommendedGames')||name.endsWith('/UniverseShortcuts'))return ()=>null;
  if(name.endsWith('/catalog'))return {readReviews:()=>({}),itemKey:game=>`${game.categoria}:${game.id}`};
  if(name.endsWith('/GameCover'))return ({item})=>React.createElement('div',{className:'game-portrait-cover'},React.createElement('img',{src:item.poster,alt:item.titulo}));
  if(name.endsWith('/GameUI'))return {rememberGame:item=>remembered.push(item.id),GamesHeader:()=>null,GamesFooter:()=>null,GameCard:()=>null};
  if(name.endsWith('/MovieUI'))return {MovieFailure:({message,retry})=>React.createElement('button',{onClick:retry},message)};
  if(name.endsWith('/use-release-marquee'))return {useReleaseMarquee:()=>({viewport:React.useRef(null),rail:React.useRef(null),group:React.useRef(null),events:{},move(){moves++;}})};
  if(name.endsWith('/movie-release'))return {releaseDay:()=> '2026-10-27',validReleaseDate:value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)};
  return name.startsWith('.')?load(path.resolve(path.dirname(file),name)):local(name);
 };
 new Function('require','module','exports',code)(resolve,module,module.exports);return module.exports;
}
const Showcase=load('components/UpcomingGames.js').default,CoverCard=load('components/games/GameCoverCard.js').default;
const game=(id,date,extra={})=>({id,categoria:'jogos',titulo:'Fixture '+id,estreia:date,ano:date.slice(0,4),poster:'https://media.rawg.io/media/games/fixture.jpg',plataformas:[],...extra});
const rows=[game(1,'2026-10-20'),game(2,'2020-01-01',{trendReason:'recent-growth'}),game(3,'2026-11-01')],library={ready:true,entries:{2:{status:'playing'}},update:(item,status)=>{updates.push([item.id,status]);return true;}};
let view;const json=()=>JSON.stringify(view.toJSON());
const button=aria=>view.root.findAllByType('button').find(node=>node.props['aria-label']===aria);
const mount=async props=>{await act(async()=>{view=create(React.createElement(Showcase,props));});};
const unmount=async()=>{if(view){await act(async()=>view.unmount());view=null;}};
(async()=>{try{
 await mount({state:{games:rows},library});assert.match(json(),/Próximos lançamentos/);assert.match(json(),/EM BREVE/);assert.ok(view.root.findAllByType(CoverCard).every(card=>card.props.item.id===3));const upcomingTrack=view.root.findAllByType('div').find(n=>n.props.className==='upcoming-track is-marquee');assert.ok(upcomingTrack);await unmount();
 await mount({mode:'trending',state:{games:rows,basis:{source:'RAWG',criterion:'Seleção especial do VOID.'}},library});assert.match(json(),/Jogos em Alta/);assert.doesNotMatch(json(),/EM BREVE/);assert.doesNotMatch(json(),/Fixture 3/);assert.match(json(),/EM ALTA/);assert.equal(view.root.findAllByType('time').length,0);assert.ok(view.root.findAllByType(CoverCard).every(card=>[1,2].includes(card.props.item.id)));assert.ok(view.root.findAllByType('div').some(n=>n.props.className==='upcoming-track is-marquee'));assert.ok(view.root.findAllByType('a').some(n=>n.props.href==='/obra/jogos/1'));
 const want=button('Quero jogar: Fixture 1');assert.ok(!want.parent.findAllByType('a').length);await act(async()=>want.props.onClick());assert.deepEqual(updates,[[1,'want']]);await act(async()=>button('Já está na biblioteca: Fixture 2').props.onClick());assert.equal(updates.length,1);
 await act(async()=>button('Mais jogos em alta').props.onClick());assert.equal(moves,1);await act(async()=>view.root.findAllByType('button').find(n=>n.props.className==='upcoming-all').props.onClick());assert.ok(view.root.findAllByType('div').some(n=>n.props.className==='upcoming-track is-expanded'));assert.equal(view.root.findAllByType(CoverCard).length,2);await unmount();
 await mount({mode:'trending',state:{loading:true}});assert.ok(view.root.findAllByProps({'aria-label':'Carregando jogos em alta'}).length);await unmount();
 await mount({mode:'trending',state:{games:[rows[2]]}});assert.match(json(),/Nenhum jogo em alta verificado/);
 await unmount();await mount({mode:'trending',state:{curated:true,games:[...rows,{id:4,categoria:'jogos',titulo:'Unknown release',estreia:null,ano:''}]},library});assert.match(json(),/Unknown release/);assert.match(json(),/Data a confirmar/);assert.match(json(),/Fixture 3/);assert.doesNotMatch(json(),/EM BREVE/);
 await unmount();pageState={games:[1,2,3,4].map(id=>game(id,'2026-10-20')),featured:{games:[5,6,7,8,9].map(id=>game(id,'2026-10-20'))},recent:{games:[]},upcoming:{games:[rows[2]]},trending:{curated:true,games:rows},loading:false};
 const Page=load('pages/jogos.js').default;await act(async()=>{view=create(React.createElement(Page));});
 const hero=view.root.findByProps({'data-section':'hero'}).props['data-items'],featured=view.root.findByProps({'data-section':'featured'}).props['data-items'];assert.equal(hero[0],load('game-highlights.config.js').default[0]);assert.equal(hero[0].id,'gta-vi');assert.ok(hero.slice(1).every(h=>!featured.some(g=>String(g.id)===h.id)));
 const headings=view.root.findAllByType('h2').map(h=>h.props.id);assert.ok(headings.indexOf('game-trending')<headings.indexOf('game-upcoming'));assert.ok(headings.includes('game-trending'));
 console.log('Game home components passed: shared covers/rail, future releases filtered normally, complete manual curation including unknown dates, canonical links, independent library controls, navigation, expanded grid, skeleton and empty state.');
}finally{await unmount();}})().catch(error=>{console.error(error);process.exitCode=1;});
