import { defineConfig } from 'vite';
import { readFileSync, existsSync } from 'node:fs';

// 같은 빌드를 도메인 루트와 GitHub Pages의 저장소 경로에서 제공한다.
export default defineConfig({
  base: './',
  build:{outDir:existsSync('.openai/hosting.json')&&!JSON.parse(readFileSync('.openai/hosting.json','utf8')).static?'dist/client':'dist'},
  plugins:[{name:'preload-campus',transformIndexHtml(){
    const {file}=JSON.parse(readFileSync('public/baked/manifest.json','utf8'));
    return[{tag:'link',attrs:{rel:'preload',as:'fetch',href:'./baked/'+file,crossorigin:''},injectTo:'head'}];
  }}],
});
