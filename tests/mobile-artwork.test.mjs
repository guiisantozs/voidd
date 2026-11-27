import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import postcss from 'postcss';

test('mobile artwork adjustments cannot apply to desktop widths',async()=>{
  const css=postcss.parse(await readFile(new URL('../styles/mobile-artwork.css',import.meta.url),'utf8'));
  let count=0;
  css.walkRules(rule=>{
    count++;
    let parent=rule.parent,guarded=false;
    while(parent){
      if(parent.type==='atrule'&&parent.name==='media'&&/\(max-width:\s*700px\)/.test(parent.params))guarded=true;
      parent=parent.parent;
    }
    assert.ok(guarded,`Regra fora do escopo de celular: ${rule.selector}`);
  });
  assert.ok(count>0);
});
