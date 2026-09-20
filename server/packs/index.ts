import { expandPack, type ExpandedPack, type SectorPack } from "./types.ts";
import { clinicPack } from "./clinic.ts";
import { lawPack } from "./law.ts";
import { retailPack } from "./retail.ts";
import { logisticsPack } from "./logistics.ts";
import { realEstatePack } from "./realestate.ts";

/*
 * سجلّ حزم الأنشطة.
 *
 * حزمة «التعليم» ليست هنا: هي بيانات البذرة الأصلية في `src/data/seedData.ts`،
 * وهي أغنى من أن تُعاد كتابتها مضغوطة، وأقدم من أن تُلمس بلا سبب. فالسجلّ
 * يعرفها بالإشارة، ويطبّقها بإعادة البذر لا بالتوسيع.
 */

export const SECTOR_PACKS: SectorPack[] = [clinicPack, lawPack, retailPack, logisticsPack, realEstatePack];

/** رمز الحزمة التعليمية — المبذورة أصلاً في المنصة. */
export const EDUCATION_CODE = "education";

export interface SectorSummary {
  code: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  logo: string;
  organizationName: string;
  skills: number;
  policies: number;
  connectors: number;
  /** الحزمة المبذورة أصلاً لا تُطبَّق من جديد — هي نقطة البداية. */
  isSeeded: boolean;
}

export function listSectors(): SectorSummary[] {
  const packs: SectorSummary[] = SECTOR_PACKS.map(pack => ({
    code: pack.code,
    nameAr: pack.nameAr,
    nameEn: pack.nameEn,
    descriptionAr: pack.descriptionAr,
    logo: pack.organization.logo,
    organizationName: pack.organization.name,
    skills: pack.skills.length,
    policies: pack.policies.length,
    connectors: pack.connectors.length,
    isSeeded: false,
  }));

  return [
    {
      code: EDUCATION_CODE,
      nameAr: "تعليم ومدارس",
      nameEn: "Education & Schools",
      descriptionAr: "التسجيل والقبول والرسوم وشؤون الطلبة — الحزمة المبذورة في المنصة.",
      logo: "🏫",
      organizationName: "أكاديمية المستقبل الدولية",
      skills: 3,
      policies: 2,
      connectors: 6,
      isSeeded: true,
    },
    ...packs,
  ];
}

export function getSectorPack(code: string): SectorPack | undefined {
  return SECTOR_PACKS.find(pack => pack.code === code);
}

/** يوسّع حزمة قطاع إلى كيانات جاهزة للتركيب في المخزن. */
export function buildSector(code: string): ExpandedPack | undefined {
  const pack = getSectorPack(code);
  return pack ? expandPack(pack) : undefined;
}

export type { ExpandedPack, SectorPack };
