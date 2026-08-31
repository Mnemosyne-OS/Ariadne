/**
 * What the host will let a cartridge write back.
 *
 * `dialog:writeFile` keeps a NARROWER allowlist than `dialog:readFile`, and
 * deliberately so: reading a `.tsx` shows you a draft, writing one puts code
 * into a tree a build may execute. That asymmetry is the host's call, not this
 * app's, so nothing here widens it — the app's job is to say WHY a file cannot
 * be saved instead of offering a Save button that fails.
 *
 * Kept in step with `main/ipc/displayHandlers.ts` (`dialog:writeFile`). Out of
 * step, the cost is a button that refuses on press, never a lost edit: the
 * host is the authority and rejects what it will not take.
 */

const WRITABLE = new Set([
  'md', 'txt', 'json', 'js', 'ts', 'yml', 'yaml', 'csv', 'xml', 'html', 'css', 'svg',
]);

/** The extension of a path, lowercased. A dotfile is named by its own name, so
 *  `.gitignore` yields `gitignore` rather than an empty string. */
export function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot < 0) return '';
  if (dot === 0) return name.slice(1).toLowerCase();
  return name.slice(dot + 1).toLowerCase();
}

export function isWritable(path: string): boolean {
  return WRITABLE.has(extensionOf(path));
}
