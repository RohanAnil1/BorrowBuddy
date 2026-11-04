import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/minia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = resolve('Design/borrowbuddy-logo-concepts');
const browser = await chromium.launch({headless:true, executablePath:'C:/Users/minia/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'});
const results = [];
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  for (const version of ['v1','v2']) {
    await page.goto(pathToFileURL(join(root, `preview-${version}.html`)).href);
    await page.evaluate(() => document.fonts.ready);
    for (const [label, selector] of [['scale','Scale ladder (height in px)'],['treatments','Treatments'],['contexts','Contexts']]) {
      const headings = page.getByRole('heading', {name:selector,exact:true});
      if (await headings.count() !== 3) throw new Error(`Missing ${version} ${label} groups`);
      for (let index=0;index<3;index++) {
        const group=headings.nth(index).locator('..');
        const path=join(root, `review-${version}-${label}-${index+1}.png`);
        await group.screenshot({path});
        results.push({version,group:label,concept:index+1,image:resolve(path)});
      }
    }
    await page.getByRole('heading',{name:'Shelf test',exact:true}).locator('..').screenshot({path:join(root,`review-${version}-shelf.png`)});
  }
  await writeFile(join(root,'render-review.json'),JSON.stringify({renderer:'Chromium',deviceScaleFactor:1,conceptVersions:2,groups:results},null,2));
  console.log('Rendered both versions: size ladders, treatments, contexts and peer shelves.');
} finally { await browser.close(); }
