import nodemailer, { type Transporter } from 'nodemailer';
import type { FastifyBaseLogger } from 'fastify';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<void>;
  /** Messages captured when no SMTP transport is configured (development and tests). */
  outbox: MailMessage[];
}

export function createMailer(opts: { smtpUrl?: string; from: string; log: FastifyBaseLogger; isProd: boolean }): Mailer {
  const outbox: MailMessage[] = [];
  let transport: Transporter | null = null;
  if (opts.smtpUrl) transport = nodemailer.createTransport(opts.smtpUrl);
  else if (opts.isProd) throw new Error('SMTP_URL is required in production (e-mail verification depends on it)');
  else opts.log.warn('SMTP_URL not set: e-mails will be printed to the log instead of sent');

  return {
    outbox,
    async send(msg) {
      if (!transport) {
        outbox.push(msg);
        if (outbox.length > 200) outbox.shift();
        opts.log.info({ to: msg.to, subject: msg.subject }, `[mail] ${msg.subject}\n${msg.text}`);
        return;
      }
      await transport.sendMail({ from: opts.from, ...msg });
    },
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Minimal branded HTML wrapper; all interpolated values are escaped. */
export function mailTemplate(community: string, title: string, paragraphs: string[], action?: { label: string; url: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.55">${esc(p)}</p>`).join('');
  const button = action
    ? `<p style="margin:24px 0"><a href="${esc(action.url)}" style="background:#7c6cf2;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${esc(action.label)}</a></p><p style="font-size:12px;color:#8a8fa3">Ou copie o link: ${esc(action.url)}</p>`
    : '';
  const html = `<div style="background:#0e0f14;padding:32px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#e8e9f0"><div style="max-width:520px;margin:auto;background:#161821;border:1px solid #262938;border-radius:16px;padding:28px"><div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#a99ff8;margin-bottom:12px">${esc(community)}</div><h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>${body}${button}</div></div>`;
  const text = [title, '', ...paragraphs, ...(action ? ['', `${action.label}: ${action.url}`] : [])].join('\n');
  return { html, text };
}
