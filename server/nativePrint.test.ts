import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { isAppleNativeShell } from "../src/lib/platform.ts";

/*
 * دليل الإجراء المطبوع: داخل غلاف iOS طبقةٌ داخل الصفحة (لا window.open)، وفي المتصفح window.open كما كان.
 */
const read = (f: string) => fs.readFileSync(f, "utf8");
const skills = read("src/components/views/SkillsView.tsx");
const openFn = /const open=\(\)=>\{[\s\S]*?\n  \};/.exec(skills)?.[0] || "";

test("in-app: open() takes the in-page overlay branch before any window.open", () => {
  assert.ok(openFn);
  const native = openFn.indexOf("isAppleNativeShell()");
  const popup = openFn.indexOf("window.open(");
  assert.ok(native >= 0 && popup > native, "فرع التطبيق يسبق window.open");
  assert.match(openFn.slice(native, popup), /setPrintUrl\(url\);return/);
  assert.match(skills, /import \{ isAppleNativeShell \} from "\.\.\/\.\.\/lib\/platform"/);
  assert.ok(!/function\s+isNative|const\s+isNative\w*\s*=/.test(skills), "كاشف واحد مشترك");
});

test("browser: window.open + print path is unchanged", () => {
  assert.match(openFn, /window\.open\(url,"_blank"\)/);
  assert.match(openFn, /w\.addEventListener\("load",\(\)=>\{try\{w\.focus\(\);w\.print\(\)\}/);
});

test("detector: false without Capacitor (browser), true only for native iOS", () => {
  assert.equal(isAppleNativeShell(), false);
  (globalThis as any).window = { Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } };
  assert.equal(isAppleNativeShell(), true);
  (globalThis as any).window = { Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } };
  assert.equal(isAppleNativeShell(), false);
  delete (globalThis as any).window;
});

test("overlay hides the app when printing and has Arabic UI text without browser wording", () => {
  const css = read("src/finish.css");
  assert.match(css, /@media print\s*\{[^}]*body\.manual-print-open > #root\s*\{\s*display:\s*none/);
  const tsx = read("src/components/ManualPrintOverlay.tsx");
  assert.match(tsx, /اطبع/);
  assert.ok(!/Safari|متصفح/.test(tsx.replace(/\/\*[\s\S]*?\*\//, "")), "لا ذكر للمتصفح في الواجهة");
});
