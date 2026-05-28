import { Sidebar } from '@/components/layout/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '260px 1fr',
      minHeight: '100vh',
      background: 'var(--bg-page)',
    }}>
      <Sidebar />
      <div style={{
        minWidth: 0,
        overflowX: 'hidden',
        paddingBottom: 80,
        background: 'var(--bg-page)',
      }}>
        {children}
      </div>
    </div>
  );
}
