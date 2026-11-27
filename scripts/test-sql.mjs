import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const modulePath=fileURLToPath(import.meta.resolve('@electric-sql/pglite'));
const checks=[['test-schema-sql'],['test-steam-sql'],['test-game-collection-sql'],['test-game-journey-sql'],['test-review-safety-sql'],['test-community-reviews-sql'],['test-notifications-sql'],['test-avatars-sql'],['test-lists-sql','--animes','--social','--profile-content'],['test-reviews-feed-sql'],['test-global-budget-sql']];
for(const [name,...flags]of checks){
 const result=spawnSync(process.execPath,[`scripts/${name}.mjs`,modulePath,...flags],{stdio:'inherit'});
 if(result.status!==0){process.exitCode=1;break;}
}
