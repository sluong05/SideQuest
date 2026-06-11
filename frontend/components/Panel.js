// Shared sidebar-panel styling used by the quests and shop pages.

export const PANEL_STYLE = { background: 'rgba(8,21,37,0.85)', border: '1px solid rgba(59,130,246,0.14)' };

export const SELECT_STYLE = {
  background: 'rgba(8,21,37,0.95)',
  border: '1px solid rgba(59,130,246,0.18)',
  color: '#94a3b8',
  borderRadius: 8,
  padding: '6px 28px 6px 10px',
  fontSize: 12,
  outline: 'none',
  appearance: 'none',
  WebkitAppearance: 'none',
  cursor: 'pointer',
};

export function PanelHeader({ icon, children, color = '#60a5fa', action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div
          className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] flex-shrink-0"
          style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(59,130,246,0.2)', color }}
        >
          {icon}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#475569' }}>{children}</p>
      </div>
      {action}
    </div>
  );
}
