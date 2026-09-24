#!/usr/bin/env bash
#
# نهج — إعدادات الخادم الحيّ (مفاتيح الدفع، البريد، التواصل، الذكاء…).
#
# الإعدادات في ملفٍ على القرص الدائم للخادم (/var/nahj/nahj.env) لا في GitHub:
# الأسرار لا تغادر الخادم، وتبقى بعد كل نشر. يُشغَّل من Cloud Shell:
#
#   bash scripts/server-env.sh list
#   bash scripts/server-env.sh set NAHJ_CONTACT_EMAIL=sales@example.com NAHJ_LEGAL_NAME="شركة نهج"
#   bash scripts/server-env.sh unset NAHJ_CONTACT_WHATSAPP
#   bash scripts/server-env.sh restart
#   bash scripts/server-env.sh check     فحص جاهزية الإعداد على الخادم الحيّ نفسه
#
# لخادمٍ غير الافتراضي (عميلٌ ثانٍ مثلاً):  INSTANCE=nahj-clinic ZONE=... bash scripts/server-env.sh list
#
# `set` و`unset` يعيدان تشغيل الحاوية تلقائياً لتقرأ القيم الجديدة (إيقافٌ
# مرتّب يدفق الحالة أولاً). والقيم تُعرض في `list` مُقنَّعة: لا يظهر سرٌّ كاملاً
# في طرفيةٍ قد تُصوَّر أو تُسجَّل.

set -euo pipefail

INSTANCE="${INSTANCE:-nahj}"
ZONE="${ZONE:-europe-west1-b}"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REMOTE_FILE="/var/nahj/nahj.env"

