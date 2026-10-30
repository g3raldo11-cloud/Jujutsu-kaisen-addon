import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, KeyRound, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { passwordSchema, registerSchema } from '@ouroboros/shared';
import { ApiError, post } from '../../lib/api';
import { useStore } from '../../lib/store';
import { cx, dateTime } from '../../lib/format';
import { Mark } from '../../components/Logo';
import { Field, Spinner } from '../../components/ui';
import type { Me } from '../../lib/types';

/** Shared frame: copy on the left, the arched "gate" on the right. */
function GateLayout({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  const c = useStore((s) => s.community);
  return (
    <div className="min-h-full bg-bg">
      <div className="mx-auto grid min-h-dvh max-w-6xl items-center gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[1.05fr_minmax(0,440px)] lg:gap-16">
        <div className="order-2 lg:order-1">
          <Link to="/" className="mb-10 inline-flex items-center gap-2.5 text-accent">
            <Mark size={30} />
            <span className="font-display text-[17px] font-semibold text-fg">{c?.communityName ?? 'Ouroboros'}</span>
          </Link>
          {aside ?? <Presentation />}
        </div>
        <div className="order-1 lg:order-2">
          <div className="gate-open relative rounded-t-[220px] border border-b-0 border-accent/50 bg-surface-2 px-6 pt-24 pb-8 shadow-panel sm:px-10">
            <div className="pointer-events-none absolute inset-3 rounded-t-[210px] border border-b-0 border-accent/15" aria-hidden />
            <div className="absolute top-9 left-1/2 -translate-x-1/2 text-accent">
              <Mark size={36} />
            </div>
            <div className="relative">{children}</div>
          </div>
          <div className="h-2 rounded-b-md bg-accent/60" aria-hidden />
        </div>
      </div>
    </div>
  );
}

function Presentation() {
  const c = useStore((s) => s.community);
  if (!c) return null;
  return (
    <div className="max-w-xl">
      <h1 className="text-[clamp(2.4rem,6vw,4.2rem)] leading-[1.02] font-semibold tracking-[-0.03em]">{c.communityName}</h1>
      <p className="mt-4 text-[19px] leading-snug text-muted">{c.tagline}</p>
      <p className="mt-6 max-w-[62ch] text-[15.5px] leading-relaxed whitespace-pre-line text-fg/90">{c.description}</p>
      <div className="mt-8 grid max-w-lg gap-3 text-[14px] text-muted sm:grid-cols-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" /> Cada pedido de entrada é analisado pela administração.
        </div>
        <div className="flex items-start gap-2">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-accent" /> Conteúdo visível só para membros aprovados.
        </div>
        <div className="flex items-start gap-2">
          <Mail className="mt-0.5 size-4 shrink-0 text-accent" /> Seu e-mail nunca é exibido a outros membros.
        </div>
      </div>
      {c.rules && (
        <details className="mt-8 max-w-xl rounded-xl border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer text-[14px] font-semibold">Regras da comunidade</summary>
          <p className="mt-2 text-[14px] leading-relaxed whitespace-pre-line text-muted">{c.rules}</p>
        </details>
      )}
    </div>
  );
}

function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[14px] text-danger">
      {error}
    </p>
  );
}

export function Landing() {
  const me = useStore((s) => s.me);
  const c = useStore((s) => s.community);
  if (me) return <Navigate to={me.state === 'ok' ? '/app' : '/gate'} replace />;
  return (
    <GateLayout>
      <h2 className="text-center text-[24px] font-semibold">Entrada restrita</h2>
      <p className="mt-2 text-center text-[14.5px] text-muted">Membros entram com a própria conta. Quem ainda não participa pode pedir acesso.</p>
      <div className="mt-8 grid gap-3">
        <Link to="/login" className="btn-primary py-2.5">
          Entrar
        </Link>
        {c?.registrationOpen ? (
          <Link to="/register" className="btn-outline py-2.5">
            Pedir acesso
          </Link>
        ) : (
          <p className="text-center text-[13.5px] text-faint">Novos pedidos de acesso estão fechados no momento.</p>
        )}
      </div>
    </GateLayout>
  );
}

