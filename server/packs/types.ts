import type {
  Connector, KnowledgeSource, LearningProposal, Organization, Policy, Skill, User,
} from "../../src/types/index.ts";

/*
 * حزم الأنشطة.
 *
 * كان نهج عاماً في قلبه وتعليمياً في كل بيانة فيه: «أكاديمية المستقبل»، ومهارات
 * تسجيل الطلاب، وسياسة رسوم دراسية، ومحاكي ولي أمر. فمن يُعرض عليه النظام من
 * عيادة أو مكتب محاماة يرى منتجاً لقطاعٍ آخر ويُطالَب بأن يتخيّل.
 *
 * والحزمة هنا ليست «ثيماً» ولا تبديل أسماء: هي عقل تشغيلي كامل لقطاع — مهاراته
 * وسياساته وأنظمته ومصادر معرفته والشخصية التي تحادثه من الخارج. لأن ما يختلف
 * بين مدرسة وعيادة ليس الألوان، بل ما يُعَدّ قراراً حسّاساً ومن يعتمده.
 *
 * والصيغة مضغوطة عمداً: كل حزمة تُكتب بما يميّزها، وتُوسَّع هذه الوحدة الباقي إلى
 * كيانات كاملة الأنواع. بدون ذلك تصير كل حزمة أربعمئة سطر، فلا تُكتب حزمة ثانية.
 */

/** تعريف مهارة مضغوط — يُوسَّع إلى `Skill` كامل. */
export interface PackSkill {
  slug: string;
  name: string;
  nameEn: string;
  category: string;
  department: string;
  purpose: string;
  /** الخطوات بأسمائها فقط؛ النظام المستعمل والأتمتة يُستنتجان أو يُذكران. */
  steps: Array<{ title: string; description: string; system: string; automated?: boolean; decisionRule?: string }>;
  decisions?: Array<{ condition: string; outcome: string; risk: Skill["riskLevel"] }>;
  exceptions?: Array<{ scenario: string; protocol: string }>;
  allowedActions: string[];
  riskLevel: Skill["riskLevel"];
  autonomyLevel: Skill["autonomyLevel"];
  status: Skill["status"];
  ownerName: string;
  singlePointOfFailure?: boolean;
  /* أرقام التشغيل. تُترك صفراً لحزمة تبدأ نظيفة، وتُملأ لحزمة عرض. */
  usageCount?: number;
  successRate?: number;
  humanTakeoverRate?: number;
  avgDurationMinutes?: number;
  hoursSavedTotal?: number;
  reliabilityScore?: number;
}

export interface PackPolicy {
  code: string;
  title: string;
  titleEn: string;
  riskLevel: Policy["riskLevel"];
  summary: string;
  approvedBy: string;
  rules: Array<{ condition: string; action: string; explanation: string }>;
}

export interface PackConnector {
  name: string;
  type: Connector["type"];
  permissions: string[];
  status?: Connector["status"];
}

export interface PackSource {
  title: string;
  type: KnowledgeSource["type"];
  authorityLevel: KnowledgeSource["authorityLevel"];
  owner: string;
  summary: string;
}

export interface PackPerson {
  name: string;
  role: User["role"];
  department: string;
}

export interface PackProposal {
  type: LearningProposal["type"];
  title: string;
  titleEn: string;
  summary: string;
  confidence: number;
  observedCasesCount: number;
  evidence?: LearningProposal["evidence"];
  clarifications?: Array<{ question: string; options: string[] }>;
}

/** الشخصية التي تحادث المؤسسة من الخارج — تختلف جذرياً بين القطاعات. */
export interface PackChannel {
  /** من يتحدث: ولي أمر، مريض، موكّل، عميل… */
  counterpart: string;
  welcome: string;
  /** أمثلة يبدأ بها من يجرّب القناة. */
  samplePrompts: string[];
}

export interface SectorPack {
  code: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  organization: { name: string; nameEn: string; industry: string; tagline: string; logo: string };
  people: PackPerson[];
  sources: PackSource[];
  policies: PackPolicy[];
  skills: PackSkill[];
  connectors: PackConnector[];
  proposals: PackProposal[];
  channel: PackChannel;
}

/* --------------------------------------------------------- التوسيع */

export interface ExpandedPack {
  organization: Organization;
  users: User[];
  knowledgeSources: KnowledgeSource[];
  policies: Policy[];
  skills: Skill[];
  connectors: Connector[];
  learningProposals: LearningProposal[];
  channel: PackChannel;
}

const slugId = (prefix: string, value: string, index: number) =>
  `${prefix}_${value.replace(/[^a-z0-9]+/gi, "_").toLowerCase().slice(0, 28) || index}`;

const today = () => new Date().toISOString().slice(0, 10);

/* تاريخٌ نسبيّ لا ثابت: حزمةٌ مؤرَّخة بالثابت تبدو منتهية الصلاحية بعد أشهر. */
const monthsAgo = (months: number) => {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
};

const tierFor = (score: number): Skill["reliabilityTier"] =>
  score >= 95 ? "verified" : score >= 85 ? "high" : score >= 70 ? "medium" : "low";

