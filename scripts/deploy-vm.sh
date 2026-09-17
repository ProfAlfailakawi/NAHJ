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
REPO="${REPO:-nahj}"
REGION="${REGION:-${ZONE%-*}}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/nahj:$(date +%Y%m%d-%H%M%S)"

if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  echo "اضبط PROJECT_ID أولاً:  export PROJECT_ID=your-project-id" >&2
  exit 1
fi
gcloud config set project "$PROJECT_ID" >/dev/null
step() { echo; echo "── $* ────────────────────────────────"; }
echo "المشروع: $PROJECT_ID · المنطقة: $ZONE · الخادم: $INSTANCE"

step "١/٦  تفعيل الخدمات"
gcloud services enable compute.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com --quiet

step "٢/٦  مستودع الصور"
gcloud artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1 ||
  gcloud artifacts repositories create "$REPO" --repository-format=docker \
    --location "$REGION" --description "NAHJ" --quiet

step "٣/٦  بناء الصورة ورفعها"
gcloud builds submit --tag "$IMAGE" --quiet .

step "٤/٦  القرص الدائم (${DATA_DISK_GB}GB)"
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

IMAGE=$(curl -sf -H "Metadata-Flavor: Google" \
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/nahj-image)
docker-credential-gcr configure-docker --registries "$(echo "$IMAGE" | cut -d/ -f1)" || true
docker pull "$IMAGE"
docker rm -f nahj 2>/dev/null || true
docker run -d --name nahj --restart always \
  -p 80:3000 \
  -v /var/nahj:/var/nahj \
  -e NODE_ENV=production \
  -e NAHJ_DATABASE_PATH=/var/nahj/nahj.sqlite \
  "$IMAGE"
EOF
)

step "٥/٦  الخادم"
if gcloud compute instances describe "$INSTANCE" --zone "$ZONE" >/dev/null 2>&1; then
  echo "موجود — تحديث الصورة وإعادة تشغيل الحاوية."
  gcloud compute instances add-metadata "$INSTANCE" --zone "$ZONE" --quiet \
    --metadata "nahj-image=$IMAGE" \
    --metadata-from-file "startup-script=/dev/stdin" <<< "$STARTUP"
  gcloud compute instances reset "$INSTANCE" --zone "$ZONE" --quiet
else
  gcloud compute instances create "$INSTANCE" \
    --zone "$ZONE" \
    --machine-type "$MACHINE_TYPE" \
    --image-family cos-stable --image-project cos-cloud \
    --disk "name=${DATA_DISK},device-name=nahj-data,mode=rw,auto-delete=no" \
    --scopes cloud-platform \
    --tags nahj-web \
    --metadata "nahj-image=$IMAGE" \
    --metadata-from-file "startup-script=/dev/stdin" \
    --quiet <<< "$STARTUP"
fi

step "٦/٦  جدار الحماية"
gcloud compute firewall-rules describe nahj-allow-http >/dev/null 2>&1 ||
  gcloud compute firewall-rules create nahj-allow-http \
    --allow tcp:80 --target-tags nahj-web \
    --description "NAHJ HTTP" --quiet

IP=$(gcloud compute instances describe "$INSTANCE" --zone "$ZONE" \
  --format='value(networkInterfaces[0].accessConfigs[0].natIP)')

cat <<EOM

تم. نهج على:  http://${IP}

أول إقلاع يأخذ دقيقة أو دقيقتين (سحب الصورة وتهيئة القرص). إن لم تُفتح الصفحة
فوراً، انتظر ثم أعد المحاولة، أو راجع السجل:

  gcloud compute ssh ${INSTANCE} --zone ${ZONE} --command 'docker logs nahj'

ثم افتح المتصفح وأنشئ حساب المشغّل الأول.

الاختبار الوحيد الذي يثبت أن القرص دائم: غيّر شيئاً (رقِّ مهارة)، ثم أعد تشغيل
هذا السكربت نفسه، ثم تأكد أن التغيير باقٍ.

⚠ هذا HTTP بلا شهادة. قبل أي استعمال حقيقي ضع اسم نطاق وشهادة TLS أمامه
  (موازن حِمل، أو Caddy على الخادم نفسه). كلمات المرور تمرّ من هنا.
EOM
