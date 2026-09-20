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

/*
 * طبقة الترخيص — عقود توصيلٍ لا يكشف انكسارَها فحصُ أنواع.
 *
 * وقع منها اثنان فعلاً أثناء بناء الطبقة:
 *
 *   ١. `ensureOwnerAccount` كان يعمل عند الإقلاع وحده، والحساب الأول يُنشأ من شاشة
 *      التهيئة *بعد* الإقلاع — فيبقى من نشر النظام بلا مِلكية حتى إعادة التشغيل
 *      التالية: يفتح لوحته فلا يجدها، ولا شيء يفسّر له لماذا.
 *
 *   ٢. حارس الاشتراك لو رُكّب على المسارات فرادى بدل جذر الموجّه، لسقط من واحدٍ
 *      منها حتماً — وثغرةٌ واحدة في طبقة ترخيص تُبطلها كلها.
 */

test("من هيّأ النظام يصير مالكه في اللحظة نفسها، لا عند إعادة التشغيل", () => {
  const routes = read("server/routes.ts");
  const setup = /authRouter\.post\("\/setup"[\s\S]*?\n\}\);/.exec(routes)?.[0];
  assert.ok(setup, "تعذّر العثور على مسار التهيئة — أُعيدت تسميته؟ أعد توجيه هذا الفحص.");
  assert.match(setup, /ensureOwnerAccount\(\)/, "الحساب الأول يُنشأ بلا مِلكية");
  assert.ok(
    setup.indexOf("ensureOwnerAccount()") < setup.indexOf("await login("),
    "الترقية بعد فتح الجلسة تترك الجلسة تحمل الدور القديم",
  );
});

test("حارس الترخيص مركَّب على جذر الموجّه لا على مسارات مفردة", () => {
  const routes = read("server/routes.ts");
  assert.match(routes, /apiRouter\.use\(enforceSubscription\)/, "حارس الاشتراك غير مركَّب");
  /* ومسارات الاشتراك نفسها قبله، وإلا صار التجميد أبدياً: لا طريق إلى التجديد. */
  assert.ok(
    routes.indexOf('apiRouter.use("/billing", billingRouter)') < routes.indexOf("apiRouter.use(enforceSubscription)"),
    "تجميد الطريق إلى التجديد يجعل التجميد بلا مخرج",
  );
});

test("التجميد يمنع الكتابة وحدها — القراءة والتصدير يبقيان", () => {
  const guard = read("server/billingRoutes.ts");
  assert.match(guard, /\["GET", "HEAD", "OPTIONS"\]\.includes\(req\.method\)\) return next\(\)/,
    "القراءة يجب أن تمرّ دائماً: البيانات للمؤسسة، والخدمة هي المُباعة");
  assert.match(guard, /res\.status\(402\)/, "الردّ يجب أن يقول «ادفع» لا «لا صلاحية لك»");
});

test("المبالغ تُخزَّن بالوحدة الصغرى كأعداد صحيحة", () => {
  const billing = read("server/billing.ts");
  assert.match(billing, /Number\.isInteger\(amount\)/, "قبول الكسور في المال يُنتج فواتير لا تُسوّى");
  assert.match(billing, /KWD: 3/, "الدينار الكويتي ثلاث منازل لا اثنتان");
});

/*
 * ضوابط ميتة.
 *
 * ثلاثة عناصر كانت تُرى على الشاشة ولا تفعل شيئاً. ولا يكشفها فحص أنواع ولا
 * بناء، لأن زرّاً بلا مُعالج نقر شيفرةٌ صحيحة تماماً:
 *
 *   ١. حقل البحث يحمل «⌘K» ولا يبحث ولا يستجيب للاختصار المكتوب عليه. وهو أسوأ
 *      من غيابه: يَعِد بقدرة غير موجودة فيجرّبها من يُعرض عليه المنتج أمامه.
 *   ٢. زرّ المساعدة في الشريط الجانبي بلا `onClick` إطلاقاً.
 *   ٣. `Sidebar.tsx` ملفٌ كامل لا يستورده أحد — يحمل «143 Process» و«76%»
 *      مكتوبةً، فيُعدَّل ظنّاً أنه المعروض.
 */

