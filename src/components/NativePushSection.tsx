import React, { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { api } from "../lib/api";
import {
  isNativePushAvailable, nativePushSubscriptionId, readNativePushPermission, registerNativePushToken, requestNativePushPermission,
} from "../lib/nativePush";

/*
 * «فعّل التنبيهات» — داخل تطبيق iOS وحده.
 *
 * لمسةٌ واحدة تطلب إذن النظام (نافذة iOS نفسها)، ثم تسجّل الجهاز وتحفظ توكنه
 * عند الخادم، فتصل طلبات الاعتماد وإشعارات الاشتراك إلى هذا الجهاز. وفي المتصفح
 * لا يُرسم شيء: لا Web Push هنا.
 */

type Phase = "loading" | "off" | "on" | "blocked" | "busy";

export function NativePushSection({ lang }: { lang: "ar" | "en" }) {
  const ar = lang === "ar";
  const available = isNativePushAvailable();
  const [phase, setPhase] = useState<Phase>("loading");
  const [token, setToken] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!available) return;
    let alive = true;
    (async () => {
      const permission = await readNativePushPermission();
      if (!alive) return;
      if (permission === "denied") { setPhase("blocked"); return; }
      if (permission !== "granted") { setPhase("off"); return; }
      const current = await registerNativePushToken();
      const status = await api<{ ids: string[] }>("/push/status").catch(() => ({ ids: [] as string[] }));
      if (!alive) return;
      const id = current ? await nativePushSubscriptionId(current) : "";
      setToken(current);
      setPhase(id && status.ids.includes(id) ? "on" : "off");
    })();
    return () => { alive = false; };
  }, [available]);

  if (!available) return null;

  const enable = async () => {
    setPhase("busy");
    setNote("");
    const permission = await requestNativePushPermission();
    if (permission === "denied") { setPhase("blocked"); return; }
    if (permission !== "granted") { setPhase("off"); return; }
    const fresh = await registerNativePushToken();
    if (!fresh) { setPhase("off"); setNote(ar ? "تعذّر تسجيل الجهاز، حاول مرة أخرى." : "Could not register this device."); return; }
    try {
      await api("/push/subscribe-native", { method: "POST", body: JSON.stringify({ token: fresh }) });
      setToken(fresh);
      setPhase("on");
    } catch {
      setPhase("off");
      setNote(ar ? "تعذّر الحفظ، حاول مرة أخرى." : "Could not save, try again.");
    }
  };

  const disable = async () => {
    setPhase("busy");
    try {
      if (token) await api("/push/unsubscribe-native", { method: "POST", body: JSON.stringify({ token }) });
      setPhase("off");
    } catch {
      setPhase("on");
    }
  };

  const on = phase === "on";
  return (
    <section className="surface-strong native-push" aria-labelledby="native-push-title">
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <BellRing aria-hidden="true" />
          <div style={{ minWidth: 0 }}>
            <h3 id="native-push-title" style={{ margin: 0 }}>{ar ? "فعّل التنبيهات" : "Turn on notifications"}</h3>
            <small>
              {phase === "blocked"
                ? (ar ? "التنبيهات موقوفة لهذا التطبيق. فعّلها من الإعدادات ثم الإشعارات ثم نهج." : "Notifications are off. Enable them in Settings › Notifications › NAHJ.")
                : (ar ? "تصلك طلبات الاعتماد وإشعارات الاشتراك على هذا الجهاز." : "Approval requests and subscription notices reach this device.")}
            </small>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="native-push-title"
          disabled={phase === "loading" || phase === "busy" || phase === "blocked"}
          onClick={() => void (on ? disable() : enable())}
          style={{ minWidth: 64, minHeight: 44 }}
        >
          {on ? (ar ? "مفعّلة" : "On") : (ar ? "فعّل" : "Enable")}
        </button>
      </div>
      {note && <p role="status" style={{ margin: "8px 0 0" }}>{note}</p>}
    </section>
  );
}
