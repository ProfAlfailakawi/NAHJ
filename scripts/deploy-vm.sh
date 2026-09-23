#!/usr/bin/env bash
#
# نهج — نشر على Compute Engine بقرص دائم.
#
# شغّله في **Cloud Shell** (أيقونة >_ في لوحة Google Cloud). هناك تكون مسجَّل
# الدخول أصلاً، فلا يحتاج منك مفاتيح ولا تثبيت gcloud.
#
#     export PROJECT_ID=your-project-id
#     bash scripts/deploy-vm.sh
#
# ── لماذا VM وليس Cloud Run ─────────────────────────────────────────────────
# كل حالة نهج في ملف SQLite واحد. SQLite يحتاج قرصاً كتلياً حقيقياً:
#
#   · قرص Persistent Disk على VM  → WAL يعمل، قفل الملفات صحيح، ~٧$ شهرياً
#   · Cloud Run + Filestore (NFS) → يعمل بلا WAL، لكن أرخص باقة تتجاوز ٢٠٠$ شهرياً
#   · Cloud Run + GCS FUSE        → لا قفل ملفات حقيقياً. خطر تلف القاعدة. لا تفعل
#   · Cloud Run بلا قرص           → القرص مؤقت. تضيع كل الحالة مع كل نشر
#
# لذلك هذا السكربت يختار الأول. الخادم نسخة واحدة بطبيعته، وهو ما يحتاجه SQLite.
#
# آمن للإعادة: شغّله مرة أولى لينشئ كل شيء، وشغّله بعد كل تحديث لينشر الإصدار
# الجديد. لا يحذف القرص ولا يمسّ بياناته أبداً.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
ZONE="${ZONE:-europe-west1-b}"
INSTANCE="${INSTANCE:-nahj}"
DATA_DISK="${DATA_DISK:-nahj-data}"
DATA_DISK_GB="${DATA_DISK_GB:-10}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-small}"
NAHJ_DOMAIN="${NAHJ_DOMAIN:-}"   # نطاقك إن ملكته؛ وإلا يُشتق اسم من العنوان عبر sslip.io
# off لخادم عميل: لا صفحة تسويق ولا عرض تجريبي — موظفوه يدخلون عملهم مباشرة.
NAHJ_MARKETING="${NAHJ_MARKETING:-}"
REPO="${REPO:-nahj}"
REGION="${REGION:-${ZONE%-*}}"
# صورةٌ مُعطاة تُنشر كما هي: نشرُ العملاء بعد نشرك يعيد استعمال الصورة نفسها
# (SKIP_BUILD=1) بدل بنائها مرةً لكل خادم.
IMAGE="${IMAGE:-${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/nahj:$(date +%Y%m%d-%H%M%S)}"
SKIP_BUILD="${SKIP_BUILD:-}"

if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  echo "اضبط PROJECT_ID أولاً:  export PROJECT_ID=your-project-id" >&2
  exit 1
fi
gcloud config set project "$PROJECT_ID" >/dev/null
step() { echo; echo "── $* ────────────────────────────────"; }
echo "المشروع: $PROJECT_ID · المنطقة: $ZONE · الخادم: $INSTANCE"

META="nahj-image=$IMAGE${NAHJ_DOMAIN:+,nahj-domain=$NAHJ_DOMAIN}${NAHJ_MARKETING:+,nahj-marketing=$NAHJ_MARKETING}"

step "١/٧  تفعيل الخدمات"
gcloud services enable compute.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com --quiet

step "٢/٧  مستودع الصور"
gcloud artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1 ||
  gcloud artifacts repositories create "$REPO" --repository-format=docker \
    --location "$REGION" --description "NAHJ" --quiet

step "٣/٧  بناء الصورة ورفعها"
if [[ "$SKIP_BUILD" == "1" ]]; then
  echo "صورةٌ مبنية مسبقاً: $IMAGE"
else
  gcloud builds submit --tag "$IMAGE" --quiet .
fi

step "٤/٧  القرص الدائم (${DATA_DISK_GB}GB)"
# لا يُحذف ولا يُعاد إنشاؤه أبداً: هو كل ما تملكه المنصة من حالة.
if gcloud compute disks describe "$DATA_DISK" --zone "$ZONE" >/dev/null 2>&1; then
  echo "موجود مسبقاً — لم يُمسّ."
else
  gcloud compute disks create "$DATA_DISK" --size "${DATA_DISK_GB}GB" \
    --type pd-balanced --zone "$ZONE" --quiet
fi

