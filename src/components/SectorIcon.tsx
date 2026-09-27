import React from "react";
import { Building, Building2, Scale, School, ShoppingBag, Stethoscope, Truck } from "lucide-react";
import { DnaIconTile, type DnaTone } from "./dna";

/*
 * أيقونة القطاع بحسب رمزه — بدل الرمز التعبيري في حقل `logo` (الحقل يبقى في
 * البيانات كما هو). بلاطةٌ بلونٍ باهت وأيقونةٌ خطّية.
 */
const SECTOR_ICONS: Record<string, { icon: React.ReactNode; tone: DnaTone }> = {
  education: { icon: <School />, tone: "sky" },
  clinic: { icon: <Stethoscope />, tone: "mint" },
  law: { icon: <Scale />, tone: "lilac" },
  retail: { icon: <ShoppingBag />, tone: "coral" },
  logistics: { icon: <Truck />, tone: "amber" },
  realestate: { icon: <Building2 />, tone: "indigo" },
  general: { icon: <Building />, tone: "sand" },
};

export function SectorIcon({ code, size = "md", className }: { code: string; size?: "xs" | "sm" | "md" | "lg" | "xl"; className?: string }) {
  const entry = SECTOR_ICONS[code] || SECTOR_ICONS.general;
  return <DnaIconTile icon={entry.icon} tone={entry.tone} size={size} className={className} />;
}
