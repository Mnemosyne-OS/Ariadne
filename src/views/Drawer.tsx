/**
 * The one side panel. Everything that opens, opens here.
 *
 * A session's detail and a note used to render in different places — one under
 * a list, one on the right — so "where did it go" depended on what you
 * clicked. One drawer, one place to look.
 *
 * Everything in it links to everything else, so it also carries a history.
 * Before that, following a link was a one-way trip: the only control was
 * Close, and the way back was to shut the panel and find the list again.
 *
 * Closed means EMPTY, not merely translated off-screen: content left mounted
 * behind a transform keeps its buttons in the tab order, so keyboard focus
 * walks into a panel nobody can see.
 */
import { useEffect, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  closeLabel: string;
  onClose: () => void;
  /** Where back leads, named. An arrow alone makes you press it to find out. */
  backLabel: string | null;
  forwardLabel: string | null;
  onBack: () => void;
  onForward: () => void;
  children: ReactNode;
}

export default function Drawer(props: Props): JSX.Element {
  const { open, title, subtitle, closeLabel, onClose, backLabel, forwardLabel, onBack, onForward, children } = props;

  /**
   * The keys people already press for this: Escape closes, Alt+arrows walk the
   * history. Bound on the window rather than the panel, because the panel does
   * not hold focus after a click on a list behind it.
   *
   * Backspace is deliberately NOT bound: it is the delete key inside the
   * search box two panels away.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (!e.altKey) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); onBack(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); onForward(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, onBack, onForward]);

  return (
    <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
      {open && (
        <>
          <header>
            <div className="drawer-nav">
              <button
                className="nav"
                disabled={!backLabel}
                title={backLabel ?? undefined}
                aria-label={backLabel ? `← ${backLabel}` : undefined}
                onClick={onBack}
              >
                ‹
              </button>
              <button
                className="nav"
                disabled={!forwardLabel}
                title={forwardLabel ?? undefined}
                aria-label={forwardLabel ? `→ ${forwardLabel}` : undefined}
                onClick={onForward}
              >
                ›
              </button>
            </div>
            <div className="drawer-title">
              <strong>{title}</strong>
              {subtitle && <span className="dim">{subtitle}</span>}
            </div>
            <button onClick={onClose}>{closeLabel}</button>
          </header>
          <div className="drawer-body">{children}</div>
        </>
      )}
    </aside>
  );
}