# سكربت الإقلاع: يهيّئ القرص عند أول مرة فقط، ثم يركّبه ويشغّل الحاوية.
# يُعاد تنفيذه عند كل إقلاع وعند كل نشر، وكله شرطي فلا يتلف شيئاً.
STARTUP=$(cat <<'EOF'
#!/bin/bash
set -euo pipefail
DEV=/dev/disk/by-id/google-nahj-data
MOUNT=/var/nahj

# التهيئة مرة واحدة فقط: إن كان على القرص نظام ملفات فلا نلمسه.
if ! blkid "$DEV" >/dev/null 2>&1; then
  mkfs.ext4 -m 0 -F -E lazy_itable_init=0,lazy_journal_init=0,discard "$DEV"
fi
mkdir -p "$MOUNT"
mountpoint -q "$MOUNT" || mount -o discard,defaults "$DEV" "$MOUNT"
grep -q "$MOUNT" /etc/fstab || echo "$DEV $MOUNT ext4 discard,defaults,nofail 0 2" >> /etc/fstab
chown -R 1000:1000 "$MOUNT"

md() { curl -sf -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/$1"; }
IMAGE=$(md instance/attributes/nahj-image)

# اسم النطاق للشهادة. إن لم يُضبط نطاق خاص، نشتقّ اسماً من العنوان الخارجي عبر
# sslip.io — خدمة DNS تُرجع العنوان المضمَّن في الاسم نفسه. Let's Encrypt تصدر
# له شهادة حقيقية موثوقة، فنحصل على TLS بلا شراء نطاق.
DOMAIN=$(md instance/attributes/nahj-domain || true)
if [[ -z "$DOMAIN" ]]; then
  EXTERNAL_IP=$(md instance/network-interfaces/0/access-configs/0/external-ip)
  DOMAIN="${EXTERNAL_IP//./-}.sslip.io"
fi

# جذر COS للقراءة فقط، فـ `docker-credential-gcr` لا يستطيع كتابة /root/.docker
# ويفشل صامتاً، فيخرج السحب بلا اعتماد ويُرفض بـ "Unauthenticated request".
# نوجّه HOME إلى مسار قابل للكتابة يقرؤه المُعتمِد وعميل docker معاً.
export HOME=/var/lib/nahj-docker
mkdir -p "$HOME"
docker-credential-gcr configure-docker --registries "$(echo "$IMAGE" | cut -d/ -f1)"
docker pull "$IMAGE"

docker network inspect nahjnet >/dev/null 2>&1 || docker network create nahjnet

# نهج لم يعد ينشر منفذاً على المضيف: Caddy وحده يواجه الإنترنت، ويمرّر الطلبات
# داخل الشبكة الخاصة. فلا يبقى أي مسار يصل إلى التطبيق بلا تشفير.
# SIGTERM ثم مهلة: الخادم يلتقطها ويدفق الحالة ويغلق القاعدة. `docker rm -f`
# يرسل SIGKILL مباشرة فيتخطّى ذلك ويضيّع حتى ٣ ثوانٍ من آخر التغييرات.
# ملف الإعدادات على القرص الدائم: مفاتيح بوابة الدفع والبريد والذكاء وبيانات
# التواصل. كان الخادم يُشغَّل بمتغيّرين فقط، فلا طريق لأي مفتاحٍ إليه — ولا
# ربط دفعٍ ممكناً مهما ضُبط. والملف هنا لا في GitHub: الأسرار لا تغادر الخادم،
# وتبقى بعد كل نشر لأن القرص لا يُمسّ. يُحرَّر بـ scripts/server-env.sh.
ENV_FILE="$MOUNT/nahj.env"
[[ -f "$ENV_FILE" ]] || { touch "$ENV_FILE"; }
chmod 600 "$ENV_FILE"
ENV_ARGS=(--env-file "$ENV_FILE")
# العنوان العلني من النطاق — إلا إن ضبطه الملف صراحةً. بوابة الدفع تشتقّ منه
# عنوان الإشعار وعنوان العودة، فغيابه يوقف التحصيل.
grep -q '^NAHJ_PUBLIC_URL=' "$ENV_FILE" || ENV_ARGS+=(-e "NAHJ_PUBLIC_URL=https://${DOMAIN}")
# خادم عميل: التسويق والعرض مطفآن ما لم يضبطهما الملف صراحةً.
if [[ "$(md instance/attributes/nahj-marketing || true)" == "off" ]]; then
  grep -q '^NAHJ_MARKETING=' "$ENV_FILE" || ENV_ARGS+=(-e "NAHJ_MARKETING=off")
  grep -q '^NAHJ_DEMO_ENABLED=' "$ENV_FILE" || ENV_ARGS+=(-e "NAHJ_DEMO_ENABLED=false")
fi

docker stop -t 30 nahj 2>/dev/null || true
docker rm nahj 2>/dev/null || true
docker run -d --name nahj --restart always --network nahjnet \
  -v /var/nahj:/var/nahj \
  "${ENV_ARGS[@]}" \
  -e NODE_ENV=production \
  -e NAHJ_DATABASE_PATH=/var/nahj/nahj.sqlite \
  "$IMAGE"

# الشهادات تُخزَّن على /var الدائم لا داخل الحاوية: إعادة النشر لا تعيد طلبها،
# فلا نصطدم بحدود إصدار Let's Encrypt.
mkdir -p /var/caddy/data /var/caddy/config
cat > /var/caddy/Caddyfile <<CADDYFILE
${DOMAIN} {
	reverse_proxy nahj:3000
}
CADDYFILE

docker stop -t 10 caddy 2>/dev/null || true
docker rm caddy 2>/dev/null || true
docker run -d --name caddy --restart always --network nahjnet \
  -p 80:80 -p 443:443 \
  -v /var/caddy/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v /var/caddy/data:/data \
  -v /var/caddy/config:/config \
  caddy:2
EOF
)

step "٥/٧  الخادم"
if gcloud compute instances describe "$INSTANCE" --zone "$ZONE" >/dev/null 2>&1; then
  echo "موجود — تحديث الصورة وإعادة تشغيل الحاوية."
  gcloud compute instances add-metadata "$INSTANCE" --zone "$ZONE" --quiet \
    --metadata "$META" \
    --metadata-from-file "startup-script=/dev/stdin" <<< "$STARTUP"
  # لا `instances reset`: هو قطع تيار، يتخطّى SIGTERM الذي يدفق به الخادم حالته.
  # نُعيد تشغيل سكربت الإقلاع داخل الخادم بدل إعادة تشغيل الخادم كله.
  # صيغة الوسيط تختلف بين إصدارات COS، فنجرّب الاثنتين.
  if gcloud compute ssh "$INSTANCE" --zone "$ZONE" --quiet --command \
       'sudo google_metadata_script_runner startup || sudo google_metadata_script_runner --script-type startup' 2>/dev/null; then
    echo "✓ حُدّثت الحاوية دون إعادة تشغيل."
  else
    # تعذّر SSH: إيقاف مرتّب (ACPI) ثم تشغيل — أبطأ، لكنه يمنح الخادم فرصة الإغلاق.
    echo "تعذّر SSH — إيقاف مرتّب ثم تشغيل."
    gcloud compute instances stop "$INSTANCE" --zone "$ZONE" --quiet
    gcloud compute instances start "$INSTANCE" --zone "$ZONE" --quiet
  fi
else
  # النطاقات أضيق ما يكفي: قراءة الصور من Artifact Registry، وكتابة السجلات
  # والقياسات. cloud-platform كان يعني أن أي اختراق لهذا الخادم المكشوف يُسلّم
  # رمزاً بصلاحية المشروع كله عبر خادم البيانات الوصفية.
  gcloud compute instances create "$INSTANCE" \
    --zone "$ZONE" \
    --machine-type "$MACHINE_TYPE" \
    --image-family cos-stable --image-project cos-cloud \
    --disk "name=${DATA_DISK},device-name=nahj-data,mode=rw,auto-delete=no" \
    --scopes https://www.googleapis.com/auth/devstorage.read_only,https://www.googleapis.com/auth/logging.write,https://www.googleapis.com/auth/monitoring.write \
    --tags nahj-web \
    --metadata "$META" \
    --metadata-from-file "startup-script=/dev/stdin" \
    --quiet <<< "$STARTUP"
fi

step "٦/٧  جدار الحماية"
# 443 للموقع، و80 يبقى مفتوحاً لأن Let's Encrypt تتحقق عبره ثم يُحوّل Caddy
# كل طلب http إلى https.
if gcloud compute firewall-rules describe nahj-allow-http >/dev/null 2>&1; then
  gcloud compute firewall-rules update nahj-allow-http \
    --allow tcp:80,tcp:443 --quiet >/dev/null
  echo "✓ محدّثة: 80 و443"
else
  gcloud compute firewall-rules create nahj-allow-http \
    --allow tcp:80,tcp:443 --target-tags nahj-web \
    --description "NAHJ HTTP/HTTPS" --quiet
fi

step "٧/٧  عنوان ثابت"
# بدون عنوان محجوز، كل إيقاف/تشغيل يبدّل العنوان — فينكسر أي DNS أو شهادة تربطها به.
if gcloud compute addresses describe "${INSTANCE}-ip" --region "$REGION" >/dev/null 2>&1; then
  echo "محجوز مسبقاً."
else
  CURRENT_IP=$(gcloud compute instances describe "$INSTANCE" --zone "$ZONE" \
    --format='value(networkInterfaces[0].accessConfigs[0].natIP)')
  # نحجز العنوان الحالي نفسه، فلا يتغيّر ما هو مفتوح الآن.
  gcloud compute addresses create "${INSTANCE}-ip" --region "$REGION" \
    --addresses "$CURRENT_IP" --quiet 2>/dev/null \
    && echo "✓ حُجز $CURRENT_IP" \
    || echo "⚠ تعذّر حجز العنوان — سيتغيّر مع كل إيقاف/تشغيل."
fi

IP=$(gcloud compute instances describe "$INSTANCE" --zone "$ZONE" \
  --format='value(networkInterfaces[0].accessConfigs[0].natIP)')

# لا نُعلن النجاح لمجرد أن gcloud رجع بلا خطأ: أول تشغيل حقيقي لهذا السكربت أنشأ
# كل الموارد بنجاح بينما فشل سكربت الإقلاع داخل الخادم ولم تقم الحاوية إطلاقاً،
# فطُبع عنوان لا يرد. نسأل الخادم نفسه.
DOMAIN="${NAHJ_DOMAIN:-${IP//./-}.sslip.io}"

# لا نُعلن النجاح لمجرد أن gcloud رجع بلا خطأ: أول تشغيل حقيقي لهذا السكربت أنشأ
# كل الموارد بنجاح بينما فشل سكربت الإقلاع داخل الخادم ولم تقم الحاوية إطلاقاً،
# فطُبع عنوان لا يرد. نسأل الخادم نفسه — وعبر https تحديداً، فالوصول وحده لا
# يثبت أن الشهادة صدرت.
echo
echo "── التحقق ────────────────────────────────"
echo "انتظار الحاوية وإصدار شهادة Let's Encrypt (حتى ٥ دقائق)…"
UP=""
for _ in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -m 8 -w '%{http_code}' "https://${DOMAIN}/" 2>/dev/null || true)
  if [[ "$CODE" == "200" ]]; then UP="yes"; break; fi
  sleep 10
