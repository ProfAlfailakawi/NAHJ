# ─────────────────────────────────────────────────────────────────────────────
# نهج — صورة الإنتاج.
#
# node:22 مطلوب لا اختياري: التخزين يستعمل `node:sqlite` المدمج، وهو غير موجود
# في الإصدارات الأقدم.
#
# القاعدة **لا** تُخزَّن داخل الصورة. NAHJ_DATABASE_PATH يجب أن يشير إلى قرص
# دائم مركّب من الخارج (انظر scripts/deploy-vm.sh). بدونه تُكتب الحالة داخل
# الحاوية وتضيع مع أول إعادة نشر.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
# يقرؤه server/firebase.ts من مجلد العمل وقت التشغيل.
COPY --from=builder /app/firebase-applet-config.json ./firebase-applet-config.json

# مجلد البيانات الافتراضي، ونقطة تركيب القرص الدائم.
ENV NAHJ_DATA_DIR=/var/nahj
RUN mkdir -p /var/nahj && chown -R node:node /var/nahj

EXPOSE 3000
USER node
CMD ["node", "dist/server.cjs"]
