/**
 * Settings. Everything that spends tokens is off until the person turns it on,
 * and each row says what it will send before it sends anything.
 */
import { useState } from 'react';
import type { Settings } from '../lib/settings';
import type { Source } from '../lib/sources';
import type { Dict } from '../i18n';

interface Props {
  t: Dict;
  settings: Settings;
  sources: Source[];
  onChange: (next: Settings) => void;
  onPick: (sourceId: string) => void;
  onReset: () => void;
}

export default function SettingsView({ t, settings, sources, onChange, onPick, onReset }: Props): JSX.Element {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="settings">
      {/* One folder per agent: each writes somewhere different, so there is no
          single root to share. */}
      {sources.map(s => (
        <div className="row" key={s.id}>
          <span className="field">
            <strong>{s.sessions.displayName}</strong>
            <code className="folder">{settings.folders[s.id] ?? t.unknown}</code>
            <button onClick={() => onPick(s.id)}>
              {settings.folders[s.id] ? t.pickAgain : t.pick}
            </button>
          </span>
        </div>
      ))}

      <label className="row">
        <input
          type="checkbox"
          checked={settings.summaries}
          onChange={e => onChange({ ...settings, summaries: e.target.checked })}
        />
        <span>
          <strong>{t.setSummaries}</strong>
          <em>{t.setSummariesHelp}</em>
        </span>
      </label>

      {/* Nested under summaries because it rides the same call: offering it
          while summaries are off would promise something that cannot happen. */}
      <label className={`row sub-row ${settings.summaries ? '' : 'disabled'}`}>
        <input
          type="checkbox"
          disabled={!settings.summaries}
          checked={settings.tone && settings.summaries}
          onChange={e => onChange({ ...settings, tone: e.target.checked })}
        />
        <span>
          <strong>{t.setTone}</strong>
          <em>{t.setToneHelp}</em>
        </span>
      </label>

      <div className="row">
        <span className="field">
          <strong>{t.setOwner}</strong>
          <input
            type="text"
            value={settings.ownerName}
            placeholder={t.setOwnerPlaceholder}
            onChange={e => onChange({ ...settings, ownerName: e.target.value })}
          />
          <em>{t.setOwnerHelp}</em>
        </span>
      </div>

      {/* Two steps on purpose. Reset drops every chosen folder as well, and a
          single mis-click should not send someone back through the pickers. */}
      <div className="row last">
        <span className="field">
          <strong>{t.reset}</strong>
          <em>{t.resetHelp}</em>
          {confirming ? (
            <span className="confirm">
              <button className="danger" onClick={onReset}>{t.resetConfirm}</button>
              <button onClick={() => setConfirming(false)}>{t.cancel}</button>
            </span>
          ) : (
            <button onClick={() => setConfirming(true)}>{t.reset}</button>
          )}
        </span>
      </div>
    </div>
  );
}
