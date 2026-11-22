import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
test("real WebGL, all keyboard shapes, Chinese sampling, interruption and reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("CONTEXT_LOST"))
      errors.push(m.text());
  });
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    (window as unknown as { cameraCalls: number }).cameraCalls = 0;
    navigator.mediaDevices.getUserMedia = (c) => {
      (window as unknown as { cameraCalls: number }).cameraCalls++;
      return original(c);
    };
  });
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator(".performance")).toContainText("51,020", {
    timeout: 15000,
  });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => (window as unknown as { cameraCalls: number }).cameraCalls,
    ),
  ).toBe(1);
  await mkdir("artifacts", { recursive: true });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "artifacts/01-tree.png" });
  for (const n of ["1", "2", "3"]) {
    await page.keyboard.press(n);
    await expect(page.locator("main")).toHaveAttribute(
      "data-mode",
      "NUMBER_" + n,
    );
    await page.waitForTimeout(n === "3" ? 650 : 1500);
    await page.screenshot({ path: `artifacts/02-number-${n}.png` });
    if (n === "3") {
      await expect(page.locator("main")).toHaveAttribute("data-mode", "TEXT_CHRISTMAS", { timeout: 1500 });
    }
  }
  await page.keyboard.press("o");
  await expect(page.locator("main")).toHaveAttribute("data-mode", "NUMBER_3");
  await page.keyboard.press("t");
  await expect(page.locator("main")).toHaveAttribute(
    "data-mode",
    "TEXT_CHRISTMAS",
  );
  await page.waitForTimeout(3200);
  await page.screenshot({ path: "artifacts/03-message.png" });
  // Direct source-level sampler checks run on Vite dev only. Production tests
  // exercise the bundled sampler through both actual keyboard morphs and screenshots.
  if (!process.env.E2E_PRODUCTION) {
    const sampled = await page.evaluate(async () => {
      const path = "/src/three/ParticleText.ts";
      const { ParticleText } = await import(/* @vite-ignore */ path);
      const points = await new ParticleText().create(15000, {
        text: "圣诞快乐",
        width: 13,
      });
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (let i = 0; i < points.length; i += 3) {
        minX = Math.min(minX, points[i]);
        maxX = Math.max(maxX, points[i]);
        minY = Math.min(minY, points[i + 1]);
        maxY = Math.max(maxY, points[i + 1]);
      }
      return {
        length: points.length,
        width: maxX - minX,
        height: maxY - minY,
        finite: [...points].every(Number.isFinite),
      };
    });
    expect(sampled.length).toBe(45000);
    expect(sampled.finite).toBe(true);
    expect(sampled.width).toBeGreaterThan(12.8);
    expect(sampled.height).toBeGreaterThan(1);
  }
  await page.keyboard.press("Space");
  await expect(page.locator("main")).toHaveAttribute(
    "data-mode",
    "TEXT_HAPPY",
  );
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "artifacts/04-question.png" });
  await page.keyboard.press("f");
  await expect(page.locator("main")).toHaveAttribute("data-mode", "TREE_RESET");
  await expect(page.locator("main")).toHaveAttribute("data-mode", "INITIAL", {
    timeout: 10000,
  });
  await page.keyboard.press("o");
  await page.waitForTimeout(200);
  await page.keyboard.press("3");
  await page.waitForTimeout(250);
  await page.keyboard.press("r");
  await expect(page.locator("main")).toHaveAttribute("data-mode", "INITIAL", {
    timeout: 10000,
  });
  await page.reload();
  await expect(page.locator("main")).toHaveAttribute("data-mode", "INITIAL");
  await page.keyboard.press("2");
  await expect(page.locator("main")).toHaveAttribute("data-mode", "NUMBER_2");
  expect(errors).toEqual([]);
});
test("automatically requests camera once, starts local inference and releases on pagehide", async ({ page }) => {
  const external: string[] = [];
  page.on("request", r => {
    if (!r.url().startsWith("http://127.0.0.1:5173") && !r.url().startsWith("blob:") && !r.url().startsWith("data:")) external.push(r.url());
  });
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    Object.assign(window, { cameraCalls: 0, cameraTracks: [] });
    navigator.mediaDevices.getUserMedia = async c => {
      const state = window as unknown as {cameraCalls:number;cameraTracks:MediaStreamTrack[]};
      state.cameraCalls++;
      const stream = await original(c);
      state.cameraTracks.push(...stream.getTracks());
      return stream;
    };
  });
  await page.goto("/");
  await expect(page.locator(".status-heading")).toContainText("HAND TRACKING", {timeout:65000});
  await expect(page.locator(".start")).toHaveCount(0);
  await expect(page.locator(".status")).toContainText("worker");
  expect(await page.evaluate(() => (window as unknown as {cameraCalls:number}).cameraCalls)).toBe(1);
  expect(page.workers().length).toBe(1);
  await page.screenshot({path:"artifacts/05-camera-local.png"});
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", {persisted:true})));
  expect(await page.evaluate(() => (window as unknown as {cameraTracks:MediaStreamTrack[]}).cameraTracks.every(t=>t.readyState==="ended"))).toBe(true);
  await expect(page.locator(".status")).toContainText("已暂停");
  await expect.poll(() => page.workers().length).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", {persisted:true})));
  await expect(page.locator(".status-heading")).toContainText("HAND TRACKING", {timeout:65000});
  expect(await page.evaluate(() => (window as unknown as {cameraCalls:number}).cameraCalls)).toBe(2);
  expect(page.workers().length).toBe(1);
  expect(external).toEqual([]);
});
test("denied camera preserves keyboard fallback; responsive viewport and question auto-return", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Camera permission denied", "NotAllowedError");
    };
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("键盘");
  await page.keyboard.press("1");
  await expect(page.locator("main")).toHaveAttribute("data-mode", "NUMBER_1");
  await page.getByLabel("关闭提示").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "artifacts/06-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.keyboard.press("Space");
  await expect(page.locator("main")).toHaveAttribute(
    "data-mode",
    "TEXT_HAPPY",
  );
  await expect(page.locator("main")).toHaveAttribute("data-mode", "INITIAL", {
    timeout: 18000,
  });
});
