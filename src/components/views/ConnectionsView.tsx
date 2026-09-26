import React, { useEffect, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Cloud,
  Database,
  FileCheck2,
  HardDriveDownload,
  MessageCircleMore,
  PlugZap,
  RefreshCw,
  Server,
  ShieldCheck,
  TriangleAlert,
  Zap,
} from "lucide-react";
import type { Connector } from "../../types";
import { PageHeader, SectionTitle } from "../Primitives";
import { ConnectionConstellation } from "../Visuals";
import { apiOrNull } from "../../lib/api";

/*
 * شاشة الربط.
 *
 * كانت تقول: «جميع المهارات وسجلات التدقيق والاعتمادات وسير العمل متصلة
 * ومزامنة مع سحابة Firebase في باسم المشروع»، وتعرض وسماً أخضر نابضاً «سحابة
 * نشطة ومتصلة» وووسمَي «القواعد منشورة» و«عشر مجموعات مرآة» — كل ذلك ثابتٌ في
 * الشيفرة لا يُقرأ من حالة. والواقع أن المزامنة تُردّ بـ PERMISSION_DENIED،
 * وأن الموصلات الخمسة الأخرى لا تُخرج طلب شبكة واحداً.
 *
 * وعدٌ بتكاملٍ غير قائم يُكتشف بعد الشراء، فيُسقط الثقة بكل رقمٍ آخر في
 * المنتج — بما فيه الصادق. فالشاشة الآن تقرأ الحالة الحقيقية، وتُعلن المحاكاة
 * محاكاةً. القدرة تُبنى لاحقاً؛ الصدق شرطُ البيع اليوم.
 */

interface FirebaseStatus {
  connected: boolean;
  projectId: string;
  databaseId: string;
  lastSyncTime: string | null;
  error: string | null;
}

type Props = {
  lang: "ar" | "en";
  connectors: Connector[];
  testingId: string | null;
  onTest: (id: string) => void;
};

const icons = [Database, CalendarDays, CircleDollarSign, FileCheck2, MessageCircleMore, PlugZap];

