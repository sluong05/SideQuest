import { useEffect, useRef } from 'react';

// Shared behaviour for modal dialogs that render as a bottom sheet on mobile
// and a centred dialog from `sm` up.

// Free edit/delete window after creating a quest (server: FREE_EDIT_MINUTES)
export const FREE_EDIT_MINUTES = 15;

export function isCoarsePointer() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

// Minutes left in the free edit/delete window (0 when closed or completed)
export function freeWindowMinutesLeft(quest, now = Date.now()) {
  if (!quest || quest.completed || !quest.createdAt) return 0;
  const ms = new Date(quest.createdAt).getTime() + FREE_EDIT_MINUTES * 60000 - now;
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

// Debt points added if this quest is deleted/skipped right now
export function deletePenalty(quest, now = Date.now()) {
  if (!quest || quest.completed) return 0;
  if (freeWindowMinutesLeft(quest, now) > 0) return 0;
  return quest.debtAmount ?? 5;
}

// Whether due date / difficulty / penalty may still be changed
export function canEditSchedule(quest, now = Date.now()) {
  if (!quest || quest.completed) return false;
  return now < new Date(quest.dueDate).getTime() || freeWindowMinutesLeft(quest, now) > 0;
}

// Locks body scroll while mounted and closes on Escape.
export function useSheetBehavior(onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    function onKey(e) {
      if (e.key === 'Escape') onCloseRef.current?.();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, []);
}

export function SheetCloseButton({ onClose, label = 'Close' }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-slate-400 hover:text-navy-200 transition-colors flex-shrink-0"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

// Drag-handle affordance shown at the top of a sheet on mobile
export function SheetHandle() {
  return (
    <div className="sm:hidden flex justify-center pt-2" aria-hidden>
      <span className="w-10 h-1 rounded-full" style={{ background: 'rgba(148,163,184,0.35)' }} />
    </div>
  );
}
