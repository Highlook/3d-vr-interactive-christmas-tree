import { test, expect } from '@playwright/test';

test('restored ring stage fits viewport while tree base rests on its centre', async ({page})=>{
  test.skip(!!process.env.E2E_PRODUCTION,'development scene inspection');
  await page.goto('/');
  await page.waitForFunction(()=> (window as any).__christmasScene?.time > 1);
  const placement=await page.evaluate(()=>{
    const s=(window as any).__christmasScene;
    const group=s.ParticleTreeGroup;
    const v=group.position.clone();
    let minX=Infinity,maxX=-Infinity,minY=Infinity;
    s.planet.updateMatrixWorld(true);
    s.planet.traverse((o:any)=>{
      // The haze disk fades to zero alpha before its geometric boundary.
      if (o.name==='translucent-stage-light') return;
      const a=o.geometry?.getAttribute('position');
      if (!a) return;
      for(let i=0;i<a.count;i++){
        v.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).project(s.camera);
        minX=Math.min(minX,v.x);maxX=Math.max(maxX,v.x);minY=Math.min(minY,v.y);
      }
    });
    return {minX,maxX,minY,scale:group.scale.x,
      baseY:group.position.y-3.8*group.scale.y*Math.cos(group.rotation.x),
      surfaceY:s.planet.position.y+.025};
  });
  expect(placement.minX).toBeGreaterThan(-1);
  expect(placement.maxX).toBeLessThan(1);
  expect(placement.minY).toBeGreaterThan(-1);
  expect(placement.scale).toBe(1.17);
  expect(Math.abs(placement.baseY-placement.surfaceY)).toBeLessThan(.015);
});

test('ribbon and volumetric star converge into upright words and return', async ({page})=>{
  test.skip(!!process.env.E2E_PRODUCTION,'development scene inspection');
  const errors: string[]=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(()=>!!(window as any).__christmasScene);
  await page.keyboard.press('t');
  await expect(page.locator('main')).toHaveAttribute('data-mode','TEXT_CHRISTMAS');
  await page.waitForFunction(()=>{
    const s=(window as any).__christmasScene;
    return s.ribbon.children.every((p:any)=>p.material.uniforms.uToTree.value===0 && p.material.uniforms.uDecorationProgress.value===1);
  });
  const result=await page.evaluate(()=>{
    const s=(window as any).__christmasScene;
    return [...s.ribbon.children,...s.topper.children].map((p:any)=>({
      visible:p.visible && p.parent.visible,
      count:p.geometry.getAttribute('aDecorationTo').count,
      targetMagnitude: p.geometry.getAttribute('aDecorationTo').array.reduce((a:number,v:number)=>a+Math.abs(v),0),
      tree:p.material.uniforms.uToTree.value,
    }));
  });
  expect(result).toHaveLength(4);
  result.forEach(p=>{expect(p.visible).toBe(true);expect(p.tree).toBe(0);expect(p.count).toBeGreaterThan(0);expect(p.targetMagnitude).toBeGreaterThan(10);});
  await page.screenshot({path:'artifacts/upright-christmas.png'});
  await page.keyboard.press('f');
  await page.waitForTimeout(1600);
  expect(await page.evaluate(()=>{
    const s=(window as any).__christmasScene;
    return [...s.ribbon.children,...s.topper.children].every((p:any)=>p.material.uniforms.uToTree.value===1);
  })).toBe(true);
  await page.screenshot({path:'artifacts/enlarged-tree-stage.png'});
  expect(errors).toEqual([]);
});
