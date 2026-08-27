import { chromium } from "playwright";
import path from "node:path";
import { pathToFileURL } from "node:url";

const output = process.argv[2];
if (!output) throw new Error("Usage: node browser-smoke.mjs OUTPUT.zip");

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});

try {
  const page = await browser.newPage({ acceptDownloads: true });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(pathToFileURL(path.resolve("index.html")).href);
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 860;
    canvas.height = 12000;
    const context = canvas.getContext("2d");
    context.fillStyle = "#f8f4eb";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#e44f2a";
    context.fillRect(0, 300, canvas.width, 4200);
    context.fillRect(0, 5300, canvas.width, 4200);
    context.fillStyle = "#151515";
    context.font = "72px sans-serif";
    context.fillText("DETAIL ONE", 100, 900);
    context.fillText("DETAIL TWO", 100, 5900);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "synthetic-detail.png", { type: "image/png" }));
    const input = document.getElementById("files");
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#export").waitFor({ state: "visible" });
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export").click();
  const download = await downloadPromise;
  await download.saveAs(output);
  await page.waitForFunction(() => document.getElementById("status").dataset.kind === "success");
  const status = await page.locator("#status").textContent();
  if (!status.includes("3개 JPG")) throw new Error(`Unexpected completion status: ${status}`);
  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(" | ")}`);
  process.stdout.write(`${status}\n`);
} finally {
  await browser.close();
}
