'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const { chooseRun, jobsUrl, summarize, cooldown, mount, plan } = require('../dist/admin/manual-refresh.js');
const started = Date.parse('2026-11-19T01:00:00Z');
const run = (id, status = 'in_progress', conclusion, attrs = {}) =>
  ({ id, status, conclusion, event: 'workflow_dispatch', head_branch: 'main', run_attempt: 1,
    created_at: new Date(started + id).toISOString(), ...attrs });
const jobs = (count, options = {}) => ({ jobs: [{ name: 'refresh', steps: plan.map(([name], i) =>
  ({ name, status: i < count ? 'completed' : i === count ? 'in_progress' : 'queued',
    conclusion: i < count ? (options[name] || 'success') : null, number: i + 2 })) }] });
test('picks current manual main workflow run, ignores schedule, preview and invalid IDs, uses attempt', () => {
  const active = run(3, 'waiting', null, { run_attempt: 2 });
  const data = { workflow_runs: [run(11, 'completed', 'success'), run(12, 'queued', null, { event: 'schedule' }),
    run(13, 'queued', null, { head_branch: 'preview' }), run(2), active, {...run(999), id:'999'}] };
  assert.deepEqual(chooseRun(data), { run: active, activeCount: 2 });
  assert.match(jobsUrl(active), /\/runs\/3\/attempts\/2\/jobs\?/);
  assert.throws(() => jobsUrl({...run(9),id:'../other'}));
  assert.equal(chooseRun({ workflow_runs: [data.workflow_runs[0]] }).run.id, 11);
});
test('reports actual named step count, indeterminate while unknown, terminal outcomes are distinct', () => {
  assert.equal(summarize(run(3, 'queued'), null).percent, null);
  assert.equal(summarize(run(3), { jobs: [] }).percent, null);
  const progressing = summarize(run(3), jobs(5));
  assert.equal(progressing.percent, 50);
  assert.equal(progressing.phase, '판매처에서 정보 수집');
  const altered = jobs(5); altered.jobs[0].steps.pop();
  assert.equal(summarize(run(3), altered).percent, null);
  assert.equal(summarize(run(3), jobs(10)).percent, 99);
  assert.equal(summarize(run(3, 'completed', 'success'), jobs(10, { [plan[9][0]]: 'skipped' })).percent, 100);
  const partial = jobs(10, { [plan[9][0]]: 'failure' });
  assert.equal(summarize(run(3, 'completed', 'failure'), partial).status, '완료 · 일부 수집 실패');
  assert.equal(summarize(run(3, 'completed', 'failure'), partial).percent, 100);
  assert.equal(summarize(run(3, 'completed', 'failure'), jobs(8)).status, '실패');
  assert.equal(summarize(run(3, 'completed', 'cancelled'), jobs(3)).status, '취소됨');
});
test('rate limit observes both Retry-After and resetting GitHub metadata', () => {
  assert.equal(cooldown({ headers: new Headers({ 'retry-after': '140', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '210' }) }, 1000), 210000);
  assert.equal(cooldown({ headers: new Headers() }, 1000), 91000);
});
const html = () => fs.readFileSync('dist/admin/index.html','utf8');
test('header link is first-screen markup, admin starts hidden, no token/shell writes in browser script', () => {
  const home = fs.readFileSync('dist/index.html', 'utf8');
  assert.match(home.match(/<header>.*?<\/header>/s)[0], /<a class="header-admin" href="\/admin\/">관리자<\/a>/);
  assert.doesNotMatch(home.match(/<footer>.*?<\/footer>/s)[0], /href="\/admin\/"/);
  for (const asset of ['controls.js','app.js','manual-refresh.js']) {
    assert.ok(html().includes('src="/admin/'+asset+'"'));
    assert.match(new URL('/admin/'+asset,'https://aqua-price.onrender.com/admin').pathname,/^\/admin\//);
  }
  assert.match(html(), /id="manual-start"[^>]*\bhidden\b/);
  assert.doesNotMatch(html().match(/<a id="manual-start"[^>]*>/)[0], /href=/);
  assert.match(html(), /판매처·상품의 수집 완료율이 아닙니다/);
  const script = fs.readFileSync('dist/admin/manual-refresh.js', 'utf8');
  assert.doesNotMatch(script, /['"](?:POST|DELETE|PUT|PATCH)['"]|authorization|localStorage|innerHTML/i);
});
function browser(hostname, replies) {
  const events = {};
  function make() { return { hidden: true, textContent: '', addEventListener(e, fn) { this[e] = fn; },
    removeAttribute(k) { delete this[k]; } }; }
  const nodes = Object.fromEntries(['start','status-refresh','state','detail','progress','run-link','notice'].map(k => ['manual-'+k,make()]));
  const doc = { getElementById(id) { return nodes[id]; }, addEventListener(e, fn){ events[e] = fn; }, hidden: false };
  const sent = [], timers = new Map();
  let now = started, ids = 0;
  const runtime = { location: { protocol: 'https:', hostname }, Date: { now: () => now }, AbortController,
    addEventListener(e, fn){ events[e] = fn; }, setTimeout(fn, ms) { timers.set(++ids, {fn,ms}); return ids; },
    clearTimeout(id){ timers.delete(id); },
    async fetch(url, options) { sent.push([url, options]); const r = replies.shift(); if (r instanceof Error) throw r;
      assert.ok(r, 'unexpected extra request'); return { ok: true, status: 200, headers: new Headers(), json: async () => r }; },
  };
  mount(doc, runtime);
  return { nodes, doc, sent, events, timers, advance(ms){ now += ms; } };
}
const finish = () => new Promise(resolve => setImmediate(resolve));
test('preview is read-only; active jobs show stage progress and stop background polling', async () => {
  const b = browser('aqua-price-preview.onrender.com', [{workflow_runs:[run(1)]},jobs(5)]);
  await finish();
  assert.equal(b.nodes['manual-start'].hidden, true);
  assert.equal(b.nodes['manual-start'].href, undefined);
  assert.match(b.nodes['manual-state'].textContent, /진행 중.*50%/);
  assert.equal(b.nodes['manual-progress'].value, 50);
  for(const [url,options] of b.sent){
    assert.match(url,/^https:\/\/api\.github\.com\/repos\/joonhyoung-kim\/aqua-price\/actions\//);
    assert.equal(options.credentials, 'omit'); assert.equal(options.method,'GET');
  }
  assert.equal(b.timers.size,1);
  b.doc.hidden=true; b.events.visibilitychange();
  assert.equal(b.timers.size,0);
});
test('production handoff does not dispatch; duplicate refresh is limited; stale is not shown as current',async()=>{
  const b = browser('aqua-price.onrender.com',[{workflow_runs:[run(1,'completed','success')]},jobs(10),new Error('offline'),{workflow_runs:[run(2)]},jobs(6)]);
  await finish();
  const start=b.nodes['manual-start'];
  assert.equal(start.hidden,false); assert.match(start.href,/^https:\/\/github\.com\//);
  start.click(); start.click();
  assert.equal(b.sent.length,2);
  const update=b.nodes['manual-status-refresh'];
  update.click(); await finish(); assert.equal(b.sent.length,2);
  b.advance(31*1000); update.click(); update.click(); await finish();
  assert.equal(b.sent.length,3);
  assert.match(b.nodes['manual-state'].textContent,/확인 불가/);
  assert.match(b.nodes['manual-detail'].textContent,/마지막 확인/);
  assert.equal(b.nodes['manual-progress'].hidden,true);
  b.doc.hidden=true; b.events.visibilitychange(); b.advance(91*1000);
  b.doc.hidden=false; b.events.visibilitychange(); await finish();
  assert.equal(b.sent.length,5);
  assert.match(b.nodes['manual-state'].textContent,/진행 중.*60%/);
  assert.equal(start.hidden,true);
});
