import type { Connector, KnowledgeSource, Organization, Policy, Skill } from "../../src/types/index.ts";
import {
  demoUsers, initialConnectors, initialKnowledgeSources, initialPolicies, initialSkills,
} from "../../src/data/seedData.ts";
import { EDUCATION_CODE, getSectorPack, listSectors } from "./index.ts";
import { expandPack, type PackChannel } from "./types.ts";

/*
 * بداية التشغيل الحقيقي لمؤسسة.
 *
 * كان النشر الجديد يُقلع على بذرة العرض: «أكاديمية المستقبل الدولية»، وموظفةٌ
 * اسمها «نورة خالد» تظهر في رأس الشاشة لمالك المنصة نفسه، وحالات عملٍ
 * وموافقةٌ وسجلّ تدقيقٍ وملاحظاتُ تعلّمٍ لم يقع منها شيء. فعيادةٌ تشتري نهج
 * تدخل أول مرة فترى مدرسةً وأرقاماً مُختلقة على أنها سجلّها.
 *
 * وما يُركَّب هنا هو ما يصحّ أن يكون لمؤسسةٍ في يومها الأول:
 *
 *   - **مهارات القطاع قوالب لا مهاراتٌ حيّة.** مسوّدةٌ عند L0 بلا استخدام ولا
 *     موثوقية: تُراجع وتُعلَّم وتُختبر وتُرقّى — فالاستقلالية تُكتسب هنا أيضاً،
 *     لا تُمنح لأن الحزمة قالت إنها كانت 91٪ في مؤسسةٍ أخرى.
 *   - **السياسات قوالب تنتظر اعتماد المؤسسة**، لا معتمَدةً باسم شخصٍ لا تعرفه.
 *   - **مصادر المعرفة بانتظار المراجعة.**
 *   - **لا موظفين مُختلَقين، ولا حالات، ولا موافقات، ولا ملاحظات تعلّم، ولا سجلّ**:
 *     كل ذلك يأتي من عمل المؤسسة نفسها.
 */

/** نشاطٌ ليس بين الحزم: يبدأ بلا قوالب، ويتعلّم نهج عمله من موظفيه مباشرة. */
export const GENERAL_CODE = "general";

