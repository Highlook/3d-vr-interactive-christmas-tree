import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 90000,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel: "msedge",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: process.env.E2E_PRODUCTION
      ? "npm run preview -- --port 5173 --strictPort"
      : "npm run dev -- --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.E2E_PRODUCTION,
  },
});
