import type { InspectionType } from '@/types';

export function generateFileName(baseName: string, type: InspectionType, date: string): string {
  return `${baseName}_${type}점검_${date}.xlsx`;
}
