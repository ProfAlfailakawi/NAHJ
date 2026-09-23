import assert from "node:assert/strict";
import test from "node:test";

/*
 * حراسة على حزم الأنشطة.
 *
 * أهمّ ما هنا ليس اكتمال الحقول — بل ثابتٌ منتجيّ: لا تُشحن حزمةٌ فيها مهارةٌ
 * حرجة عند مستوى استقلالية عالٍ. الحزمة تُقرأ على أنها توصيةُ المُصنِّع، ومن
 * يركّبها يثق بها ولا يراجع كل مهارة. فحزمةٌ تضع «تسليم نتيجة فحص» على الطيار
 * الآلي تكون قد أفسدت الحوكمة التي يبيعها المنتج، من مصدرها.
 */

import { buildSector, listSectors, getSectorPack, SECTOR_PACKS, EDUCATION_CODE } from "./packs/index.ts";
import { expandPack } from "./packs/types.ts";

/* ----------------------------------------------------------- السجلّ */

test("كل حزمة لها رمز فريد، والتعليم مُعلَّمة أنها المبذورة", () => {
  const sectors = listSectors();
  const codes = sectors.map(sector => sector.code);
  assert.equal(new Set(codes).size, codes.length, "رمز مكرّر بين الحزم");
  assert.ok(codes.includes(EDUCATION_CODE));

  const education = sectors.find(sector => sector.code === EDUCATION_CODE)!;
  assert.equal(education.isSeeded, true, "التعليم هي البذرة لا حزمة تُركَّب");
  for (const sector of sectors.filter(s => s.code !== EDUCATION_CODE)) {
    assert.equal(sector.isSeeded, false);
  }
});

test("قطاع غير معروف لا يُبنى", () => {
  assert.equal(buildSector("nope"), undefined);
  assert.equal(getSectorPack("nope"), undefined);
  // والتعليم ليست حزمةً تُبنى — هي البذرة.
  assert.equal(buildSector(EDUCATION_CODE), undefined);
});

/* ------------------------------------------------- الثابت المنتجيّ */

test("لا مهارة حرجة على استقلالية عالية في أي حزمة", () => {
  for (const pack of SECTOR_PACKS) {
    for (const skill of pack.skills) {
      if (skill.riskLevel === "critical") {
        assert.ok(
          skill.autonomyLevel <= 4,
          `${pack.code}/${skill.slug}: مهارة حرجة عند L${skill.autonomyLevel} — الحزمة توصيةُ المُصنِّع، ومن يركّبها يثق بها.`,
        );
      }
      if (skill.riskLevel === "high") {
        assert.ok(skill.autonomyLevel <= 5, `${pack.code}/${skill.slug}: مهارة عالية الخطورة عند L${skill.autonomyLevel}`);
      }
    }
  }
});

test("كل مهارة حرجة تحمل قراراً يصف ما يوقفها", () => {
  for (const pack of SECTOR_PACKS) {
    for (const skill of pack.skills.filter(item => item.riskLevel === "critical")) {
      assert.ok(
        (skill.decisions || []).length > 0,
        `${pack.code}/${skill.slug}: مهارة حرجة بلا قرارات معلنة — فما الذي يوقفها؟`,
      );
    }
  }
});

test("كل حزمة تحمل سياسة حرجة واحدة على الأقل", () => {
  for (const pack of SECTOR_PACKS) {
    assert.ok(
      pack.policies.some(policy => policy.riskLevel === "critical"),
      `${pack.code}: حزمة بلا سياسة حرجة — كل قطاع فيه ما لا يُترك للاحتمال`,
    );
    for (const policy of pack.policies) {
      assert.ok(policy.rules.length > 0, `${pack.code}/${policy.code}: سياسة بلا قواعد`);
      for (const rule of policy.rules) {
        assert.ok(rule.explanation.length > 15, `${pack.code}/${policy.code}: قاعدة بلا تفسير يُقرأ`);
      }
    }
  }
});

/* --------------------------------------------------------- التوسيع */

test("التوسيع يُنتج كيانات كاملة الأنواع لكل حزمة", () => {
  for (const pack of SECTOR_PACKS) {
    const built = expandPack(pack);

    assert.equal(built.organization.id, `org_${pack.code}`);
    assert.ok(built.organization.name.length > 2);
    assert.equal(built.skills.length, pack.skills.length);
    assert.equal(built.policies.length, pack.policies.length);
    assert.equal(built.connectors.length, pack.connectors.length);
    assert.ok(built.users.length >= 2, `${pack.code}: حزمة بلا أشخاص`);

    const ids = built.skills.map(skill => skill.id);
    assert.equal(new Set(ids).size, ids.length, `${pack.code}: معرّف مهارة مكرّر`);

    for (const skill of built.skills) {
      assert.ok(skill.steps.length > 0, `${pack.code}/${skill.slug}: مهارة بلا خطوات`);
      assert.equal(skill.activeVersion, 1);
      assert.equal(skill.versions.length, 1);
      assert.ok(skill.allowedActions.length > 0, `${pack.code}/${skill.slug}: مهارة بلا إجراءات مسموحة`);
      // ترتيب الخطوات متسلسل من واحد — تعتمد عليه الواجهة في الرسم.
      skill.steps.forEach((step, index) => assert.equal(step.order, index + 1));
    }
  }
});

