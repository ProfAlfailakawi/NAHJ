/*
 * تشخيص ركن الودجت (iPhone Duo) — يُحمَّل فقط حين يحمل العنوان ?duo-debug=1.
 * يرسم إطار المنطقة المحجوزة (حدود حمراء شفافة، لا يلتقط اللمس) ولوحةً صغيرة أسفل اليسار (خارج المنطقة)
 * بقيم الحواف الآمنة وأبعاد النافذة والاتجاه ووضع التثبيت وهل المنطقة مفعّلة وقيم المتغيرات.
 * لا شبكة ولا تخزين: يقرأ الصفحة فقط.
 */
(function () {
  "use strict";
  if (window.__duoDebug) return;
  window.__duoDebug = true;
  var doc = document, root = doc.documentElement;

  function px(el, prop) { return parseFloat(getComputedStyle(el)[prop]) || 0; }
  /* معايرة حيّة على الجهاز: ?duo-debug=1&duo-w=110&duo-h=270 (لا تعمل بلا duo-debug=1). */
  var qs = new URLSearchParams(location.search);
  var ow = parseFloat(qs.get("duo-w")), oh = parseFloat(qs.get("duo-h"));
  if (ow > 0) root.style.setProperty("--duo-widget-w", ow + "px");
  if (oh > 0) root.style.setProperty("--duo-widget-h", oh + "px");
  if (ow > 0 || oh > 0) { root.style.setProperty("--duo-widget-gap", "8px"); }

  var probe = doc.createElement("div");
  probe.setAttribute("data-duo-debug", "");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;left:0;top:0;width:var(--duo-widget-w,0px);height:var(--duo-widget-h,0px);" +
    "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);box-sizing:content-box";

  var frame = doc.createElement("div");
  frame.setAttribute("data-duo-debug", ""); frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;top:0;right:0;box-sizing:border-box;pointer-events:none;z-index:2147483647;" +
    "width:var(--duo-widget-w,0px);height:var(--duo-widget-h,0px);border:2px solid rgba(220,30,30,.9);background:rgba(220,30,30,.12)";

  var panel = doc.createElement("pre");
  panel.setAttribute("data-duo-debug", "");
  panel.style.cssText = "position:fixed;left:8px;bottom:8px;margin:0;max-width:calc(100vw - 16px - var(--duo-widget-clear,0px));padding:8px 10px;box-sizing:border-box;" +
    "direction:ltr;text-align:left;white-space:pre-wrap;font:11px/1.45 ui-monospace,Menlo,monospace;color:#fff;background:rgba(16,37,31,.88);" +
    "border-radius:10px;pointer-events:none;z-index:2147483647";

  function standalone() {
    var mq = false;
    try { mq = matchMedia("(display-mode: standalone)").matches; } catch (e) { /* قديم */ }
    return "navigator.standalone=" + String(navigator.standalone) + " display-mode:standalone=" + mq;
  }
  function native() {
    try { var c = window.Capacitor; return String(!!(c && c.isNativePlatform && c.isNativePlatform())) + (c && c.getPlatform ? " (" + c.getPlatform() + ")" : ""); }
    catch (e) { return "false"; }
  }
  function render() {
    var cs = getComputedStyle(root);
    var vv = window.visualViewport;
    var cw = px(probe, "width"), ch = px(probe, "height");
    var active = cw > 0 && ch > 0;
    var sT = px(probe, "paddingTop"), sR = px(probe, "paddingRight"), sB = px(probe, "paddingBottom"), sL = px(probe, "paddingLeft");
    var orient = innerWidth > innerHeight ? "landscape" : "portrait";
    panel.textContent =
      "duo-widget " + (active ? "ACTIVE" : "off") + "  " + orient + "\n" +
      "zone: x>=" + Math.round(innerWidth - cw) + " (w=" + Math.round(cw) + ")  y<=" + Math.round(ch) + " (h)\n" +
      "--duo-widget-w=" + cs.getPropertyValue("--duo-widget-w").trim() + "  gap=" + cs.getPropertyValue("--duo-widget-gap").trim() + "\n" +
      "--duo-widget-h=" + cs.getPropertyValue("--duo-widget-h").trim() + "  clear=" + Math.round(cw + (parseFloat(cs.getPropertyValue("--duo-widget-gap")) || 0)) + "px\n" +
      "safe-area t/r/b/l = " + sT + "/" + sR + "/" + sB + "/" + sL + "\n" +
      "inner " + innerWidth + "x" + innerHeight + "  client " + root.clientWidth + "x" + root.clientHeight + "\n" +
      "visualViewport " + (vv ? Math.round(vv.width) + "x" + Math.round(vv.height) + " scale=" + vv.scale.toFixed(2) + " off=" + Math.round(vv.offsetLeft) + "," + Math.round(vv.offsetTop) : "n/a") + "\n" +
      "dir=" + (doc.dir || root.getAttribute("dir") || getComputedStyle(doc.body).direction) + "  dpr=" + devicePixelRatio + "\n" +
      "standalone: " + standalone() + "\n" +
      "override duo-w=" + (ow > 0 ? ow : "-") + " duo-h=" + (oh > 0 ? oh : "-") + "\n" +
      "send screenshot with frame; adjust duo-w/duo-h until the red frame covers the capsule\n" +
      "Capacitor: " + native() + "  WKWebView-UA: " + (/Mobile\/\w+/.test(navigator.userAgent) && !/Safari\//.test(navigator.userAgent) ? "yes (no Safari/ token)" : "no (Safari-like)") + "\n" +
      "UA: " + navigator.userAgent.replace(/^Mozilla\/5.0 /, "").slice(0, 90);
  }
  function mount() {
    if (!doc.body) return void doc.addEventListener("DOMContentLoaded", mount);
    doc.body.appendChild(probe); doc.body.appendChild(frame); doc.body.appendChild(panel);
    render();
    addEventListener("resize", render); addEventListener("orientationchange", render);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", render);
    setInterval(render, 1500);
  }
  mount();
})();
