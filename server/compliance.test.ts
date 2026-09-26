import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nahj-compliance-"));
process.env.NAHJ_DATABASE_PATH = path.join(directory, "test.sqlite");

const { PolicyEngine, applySectorCompliance, redactPatientData, checkConflict, RETAIL_CASH_LIMIT_KWD } = await import("./engine/policyEngine.ts");
const { signManual, verifyManual, renderManualHtml, toDigits, formatManualDate } = await import("./manual.ts");
const { buildCsp, nonceScripts } = await import("./securityHeaders.ts");
const { reviewPromotion } = await import("./engine/promotionReview.ts");
const { coverageReport, recordCoverageSnapshot } = await import("./engine/coverage.ts");

test("clinic: patient data is redacted and sending it out needs approval", () => {
  const { payload, redactedFields } = redactPatientData({ civilId: "290010112345", patientName: "فجر", visit: { diagnosis: "x" }, slot: "10:00" });
  assert.deepEqual(redactedFields.sort(), ["civilId", "patientName", "visit.diagnosis"].sort());
  assert.equal(payload.slot, "10:00");
  assert.equal(payload.civilId, "•••");
  const result = PolicyEngine.evaluateAction("sendLabResult", { patientName: "فجر", labResult: "HbA1c 6.1" }, "employee", "clinic");
  assert.equal(result.requiresApproval, true);
  assert.equal(result.reasonCode, "CMP-MED-REDACT");
  assert.equal(PolicyEngine.evaluateAction("checkAvailability", { patientName: "فجر" }, "employee", "clinic").reasonCode, "APPROVED_POLICY_STANDARD");
});

test("law: a conflicting opposing party blocks intake; missing parties need approval", () => {
  assert.deepEqual(checkConflict({ opposingParty: "مؤسسة البيان التجارية" }, ["مؤسسة البيان  التجارية"]).matches, ["مؤسسة البيان التجارية"]);
  const blocked = applySectorCompliance("law", "openMatter", { opposingParty: "شركة الريان" }, ["شركة الريان"]);
  assert.equal(blocked?.allowed, false);
  assert.equal(blocked?.reasonCode, "CMP-LAW-CONFLICT");
  assert.equal(applySectorCompliance("law", "openMatter", {}, [])?.reasonCode, "CMP-LAW-CONFLICT-UNCHECKED");
  assert.equal(applySectorCompliance("law", "openMatter", { opposingParty: "طرف جديد" }, ["شركة الريان"]), null);
});

test("retail: cash above the limit needs approval, card payments do not", () => {
  assert.equal(applySectorCompliance("retail", "refund", { paymentMethod: "cash", amount: RETAIL_CASH_LIMIT_KWD + 1 })?.reasonCode, "CMP-RET-CASH");
  assert.equal(applySectorCompliance("retail", "refund", { paymentMethod: "card", amount: 500 }), null);
  assert.equal(applySectorCompliance("retail", "refund", { cashAmount: RETAIL_CASH_LIMIT_KWD }), null);
});

const skill: any = {
  id: "sk_t", name: "استقبال مريض", nameEn: "Patient intake", activeVersion: 2, ownerName: "نورة", purpose: "غرض",
  steps: [{ id: "s1", order: 1, title: "تحقّق من الهوية", description: "وصف", system: "HIS", isAutomated: false }],
  decisions: [], exceptions: [], autonomyLevel: 1, reliabilityScore: 90, isSinglePointOfFailure: true,
  versions: [{ version: 2, createdAt: "2026-09-01", approvedBy: "نورة", changeSummary: "", steps: [], rules: ["قاعدة 1"], exceptions: [] }],
};

test("manual signature verifies, and fails once content changes", () => {
  const signed = signManual(skill, 2)!;
  assert.equal(verifyManual(skill, 2, signed.signature).valid, true);
  assert.equal(verifyManual(skill, 3, signed.signature).valid, false);
  skill.steps[0].title = "خطوة معدّلة";
  assert.equal(verifyManual(skill, 2, signed.signature).valid, false);
  skill.steps[0].title = "تحقّق من الهوية";
});

test("manual renders bilingual, Hijri and Arabic-Indic digits, and escapes HTML", () => {
  skill.steps[0].titleEn = "<b>Verify</b>";
  const html = renderManualHtml(skill, 2, { lang: "both", calendar: "hijri", digits: "arab" }, { organization: "عيادة", issuedBy: "نورة", now: new Date("2026-09-26T00:00:00Z") })!;
  assert.match(html, /&lt;b&gt;Verify&lt;\/b&gt;/);
  assert.match(html, /v٢/);
  assert.match(formatManualDate(new Date("2026-09-26T00:00:00Z"), { lang: "ar", calendar: "hijri", digits: "arab" }), /١٤٤٨/);
  assert.equal(toDigits("v12", "latn"), "v12");
});

test("CSP has no unsafe-inline script and tags inline scripts with the nonce", () => {
  const csp = buildCsp("abc");
  assert.match(csp, /script-src 'self' 'nonce-abc'/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
  assert.doesNotMatch(csp, /frame-ancestors/, "embedding in the applet host would break");
  assert.equal(nonceScripts('<script>a</script><script nonce="x">b</script>', "n"), '<script nonce="n">a</script><script nonce="x">b</script>');
});

test("promotion review requires practice for L2, shadow for L3, and signs off", () => {
  const cases: any[] = [{ id: "t", name: "", skillId: "sk_t", scenario: "", expectedAction: "", expectedStatus: "pass", resultStatus: "pass" }];
  const l2 = reviewPromotion(skill, 2, cases, [], { signedOff: true });
  assert.equal(l2.blocked, false);
  const l3 = reviewPromotion(skill, 3, cases, [], { signedOff: true });
  assert.equal(l3.blocked, true);
  assert.ok(l3.missing.some(m => m.includes("ظل")));
  assert.equal(reviewPromotion(skill, 0, [], []).blocked, false, "demotion blocked");
});

test("coverage snapshots are one per day", () => {
  const history: any[] = [];
  recordCoverageSnapshot(history, [skill], new Date("2026-09-25T10:00:00Z"));
  recordCoverageSnapshot(history, [skill], new Date("2026-09-25T18:00:00Z"));
  recordCoverageSnapshot(history, [skill], new Date("2026-09-26T10:00:00Z"));
  assert.equal(history.length, 2);
  assert.equal(coverageReport([skill]).singlePoints.length, 1);
});