export function Login({ onLogin }: { onLogin: (me: Me) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await post<Me>('/auth/login', { login, password, totp: needTotp ? totp : undefined });
      onLogin(me);
      navigate(me.state === 'ok' ? '/app' : '/gate', { replace: true });
    } catch (err) {
      const e2 = err as ApiError;
      if (e2.code === 'TOTP_REQUIRED') setNeedTotp(true);
      else setError(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <GateLayout>
      <h2 className="mb-6 text-center text-[24px] font-semibold">Entrar</h2>
      <form onSubmit={submit} noValidate>
        <ErrorText error={error} />
        {!needTotp ? (
          <>
            <Field label="Usuário ou e-mail">
              <input className="field" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required autoFocus />
            </Field>
            <Field label="Senha">
              <input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
          </>
        ) : (
          <Field label="Código do aplicativo autenticador" hint="Abra seu app autenticador e digite os 6 dígitos.">
            <input className="field text-center font-mono text-[20px] tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))} autoFocus />
          </Field>
        )}
        <button className="btn-primary mt-2 w-full py-2.5" disabled={busy || !login || !password || (needTotp && totp.length !== 6)}>
          {busy ? <Spinner className="size-4 text-accent-fg" /> : needTotp ? 'Confirmar código' : 'Entrar'}
        </button>
      </form>
      <div className="mt-6 flex justify-between text-[13.5px]">
        <Link to="/forgot-password" className="text-muted hover:text-fg">
          Esqueci minha senha
        </Link>
        <Link to="/register" className="text-accent hover:underline">
          Pedir acesso
        </Link>
      </div>
    </GateLayout>
  );
}

export function Register() {
  const c = useStore((s) => s.community);
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '', introduction: '', acceptTerms: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = registerSchema.safeParse(form);
    const errs: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
    if (form.password !== form.confirm) errs.confirm = 'As senhas não coincidem';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await post('/auth/register', parsed.data);
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <GateLayout>
        <h2 className="text-center text-[24px] font-semibold">Confirme seu e-mail</h2>
        <p className="mt-3 text-center text-[14.5px] text-muted">
          Enviamos um link para <strong className="text-fg">{form.email}</strong>. Depois de confirmar, seu pedido vai para a administração e você pode acompanhar o andamento entrando com sua conta.
        </p>
        <Link to="/login" className="btn-primary mt-8 w-full py-2.5">
          Ir para a entrada
        </Link>
        <ResendVerification email={form.email} />
      </GateLayout>
    );

  if (c && !c.registrationOpen)
    return (
      <GateLayout>
        <h2 className="text-center text-[22px] font-semibold">Pedidos fechados</h2>
        <p className="mt-2 text-center text-muted">A administração não está aceitando novos pedidos de acesso agora.</p>
      </GateLayout>
    );

  return (
    <GateLayout>
      <h2 className="mb-1 text-center text-[24px] font-semibold">Pedir acesso</h2>
      <p className="mb-6 text-center text-[13.5px] text-muted">Sua conta só é liberada depois da aprovação manual.</p>
      <form onSubmit={submit} noValidate>
        <ErrorText error={error} />
        <Field label="Nome de usuário" error={errors.username} hint="Letras, números, ponto e sublinhado.">
          <input className="field" autoComplete="username" value={form.username} onChange={set('username')} />
        </Field>
        <Field label="E-mail" error={errors.email}>
          <input className="field" type="email" autoComplete="email" value={form.email} onChange={set('email')} />
        </Field>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label="Senha" error={errors.password}>
            <input className="field" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />
          </Field>
          <Field label="Confirmar senha" error={errors.confirm}>
            <input className="field" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
          </Field>
        </div>
        <PasswordMeter value={form.password} />
        <Field label="Apresentação (opcional)" hint="Conte quem é você ou quem te indicou. A administração vê este texto.">
          <textarea className="field min-h-20 resize-y" maxLength={1000} value={form.introduction} onChange={set('introduction')} />
        </Field>
        <label className="mb-5 flex items-start gap-2.5 text-[14px]">
          <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={form.acceptTerms} onChange={set('acceptTerms')} />
          <span>
            Li e aceito as regras da comunidade.
            {errors.acceptTerms && <span className="block text-[13px] text-danger">{errors.acceptTerms}</span>}
          </span>
        </label>
        <button className="btn-primary w-full py-2.5" disabled={busy}>
          {busy ? <Spinner className="size-4 text-accent-fg" /> : 'Enviar pedido'}
        </button>
      </form>
      <p className="mt-5 text-center text-[13.5px] text-muted">
        Já é membro?{' '}
        <Link to="/login" className="text-accent hover:underline">
          Entrar
        </Link>
      </p>
    </GateLayout>
  );
}