test("حقل البحث يبحث فعلاً، والاختصار المكتوب عليه مربوط", () => {
  const shell = read("src/components/Shell.tsx");
  const app = read("src/App.tsx");

  assert.match(shell, /onSearch/, "شريط الأدوات لا يعرف البحث");
  assert.doesNotMatch(
    shell,
    /<input placeholder=\{ar \? "ابحث في عقل المؤسسة"/,
    "عاد حقل البحث إدخالاً لا يبحث",
  );
  assert.match(app, /setPaletteOpen/, "لا أحد يفتح لوحة الأوامر");
  /* الاختصار المكتوب على الحقل منذ البداية: ⌘K / Ctrl+K. */
  assert.match(app, /metaKey\|\|event\.ctrlKey\)&&event\.key\.toLowerCase\(\)==="k"/, "الاختصار غير مربوط");
});

test("زرّ المساعدة يفتح الدليل", () => {
  const shell = read("src/components/Shell.tsx");
  assert.match(shell, /className="nav-icon rail-help" onClick=\{onHelp\}/, "زرّ المساعدة بلا مُعالج نقر");
  assert.match(read("src/App.tsx"), /<HelpPanel open=\{helpOpen\}/, "الدليل غير مركَّب");
});

test("لا شيفرة واجهة ميتة لا يستوردها أحد", () => {
  assert.ok(!fs.existsSync("src/components/Sidebar.tsx"), "عاد الملف الميت — يُعدَّل ظنّاً أنه المعروض");
});

test("لا أرقام مكتوبة عادت إلى شاشة اليوم", () => {
  const today = read("src/components/views/TodayView.tsx");
  /* كانت 143 فوق أطلس العقل، و137 مُنجزاً، وشريط ذاكرة عند 61 و37 و11 و29. */
  assert.doesNotMatch(today, /value="137"/, "عاد عدّاد اليوم رقماً مكتوباً");
  assert.doesNotMatch(today, /value="61"|value="37"|value="11"|value="29"/, "عاد شريط الذاكرة أرقاماً مكتوبة");
  assert.doesNotMatch(today, /<span>143<\/span>/, "عاد عدّاد العمليات رقماً مكتوباً");
  assert.match(today, /memory\?\.documentedSkills/, "الشاشة لا تقرأ الأرقام المشتقّة");
  /* وحقلٌ تعليمي كان يتسرّب إلى شاشة عامّة. */
  assert.doesNotMatch(today, /details\?\.studentName/, "حقل تعليمي في شاشة عامّة");
});

test("المعجم يغطّي سُلّم الاستقلالية كاملاً بلغة الموظف", () => {
  const glossary = read("src/lib/glossary.ts");
  for (let level = 0; level <= 6; level++) {
    assert.match(glossary, new RegExp(`level: ${level},`), `المستوى L${level} بلا وصف`);
  }
  /* الوصف بصيغة الفعل: ما يفعله النظام وما يبقى على الإنسان. */
  assert.match(glossary, /yourPart/, "السُلّم لا يقول ماذا يبقى على الموظف");
});

test("لا شاشة تكتب رقم عرضٍ بيدها", () => {
  /*
   * مسحٌ شاملٌ بعد تنظيف أربع شاشات: الأثر والحوكمة واليوم والتعلّم. كلها كانت
   * تحمل ثوابت تبدو قياساً. والحارس هنا يمنع عودة النمط لا رقماً بعينه.
   */
  const views = [
    "src/components/views/TodayView.tsx",
    "src/components/views/LearnView.tsx",
    "src/components/views/AnalyticsView.tsx",
    "src/components/views/ControlView.tsx",
  ];
  for (const view of views) {
    const source = read(view);
    /* `value="123"` و`progress={76}` هما الشكلان اللذان تسلّل بهما الاختراع. */
    assert.doesNotMatch(source, /value="\d+"/, `${view}: رقم عرضٍ مكتوب بيد`);
    assert.doesNotMatch(source, /progress=\{\d+\}/, `${view}: نسبة مكتوبة بيد`);
  }
});
