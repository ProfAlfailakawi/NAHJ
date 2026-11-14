# حذف الحساب — Guideline 5.1.1(v)

**Note for App Review (EN):** NAHJ accounts are provisioned by the licensing organisation (no open sign-up),
but the app now lets every signed-in user initiate deletion of their own account inside the app:
**Accounts screen > "Delete account" (حذف الحساب)**. It is visible in the iOS app. The user re-enters their
password and ticks a confirmation. The request is recorded, the account is suspended and its sessions
are ended immediately, and the user is signed out. The organisation's administrator then completes the
deletion within 30 days from the same Accounts screen ("Complete deletion"), which replaces the account's
email and name (also in the audit trail) with "deleted account" and invalidates the password.
Organisation business data (work items, skills, approvals, invoices) belongs to the organisation and is
not deleted with an individual's account. The platform-owner account and the last active administrator
cannot request deletion from the app (they would lock the organisation out); the app explains the step
needed first (transfer ownership / appoint another admin). Demo-environment visitors cannot delete anything.

## السلوك الفعلي في الشيفرة

- الواجهة: `src/components/DeleteAccountSection.tsx` داخل `AccountsView` (لا يستورد `isAppleNativeShell`، فيظهر في iOS).
- `POST /api/auth/account/deletion-request` (`server/routes.ts`): جلسة + CSRF، رفض الزائر التجريبي (403 `DEMO_READONLY`)،
  حدّ خمس محاولات/ساعة لكل حساب + حدّ IP المشترك مع الدخول، يتطلب `confirm:true` وكلمة المرور الصحيحة.
  يرفض المالك (409 `OWNER_ACCOUNT`) وآخر مشرف (409 `LAST_ADMIN`). عند القبول (معاملة واحدة): صفّ في
  `account_deletion_requests` (المهلة 30 يوماً)، `status = SUSPENDED`، حذف الجلسات، ثم مسح الكوكيز وحدث تدقيق `ACCOUNT_DELETION_REQUESTED`.
- `GET /api/auth/deletion-requests` (مشرف/مالك): قائمة الطلبات، وتظهر الطلبات المعلّقة في شاشة الحسابات.
- `POST /api/auth/deletion-requests/:id/complete` (مشرف/مالك، لا ينفّذ طلب نفسه): يُجهِّل صفّ الحساب (`status = DELETED`)،
  ويستبدل البريد والاسم في سجلّ التدقيق، ويفكّ ربط ملف المسوّق، ويسجّل `ACCOUNT_DELETION_COMPLETED`.
- لا يوجد تنفيذ تلقائي بعد 30 يوماً: التنفيذ يدوي من المشرف؛ والمهلة موعدٌ مسجَّل في الطلب لا مؤقّتٌ آلي.
- حدود معلنة: نسخ Firestore/Neon الاحتياطية وسجلات الفوترة والعمولات لا يمسّها التجهيل.

## مسألة مفتوحة للمالك (OWNER-TODO)

تأكّد من متابعة قائمة الطلبات دورياً (لا إشعار بريدي)، ومن سياسة نسخ Firestore/Neon الاحتياطية.