function PasswordMeter({ value }: { value: string }) {
  if (!value) return null;
  const ok = passwordSchema.safeParse(value).success;
  const score = Math.min(4, Math.floor(value.length / 4) + (/[A-Z]/.test(value) ? 1 : 0) + (/[^a-zA-Z0-9]/.test(value) ? 1 : 0) - 1);
  return (
    <div className="-mt-2 mb-4 flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cx('h-1 flex-1 rounded-full', i <= score && ok ? (score >= 3 ? 'bg-success' : 'bg-warning') : 'bg-line')} />
        ))}
      </div>
      <span className="text-[12px] text-faint">{!ok ? 'Fraca' : score >= 3 ? 'Forte' : 'Razoável'}</span>
    </div>
  );
}

function ResendVerification({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  return (
    <button
      className="mt-3 w-full text-center text-[13.5px] text-muted hover:text-fg disabled:opacity-60"
      disabled={sent}
      onClick={async () => {
        await post('/auth/resend-verification', { email }).catch(() => {});
        setSent(true);
      }}
    >
      {sent ? 'Se a conta existir, um novo link foi enviado.' : 'Não recebi o e-mail — reenviar'}
    </button>
  );
}

export function VerifyEmail({ onDone }: { onDone: () => void }) {
  const [params] = useSearchParams();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setState('error');
      setMsg('Link incompleto.');
      return;
    }
    post('/auth/verify-email', { token })
      .then(() => {
        setState('ok');
        onDone();
      })
      .catch((e) => {
        setState('error');
        setMsg(e.message);
      });
  }, [params, onDone]);
  return (
    <GateLayout>
      {state === 'loading' && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}
      {state === 'ok' && (
        <>
          <h2 className="text-center text-[24px] font-semibold">E-mail confirmado</h2>
          <p className="mt-3 text-center text-[14.5px] text-muted">Seu pedido foi enviado para a administração. Você receberá um e-mail quando for analisado.</p>
          <Link to="/login" className="btn-primary mt-8 w-full py-2.5">
            Acompanhar meu pedido
          </Link>
        </>
      )}
      {state === 'error' && (
        <>
          <h2 className="text-center text-[22px] font-semibold">Link inválido</h2>
          <p className="mt-3 text-center text-[14.5px] text-muted">{msg} Peça um novo link na tela de entrada.</p>
          <Link to="/login" className="btn-outline mt-8 w-full py-2.5">
            Voltar
          </Link>
        </>
      )}
    </GateLayout>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <GateLayout>
      <h2 className="mb-2 text-center text-[24px] font-semibold">Recuperar senha</h2>
      {sent ? (
        <p className="text-center text-[14.5px] text-muted">Se houver uma conta com este e-mail, enviamos um link válido por 1 hora.</p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await post('/auth/forgot-password', { email }).catch(() => {});
            setBusy(false);
            setSent(true);
          }}
        >
          <p className="mb-5 text-center text-[14px] text-muted">Informe o e-mail da sua conta para receber um link de redefinição.</p>
          <Field label="E-mail">
            <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
          <button className="btn-primary w-full py-2.5" disabled={busy || !email}>
            Enviar link
          </button>
        </form>
      )}
      <Link to="/login" className="mt-6 block text-center text-[13.5px] text-muted hover:text-fg">
        Voltar para a entrada
      </Link>
    </GateLayout>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  return (
    <GateLayout>
      <h2 className="mb-6 text-center text-[24px] font-semibold">Nova senha</h2>
      {done ? (
        <>
          <p className="text-center text-muted">Senha alterada. Por segurança, todas as sessões abertas foram encerradas.</p>
          <Link to="/login" className="btn-primary mt-6 w-full py-2.5">
            Entrar
          </Link>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const v = passwordSchema.safeParse(password);
            if (!v.success) return setError(v.error.issues[0].message);
            try {
              await post('/auth/reset-password', { token: params.get('token'), password });
              setDone(true);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <ErrorText error={error} />
          <Field label="Nova senha">
            <input className="field" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </Field>
          <PasswordMeter value={password} />
          <button className="btn-primary w-full py-2.5">Salvar nova senha</button>
        </form>
      )}
    </GateLayout>
  );
}

