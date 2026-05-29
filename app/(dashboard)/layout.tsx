import { Sidebar } from '@/components/layout/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-content" style={{
        minWidth: 0,
        overflowX: 'hidden',
        paddingBottom: 80,
        background: 'var(--bg-page)',
      }}>
        {children}
      </div>
      <style>{`
        .app-shell {
          display: grid;
          grid-template-columns: 260px 1fr;
          min-height: 100vh;
          background: var(--bg-page);
        }
        @media (max-width: 768px) {
          .app-shell {
            grid-template-columns: 1fr;
          }
          .app-content {
            padding-top: 56px;
          }
        }
      `}</style>
    </div>
  );
}