usage() {
  sed -n '3,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# ----------------------------------------------------------------- التحقق
#
# المفاتيح المقبولة وحدها: خطأٌ إملائي في اسمٍ («NAHJ_PAYMENT_APIKEY») يُقبل
# صامتاً ولا يقرؤه أحد، فيبدو الدفع مربوطاً وهو ليس كذلك. ومسار القاعدة ووضع
# التشغيل خارج القائمة عمداً: تغييرهما من هنا يفصل الخادم عن بياناته.
ALLOWED_KEYS=(
  NAHJ_PAYMENT_PROVIDER NAHJ_PAYMENT_API_KEY NAHJ_PAYMENT_WEBHOOK_SECRET NAHJ_PAYMENT_ENV NAHJ_PAYMENT_API_BASE NAHJ_PUBLIC_URL
  NAHJ_MAIL_PROVIDER NAHJ_MAIL_API_KEY NAHJ_MAIL_FROM NAHJ_MAIL_WEBHOOK_URL NAHJ_MAIL_INTERVAL_MINUTES
  NAHJ_OWNER_EMAIL NAHJ_ADMIN_EMAIL NAHJ_ADMIN_PASSWORD NAHJ_ADMIN_NAME
  NAHJ_CONTACT_EMAIL NAHJ_CONTACT_WHATSAPP NAHJ_LEGAL_NAME NAHJ_MARKETING
  NAHJ_DEMO_ENABLED NAHJ_DEMO_MAX_SANDBOXES NAHJ_TRIAL_DAYS
  NAHJ_BACKUP_DIR NAHJ_BACKUP_HOURS NAHJ_BACKUP_KEEP NAHJ_NEON_URL
  NAHJ_FIREBASE_SYNC GEMINI_API_KEY
)

is_allowed() {
  local key="$1" candidate
  for candidate in "${ALLOWED_KEYS[@]}"; do [[ "$candidate" == "$key" ]] && return 0; done
  return 1
}

validate_pair() {
  local pair="$1"
  if [[ "$pair" != *=* ]]; then echo "✗ «$pair» ليس بصيغة KEY=VALUE" >&2; return 1; fi
  local key="${pair%%=*}" value="${pair#*=}"
  if ! is_allowed "$key"; then
    echo "✗ «$key» ليس إعداداً معروفاً. المقبول: ${ALLOWED_KEYS[*]}" >&2
    return 1
  fi
  if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    echo "✗ قيمة «$key» فيها سطر جديد — غير مقبول في ملف الإعدادات." >&2
    return 1
  fi
}

# ------------------------------------------------------ التحرير (على الملف)
#
# المنطق نفسه يعمل على الخادم (عبر SSH) وعلى ملفٍ محلي (--file، للاختبار):
# مصدرٌ واحد لا نسختان تتباعدان. القيم تُنقل مُرمَّزة base64 فلا يكسرها اقتباس.

edit_file() {
  local file="$1" action="$2"; shift 2
  local tmp; tmp="$(mktemp)"
  touch "$file"
  case "$action" in
    set)
      local encoded pair key
      for encoded in "$@"; do
        pair="$(printf '%s' "$encoded" | base64 -d)"
        key="${pair%%=*}"
        grep -v "^${key}=" "$file" > "$tmp" || true
        printf '%s\n' "$pair" >> "$tmp"
        cat "$tmp" > "$file"
      done
      ;;
    unset)
      local key
      for key in "$@"; do
        grep -v "^${key}=" "$file" > "$tmp" || true
        cat "$tmp" > "$file"
      done
      ;;
    list)
      local line key value shown
      if [[ ! -s "$file" ]]; then echo "(لا إعدادات بعد)"; fi
      while IFS= read -r line || [[ -n "$line" ]]; do
        [[ -z "$line" || "$line" == \#* ]] && continue
        key="${line%%=*}"; value="${line#*=}"
        if [[ "$key" =~ (KEY|SECRET|PASSWORD) ]]; then
          shown="${value:0:4}… (${#value} حرفاً)"
        else
          shown="$value"
        fi
        printf '%-32s %s\n' "$key" "$shown"
      done < "$file"
      ;;
  esac
  rm -f "$tmp"
  chmod 600 "$file" 2>/dev/null || true
}

# ------------------------------------------------------------------ الأوامر

[[ $# -ge 1 ]] || usage 1

LOCAL_FILE=""
if [[ "$1" == "--file" ]]; then
  LOCAL_FILE="${2:?--file يحتاج مساراً}"; shift 2
fi
ACTION="${1:-}"; shift || true

ARGS=()
case "$ACTION" in
  set)
    [[ $# -ge 1 ]] || { echo "✗ set يحتاج KEY=VALUE واحداً على الأقل" >&2; exit 1; }
    for pair in "$@"; do validate_pair "$pair"; ARGS+=("$(printf '%s' "$pair" | base64 | tr -d '\n')"); done
    ;;
  unset)
    [[ $# -ge 1 ]] || { echo "✗ unset يحتاج اسم إعداد" >&2; exit 1; }
    for key in "$@"; do is_allowed "$key" || { echo "✗ «$key» ليس إعداداً معروفاً" >&2; exit 1; }; ARGS+=("$key"); done
    ;;
  list|restart|check) ;;
  -h|--help|help) usage 0 ;;
  *) echo "✗ أمر غير معروف: $ACTION" >&2; usage 1 ;;
esac

if [[ -n "$LOCAL_FILE" ]]; then
  [[ "$ACTION" == "restart" || "$ACTION" == "check" ]] || edit_file "$LOCAL_FILE" "$ACTION" "${ARGS[@]+"${ARGS[@]}"}"
  exit 0
fi

if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  echo "اضبط PROJECT_ID أولاً:  export PROJECT_ID=your-project-id" >&2
  exit 1
fi

# الدالة نفسها تُرسل إلى الخادم وتُنفَّذ هناك بصلاحية الجذر.
REMOTE="$(declare -f edit_file); "
case "$ACTION" in
  set|unset|list) REMOTE+="edit_file $REMOTE_FILE $ACTION ${ARGS[*]+${ARGS[*]}}; " ;;
esac
if [[ "$ACTION" == "set" || "$ACTION" == "unset" || "$ACTION" == "restart" ]]; then
  # سكربت الإقلاع نفسه يعيد إنشاء الحاوية بالملف الجديد، بإيقافٍ مرتّب يدفق الحالة.
  REMOTE+="echo 'إعادة تشغيل نهج لقراءة الإعدادات…'; google_metadata_script_runner startup >/dev/null 2>&1 || google_metadata_script_runner --script-type startup >/dev/null 2>&1; docker ps --filter name=nahj --format '✓ {{.Names}}: {{.Status}}'"
fi

if [[ "$ACTION" == "check" ]]; then
  # الفاحص داخل الحاوية: يقرأ ما يقرؤه الخادم فعلاً، لا ما في طرفيتك.
  REMOTE="docker exec nahj node scripts/verify-env.mjs"
fi

gcloud compute ssh "$INSTANCE" --zone "$ZONE" --project "$PROJECT_ID" --quiet \
  --command "sudo bash -c $(printf '%q' "$REMOTE")"