/** Where every not-yet-admitted account lands. The server enforces the same rule on every API. */
export function Gate({ onLogout, onRefresh }: { onLogout: () => void; onRefresh: () => void }) {
  const me = useStore((s) => s.me);
  useEffect(() => {
    const t = setInterval(onRefresh, 20_000);
    return () => clearInterval(t);
  }, [onRefresh]);
  if (!me) return <Navigate to="/login" replace />;
  if (me.state === 'ok') return <Navigate to="/app" replace />;

  const steps = [
    { label: 'Conta criada', done: true },
    { label: 'E-mail confirmado', done: me.state !== 'unverified' },
    { label: 'Análise da administração', done: false, current: me.state === 'pending' },
    { label: 'Acesso liberado', done: false },
  ];
  const blocked = me.state === 'rejected' || me.state === 'banned' || me.state === 'suspended';
  return (
    <GateLayout
      aside={
        <div className="max-w-md">
          <h1 className="text-[clamp(2rem,5vw,3.2rem)] leading-tight font-semibold">Olá, {me.user.displayName}.</h1>
          {!blocked ? (
            <ol className="mt-8 space-y-0">
              {steps.map((s, i) => (
                <li key={s.label} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={cx('flex size-7 items-center justify-center rounded-full border text-[13px] font-semibold', s.done ? 'border-accent bg-accent text-accent-fg' : s.current ? 'border-accent text-accent' : 'border-line-strong text-faint')}>
                      {s.done ? <Check className="size-4" /> : i + 1}
                    </span>
                    {i < steps.length - 1 && <span className={cx('h-8 w-px', s.done ? 'bg-accent' : 'bg-line-strong')} />}
                  </div>
                  <p className={cx('pt-0.5 text-[15px]', s.done ? 'text-fg' : s.current ? 'font-semibold text-accent' : 'text-faint')}>{s.label}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-6 text-[15px] text-muted">Esta conta não tem acesso às áreas privadas da comunidade.</p>
          )}
        </div>
      }
    >
      {me.state === 'unverified' && (
        <>
          <h2 className="text-center text-[22px] font-semibold">Confirme seu e-mail</h2>
          <p className="mt-2 text-center text-[14.5px] text-muted">Abra o link que enviamos para {me.user.email}. Seu pedido só chega à administração depois disso.</p>
          <ResendVerification email={me.user.email} />
        </>
      )}
      {me.state === 'pending' && (
        <>
          <h2 className="text-center text-[22px] font-semibold">Pedido em análise</h2>
          <p className="mt-2 text-center text-[14.5px] text-muted">
            Enviado em {me.request ? dateTime(me.request.createdAt) : '—'}. Esta página atualiza sozinha; você também será avisado por e-mail.
          </p>
        </>
      )}
      {me.state === 'rejected' && (
        <>
          <h2 className="text-center text-[22px] font-semibold">Pedido não aprovado</h2>
          <p className="mt-2 text-center text-[14.5px] text-muted">A administração não aprovou este pedido de acesso.</p>
        </>
      )}
      {me.state === 'suspended' && (
        <>
          <h2 className="text-center text-[22px] font-semibold">Conta suspensa</h2>
          <p className="mt-2 text-center text-[14.5px] text-muted">
            {me.user.suspendedUntil ? `O acesso volta em ${dateTime(me.user.suspendedUntil)}.` : 'Acesso suspenso.'}
            {me.user.statusReason ? ` Motivo: ${me.user.statusReason}` : ''}
          </p>
        </>
      )}
      {me.state === 'banned' && (
        <>
          <h2 className="text-center text-[22px] font-semibold">Conta banida</h2>
          <p className="mt-2 text-center text-[14.5px] text-muted">Esta conta foi removida da comunidade.</p>
        </>
      )}
      <button className="btn-ghost mt-8 w-full" onClick={onLogout}>
        <LogOut className="size-4" /> Sair
      </button>
    </GateLayout>
  );
}

export function Maintenance({ message, onLogout }: { message: string; onLogout?: () => void }) {
  return (
    <GateLayout aside={<h1 className="text-[clamp(2rem,5vw,3.2rem)] font-semibold">Voltamos em breve</h1>}>
      <h2 className="text-center text-[22px] font-semibold">Em manutenção</h2>
      <p className="mt-2 text-center text-[14.5px] text-muted">{message}</p>
      {onLogout && (
        <button className="btn-ghost mt-8 w-full" onClick={onLogout}>
          Sair
        </button>
      )}
    </GateLayout>
  );
}
