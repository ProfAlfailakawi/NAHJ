# نشر نهج — إعدادٌ لمرة واحدة

المستودع يحمل سكربت نشر مكتملاً (`scripts/deploy-vm.sh`)، لكنه كان يُشغَّل
باليد. فكل ما يُدمج في `main` يبقى في GitHub ولا يصل إلى أحد — ومنه البيئة
التجريبية.

`.github/workflows/deploy.yml` يُشغّل السكربت نفسه عند كل دفع إلى `main`، بعد
اجتياز الفحوص. ويحتاج مرة واحدة إلى هوية نشرٍ بلا مفتاح دائم.

## لماذا خادم لا Cloud Run — بخلاف بقية البرامج

كل حالة نهج في ملف SQLite واحد:

| الخيار | الحكم |
|---|---|
| خادم + قرص دائم | ✅ WAL يعمل، قفل ملفات صحيح، ~٧$ شهرياً. **هذا ما ننشر عليه** |
| Cloud Run + Filestore | ⚠ يعمل بلا WAL، وأرخص باقة تتجاوز ٢٠٠$ شهرياً |
| Cloud Run + GCS FUSE | ❌ لا قفل ملفات حقيقياً — خطر تلف القاعدة |
| Cloud Run بلا وحدة تخزين | ❌ القرص مؤقت. **تضيع كل الحالة مع كل نشر** |

فوضعُ نهج على Cloud Run كبقية البرامج كان سيمحو الحسابات والموافقات وسجل الأثر
والمهارات المرقّاة مع كل نشر. الجدول نفسه في `CONNECT.md`، والسكربت مبنيٌّ عليه.

**والسكربت لا يحذف القرص ولا يمسّ بياناته أبداً** — آمن للإعادة: يُشغَّل مرة أولى
لينشئ كل شيء، وبعد كل تحديث لينشر الجديد.

## الخطوات — من Google Cloud Shell

`PROJECT` هو المشروع الذي تريد خادم نهج فيه. إن كان السكربت قد شُغّل من قبل،
فهو المشروع نفسه الذي شُغّل فيه — وإلا أُنشئ خادمٌ ثانٍ بقرصٍ فارغ.

```sh
PROJECT=<ضع معرّف المشروع هنا>
POOL=github
SA=nahj-deployer
REPO=ProfAlfailakawi/NAHJ

gcloud config set project "$PROJECT"

# ١. حساب خدمة للنشر
gcloud iam service-accounts create "$SA" || true
for ROLE in roles/compute.admin \
            roles/compute.osAdminLogin \
            roles/cloudbuild.builds.editor \
            roles/artifactregistry.admin \
            roles/storage.admin \
            roles/serviceusage.serviceUsageAdmin \
            roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member "serviceAccount:$SA@$PROJECT.iam.gserviceaccount.com" \
    --role "$ROLE" --condition=None
done

# ٢. اتحاد هوية لـGitHub — مقيَّد بهذا المستودع وحده
gcloud iam workload-identity-pools create "$POOL" --location global || true
gcloud iam workload-identity-pools providers create-oidc nahj \
  --location global --workload-identity-pool "$POOL" \
  --issuer-uri "https://token.actions.githubusercontent.com" \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition "assertion.repository=='$REPO'" || true

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
gcloud iam service-accounts add-iam-policy-binding \
  "$SA@$PROJECT.iam.gserviceaccount.com" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO"

echo "GCP_PROJECT_ID                 = $PROJECT"
echo "GCP_WORKLOAD_IDENTITY_PROVIDER = projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/nahj"
echo "GCP_DEPLOY_SERVICE_ACCOUNT     = $SA@$PROJECT.iam.gserviceaccount.com"
```

### عن الأدوار

`compute.admin` يُنشئ الخادم والقرص والعنوان المحجوز وقاعدة جدار الحماية.
و`compute.osAdminLogin` للاتصال بالخادم لتحديث الحاوية **دون إعادة تشغيله** —
وبدونه يتراجع السكربت إلى إيقافٍ مرتّب ثم تشغيل: يعمل، لكنه انقطاعٌ أطول في كل
نشر. و`serviceUsageAdmin` لتفعيل الخدمات في أول تشغيل فقط.

## ثم في GitHub

Settings → Secrets and variables → Actions → **Variables** (لا Secrets):

| المتغيّر | القيمة |
|---|---|
| `GCP_PROJECT_ID` | معرّف المشروع |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | السطر المطبوع أعلاه |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | `nahj-deployer@<المشروع>.iam.gserviceaccount.com` |

واثنان اختياريان:

| المتغيّر | الأثر |
|---|---|
| `GCP_ZONE` | بدونه يستعمل السكربت `europe-west1-b`. **إن كان الخادم منشأً من قبل في منطقة أخرى فاضبطه عليها** — وإلا أُنشئ خادمٌ ثانٍ بقرصٍ فارغ بدل تحديث القائم |
| `NAHJ_DOMAIN` | نطاقك إن ملكته. بدونه يُشتقّ اسمٌ من عنوان الخادم عبر sslip.io وتصدر له Let's Encrypt شهادةً حقيقية — يعمل ومشفَّر، لكنه ليس اسماً تجارياً |

وثالثٌ لخوادم العملاء — انظر «خوادم العملاء» أدناه:

| المتغيّر | الأثر |
|---|---|
| `NAHJ_CUSTOMERS` | سطرٌ لكل عميل: `اسم_الخادم النطاق [المنطقة]`. كلٌّ يُحدَّث بالصورة نفسها بعد نشرك |

