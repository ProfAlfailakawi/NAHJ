import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

/*
 * ثلاثة عقود لا يكشف انكسارَها فحصُ أنواعٍ ولا بناء، لأن كلًّا منها نقصٌ في سلوك
 * لا خطأٌ في شكل. وكلها وقعت فعلًا في هذا المستودع:
 *
 *   ١. لا مخرج من الحساب. `POST /api/auth/logout` مكتمل، و`authApi.logout`
 *      موجودة — ولم يكن في الواجهة ما يناديها. فالحساب يبقى مفتوحًا حتى تنتهي
 *      مهلته، ولا سبيل إلى تركه على جهازٍ مشترك. ولا يُرى ذلك إلا بفتح الشاشة
 *      والبحث عن زرّ ليس موجودًا.
 *
 *   ٢. غياب إعداد Firebase كان يرتدّ إلى معرّفات الإنتاج مكتوبةً في الشيفرة،
 *      فنزعُ الملف لا يعزل شيئًا: يبقى الخادم موصولًا بمشروع المؤسسة ويكتب إليه.
 *
 *   ٣. المنفذ كان رقمًا مثبّتًا لا يقرأ البيئة.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("the interface offers a way out of the account", () => {
  const shell = read("src/components/Shell.tsx");
  const app = read("src/App.tsx");

  assert.match(shell, /onSignOut/, "Shell لا يستقبل مخرجًا من الحساب");
  assert.match(
    shell,
    /aria-label=\{ar \? "تسجيل الخروج" : "Sign out"\}/,
    "لا زرّ خروجٍ معلَّمًا لقارئ الشاشة في شريط الأدوات",
  );
  assert.match(app, /authApi\.logout\(\)/, "لا أحد ينادي مسار الخروج");
  assert.match(app, /onSignOut=\{/, "المخرج غير موصولٍ بالواجهة");
});

test("signing out is not a screen change alone", () => {
  /*
   * تبديلُ الحالة في المحلّ يترك سجلّ التدقيق وطلبات الاعتماد ومهامّ صاحب الحساب
   * السابق في الذاكرة، فقد تلمع لمن يدخل بعده. الصفحة تُبنى من الصفر.
   */
  const app = read("src/App.tsx");
  const signOut = /const signOut=async\(\)=>\{([\s\S]*?)\n  \};/.exec(app)?.[1];
  assert.ok(signOut, "تعذّر العثور على دالة الخروج — أُعيدت تسميتها؟ أعد توجيه هذا الفحص.");
  assert.match(signOut, /window\.location\.reload\(\)/, "لا إعادة بناء بعد الخروج");
});

test("no Firebase config means no sync, not a fallback to production", () => {
  const firebase = read("server/firebase.ts");
  /*
   * المعرّفات نفسها ما زالت في `firebase-applet-config.json` — وهو ملف الإعداد
   * وموضعها الصحيح. المرفوض أن تكون بديلًا صامتًا حين يُنزع الملف.
   */
  assert.doesNotMatch(
    firebase,
    /projectId:\s*["']nahj-/,
    "معرّف مشروع مكتوب في الشيفرة كبديل — نزعُ ملف الإعداد لن يعزل شيئًا",
  );
  assert.match(firebase, /FIREBASE_UNCONFIGURED/, "غياب الإعداد لا يُعلَن");
});

test("the test suite cannot write to the production project", () => {
  /*
   * رُصد في تشغيلٍ واحد: أربع وستون محاولة كتابة على `nahj-a27a4` أثناء
   * `npm test` — أيّ اختبارٍ يمرّ بـ`auth.ts` يكتب حدث تدقيق، و`db.ts` يزامن كل
   * حدث تدقيق. رُفضت كلها بقواعد Firestore فلم يُكتب شيء، لكن اختبارًا يعتمد
   * على قواعد الإنتاج ليمتنع عن إفساد الإنتاج ليس معزولًا — إنما محظوظ.
   */
  const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
  assert.match(
    scripts.test || "",
    /NAHJ_FIREBASE_SYNC=off/,
    "`npm test` لا يوقف المزامنة، فهو يكتب إلى مشروع الإنتاج",
  );
  assert.match(
    read("server/firebase.ts"),
    /NAHJ_FIREBASE_SYNC/,
    "المفتاح مضبوط في السكربت ولا أحد يقرؤه",
  );
  assert.equal(process.env.NAHJ_FIREBASE_SYNC, "off", "هذا التشغيل نفسه بلا إيقاف");
});

test("the port comes from the environment, with 3000 as the default", () => {
  const server = read("server.ts");
  assert.match(
    server,
    /const PORT = Number\(process\.env\.PORT\) > 0 \? Number\(process\.env\.PORT\) : 3000;/,
    "المنفذ لا يُقرأ من البيئة",
  );
  assert.doesNotMatch(server, /const PORT = \d+;/, "عاد المنفذ رقمًا مثبّتًا");
  /* والافتراض يبقى 3000 لأن الحاوية تعلنه وCaddy يوجّه إليه. */
  assert.match(read("Dockerfile"), /^EXPOSE\s+3000$/m, "الحاوية لم تعد تعلن 3000");
});
