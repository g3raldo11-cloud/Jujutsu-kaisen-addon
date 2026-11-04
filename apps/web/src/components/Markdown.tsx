import { Fragment, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { fileUrl } from '../lib/api';
import { useStore } from '../lib/store';

/**
 * Minimal markdown → React renderer. It never produces HTML strings, so user content
 * cannot inject markup: every piece of text ends up as a React text node.
 * Supported: **bold**, *italic*, __underline__, ~~strike~~, `code`, ```blocks```, > quotes,
 * ||spoilers||, links (http/https only), @mentions, <#channel> and :custom_emoji:.
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const parts = text.split(/```/);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const code = part.replace(/^[a-z0-9+-]*\n/i, '');
      blocks.push(<pre key={`c${i}`}>{code.replace(/\n$/, '')}</pre>);
      return;
    }
    const lines = part.split('\n');
    let quote: string[] = [];
    const flush = (k: string) => {
      if (quote.length) blocks.push(<blockquote key={k}>{quote.map((q, j) => <div key={j}>{inline(q)}</div>)}</blockquote>);
      quote = [];
    };
    lines.forEach((line, j) => {
      if (i > 0 && j === 0 && line === '') return;
      if (line.startsWith('> ')) {
        quote.push(line.slice(2));
        return;
      }
      flush(`q${i}-${j}`);
      blocks.push(<p key={`p${i}-${j}`}>{line ? inline(line) : ' '}</p>);
    });
    flush(`q${i}-end`);
  });
  // Trim a trailing empty paragraph.
  while (blocks.length > 1 && (blocks[blocks.length - 1] as any)?.props?.children === ' ') blocks.pop();
  return <div className={`md break-words ${className ?? ''}`}>{blocks}</div>;
}

const TOKEN = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\|\|[^|\n]+\|\|)|(\*[^*\n]+\*)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|(@[a-zA-Z0-9_.]{2,32})|(<#[0-9a-f-]{36}>)|(:[a-z0-9_]{2,32}:)/g;

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of s.matchAll(TOKEN)) {
    if (m.index! > last) out.push(s.slice(last, m.index));
    const t = m[0];
    const key = k++;
    if (m[1]) out.push(<code key={key}>{t.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={key}>{inline(t.slice(2, -2))}</strong>);
    else if (m[3]) out.push(<u key={key}>{inline(t.slice(2, -2))}</u>);
    else if (m[4]) out.push(<s key={key}>{inline(t.slice(2, -2))}</s>);
    else if (m[5]) out.push(<Spoiler key={key}>{inline(t.slice(2, -2))}</Spoiler>);
    else if (m[6]) out.push(<em key={key}>{inline(t.slice(1, -1))}</em>);
    else if (m[7]) out.push(<ExternalLink key={key} href={t} />);
    else if (m[8]) out.push(<Mention key={key} name={t.slice(1)} />);
    else if (m[9]) out.push(<ChannelRef key={key} id={t.slice(2, -1)} />);
    else if (m[10]) out.push(<CustomEmoji key={key} name={t.slice(1, -1)} />);
    last = m.index! + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out.map((x, i) => (typeof x === 'string' ? <Fragment key={`t${i}`}>{x}</Fragment> : x));
}

function ExternalLink({ href }: { href: string }) {
  let safe: URL | null = null;
  try {
    safe = new URL(href);
  } catch {
    /* invalid */
  }
  if (!safe || !['http:', 'https:'].includes(safe.protocol)) return <>{href}</>;
  return (
    <a href={safe.toString()} target="_blank" rel="noopener noreferrer nofollow" title={safe.hostname}>
      {href}
    </a>
  );
}

function Mention({ name }: { name: string }) {
  const user = useStore((s) => Object.values(s.users).find((u) => u.username.toLowerCase() === name.toLowerCase()));
  if (['todos', 'everyone', 'here', 'aqui'].includes(name.toLowerCase())) return <span className="mention">@{name}</span>;
  if (!user) return <>@{name}</>;
  return <span className="mention">@{user.displayName}</span>;
}

function ChannelRef({ id }: { id: string }) {
  const ch = useStore((s) => s.channels[id]);
  if (!ch) return <span className="mention">#canal-privado</span>;
  return (
    <Link to={`/app/c/${id}`} className="mention">
      #{ch.name}
    </Link>
  );
}

function CustomEmoji({ name }: { name: string }) {
  const e = useStore((s) => s.emojis.find((x) => x.name === name && x.kind === 'emoji'));
  if (!e) return <>:{name}:</>;
  return <img src={fileUrl(e.fileId)} alt={`:${name}:`} title={`:${name}:`} className="inline-block size-[1.35em] align-[-0.3em] object-contain" />;
}

function Spoiler({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`spoiler ${open ? 'revealed' : ''}`} onClick={() => setOpen(true)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(true)} aria-label={open ? undefined : 'Spoiler oculto'}>
      {children}
    </span>
  );
}

/** Whether the text is only 1–3 emoji (rendered larger). */
export const isJumboEmoji = (t: string) => /^(?:\p{Extended_Pictographic}[‍️\p{Emoji_Modifier}\p{Extended_Pictographic}]*\s*){1,3}$/u.test(t.trim());
