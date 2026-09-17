#!/usr/bin/env node
/*
 * نهج — فاحص جاهزية الإعداد.
 *
 * نهج بسيط الإعداد عمداً: لا مزوّد دفع ولا بريد. فالفحص الحقيقي الوحيد هنا هو
 * السؤال الذي يقرّر إن كان منتجاً أم نموذج عرض: هل قاعدة البيانات على قرص دائم؟
 *
 *   node scripts/verify-env.mjs
 *   node scripts/verify-env.mjs --strict   رمز خروج غير صفري عند أي مانع
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import path from 'node:path';

const strict = process.argv.includes('--strict');

const envPath = path.resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const env = process.env;
const val = (n) => (env[n] || '').trim();
const has = (n) => val(n).length > 0;

const C = { red: '\x1b[31m', green: '\x1b[32m', amber: '\x1b[33m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' };
let blocking = 0;
let warnings = 0;
const line = (icon, color, label, detail) =>
  console.log(`  ${color}${icon}${C.off}  ${label}${detail ? `\n       ${C.dim}${detail}${C.off}` : ''}`);

const production = val('NODE_ENV') === 'production';

console.log(`\n${C.bold}  نهج — جاهزية الإعداد${C.off}`);
console.log(`  ${C.dim}NODE_ENV=${val('NODE_ENV') || '(غير مضبوط)'}${C.off}`);
console.log('  ─────────────────────────────────────────────');

console.log(`\n${C.bold}  التخزين الدائم${C.off}`);
const dbPath = val('NAHJ_DATABASE_PATH')
  || (val('NAHJ_DATA_DIR') ? path.join(val('NAHJ_DATA_DIR'), 'nahj.sqlite') : path.resolve(process.cwd(), 'var', 'nahj.sqlite'));

if (!has('NAHJ_DATABASE_PATH') && !has('NAHJ_DATA_DIR') && production) {
  blocking += 1;
  line('✗', C.red, 'مسار قاعدة البيانات',
    `غير مضبوط — سيُستعمل ${dbPath} داخل حاوية الخدمة.\n       على قرص مؤقت يُمحى كل شيء مع كل نشر، فيعود نهج نموذج عرض.`);
} else {
  line('✓', C.green, 'مسار قاعدة البيانات', dbPath);
}

// نكتب فعلاً ونحذف: الصلاحية الفعلية أصدق من وجود المسار.
const dir = path.dirname(dbPath);
try {
  mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, `.write-probe-${process.pid}`);
  writeFileSync(probe, 'probe');
  unlinkSync(probe);
  line('✓', C.green, 'المجلد قابل للكتابة', dir);
} catch (error) {
  blocking += 1;
  line('✗', C.red, 'المجلد غير قابل للكتابة', `${dir} — ${error instanceof Error ? error.message : error}`);
}

if (existsSync(dbPath)) {
  const size = statSync(dbPath).size;
  line('✓', C.green, 'قاعدة بيانات موجودة', `${dbPath} (${(size / 1024).toFixed(1)} KB) — الحالة السابقة ستُستعاد`);
} else {
  line('○', C.dim, 'قاعدة بيانات جديدة', 'ستُنشأ عند أول إقلاع وتبدأ من البذرة');
}

/*
 * تنبيه على قرص مؤقت. لا نستطيع الجزم بأن المسار دائم من داخل العملية، لكن مساراً
 * داخل مجلد العمل أو /tmp في الإنتاج مؤشر قوي على أنه ليس كذلك.
 */
if (production) {
  const resolved = path.resolve(dbPath);
  const insideCwd = resolved.startsWith(path.resolve(process.cwd()) + path.sep);
  if (insideCwd || resolved.startsWith('/tmp/')) {
    warnings += 1;
    line('◐', C.amber, 'القرص قد يكون مؤقتاً',
      `${resolved} داخل مجلد التطبيق أو /tmp.\n       تأكد أنه وحدة تخزين دائمة مربوطة، وإلا ضاعت الحالة مع كل نشر.`);
  }
}

console.log(`\n${C.bold}  الحسابات${C.off}`);
if (has('NAHJ_ADMIN_EMAIL') && has('NAHJ_ADMIN_PASSWORD')) {
  const password = val('NAHJ_ADMIN_PASSWORD');
  if (password.length < 12 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
    blocking += 1;
    line('✗', C.red, 'حساب المشرف الأول', 'كلمة المرور لا تحقق الشروط (12 محرفاً على الأقل، حروف وأرقام) — سيفشل الإنشاء');
  } else {
    line('✓', C.green, 'حساب المشرف الأول', `سيُنشأ تلقائياً لـ${val('NAHJ_ADMIN_EMAIL')} إن لم يوجد أي حساب`);
  }
} else if (has('NAHJ_ADMIN_EMAIL') || has('NAHJ_ADMIN_PASSWORD')) {
  warnings += 1;
  line('◐', C.amber, 'حساب المشرف الأول', 'واحد من الاثنين فقط مضبوط — يُتجاهلان معاً، وستُعرض شاشة التهيئة بدلاً منهما');
} else {
  line('✓', C.green, 'حساب المشرف الأول', 'ستُعرض شاشة التهيئة في المتصفح عند أول تشغيل — وهذا المسار المعتاد');
}

console.log(`\n${C.bold}  ميزات${C.off}`);
line(val('NAHJ_DEMO_ENABLED') === 'false' ? '○' : '✓',
  val('NAHJ_DEMO_ENABLED') === 'false' ? C.dim : C.green,
  'البيئة التجريبية',
  val('NAHJ_DEMO_ENABLED') === 'false' ? 'مقفلة في هذا النشر' : 'مفعّلة — يدخلها الزائر من شاشة الدخول، معزولة تماماً');
line(has('GEMINI_API_KEY') ? '✓' : '○', has('GEMINI_API_KEY') ? C.green : C.amber, 'الذكاء الاصطناعي',
  has('GEMINI_API_KEY') ? undefined : 'بلا مفتاح — التوليف والمحاكاة تعمل بمنطقها الحتمي فقط، ولا تتعطّل');

console.log('\n  ─────────────────────────────────────────────');
console.log(`  ${blocking ? C.red : C.green}${blocking} مانع${C.off} · ${C.amber}${warnings} تنبيه${C.off}`);
if (blocking) console.log(`  ${C.red}لا تنشر قبل معالجة الموانع أعلاه.${C.off}`);
else if (warnings) console.log(`  ${C.amber}يعمل، لكن راجع التنبيهات — أهمها دوام القرص.${C.off}`);
else console.log(`  ${C.green}الإعداد مكتمل.${C.off}`);
console.log(`  ${C.dim}دوام القرص لا يمكن إثباته من داخل العملية — تحقّق منه بنشرٍ ثمّ إعادة نشر.${C.off}\n`);

if (strict && blocking) process.exit(1);
