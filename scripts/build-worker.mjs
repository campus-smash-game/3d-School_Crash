import fs from 'node:fs/promises';
let hosting;try{hosting=JSON.parse(await fs.readFile('.openai/hosting.json','utf8'))}catch{process.exit(0)}
if(hosting.static)process.exit(0);
await fs.mkdir('dist/server',{recursive:true});await fs.mkdir('dist/.openai',{recursive:true});
await fs.copyFile('worker/index.mjs','dist/server/index.js');
await fs.writeFile('dist/server/wrangler.json',JSON.stringify({name:'campus-smash',main:'index.js',compatibility_date:'2026-05-15',assets:{directory:'../client',binding:'ASSETS',run_worker_first:['/api/*']},d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000'}]}));
await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');
