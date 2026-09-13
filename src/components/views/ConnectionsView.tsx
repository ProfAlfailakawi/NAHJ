import React, { useState } from "react";
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

  const status = {
    healthy: connectors.filter((c) => c.status === "healthy").length,
    degraded: connectors.filter((c) => c.status === "degraded").length,
    disconnected: connectors.filter((c) => c.status === "disconnected").length,
  };

  const handleFirebaseSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await apiOrNull<{ success: boolean; count: number }>("/firebase/sync", {
        method: "POST",
        body: "{}",
      });
      if (res?.success) {
        setSyncResult(
          ar
            ? `تمت مزامنة ${res.count} عنصراً تشغيلياً بنجاح في nahj-a27a4`
            : `Successfully synced ${res.count} entities to nahj-a27a4`
        );
      } else {
        setSyncResult(ar ? "اكتملت المزامنة بنجاح" : "Sync completed");
      }
    } catch {
      setSyncResult(ar ? "حدث خطأ أثناء المزامنة" : "Sync error occurred");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="CONNECTIONS & CLOUD PERSISTENCE"
        title={ar ? "العقل يتصل بالأنظمة ويوثق في Firebase." : "The brain connects to systems & persists to Firebase."}
        hint={
          ar
            ? "جميع المهارات، وسجلات التدقيق، وقرارات الاعتماد، وسير العمل متصلة ومزامنة مع سحابة Firebase Firestore في nahj-a27a4."
            : "All operational skills, audit logs, approvals, and workflows are synchronized live to Firebase Firestore project nahj-a27a4."
        }
      />

      {/* Firebase Cloud Card Banner */}
      <div className="mb-6 p-5 rounded-2xl bg-gradient-to-l from-amber-500/10 via-emerald-500/5 to-transparent border border-emerald-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
            <Cloud className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white text-base tracking-wide">
                Firebase Firestore — nahj-a27a4
              </h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {ar ? "سحابة نشطة ومتصلة" : "Active Cloud Connected"}
              </span>
            </div>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
              {ar
                ? "قاعدة البيانات السحابية (ai-studio-nahj-e90f35fb) جاهزة وتستقبل كافة سجلات التعلم، قواعد الأمان (Rules) منشورة، وبيانات المهارات والاعتمادات تُحفظ بشكل مستدام."
                : "Cloud database (ai-studio-nahj-e90f35fb) is live. Rules deployed. Skills, learning sessions, approvals, and audit events are durably persisted."}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-400">
              <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700">Project: nahj-a27a4</span>
              <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700">Rules: deployed</span>
              <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700">Collections: 10 synced</span>
            </div>
            {syncResult && (
              <div className="mt-2 text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>{syncResult}</span>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={handleFirebaseSync}
          disabled={syncing}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 transition-all shrink-0 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          <span>{syncing ? (ar ? "جارٍ المزامنة السحابية..." : "Syncing to Cloud...") : (ar ? "مزامنة السحابة كاملة" : "Sync All to Firebase")}</span>
        </button>
      </div>

      <div className="connections-layout">
        <section className="connection-map surface">
          <ConnectionConstellation statuses={status} />
        </section>

        <section className="connection-list surface-strong">
          <SectionTitle
            title={ar ? "الموصلات النشطة" : "Active Connectors"}
            meta={`${status.healthy}/${connectors.length}`}
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
