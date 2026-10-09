/* AutoScript Agent — front-end */
(() => {
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const FEATURES = [
    { name: 'Page Object Model / Screenplay', types: ['ui', 'ui-bdd', 'ui-api', 'mobile', 'codeless'], rec: true },
    { name: 'BDD feature files (Gherkin)', types: ['ui', 'ui-bdd', 'api', 'api-bdd', 'ui-api'] },
    { name: 'Data-driven tests (CSV / JSON / Excel)', types: '*', rec: true },
    { name: 'Environment config (dev / qa / prod)', types: '*', rec: true },
    { name: 'Parallel execution', types: '*', rec: true },
    { name: 'Cross-browser (Chrome, Firefox, Edge, WebKit)', types: ['ui', 'ui-bdd', 'ui-api'] },
    { name: 'Headless mode toggle', types: ['ui', 'ui-bdd', 'ui-api'] },
    { name: 'Android + iOS capabilities', types: ['mobile'], rec: true },
    { name: 'Real-device cloud (BrowserStack / Sauce Labs / LambdaTest)', types: ['ui', 'ui-bdd', 'ui-api', 'mobile'] },
    { name: 'Selenium Grid / Docker Compose', types: ['ui', 'ui-bdd'] },
    { name: 'Allure reporting', types: '*', rec: true },
    { name: 'Extent / HTML reports', types: '*' },
    { name: 'Screenshots / video / trace on failure', types: ['ui', 'ui-bdd', 'ui-api', 'mobile'], rec: true },
    { name: 'Retry flaky tests', types: '*' },
    { name: 'Structured logging', types: '*', rec: true },
    { name: 'API auth (OAuth2 / JWT / API key)', types: ['api', 'api-bdd', 'ui-api', 'perf', 'security'] },
    { name: 'JSON schema validation', types: ['api', 'api-bdd', 'ui-api'], rec: true },
    { name: 'Request/response POJOs / models', types: ['api', 'api-bdd', 'ui-api'] },
    { name: 'Test data generation (Faker)', types: '*' },
    { name: 'Database validation (JDBC / SQL)', types: ['ui', 'ui-bdd', 'api', 'api-bdd', 'ui-api'] },
    { name: 'Accessibility checks (axe-core)', types: ['ui', 'ui-bdd', 'ui-api'] },
    { name: 'Visual regression snapshots', types: ['ui', 'ui-bdd', 'ui-api'] },
    { name: 'Load profile: ramp-up / spike / soak', types: ['perf'], rec: true },
    { name: 'SLA thresholds (p95, error rate)', types: ['perf'], rec: true },
    { name: 'Grafana / InfluxDB / Prometheus output', types: ['perf'] },
    { name: 'Baseline + full active scan', types: ['security'], rec: true },
    { name: 'Authenticated scanning', types: ['security'] },
    { name: 'GitHub Actions pipeline', types: '*', rec: true },
    { name: 'Jenkinsfile', types: '*' },
    { name: 'GitLab CI', types: '*' },
    { name: 'Azure DevOps pipeline', types: '*' },
    { name: 'Dockerfile to run tests', types: '*' },
    { name: 'Slack / Teams notifications', types: '*' },
    { name: 'Tagging & suites (smoke / regression)', types: '*', rec: true }
  ];

  const state = { stacks: [], index: {}, files: new Map(), order: [], active: null, history: [], busy: false, lastStop: null, controller: null };

  // ---------- Init ----------
  async function init() {
    const [stacks, cfg] = await Promise.all([fetch('/api/stacks').then(r => r.json()), fetch('/api/config').then(r => r.json())]);
    state.stacks = stacks;
    $('.brand p').textContent = `AI test-automation framework generator · ${stacks.reduce((a, g) => a + g.items.length, 0)} stacks · ${cfg.provider} / ${cfg.model}`;
    stacks.forEach(g => g.items.forEach(i => (state.index[i.id] = { ...i, group: g.group })));
    if (cfg.passwordRequired) { $('#pwWrap').classList.remove('hidden'); try { $('#pw').value = localStorage.getItem('as_pw') || ''; } catch {} }
    renderStackOptions('');
    let saved = null; try { saved = localStorage.getItem('as_stack'); } catch {}
    $('#stack').value = saved && state.index[saved] ? saved : 'ts-playwright';
    onStackChange(true);
    bind();
  }

  function renderStackOptions(filter) {
    const sel = $('#stack'); const cur = sel.value; sel.innerHTML = '';
    const f = filter.trim().toLowerCase(); let n = 0;
    state.stacks.forEach(g => {
      const items = g.items.filter(i => !f || i.label.toLowerCase().includes(f) || g.group.toLowerCase().includes(f));
      if (!items.length) return;
      const og = el('optgroup'); og.label = g.group;
      items.forEach(i => { n++; const o = el('option'); o.value = i.id; o.textContent = `${n}. ${i.label}${i.added ? '  ★ new' : ''}`; og.appendChild(o); });
      sel.appendChild(og);
    });
    if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
  }

  function onStackChange(applyRecommended) {
    const s = state.index[$('#stack').value]; if (!s) return;
    try { localStorage.setItem('as_stack', s.id); } catch {}
    const typeName = { ui: 'UI', 'ui-bdd': 'UI · BDD', 'ui-api': 'UI + API', api: 'API', 'api-bdd': 'API · BDD', mobile: 'Mobile', perf: 'Performance', security: 'Security', codeless: 'Low-code' }[s.type] || s.type;
    $('#stackInfo').innerHTML = `<span class="tag">${esc(s.group)}</span><span class="tag">${typeName}</span><span class="tag">${esc(s.build)}</span>${s.added ? '<span class="tag new">★ added</span>' : ''}`;
    renderFeatures(s, applyRecommended);
  }

  function renderFeatures(stack, applyRecommended) {
    const prev = new Set([...document.querySelectorAll('#features input:checked')].map(i => i.value));
    const box = $('#features'); box.innerHTML = '';
    FEATURES.filter(f => f.types === '*' || f.types.includes(stack.type)).forEach(f => {
      const lab = el('label', 'chip'); const cb = el('input'); cb.type = 'checkbox'; cb.value = f.name;
      cb.checked = applyRecommended ? !!f.rec : prev.has(f.name) || (!prev.size && !!f.rec);
      lab.classList.toggle('on', cb.checked);
      cb.addEventListener('change', () => { lab.classList.toggle('on', cb.checked); countFeatures(); });
      lab.append(cb, document.createTextNode(f.name)); box.appendChild(lab);
    });
    countFeatures();
  }
  const countFeatures = () => { $('#featCount').textContent = `(${document.querySelectorAll('#features input:checked').length} selected)`; };
  const setAll = (fn) => { document.querySelectorAll('#features input').forEach(cb => { cb.checked = fn(cb.value); cb.parentElement.classList.toggle('on', cb.checked); }); countFeatures(); };

  function bind() {
    $('#stackFilter').addEventListener('input', (e) => { renderStackOptions(e.target.value); if ($('#stack').value) onStackChange(false); });
    $('#stack').addEventListener('change', () => onStackChange(true));
    $('#featAll').onclick = () => setAll(() => true);
    $('#featNone').onclick = () => setAll(() => false);
    $('#featRec').onclick = () => setAll(v => !!FEATURES.find(f => f.name === v)?.rec);
    $('#pw').addEventListener('change', e => { try { localStorage.setItem('as_pw', e.target.value); } catch {} });
    $('#genBtn').onclick = generate;
    $('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); sendChat(); });
    $('#chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });
    $('#zipBtn').onclick = downloadZip;
    $('#copyBtn').onclick = () => { const f = state.files.get(state.active); if (f) navigator.clipboard.writeText(f).then(() => toastStatus('Copied ' + state.active)); };
    $('#newBtn').onclick = () => { if (state.busy) state.controller?.abort(); state.files.clear(); state.order = []; state.active = null; state.history = []; renderTree(); showFile(null); $('#messages').innerHTML = ''; addMsg('agent', 'New project started. Configure on the left and hit <b>Generate</b>.'); setChatEnabled(false); $('#zipBtn').disabled = true; };
  }

  // ---------- Generation ----------
  async function generate() {
    const description = $('#desc').value.trim();
    if (description.length < 10) { $('#desc').focus(); return addMsg('agent', '<span class="status err">Please describe what to automate first.</span>'); }
    if (state.history.length && !confirm('Start a fresh project? Current files will be replaced.')) return;
    state.files.clear(); state.order = []; state.active = null; state.history = []; renderTree(); showFile(null);
    const s = state.index[$('#stack').value];
    const features = [...document.querySelectorAll('#features input:checked')].map(i => i.value);
    addMsg('user', esc(`Generate a ${s.label} framework.\n\n${description}`).replace(/\n/g, '<br>') + (features.length ? `<div class="status">${features.length} features selected</div>` : ''));
    await run({ stackId: s.id, description, features, appUrl: $('#url').value.trim(), extra: $('#extra').value.trim() }, null);
  }

  async function sendChat(textOverride) {
    const text = (textOverride || $('#chatInput').value).trim();
    if (!text || state.busy) return;
    $('#chatInput').value = '';
    addMsg('user', esc(text).replace(/\n/g, '<br>'));
    await run({ stackId: $('#stack').value, history: state.history, message: text, files: Object.fromEntries(state.files) }, text);
  }

  async function run(body, userText) {
    state.busy = true; setBusy(true);
    const bubble = addMsg('agent', '<span class="status typing">Thinking</span>');
    let full = ''; let firstUserMessage = null; let failed = false;
    state.controller = new AbortController();
    try {
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-app-password': $('#pw').value }, body: JSON.stringify(body), signal: state.controller.signal });
      if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `HTTP ${res.status}`); }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      let lastRender = 0;
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const ev = /^event: (.+)$/m.exec(chunk)?.[1]; const dataLine = /^data: (.+)$/m.exec(chunk)?.[1];
          if (!ev || !dataLine) continue;
          const data = JSON.parse(dataLine);
          if (ev === 'delta') { full += data.text; if (performance.now() - lastRender > 120) { applyStream(full, bubble, true); lastRender = performance.now(); } }
          else if (ev === 'done') { firstUserMessage = data.firstUserMessage; state.lastStop = data.stop_reason; }
          else if (ev === 'error') throw new Error(data.error);
        }
      }
      applyStream(full, bubble, false);
    } catch (e) {
      failed = true;
      if (e.name === 'AbortError') return;
      bubble.innerHTML += `<div class="status err">⚠ ${esc(e.message)}</div>`;
    } finally {
      state.busy = false; setBusy(false);
    }
    if (!failed && full) {
      state.history.push({ role: 'user', content: firstUserMessage || userText }, { role: 'assistant', content: compactForHistory(full) });
      setChatEnabled(true);
      if (state.lastStop === 'max_tokens') {
        const b = el('button', 'ghost small', '↪ Continue generating'); b.onclick = () => { b.remove(); sendChat('You were cut off. Continue exactly where you left off: re-emit the last incomplete file in full, then the remaining files and the "How to run" section.'); };
        bubble.appendChild(b);
      }
    }
  }

  // Keep history small: replace file bodies with a short marker (files live in the UI; the model only needs the summary + current file list)
  function compactForHistory(text) {
    return text.replace(/<<<FILE:\s*(.+?)>>>\n[\s\S]*?(<<<END FILE>>>|$)/g, (_m, p) => `[file ${p.trim()} written]`) +
      `\n\nProject files so far:\n${state.order.map(p => `- ${p}`).join('\n')}`;
  }

  const FILE_RE = /<<<FILE:\s*(.+?)>>>\r?\n([\s\S]*?)(<<<END FILE>>>|$)/g;
  function applyStream(text, bubble, streaming) {
    let writing = null; let m;
    FILE_RE.lastIndex = 0;
    while ((m = FILE_RE.exec(text))) {
      const p = m[1].trim().replace(/^\.?\//, ''); const content = m[2].replace(/\r?\n$/, '');
      const isNew = !state.files.has(p);
      state.files.set(p, content);
      if (isNew) { state.order.push(p); state.order.sort(); }
      if (!m[3]) writing = p;
      if (m.index === FILE_RE.lastIndex) FILE_RE.lastIndex++;
    }
    const prose = text.replace(FILE_RE, (_x, p) => `\n@@FILE ${p.trim()}@@\n`);
    bubble.innerHTML = md(prose) + (streaming ? '<span class="status typing">' + (writing ? ` writing ${esc(writing)}` : '') + '</span>' : '');
    bubble.querySelectorAll('.filechip').forEach(c => (c.onclick = () => showFile(c.dataset.path)));
    renderTree(writing);
    if (writing && (!state.active || state.active === writing || streaming)) showFile(writing, true);
    else if (!streaming && !state.active && state.order.length) showFile(state.order.includes('README.md') ? 'README.md' : state.order[0]);
    else if (!streaming && state.active) showFile(state.active);
    $('#zipBtn').disabled = !state.files.size;
    $('#fileCount').textContent = state.files.size ? `(${state.files.size})` : '';
    scrollChat();
  }

  // ---------- Tiny markdown ----------
  function md(src) {
    const blocks = []; src = src.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _l, code) => { blocks.push(code); return `\u0000${blocks.length - 1}\u0000`; });
    let html = esc(src.trim())
      .replace(/^@@FILE (.+?)@@$/gm, (_m, p) => `<span class="filechip" data-path="${p}">📄 ${p}</span>`)
      .replace(/^### (.+)$/gm, '<h4>$1</h4>').replace(/^## (.+)$/gm, '<h3>$1</h3>').replace(/^# (.+)$/gm, '<h3>$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>').replace(/^\s*\d+\. (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
      .replace(/(<\/span>)\n+(?=<span class="filechip")/g, '$1')
      .replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>')
      .replace(/<br>(<\/?(ul|li|h3|h4))/g, '$1').replace(/(<\/(ul|li|h3|h4)>)<br>/g, '$1');
    return html.replace(/\u0000(\d+)\u0000/g, (_m, i) => `<pre><code>${esc(blocks[i])}</code></pre>`);
  }

  // ---------- Files UI ----------
  function renderTree(writing) {
    const tree = $('#tree');
    if (!state.order.length) { tree.innerHTML = '<p class="empty">Files appear here as the agent writes them.</p>'; return; }
    tree.innerHTML = ''; let lastDirs = [];
    state.order.forEach(p => {
      const parts = p.split('/'); const dirs = parts.slice(0, -1);
      dirs.forEach((d, i) => { if (lastDirs[i] !== d) { tree.appendChild(el('div', 'dir', `${'&nbsp;&nbsp;'.repeat(i)}▾ ${esc(d)}/`)); lastDirs = dirs.slice(0, i + 1); } });
      lastDirs = dirs;
      const f = el('div', 'file' + (p === state.active ? ' active' : '') + (p === writing ? ' writing' : ''), `${'&nbsp;&nbsp;'.repeat(dirs.length)}${esc(parts.at(-1))}`);
      f.title = p; f.onclick = () => showFile(p); tree.appendChild(f);
    });
  }

  const LANG = { java: 'java', kt: 'kotlin', kts: 'kotlin', ts: 'typescript', tsx: 'typescript', js: 'javascript', mjs: 'javascript', cjs: 'javascript', py: 'python', cs: 'csharp', csproj: 'xml', xml: 'xml', jmx: 'xml', json: 'json', yml: 'yaml', yaml: 'yaml', md: 'markdown', feature: 'gherkin', gradle: 'groovy', groovy: 'groovy', vbs: 'vbscript', scala: 'scala', swift: 'swift', properties: 'properties', toml: 'ini', ini: 'ini', sh: 'bash', robot: 'plaintext', dockerfile: 'dockerfile' };
  function showFile(p, streaming) {
    state.active = p;
    const code = $('#code');
    if (!p || !state.files.has(p)) { $('#viewerPath').textContent = '—'; code.textContent = ''; $('#copyBtn').disabled = true; return; }
    $('#viewerPath').textContent = p; $('#copyBtn').disabled = false;
    const content = state.files.get(p);
    const name = p.split('/').pop().toLowerCase(); const ext = name === 'dockerfile' ? 'dockerfile' : name === 'jenkinsfile' ? 'groovy' : name.split('.').pop();
    const lang = LANG[ext];
    if (!streaming && window.hljs && lang && hljs.getLanguage(lang)) code.innerHTML = hljs.highlight(content, { language: lang }).value;
    else code.textContent = content;
    document.querySelectorAll('#tree .file').forEach(f => f.classList.toggle('active', f.title === p));
  }

  async function downloadZip() {
    const zip = new JSZip(); const s = state.index[$('#stack').value];
    const root = (s?.id || 'automation') + '-framework';
    state.files.forEach((c, p) => zip.file(`${root}/${p}`, c));
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = el('a'); a.href = URL.createObjectURL(blob); a.download = `${root}.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- Helpers ----------
  function addMsg(who, html) { const m = el('div', 'msg ' + who); const b = el('div', 'bubble', html); m.appendChild(b); $('#messages').appendChild(m); scrollChat(); return b; }
  function scrollChat() { const m = $('#messages'); if (m.scrollHeight - m.scrollTop - m.clientHeight < 200) m.scrollTop = m.scrollHeight; }
  function setBusy(b) { $('#genBtn').disabled = b; $('#sendBtn').disabled = b || !state.history.length; $('#genBtn').textContent = b ? '⏳ Generating…' : '⚡ Generate framework'; }
  function setChatEnabled(on) { $('#chatInput').disabled = !on; $('#sendBtn').disabled = !on; if (on) $('#chatInput').placeholder = 'Ask for changes… (Enter to send, Shift+Enter for new line)'; }
  function toastStatus(t) { const b = addMsg('agent', `<span class="status">${esc(t)}</span>`); setTimeout(() => b.parentElement.remove(), 1800); }

  init().catch(e => addMsg('agent', `<span class="status err">Failed to load: ${esc(e.message)}</span>`));
})();