/**
 * يوسّع حزمة مضغوطة إلى كيانات كاملة الأنواع.
 *
 * التوسيع مركزيّ عمداً: قاعدة اشتقاق واحدة (المعرّفات، الإصدارات، الطبقات،
 * التواريخ) تُطبَّق على كل القطاعات، فلا تنحرف حزمةٌ عن أخرى في شكل بياناتها
 * ثم تنكسر شاشةٌ على قطاعٍ دون غيره.
 */
export function expandPack(pack: SectorPack): ExpandedPack {
  const users: User[] = pack.people.map((person, index) => ({
    id: slugId("usr", person.name, index),
    name: person.name,
    email: `user${index + 1}@${pack.code}.local`,
    role: person.role,
    department: person.department,
    avatar: person.name.slice(0, 1),
  }));

  const skills: Skill[] = pack.skills.map((definition, index) => {
    const reliability = definition.reliabilityScore ?? 0;
    return {
      id: slugId("skill", definition.slug, index),
      slug: definition.slug,
      name: definition.name,
      nameEn: definition.nameEn,
      category: definition.category,
      purpose: definition.purpose,
      department: definition.department,
      autonomyLevel: definition.autonomyLevel,
      status: definition.status,
      reliabilityScore: reliability,
      reliabilityTier: tierFor(reliability),
      riskLevel: definition.riskLevel,
      activeVersion: 1,
      ownerName: definition.ownerName,
      isSinglePointOfFailure: Boolean(definition.singlePointOfFailure),
      usageCount: definition.usageCount ?? 0,
      successRate: definition.successRate ?? 0,
      humanTakeoverRate: definition.humanTakeoverRate ?? 0,
      avgDurationMinutes: definition.avgDurationMinutes ?? 0,
      hoursSavedTotal: definition.hoursSavedTotal ?? 0,
      steps: definition.steps.map((step, order) => ({
        id: `step_${index}_${order}`,
        order: order + 1,
        title: step.title,
        description: step.description,
        system: step.system,
        decisionRule: step.decisionRule,
        isAutomated: Boolean(step.automated),
      })),
      decisions: definition.decisions || [],
      exceptions: definition.exceptions || [],
      versions: [{
        version: 1,
        createdAt: monthsAgo(2),
        approvedBy: definition.ownerName,
        changeSummary: "النسخة الأولى المعتمدة من الحزمة القطاعية.",
        steps: [],
        rules: [],
        exceptions: definition.exceptions || [],
      }],
      allowedActions: definition.allowedActions,
      killSwitchActive: false,
    };
  });

  const policies: Policy[] = pack.policies.map((definition, index) => ({
    id: slugId("pol", definition.code, index),
    code: definition.code,
    title: definition.title,
    titleEn: definition.titleEn,
    riskLevel: definition.riskLevel,
    version: 1,
    effectiveFrom: monthsAgo(6),
    approvedBy: definition.approvedBy,
    summary: definition.summary,
    rules: definition.rules,
  }));

  const knowledgeSources: KnowledgeSource[] = pack.sources.map((definition, index) => ({
    id: slugId("src", definition.title, index),
    title: definition.title,
    type: definition.type,
    authorityLevel: definition.authorityLevel,
    lastVerified: today(),
    owner: definition.owner,
    summary: definition.summary,
    status: "active",
    referenceCount: 0,
  }));

  const connectors: Connector[] = pack.connectors.map((definition, index) => ({
    id: slugId("conn", definition.name, index),
    name: definition.name,
    type: definition.type,
    status: definition.status || "healthy",
    lastSync: "—",
    permissions: definition.permissions,
    /* موصلات الحزمة مواضعُ ربطٍ موصوفة، لا وصلاتٌ مبنيّة — فتُعلَن محاكاةً. */
    mode: "simulated",
    stats: { callsToday: 0, successRate: 0, avgLatency: "—" },
  }));

  const learningProposals: LearningProposal[] = pack.proposals.map((definition, index) => ({
    id: slugId("prop", definition.title, index),
    type: definition.type,
    title: definition.title,
    titleEn: definition.titleEn,
    detectedAt: "اليوم",
    observedCasesCount: definition.observedCasesCount,
    confidence: definition.confidence,
    summary: definition.summary,
    status: "pending",
    evidence: definition.evidence || {},
    clarifications: (definition.clarifications || []).map((clarification, order) => ({
      id: `clar_${index}_${order}`,
      question: clarification.question,
      options: clarification.options,
    })),
  }));

  return {
    organization: {
      id: `org_${pack.code}`,
      name: pack.organization.name,
      nameEn: pack.organization.nameEn,
      industry: pack.organization.industry,
      tagline: pack.organization.tagline,
      logo: pack.organization.logo,
      verifiedSkillsCount: skills.filter(skill => skill.status === "active").length,
      hoursSavedMonth: skills.reduce((sum, skill) => sum + skill.hoursSavedTotal, 0),
    },
    users,
    knowledgeSources,
    policies,
    skills,
    connectors,
    learningProposals,
    channel: pack.channel,
  };
}
