import { useState } from 'react';
import { shareOrCopy } from '../lib/share';
import { track } from '../lib/analytics';
import { Icon } from './Icons';

// Share via the native share sheet when available, otherwise copy to clipboard.
// `getPayload` may be async (e.g. fetching an invite link) and should return
// { title, text, url }. Static `text`/`url`/`title` props work too.
export default function ShareButton({
  text = '',
  url = '',
  title = 'SideQuest',
  getPayload,
  label = 'Share',
  copiedLabel = 'Link copied!',
  event = 'share_clicked',
  eventProps = {},
  onDone,
  className = 'btn-secondary text-sm py-2 px-4',
  style,
  icon = true,
  children,
}) {
  const [state, setState] = useState('idle'); // idle | busy | copied | failed

  async function handleClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (state === 'busy') return;
    setState('busy');
    try {
      const payload = getPayload ? await getPayload() : { title, text, url };
      if (!payload) { setState('failed'); return; }
      const result = await shareOrCopy(payload);
      if (result !== 'cancelled' && result !== 'failed') {
        track(event, { method: result, ...eventProps });
      }
      if (result === 'copied') {
        setState('copied');
        setTimeout(() => setState('idle'), 2200);
      } else {
        setState(result === 'failed' ? 'failed' : 'idle');
        if (result === 'failed') setTimeout(() => setState('idle'), 2200);
      }
      onDone?.(result);
    } catch {
      setState('failed');
      setTimeout(() => setState('idle'), 2200);
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={state === 'busy'} className={className} style={style}>
      <span className="inline-flex items-center justify-center gap-1.5">
        {icon && state !== 'copied' && <Icon name="megaphone" className="w-4 h-4" color="currentColor" />}
        {icon && state === 'copied' && <Icon name="check" className="w-4 h-4" color="currentColor" />}
        {state === 'copied' ? copiedLabel
          : state === 'failed' ? 'Could not share'
          : state === 'busy' ? 'One sec…'
          : (children || label)}
      </span>
    </button>
  );
}
