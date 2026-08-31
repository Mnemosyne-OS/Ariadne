/**
 * Whether a file was touched outside its agent, and how strongly that is known.
 *
 * Two marks, never merged, for the same reason a tool call and a shell
 * redirection are never merged:
 *
 *  - **edited here** — Ariadne wrote it, on a press. A record, and it carries
 *    when.
 *  - **changed after the agent** — the file is newer than the last agent
 *    action seen on it. That could be a person, a build, a formatter, or an
 *    agent nobody is reading. The label says WHEN, never WHO, and the caveat
 *    is part of the mark rather than an aside.
 *
 * No mark is NOT "untouched". It is no evidence either way, and it renders as
 * nothing rather than as a reassurance.
 */
import type { EditMark } from '../lib/handEdits';
import { ago } from '../lib/format';
import { fill, type Dict } from '../i18n';

interface Props {
  t: Dict;
  mark: EditMark;
  /** When Ariadne wrote it. Only meaningful for the `here` mark. */
  at: string | null;
}

export default function EditBadge({ t, mark, at }: Props): JSX.Element | null {
  if (!mark) return null;

  if (mark === 'here') {
    return (
      <span className="tag edit-here" title={at ? fill(t.editedHereAt, { when: ago(at) }) : undefined}>
        {t.editedHere}
      </span>
    );
  }

  return (
    <span className="tag weak edit-after" title={t.changedAfterCaveat}>
      {t.changedAfter}
    </span>
  );
}
