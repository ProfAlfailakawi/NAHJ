import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

/*
 * عقدُ الصدق في سطح التكامل.
 *
 * موصلات نهج اليوم محاكاة: `ConnectorLayer` ينتظر مهلةً ثم يُعيد جواباً مكتوباً
 * في الشيفرة، ولا يخرج منه طلب شبكة واحد. والمزامنة السحابية تُردّ بمنع صلاحية
 * ما لم تُضبط وتُفتح قواعدها. ومع ذلك كانت الشاشة تُعلن «سحابة نشطة ومتصلة»
 * ووسمَ قواعدٍ منشورة ومجموعاتٍ مرآة، ويُعلن الشريط العلوي اسم مشروعٍ
 * داخلي في كل حال.
 *
 * ووعدُ تكاملٍ غير قائم لا يُكتشف في عرضٍ تقديمي بل بعد التوقيع — فيُسقط الثقة
 * بكل رقمٍ صادقٍ في المنتج. وهذه الفحوص تقرأ المصدر نفسه لأن الادّعاء نصٌّ على
 * شاشة: لا يكسره فحصُ أنواعٍ ولا بناء، ويعود بسطرٍ واحد.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("no screen declares a cloud link that is not read from state", () => {
  const connections = read("src/components/views/ConnectionsView.tsx");
  const shell = read("src/components/Shell.tsx");

  for (const [label, source] of [["شاشة الربط", connections], ["الشريط العلوي", shell]] as const) {
    assert.ok(!/nahj-a27a4/.test(source), `${label} يذكر اسم مشروعٍ بعينه بدل قراءة الحالة`);
    assert.ok(!/Rules: deployed|Collections: \d+ mirrored/.test(source), `${label} يعرض حالة إعدادٍ ثابتةً في الشيفرة`);
    assert.ok(!/سحابة نشطة ومتصلة|Active Cloud Connected/.test(source), `${label} يُعلن وصلاً قائماً بلا دليل`);
  }

  /* الحالة تُقرأ من الخادم، والوسم يتبعها. */
  assert.match(connections, /apiOrNull<\{ status: FirebaseStatus \}>\("\/firebase\/status"\)/, "لا تُقرأ حالة السحابة أصلاً");
  assert.match(connections, /cloud\?\.connected/, "وسم الحالة لا يتبع ما قُرئ");
});

test("a simulated connector says so, on the screen and in the audit log", () => {
  const connections = read("src/components/views/ConnectionsView.tsx");
  const routes = read("server/routes.ts");
  const types = read("src/types/index.ts");

  assert.match(types, /mode: 'simulated' \| 'live'/, "لا حقل يميّز المحاكاة من الوصلة القائمة");
  assert.match(connections, /c\.mode !== "live"/, "الشاشة لا تُظهر وسم المحاكاة");

  /* سطرُ تدقيقٍ يزعم فحص اتصالٍ حيّ لموصلٍ محاكى يُفسد أثمن ما في النظام. */
  assert.match(routes, /SIMULATE_CONNECTOR_PING/, "الفحص المحاكى يُسجَّل كأنه فحصُ اتصالٍ حي");
  assert.ok(
    !/details: `فحص الاتصال الحي بنجاح/.test(routes),
    "السجل ما زال يزعم فحص اتصالٍ حي",
  );
});

test("every seeded connector declares its mode", () => {
  const seed = read("src/data/seedData.ts");
  const block = seed.slice(seed.indexOf("export const initialConnectors"), seed.indexOf("export const initialTestCases"));
  const rows = block.split(/\n  \{/).slice(1);
  assert.ok(rows.length >= 5, "لم تُقرأ الموصلات المبدئية");
  for (const row of rows) {
    assert.match(row, /mode: 'simulated'/, `موصلٌ مبدئي بلا إعلان وضعه:\n${row.slice(0, 120)}`);
  }
});

test("«موصول» تعني عملاً نجح، لا عميلاً أُنشئ", () => {
  /*
   * سقط هذا في مراجعة: `initFirebase` كانت ترفع `isConnected` وتختم وقت مزامنة
   * بمجرّد إنشاء عميل SDK — وهو بناء كائنٍ في الذاكرة ينجح بمفاتيح ملفَّقة وبلا
   * إنترنت. وفشلُ الكتابة كان يسجّل السبب ولا يُسقط الوصل. فالنشر الذي ترفض
   * قواعدُه كلّ كتابة — وهو النشر القائم — يعرض وسماً أخضر وختمَ نجاح.
   */
  const source = read("server/firebase.ts");

  const init = source.slice(source.indexOf("export function initFirebase"), source.indexOf("export function getFirestoreDb"));
  assert.ok(!/isConnected\s*=\s*true/.test(init), "يُرفع الوصل عند إنشاء العميل لا عند نجاح عمل");
  assert.ok(!/lastSyncTime\s*=\s*new Date/.test(init), "يُختم وقت مزامنة قبل أن تجري مزامنة");

  /* والكتابة الناجحة هي التي ترفع، والفاشلة تُسقط. */
  const sync = source.slice(source.indexOf("export async function syncDocToFirestore"));
  assert.match(sync, /isConnected = true/, "الكتابة الناجحة لا تُثبت الوصل");
  assert.match(sync, /isConnected = false/, "الفشل لا يُسقط الوصل");

  assert.match(source, /connected: isConnected && !!firestoreDb && !!lastSyncTime && !connectionError/,
    "الحالة المعروضة لا تشترط عملاً ناجحاً بلا فشلٍ بعده");
});
