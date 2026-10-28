const SECTORS = [['technology','Technology'],['finance','Finance'],['crypto','Crypto'],['gaming','Gaming'],['music','Music'],['sports','Sports'],['science','Science'],['health','Health'],['business','Business'],['world','World News']];
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
const state = { q: '', sector: '' };
let ctl;

const params = new URLSearchParams(location.search);
state.q = (params.get('q') || '').slice(0, 100);
state.sector = SECTORS.some(([k]) => k === params.get('sector')) ? params.get('sector') : '';
$('q').value = state.q;

const chips = SECTORS.map(([key, label]) => {
  const b = el('button', 'chip', label);
  b.type = 'button';
  b.addEventListener('click', () => { state.sector = state.sector === key ? '' : key; load(); });
  $('sectors').append(b);
  return [key, b];
});

$('search').addEventListener('submit', (e) => { e.preventDefault(); state.q = $('q').value.trim(); load(); });
$('clear').addEventListener('click', () => { state.q = ''; state.sector = ''; $('q').value = ''; load(); });

function timeAgo(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (mins < 60) return rtf.format(-Math.max(mins, 0), 'minute');
  if (mins < 1440) return rtf.format(-Math.round(mins / 60), 'hour');
  if (mins < 10080) return rtf.format(-Math.round(mins / 1440), 'day');
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}

function message(title, text, action) {
  const d = el('div', 'state');
  d.append(el('h3', '', title));
  const p = el('p'); p.append(...text); d.append(p);
  if (action) { const b = el('button', '', action[0]); b.type = 'button'; b.addEventListener('click', action[1]); d.append(b); }
  $('results').replaceChildren(d);
}

function card(a) {
  const link = el('a', 'card');
  link.href = a.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', `${a.title} (${a.publisher}, opens in a new tab)`);
  const thumb = el('div', 'thumb');
  if (a.image) {
    const img = el('img', 'thumb'); img.src = a.image; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.remove());
    thumb.append(img);
  }
  const body = el('div', 'body');
  const meta = el('div', 'meta');
  meta.append(el('span', 'tag', a.sector), el('span', '', a.publisher));
  if (a.publishedAt) { const t = el('time', '', timeAgo(a.publishedAt)); t.dateTime = a.publishedAt; meta.append(t); }
  body.append(meta, el('h3', '', a.title));
  if (a.summary) body.append(el('p', '', a.summary));
  body.append(el('span', 'read', `Read at ${a.publisher} ↗`));
  link.append(thumb, body);
  return link;
}

async function load() {
  ctl?.abort(); ctl = new AbortController();
  const label = SECTORS.find(([k]) => k === state.sector)?.[1];
  chips.forEach(([k, b]) => b.setAttribute('aria-pressed', String(k === state.sector)));
  const heading = state.q ? `Results for “${state.q}”${label ? ` in ${label}` : ''}` : label ? `Latest in ${label}` : 'Top stories';
  $('heading').textContent = heading;
  $('clear').hidden = !state.q && !state.sector;
  document.title = `${heading} | Daybreak`;
  const qs = new URLSearchParams(); if (state.q) qs.set('q', state.q); if (state.sector) qs.set('sector', state.sector);
  history.replaceState(null, '', qs.size ? `?${qs}` : location.pathname);

  const skel = el('div', 'grid');
  for (let i = 0; i < 6; i++) skel.append(el('div', 'skel'));
  $('results').replaceChildren(skel);
  $('results').setAttribute('aria-busy', 'true');
  try {
    const res = await fetch(`/api/news?${qs}`, { signal: ctl.signal });
    const data = await res.json().catch(() => ({}));
    if (data.error === 'missing_key') return message('News source not configured', ['Add a ', el('code', '', 'GNEWS_API_KEY'), ' to your ', el('code', '', '.env'), ' file and restart the server. See the README.']);
    if (data.error === 'rate_limited') return message('Too many searches', ['Wait a minute and try again.'], ['Try again', load]);
    if (!res.ok) throw new Error(data.error);
    if (!data.articles.length) return message('No stories found', [state.q ? `Nothing matched “${state.q}”${label ? ` in ${label}` : ''}. Try different words or another sector.` : 'No stories right now. Try another sector.'], state.q ? ['Clear search', () => { state.q = ''; $('q').value = ''; load(); }] : null);
    const grid = el('div', 'grid');
    data.articles.forEach((a) => grid.append(card(a)));
    $('results').replaceChildren(grid);
  } catch (e) {
    if (e.name !== 'AbortError') message('Couldn’t load stories', ['The news source is unavailable right now. Check your connection and try again.'], ['Try again', load]);
  } finally {
    $('results').removeAttribute('aria-busy');
  }
}
load();
