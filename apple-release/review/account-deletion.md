# حذف الحساب — ملاحظة المراجعة (Guideline 5.1.1(v))

**Note for App Review (EN):** NAHJ does not offer open account sign-up. Every account is provisioned by
the organisation that licenses the product: the first operator account of a deployment is created once
during first-run setup (that screen closes permanently as soon as any account exists), and every other
account is created by that organisation's administrator in the in-app Accounts screen. There is no
"Create account" button for end users and the app cannot create an account on its own. Accounts are
therefore managed by the organisation (Apple permits this for organisation-provisioned, business
accounts), and access is removed by the organisation's administrator (Accounts screen: suspend the
account, which ends its sessions immediately) or on written request to the operator (contact in the
privacy policy). The audit trail is kept as the organisation's operational record.

**Sign-in (EN):** email and password only. There is no social or third-party login, so Guideline 4.8
does not apply. The app contains no prices, plans or purchase links inside the iOS shell; subscriptions
are agreed between the operator and the organisation outside the app (Guideline 3.1.3(c)).

## ما تم التحقق منه في الشيفرة

- `server/routes.ts` + `server/auth.ts`: لا مسار تسجيل ذاتي. `createAccount` لا يُستدعى إلا من
  (1) `POST /api/auth/setup` (التهيئة الأولى: يُدرج صفاً فقط إن كان جدول الحسابات فارغاً، في جملة الإدراج
  نفسها، وإلا يردّ 409)، (2) `bootstrapFirstAccount` عند الإقلاع من متغيرات البيئة وبشرط عدم وجود أي حساب،
  (3) `adminCreateAccount` خلف `POST /api/auth/accounts` الذي يحرسه `requireAuth` و`requireRole("admin")`
  وحدّ مقاعد الباقة.
- تعطيل الوصول: `PATCH /api/auth/accounts/:id` (حالة `SUSPENDED`) يحذف جلسات الحساب فوراً، ولا يمكن لمشرف
  أن يعطّل نفسه أو آخر مشرف، ولا يُعلَّق حساب مالك المنصة من هذه الشاشة.
- `POST /api/auth/accounts/:id/revoke-sessions` و`POST /api/auth/accounts/:id/password` للمشرف.

## القرار

لم يُضف زر «حذف حسابي» داخل التطبيق لأن الحسابات لا تُنشأ إلا بإجراء من المؤسسة المرخِّصة. وإن قرّر
المالك لاحقاً فتح تسجيل ذاتي فيجب حينها إضافة حذف ذاتي (حذف/إخفاء هوية الحساب نفسه فقط مع إبقاء سجل
التدقيق) قبل أي إصدار جديد.

## مسألة مفتوحة للمالك (OWNER-TODO)

الحذف الفعلي (إزالة صفّ الحساب) غير موجود اليوم، والمتاح هو التعليق وإنهاء الجلسات؛ ومن يطلب حذف بياناته
يُنفَّذ طلبه يدوياً عبر المشغّل. إن رغب المراجع في مسارٍ آليّ فهذا عملٌ منفصل يحتاج قراراً بشأن سجلّ التدقيق.
