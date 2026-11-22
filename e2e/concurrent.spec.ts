import { expect, test, type Page } from "@playwright/test";
import type { InputGesture } from "../src/three/AnimationStateMachine";

// Gesture events are injected at SceneManager's public boundary. Rendering and
// mouse input are real browser/WebGL operations; this is not a camera inference test.
const gesture = (page: Page, value: InputGesture) => page.evaluate(value => {
  (window as any).__christmasScene.gesture(value);
}, value);
const state = (page: Page, value: string) => expect(page.locator("main")).toHaveAttribute("data-mode", value);
const inspect = (page: Page) => page.evaluate(() => {
  const s = (window as any).__christmasScene;
  const n = s.numbers;
  return {
    state: s.machine.state,
    x: s.ParticleTreeGroup.rotation.x,
    y: s.ParticleTreeGroup.rotation.y,
    dragging: !!s.drag,
    numberInScene: n.parent === s.scene,
    numberInTree: s.ParticleTreeGroup.children.includes(n),
    targetIsTree: s.particles.morph.treeTarget === 1,
    targetUnchanged: s.particles.morph.target.every((v: number, i: number) => v === s.__regression.target[i]),
    buffersStable: n.geometry === s.__regression.geometry && Object.entries(s.__regression.attributes).every(([key, attribute]) => n.geometry.getAttribute(key) === attribute) && n.geometry.getAttribute("position").array === s.__regression.buffer,
    numberVisible: n.visible,
    opacity: n.material.uniforms.uOpacity.value,
    morph: n.material.uniforms.uMorph.value,
    sceneRotation: s.scene.rotation.toArray(),
    scenePosition: s.scene.position.toArray(),
    fixedHalos: s.halos.filter((h: any) => !h.userData.tree).map((h: any) => h.matrixWorld.toArray()),
    draws: s.renderer.info.render.calls,
    webgl: s.renderer.getContext() instanceof WebGL2RenderingContext || s.renderer.getContext() instanceof WebGLRenderingContext,
  };
});

test.beforeEach(async ({ page }) => {
  test.skip(!!process.env.E2E_PRODUCTION, "development scene inspection hook");
  await page.goto("/");
  await page.waitForFunction(() => {
    const s = (window as any).__christmasScene;
    return !!s?.numbers && s.renderer.info.render.calls > 0;
  });
  await page.evaluate(() => {
    const s = (window as any).__christmasScene;
    s.__regression = {
      target: s.particles.morph.target.slice(),
      geometry: s.numbers.geometry,
      attributes: { ...s.numbers.geometry.attributes },
      buffer: s.numbers.geometry.getAttribute("position").array,
    };
  });
});

test("held pointer keeps rotating through injected ONE/TWO/THREE/FIST/PALM events", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const before = await inspect(page);
  expect(before.webgl).toBe(true);
  await expect.poll(async () => (await inspect(page)).draws).toBeGreaterThan(0);
  await page.mouse.move(450, 430);
  await page.mouse.down();
  try {
    let x = 450;
    for (const [input, expected] of [["ONE", "NUMBER_1"], ["TWO", "NUMBER_2"], ["THREE", "NUMBER_3"], ["FIST", "TREE_RESET"], ["PALM", "TEXT_HAPPY"]] as const) {
      await gesture(page, input);
      await state(page, expected);
      const start = await inspect(page);
      x += 95;
      await page.mouse.move(x, 460, { steps: 6 });
      const moved = await inspect(page);
      expect(moved.dragging).toBe(true);
      expect(moved.y - start.y).toBeGreaterThan(0.3);
      expect(moved.buffersStable).toBe(true);
      expect(moved.numberInScene).toBe(true);
      expect(moved.numberInTree).toBe(false);
      if (input === "ONE" || input === "TWO" || input === "THREE") {
        expect(moved.targetIsTree).toBe(true);
        expect(moved.targetUnchanged).toBe(true);
      }
      expect(moved.sceneRotation).toEqual(before.sceneRotation);
      expect(moved.scenePosition).toEqual(before.scenePosition);
      expect(moved.fixedHalos).toEqual(before.fixedHalos);
    }
    await page.waitForTimeout(1200);
    await state(page, "TEXT_HAPPY"); // FIST and PALM both superseded THREE's timer.
  } finally { await page.mouse.up(); }
  expect(errors).toEqual([]);
});

test("independent numbers finish before THREE's automatic Christmas message and survive resize", async ({ page }) => {
  await gesture(page, "TWO");
  await state(page, "NUMBER_2");
  await expect.poll(async () => (await inspect(page)).opacity).toBe(1);
  await expect.poll(async () => (await inspect(page)).morph).toBe(1);
  await page.setViewportSize({ width: 1000, height: 740 });
  await page.waitForTimeout(200);
  await state(page, "NUMBER_2");
  const resized = await inspect(page);
  expect(resized.numberVisible).toBe(true);
  expect(resized.buffersStable).toBe(true);
  expect(resized.targetUnchanged).toBe(true);
  const elapsed = await page.evaluate(async () => {
    const s = (window as any).__christmasScene;
    const start = performance.now();
    s.gesture("THREE");
    await new Promise<void>(resolve => {
      const observer = new MutationObserver(() => {
        if (document.querySelector("main")?.getAttribute("data-mode") === "TEXT_CHRISTMAS") {
          observer.disconnect(); resolve();
        }
      });
      observer.observe(document.querySelector("main")!, { attributes: true, attributeFilter: ["data-mode"] });
    });
    return performance.now() - start;
  });
  expect(elapsed).toBeGreaterThanOrEqual(950);
  expect(elapsed).toBeLessThan(1800);
  await state(page, "TEXT_CHRISTMAS");
  await expect.poll(async () => (await inspect(page)).numberVisible).toBe(false);
  expect((await inspect(page)).buffersStable).toBe(true);
});

for (const input of ["FIST", "PALM"] as const) {
  test(`${input} cancels THREE's delayed message`, async ({ page }) => {
    await gesture(page, "THREE");
    await page.waitForTimeout(250);
    await gesture(page, input);
    await page.waitForTimeout(900);
    await state(page, input === "FIST" ? "TREE_RESET" : "TEXT_HAPPY");
    if (input === "FIST") await expect(page.locator("main")).toHaveAttribute("data-mode", "INITIAL", { timeout: 2000 });
  });
}

test("dragging text preserves its world frame and the fixed background", async ({ page }) => {
  await gesture(page, "PALM");
  await state(page, "TEXT_HAPPY");
  const before = await inspect(page);
  await page.mouse.move(500, 420);
  await page.mouse.down();
  await page.mouse.move(860, 500, { steps: 15 });
  await page.mouse.up();
  const after = await inspect(page);
  expect(after.y - before.y).toBeGreaterThan(1);
  expect(after.sceneRotation).toEqual(before.sceneRotation);
  expect(after.scenePosition).toEqual(before.scenePosition);
  expect(after.fixedHalos).toEqual(before.fixedHalos);
  const textWorldFrame = await page.evaluate(() => {
    const s = (window as any).__christmasScene;
    return s.ParticleTreeGroup.matrixWorld.clone().multiply(s.particles.material.uniforms.uTextFrame.value).elements;
  });
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  textWorldFrame.forEach((value: number, i: number) => expect(value).toBeCloseTo(identity[i], 6));
});
