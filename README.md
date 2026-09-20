# نهج — NAHJ

**نهج** هو نظام تعلم تشغيلي للمؤسسات: يتعلم كيف تعمل المؤسسة، يحول العمل الحقيقي إلى مهارات موثقة وقابلة للإصدار، يختبر نفسه عليها، ثم يكتسب حق التنفيذ تدريجيًا تحت حوكمة بشرية واضحة.

> **Teach → Learn → Verify → Practice → Shadow → Work → Audit → Improve**

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

## الهوية البصرية

الواجهة ليست Dashboard تقليدية. كل سطح له لغة إنفوجرافيكية خاصة: Atlas للعقل التشغيلي، Radar للتعلم، Teaching Stage لجلسة التعليم، Runway لتدرج الاستقلالية، Work River للتنفيذ، Constellation للتكاملات وGovernance Shield للحوكمة.

راجع `DESIGN_SYSTEM.md` قبل تعديل أي واجهة.

## التشغيل المحلي

المتطلبات: Node.js 22+.

```bash
npm install
cp .env.example .env
# ضع GEMINI_API_KEY عند الحاجة
npm run dev
```

للفحص والبناء:

```bash
npm run lint
npm run build
```

## نقطة البداية التجريبية

الحزمة تتضمن Education demo لإثبات الحلقة الأساسية عبر عملية **تسجيل طالب جديد**، لكن قلب النظام عام وغير مربوط بقطاع التعليم.

## وثائق المشروع

- `PRODUCT_SPEC.md`
- `ARCHITECTURE.md`
- `DATABASE_SCHEMA.md`
- `AI_ARCHITECTURE.md`
- `SECURITY.md`
- `EVALUATION.md`
- `MVP_SCOPE.md`
- `DECISIONS.md`
- `DESIGN_SYSTEM.md`
- `BILLING.md` — الاشتراك والترخيص: الباقات، المدّة، التجديد، الفواتير والدفعات.

## قاعدة المنتج

**Don't make companies configure AI. Let AI learn the company.**

**AI must earn the right to act.**

## الترخيص

للمنصة مالكٌ يملك عقدها، ومؤسسةٌ تشتريه. شاشة **الاشتراك** تُري المؤسسة مدّتها
وباقتها واستهلاكها وفواتيرها كاملة؛ و**لوحة المالك** تُدير الباقات والتسعير ودورة
الاشتراك والفواتير والدفعات. انتهاء الاشتراك يُجمّد الكتابة ولا يحجب القراءة —
البيانات للمؤسسة، والخدمة هي المُباعة. التفاصيل في `BILLING.md`.
