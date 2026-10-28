#!/usr/bin/env node
/**
 * Regenerates the screenshots used by README.md from the real extension UI.
 *
 * Usage:
 *   npm install
 *   npx playwright install chromium
 *   npm run screenshots
 *
 * Set HEADED=1 to watch the capture in a visible browser window.
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "screenshots");
const profileDir = path.join(os.tmpdir(), `tab-manager-pro-shots-${process.pid}`);

const SAMPLE_TABS = [
  {
    url: "https://github.com/sandeshPatel06/tab-manager-pro",
    title: "sandeshPatel06/tab-manager-pro: Chrome & Firefox tab manager",
  },
  {
    url: "https://github.com/sandeshPatel06/tab-manager-pro/issues",
    title: "Issues - sandeshPatel06/tab-manager-pro",
  },
  {
    url: "https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions",
    title: "WebExtensions API - MDN Web Docs",
  },
  {
    url: "https://developer.chrome.com/docs/extensions",
    title: "Chrome Extensions documentation",
  },
  {
    url: "https://stackoverflow.com/questions/tagged/google-chrome-extension",
    title: "Newest 'google-chrome-extension' questions - Stack Overflow",
  },
  {
    url: "https://news.ycombinator.com/",
    title: "Hacker News",
  },
  {
    url: "https://web.dev/",
    title: "web.dev",
  },
  {
    url: "https://www.npmjs.com/package/playwright",
    title: "playwright - npm",
  },
  {
    url: "https://caniuse.com/",
    title: "Can I use... Support tables for HTML5, CSS3, etc",
  },
  {
    url: "https://www.figma.com/files/",
    title: "Figma",
  },
  {
    url: "https://linear.app/",
    title: "Linear - Plan and build products",
  },
  {
    url: "https://www.notion.so/",
    title: "Notion - Your connected workspace",
  },
  {
    url: "https://docs.google.com/document/u/0/",
    title: "Google Docs",
  },
  {
    url: "http://localhost:3000/",
    title: "Tab Manager Pro - local preview",
  },
];

const SETTINGS = {
  duplicateMatchMode: "ignoreQuery",
  scope: "currentWindow",
  smartKeepRule: "active",
  excludePinned: true,
  excludeMuted: true,
  excludeAudible: true,
  excludedDomains: "mail.google.com\ncalendar.google.com",
  groupPreset: "domain",
  customGroupRules: "github.com => Work\ndocs.google.com => Docs",
  autoCleanup: true,
  autoCleanupIntervalMin: 30,
  autoDiscard: true,
  autoDiscardThresholdMin: 30,
  autoBackup: true,
  defaultSortMode: "domain",
  defaultSnoozeValue: 2,
  defaultSnoozeUnit: "hours",
};

function workspaceTab(index, pinned = false) {
  const tab = SAMPLE_TABS[index % SAMPLE_TABS.length];
  return { url: tab.url, title: tab.title, pinned };
}

function makeWorkspace({ id, name, hoursAgo, count }) {
  return {
    id,
    name,
    createdAt: Date.now() - hoursAgo * 60 * 60 * 1000,
    scope: "currentWindow",
    tabs: Array.from({ length: count }, (_, index) => workspaceTab(index)),
  };
}

const WORKSPACES = [
  makeWorkspace({ id: "demo-release-qa", name: "Release 2.1 - QA", hoursAgo: 2, count: 8 }),
  makeWorkspace({ id: "demo-docs-sprint", name: "Docs Sprint", hoursAgo: 26, count: 12 }),
  makeWorkspace({ id: "demo-standup", name: "Monday Standup", hoursAgo: 50, count: 5 }),
  makeWorkspace({
    id: "demo-zen-stash",
    name: "Zen Mode stash - Oct 27",
    hoursAgo: 74,
    count: 14,
  }),
  makeWorkspace({
    id: "demo-webextensions",
    name: "WebExtensions research",
    hoursAgo: 120,
    count: 9,
  }),
];

const UNDO_STACK = [
  {
    id: "demo-undo-1",
    createdAt: Date.now() - 12 * 60 * 1000,
    items: [
      { url: SAMPLE_TABS[0].url, title: SAMPLE_TABS[0].title, pinned: false, index: 4, windowId: 1 },
      { url: SAMPLE_TABS[2].url, title: SAMPLE_TABS[2].title, pinned: false, index: 5, windowId: 1 },
    ],
  },
  {
    id: "demo-undo-2",
    createdAt: Date.now() - 40 * 60 * 1000,
    items: [
      { url: SAMPLE_TABS[5].url, title: SAMPLE_TABS[5].title, pinned: false, index: 2, windowId: 1 },
    ],
  },
];

async function openSampleTabs(context) {
  const pages = context.pages();
  const firstPage = pages[0] ?? (await context.newPage());

  await Promise.all(
    SAMPLE_TABS.slice(0, 9).map(async (sample, index) => {
      const page = index === 0 ? firstPage : await context.newPage();
      try {
        await page.goto(sample.url, { waitUntil: "domcontentloaded", timeout: 20000 });
      } catch {
        // Keep the tab even when a site blocks or times out in headless mode.
      }
      try {
        await page.evaluate((title) => {
          document.title = title;
        }, sample.title);
      } catch {
        // Error pages can reject script execution; the tab still exists.
      }
    })
  );

  await new Promise((resolve) => setTimeout(resolve, 800));
}

async function waitForImages(page) {
  await page.evaluate(async () => {
    const timeout = new Promise((resolve) => setTimeout(resolve, 4000));
    const images = [...document.images].map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    });
    await Promise.race([Promise.all(images), timeout]);
  });
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.rm(profileDir, { recursive: true, force: true });

  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      channel: "chromium",
      headless: process.env.HEADED !== "1",
      viewport: { width: 1200, height: 900 },
      colorScheme: "light",
      args: [
        `--disable-extensions-except=${root}`,
        `--load-extension=${root}`,
        "--no-first-run",
        "--no-default-browser-check",
      ],
    });

    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
    }
    const extensionId = new URL(worker.url()).host;
    console.log(`Loaded extension ${extensionId}`);

    await openSampleTabs(context);

    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await optionsPage.evaluate(
      async ({ settings, workspaces, undoStack }) => {
        await chrome.storage.sync.set({ settings });
        await chrome.storage.local.set({ workspaces, undoStack });
      },
      { settings: SETTINGS, workspaces: WORKSPACES, undoStack: UNDO_STACK }
    );
    await optionsPage.reload();
    await optionsPage.waitForFunction(
      () => document.querySelectorAll("#workspace-list option").length >= 2
    );
    await optionsPage.addStyleTag({
      content: `
        html, body { height: auto !important; }
        .main-content { overflow: visible !important; }
        .app-container { min-height: 100vh !important; }
      `,
    });
    await optionsPage.waitForTimeout(300);

    async function captureSection(section, file) {
      await optionsPage.click(`.nav-item[data-section="${section}"]`);
      if (section === "workspaces") {
        await optionsPage.selectOption("#workspace-list", "demo-release-qa");
      }
      await optionsPage.waitForTimeout(250);

      const height = await optionsPage.evaluate(() => {
        const active = document.querySelector(".content-section.active");
        const main = document.querySelector(".main-content");
        const styles = getComputedStyle(main);
        return Math.ceil(
          active.getBoundingClientRect().height +
            parseFloat(styles.paddingTop) +
            parseFloat(styles.paddingBottom) +
            24
        );
      });

      await optionsPage.setViewportSize({
        width: 1200,
        height: Math.min(1600, Math.max(760, height)),
      });
      await optionsPage.waitForTimeout(150);
      await optionsPage.screenshot({ path: path.join(outputDir, file) });
      console.log(`Wrote ${file}`);
    }

    await captureSection("general", "options.png");
    await captureSection("cleanup", "automation.png");
    await captureSection("workspaces", "workspaces.png");
    await captureSection("advanced", "advanced.png");

    await optionsPage.close();

    const popupPage = await context.newPage();
    await popupPage.setViewportSize({ width: 340, height: 720 });
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.waitForSelector("#open-tabs-list .result-title", { timeout: 15000 });
    await popupPage.waitForTimeout(600);
    await popupPage.evaluate(() => {
      document.querySelectorAll(".favicon").forEach((image) => {
        if (!image.complete || image.naturalWidth === 0) {
          image.src = "icons/icon16.png";
        }
      });
    });
    await waitForImages(popupPage);

    const popupHeight = await popupPage.evaluate(() =>
      Math.ceil(document.body.getBoundingClientRect().height)
    );
    await popupPage.setViewportSize({ width: 340, height: popupHeight });
    await popupPage.screenshot({ path: path.join(outputDir, "popup.png") });
    console.log("Wrote popup.png");

    await popupPage.emulateMedia({ colorScheme: "dark" });
    await popupPage.waitForTimeout(300);
    await popupPage.screenshot({ path: path.join(outputDir, "popup-dark.png") });
    console.log("Wrote popup-dark.png");
  } finally {
    if (context) await context.close();
    await fs.rm(profileDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