## الإعدادات على الخادم — مفاتيح الدفع والبريد والتواصل

الخادم يقرأ ملفاً على قرصه الدائم: `/var/nahj/nahj.env`. **لا في GitHub**: الأسرار
لا تغادر الخادم، وتبقى بعد كل نشر. يُحرَّر من Cloud Shell:

```bash
export PROJECT_ID=<معرّف المشروع>

# ما هو مضبوط الآن (الأسرار مُقنَّعة)
bash scripts/server-env.sh list

# الضبط — يعيد تشغيل الخدمة تلقائياً بإيقافٍ مرتّب
bash scripts/server-env.sh set \
  NAHJ_ADMIN_NAME="اسمك" \
  NAHJ_CONTACT_EMAIL=sales@your-domain.com \
  NAHJ_CONTACT_WHATSAPP=96550000000 \
  NAHJ_LEGAL_NAME="الاسم القانوني لشركتك"

# فحص الجاهزية على الخادم نفسه — بما يقرؤه فعلاً
bash scripts/server-env.sh check
```

* الأداة **لا تقبل إلا الإعدادات المعروفة**: خطأٌ إملائي (`NAHJ_PAYMENT_APIKEY`)
  يُرفض بدل أن يُقبل صامتاً فيبدو الدفع مربوطاً وهو ليس كذلك.
* `NAHJ_PUBLIC_URL` يُشتقّ تلقائياً من النطاق (`https://<النطاق>`) — لا تضبطه إلا
  لتغييره.
* مفاتيح الدفع: `NAHJ_PAYMENT_PROVIDER`، `NAHJ_PAYMENT_API_KEY`،
  `NAHJ_PAYMENT_WEBHOOK_SECRET`، `NAHJ_PAYMENT_ENV` — الخطوات في `PAYMENTS.md`.

## ربط نطاقك

الخطوات كاملةً في [`docs/domain.md`](domain.md). باختصار: سجلّ `A` في DNS يشير إلى
عنوان الخادم الثابت، ثم `NAHJ_DOMAIN` في متغيّرات GitHub، ثم دمجٌ أو تشغيلٌ يدوي
للورك-فلو — فتصدر الشهادة ويصير العنوان العلني هو نطاقك.

## خوادم العملاء — خادمٌ لكل مؤسسة

كل مؤسسةٍ مشترية على خادمها وقرصها (نحو 7$ شهرياً للخادم الصغير): بياناتها لا
تجاور بيانات غيرها أصلاً. ونشرك أنت هو الموقع التسويقي ولوحة طلبات العرض.

**أول مرة لعميل** — من Cloud Shell:

```bash
INSTANCE=nahj-shifa DATA_DISK=nahj-shifa-data NAHJ_DOMAIN=app.shifa-clinic.com \
  NAHJ_MARKETING=off bash scripts/deploy-vm.sh
```

`NAHJ_MARKETING=off` يجعل خادم العميل بلا صفحة تسويق ولا عرضٍ تجريبي: موظفوه
يفتحون العنوان فيجدون الدخول مباشرة، وأول دخولٍ لمشرفهم يفتح «أعِدّ مؤسستك».

**ثم** أضف سطره إلى متغيّر `NAHJ_CUSTOMERS` في GitHub (`nahj-shifa app.shifa-clinic.com`)
فيُحدَّث تلقائياً مع كل دمج. وإعداداته بالأداة نفسها:
`INSTANCE=nahj-shifa bash scripts/server-env.sh set ...`

عميلٌ يفشل نشره لا يوقف الباقين، ويُعلَن فشله في آخر السجل فلا يُخفى.

## ما يحرسه الورك-فلو

* **لا نشر فوق فحصٍ أحمر**: `typecheck` و`test` قبل النشر — وعلى كل طلب دمجٍ قبل
  دمجه (`ci.yml`)، فيُمسَك الكسر على الفرع لا بعد وصوله إلى main.
* **لا مشروع مخمَّن**: `GCP_PROJECT_ID` إلزامي. نشرٌ في مشروعٍ خاطئ ينشئ خادماً
  وقرصاً لا يريدهما أحد ويترك الموقع الحيّ كما هو — فشلٌ صامت ومكلف.
* **الخادم يردّ بعد النشر**: السكربت يسأل الخادم نفسه حتى ثلاث دقائق، ويفشل إن
  لم يردّ. نشرٌ ينتهي بخادمٍ صامت ليس نشرًا ناجحًا وإن أُنشئت الموارد كلها.

## ملاحظة عن العنوان الحيّ

هذا الورك-فلو يُحدّث خادم المشروع نفسه الذي ينشره `deploy-vm.sh`، ويطبع عنوانه
في نهاية السجل.

فإن كان ما يفتحه الناس اليوم عنواناً آخر — استضافة AI Studio مثلاً — فذاك نشرٌ
منفصل لا يصله هذا الورك-فلو: يبقى على ما هو عليه، ويُحدَّث من AI Studio كما كان.
ولجعل النشر التلقائي هو المصدر، وجّه النطاق إلى العنوان المطبوع (أو اضبط
`NAHJ_DOMAIN` عليه فتصدر له شهادة باسمه).

## للتجربة قبل الاعتماد

الورك-فلو يقبل `workflow_dispatch`: شغّله يدويًا من تبويب Actions بعد ضبط
المتغيّرات، وراقب النتيجة قبل أن تعتمد على النشر التلقائي.