test("طبقة الموثوقية تُشتق من الدرجة لا تُكتب", () => {
  const built = expandPack({
    ...SECTOR_PACKS[0],
    skills: [
      { ...SECTOR_PACKS[0].skills[0], slug: "a", reliabilityScore: 97 },
      { ...SECTOR_PACKS[0].skills[0], slug: "b", reliabilityScore: 88 },
      { ...SECTOR_PACKS[0].skills[0], slug: "c", reliabilityScore: 72 },
      { ...SECTOR_PACKS[0].skills[0], slug: "d", reliabilityScore: 30 },
    ],
  });
  assert.deepEqual(built.skills.map(skill => skill.reliabilityTier), ["verified", "high", "medium", "low"]);
});

test("الحزمة النظيفة تبدأ بأرقام تشغيل صفرية لا موروثة", () => {
  const built = expandPack({
    ...SECTOR_PACKS[0],
    skills: [{ ...SECTOR_PACKS[0].skills[0], slug: "fresh", usageCount: undefined, hoursSavedTotal: undefined, reliabilityScore: undefined }],
  });
  assert.equal(built.skills[0].usageCount, 0);
  assert.equal(built.skills[0].hoursSavedTotal, 0);
  assert.equal(built.skills[0].reliabilityScore, 0);
  assert.equal(built.skills[0].reliabilityTier, "low", "مهارة بلا سجلّ ليست موثوقة");
});

test("المؤسسة تُشتق عدادَيها من مهاراتها لا من رقم مكتوب", () => {
  for (const pack of SECTOR_PACKS) {
    const built = expandPack(pack);
    const active = built.skills.filter(skill => skill.status === "active").length;
    const hours = built.skills.reduce((sum, skill) => sum + skill.hoursSavedTotal, 0);
    assert.equal(built.organization.verifiedSkillsCount, active, `${pack.code}: عدّاد المهارات المعتمدة لا يطابق`);
    assert.equal(built.organization.hoursSavedMonth, hours, `${pack.code}: مجموع الساعات لا يطابق`);
  }
});

/* --------------------------------------------------------- القناة */

test("كل حزمة تعرّف من يحادث المؤسسة وبأي لغة", () => {
  for (const pack of SECTOR_PACKS) {
    assert.ok(pack.channel.counterpart.length > 2, `${pack.code}: قناة بلا طرف مقابل`);
    /*
     * الغرض رصد النسخ بين الحزم، لا فرض الاسم حرفياً: «مكتب الميزان للمحاماة
     * والاستشارات» يُرحَّب به مختصراً كما يفعل أهله. فيكفي أن يشترك الترحيب مع
     * اسم المؤسسة في كلمة دالّة واحدة — وهو ما لا ينجو من نسخِ حزمةٍ عن أخرى،
     * إذ لا يشترك ترحيبُ عيادةٍ مع اسم مكتب محاماة في شيء.
     */
    const words = pack.organization.name.split(/\s+/).filter(word => word.length >= 4);
    assert.ok(words.some(word => pack.channel.welcome.includes(word)),
      `${pack.code}: ترحيب لا يشترك مع «${pack.organization.name}» في كلمة — نصٌّ منسوخ من حزمة أخرى`);
    assert.ok(pack.channel.samplePrompts.length >= 3, `${pack.code}: أمثلة غير كافية لتجربة القناة`);
  }
});

test("لا نصّ تعليمي تسرّب إلى حزمة غير تعليمية", () => {
  /* نسخُ حزمةٍ عن أخرى يترك «ولي أمر» و«الصف الأول» في عيادة. */
  const educationWords = ["ولي أمر", "الصف الأول", "العام الدراسي", "الرسوم الدراسية", "طالب جديد"];
  for (const pack of SECTOR_PACKS) {
    const text = JSON.stringify(pack);
    for (const word of educationWords) {
      assert.ok(!text.includes(word), `${pack.code}: تسرّب نصّ تعليمي «${word}»`);
    }
  }
});

/* -------------------------------------------------- التركيب في المخزن */

