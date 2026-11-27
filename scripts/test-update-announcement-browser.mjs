// Isolated browser fixtures only; no real account login or production writes.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { currentUpdate } from '../updates.config.js';
import { updateSeenKey } from '../lib/update-announcements.js';

const browser = await chromium.launch({ ...(process.env.VOID_TEST_BROWSER?{executablePath:process.env.VOID_TEST_BROWSER}:{}), headless: true });
const idA = '00000000-0000-4000-8000-000000000091', idB = '00000000-0000-4000-8000-000000000092';
const errors = [];
const avatars = ['Kratos', 'Aloy', 'Arthur', 'Geralt', 'Lara', 'Jin'].map((name, i) => ({ id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,slug:`fixture-${i+1}`,character_name:name,media_type:'jogos',media_id:'58175',media_title:'Fixture de avatares',image_path:`fixture-${i+1}/${String(i+1).repeat(16)}/384.webp`,bg_color:['#67497d','#495879','#6b465e','#435e64','#6a5b3d','#4f476a'][i],is_published:true }));
async function setup(owner = idA, { mobile = false, seen = [], blocker = false } = {}) {
 const context = await browser.newContext({ viewport: mobile ? { width:390,height:844 } : { width:1280,height:900 } });
 const user = owner ? { id:owner,email:'update-fixture@example.test',app_metadata:{},user_metadata:{display_name:'Jogador de teste'},aud:'authenticated',role:'authenticated' } : null;
 const token = owner ? Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:owner,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture' : null;
 await context.addInitScript(({ user,token,seen,blocker }) => {
  if(user)localStorage.setItem('sb-voidfixture-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user}));
  seen.forEach(key=>localStorage.setItem(key,'seen'));
  if(blocker)document.addEventListener('DOMContentLoaded',()=>{const dialog=document.createElement('div');dialog.id='fixture-other-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','Outro modal de teste');dialog.textContent='Outro modal';document.body.append(dialog);});
 }, { user,token,seen,blocker });
 await context.route('https://voidfixture.supabase.co/**',async route=>{
  const url=new URL(route.request().url());let value=[];
  if(url.pathname.includes('/storage/v1/'))return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#614773"/><circle cx="48" cy="35" r="16" fill="#c8a9e1"/><path d="M16 96a32 32 0 0 1 64 0" fill="#b594d0"/></svg>'});
  if(url.pathname.includes('/auth/v1/'))value=user;
  else if(url.pathname.endsWith('/rpc/void_username_self'))value={username:'jogador_teste',display_name:'Jogador de teste',username_required:false,display_required:false,account_display_required:false};
  else if(url.pathname.endsWith('/avatars'))value=avatars;
  else if(url.pathname.endsWith('/void_community_profiles'))value=user?[{user_id:owner,display_name:'Jogador de teste',username:'jogador_teste'}]:[];
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
 });
 await context.route('**/api/game-collection?**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({rows:[],games:[],stats:{games:0,connected:0,minutes:null,completed:null,unlocked:null,unknownAchievements:0},highlights:[],visibility:'private',connected:false,lastSync:null,owner:true})}));
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://localhost:3107/jogos/biblioteca',{waitUntil:'domcontentloaded'});
 return {context,page,modal:page.getByRole('dialog',{name:currentUpdate.title,exact:true})};
}
async function shown(test) {
 await test.modal.waitFor();
 assert.equal(await test.modal.getAttribute('aria-modal'),'true');
 assert(await test.page.evaluate(()=>document.getElementById('__next').inert));
 assert(await test.modal.getByRole('button',{name:'Conferir agora',exact:true}).evaluate(button=>button===document.activeElement));
 await test.modal.locator('.vu-avatar-preview .va-portrait').last().waitFor();
 assert.equal(await test.modal.locator('.vu-avatar-preview .va-portrait').count(),6);
}
async function wasSeen(test, owner=idA) {
 await test.modal.waitFor({state:'detached'});
 assert.equal(await test.page.evaluate(key=>localStorage.getItem(key),updateSeenKey(currentUpdate,owner)),'seen');
 assert.equal(await test.page.evaluate(()=>document.getElementById('__next').inert),false);
}
try {
 const guest=await setup(null);await guest.page.waitForTimeout(1500);assert.equal(await guest.modal.count(),0);await guest.context.close();
 const desktop=await setup();
 assert.equal(await desktop.modal.count(),0,'Do not open during initial rendering');
 await shown(desktop);
 await desktop.page.screenshot({path:'tmp/update-announcement-desktop.png',fullPage:true});
 await desktop.page.keyboard.press('Tab');assert(await desktop.modal.getByRole('button',{name:'Depois',exact:true}).evaluate(el=>el===document.activeElement));
 await desktop.page.keyboard.press('Tab');assert(await desktop.modal.getByRole('button',{name:'Fechar janela'}).evaluate(el=>el===document.activeElement));
 await desktop.page.keyboard.press('Shift+Tab');assert(await desktop.modal.getByRole('button',{name:'Depois',exact:true}).evaluate(el=>el===document.activeElement));
 await desktop.page.keyboard.press('Escape');await wasSeen(desktop);
 await desktop.page.reload({waitUntil:'domcontentloaded'});await desktop.page.waitForTimeout(1500);assert.equal(await desktop.modal.count(),0,'Seen update must not reopen after reload');await desktop.context.close();
 const mobile=await setup(idA,{mobile:true});await shown(mobile);
 await mobile.page.screenshot({path:'tmp/update-announcement-mobile.png',fullPage:true});
 assert(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No mobile horizontal overflow');
 const primary=await mobile.modal.getByRole('button',{name:'Conferir agora'}).boundingBox(),later=await mobile.modal.getByRole('button',{name:'Depois'}).boundingBox();
 assert(primary.y<later.y&&Math.abs(primary.width-later.width)<2,'Mobile buttons must stack at equal width');
 await mobile.modal.getByRole('button',{name:'Depois',exact:true}).click();await wasSeen(mobile);await mobile.context.close();
 const crossAccount=await setup(idB,{seen:[updateSeenKey(currentUpdate,idA),updateSeenKey({...currentUpdate,version:'v0'},idB)]});await shown(crossAccount);
 await crossAccount.modal.getByRole('button',{name:'Fechar janela'}).click();await wasSeen(crossAccount,idB);await crossAccount.context.close();
 const outside=await setup();await shown(outside);await outside.page.mouse.click(3,3);await wasSeen(outside);await outside.context.close();
 const cta=await setup();await shown(cta);await cta.modal.getByRole('button',{name:'Conferir agora',exact:true}).click();await cta.page.waitForURL('**/jogos/colecao');await wasSeen(cta);await cta.context.close();
 const delayed=await setup(idA,{blocker:true});await delayed.page.waitForTimeout(1500);assert.equal(await delayed.modal.count(),0,'Do not stack above another dialog');await delayed.page.locator('#fixture-other-dialog').evaluate(el=>el.remove());await shown(delayed);await delayed.modal.getByRole('button',{name:'Depois'}).click();await wasSeen(delayed);await delayed.context.close();
 assert.deepEqual(errors,[]);
 console.log('Update browser checks passed: guests, delay, published avatar preview, autofocus/trap, Escape, X, outside, Later, CTA/navigation, persistence, accounts/versions, modal coexistence and mobile layout.');
} finally {await browser.close();}
