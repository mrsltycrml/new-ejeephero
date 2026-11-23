import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { buildTransitChatContext } from '../supabase/functions/herobot-chat/context.ts';

const script = ts.transpileModule(readFileSync(new URL('../supabase/functions/herobot-chat/index.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const userId = 'fixture-user';
const legacyKey = 'fixture.' + Buffer.from(JSON.stringify({ id: userId })).toString('base64') + '.signature';
const sentAt = '2026-11-23T05:00:00.000Z';

function fixture(startingSession: { user_key: string; conversation_id: string } | null) {
  let session = startingSession;
  const created: string[] = [];
  const posted: Array<{ id: string; conversationId: string; text: string; key: string | null }> = [];
  const polls = new Map<string, number>();
  const createClient = () => ({
    rpc: async (name: string) => ({ data: name === 'current_profile_id' ? 'profile-1' : name === 'claim_chat_request' ? true : { vehicles: [] } }),
    from(table: string) {
      let row: typeof session | undefined;
      const query = {
        select: () => query, eq: () => query, order: () => query,
        single: async () => ({ data: { status: 'approved' } }),
        limit: async () => ({ data: [] }),
        upsert(value: NonNullable<typeof session>) { row = value; return query; },
        async maybeSingle() {
          assert.equal(table, 'herobot_botpress_sessions');
          if (row && session) return { data: null };
          if (row) session = row;
          return { data: session };
        },
      };
      return query;
    },
  });
  const botpress = async (path: string, init?: RequestInit) => {
    const endpoint = new URL(path).pathname.replace('/fixture', '');
    const key = new Headers(init?.headers).get('x-user-key');
    if (endpoint === '/users' && init?.method === 'POST') return Response.json({ user: { id: userId }, key: 'opaque-provider-key' }, { status: 201 });
    assert.equal(key, session?.user_key ?? 'opaque-provider-key');
    if (endpoint === '/conversations' && init?.method === 'POST') {
      const id = 'fresh-' + (created.length + 1);
      created.push(id);
      return Response.json({ conversation: { id, createdAt: sentAt, updatedAt: sentAt } }, { status: 201 });
    }
    if (endpoint === '/messages' && init?.method === 'POST') {
      const { conversationId, payload } = JSON.parse(String(init.body));
      const id = 'question-' + (posted.length + 1);
      posted.push({ id, conversationId, text: payload.text, key });
      return Response.json({ message: { id, userId, conversationId, createdAt: sentAt, payload } }, { status: 201 });
    }
    const conversationId = endpoint.split('/')[2];
    assert.equal(endpoint, '/conversations/' + conversationId + '/messages');
    const accepted = posted.find(message => message.conversationId === conversationId)!;
    const rounds = (polls.get(conversationId) ?? 0) + 1;
    polls.set(conversationId, rounds);
    const anchor = { id: accepted.id, userId, conversationId, createdAt: sentAt, payload: { type: 'text', text: accepted.text } };
    const reply = (id: string, text: string, patch: Record<string, unknown> = {}) => ({
      id, userId: 'the-bot', conversationId, createdAt: '2026-11-23T05:00:01.000Z', payload: { type: 'text', text }, ...patch,
    });
    const absentOrMismatchedAnchor = [reply('old', 'A previous answer', { createdAt: '2026-11-23T04:59:59.000Z' }),
      { ...anchor, createdAt: '2026-11-23T05:00:00.100Z' }];
    const unrelated = [reply('foreign', 'A reply from another conversation', { conversationId: 'other' }),
      reply('old', 'A previous answer', { createdAt: '2026-11-23T04:59:59.000Z' }),
      reply('own', 'User text', { userId }), reply('empty', '   '), reply('image', 'Caption', { payload: { type: 'image', text: 'Caption' } })];
    return Response.json({ messages: rounds === 1 ? absentOrMismatchedAnchor
      : rounds === 2 ? [...unrelated, anchor]
      : [...unrelated, anchor, reply('answer', 'Answer for ' + accepted.id)] });
  };
  let handler!: (request: Request) => Promise<Response>;
  const deno = { serve: (run: typeof handler) => { handler = run; }, env: { get: (key: string) => ({
    SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', SUPABASE_ANON_KEY: 'fixture-anon', BOTPRESS_WEBHOOK_ID: 'fixture',
  })[key as 'SUPABASE_URL'] } };
  const load = (id: string) => id.includes('supabase-js') ? { createClient } : id === './context.ts' ? { buildTransitChatContext } : {};
  new Function('require', 'exports', 'Deno', 'fetch', 'setTimeout', script)(load, {}, deno, botpress, (callback: () => void) => queueMicrotask(callback));
  const ask = (message: string, history?: unknown) => handler(new Request('https://fixture.invalid', {
    method: 'POST', headers: { Authorization: 'Bearer fixture' }, body: JSON.stringify({ message, history }),
  })).then(async response => ({ status: response.status, ...await response.json() }));
  return { ask, created, posted, polls, stored: () => session };
}

test('each concurrent HeroBot request uses a distinct conversation and rejects replies without the exact accepted anchor', async () => {
  const bot = fixture({ user_key: legacyKey, conversation_id: 'previous-conversation' });
  const results = await Promise.all([bot.ask('First question'), bot.ask('Second question')]);
  assert.deepEqual(results, [{ status: 200, reply: 'Answer for question-1' }, { status: 200, reply: 'Answer for question-2' }]);
  assert.deepEqual(bot.posted.map(message => message.conversationId), ['fresh-1', 'fresh-2']);
  assert.deepEqual([...bot.polls.values()], [3, 3]);
});

test('the first request reuses only its own new conversation and later requests reuse its opaque user key', async () => {
  const bot = fixture(null);
  const history = [
    { role: 'user', content: 'old entry outside history window' },
    { role: 'user', content: 'also outside history window' },
    { role: 'system', content: 'untrusted role' },
    ...Array.from({ length: 4 }, (_, index) => ({ role: 'user', content: 'earlier question ' + index })),
    { role: 'assistant', content: 'earlier answer ' + 'x'.repeat(600) + 'beyond the history cap' },
  ];
  assert.equal((await bot.ask('Follow-up?', history)).reply, 'Answer for question-1');
  assert.equal((await bot.ask('New question')).reply, 'Answer for question-2');
  assert.deepEqual(bot.created, ['fresh-1', 'fresh-2']);
  assert.deepEqual(bot.posted.map(message => [message.conversationId, message.key]), [['fresh-1', 'opaque-provider-key'], ['fresh-2', 'opaque-provider-key']]);
  assert.equal(bot.stored()?.conversation_id, 'fresh-1');
  assert.match(bot.posted[0].text, /earlier answer/);
  assert.doesNotMatch(bot.posted[0].text, /outside history window|untrusted role|beyond the history cap/);
});
