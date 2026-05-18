import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '전기안전관리 직무고시 자동화',
  description: '전기차 충전소 전기안전관리 직무고시 문서 자동 생성 시스템',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