test("تركيب حزمة يستبدل العقل ويُبقي سجلّ التدقيق", async () => {
  const { Store } = await import("./db.ts");
  const store = new Store();

  const before = store.auditEvents.length;
  const educationSkills = store.skills.map(skill => skill.name);
  const orgName = store.organization.name;
  assert.ok(educationSkills.length > 0);

  const result = store.applySector("clinic", "tester@nahj.test");
  assert.equal(result.ok, true);

  assert.equal(store.sectorCode, "clinic");
  /* مؤسسةٌ حقيقية تبدّل نشاطها وتبقى هي — لا تصير «مركز الشفاء» النموذجي. */
  assert.equal(store.organization.name, orgName);
  assert.doesNotMatch(store.organization.name, /الشفاء/);
  assert.notDeepEqual(store.skills.map(skill => skill.name), educationSkills, "المهارات لم تُستبدل");

  /* ما لا معنى له بعد التبديل يُمحى. */
  assert.deepEqual(store.workItems, []);
  assert.deepEqual(store.approvalRequests, []);
  assert.deepEqual(store.testCases, []);
  assert.deepEqual(store.shadowComparisons, []);

  /* والأثر يبقى: ملكُ المؤسسة لا ملكُ الحزمة. */
  assert.ok(store.auditEvents.length > before, "التبديل نفسه لم يُسجَّل");
  assert.equal(store.auditEvents[0].action, "APPLY_SECTOR_PACK");

  /* والقناة تتكلّم بلسان القطاع الجديد، وباسم المؤسسة نفسها. */
  assert.ok(store.simulatorState.messages[0].text.includes(orgName));
  assert.doesNotMatch(store.simulatorState.messages[0].text, /الشفاء/);
});

test("تركيب قطاع غير معروف يفشل بلا أثر", async () => {
  const { Store } = await import("./db.ts");
  const store = new Store();
  const before = { name: store.organization.name, skills: store.skills.length, audit: store.auditEvents.length };

  const result = store.applySector("atlantis", "tester@nahj.test");
  assert.equal(result.ok, false);
  assert.match(String(result.reason), /غير معروف/);

  assert.equal(store.organization.name, before.name, "فشلٌ غيّر المؤسسة");
  assert.equal(store.skills.length, before.skills, "فشلٌ مسّ المهارات");
  assert.equal(store.auditEvents.length, before.audit, "فشلٌ كتب في السجلّ");
});

test("القناة لا تعيد كل قطاع إلى سير التسجيل المدرسي", async () => {
  /*
   * تبديل الحزمة كان يغيّر نصّ الترحيب وحده، بينما سير المحادثة في المسارات
   * تعليميٌّ مكتوب حرفياً: عمر الطفل، والصفّ، والبطاقة المدنية. فأول ردّ في
   * محادثة مريضٍ أو موكّل كان يعود بها إلى تسجيل طالب — أي أن الحزمة تبدّل كل
   * شيء إلا اللسان الذي تُحادَث به، وهو أظهر ما يراه من يُعرض عليه المنتج.
   */
  const fs = await import("node:fs");
  const routes = fs.readFileSync("server/routes.ts", "utf8");
  const handler = /apiRouter\.post\("\/simulator\/message"[\s\S]*?\n\}\);/.exec(routes)?.[0] || "";
  assert.ok(handler, "تعذّر العثور على مسار المحادثة");

  /* السير التعليمي محجوزٌ خلف حارس القطاع. */
  assert.match(handler, /db\.sectorCode !== EDUCATION_CODE/, "السير التعليمي يعمل لكل القطاعات");
  assert.ok(
    handler.indexOf("EDUCATION_CODE") < handler.indexOf('=== "initial"'),
    "الحارس بعد بداية السير التعليمي — أي أنه لا يحجبه",
  );
  /* ولا اسم مؤسسةٍ مكتوبٌ حرفياً في ردود القناة. */
  assert.doesNotMatch(handler, /text: "[^"]*أكاديمية المستقبل/, "اسم مؤسسة تعليمية مكتوب في ردّ القناة");
});

test("تبديل القطاع يبدّل لسان القناة لا ترحيبها وحده", async () => {
  const { Store } = await import("./db.ts");
  const store = new Store();
  const orgName = store.organization.name;
  store.applySector("clinic", "tester@nahj.test");

  assert.equal(store.sectorCode, "clinic");
  assert.match(store.channel.counterpart, /مريض/, "الطرف المقابل ما زال تعليمياً");
  assert.ok(store.simulatorState.messages[0].text.includes(orgName), "الترحيب لا يحمل اسم المؤسسة");
  /* وأمثلة البدء تخصّ القطاع الجديد. */
  assert.ok(store.channel.samplePrompts.some(prompt => /موعد|تأمين|ألم/.test(prompt)),
    "أمثلة القناة لا تخصّ العيادة");
});
