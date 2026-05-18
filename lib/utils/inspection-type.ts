import type { InspectionType } from '@/types';

const MONTHLY_MONTHS  = [1, 2, 4, 5, 7, 8, 12];
const QUARTERLY_MONTHS = [3, 9];
const YEARLY_MONTHS   = [11];

export function getInspectionTypeByMonth(month: number): InspectionType {
  if (YEARLY_MONTHS.includes(month))   return '연차';
  if (QUARTERLY_MONTHS.includes(month)) return '분기';
  if (MONTHLY_MONTHS.includes(month))  return '월차';
  return '월차'; // 기본값
}

export function getSheetsByType(type: InspectionType): string[] {
  switch (type) {
    case '연차': return ['별지1- 전기설비점검기록표','별지14-충전기설비']; // 추후 모든 별지 확장
    case '분기':
    case '반기': return ['별지1- 전기설비점검기록표','별지14-충전기설비'];
    case '월차':
    default:     return ['별지1- 전기설비점검기록표','별지14-충전기설비'];
  }
}