done

if [[ -z "$UP" ]]; then
  cat >&2 <<FAIL

❌ الموارد أُنشئت، لكن نهج لا يرد على https://${DOMAIN}

هذا فشل، لا تأخّر. السبب الأشيع تعثّر إصدار الشهادة. اقرأ سجلّ Caddy:

  gcloud compute ssh ${INSTANCE} --zone ${ZONE} --project ${PROJECT_ID} \\
    --command 'docker logs caddy 2>&1 | tail -30; docker ps -a'

أعد تشغيل هذا السكربت بعد معالجة السبب — لن يُنشئ شيئاً مرتين ولن يمسّ القرص،
والشهادة الصادرة محفوظة على القرص فلا تُطلب من جديد.
FAIL
  exit 1
fi

cat <<EOM

✅ تم التحقق: نهج يعمل على  https://${DOMAIN}

الاتصال مشفَّر بشهادة Let's Encrypt، ويتجدّد تلقائياً. طلبات http تُحوَّل إلى https.

افتح المتصفح وأنشئ حساب المشغّل الأول.

الإعدادات (مفاتيح الدفع، البريد، التواصل…) في ملفٍ على قرص الخادم، تُضبط بـ:

  INSTANCE=${INSTANCE} ZONE=${ZONE} bash scripts/server-env.sh set NAHJ_CONTACT_EMAIL=you@example.com

لمراجعة السجل في أي وقت:

  gcloud compute ssh ${INSTANCE} --zone ${ZONE} --project ${PROJECT_ID} --command 'docker logs nahj'

الاختبار الوحيد الذي يثبت أن القرص دائم: غيّر شيئاً (رقِّ مهارة)، ثم أعد تشغيل
هذا السكربت نفسه، ثم تأكد أن التغيير باقٍ.

ℹ العنوان مشتقّ من IP الخادم عبر sslip.io. يعمل ومشفَّر، لكنه ليس اسماً تجارياً.
  حين تملك نطاقاً، وجّهه إلى ${IP} ثم شغّل:  NAHJ_DOMAIN=your-domain.com bash scripts/deploy-vm.sh
EOM
