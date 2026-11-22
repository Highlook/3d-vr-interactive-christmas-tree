import { test, expect } from '@playwright/test';

test('tree-only pointer inertia, independent sky and 30 second resource observation', async ({ page }) => {
  test.skip(!!process.env.E2E_PRODUCTION, 'development inspection hook');
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.waitForTimeout(2500);
  const inspect = () => page.evaluate(() => {
    const s = (window as any).__christmasScene;
    return { x:s.ParticleTreeGroup.rotation.x, y:s.ParticleTreeGroup.rotation.y,
      scene:s.scene.rotation.toArray().slice(0,3), position:s.scene.position.toArray(),
      memory:s.renderer.info.memory, geometries:s.renderer.info.memory.geometries,
      group:s.ParticleTreeGroup.children.map((c:any)=>c.type),
      time:s.time, stars:s.stars.material.uniforms.uTime.value };
  });
  const before = await inspect();
  await page.mouse.move(700,450);
  await page.mouse.down();
  await page.mouse.move(1050,510,{steps:20});
  await page.mouse.up();
  const dragged = await inspect();
  expect(dragged.y-before.y).toBeGreaterThan(1);
  expect(dragged.x).toBe(0);

  await page.waitForTimeout(700);
  const inertia = await inspect();
  expect(inertia.y).toBeGreaterThan(dragged.y);
  expect(inertia.scene).toEqual(before.scene);
  expect(inertia.position).toEqual(before.position);
  await page.mouse.move(1050,510);await page.mouse.down();
  const verticalStart=await inspect();
  await page.mouse.move(1050,680,{steps:12});await page.mouse.up();
  const vertical=await inspect();
  expect(vertical.x).toBe(0);
  expect(vertical.y).toBeCloseTo(verticalStart.y,5);
  await page.screenshot({path:'artifacts/07-tree-rotated.png'});
  const observations = [];
  for(let i=0;i<6;i++) {
    await page.waitForTimeout(5000);
    observations.push(await inspect());
  }
  expect(observations.at(-1)!.stars-before.stars).toBeGreaterThan(15);
  expect(new Set(observations.map(o=>o.geometries)).size).toBe(1);
  expect(observations.at(-1)!.y).toBeGreaterThan(observations.at(-2)!.y);
  await page.screenshot({path:'artifacts/08-sky-after-30s.png'});
  await test.info().attach('observation',{body:JSON.stringify({before,dragged,inertia,observations},null,2),contentType:'application/json'});
  expect(errors).toEqual([]);
});

test('single touch pointer rotates the same model',async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.waitForTimeout(1000);
  await page.waitForFunction(()=>!!(window as any).__christmasScene);
  const before=await page.evaluate(()=>{const r=(window as any).__christmasScene.ParticleTreeGroup.rotation;return {x:r.x,y:r.y};});
  // Use a genuine browser touch stream, including native pointer capture.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:380}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:280,y:410}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const after=await page.evaluate(()=>{const r=(window as any).__christmasScene.ParticleTreeGroup.rotation;return {x:r.x,y:r.y};});
  expect(after.x).toBe(0);expect(after.y-before.y).toBeGreaterThan(.4);
  await page.screenshot({path:'artifacts/09-touch.png'});
  await expect(page.getByRole('alert')).toHaveCount(0);
});
