// Component tests, not browser automation. Temporary test-only dependency:
// npm.cmd install --prefix tmp/cover-component-check --no-save --legacy-peer-deps react-test-renderer@18.3.1
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const React=require('react'),{transformSync}=require('next/dist/build/swc');
const rendererRequire=createRequire(path.resolve(process.argv[2]||'tmp/cover-component-check/package.json'));
const {create,act}=rendererRequire('react-test-renderer');
const modules=new Map();
function load(file){
 file=path.resolve(file.endsWith('.js')?file:file+'.js');if(modules.has(file))return modules.get(file).exports;
 const module={exports:{}};modules.set(file,module);
 const code=transformSync(fs.readFileSync(file,'utf8'),{filename:file,jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}}).code;
 const local=createRequire(file),resolve=name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name)):local(name);
 new Function('require','module','exports',code)(resolve,module,module.exports);return module.exports;
}
const priorWindow=global.window,priorFetch=global.fetch,requests=[];
global.window={sessionStorage:{getItem:()=>null,setItem:()=>{}},addEventListener(){},removeEventListener(){}};
global.fetch=async url=>{requests.push(url);return {ok:true,json:async()=>({cover:{url:'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/coFixture.jpg'},fallback:{url:'https://media.rawg.io/media/games/fixture.jpg'}})};};
const {CollectionPortrait}=load('components/games/CollectionArtwork.js');
const favorite={id:'collection-uuid',title:'Portal 2',rawg_id:4200,cover_url:'https://media.rawg.io/media/games/saved.jpg',rawg_additional:'https://media.rawg.io/media/screenshots/other.jpg',platforms:[{provider:'steam',external_id:'620'}]};
let view;
const mount=async game=>{await act(async()=>{view=create(React.createElement(CollectionPortrait,{game}),{createNodeMock:()=>({})});await new Promise(setImmediate);});};
const root=()=>view.root.findAllByType('div').find(node=>node.props.className?.includes('game-portrait-cover'));
const image=()=>view.root.findByType('img');
(async()=>{try{
 await mount(favorite);assert.equal(image().props.title,'Capa: IGDB');assert.equal(requests.length,1);assert.match(requests[0],/id=4200$/);
 act(()=>image().props.onLoad());assert.equal(root().props['data-image-pending'],false);
 await act(async()=>view.unmount());
 // A warm image can load before passive effects. It must remain visible.
 view=create(React.createElement(CollectionPortrait,{game:JSON.parse(JSON.stringify(favorite))}),{createNodeMock:()=>({})});
 image().props.onLoad();await act(async()=>{await new Promise(setImmediate);});assert.equal(root().props['data-image-pending'],false);assert.equal(requests.length,1);
 act(()=>image().props.onError());assert.equal(image().props.srcSet,undefined);assert.equal(image().props.title,'Capa: IGDB');
 act(()=>image().props.onError());assert.equal(image().props.title,'Capa: Steam');assert.match(image().props.src,/620\/library_600x900.jpg$/);
 act(()=>image().props.onError());assert.match(image().props.src,/shared.fastly/);
 act(()=>image().props.onError());assert.match(image().props.src,/620\/header.jpg$/);
 act(()=>image().props.onError());act(()=>image().props.onError());assert.equal(image().props.title,'Arte: RAWG');
 act(()=>image().props.onError());act(()=>image().props.onError());assert.equal(image().props.src,favorite.rawg_additional);
 act(()=>image().props.onError());assert.equal(view.root.findAllByType('img').length,0);assert.ok(view.root.findAllByType('div').some(node=>node.props['aria-label']==='Capa indisponível de Portal 2'));
 await act(async()=>view.unmount());await mount({...favorite,rawg_id:null});assert.match(image().props.src,/620\/library_600x900.jpg$/);assert.equal(requests.length,1);
 act(()=>image().props.onLoad());assert.equal(root().props['data-image-pending'],false);
 await act(async()=>view.update(React.createElement(CollectionPortrait,{game:{...favorite,rawg_id:null,cover_url:'https://media.rawg.io/media/games/updated.jpg'}})));
 act(()=>image().props.onLoad());assert.equal(root().props['data-image-pending'],false);
 console.log('Components passed: cached favorite/reload, RAWG identity, responsive original retry, Steam portrait/CDN/header recovery, RAWG alternatives, branded fallback and changed artwork.');
}finally{if(view)await act(async()=>view.unmount());global.window=priorWindow;global.fetch=priorFetch;}})().catch(error=>{console.error(error);process.exitCode=1;});
