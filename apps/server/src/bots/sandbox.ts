import { getQuickJS, shouldInterruptAfterDeadline, type QuickJSWASMModule } from 'quickjs-emscripten';

let modPromise: Promise<QuickJSWASMModule> | null = null;
const getModule = () => (modPromise ??= getQuickJS());

export interface SandboxResult {
  ok: boolean;
  result: unknown;
  storage: Record<string, unknown>;
  logs: string[];
  error?: string;
  durationMs: number;
}

export const SANDBOX_LIMITS = { timeMs: 200, memoryBytes: 16 * 1024 * 1024, stackBytes: 512 * 1024, storageBytes: 16 * 1024, outputBytes: 32 * 1024 };

/**
 * Runs an admin-authored bot script inside a QuickJS WebAssembly VM.
 * The VM has no access to the host: no network, filesystem, timers, process or
 * application data — only the JSON input passed in and a small key/value `storage`.
 * Execution is bounded by time, memory and stack limits.
 */
export async function runBotScript(
  script: string,
  handler: 'onCommand' | 'onMessage' | 'onMemberJoin',
  input: unknown,
  storage: Record<string, unknown>,
): Promise<SandboxResult> {
  const QuickJS = await getModule();
  const runtime = QuickJS.newRuntime();
  const started = Date.now();
  runtime.setMemoryLimit(SANDBOX_LIMITS.memoryBytes);
  runtime.setMaxStackSize(SANDBOX_LIMITS.stackBytes);
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(started + SANDBOX_LIMITS.timeMs));
  const vm = runtime.newContext();
  try {
    const code = `"use strict";
var __logs = [];
var console = { log: function () { if (__logs.length < 20) __logs.push(Array.prototype.map.call(arguments, String).join(' ').slice(0, 500)); } };
var storage = ${JSON.stringify(storage ?? {})};
${script}
;(function () {
  var fn = typeof ${handler} === 'function' ? ${handler} : null;
  var r = fn ? fn(${JSON.stringify(input)}) : null;
  return JSON.stringify({ handled: !!fn, result: r === undefined ? null : r, storage: storage, logs: __logs });
})()`;
    const res = vm.evalCode(code, 'bot.js');
    if (res.error) {
      const err = vm.dump(res.error);
      res.error.dispose();
      const msg = typeof err === 'object' && err ? `${err.name ?? 'Error'}: ${err.message ?? JSON.stringify(err)}` : String(err);
      return { ok: false, result: null, storage, logs: [], error: msg.slice(0, 500), durationMs: Date.now() - started };
    }
    const raw = vm.dump(res.value) as string;
    res.value.dispose();
    if (typeof raw !== 'string' || raw.length > SANDBOX_LIMITS.outputBytes) {
      return { ok: false, result: null, storage, logs: [], error: 'Saída do script grande demais', durationMs: Date.now() - started };
    }
    const parsed = JSON.parse(raw) as { handled: boolean; result: unknown; storage: Record<string, unknown>; logs: string[] };
    const nextStorage = JSON.stringify(parsed.storage ?? {}).length <= SANDBOX_LIMITS.storageBytes ? parsed.storage : storage;
    return { ok: true, result: parsed.handled ? parsed.result : null, storage: nextStorage ?? {}, logs: parsed.logs ?? [], durationMs: Date.now() - started };
  } catch (err) {
    return { ok: false, result: null, storage, logs: [], error: String((err as Error)?.message ?? err).slice(0, 500), durationMs: Date.now() - started };
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}

export interface BotAction {
  type: 'reply' | 'react';
  content?: string;
  emoji?: string;
}

/** Normalises whatever a script returned into at most three safe actions. */
export function normalizeActions(result: unknown): BotAction[] {
  const list = Array.isArray(result) ? result : result == null ? [] : [result];
  const out: BotAction[] = [];
  for (const item of list.slice(0, 3)) {
    if (typeof item === 'string' && item.trim()) out.push({ type: 'reply', content: item.slice(0, 2000) });
    else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      if (typeof o.reply === 'string' && o.reply.trim()) out.push({ type: 'reply', content: o.reply.slice(0, 2000) });
      if (typeof o.react === 'string' && o.react.length <= 16) out.push({ type: 'react', emoji: o.react });
    }
  }
  return out.slice(0, 3);
}