export interface CleanStart {
  organization: Organization;
  skills: Skill[];
  policies: Policy[];
  knowledgeSources: KnowledgeSource[];
  connectors: Connector[];
  channel: PackChannel;
  sectorCode: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** الرموز المقبولة في إعداد المؤسسة: كل حزمة، والتعليم، و«نشاط آخر». */
export function setupSectorCodes(): string[] {
  return [...listSectors().map(sector => sector.code), GENERAL_CODE];
}

function templateSkill(skill: Skill): Skill {
  return {
    ...clone(skill),
    status: "draft",
    autonomyLevel: 0,
    reliabilityScore: 0,
    reliabilityTier: "low",
    usageCount: 0,
    successRate: 0,
    humanTakeoverRate: 0,
    avgDurationMinutes: 0,
    hoursSavedTotal: 0,
    isSinglePointOfFailure: false,
    killSwitchActive: false,
    /* مالكُ المهارة موظفٌ في المؤسسة يُعيَّن عند المراجعة — لا اسمٌ من مؤسسةٍ أخرى. */
    ownerName: "لم يُعيَّن بعد",
    activeVersion: 1,
    versions: [{
      version: 1,
      createdAt: today(),
      approvedBy: "قالب القطاع — بانتظار مراجعة المؤسسة",
      changeSummary: "قالبٌ أوّلي من حزمة القطاع. يُراجع ويُعدَّل ويُعلَّم قبل أي تشغيل.",
      steps: clone(skill.steps),
      rules: [],
      exceptions: clone(skill.exceptions || []),
    }],
  };
}

function templatePolicy(policy: Policy): Policy {
  return {
    ...clone(policy),
    version: 1,
    effectiveFrom: today(),
    approvedBy: "قالب القطاع — بانتظار اعتماد المؤسسة",
  };
}

function templateSource(source: KnowledgeSource): KnowledgeSource {
  return { ...clone(source), status: "review_required", referenceCount: 0, lastVerified: "لم يُتحقَّق بعد" };
}

function templateConnector(connector: Connector): Connector {
  return {
    ...clone(connector),
    /* لا اتصال قائم في اليوم الأول — وما لا يُربط يبقى محاكاةً معلنة. */
    status: "disconnected",
    lastSync: "لم يُربط بعد",
    stats: { callsToday: 0, successRate: 0, avgLatency: "—" },
  };
}

/*
 * أسماء الموظفين النموذجيين داخل نصوص القوالب («يتطلب موافقة نورة خالد»)
 * تُستبدل بإداراتهم: القاعدة تبقى صحيحة، والاسم الغريب يخرج.
 */
function scrubPeople<T>(value: T, people: Array<{ name: string; department: string }>): T {
  let text = JSON.stringify(value);
  for (const person of people) {
    if (!person.name) continue;
    text = text.split(person.name).join(person.department || "المسؤول المعتمد");
  }
  return JSON.parse(text) as T;
}

/** يستبدل اسم المؤسسة النموذجية في نصّ الترحيب باسم المؤسسة الحقيقية. */
function personalize(channel: PackChannel, sampleName: string, realName: string): PackChannel {
  const welcome = sampleName && channel.welcome.includes(sampleName)
    ? channel.welcome.split(sampleName).join(realName)
    : `أهلاً بك في ${realName}. كيف نقدر نساعدك اليوم؟`;
  return { ...clone(channel), welcome };
}

function organizationOf(name: string, nameEn: string, sector: { industry: string; tagline: string; logo: string }, code: string): Organization {
  return {
    id: `org_${code}`,
    name,
    nameEn: nameEn || name,
    industry: sector.industry,
    tagline: sector.tagline,
    logo: sector.logo,
    verifiedSkillsCount: 0,
    hoursSavedMonth: 0,
  };
}

export function buildCleanStart(code: string, name: string, nameEn = ""): CleanStart | undefined {
  const realName = name.trim();
  if (!realName) return undefined;

  if (code === GENERAL_CODE) {
    return {
      organization: organizationOf(realName, nameEn, { industry: "نشاط آخر", tagline: "العقل التشغيلي لمؤسستك", logo: "🏢" }, code),
      skills: [],
      policies: [],
      knowledgeSources: [],
      connectors: [],
      channel: {
        counterpart: "عميل",
        welcome: `أهلاً بك في ${realName}. كيف نقدر نساعدك اليوم؟`,
        samplePrompts: ["أبي أستفسر عن خدماتكم", "كيف أتواصل مع الموظف المختص؟"],
      },
      sectorCode: code,
    };
  }

  if (code === EDUCATION_CODE) {
    return scrubPeople({
      organization: organizationOf(realName, nameEn, { industry: "التعليم", tagline: "العقل التشغيلي للتسجيل والقبول وشؤون الطلبة", logo: "🏫" }, code),
      skills: initialSkills.map(templateSkill),
      policies: initialPolicies.map(templatePolicy),
      knowledgeSources: initialKnowledgeSources.map(templateSource),
      connectors: initialConnectors.map(templateConnector),
      channel: {
        counterpart: "ولي أمر",
        welcome: `أهلاً بك في ${realName}! يسعدنا تواصلكم واستقبال استفساركم.`,
        samplePrompts: ["أبي أسجل بنتي في الصف الأول", "كم الرسوم الدراسية؟", "متى يبدأ التسجيل؟"],
      },
      sectorCode: code,
    }, demoUsers);
  }

  const pack = getSectorPack(code);
  if (!pack) return undefined;
  const expanded = expandPack(pack);
  return scrubPeople({
    organization: organizationOf(realName, nameEn, pack.organization, code),
    skills: expanded.skills.map(templateSkill),
    policies: expanded.policies.map(templatePolicy),
    knowledgeSources: expanded.knowledgeSources.map(templateSource),
    connectors: expanded.connectors.map(templateConnector),
    channel: personalize(expanded.channel, pack.organization.name, realName),
    sectorCode: code,
  }, pack.people);
}
