/**
 * The screen shown before a folder is chosen.
 *
 * Both state what the connector WILL read, derived from the connector file
 * itself rather than written by its author — possible only because a connector
 * is data (doc 93 §3).
 */
import { describeConnector, type Connector } from '@mnemosyne_os/agent-transcripts';
import type { Dict } from '../i18n';

export function ConsentCard({ t, connector }: { t: Dict; connector: Connector }): JSX.Element {
  return (
    <section className="intro">
      <p>{t.noFolder}</p>
      <div className="consent">
        <strong>{connector.displayName}</strong>
        <p>{t.willRead}</p>
        <ul>{describeConnector(connector).map(f => <li key={f}><code>{f}</code></li>)}</ul>
      </div>
    </section>
  );
}
