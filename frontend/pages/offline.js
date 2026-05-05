export default function Offline() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, sans-serif',
      color: '#cbd5e1',
      textAlign: 'center',
      padding: '24px',
    }}>
      <p style={{ fontSize: '48px', marginBottom: '16px' }}>💪</p>
      <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#f1f5f9', marginBottom: '8px' }}>
        You're offline
      </h1>
      <p style={{ fontSize: '14px', color: '#64748b', maxWidth: '280px' }}>
        No connection right now. Your pushup debt is patiently waiting.
      </p>
    </div>
  );
}
