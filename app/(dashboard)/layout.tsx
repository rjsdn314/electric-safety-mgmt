import { Sidebar } from '@/components/layout/Sidebar';
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <Sidebar />
      <div className="flex-1 md:ml-[220px] pb-[60px] md:pb-0">{children}</div>
    </div>
  );
}
