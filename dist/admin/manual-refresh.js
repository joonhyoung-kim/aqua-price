(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else factory().mount(root.document, root);
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const repo = 'joonhyoung-kim/aqua-price';
  const workflowPath = '/actions/workflows/catalog-refresh.yml';
  const workflowUrl = 'https://github.com/' + repo + workflowPath;
  const api = 'https://api.github.com/repos/' + repo + '/actions';
  const runsUrl = api + '/workflows/catalog-refresh.yml/runs?branch=main&event=workflow_dispatch&per_page=8';
  const liveHost = 'aqua-price.onrender.com';
  const pollDelay = 90000;
  const pollLimit = 30 * 60000;
  const clickDelay = 30000;
  const activeStates = new Set(['queued', 'requested', 'waiting', 'pending', 'in_progress']);
  const plan = [
    ['Checkout trusted main collector', '코드 준비'],
    ['Pin publication branches before collection', '게시 대상 확인'],
    ['Set up Node', '실행 환경 준비'],
    ['Restore bounded collector cache and lastgood', '이전 수집 기록 불러오기'],
    ['Verify collector and catalog contracts', '수집 전 검사'],
    ['Refresh registered sources', '판매처에서 정보 수집'],
    ['Validate resulting static data', '수집 결과 검사'],
    ['Publish validated data to main and preview atomically', '게시 단계'],
    ['Preserve lastgood and refusal quarantine', '마지막 확인 데이터 보존'],
    ['Report source failures without retrying', '실패한 판매처 확인'],
  ];
  function chooseRun(data) {
    if (!Array.isArray(data?.workflow_runs)) throw new Error('invalid response');
    const runs = data.workflow_runs.filter(run => run?.event === 'workflow_dispatch' && run.head_branch === 'main'
      && Number.isSafeInteger(run.id) && run.id > 0 && Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0
      && Number.isFinite(Date.parse(run.created_at)))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
    const active = runs.filter(run => activeStates.has(run.status));
    return { run: active[0] || runs[0] || null, activeCount: active.length };
  }
  function jobsUrl(run) {
    if (!Number.isSafeInteger(run?.id) || run.id < 1 || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) throw new Error('invalid run');
    return api + '/runs/' + run.id + '/attempts/' + run.run_attempt + '/jobs?per_page=100';
  }
  function summarize(run, data) {
    const job = Array.isArray(data?.jobs) ? data.jobs.find(job => job?.name === 'refresh') : null;
    const steps = Array.isArray(job?.steps) ? job.steps : [];
    const evidence = new Map(steps.map(step => [step?.name, step]));
    const complete = plan.filter(([name]) => evidence.get(name)?.status === 'completed'
      && !['skipped', 'cancelled'].includes(evidence.get(name)?.conclusion)).length;
    // The denominator is the currently verified workflow's named steps, not a product total,
    // duration or estimated ETA. Unknown workflow layouts never produce a made-up percentage.
    const knownPlan = plan.every(([name]) => evidence.has(name));
    const phase = plan.find(([name]) => evidence.get(name)?.status === 'in_progress')?.[1] || null;
    const terminal = run.status === 'completed';
    const normalSuccess = terminal && run.conclusion === 'success';
    const partial = terminal && run.conclusion === 'failure'
      && evidence.get(plan[7][0])?.conclusion === 'success'
      && evidence.get(plan[9][0])?.conclusion === 'failure';
    const status = normalSuccess ? '완료' : partial ? '완료 · 일부 수집 실패'
      : terminal ? ({ failure: '실패', cancelled: '취소됨', timed_out: '시간 초과',
        action_required: '확인 필요', startup_failure: '시작 실패' }[run.conclusion] || '종료 · 결과 확인 필요')
      : run.status === 'in_progress' ? '진행 중' : activeStates.has(run.status) ? '대기 중' : '상태 확인 필요';
    const percent = !knownPlan ? null : normalSuccess || partial ? 100 : Math.min(99, Math.floor(100 * complete / plan.length));
    return { status, percent, phase, partial, terminal };
  }
  function cooldown(response, now) {
    const retryAfter = response.headers.get('retry-after');
    const retryNumber = Number(retryAfter);
    const retry = retryAfter && (Number.isFinite(retryNumber) ? now + Math.max(0, retryNumber) * 1000 : Date.parse(retryAfter));
    const reset = response.headers.get('x-ratelimit-remaining') === '0'
      ? 1000 * Number(response.headers.get('x-ratelimit-reset')) : 0;
    return Math.max(reset || 0, retry || 0, now + pollDelay);
  }
  function mount(document, runtime) {
    const byId = id => document.getElementById(id);
    const start = byId('manual-start'), update = byId('manual-status-refresh'), status = byId('manual-state');
    const detail = byId('manual-detail'), progress = byId('manual-progress'), trace = byId('manual-run-link');
    const notice = byId('manual-notice');
    if (![start, update, status, detail, progress, trace, notice].every(Boolean)) return;
    const production = runtime.location.protocol === 'https:' && runtime.location.hostname === liveHost;
    let timer, fetching = false, stopped = false, requestedUntil = 0, lastRefresh = 0, blockedUntil = 0, trackingUntil = 0, lastGood = '';
    if (production) {
      start.href = workflowUrl;
      notice.textContent = '아쿠아픽 버튼은 GitHub로 이동합니다. 저장소 권한이 있는 계정으로 Run workflow → main → all을 선택하면 수집이 시작됩니다. 이 작업은 검증된 결과를 운영·미리보기에 게시할 수 있습니다.';
    } else notice.textContent = '미리보기에서는 수동 수집을 시작할 수 없습니다. 아래는 운영 GitHub 수동 작업의 읽기 전용 상태입니다.';
    function stopTimer() { if (timer !== undefined) runtime.clearTimeout(timer); timer = undefined; }
    function schedule(at) {
      stopTimer();
      if (!document.hidden && !stopped) timer = runtime.setTimeout(() => { void refresh(); }, Math.max(1, at - runtime.Date.now()));
    }
    async function read(url) {
      if (runtime.Date.now() < blockedUntil) throw new Error('rate limited');
      const abort = new runtime.AbortController();
      const timeout = runtime.setTimeout(() => abort.abort(), 8000);
      try {
        const result = await runtime.fetch(url, { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', signal: abort.signal });
        if (result.status === 403 || result.status === 429 || result.headers.get('x-ratelimit-remaining') === '0') {
          blockedUntil = cooldown(result, runtime.Date.now());
        }
        if (!result.ok) throw new Error('status unavailable');
        return await result.json();
      } finally { runtime.clearTimeout(timeout); }
    }
    async function refresh() {
      if (fetching || document.hidden || stopped) return;
      const at = runtime.Date.now();
      if (at < blockedUntil) {
        status.textContent = '현재 상태 확인 불가';
        progress.hidden = true; trace.hidden = true;
        if (production) start.hidden = true;
        detail.textContent = (lastGood ? '마지막 확인: ' + lastGood + ' · ' : '') + 'GitHub 조회 제한 중입니다. 이후 다시 확인해 주세요.';
        return;
      }
      // Limit manual as well as timer refreshes; no request is sent repeatedly on fast clicks.
      if (at - lastRefresh < clickDelay) return;
      stopTimer(); lastRefresh = at; fetching = true; update.disabled = true;
      try {
        const { run, activeCount } = chooseRun(await read(runsUrl));
        if (stopped) return;
        if (!run) {
          status.textContent = '수동 실행 기록 없음';
          detail.textContent = '자동 수집은 시작하지 않습니다.';
          progress.hidden = true; trace.hidden = true;
        } else {
          const result = summarize(run, run.status === 'in_progress' || run.status === 'completed' ? await read(jobsUrl(run)) : null);
          if (stopped) return;
          const time = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(run.created_at));
          const main = result.status + (result.percent === null ? '' : (result.terminal && result.percent < 100 ? ' · 중단 전 작업 단계 ' : ' · 작업 단계 ') + result.percent + '%');
          status.textContent = main;
          const note = result.phase ? ' · ' + result.phase : '';
          detail.textContent = '실행 #' + run.id + ' · ' + time + note
            + (result.partial ? ' · 게시 단계가 완료됐지만 일부 판매처는 수집에 실패했습니다. 실제 갱신 여부는 별도입니다.' : '')
            + (activeCount > 1 ? ' · 활성 작업 ' + activeCount + '개' : '');
          lastGood = main + ' (실행 #' + run.id + ')';
          progress.hidden = result.terminal && result.percent === null;
          if (result.percent === null) progress.removeAttribute('value');
          else progress.value = result.percent;
          trace.href = 'https://github.com/' + repo + '/actions/runs/' + run.id + '/attempts/' + run.run_attempt;
          trace.hidden = false;
        }
        if (production) {
          // A navigation link does not dispatch; avoid inviting another launch while any run is active.
          start.hidden = activeCount > 0;
        }
        const now = runtime.Date.now();
        if (activeCount > 0 && trackingUntil === 0) trackingUntil = now + pollLimit;
        if (activeCount === 0) trackingUntil = 0;
        const next = Math.max(now + pollDelay, blockedUntil);
        if (next <= Math.max(trackingUntil, requestedUntil)) schedule(next);
      } catch {
        if (stopped) return;
        status.textContent = '현재 상태 확인 불가';
        detail.textContent = (lastGood ? '마지막 확인: ' + lastGood + ' · ' : '')
          + '새 진행률로 표시하지 않습니다. 잠시 후 상태를 다시 확인해 주세요.';
        progress.hidden = true; trace.hidden = true;
        if (production) start.hidden = true;
        const retry = Math.max(runtime.Date.now() + pollDelay, blockedUntil);
        if (retry <= Math.max(trackingUntil, requestedUntil)) schedule(retry);
      } finally { fetching = false; update.disabled = false; }
    }
    start.addEventListener('click', () => {
      requestedUntil = runtime.Date.now() + 6 * 60000;
      schedule(runtime.Date.now() + clickDelay);
    });
    update.addEventListener('click', () => {
      trackingUntil = 0;
      void refresh();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopTimer();
      else if (runtime.Date.now() - lastRefresh >= clickDelay) void refresh();
      else if (Math.max(trackingUntil, requestedUntil) > runtime.Date.now()) schedule(lastRefresh + pollDelay);
    });
    runtime.addEventListener('pagehide', () => { stopped = true; stopTimer(); });
    runtime.addEventListener('pageshow', event => {
      if (event.persisted) { stopped = false; lastRefresh = 0; void refresh(); }
    });
    void refresh();
  }
  return { chooseRun, jobsUrl, summarize, cooldown, mount, plan };
});
