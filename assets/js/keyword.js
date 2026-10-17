'use strict';
// サイトの一番上のフォルダ（このファイルは assets/js/ にある）。GitHub Pages の /リポジトリ名/ の下でも動くように、相対で求める
var SITE_ROOT = new URL('../../', (document.currentScript && document.currentScript.src) || window.location.href);

document.addEventListener('DOMContentLoaded', () => {
  initKeyword().catch(showLoadError);
});

async function initKeyword() {
  const appData = await fetchJson(new URL('data/keyword.json', SITE_ROOT).href);
  const mode = new URLSearchParams(window.location.search).get('mode');
  if ((mode === 'hlws' || window.HLWS_ONLY) && appData.hlws) {
    initHlws(appData);
    return;
  }
  const selected = new Set();
      const keywordGroups = document.getElementById('keywordGroups');
      const count = document.getElementById('count');
      const selectedList = document.getElementById('selectedList');
      const results = document.getElementById('results');
      const resetButton = document.getElementById('resetButton');
      const printButton = document.getElementById('printButton');
      const shareButton = document.getElementById('shareButton');
      const commonMessage = document.getElementById('commonMessage');
  
      commonMessage.textContent = appData.commonMessage;
  
      initFromUrl();
      renderKeywords();
      renderState();
  
      resetButton.addEventListener('click', () => {
        selected.clear();
        updateUrl();
        renderState();
      });
  
      printButton.addEventListener('click', () => window.print());
  
      shareButton.addEventListener('click', async () => {
        const url = buildResultUrl();
        try {
          await navigator.clipboard.writeText(url);
          shareButton.textContent = 'コピー済み';
          setTimeout(() => shareButton.textContent = '結果URL', 1400);
        } catch (error) {
          prompt('このURLをコピーしてください', url);
        }
      });
  
      function renderKeywords() {
        keywordGroups.innerHTML = `
          <div class="chips" aria-label="キーワード一覧">
            ${appData.keywords.map((item, index) => keywordButton({ ...item, index })).join('')}
          </div>
        `;
  
        keywordGroups.querySelectorAll('.chip').forEach(button => {
          button.addEventListener('click', () => toggleKeyword(Number(button.dataset.index)));
        });
      }
  
      function keywordButton(item) {
        const description = [item.category, item.description].filter(Boolean).join(' / ');
        return `
          <button type="button" class="chip" data-index="${item.index}" title="${escapeAttr(description)}" aria-label="${escapeAttr(item.keyword)}を選択">
            <span class="chip-name">#${escapeHtml(item.keyword)}</span>
          </button>
        `;
      }
  
      function toggleKeyword(index) {
        if (selected.has(index)) {
          selected.delete(index);
        } else if (selected.size < appData.selectionLimit) {
          selected.add(index);
        }
        updateUrl();
        renderState();
      }
  
      function renderState() {
        count.textContent = `${selected.size}/${appData.selectionLimit}`;
        const selectedItems = getSelectedItems();
        selectedList.innerHTML = selectedItems.map(item => `
          <span class="selected-pill">#${escapeHtml(item.keyword)}</span>
        `).join('');
  
        document.querySelectorAll('.chip').forEach(button => {
          const index = Number(button.dataset.index);
          const isSelected = selected.has(index);
          const isDisabled = !isSelected && selected.size >= appData.selectionLimit;
          button.classList.toggle('is-selected', isSelected);
          button.classList.toggle('is-disabled', isDisabled);
          button.setAttribute('aria-pressed', String(isSelected));
        });
  
        printButton.disabled = selected.size === 0;
        shareButton.disabled = selected.size === 0;
        renderResults(selectedItems);
      }
  
      function renderResults(selectedItems) {
        if (!selectedItems.length) {
          results.className = 'empty';
          results.innerHTML = 'キーワードを選ぶと、ここに結果が表示されます。';
          return;
        }
  
        const scored = scoreAreas(selectedItems);
        results.className = 'result-list';
        results.innerHTML = scored.map((entry, index) => resultCard(entry, index)).join('');
      }
  
      function scoreAreas(selectedItems) {
        const scores = {};
        selectedItems.forEach(item => {
          Object.entries(item.weights || {}).forEach(([code, value]) => {
            scores[code] = (scores[code] || 0) + Number(value || 0);
          });
        });
  
        const max = Math.max(1, ...Object.values(scores));
        return appData.areas
          .map(area => ({
            area,
            score: scores[area.areaCode] || 0,
            match: Math.round(((scores[area.areaCode] || 0) / max) * 100),
            lessons: appData.lessons.filter(lesson => lesson.areaCode === area.areaCode).slice(0, 3),
          }))
          .filter(entry => entry.score > 0)
          .sort((a, b) => b.score - a.score || a.area.name.localeCompare(b.area.name, 'ja'))
          .slice(0, 3);
      }
  
      function resultCard(entry, index) {
        const area = entry.area;
        const style = `style="--accent: ${escapeCssToken(area.color || '#334155')}"`;
        return `
          <article class="result-card" ${style}>
            <div class="result-top">
              <div class="result-title-row">
                <span class="rank">${index + 1}</span>
                <div>
                  <h3 class="area-name"><span class="module-prefix">モジュール：</span>${escapeHtml(area.name)}</h3>
                  <p class="subtitle">${escapeHtml(area.subtitle || '')}</p>
                </div>
              </div>
              <span class="match">マッチ度 ${entry.match}%</span>
            </div>
            <p class="description">${escapeHtml(area.description || '')}</p>
            <div class="question">
              <span>関連する問い</span>
              <p>${escapeHtml(area.question || '')}</p>
            </div>
            <div class="meta">
              <div class="meta-row">
                <strong>近い学びの領域</strong>
                <span>${escapeHtml(area.course || '')}</span>
              </div>
              <div class="meta-row">
                <strong>授業例</strong>
                <ul class="lesson-list">
                  ${entry.lessons.map(lesson => `
                    <li>
                      <span class="lesson-name">${escapeHtml(lesson.name)}</span>
                      <span class="lesson-detail">${escapeHtml([lesson.year, lesson.term, lesson.description].filter(Boolean).join(' / '))}</span>
                    </li>
                  `).join('')}
                </ul>
              </div>
              <div class="meta-row">
                <strong>相談で聞くとよいこと</strong>
                <span>${escapeHtml(area.advice || '')}</span>
              </div>
            </div>
          </article>
        `;
      }
  
      function getSelectedItems() {
        return Array.from(selected).map(index => appData.keywords[index]).filter(Boolean);
      }
  
      function initFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get('k');
        if (!raw) return;
        raw.split(',').map(Number).forEach(index => {
          if (Number.isInteger(index) && appData.keywords[index] && selected.size < appData.selectionLimit) {
            selected.add(index);
          }
        });
      }
  
      function updateUrl() {
        const url = buildResultUrl();
        if (history.replaceState) history.replaceState(null, '', url);
      }
  
      function buildResultUrl() {
        const url = new URL(window.location.href);
        const values = Array.from(selected).sort((a, b) => a - b);
        if (values.length) {
          url.searchParams.set('k', values.join(','));
        } else {
          url.searchParams.delete('k');
        }
        return url.toString();
      }
  
      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }
  
      function escapeAttr(value) {
        return escapeHtml(value).replace(/`/g, '&#096;');
      }

      function escapeCssToken(value) {
        return String(value).replace(/[^#(),.% a-zA-Z0-9-]/g, '');
      }
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(path + ' を読み込めませんでした');
  return response.json();
}

function showLoadError(error) {
  const target = document.getElementById('results') || document.body;
  target.textContent = window.location.protocol === 'file:' ? 'このページは、ファイルをダブルクリックして開くと動きません（ブラウザの制限）。GitHub Pages などに公開したURLから開いてください。' : 'データの読み込みに失敗しました。公開設定またはファイル配置を確認してください。';
  console.error(error);
}

/* ════════════════════════════════════════════════════════════════
 * 授業用（HLWS）モード：/keyword/?mode=hlws
 *   ・価値観は2段階：「いちばん大事」（最大2つ・重み×1）と「大事」（最大5つ・重み×subWeight）
 *     チップを押すたびに  未選択 → 大事 → いちばん大事 → 未選択  と切り替わる
 *   ・分野は最大2つ（重み×1）
 *   ・結果カードに「つながったキーワード」を表示し、いちばん大事な価値観の「この視点で見ると」を示す
 *   ・URL：?mode=hlws&v1=いちばん大事,…&v2=大事,…&f=分野,…（キーワード名をカンマ区切り）
 *          kw=（種類をまとめて書いた形）も読める：価値観は「いちばん大事」から順に入れる
 *   ・オープンキャンパス用（mode なし）の画面・データは変更しない
 * ════════════════════════════════════════════════════════════════ */
function initHlws(appData) {
  const H = appData.hlws;
  const L = H.limits;                       // { valueTop, valueSub, field }
  const SUBW = Number(H.subWeight) || 0.5;
  const picked = { top: new Set(), sub: new Set(), field: new Set() };
  let lastScored = [];
  const byName = {};
  H.valueKeywords.forEach(k => { byName[norm(k.keyword)] = { type: 'value', item: k }; });
  H.fieldKeywords.forEach(k => { byName[norm(k.keyword)] = { type: 'field', item: k }; });

  document.body.classList.add('mode-hlws');
  document.title = H.title;
  const lead = document.querySelector('.topbar .lead');
  if (lead && !window.HLWS_ONLY) lead.textContent = H.lead;   // 学びの地図のページは、ページ側の説明を使う
  const selectorTitle = document.getElementById('selector-title');
  if (selectorTitle) selectorTitle.textContent = '大事にしたい価値観と、気になる分野を選ぶ';
  const keywordGroups = document.getElementById('keywordGroups');
  const count = document.getElementById('count');
  const selectedList = document.getElementById('selectedList');
  const results = document.getElementById('results');
  const resetButton = document.getElementById('resetButton');
  const printButton = document.getElementById('printButton');
  const shareButton = document.getElementById('shareButton');
  const commonMessage = document.getElementById('commonMessage');
  commonMessage.textContent = H.commonMessage;

  const actions = document.querySelector('.actions');
  const copyTextButton = document.createElement('button');
  copyTextButton.type = 'button'; copyTextButton.className = 'ghost-button'; copyTextButton.id = 'copyTextButton';
  copyTextButton.textContent = '結果を文章でコピー';
  const plannerLink = document.createElement('a');
  plannerLink.className = 'ghost-button planner-link'; plannerLink.id = 'plannerLink';
  plannerLink.textContent = '上位のモジュールを履修プランナーで見る';
  actions.insertBefore(copyTextButton, shareButton);
  actions.insertBefore(plannerLink, shareButton);

  initFromUrl();
  renderKeywords();
  renderState();

  resetButton.addEventListener('click', () => { picked.top.clear(); picked.sub.clear(); picked.field.clear(); updateUrl(); renderState(); });
  printButton.addEventListener('click', () => window.print());
  shareButton.addEventListener('click', () => copy(buildResultUrl(), shareButton, '結果URL'));
  copyTextButton.addEventListener('click', () => copy(buildResultText(), copyTextButton, '結果を文章でコピー'));

  function norm(s) { return String(s || '').normalize('NFKC').replace(/\s+/g, '').trim(); }

  function renderKeywords() {
    const valueSections = H.valueGroups.map(g => `
      <div class="kw-subgroup">
        <h4 class="kw-subhead">${escapeHtml(g)}</h4>
        <div class="chips">${H.valueKeywords.filter(k => k.group === g).map(k => chip('value', k)).join('')}</div>
      </div>`).join('');
    const modules = [];
    H.fieldKeywords.forEach(k => { if (modules.indexOf(k.module) === -1) modules.push(k.module); });
    const fieldSections = modules.map(m => {
      const list = H.fieldKeywords.filter(k => k.module === m);
      return `
      <div class="kw-subgroup">
        <h4 class="kw-subhead">${escapeHtml(list[0].moduleName)}</h4>
        <div class="chips">${list.map(k => chip('field', k)).join('')}</div>
      </div>`;
    }).join('');
    keywordGroups.innerHTML = `
      <section class="kw-section kw-value" aria-labelledby="kw-value-title">
        <div class="kw-section-head">
          <h3 id="kw-value-title">大事にしたい価値観</h3>
          <span class="kw-limit" id="countValue"></span>
        </div>
        <p class="kw-note">分野にかかわらず、あなたが大切にしていることに近い言葉を選んでください。<br>
          1回押すと<span class="tier-tag tier-sub">大事</span>（${L.valueSub}つまで）、もう1回押すと<span class="tier-tag tier-top">★いちばん大事</span>（${L.valueTop}つまで）、もう1回で解除です。</p>
        <p class="kw-msg" id="kwMsg" role="status" aria-live="polite"></p>
        ${valueSections}
      </section>
      <section class="kw-section kw-field" aria-labelledby="kw-field-title">
        <div class="kw-section-head">
          <h3 id="kw-field-title">気になる分野</h3>
          <span class="kw-limit" id="countField"></span>
        </div>
        <p class="kw-note">学部の8つのモジュールごとに、4つずつ並んでいます。${L.field}つまで選べます。</p>
        <div class="kw-field-grid">${fieldSections}</div>
      </section>`;
    keywordGroups.querySelectorAll('.chip').forEach(button => {
      button.addEventListener('click', () => toggle(button.dataset.type, button.dataset.name));
    });
  }

  function chip(type, k) {
    return `<button type="button" class="chip chip-${type}" data-type="${type}" data-name="${escapeAttr(k.keyword)}"
      title="${escapeAttr(k.description)}" aria-label="${escapeAttr(k.keyword)}">
      <span class="chip-tier" aria-hidden="true"></span>
      <span class="chip-name">#${escapeHtml(k.keyword)}</span>
      <span class="chip-desc">${escapeHtml(k.description)}</span>
    </button>`;
  }

  function say(msg) {
    const el = document.getElementById('kwMsg');
    if (!el) return;
    el.textContent = msg || '';
    clearTimeout(say.t);
    if (msg) say.t = setTimeout(() => { el.textContent = ''; }, 3500);
  }

  function toggle(type, name) {
    if (type === 'field') {
      if (picked.field.has(name)) picked.field.delete(name);
      else if (picked.field.size < L.field) { picked.field.add(name); say(''); }
      else say('分野は' + L.field + 'つまでです。ほかの分野を押して解除してから選んでください。');
    } else if (picked.top.has(name)) {                    // いちばん大事 → 解除
      picked.top.delete(name);
      say('');
    } else if (picked.sub.has(name)) {                    // 大事 → いちばん大事（空きがなければ解除）
      picked.sub.delete(name);
      if (picked.top.size < L.valueTop) { picked.top.add(name); say(''); }
      else say('「いちばん大事」は' + L.valueTop + 'つまでです。ほかの「いちばん大事」を押して解除してから選んでください。');
    } else {                                              // 未選択 → 大事
      if (picked.sub.size < L.valueSub) { picked.sub.add(name); say(''); }
      else say('「大事」は' + L.valueSub + 'つまでです。「大事」の中で特に大切なものをもう1回押して「いちばん大事」にするか、どれかを解除してから選んでください。');
    }
    updateUrl();
    renderState();
  }

  function tierOf(type, name) {
    if (type === 'field') return picked.field.has(name) ? 'field' : '';
    return picked.top.has(name) ? 'top' : picked.sub.has(name) ? 'sub' : '';
  }

  function selectedItems() {
    const out = [];
    const add = (set, tier) => set.forEach(n => { const e = byName[norm(n)]; if (e) out.push(Object.assign({ type: e.type, tier: tier }, e.item)); });
    add(picked.top, 'top'); add(picked.sub, 'sub'); add(picked.field, 'field');
    return out;
  }

  function renderState() {
    const total = picked.top.size + picked.sub.size + picked.field.size;
    count.textContent = `${total}`;
    const cv = document.getElementById('countValue');
    if (cv) cv.textContent = `いちばん大事 ${picked.top.size}/${L.valueTop}・大事 ${picked.sub.size}/${L.valueSub}`;
    const cf = document.getElementById('countField');
    if (cf) cf.textContent = `${picked.field.size}/${L.field}`;
    const items = selectedItems();
    selectedList.innerHTML = items.map(item => `
      <span class="selected-pill pill-${item.tier}">${item.tier === 'top' ? '★いちばん大事' : item.tier === 'sub' ? '大事' : '分野'}｜#${escapeHtml(item.keyword)}</span>`).join('');
    const valueFull = picked.top.size >= L.valueTop && picked.sub.size >= L.valueSub;
    document.querySelectorAll('.chip').forEach(button => {
      const tier = tierOf(button.dataset.type, button.dataset.name);
      const full = button.dataset.type === 'field' ? picked.field.size >= L.field : valueFull;
      button.classList.toggle('is-selected', Boolean(tier));
      button.classList.toggle('tier-top', tier === 'top');
      button.classList.toggle('tier-sub', tier === 'sub');
      button.classList.toggle('is-disabled', !tier && full);
      button.setAttribute('aria-pressed', String(Boolean(tier)));
      const tag = button.querySelector('.chip-tier');
      if (tag) tag.textContent = tier === 'top' ? '★いちばん大事' : tier === 'sub' ? '大事' : '';
      button.setAttribute('aria-label', button.dataset.name + (tier === 'top' ? '（いちばん大事）' : tier === 'sub' ? '（大事）' : tier ? '（選択中）' : ''));
    });
    printButton.disabled = shareButton.disabled = copyTextButton.disabled = total === 0;
    renderResults(items);
  }

  function factor(item) { return item.tier === 'sub' ? SUBW : 1; }

  function score(items) {
    const scores = {}, from = {};
    items.forEach(item => {
      Object.entries(item.weights || {}).forEach(([code, w]) => {
        const v = Number(w || 0) * factor(item);
        scores[code] = (scores[code] || 0) + v;
        (from[code] = from[code] || []).push({ item, w: v });
      });
    });
    const max = Math.max(1, ...Object.values(scores));
    return appData.areas
      .map(area => ({
        area, score: scores[area.areaCode] || 0,
        match: Math.round(((scores[area.areaCode] || 0) / max) * 100),
        from: (from[area.areaCode] || []).sort((a, b) => b.w - a.w),
        lessons: appData.lessons.filter(l => l.areaCode === area.areaCode).slice(0, 3),
      }))
      .filter(e => e.score > 0)
      .sort((a, b) => b.score - a.score || a.area.name.localeCompare(b.area.name, 'ja'))
      .slice(0, 3);
  }

  function renderResults(items) {
    if (!items.length) {
      lastScored = [];
      results.className = 'empty';
      results.innerHTML = '価値観と分野のキーワードを選ぶと、ここに近いモジュールが表示されます。';
      updatePlannerLink();
      return;
    }
    lastScored = score(items);
    results.className = 'result-list';
    const tops = items.filter(i => i.tier === 'top');
    const subs = items.filter(i => i.tier === 'sub');
    const persp = (tops.length || subs.length) ? `
      <section class="perspective-box">
        <h3>あなたが選んだ価値観は、こんなふうに分野とつながります</h3>
        ${tops.map(v => `<p><strong>★#${escapeHtml(v.keyword)}</strong>　${escapeHtml(v.perspective || '')}</p>`).join('')}
        ${subs.length ? `<p class="persp-sub">大事にしていること：${subs.map(v => '#' + escapeHtml(v.keyword)).join('　')}</p>` : ''}
      </section>` : '';
    results.innerHTML = persp + lastScored.map((e, i) => card(e, i)).join('');
    updatePlannerLink();
  }

  function pillLabel(item) { return (item.tier === 'top' ? '★' : '') + '#' + item.keyword; }

  function card(entry, index) {
    const area = entry.area;
    const style = `style="--accent: ${escapeCssToken(area.color || '#334155')}"`;
    const group = H.moduleGroups[area.areaCode] || '';
    return `
      <article class="result-card" ${style}>
        <div class="result-top">
          <div class="result-title-row">
            <span class="rank">${index + 1}</span>
            <div>
              <h3 class="area-name"><span class="module-prefix">モジュール：</span>${escapeHtml(area.name)}${group ? `<span class="group-badge">${escapeHtml(group)}</span>` : ''}</h3>
              <p class="subtitle">${escapeHtml(area.subtitle || '')}</p>
            </div>
          </div>
          <span class="match">つながりの強さ ${entry.match}%</span>
        </div>
        <div class="linked">
          <strong>つながったキーワード</strong>
          <span>${entry.from.map(f => `<span class="linked-pill pill-${f.item.tier}">${escapeHtml(pillLabel(f.item))}</span>`).join('')}</span>
        </div>
        <p class="description">${escapeHtml(area.description || '')}</p>
        <div class="question"><span>関連する問い</span><p>${escapeHtml(area.question || '')}</p></div>
        <div class="meta">
          <div class="meta-row">
            <strong>授業例</strong>
            <ul class="lesson-list">
              ${entry.lessons.map(l => `<li><span class="lesson-name">${escapeHtml(l.name)}</span>
                <span class="lesson-detail">${escapeHtml([l.year, l.term, l.description].filter(Boolean).join(' / '))}</span></li>`).join('')}
            </ul>
          </div>
        </div>
      </article>`;
  }

  function updatePlannerLink() {
    const codes = lastScored.map(e => e.area.areaCode);
    if (!codes.length) { plannerLink.removeAttribute('href'); plannerLink.classList.add('is-disabled'); plannerLink.setAttribute('aria-disabled', 'true'); return; }
    plannerLink.href = new URL('planner/?m=' + encodeURIComponent(codes.join(',')), SITE_ROOT).href;
    plannerLink.classList.remove('is-disabled'); plannerLink.removeAttribute('aria-disabled');
  }

  function splitNames(raw) {
    return String(raw || '').split(/[,、，#]/).map(s => s.trim()).filter(Boolean);
  }
  function initFromUrl() {
    const params = new URLSearchParams(window.location.search);
    let hash = '';
    try { hash = decodeURIComponent(window.location.hash.replace(/^#/, '')); } catch (e) { hash = window.location.hash.replace(/^#/, ''); }
    const addValue = (name, prefer) => {
      if (picked.top.has(name) || picked.sub.has(name)) return;
      const order = prefer === 'sub' ? ['sub', 'top'] : ['top', 'sub'];
      for (const t of order) {
        const lim = t === 'top' ? L.valueTop : L.valueSub;
        if (picked[t].size < lim) { picked[t].add(name); return; }
      }
    };
    const take = (raw, prefer) => splitNames(raw).forEach(n => {
      const e = byName[norm(n)];
      if (!e) return;
      if (e.type === 'field') { if (picked.field.size < L.field) picked.field.add(e.item.keyword); }
      else addValue(e.item.keyword, prefer);
    });
    take(params.get('v1'), 'top');
    take(params.get('v2'), 'sub');
    take(params.get('f'), 'top');
    // 種類をまとめて書いた形（kw=…）や、「#」付きでハッシュになってしまった分も読む
    take((params.get('kw') || '') + (hash ? ',' + hash : ''), 'top');
  }

  function buildResultUrl() {
    const url = new URL(window.location.href);
    url.search = ''; url.hash = '';
    if (!window.HLWS_ONLY) url.searchParams.set('mode', 'hlws');
    if (picked.top.size) url.searchParams.set('v1', Array.from(picked.top).join(','));
    if (picked.sub.size) url.searchParams.set('v2', Array.from(picked.sub).join(','));
    if (picked.field.size) url.searchParams.set('f', Array.from(picked.field).join(','));
    return url.toString();
  }

  function updateUrl() { if (history.replaceState) history.replaceState(null, '', buildResultUrl()); }

  function buildResultText() {
    const j = set => Array.from(set).join('、') || '（なし）';
    const lines = ['【キーワード診断の結果】',
      'いちばん大事な価値観：' + j(picked.top),
      '大事な価値観：' + j(picked.sub),
      '気になる分野：' + j(picked.field),
      '近いモジュール：'];
    lastScored.forEach((e, i) => {
      lines.push(`　${i + 1}. ${e.area.name}（${H.moduleGroups[e.area.areaCode] || ''}）…つながったキーワード：${e.from.map(x => pillLabel(x.item).replace('#', '')).join('、')}`);
    });
    lines.push('結果のリンク：' + buildResultUrl());
    return lines.join('\n');
  }

  async function copy(text, button, label) {
    try { await navigator.clipboard.writeText(text); button.textContent = 'コピー済み'; setTimeout(() => { button.textContent = label; }, 1400); }
    catch (error) { prompt('この内容をコピーしてください', text); }
  }

  function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, '&#096;'); }
  function escapeCssToken(value) { return String(value).replace(/[^#(),.% a-zA-Z0-9-]/g, ''); }
}
