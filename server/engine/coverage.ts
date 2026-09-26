import type { Skill } from "../../src/types/index.ts";

/*
 * نقاط الاعتماد على شخصٍ واحد.
 *
 * كانت المهارة تحمل علَماً «تعتمد على شخص واحد» يظهر تحذيراً ولا يقود إلى
 * شيء: لا يُعرف من هو الشخص، ولا ما الذي يقع لو غاب، ولا كيف يُرفع التحذير.
 * هنا يُجمع الاعتماد حول الأشخاص، ويُقاس الغطاء، ويُحفظ يوماً بيوم ليُرى هل
 * يتحسّن.
 */

export interface CoverageSnapshot { date: string; score: number; singlePoints: number; total: number }

export interface PersonCoverage {
  name: string;
  skills: { id: string; name: string; covered: boolean; backups: string[] }[];
  soleSkills: number;
}

export interface CoverageReport {
  score: number | null;
  total: number;
  covered: number;
  singlePoints: { id: string; name: string; ownerName: string; autonomyLevel: number; riskLevel: string }[];
  people: PersonCoverage[];
  history: CoverageSnapshot[];
}

export const isCovered = (skill: Skill) =>
  (Array.isArray(skill.backupOwnerNames) && skill.backupOwnerNames.length > 0) || skill.isSinglePointOfFailure === false;

export function coverageReport(skills: Skill[], history: CoverageSnapshot[] = []): CoverageReport {
  const people = new Map<string, PersonCoverage>();
  for (const skill of skills) {
    const owner = String(skill.ownerName || "—");
    const entry = people.get(owner) || { name: owner, skills: [], soleSkills: 0 };
    const covered = isCovered(skill);
    entry.skills.push({ id: skill.id, name: skill.name, covered, backups: skill.backupOwnerNames || [] });
    if (!covered) entry.soleSkills += 1;
    people.set(owner, entry);
  }
  const covered = skills.filter(isCovered).length;
  return {
    score: skills.length ? Math.round((covered / skills.length) * 100) : null,
    total: skills.length,
    covered,
    singlePoints: skills.filter(skill => !isCovered(skill)).map(skill => ({
      id: skill.id, name: skill.name, ownerName: skill.ownerName, autonomyLevel: skill.autonomyLevel, riskLevel: skill.riskLevel,
    })),
    people: [...people.values()].sort((a, b) => b.soleSkills - a.soleSkills),
    history: history.slice(-60),
  };
}

/** يسجّل لقطة اليوم (واحدة لكل يوم، تُحدَّث بآخر قيمة). يُعيد السجل بعد التحديث. */
export function recordCoverageSnapshot(history: CoverageSnapshot[], skills: Skill[], now = new Date()): CoverageSnapshot[] {
  const report = coverageReport(skills);
  if (report.score === null) return history;
  const date = now.toISOString().slice(0, 10);
  const snapshot: CoverageSnapshot = { date, score: report.score, singlePoints: report.singlePoints.length, total: report.total };
  const last = history[history.length - 1];
  if (last && last.date === date) history[history.length - 1] = snapshot;
  else history.push(snapshot);
  if (history.length > 365) history.splice(0, history.length - 365);
  return history;
}

/** يسند بديلاً للمهارة. الاسم يُنظَّف، ولا يُكرَّر، ولا يكون المالك نفسه. */
export function assignBackup(skill: Skill, name: unknown): { ok: boolean; message: string } {
  const clean = String(name || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) return { ok: false, message: "اكتب اسم الزميل البديل." };
  if (clean === skill.ownerName) return { ok: false, message: "البديل لا يكون مالك المهارة نفسه." };
  const backups = new Set(skill.backupOwnerNames || []);
  backups.add(clean);
  skill.backupOwnerNames = [...backups];
  skill.isSinglePointOfFailure = false;
  return { ok: true, message: `أُسند «${clean}» بديلاً لمهارة «${skill.name}».` };
}
