# نهج — NAHJ

[![فحوص طلب الدمج](https://github.com/ProfAlfailakawi/NAHJ/actions/workflows/ci.yml/badge.svg)](.github/workflows/ci.yml)
[![نشر نهج](https://github.com/ProfAlfailakawi/NAHJ/actions/workflows/deploy.yml/badge.svg)](.github/workflows/deploy.yml)

**نهج** هو نظام تعلم تشغيلي للمؤسسات: يتعلم كيف تعمل المؤسسة، يحول العمل الحقيقي إلى مهارات موثقة وقابلة للإصدار، يختبر نفسه عليها، ثم يكتسب حق التنفيذ تدريجيًا تحت حوكمة بشرية واضحة.

> **Teach → Learn → Verify → Practice → Shadow → Work → Audit → Improve**

- **الموقع الحيّ:** <https://nahj-os.web.app> (صفحة الهبوط) · التطبيق: <https://nahj-os.web.app/app> · الأسعار: <https://nahj-os.web.app/pricing>
- **فحص الصحة:** <https://nahj-os.web.app/api/health>

## ما الذي يميز نهج؟

- **Company Brain** بدل Knowledge Base تقليدية.
- **Teach Mode** لتعليم العملية كما ينفذها الموظف فعليًا.
- **Controlled Learning**: الملاحظة لا تتحول إلى سياسة من دون مراجعة واعتماد.
- **Versioned Skills** مع أدلة، استثناءات، قواعد، اختبارات ومالك بشري.
- **Autonomy Ladder**: Observe → Practice → Shadow → Suggest → Approval → Autopilot.
- **Policy / Risk / Approval Engines** قبل أي تنفيذ حساس.
- **Action & Connector Layer** حتى لا يرتبط منطق العمل بنظام خارجي واحد.
- **Audit Trail** قابل للتفسير لكل قرار وتنفيذ مهم.
- **Process Intelligence** لاكتشاف التعارض، الانحراف، الاعتماد على موظف واحد وفرص التحسين.

## خريطة الميزات / Feature map

الواجهة تطبيق صفحة واحدة تحت `/app`، وأقسامه (اليوم، يتعلّم، علّم…) تُفتح من الشريط الجانبي لا من روابط مستقلة؛ لذلك «الرابط المباشر» لأقسام التطبيق هو `/app` بعد الدخول.
الحالة: **يعمل** = مبنيّ ومُختبَر · **تجريبي** = محاكاة معلنة أو يحتاج إعداداً لم يكتمل · **قيد التطوير** = غير منشور بعد.

### الصفحات العلنية والعرض التجريبي

| الميزة | ما تفعله | الرابط المباشر | الشيفرة | الحالة |
|---|---|---|---|---|
| صفحة الهبوط وطلب عرض | تعريف بنهج والقطاعات ونموذج «اطلب عرضاً» يُحفظ ويظهر في لوحة المالك | [/](https://nahj-os.web.app/) | [server/publicPages.ts](server/publicPages.ts) · [server/marketingPages.ts](server/marketingPages.ts) · [server/leads.ts](server/leads.ts) | يعمل |
| صفحة الأسعار العلنية | تُبنى من الباقات نفسها التي يُفوتَر بها | [/pricing](https://nahj-os.web.app/pricing) | [server/publicPages.ts](server/publicPages.ts) · [server/entitlements.ts](server/entitlements.ts) | يعمل |
| الشروط والخصوصية | نصّ أوّلي يُراجَع قانونياً قبل البيع | [/terms](https://nahj-os.web.app/terms) · [/privacy](https://nahj-os.web.app/privacy) | [server/publicPages.ts](server/publicPages.ts) | يعمل (نصّ أوّلي) |
| العرض التجريبي المعزول لكل قطاع | صندوق في الذاكرة لكل زائر، لا يمسّ بيانات المؤسسة؛ `/try/clinic` · `law` · `retail` · `logistics` · `realestate` · `education` | [/try/clinic](https://nahj-os.web.app/try/clinic) | [server.ts](server.ts) · [server/demoSandbox.ts](server/demoSandbox.ts) · [server/packs/demos.ts](server/packs/demos.ts) · [src/components/DemoBanner.tsx](src/components/DemoBanner.tsx) | يعمل |
| صفحة «نُحدّث البرنامج» | صفحة بهوية نهج وشريط هادئ بدل الصفحة البيضاء وخطأ 502 أثناء النشر | [/updating.html](https://nahj-os.web.app/updating.html) | [public/updating.html](public/updating.html) · [server/updatingPage.ts](server/updatingPage.ts) · [src/lib/updatingNotice.ts](src/lib/updatingNotice.ts) | يعمل |

### التطبيق — أقسام المؤسسة (`/app`)

| الميزة | ما تفعله | الرابط المباشر | الشيفرة | الحالة |
|---|---|---|---|---|
| الدخول والتهيئة وإعداد المؤسسة | جلسات، CSRF، حدّ لمحاولات الدخول، وأول دخول لمشرف المؤسسة يضبط اسمها وقطاعها | [/app](https://nahj-os.web.app/app) | [server/auth.ts](server/auth.ts) · [server/loginThrottle.ts](server/loginThrottle.ts) · [src/components/LoginScreen.tsx](src/components/LoginScreen.tsx) · [src/components/OrgSetupView.tsx](src/components/OrgSetupView.tsx) | يعمل |
| اليوم (Today) | لوحة البداية: ما ينتظر الموظف وما يحتاج قراره | `/app` ← اليوم | [src/components/views/TodayView.tsx](src/components/views/TodayView.tsx) · [src/components/views/AppHub.tsx](src/components/views/AppHub.tsx) | يعمل |
| يتعلّم (Learn) | ملاحظات وأسئلة توضيح لا تتحول إلى سياسة إلا بعد مراجعة | `/app` ← يتعلّم | [src/components/views/LearnView.tsx](src/components/views/LearnView.tsx) · [server/routes.ts](server/routes.ts) | يعمل |
| علّم (Teach Mode) | جلسة تعليم تسجّل خطوات الموظف (مع إملاء صوتي) ثم تُركّب منها مهارة | `/app` ← علّم | [src/components/views/TeachView.tsx](src/components/views/TeachView.tsx) · [server/engine/teachEngine.ts](server/engine/teachEngine.ts) · [src/lib/dictation.ts](src/lib/dictation.ts) | يعمل |
| المهارات المُصدَرة | إصدارات، ترقية عبر مراجعة، تراجع يستعيد الخطوات، مفتاح إيقاف، دليل موقّع وترجمة | `/app` ← المهارات | [src/components/views/SkillsView.tsx](src/components/views/SkillsView.tsx) · [server/engine/skillEngine.ts](server/engine/skillEngine.ts) · [server/engine/promotionReview.ts](server/engine/promotionReview.ts) · [server/manual.ts](server/manual.ts) | يعمل |
| التدرّب والظل | لا تُرفع صلاحية مهارة إلا بعد تدرّب حقيقي، والحالة التي يتعذّر تقييمها ترسب | `/app` ← التدرّب | [src/components/views/PracticeView.tsx](src/components/views/PracticeView.tsx) · [server/engine/evaluationEngine.ts](server/engine/evaluationEngine.ts) | يعمل |
| العمل والموافقات | حالات عمل، استلام بشري واستئناف، وموافقات متعددة المستويات بسجلّ قرار | `/app` ← العمل | [src/components/views/WorkView.tsx](src/components/views/WorkView.tsx) · [src/components/ApprovalModal.tsx](src/components/ApprovalModal.tsx) · [server/engine/policyEngine.ts](server/engine/policyEngine.ts) · [server/engine/decisionRecord.ts](server/engine/decisionRecord.ts) | يعمل |
| المحادثة (المحاكي) | محادثة باسم المؤسسة ورفع وثيقة؛ تستعمل Gemini إن ضُبط `GEMINI_API_KEY` وإلا منطقاً حتمياً | `/app` ← المحادثة | [src/components/views/SimulatorView.tsx](src/components/views/SimulatorView.tsx) · [server/gemini.ts](server/gemini.ts) | يعمل |
| الربط (الموصلات) | موصلات نظام الطلاب والتقويم وخزينة الوثائق وسجل التواصل — **لا تُخرج طلب شبكة**، ومعروضة بوسم «محاكاة» | `/app` ← الربط | [src/components/views/ConnectionsView.tsx](src/components/views/ConnectionsView.tsx) · [server/engine/connectors.ts](server/engine/connectors.ts) | تجريبي (محاكاة) |
| خادم MCP | نهج نفسه خادم MCP حقيقي عبر JSON-RPC على `/api/mcp/rpc`؛ سجلّ الخوادم الأخرى محفوظ | `/app` ← الربط | [server/engine/mcpEngine.ts](server/engine/mcpEngine.ts) · [server/routes.ts](server/routes.ts) | يعمل (خادم نهج) · الخوادم الخارجية تجريبي |
| الأثر (القياس) | كل رقم مشتقّ من العمل بأساسه وحجم عيّنته، وما لا يُقاس يُعلن «غير مقيس» | `/app` ← الأثر | [src/components/views/AnalyticsView.tsx](src/components/views/AnalyticsView.tsx) · [server/engine/metricsEngine.ts](server/engine/metricsEngine.ts) | يعمل |
| الحوكمة والإيقاف الطارئ | سياسات، مستويات استقلالية، وإيقاف فوري للتنفيذ الآلي ثم استئناف | `/app` ← الحوكمة | [src/components/views/ControlView.tsx](src/components/views/ControlView.tsx) · [src/components/EmergencyPause.tsx](src/components/EmergencyPause.tsx) | يعمل |
| الأشخاص (التغطية) | كشف الاعتماد على موظف واحد ومن يغطّي كل مهارة | `/app` ← الأشخاص | [src/components/views/PeopleView.tsx](src/components/views/PeopleView.tsx) · [server/engine/coverage.ts](server/engine/coverage.ts) | يعمل |
| السجل (التدقيق) | سجلّ تدقيق قابل للتفسير لكل قرار وتنفيذ مهم | `/app` ← السجل | [src/components/views/AuditView.tsx](src/components/views/AuditView.tsx) | يعمل |
| الحسابات والأدوار | إدارة حسابات الموظفين وكلمات المرور وإبطال الجلسات | `/app` ← الحسابات | [src/components/views/AccountsView.tsx](src/components/views/AccountsView.tsx) · [server/auth.ts](server/auth.ts) | يعمل |
| النشاط (حزم القطاعات) | تعليم، عيادة، محاماة، تجزئة ومطاعم، لوجستيات، عقار — مهارات وسياسات وشخصية لكل قطاع | `/app` ← النشاط | [src/components/views/SectorsView.tsx](src/components/views/SectorsView.tsx) · [server/packs/index.ts](server/packs/index.ts) | يعمل |
| التصدير والنسخ الاحتياطي | تصدير JSON و CSV، ونسخ احتياطي بـ`VACUUM INTO` | `/app` (واجهة `/api/export/*` و`/api/backup`) | [server/archive.ts](server/archive.ts) | يعمل |
| الإشعارات | فاتورة، سداد، قرب تجديد، تجميد — وتعمل بلا بريد وتقول ذلك | — | [server/notify.ts](server/notify.ts) | يعمل (البريد يحتاج إعداداً) |

### الاشتراك والتحصيل ولوحة المالك

| الميزة | ما تفعله | الرابط المباشر | الشيفرة | الحالة |
|---|---|---|---|---|
| الاشتراك وحدود الباقة | باقات ودورات وتناسب زمني ومهلة سماح، تجميد الكتابة دون القراءة، وحدود استهلاك بتنبيهات | `/app` ← الاشتراك | [src/components/views/BillingView.tsx](src/components/views/BillingView.tsx) · [server/billing.ts](server/billing.ts) · [server/billingRoutes.ts](server/billingRoutes.ts) · [src/components/LimitsBanner.tsx](src/components/LimitsBanner.tsx) | يعمل |
| الدفع الإلكتروني | ماي فاتورة / تاب؛ يُسجَّل السداد بعد تأكيد المزوّد نفسه، وبلا إعداد لا يظهر زر الدفع | `/app` ← الاشتراك | [server/payments.ts](server/payments.ts) · [server/paymentRoutes.ts](server/paymentRoutes.ts) | يعمل عند ضبط مفاتيح المزوّد (راجع [PAYMENTS.md](PAYMENTS.md)) |
| لوحة المالك | الباقات والأسعار ودورة الاشتراك والفواتير والدفعات وطلبات العرض وروابط العرض | `/app` ← لوحة المالك | [src/components/views/OwnerView.tsx](src/components/views/OwnerView.tsx) · [src/components/views/OwnerSalesPanel.tsx](src/components/views/OwnerSalesPanel.tsx) | يعمل |
| المسوّقون والعمولات | عمولة نسبةً أو مبلغاً، دفتر استحقاق ودفع، وبوابة خاصة لكل مسوّق معزولة عن غيره | `/app` ← المسوّقون | [src/components/views/PartnersAdminView.tsx](src/components/views/PartnersAdminView.tsx) · [src/components/views/PartnerPortalView.tsx](src/components/views/PartnerPortalView.tsx) · [server/partners.ts](server/partners.ts) · [server/partnerRoutes.ts](server/partnerRoutes.ts) | يعمل |

### المنصّات والتشغيل

| الميزة | ما تفعله | الرابط المباشر | الشيفرة | الحالة |
|---|---|---|---|---|
| تطبيق Apple (iOS/iPadOS/Mac) | غلاف Capacitor أصلي يفتح الموقع الحيّ، مع بيانات المتجر وسكربت الإصدار | — | [apple/](apple/) · [apple/apple-release.sh](apple/apple-release.sh) · [apple-release/checklists/](apple-release/checklists/) | قيد التطوير (لم يُرفع إلى المتجر) |
| تخطيطات iPhone Duo والشاشات الضيقة | تخطيطات بحسب العرض ووضعية الطيّ | — | [src/duo.css](src/duo.css) · [src/duo-beauty.css](src/duo-beauty.css) · [server/duoLayout.test.ts](server/duoLayout.test.ts) | يعمل |
| حسّاس أوربت لأخطاء المتصفح | يرسل ملاحظات أخطاء مجهولة الهوية (بلا روابط استعلام ولا بيانات مستخدم) | — | [public/orbit-sensor.js](public/orbit-sensor.js) | يعمل |
| التخزين الدائم | SQLite داخل الخادم، ولقطة كاملة تُعكس إلى Neon (PostgreSQL) وتُستعاد عند الإقلاع | — | [server/persistence.ts](server/persistence.ts) · [server/neonMirror.ts](server/neonMirror.ts) · [server/db.ts](server/db.ts) | يعمل |
| مرآة Firestore | قديمة ومحجوبة بالقواعد؛ حالتها تُعرض في شاشة الربط (السبب في [CONNECT.md](CONNECT.md)) | — | [server/firebase.ts](server/firebase.ts) · [firestore.rules](firestore.rules) | تجريبي (مُعطّلة فعلياً) |

## البنية

- **الواجهة:** React 19 + Vite 6 + Tailwind 4، عربية أولاً RTL — [src/App.tsx](src/App.tsx)، الشريط والأقسام في [src/components/Shell.tsx](src/components/Shell.tsx)، والأقسام في [src/components/views/](src/components/views/).
- **الخادم:** Express 4 على Node.js 22+ — المدخل [server.ts](server.ts)، وواجهات الـAPI في [server/routes.ts](server/routes.ts).
- **المحرّكات:** [server/engine/](server/engine/) — المهارات، التعليم، التقييم، السياسات، سجلّ القرار، القياس، التغطية، الموصلات، MCP.
- **الحزم القطاعية:** [server/packs/](server/packs/).
- **التخزين:** `node:sqlite` المدمج ([server/persistence.ts](server/persistence.ts))، مع مرآة Neon عند ضبط `NAHJ_NEON_URL` ([server/neonMirror.ts](server/neonMirror.ts)). يعمل خادم واحد فقط (max-instances=1).
- **الذكاء الاصطناعي:** Gemini اختياري عبر [server/gemini.ts](server/gemini.ts) مع ارتداد إلى منطق حتمي.

### أهم نقاط الخادم

| المسار | الملف |
|---|---|
| `GET /api/health` · `GET /_health` | [server.ts](server.ts) |
| `GET /try/:sector?` · `POST /api/demo/*` | [server.ts](server.ts) |
| `/api/auth/*` (status, setup, login, logout, me, accounts…) | [server/auth.ts](server/auth.ts) |
| `/api/today` · `/api/learn` · `/api/teach/*` · `/api/skills/*` · `/api/practice` · `/api/shadow/run` · `/api/work/*` · `/api/approvals/*` · `/api/simulator/*` · `/api/connections` · `/api/analytics` · `/api/governance` · `/api/audit` · `/api/autopilot/*` | [server/routes.ts](server/routes.ts) |
| `/api/mcp/rpc` (JSON-RPC 2.0) · `/api/mcp/*` | [server/routes.ts](server/routes.ts) · [server/engine/mcpEngine.ts](server/engine/mcpEngine.ts) |
| `/api/billing/*` | [server/billingRoutes.ts](server/billingRoutes.ts) |
| `/api/payments/*` (checkout, return, gateway) | [server/paymentRoutes.ts](server/paymentRoutes.ts) |
| `/api/partners/*` | [server/partnerRoutes.ts](server/partnerRoutes.ts) |
| `/`, `/pricing`, `/terms`, `/privacy`, `/api/public/*`, `/robots.txt`, `/sitemap.xml` | [server/publicPages.ts](server/publicPages.ts) |

## الهوية البصرية

الواجهة ليست Dashboard تقليدية. كل سطح له لغة إنفوجرافيكية خاصة: Atlas للعقل التشغيلي، Radar للتعلم، Teaching Stage لجلسة التعليم، Runway لتدرج الاستقلالية، Work River للتنفيذ، Constellation للتكاملات وGovernance Shield للحوكمة.

راجع [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) قبل تعديل أي واجهة.

## التشغيل المحلي

المتطلبات: Node.js 22+ (التخزين يستعمل `node:sqlite` المدمج).

```bash
npm ci
cp .env.example .env
# ضع GEMINI_API_KEY عند الحاجة
npm run dev
```

بيانات اختبارٍ واقعية (بلا أي وضع عرض): `npm run seed` يملأ قاعدة التطوير بأكثر من ألف حساب
بكل الأدوار ومعها مسوّقون وشركات وعمولات وفواتير وحالات عمل واعتمادات وسجلّ تدقيق. حتمي ومُعاد
التنفيذ بلا تكرار ([scripts/seed.ts](scripts/seed.ts))، وكلمة مرور حساباته للتطوير فقط: تُطبع عند تشغيل `npm run seed` (أو تُضبط بـSEED_PASSWORD).
لا تُشغِّله على قاعدة إنتاج.

| الأمر | ما يفعله |
|---|---|
| `npm run dev` | خادم التطوير (Express + Vite) عبر `tsx server.ts` |
| `npm run build` | بناء الواجهة بـVite وحزم الخادم إلى `dist/server.cjs` |
| `npm start` | تشغيل البناء: `node dist/server.cjs` |
| `npm run lint` / `npm run typecheck` | فحص الأنواع `tsc --noEmit` |
| `npm test` | اختبارات `node --test` على `server/*.test.ts` بقاعدة في الذاكرة |
| `npm run seed` | بذر قاعدة التطوير ([scripts/seed.ts](scripts/seed.ts)) |
| `npm run verify:env` | فحص متغيّرات البيئة ([scripts/verify-env.mjs](scripts/verify-env.mjs)) |

## الاختبارات وبوابات الجودة

- الاختبارات في [server/](server/) بأسماء `*.test.ts` — منها [server/governance.test.ts](server/governance.test.ts) و[server/security.test.ts](server/security.test.ts) و[server/mcpIsolation.test.ts](server/mcpIsolation.test.ts) و[server/billing.test.ts](server/billing.test.ts) و[server/payments.test.ts](server/payments.test.ts) و[server/skillRollback.test.ts](server/skillRollback.test.ts) و[server/teach.test.ts](server/teach.test.ts). تعمل بقاعدة SQLite في الذاكرة ولا تحتاج Postgres ولا مفاتيح.
- كل طلب دمج يمرّ على [.github/workflows/ci.yml](.github/workflows/ci.yml): `npm ci` ← `typecheck` ← `test` ← `build`.
- تقارير الجودة: [docs/QA_AUDIT_REPORT.md](docs/QA_AUDIT_REPORT.md) · [docs/QUALITY-SCORECARD.md](docs/QUALITY-SCORECARD.md) · [docs/VISUAL-POLISH-AUDIT.md](docs/VISUAL-POLISH-AUDIT.md).

## النشر

- **الإنتاج الحالي:** موقع Firebase Hosting `nahj-os` يمرّر كل الطلبات إلى خدمة Cloud Run `nahj` في `europe-west2` ([firebase.json](firebase.json)). الصورة تُبنى وتُنشر بـ[cloudbuild.yaml](cloudbuild.yaml) (يستبدل الصورة فقط ويُبقي الإعدادات والأسرار)، ويُشغَّل من مُشغِّل Cloud Build مُعدّ في Google Cloud لا من هذا المستودع. البيانات تبقى عبر مرآة Neon.
- **سير عمل [.github/workflows/deploy.yml](.github/workflows/deploy.yml) («نشر نهج»):** يدوي فقط (`workflow_dispatch`) منذ أُوقف النشر التلقائي لخفض الكلفة؛ يفحص ثم ينشر على خادم بقرص دائم عبر [scripts/deploy-vm.sh](scripts/deploy-vm.sh)، ويتخطّى النشر إن لم تُضبط هوية النشر. الإعداد في [docs/deploy-nahj.md](docs/deploy-nahj.md) والنطاق في [docs/domain.md](docs/domain.md).
- لا يوجد نشر تلقائي عند الدمج في `main`.

## وثائق المشروع

- [PRODUCT_SPEC.md](PRODUCT_SPEC.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) · [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md)
- [SECURITY.md](SECURITY.md) · [SECURITY-TODO.md](SECURITY-TODO.md) · [EVALUATION.md](EVALUATION.md) · [MVP_SCOPE.md](MVP_SCOPE.md) · [DECISIONS.md](DECISIONS.md) · [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)
- [BILLING.md](BILLING.md) — الاشتراك والترخيص: الباقات، المدّة، التجديد، الفواتير والدفعات.
- [METRICS.md](METRICS.md) — القياس والصدق العددي: ما يُشتق، وما يُعلَن أنه غير مقيس.
- [SECTORS.md](SECTORS.md) — حزم الأنشطة: كيف يصير نهج صالحاً لعيادة ومكتب محاماة ومتجر.
- [PAYMENTS.md](PAYMENTS.md) — بوابة الدفع: الربط بماي فاتورة أو تاب، والانتقال إلى الحيّة.
- [GO-LIVE.md](GO-LIVE.md) — قائمة ما قبل البيع: ما هو جاهز، وما هو محاكاة، وخطوات التشغيل.
- [BACKUP.md](BACKUP.md) — التصدير والنسخ الاحتياطي والاستعادة.
- [NOTIFICATIONS.md](NOTIFICATIONS.md) — الإشعارات: ما يُرسل، ومتى، وما لا يُرسل أبداً.
- [CONNECT.md](CONNECT.md) — دليل الربط: القرص الدائم، وأول حساب، وحالة مزامنة Firestore. (يصف النشر على خادم VM؛ الإنتاج الحالي على Cloud Run — انظر «النشر».)

## قاعدة المنتج

**Don't make companies configure AI. Let AI learn the company.**

**AI must earn the right to act.**

## الترخيص

للمنصة مالكٌ يملك عقدها، ومؤسسةٌ تشتريه. شاشة **الاشتراك** تُري المؤسسة مدّتها
وباقتها واستهلاكها وفواتيرها كاملة؛ و**لوحة المالك** تُدير الباقات والتسعير ودورة
الاشتراك والفواتير والدفعات. انتهاء الاشتراك يُجمّد الكتابة ولا يحجب القراءة —
البيانات للمؤسسة، والخدمة هي المُباعة. التفاصيل في [BILLING.md](BILLING.md).

والتحصيل إلكتروني: تضغط المؤسسة «ادفع» من شاشة الاشتراك فتُفتح صفحة المزوّد
(كي نت أو بطاقة)، ويُسجَّل السداد على الفاتورة تلقائياً بعد أن يؤكّده المزوّد
نفسه — لا بعد أن يزعمه إشعار. وبلا إعدادٍ مكتمل لا يظهر زرّ دفع ويُقال إن
السداد يدوي. الربط في [PAYMENTS.md](PAYMENTS.md).

---

آخر تحديث للتوثيق: 2026-11-12
