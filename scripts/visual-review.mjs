import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(process.env.REVIEW_URL || 'http://127.0.0.1:5174/');
 await page.waitForSelector('.status-heading .connected', {timeout:65000});
 await page.waitForFunction(() => document.querySelector('.performance')?.textContent?.includes('51,020'));
 await page.waitForTimeout(1000);
 await mkdir('artifacts',{recursive:true});
 await page.screenshot({path:'artifacts/visual-tree.png'});
 await page.keyboard.press('1');await page.waitForTimeout(1200);
 await page.keyboard.press('2');await page.waitForTimeout(400);
 await page.screenshot({path:'artifacts/visual-number-transition.png'});
 await page.waitForTimeout(600);await page.screenshot({path:'artifacts/visual-number-settled.png'});
 await page.keyboard.press('t');await page.waitForTimeout(3500);
 await page.screenshot({path:'artifacts/visual-calligraphy.png'});
 await page.keyboard.press('Space');await page.waitForTimeout(3000);
 await page.screenshot({path:'artifacts/visual-happy.png'});
 await writeFile('artifacts/visual-review.json',JSON.stringify({errors,performance:await page.locator('.performance').innerText()},null,2));
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('Visual review captured; no browser errors.');
} finally {await browser.close();}
