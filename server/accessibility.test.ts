import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

/*
 * حراسة انحدار على ما أُصلح في الواجهة للوصول: تُقرأ الشيفرة كما هي، فلا يعود
 * إطار تركيزٍ ممحوّ، ولا نصٌّ دون 12px، ولا لونٌ خافت دون 4.5:1، ولا حوارٌ بلا دور.
 */
const read = (file: string) => fs.readFileSync(file, "utf8");

const luminance = (hex: string) => {
  const c = [0, 2, 4].map(i => parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
    .map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => m - n);
  return (y + 0.05) / (x + 0.05);
};

test("muted text colours reach 4.5:1 on paper surfaces", () => {
  const css = read("src/index.css");
  const token = (name: string) => new RegExp(`--${name}:(#[0-9a-f]{6})`, "i").exec(css)?.[1] || "";
  for (const fg of ["muted", "muted-2"]) {
    for (const bg of ["paper", "white"]) {
      assert.ok(contrast(token(fg), token(bg)) >= 4.5, `--${fg} on --${bg} is ${contrast(token(fg), token(bg)).toFixed(2)}:1`);
    }
  }
});

test("no input erases its focus ring and no text is set below 12px", () => {
  const css = read("src/index.css");
  assert.doesNotMatch(css, /outline:\s*(none|0)\b/);
  assert.match(css, /:focus-visible\{outline:2px solid/);
  const small = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].filter(m => Number(m[1]) < 12);
  assert.deepEqual(small.map(m => m[0]), []);
});

test("the approval dialog is an accessible, labelled modal", () => {
  const dialog = read("src/components/Dialog.tsx");
  for (const marker of ['role="dialog"', 'aria-modal="true"', "aria-labelledby", '"Escape"', '"Tab"', "previous.focus()", "aria-label={closeLabel}"]) {
    assert.ok(dialog.includes(marker), `Dialog is missing ${marker}`);
  }
  const modal = read("src/components/ApprovalModal.tsx");
  assert.match(modal, /<Dialog/);
  assert.match(modal, /htmlFor=\{reasonId\}/, "the reason field has no label");
  assert.match(modal, /disabled=\{busy\} onClick=\{\(\) => onTakeOver/, "take-over stays clickable while busy");
  assert.doesNotMatch(modal, /APPROVAL GATE/);
  assert.ok(modal.split("\n").length > 40, "the modal is minified on one line again");
});

test("toasts are announced through a live region", () => {
  const app = read("src/App.tsx");
  assert.match(app, /aria-live="polite"/);
  assert.match(app, /aria-live="assertive"/);
});

test("accounts form fields have real labels and the temporary password is masked", () => {
  const view = read("src/components/views/AccountsView.tsx");
  for (const id of ["acct-name", "acct-email", "acct-temp", "acct-role", "own-current", "own-next"]) {
    assert.match(view, new RegExp(`htmlFor="${id}"`), `${id} has no label`);
  }
  assert.match(view, /type=\{showTemp \? "text" : "password"\}/);
});

test("page eyebrows are translated in Arabic", () => {
  for (const file of fs.readdirSync("src/components/views")) {
    const source = read(`src/components/views/${file}`);
    assert.doesNotMatch(source, /eyebrow="[A-Z]/, `${file} has an untranslated eyebrow`);
  }
});

test("only the fonts in use are loaded, self-hosted, with no external font host", () => {
  /*
   * يحمي هذا الفحص: (١) ألا يُحمَّل خطٌّ لا تستعمله أي قاعدة — فلكل خطٍّ معرَّف تعريفُ @font-face
   * وقاعدةُ font-family تستعمله؛ (٢) ألا يخرج طلبٌ إلى خادم خطوطٍ خارجي لا من الواجهة ولا من
   * الصفحات المرسومة من الخادم (خصوصيةُ الزائر وصفحاتٌ مكتفية بذاتها). كان يمنع Cairo لأنه يُحمَّل
   * من Google ولا تستعمله قاعدة؛ وصار مستضافاً ذاتياً وتستعمله الواجهة والصفحات كلها.
   */
  const html = read("index.html");
  const css = read("src/index.css");
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/, "index.html requests an external font host");
  assert.match(html, /<link rel="preload" href="\/fonts\/cairo-arabic\.woff2" as="font" type="font\/woff2" crossorigin/);
  for (const file of ["server/marketingPages.ts", "server/publicPages.ts", "server/manual.ts", "server/fontFace.ts"]) {
    assert.doesNotMatch(read(file), /fonts\.(googleapis|gstatic)\.com/, `${file} requests an external font host`);
  }
  const faces = [...css.matchAll(/@font-face\{font-family:'([^']+)'[^}]*src:url\((\/fonts\/[^)]+\.woff2)\)/g)];
  assert.ok(faces.length >= 4, "the self-hosted @font-face rules are missing");
  const families = new Set(faces.map(m => m[1]));
  assert.deepEqual([...families].sort(), ["Cairo", "Plus Jakarta Sans"]);
  for (const [, family, url] of faces) {
    assert.ok(fs.existsSync(`public${url}`), `${url} is declared but missing from public/`);
    assert.match(css, new RegExp(`font-family:[^;}]*"${family}"`), `${family} is loaded but no CSS rule uses it`);
  }
  assert.match(css, /font-display:swap/);
  /* الصفحات المرسومة من الخادم تعلن التعريفات نفسها، فلا تعتمد على الشبكة. */
  const serverFaces = read("server/fontFace.ts");
  for (const [, , url] of faces) assert.ok(serverFaces.includes(url), `${url} is not declared for the server-rendered pages`);
  assert.match(read("server/marketingPages.ts"), /font-family:"Cairo"/);
});