export function ConnectionsView({ lang, connectors, testingId, onTest }: Props) {
  const ar = lang === "ar";
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [cloud, setCloud] = useState<FirebaseStatus | null>(null);

  const readCloud = async () => {
    const res = await apiOrNull<{ status: FirebaseStatus }>("/firebase/status");
    if (res?.status) setCloud(res.status);
  };
  useEffect(() => { void readCloud(); }, []);

  const status = {
    healthy: connectors.filter((c) => c.status === "healthy").length,
    degraded: connectors.filter((c) => c.status === "degraded").length,
    disconnected: connectors.filter((c) => c.status === "disconnected").length,
  };

  const handleFirebaseSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await apiOrNull<{ success: boolean; count: number; reason?: string }>("/firebase/sync", {
        method: "POST",
        body: "{}",
      });
      /*
       * `success: false` كان يسقط في فرع يقول "اكتملت المزامنة بنجاح" — أي أن الزر
       * يُبلّغ نجاحاً بينما لم يُكتب شيء. الفشل يُعرض الآن فشلاً، وبسببه إن عرفه الخادم.
       */
      await readCloud();
      if (res?.success) {
        setSyncResult(
          ar
            ? `تمت مزامنة ${res.count} عنصراً إلى المرآة السحابية`
            : `Synced ${res.count} entities to the cloud mirror`
        );
        setSyncFailed(false);
      } else {
        setSyncFailed(true);
        setSyncResult(
          res?.reason
            || (ar ? "تعذّرت المزامنة — لم يُكتب أي عنصر." : "Sync failed — nothing was written.")
        );
      }
    } catch {
      setSyncFailed(true);
      setSyncResult(ar ? "حدث خطأ أثناء المزامنة" : "Sync error occurred");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow={ar?"الربط":"CONNECTIONS"}
        title={ar ? "ما هو موصولٌ فعلاً، وما هو محاكاة." : "What is actually wired, and what is simulated."}
        hint={
          ar
            ? "بيانات نهج تُحفظ في مخزن المحرّك المحلي — وهو مصدر الحقيقة. وما دونه هنا يُعلن حالته: وصلةٌ قائمة أو محاكاةٌ لم تُطرق فيها أي نظام خارجي."
            : "NAHJ's data lives in the local engine store — the source of truth. Everything below states its real state: a live link, or a simulation that touches no external system."
        }
      />

      {/* بطاقة المرآة السحابية — كل سطرٍ فيها يُقرأ من /firebase/status. */}
      <div className={`mb-6 p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${cloud?.connected ? "bg-emerald-500/5 border-emerald-500/30" : "bg-slate-800/40 border-slate-700"}`}>
        <div className="flex items-start gap-3.5">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${cloud?.connected ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-slate-700/40 text-slate-400 border-slate-600"}`}>
            <Cloud className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-white text-base tracking-wide">
                {ar ? "المرآة السحابية (Firestore)" : "Cloud mirror (Firestore)"}
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border flex items-center gap-1 ${cloud?.connected ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-slate-700/60 text-slate-300 border-slate-600"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cloud?.connected ? "bg-emerald-400" : "bg-slate-400"}`} />
                {cloud === null
                  ? (ar ? "جارٍ قراءة الحالة" : "Reading state")
                  : cloud.connected
                    ? (ar ? "وصلةٌ قائمة" : "Link established")
                    : (ar ? "غير موصولة" : "Not connected")}
              </span>
            </div>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
              {ar
                ? "مصدر الحقيقة هو مخزن المحرّك المحلي؛ وهذه نسخةٌ اختيارية تُرفع إليها. وإن لم تُضبط بيانات المشروع أو رفضت قواعد الأمان الكتابة، لا تُكتب نسخة — ويُقال ذلك هنا بدل أن يُعرض وسمٌ أخضر."
                : "The local engine store is the source of truth; this is an optional copy. If the project is unconfigured or security rules reject the write, nothing is copied — and that is said here."}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-400">
              <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700">
                {ar ? "المشروع" : "Project"}: {cloud?.projectId || (ar ? "غير مضبوط" : "unset")}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700">
                {ar ? "آخر مزامنة ناجحة" : "Last successful sync"}: {cloud?.lastSyncTime ? new Date(cloud.lastSyncTime).toLocaleString("ar-KW") : (ar ? "لا شيء" : "none")}
              </span>
            </div>
            {cloud?.error && (
              <div className="mt-2 text-xs font-medium flex items-start gap-1.5 text-amber-400">
                <TriangleAlert className="w-4 h-4 shrink-0 mt-px" />
                <span className="break-all">{cloud.error}</span>
              </div>
            )}
            {syncResult && (
              /* اللون والأيقونة يتبعان النتيجة الحقيقية — لا أخضر دائماً مهما حدث. */
              <div className={`mt-2 text-xs font-medium flex items-start gap-1.5 ${syncFailed ? "text-amber-400" : "text-emerald-400"}`}>
                {syncFailed ? <TriangleAlert className="w-4 h-4 shrink-0 mt-px" /> : <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />}
                <span>{syncResult}</span>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={handleFirebaseSync}
          disabled={syncing}
          className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-medium text-sm flex items-center justify-center gap-2 transition-all shrink-0 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          <span>{syncing ? (ar ? "جارٍ المحاولة..." : "Trying...") : (ar ? "جرّب رفع نسخة" : "Try a cloud copy")}</span>
        </button>
      </div>

      <div className="connections-layout">
        <section className="connection-map surface">
          <ConnectionConstellation statuses={status} />
        </section>

        <section className="connection-list surface-strong">
          <SectionTitle
            title={ar ? "الموصلات" : "Connectors"}
            meta={ar
              ? `${connectors.filter(c => c.mode !== "live").length} محاكاة من ${connectors.length}`
              : `${connectors.filter(c => c.mode !== "live").length} simulated of ${connectors.length}`}
          />
          <div>
            {connectors.map((c, i) => {
              const Icon = icons[i % icons.length];
              return (
                <article key={c.id} className="connector-row">
                  <span className={`connector-icon status-${c.status}`}>
                    <Icon />
                  </span>
                  <div>
                    <strong>{c.name}</strong>
                    <small>
                      {c.type} · {c.lastSync}
                    </small>
                    {/* وسمُ المحاكاة لا يُخفى: من يشتري يعرف ما اشترى. */}
                    {c.mode !== "live" && (
                      <small className="connector-simulated">
                        {ar ? "محاكاة — لا يخرج منها طلب شبكة، والأرقام للعرض" : "Simulated — no network calls; figures are illustrative"}
                      </small>
                    )}
                  </div>
                  <span className={`health status-${c.status}`}>
                    {c.status === "healthy" ? <CheckCircle2 /> : <TriangleAlert />}
                  </span>
                  <button
                    disabled={testingId === c.id}
                    onClick={() => onTest(c.id)}
                    title={ar ? "فحص" : "Test"}
                  >
                    <RefreshCw className={testingId === c.id ? "spin" : ""} />
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
