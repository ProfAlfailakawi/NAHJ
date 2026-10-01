import React, { useEffect, useState } from "react";
import { connectorTypeLabel, syncLabel } from "../../lib/labels";
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
import { DnaLive, DnaStatusHeader } from "../dna";
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
  /** في العرض: لا مرآة سحابية ولا اسم مشروعٍ حقيقي ولا رمز خطأ خام. */
  isDemo?: boolean;
};

const icons = [Database, CalendarDays, CircleDollarSign, FileCheck2, MessageCircleMore, PlugZap];

export function ConnectionsView({ lang, connectors, testingId, onTest, isDemo = false }: Props) {
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
      <DnaStatusHeader
        className="cloud-card dna-surface"
        icon={<Cloud />}
        tone={cloud?.connected ? "accent" : "slate"}
        title={<>
          {ar ? "المرآة السحابية (Firestore)" : "Cloud mirror (Firestore)"}
          <DnaLive on={Boolean(cloud?.connected)} className="cloud-live" label={cloud === null
            ? (ar ? "جارٍ قراءة الحالة" : "Reading state")
            : cloud.connected
              ? (ar ? "وصلةٌ قائمة" : "Link established")
              : (ar ? "غير موصولة" : "Not connected")} />
        </>}
        subtitle={isDemo
          ? (ar ? "في العرض التجريبي لا تُرفع أي نسخة إلى سحابة: كل ما تراه محفوظ في ذاكرة جلستك وحدها ويزول بزوالها." : "In the demo nothing is copied to any cloud: everything you see lives in your own session memory and disappears with it.")
          : ar
          ? "مصدر الحقيقة هو مخزن المحرّك المحلي؛ وهذه نسخةٌ اختيارية تُرفع إليها. وإن لم تُضبط بيانات المشروع أو رفضت قواعد الأمان الكتابة، لا تُكتب نسخة — ويُقال ذلك هنا بدل أن يُعرض وسمٌ أخضر."
          : "The local engine store is the source of truth; this is an optional copy. If the project is unconfigured or security rules reject the write, nothing is copied — and that is said here."}
        actions={
          isDemo ? undefined : <button onClick={handleFirebaseSync} disabled={syncing} className="dna-btn cloud-sync">
            <RefreshCw className={syncing ? "animate-spin" : ""} />
            <span>{syncing ? (ar ? "جارٍ المحاولة..." : "Trying...") : (ar ? "جرّب رفع نسخة" : "Try a cloud copy")}</span>
          </button>
        }
      >
        <div className="cloud-facts">
          <span><Server aria-hidden="true" />{ar ? "المشروع" : "Project"}: {isDemo ? (ar ? "صندوق العرض (معزول)" : "Demo sandbox (isolated)") : cloud?.projectId || (ar ? "غير مضبوط" : "unset")}</span>
          <span><RefreshCw aria-hidden="true" />{ar ? "آخر مزامنة ناجحة" : "Last successful sync"}: {!isDemo && cloud?.lastSyncTime ? new Date(cloud.lastSyncTime).toLocaleString(ar ? "ar-KW" : "en-GB") : (ar ? "لا شيء" : "none")}</span>
        </div>
        {!isDemo && cloud?.error && (
          <div className="cloud-note warn">
            <TriangleAlert aria-hidden="true" />
            <span className="break-all">{cloud.error}</span>
          </div>
        )}
        {syncResult && (
          /* اللون والأيقونة يتبعان النتيجة الحقيقية — لا أخضر دائماً مهما حدث. */
          <div className={`cloud-note ${syncFailed ? "warn" : "ok"}`}>
            {syncFailed ? <TriangleAlert aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
            <span>{syncResult}</span>
          </div>
        )}
      </DnaStatusHeader>

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
                      {connectorTypeLabel(c.type, ar)} · {syncLabel(c.lastSync, ar)}
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
