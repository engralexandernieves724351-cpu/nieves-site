// Nieves Site: face-scan attendance for the foreman, with owner review.
// Data: Supabase (database rules decide who sees what; the foreman never receives rates or pay).
(() => {
  'use strict';
  const SB_URL = 'https://uhykyuukszmsiivvrkyk.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoeWt5dXVrc3ptc2lpdnZya3lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMjYwMzksImV4cCI6MjEwODYwMjAzOX0.3TzeEmauwV9Tv-h7ZwQxrcIO9CRn49f77589uUoDu9I';
  const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const app = document.getElementById('app');

  // ---------- helpers ----------
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v);
    }
    kids.flat(Infinity).forEach((c) => c != null && c !== false && n.append(c));
    return n;
  };
  const toast = (msg) => { const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600); };
  const fmtPeso = (v) => '₱' + Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const manilaDate = (d = new Date()) => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 10);
  const today = () => manilaDate();
  const fmtDate = (d) => d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—';
  const shortDay = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }) : '—';
  const minsOf = (iso) => { const d = new Date(new Date(iso).getTime() + 8 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const dow = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
  const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
  const val = (id) => (document.getElementById(id)?.value || '').trim();
  const checked = (id) => !!document.getElementById(id)?.checked;
  const field = (id, label, input) => el('div', { class: 'field' }, el('label', { for: id, text: label }), input);
  const pesoInput = (id, value, req = true) => el('div', { class: 'peso' }, el('input', { id, type: 'number', inputmode: 'decimal', step: '0.01', min: '0', value: value ?? '', required: req ? '' : false }));
  const readAmount = (id) => { const v = document.getElementById(id)?.value ?? ''; const n = Number(v); return v === '' || !isFinite(n) || n < 0 ? null : r2(n); };
  const checkRow = (id, label, on) => el('label', { class: 'check-row', for: id }, el('input', { id, type: 'checkbox', checked: on ? '' : false }), el('span', { text: label }));
  const kv = (pairs) => el('dl', { class: 'kv' }, pairs.filter((p) => p[1] != null && p[1] !== '').map(([k, v]) => el('div', {}, el('dt', { text: k }), el('dd', { class: 'num', text: String(v) }))));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

  function openDialog(title, fields, { onSave, onDelete, saveLabel = 'Save', deleteLabel = 'Delete?', hideCancel = false }) {
    const err = el('p', { class: 'err', role: 'alert' });
    const shade = el('div', { class: 'shade' });
    const close = () => { shade.remove(); document.removeEventListener('keydown', esc); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    const saveBtn = el('button', { class: 'btn primary', type: 'submit', text: saveLabel });
    const actions = el('div', { class: 'actions' });
    let del = null;
    if (onDelete) {
      del = el('button', { class: 'btn danger', type: 'button', text: 'Delete' });
      del.addEventListener('click', () => actions.replaceChildren(el('span', { class: 'note', text: deleteLabel }),
        el('button', { class: 'btn danger', type: 'button', text: 'Yes, delete', onclick: async () => { try { await onDelete(); close(); } catch (e) { err.textContent = errText(e); } } }),
        el('button', { class: 'btn', type: 'button', text: 'Keep it', onclick: () => fill() })));
    }
    const fill = () => actions.replaceChildren(...[del, el('span', { class: 'spacer' }), hideCancel ? null : el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: close }), saveBtn].filter(Boolean));
    fill();
    const form = el('form', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, el('h2', { text: title }), fields, err, actions);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); err.textContent = ''; saveBtn.disabled = true;
      try { const msg = await onSave(); if (msg) err.textContent = msg; else close(); } catch (x) { err.textContent = errText(x); }
      saveBtn.disabled = false;
    });
    shade.addEventListener('click', (e) => { if (e.target === shade) close(); });
    document.addEventListener('keydown', esc);
    shade.append(form); document.body.append(shade);
    return { close };
  }
  function sheet(title, kids, buttons) {
    const shade = el('div', { class: 'shade' });
    const close = () => { shade.remove(); document.removeEventListener('keydown', esc); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    const box = el('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, el('h2', { text: title }), kids,
      buttons && buttons.length ? el('div', { class: 'actions' }, buttons.filter(Boolean).map((b) => el('button', { class: 'btn' + (b.primary ? ' primary' : ''), type: 'button', text: b.label, onclick: () => { close(); b.run && b.run(); } }))) : null);
    shade.addEventListener('click', (e) => { if (e.target === shade) close(); });
    document.addEventListener('keydown', esc);
    shade.append(box); document.body.append(shade);
    const f = box.querySelector('button.primary') || box.querySelector('button'); if (f) f.focus();
    return { close };
  }
  const busy = (msg) => sheet(msg, el('p', { class: 'muted', text: 'One moment…' }), []);
  const errText = (e) => {
    const m = (e && (e.message || e.error_description)) || '';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'No connection. Check the signal and try again.';
    if (/Only the owner/.test(m)) return 'Only the owner can change that.';
    if (/duplicate key|23505/.test(m) || e?.code === '23505') return 'Already recorded. Refresh and try again.';
    if (/row-level security|permission/i.test(m)) return 'Your account isn’t allowed to do that.';
    return m || 'Something went wrong. Try again.';
  };
  const must = ({ data, error }) => { if (error) throw error; return data; };

  // ---------- state ----------
  const S = { session: null, me: null, projects: [], pid: store.get('ns-project'), tab: 'today', attDate: null, payWeek: null,
    workers: [], rates: {}, att: [], pay: {}, holidays: [], people: [], members: [], urls: {}, loading: false, chan: null };
  const owner = () => S.me && S.me.role === 'owner';
  const project = () => S.projects.find((p) => p.id === S.pid) || null;

  // ---------- attendance rules ----------
  // 8:00–5:00, lunch 12–1. In by 8:05 on time; 8:06–10:29 minus 2 hrs; 10:30+ half day.
  // Out 5:00+ full; 3:00–4:59 minus 2 hrs; before 3:00 half day. No overtime. Sundays and holidays flagged.
  const WORK = { inGrace: 8 * 60 + 5, inHalf: 10 * 60 + 30, outFull: 17 * 60, outHalf: 15 * 60 };
  const DED = { ok: 0, late: 2, half: 4 };
  const MATCH_MAX = 0.5, MATCH_GAP = 0.04, SAME_FACE = 0.45, MIN_FACES = 3;
  const POSITIONS = ['Foreman', 'Mason', 'Carpenter', 'Steelman', 'Laborer', 'Helper', 'Painter', 'Electrician', 'Plumber', 'Welder', 'Tile setter'];
  const inStatus = (iso) => { const m = minsOf(iso); return m <= WORK.inGrace ? ['ok', 'On time'] : m < WORK.inHalf ? ['late', 'Late · minus 2 hrs'] : ['half', 'Half day · late']; };
  const outStatus = (iso) => { const m = minsOf(iso); return m >= WORK.outFull ? ['ok', 'Full day'] : m >= WORK.outHalf ? ['late', 'Undertime · minus 2 hrs'] : ['half', 'Half day · left early']; };
  const statusChip = ([k, label]) => el('span', { class: 'chip ' + (k === 'ok' ? 'ok' : k === 'late' ? 'late' : 'warn'), text: label });
  const isHoliday = (d) => S.holidays.find((h) => h.date === d) || null;
  const isOffDay = (d) => dow(d) === 0 || !!isHoliday(d);
  const activeWorkers = () => S.workers.filter((w) => w.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  const recOf = (wid, d = today()) => S.att.find((r) => r.worker_id === wid && r.date === d) || null;
  const workerOf = (wid, r) => S.workers.find((w) => w.id === wid) || { id: wid, name: (r && r.worker_name) || 'Removed worker', removed: true };
  const nextAction = (rec) => !rec || !rec.time_in ? 'in' : rec.time_out ? 'done' : (Date.now() - Date.parse(rec.time_in.at)) < 60 * 60000 ? 'recent' : 'out';
  function dayPay(w, r) {
    const rate = Number(S.rates[w.id] || 0), hourly = rate / 8;
    const res = { rate, hourly, inSt: null, outSt: null, dedHrs: 0, computed: 0, pay: 0, flags: [], override: null, review: false };
    if (!r || !r.time_in) return res;
    res.inSt = inStatus(r.time_in.at);
    if (r.time_in.method === 'manual') res.flags.push('Manual time in');
    if (r.time_out) { res.outSt = outStatus(r.time_out.at); if (r.time_out.method === 'manual') res.flags.push('Manual time out'); } else res.flags.push('No time out');
    if (dow(r.date) === 0) res.flags.push('Sunday');
    const h = isHoliday(r.date); if (h) res.flags.push('Holiday' + (h.name ? ': ' + h.name : ''));
    if (!rate) res.flags.push('No daily rate');
    res.dedHrs = DED[res.inSt[0]] + (res.outSt ? DED[res.outSt[0]] : 0);
    res.computed = r.time_out ? Math.max(0, r2(rate - hourly * res.dedHrs)) : 0;
    if (r.time_out && rate && res.computed <= 0) res.flags.push('₱0 day');
    res.pay = res.computed;
    const ov = S.pay[r.id]; if (ov) { res.override = ov; res.pay = Number(ov.amount); }
    res.review = res.flags.length > 0 && !res.override;
    return res;
  }

  // ---------- photos (private storage, signed links) ----------
  async function signUrls(paths) {
    const need = [...new Set(paths.filter((p) => p && !S.urls[p]))];
    if (!need.length) return;
    const { data } = await sb.storage.from('site').createSignedUrls(need, 3600);
    (data || []).forEach((x) => { if (x.signedUrl) S.urls[x.path] = x.signedUrl; });
  }
  const photo = (p) => (p && S.urls[p]) || null;
  const toBlob = (c) => new Promise((res) => c.toBlob(res, 'image/jpeg', 0.78));
  async function savePhoto(canvas, path) {
    try { const b = await toBlob(canvas); const { error } = await sb.storage.from('site').upload(path, b, { contentType: 'image/jpeg', upsert: false }); if (error) throw error; S.urls[path] = canvas.toDataURL('image/jpeg', 0.7); return path; }
    catch (e) { return null; }
  }

  // ---------- face engine (loaded on first use, cached by the app) ----------
  let faceapi = null, faceLoading = null;
  function loadFace() {
    if (faceapi) return Promise.resolve(faceapi);
    if (faceLoading) return faceLoading;
    faceLoading = (async () => {
      if (!window.faceapi) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/face/face-api.js'; s.onload = res; s.onerror = () => rej(new Error('script')); document.head.append(s); });
      const f = window.faceapi;
      try { await f.tf.setBackend('webgl'); } catch (e) {}
      await f.tf.ready();
      await Promise.all([f.nets.ssdMobilenetv1.loadFromUri('/face/model'), f.nets.faceLandmark68Net.loadFromUri('/face/model'), f.nets.faceRecognitionNet.loadFromUri('/face/model')]);
      faceapi = f; render(); return f;
    })();
    faceLoading.catch(() => { faceLoading = null; render(); });
    return faceLoading;
  }
  function takePhoto(front) {
    return new Promise((resolve) => {
      const inp = el('input', { type: 'file', accept: 'image/*', capture: front ? 'user' : 'environment', class: 'sr', 'aria-hidden': 'true', tabindex: '-1' });
      let done = false; const finish = (f) => { if (done) return; done = true; inp.remove(); resolve(f); };
      inp.addEventListener('change', () => finish((inp.files && inp.files[0]) || null));
      inp.addEventListener('cancel', () => finish(null));
      document.body.append(inp); inp.click();
    });
  }
  async function readFaces(file) {
    const f = await loadFace();
    let bmp; try { bmp = await createImageBitmap(file); } catch (e) { throw { code: 'image' }; }
    const scale = Math.min(1, 800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const faces = await f.detectAllFaces(c, new f.SsdMobilenetv1Options({ minConfidence: 0.5 })).withFaceLandmarks().withFaceDescriptors();
    faces.sort((a, b) => b.detection.box.area - a.detection.box.area);
    return { canvas: c, faces };
  }
  const faceError = (e) => e && e.code === 'image' ? 'This photo can’t be read. Use the phone camera (JPG), not a HEIC file.' : 'Face recognition couldn’t load. Check the signal and try again.';
  const vec = (d) => ({ v: Array.from(d, (x) => Math.round(x * 1e5) / 1e5) });
  const dist = (a, b) => faceapi.euclideanDistance(a, b);
  const minDist = (desc, w) => Math.min(...(w.faces || []).map((x) => dist(desc, x.v)));
  function bestMatch(desc, workers) {
    const scored = workers.filter((w) => w.faces && w.faces.length).map((w) => ({ w, d: minDist(desc, w) })).sort((a, b) => a.d - b.d);
    const [a, b] = scored;
    if (!a || a.d > MATCH_MAX) return { worker: null };
    if (b && b.d - a.d < MATCH_GAP) return { worker: null };
    return { worker: a.w, d: a.d };
  }
  const getGeo = () => new Promise((res) => {
    try {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition((p) => res({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) }), () => res(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
    } catch (e) { res(null); }
  });

  // ---------- data ----------
  async function loadMe() {
    const { data: { session } } = await sb.auth.getSession();
    S.session = session;
    if (!session) { S.me = null; return; }
    S.me = must(await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle());
    if (!S.me) return;
    S.projects = S.me.role === 'pending' ? [] : must(await sb.from('projects').select('*').order('id'));
    S.holidays = must(await sb.from('holidays').select('*').order('date'));
    if (!S.projects.some((p) => p.id === S.pid)) S.pid = S.projects.length === 1 ? S.projects[0].id : null;
  }
  async function loadProject() {
    if (!S.pid) return;
    const pid = S.pid, from = addDays(today(), -42);
    const [w, a] = await Promise.all([
      sb.from('workers').select('*').eq('project_id', pid).order('name'),
      sb.from('attendance').select('*').eq('project_id', pid).gte('date', from).order('date', { ascending: false }),
    ]);
    S.workers = must(w); S.att = must(a);
    if (owner()) {
      const ids = S.workers.map((x) => x.id), aids = S.att.map((x) => x.id);
      const rates = ids.length ? must(await sb.from('worker_rates').select('*').in('worker_id', ids)) : [];
      S.rates = Object.fromEntries(rates.map((r) => [r.worker_id, Number(r.daily_rate)]));
      const pays = [];
      for (let i = 0; i < aids.length; i += 150) pays.push(...must(await sb.from('attendance_pay').select('*').in('attendance_id', aids.slice(i, i + 150))));
      S.pay = Object.fromEntries(pays.map((p) => [p.attendance_id, p]));
    }
    await signUrls([...S.workers.map((x) => x.photo_path), ...S.att.filter((r) => r.date >= addDays(today(), -2)).flatMap((r) => [r.time_in?.photo, r.time_out?.photo])]);
  }
  async function loadPeople() {
    S.people = must(await sb.from('profiles').select('*').order('created_at'));
    S.members = must(await sb.from('project_members').select('*'));
  }
  let reloadT = null;
  const reload = () => { clearTimeout(reloadT); reloadT = setTimeout(async () => { try { await loadProject(); render(); } catch (e) {} }, 400); };
  function listen() {
    if (S.chan) { sb.removeChannel(S.chan); S.chan = null; }
    if (!S.pid) return;
    S.chan = sb.channel('site-' + S.pid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: 'project_id=eq.' + S.pid }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workers', filter: 'project_id=eq.' + S.pid }, reload)
      .subscribe();
  }
  async function pickProject(pid) {
    S.pid = pid; store.set('ns-project', pid || '');
    S.workers = []; S.att = []; S.rates = {}; S.pay = {};
    render();
    try { await loadProject(); } catch (e) { toast(errText(e)); }
    listen(); render();
  }

  // ---------- scanning ----------
  async function scanFace() {
    const pid = S.pid;
    const file = await takePhoto(false); if (!file) return;
    const geo = getGeo();
    const b = busy(faceapi ? 'Checking face…' : 'Loading face recognition…');
    let res; try { res = await readFaces(file); } catch (e) { b.close(); return sheet('Couldn’t check the face', el('p', { text: faceError(e) }), [{ label: 'Close' }, { label: 'Scan again', primary: true, run: scanFace }]); }
    b.close();
    if (!res.faces.length) return sheet('No face found', el('p', { text: 'Move closer and face the camera. Hard hat and sunglasses off, with light on the face.' }), [{ label: 'Close' }, { label: 'Scan again', primary: true, run: scanFace }]);
    const m = bestMatch(res.faces[0].descriptor, activeWorkers());
    if (!m.worker) return noMatch(pid, res.canvas, geo);
    confirmScan(pid, m.worker, res.canvas, { d: m.d, geo });
  }
  async function recordScan(pid, w, kind, canvas, extra) {
    const date = today(), at = new Date().toISOString();
    const [path, geo] = await Promise.all([savePhoto(canvas, pid + '/scans/' + date + '/' + uid() + '.jpg'), extra.geo]);
    const part = { at, photo: path, method: extra.manual ? 'manual' : 'face', match: extra.d != null ? Math.round(extra.d * 1000) / 1000 : null, reason: extra.reason || '', geo: geo || null };
    const cur = recOf(w.id, date);
    if (kind === 'in') must(await sb.from('attendance').insert({ project_id: pid, worker_id: w.id, worker_name: w.name, date, time_in: part, flagged: !!extra.manual || isOffDay(date) }));
    else must(await sb.from('attendance').update({ time_out: part, flagged: !!(cur && cur.flagged) || !!extra.manual }).eq('id', cur.id));
    await loadProject(); render();
    toast((kind === 'in' ? 'Time in ' : 'Time out ') + fmtTime(at) + ' · ' + w.name);
  }
  function confirmScan(pid, w, canvas, extra) {
    const rec = recOf(w.id), act = nextAction(rec), now = new Date().toISOString();
    const pics = el('div', { class: 'pair' },
      el('figure', {}, photo(w.photo_path) ? el('img', { src: photo(w.photo_path), alt: 'Enrolled photo of ' + w.name }) : el('div', { class: 'ph', text: 'No photo' }), el('figcaption', { text: 'Enrolled' })),
      el('figure', {}, el('img', { src: canvas.toDataURL('image/jpeg', 0.7), alt: 'Photo just taken' }), el('figcaption', { text: 'Just now' })));
    const who = el('div', {}, el('div', { class: 'who', text: w.name }), el('div', { class: 'muted', text: [w.position, extra.manual ? 'Picked by foreman' : null].filter(Boolean).join(' · ') }));
    const save = (kind) => async () => {
      const b = busy('Saving…');
      try { await recordScan(pid, w, kind, canvas, extra); b.close(); }
      catch (e) { b.close(); sheet('Couldn’t save', el('p', { text: errText(e) + ' Nothing was recorded.' }), [{ label: 'Close' }, { label: 'Try again', primary: true, run: save(kind) }]); }
    };
    const wrong = extra.manual ? null : { label: 'Not this person', run: () => noMatch(pid, canvas, extra.geo) };
    if (act === 'in') return sheet('Time in', [pics, who, el('div', { class: 'row-chips' }, el('span', { class: 'big-sm num', text: fmtTime(now) }), statusChip(inStatus(now)))], [wrong, { label: 'Confirm time in', primary: true, run: save('in') }]);
    if (act === 'out') return sheet('Time out', [pics, who, el('div', { class: 'row-chips' }, el('span', { class: 'big-sm num', text: fmtTime(now) }), statusChip(outStatus(now))), el('p', { class: 'muted note', text: 'Timed in at ' + fmtTime(rec.time_in.at) })], [wrong, { label: 'Confirm time out', primary: true, run: save('out') }]);
    if (act === 'recent') return sheet('Already timed in', [pics, who, el('p', { text: w.name + ' timed in at ' + fmtTime(rec.time_in.at) + '. No need to scan again until time out.' })], [wrong, { label: 'Record time out now', run: save('out') }, { label: 'OK', primary: true }]);
    return sheet('Already timed out', [pics, who, el('p', { text: w.name + ' timed in at ' + fmtTime(rec.time_in.at) + ' and out at ' + fmtTime(rec.time_out.at) + '.' })], [{ label: 'Replace time out with now', run: save('out') }, { label: 'OK', primary: true }]);
  }
  function noMatch(pid, canvas, geo) {
    const list = activeWorkers();
    if (!list.length) return sheet('No workers enrolled', el('p', { text: 'Enroll the crew first in the Workers tab.' }), [{ label: 'OK', primary: true }]);
    openDialog('Face not matched', [
      el('img', { class: 'shot', src: canvas.toDataURL('image/jpeg', 0.7), alt: 'Photo just taken' }),
      el('p', { class: 'muted note', text: 'Pick the worker yourself. This entry is marked as manual for the owner to review.' }),
      field('nm-worker', 'Worker', el('select', { id: 'nm-worker', required: '' }, el('option', { value: '', text: 'Choose…' }), list.map((w) => el('option', { value: w.id, text: w.name + (w.position ? ' · ' + w.position : '') })))),
      field('nm-reason', 'Reason', el('input', { id: 'nm-reason', type: 'text', maxlength: '120', placeholder: 'e.g. Dusty face, poor light, new haircut' })),
    ], {
      saveLabel: 'Continue',
      onSave: async () => {
        const w = list.find((x) => x.id === val('nm-worker')), reason = val('nm-reason');
        if (!w) return 'Choose the worker.';
        if (reason.length < 3) return 'Give a short reason.';
        setTimeout(() => confirmScan(pid, w, canvas, { manual: true, reason, geo }), 0);
      },
    });
  }

  // ---------- workers ----------
  function workerDialog(w) {
    const pid = S.pid;
    let shots = [];
    const thumbs = el('div', { class: 'faces' }), msg = el('p', { class: 'note muted', 'aria-live': 'polite' });
    const btn = el('button', { class: 'btn', type: 'button', text: 'Take face photo' });
    const draw = () => {
      thumbs.replaceChildren(...shots.map((s, i) => el('img', { src: s.url, alt: 'Face photo ' + (i + 1) })));
      const need = Math.max(0, MIN_FACES - shots.length);
      btn.textContent = shots.length ? 'Take another photo' : (w ? 'Retake face photos' : 'Take face photo');
      if (!shots.length) msg.textContent = w ? ((w.faces || []).length ? w.faces.length + ' face photos saved. Retake only if scans keep failing.' : 'No face photos yet.') : 'Take 3 photos of the worker’s face: straight, slightly left, slightly right. Hard hat off.';
      else msg.textContent = need ? shots.length + ' of ' + MIN_FACES + ' photos. Take ' + need + ' more.' : shots.length + ' photos ready.';
    };
    btn.addEventListener('click', async () => {
      const file = await takePhoto(false); if (!file) return;
      btn.disabled = true; msg.textContent = faceapi ? 'Checking the photo…' : 'Loading face recognition (first time only)…';
      try {
        const r = await readFaces(file);
        if (!r.faces.length) msg.textContent = 'No face found in that photo. Move closer, with light on the face.';
        else if (r.faces.length > 1) msg.textContent = 'More than one face in that photo. Only this worker should be in the frame.';
        else { shots.push({ desc: r.faces[0].descriptor, canvas: r.canvas, url: r.canvas.toDataURL('image/jpeg', 0.7) }); draw(); }
      } catch (e) { msg.textContent = faceError(e); }
      btn.disabled = false;
    });
    draw();
    openDialog(w ? 'Edit worker' : 'Enroll worker', [
      field('wk-name', 'Full name', el('input', { id: 'wk-name', type: 'text', maxlength: '80', value: w?.name || '', required: '' })),
      el('div', { class: 'two' },
        field('wk-pos', 'Position', el('input', { id: 'wk-pos', type: 'text', maxlength: '40', list: 'wk-pos-list', value: w?.position || '' })),
        owner() ? field('wk-rate', 'Daily rate', pesoInput('wk-rate', w ? S.rates[w.id] ?? '' : '', false)) : null),
      el('datalist', { id: 'wk-pos-list' }, POSITIONS.map((p) => el('option', { value: p }))),
      el('div', { class: 'field' }, el('span', { class: 'flabel', text: 'Face' }), thumbs, msg, el('div', {}, btn)),
      w ? checkRow('wk-active', 'Active (shows in attendance)', w.active !== false) : null,
      w ? null : checkRow('wk-consent', 'Worker signed the consent form for face scanning (Data Privacy Act)', false),
    ], {
      saveLabel: w ? 'Save changes' : 'Enroll worker',
      deleteLabel: 'Delete this worker and his face data? Past attendance stays.',
      onSave: async () => {
        const name = val('wk-name');
        if (!name) return 'Enter the worker’s name.';
        const rate = owner() ? readAmount('wk-rate') : null;
        if (owner() && val('wk-rate') !== '' && rate == null) return 'Enter the daily rate as a number, for example 800.';
        if (!w && !checked('wk-consent')) return 'The worker needs to sign the consent form before enrolling his face.';
        if ((!w || shots.length) && shots.length < MIN_FACES) return 'Take at least ' + MIN_FACES + ' face photos.';
        if (shots.length) {
          for (let i = 1; i < shots.length; i++) if (dist(shots[0].desc, shots[i].desc) > 0.6) return 'Photo ' + (i + 1) + ' doesn’t look like the same person as photo 1. Retake the photos.';
          const all = must(await sb.from('workers').select('id,name,project_id,faces')).filter((x) => x.id !== w?.id && (x.faces || []).length);
          const clash = all.find((x) => shots.some((s) => minDist(s.desc, x) < SAME_FACE));
          if (clash) return 'This face matches ' + clash.name + ', who is already enrolled.';
        }
        const body = { name, position: val('wk-pos') };
        if (w) body.active = checked('wk-active');
        if (shots.length) { body.faces = shots.map((s) => vec(s.desc)); body.photo_path = (await savePhoto(shots[0].canvas, pid + '/workers/' + uid() + '.jpg')) || w?.photo_path || null; }
        let id = w?.id;
        if (w) must(await sb.from('workers').update(body).eq('id', w.id));
        else id = must(await sb.from('workers').insert({ ...body, project_id: pid, consent: true, consent_at: new Date().toISOString() }).select('id').single()).id;
        if (owner() && rate != null) must(await sb.from('worker_rates').upsert({ worker_id: id, daily_rate: rate, updated_at: new Date().toISOString() }));
        await loadProject(); render();
        toast(w ? 'Worker saved' : name + ' enrolled');
      },
      onDelete: w && owner() ? async () => { must(await sb.from('workers').delete().eq('id', w.id)); await loadProject(); render(); toast('Worker deleted'); } : null,
    });
  }

  // ---------- one day's record ----------
  function recordDialog(w, rec) {
    const pp = dayPay(w, rec);
    const part = (label, p, st) => p ? el('div', { class: 'stack' },
      el('div', { class: 'row-chips' }, el('strong', { text: label + ' ' + fmtTime(p.at) }), statusChip(st(p.at)), p.method === 'manual' ? el('span', { class: 'chip warn', text: 'Manual' }) : null),
      p.reason ? el('span', { class: 'note', text: 'Reason: ' + p.reason }) : null,
      p.photo && photo(p.photo) ? el('img', { class: 'shot', src: photo(p.photo), alt: label + ' photo of ' + w.name }) : el('span', { class: 'muted note', text: p.photo ? 'Photo loading…' : 'No photo saved' }),
      p.geo ? el('span', { class: 'muted note num', text: 'GPS ' + p.geo.lat + ', ' + p.geo.lng + ' (±' + p.geo.acc + ' m)' }) : null) : el('p', { class: 'muted', text: label + ': not recorded' });
    signUrls([rec.time_in?.photo, rec.time_out?.photo]).then(() => {});
    const fields = [part('In', rec.time_in, inStatus), part('Out', rec.time_out, outStatus)];
    if (!owner()) return sheet(w.name + ' · ' + fmtDate(rec.date), fields, [{ label: 'Close', primary: true }]);
    fields.push(el('div', { class: 'panel' }, el('div', { class: 'eyebrow', text: 'Pay for this day' }),
      kv([['Daily rate', fmtPeso(pp.rate)], ['Deductions', pp.dedHrs + ' hrs (' + fmtPeso(pp.hourly * pp.dedHrs) + ')'], ['Computed', rec.time_out ? fmtPeso(pp.computed) : 'Needs time out']]),
      pp.override ? el('p', { class: 'note', text: 'Set: ' + fmtPeso(pp.override.amount) + (pp.override.note ? ' · ' + pp.override.note : '') }) : null,
      pp.flags.length ? el('div', { class: 'row-chips' }, pp.flags.map((f) => el('span', { class: 'chip warn', text: f }))) : null));
    if (!rec.time_out) fields.push(field('rd-out', 'Add time out (forgot to scan)', el('input', { id: 'rd-out', type: 'time', step: '60' })));
    fields.push(el('div', { class: 'two' },
      field('rd-pay', 'Set pay for this day', el('div', { class: 'peso' }, el('input', { id: 'rd-pay', type: 'number', inputmode: 'decimal', step: '0.01', min: '0', value: pp.override ? pp.override.amount : '', placeholder: rec.time_out ? String(pp.computed) : '' }))),
      field('rd-note', 'Note', el('input', { id: 'rd-note', type: 'text', maxlength: '120', value: pp.override?.note || '', placeholder: 'e.g. Paid actual hours' }))));
    if (pp.review) fields.push(checkRow('rd-ok', 'Approve the computed pay', false));
    fields.push(el('p', { class: 'muted note', text: 'Leave “Set pay” blank to use the computed pay.' }));
    openDialog(w.name + ' · ' + fmtDate(rec.date), fields, {
      saveLabel: 'Save', deleteLabel: 'Delete this attendance record?',
      onSave: async () => {
        let out = rec.time_out;
        if (!rec.time_out && val('rd-out')) {
          const [hh, mm] = val('rd-out').split(':').map(Number);
          const at = new Date(Date.parse(rec.date + 'T00:00:00Z') + (hh * 60 + mm - 8 * 60) * 60000).toISOString();
          if (at <= rec.time_in.at) return 'Time out must be after the time in (' + fmtTime(rec.time_in.at) + ').';
          out = { at, photo: null, method: 'manual', match: null, reason: val('rd-note') || 'Added by owner', geo: null };
          must(await sb.from('attendance').update({ time_out: out, flagged: true }).eq('id', rec.id));
        }
        const raw = val('rd-pay');
        if (raw !== '') {
          const amt = readAmount('rd-pay'); if (amt == null) return 'Enter the pay as a number, or leave it blank.';
          must(await sb.from('attendance_pay').upsert({ attendance_id: rec.id, amount: amt, note: val('rd-note'), set_at: new Date().toISOString() }));
        } else if (pp.override) must(await sb.from('attendance_pay').delete().eq('attendance_id', rec.id));
        else if (checked('rd-ok')) {
          if (!out) return 'Add the time out first, or set the pay for this day.';
          const np = dayPay(w, { ...rec, time_out: out });
          must(await sb.from('attendance_pay').upsert({ attendance_id: rec.id, amount: np.computed, note: val('rd-note') || 'Approved', set_at: new Date().toISOString() }));
        }
        await loadProject(); render(); toast('Saved');
      },
      onDelete: async () => { must(await sb.from('attendance').delete().eq('id', rec.id)); await loadProject(); render(); toast('Record deleted'); },
    });
  }

  // ---------- owner: people, projects, holidays ----------
  function personDialog(p) {
    const mine = S.members.filter((m) => m.user_id === p.id).map((m) => m.project_id);
    const role = el('select', { id: 'pp-role' }, [['pending', 'Waiting (no access)'], ['foreman', 'Foreman (attendance only)']].map(([v, t]) => el('option', { value: v, text: t })));
    role.value = p.role === 'foreman' ? 'foreman' : 'pending';
    openDialog(p.full_name || p.email, [
      el('p', { class: 'muted note', text: p.email }),
      field('pp-role', 'Access', role),
      el('div', { class: 'field' }, el('span', { class: 'flabel', text: 'Projects he can scan for' }),
        S.projects.map((pr) => checkRow('pp-p-' + pr.id, pr.name + ' (' + pr.id + ')', mine.includes(pr.id)))),
    ], {
      saveLabel: 'Save access',
      onSave: async () => {
        must(await sb.from('profiles').update({ role: role.value }).eq('id', p.id));
        const want = S.projects.filter((pr) => checked('pp-p-' + pr.id)).map((pr) => pr.id);
        const add = want.filter((x) => !mine.includes(x)), del = mine.filter((x) => !want.includes(x));
        if (add.length) must(await sb.from('project_members').insert(add.map((x) => ({ project_id: x, user_id: p.id }))));
        for (const x of del) must(await sb.from('project_members').delete().eq('project_id', x).eq('user_id', p.id));
        await loadPeople(); render(); toast('Access saved');
      },
    });
  }
  function projectDialog(pr) {
    openDialog(pr ? 'Edit project' : 'Add project', [
      field('pj-name', 'Project name', el('input', { id: 'pj-name', type: 'text', maxlength: '80', value: pr?.name || '', required: '' })),
      field('pj-client', 'Client', el('input', { id: 'pj-client', type: 'text', maxlength: '80', value: pr?.client || '' })),
      field('pj-loc', 'Location', el('input', { id: 'pj-loc', type: 'text', maxlength: '80', value: pr?.location || '' })),
    ], {
      saveLabel: pr ? 'Save' : 'Add project',
      onSave: async () => {
        const name = val('pj-name'); if (!name) return 'Give the project a name.';
        const body = { name, client: val('pj-client'), location: val('pj-loc') };
        if (pr) must(await sb.from('projects').update(body).eq('id', pr.id));
        else { const n = S.projects.reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, '')) || 0), 0) + 1; must(await sb.from('projects').insert({ id: 'P' + n, ...body })); }
        await loadMe(); render(); toast('Project saved');
      },
    });
  }
  function holidaysDialog() {
    let list = S.holidays.map((h) => ({ ...h }));
    const box = el('div', { class: 'stack' });
    const draw = () => box.replaceChildren(...(list.length ? list.map((h, i) => el('div', { class: 'two' },
      el('input', { type: 'date', value: h.date, 'aria-label': 'Holiday date', oninput: (e) => { h.date = e.target.value; }, class: 'proj' }),
      el('div', { class: 'actions', style: 'justify-content:flex-start' }, el('input', { type: 'text', value: h.name || '', maxlength: '60', placeholder: 'Name', 'aria-label': 'Holiday name', oninput: (e) => { h.name = e.target.value; }, class: 'proj' }),
        el('button', { class: 'btn danger', type: 'button', text: 'Remove', onclick: () => { list.splice(i, 1); draw(); } })))) : [el('p', { class: 'muted note', text: 'No holidays added.' })]));
    draw();
    openDialog('Holidays (no work)', [el('p', { class: 'muted note', text: 'Scans on these dates are flagged for review, like Sundays.' }), box,
      el('div', {}, el('button', { class: 'btn', type: 'button', text: 'Add holiday', onclick: () => { list.push({ date: today(), name: '' }); draw(); } }))], {
      saveLabel: 'Save holidays',
      onSave: async () => {
        const clean = list.filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date)).map((h) => ({ date: h.date, name: (h.name || '').trim() }));
        must(await sb.from('holidays').delete().gte('date', '1900-01-01'));
        if (clean.length) must(await sb.from('holidays').upsert(clean));
        S.holidays = must(await sb.from('holidays').select('*').order('date')); render(); toast('Holidays saved');
      },
    });
  }

  // ---------- screens ----------
  function topBar() {
    const p = project();
    return el('div', { class: 'top' },
      el('div', { class: 'brand' }, el('img', { src: '/icon-192.png', alt: '' }),
        el('div', {}, el('div', { class: 'eyebrow', text: 'Nieves Construction Services' }),
          S.projects.length > 1 ? el('select', { class: 'proj', id: 'proj-pick', 'aria-label': 'Project', onchange: (e) => pickProject(e.target.value) },
            !p ? el('option', { value: '', text: 'Choose project…' }) : null, S.projects.map((x) => el('option', { value: x.id, selected: x.id === S.pid ? '' : false, text: x.name })))
            : el('strong', { text: p ? p.name : '' }))),
      el('div', { class: 'actions' }, el('span', { class: 'muted note hide-sm', text: S.me.full_name || S.me.email }), el('button', { class: 'btn link', text: 'Sign out', onclick: signOut })));
  }

  function renderAuth(mode = 'in') {
    const msg = el('p', { class: 'err', role: 'alert' });
    const form = el('form', { class: 'panel auth' },
      el('div', { class: 'brand' }, el('img', { src: '/icon-192.png', alt: '' }), el('div', {}, el('div', { class: 'eyebrow', text: 'Nieves Construction Services' }), el('h1', { text: 'Site attendance' }))),
      mode === 'up' ? field('au-name', 'Full name', el('input', { id: 'au-name', type: 'text', autocomplete: 'name', required: '' })) : null,
      field('au-email', 'Email', el('input', { id: 'au-email', type: 'email', autocomplete: 'email', required: '' })),
      field('au-pass', 'Password', el('input', { id: 'au-pass', type: 'password', autocomplete: mode === 'up' ? 'new-password' : 'current-password', minlength: '8', required: '' })),
      msg,
      el('button', { class: 'btn primary', type: 'submit', text: mode === 'up' ? 'Create account' : 'Sign in' }),
      el('button', { class: 'btn link', type: 'button', text: mode === 'up' ? 'I already have an account' : 'New here? Create an account', onclick: () => renderAuth(mode === 'up' ? 'in' : 'up') }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); msg.textContent = '';
      const email = val('au-email'), password = document.getElementById('au-pass').value;
      try {
        if (mode === 'up') {
          if (password.length < 8) { msg.textContent = 'Use at least 8 characters.'; return; }
          const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: val('au-name') }, emailRedirectTo: location.origin } });
          if (error) throw error;
          if (!data.session) { app.replaceChildren(el('div', { class: 'panel auth' }, el('h2', { text: 'Check your email' }), el('p', { text: 'We sent a confirmation link to ' + email + '. Open it on this phone, then sign in.' }), el('button', { class: 'btn primary', text: 'Back to sign in', onclick: () => renderAuth('in') }))); return; }
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) { msg.textContent = /confirm/i.test(error.message) ? 'Confirm your email first: open the link we sent you.' : 'Wrong email or password.'; return; }
        }
        await boot();
      } catch (x) { msg.textContent = errText(x); }
    });
    app.replaceChildren(form);
  }

  function renderPending() {
    app.replaceChildren(el('div', { class: 'panel auth' },
      el('div', { class: 'eyebrow', text: 'Nieves Construction Services' }), el('h1', { text: 'Waiting for approval' }),
      el('p', { text: 'Your account (' + S.me.email + ') is set up. The owner needs to give you access to a project. Tap Refresh once they have.' }),
      el('div', { class: 'actions', style: 'justify-content:flex-start' }, el('button', { class: 'btn primary', text: 'Refresh', onclick: boot }), el('button', { class: 'btn link', text: 'Sign out', onclick: signOut }))));
  }

  function render() {
    if (!S.me) return;
    if (S.me.role === 'pending') return renderPending();
    const a = document.activeElement, fid = a && a.id && app.contains(a) ? a.id : null;
    app.replaceChildren(topBar());
    const tabsList = [['today', 'Daily'], owner() ? ['week', 'Week pay'] : null, ['workers', 'Workers (' + S.workers.length + ')'], owner() ? ['people', 'People'] : null, owner() ? ['projects', 'Projects'] : null].filter(Boolean);
    if (!tabsList.some((t) => t[0] === S.tab)) S.tab = 'today';
    const needsProject = ['today', 'week', 'workers'].includes(S.tab);
    if (needsProject && !project()) {
      app.append(S.projects.length ? el('div', { class: 'stack' }, el('h1', { text: 'Choose your project' }), el('div', { class: 'grid' }, S.projects.map((p) => el('button', { class: 'tile', onclick: () => pickProject(p.id) }, el('h3', { text: p.name }), el('span', { class: 'muted note', text: p.location || p.id })))))
        : el('div', { class: 'empty', text: 'No project assigned to you yet. Ask the owner.' }));
      if (owner()) app.append(el('div', { class: 'tabs' }, [['people', 'People'], ['projects', 'Projects']].map(([k, l]) => el('button', { class: 'tabbtn', text: l, onclick: async () => { S.tab = k; if (k === 'people') await loadPeople(); render(); } }))));
      return;
    }
    const tabs = el('div', { class: 'tabs', role: 'tablist' }, tabsList.map(([k, label]) => el('button', { class: 'tabbtn' + (S.tab === k ? ' on' : ''), role: 'tab', 'aria-selected': S.tab === k ? 'true' : 'false', text: label,
      onclick: async () => { S.tab = k; if (k === 'people') { try { await loadPeople(); } catch (e) { toast(errText(e)); } } render(); } })));
    if (needsProject) app.append(scanPanel(), statsPanel());
    app.append(tabs, S.tab === 'today' ? dailyView() : S.tab === 'week' ? weekView() : S.tab === 'workers' ? workersView() : S.tab === 'people' ? peopleView() : projectsView());
    if (fid) { const n = document.getElementById(fid); if (n) n.focus({ preventScroll: true }); }
  }

  function scanPanel() {
    const enrolled = activeWorkers().filter((w) => (w.faces || []).length);
    if (enrolled.length && !faceapi && !faceLoading) loadFace().catch(() => {});
    const ready = !!faceapi, loadingFace = !!faceLoading && !faceapi;
    return el('div', { class: 'panel scan' },
      el('button', { class: 'btn primary big', id: 'scan', text: 'Scan face', disabled: enrolled.length ? false : '', onclick: scanFace }),
      el('span', { class: 'muted note', text: !enrolled.length ? 'Enroll workers in the Workers tab first.' : ready ? 'One worker at a time. Hard hat and sunglasses off. The app picks time in or time out.' : loadingFace ? 'Getting face recognition ready (the first time on this phone takes a minute)…' : 'Face recognition loads on the first scan.' }),
      el('span', { class: 'muted note', text: '8:00 AM – 5:00 PM · lunch 12–1 · 5-minute grace' }));
  }
  function statsPanel() {
    const t = today(), list = activeWorkers();
    const present = list.filter((w) => recOf(w.id, t)?.time_in).length, out = list.filter((w) => recOf(w.id, t)?.time_out).length;
    const toReview = owner() ? S.att.filter((r) => r.time_in && r.date >= addDays(t, -13)).filter((r) => dayPay(workerOf(r.worker_id, r), r).review).length : null;
    return el('div', { class: 'panel stats' },
      el('div', { class: 'stat' }, el('div', { class: 'eyebrow', text: 'Present today' }), el('div', { class: 'v', text: present + ' / ' + list.length })),
      el('div', { class: 'stat' }, el('div', { class: 'eyebrow', text: 'Timed out' }), el('div', { class: 'v', text: String(out) })),
      toReview != null ? el('div', { class: 'stat' }, el('div', { class: 'eyebrow', text: 'To review (2 wks)' }), el('div', { class: 'v' + (toReview ? ' bad' : ''), text: String(toReview) })) : null);
  }
  function dailyView() {
    const t = today(), d = S.attDate || t, list = activeWorkers();
    const extra = S.att.filter((r) => r.date === d && !list.some((w) => w.id === r.worker_id)).map((r) => ({ w: workerOf(r.worker_id, r), r }));
    const rows = [...list.map((w) => ({ w, r: recOf(w.id, d) })), ...extra];
    const hol = isHoliday(d);
    return el('div', { class: 'stack' },
      el('div', { class: 'weeknav' },
        el('button', { class: 'btn', text: '‹', 'aria-label': 'Previous day', onclick: () => { S.attDate = addDays(d, -1); render(); } }),
        el('strong', { class: 'num', text: (d === t ? 'Today · ' : '') + shortDay(d) }),
        el('button', { class: 'btn', text: '›', 'aria-label': 'Next day', disabled: d >= t ? '' : false, onclick: () => { S.attDate = addDays(d, 1); render(); } }),
        d !== t ? el('button', { class: 'btn link', text: 'Today', onclick: () => { S.attDate = null; render(); } }) : null),
      dow(d) === 0 || hol ? el('div', { class: 'banner' }, el('span', { text: (hol ? 'Holiday' + (hol.name ? ' (' + hol.name + ')' : '') : 'Sunday') + ': no work scheduled. Any scan is flagged for review.' })) : null,
      rows.length ? el('div', { class: 'panel' }, el('div', { class: 'ledger-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', { text: 'Worker' }), el('th', { text: 'In' }), el('th', { text: 'Out' }), el('th', { text: 'Status' }), owner() ? el('th', { class: 'r', text: 'Pay' }) : null)),
        el('tbody', {}, rows.map(({ w, r }) => { const pp = dayPay(w, r); const open = () => r && recordDialog(w, r);
          return el('tr', { class: r ? 'click' : '', tabindex: r ? '0' : false, onclick: open, onkeydown: (e) => { if (e.key === 'Enter') open(); } },
            el('td', {}, el('div', { class: 'who-row' }, photo(w.photo_path) ? el('img', { class: 'av', src: photo(w.photo_path), alt: '' }) : el('span', { class: 'av' }), el('span', {}, el('span', { text: w.name }), el('br'), el('span', { class: 'muted note', text: w.position || '' })))),
            el('td', { class: 'num nowrap', text: r && r.time_in ? fmtTime(r.time_in.at) : '—' }),
            el('td', { class: 'num nowrap', text: r && r.time_out ? fmtTime(r.time_out.at) : '—' }),
            el('td', {}, el('div', { class: 'row-chips' }, !r || !r.time_in ? el('span', { class: 'chip', text: d === t ? 'Not in' : 'Absent' }) : statusChip(pp.inSt), pp.outSt ? statusChip(pp.outSt) : null, owner() && pp.review ? el('span', { class: 'chip warn', text: 'Review' }) : null)),
            owner() ? el('td', { class: 'r num nowrap', text: r && r.time_in ? (r.time_out || pp.override ? fmtPeso(pp.pay) : '—') : '—' }) : null); })))))
        : el('div', { class: 'empty', text: 'No workers yet. Open the Workers tab to enroll the crew.' }));
  }
  function weekView() {
    const t = today(), ws = S.payWeek || addDays(t, -((dow(t) + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    const recs = S.att.filter((r) => r.date >= days[0] && r.date <= days[6] && r.time_in);
    const ids = [...new Set([...activeWorkers().map((w) => w.id), ...recs.map((r) => r.worker_id)])];
    const people = ids.map((wid) => {
      const w = workerOf(wid, recs.find((r) => r.worker_id === wid));
      const got = recs.filter((r) => r.worker_id === wid).map((r) => ({ r, pp: dayPay(w, r) }));
      return { w, days: got.length, ded: got.reduce((s, x) => s + x.pp.dedHrs, 0), pay: r2(got.reduce((s, x) => s + x.pp.pay, 0)), review: got.filter((x) => x.pp.review) };
    }).sort((a, b) => a.w.name.localeCompare(b.w.name));
    const total = r2(people.reduce((s, x) => s + x.pay, 0)), reviews = people.flatMap((x) => x.review.map((y) => ({ w: x.w, ...y })));
    const old = ws < addDays(t, -42);
    return el('div', { class: 'stack' },
      el('div', { class: 'weeknav' },
        el('button', { class: 'btn', text: '‹ Prev', 'aria-label': 'Previous week', onclick: () => { S.payWeek = addDays(ws, -7); render(); } }),
        el('strong', { class: 'num', text: fmtDate(days[0]) + ' – ' + fmtDate(days[5]) }),
        el('button', { class: 'btn', text: 'Next ›', 'aria-label': 'Next week', onclick: () => { S.payWeek = addDays(ws, 7); render(); } })),
      old ? el('div', { class: 'banner' }, el('span', { class: 'note', text: 'Only the last 6 weeks are loaded on this screen.' })) : null,
      el('div', { class: 'panel stats' },
        el('div', { class: 'stat' }, el('div', { class: 'eyebrow', text: 'Pay this week' }), el('div', { class: 'v', text: fmtPeso(total) })),
        el('div', { class: 'stat' }, el('div', { class: 'eyebrow', text: 'Workers' }), el('div', { class: 'v', text: String(people.filter((x) => x.days).length) })),
        el('div', { class: 'stat' }, el('div', { class: 'eyebrow', text: 'For review' }), el('div', { class: 'v' + (reviews.length ? ' bad' : ''), text: String(reviews.length) }))),
      reviews.length ? el('div', { class: 'panel attn' }, el('h3', { text: 'For review' }), el('p', { class: 'muted note', text: 'These days are not final until you approve the pay or set it. Tap one to decide.' }),
        el('ul', { class: 'flags' }, reviews.map((x) => el('li', {}, el('button', { class: 'btn link', style: 'text-align:left', text: x.w.name + ' · ' + shortDay(x.r.date) + ' · ' + x.pp.flags.join(', '), onclick: () => recordDialog(x.w, x.r) }))))) : null,
      people.length ? el('div', { class: 'panel' }, el('div', { class: 'ledger-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', { text: 'Worker' }), el('th', { class: 'r', text: 'Days' }), el('th', { class: 'r hide-sm', text: 'Deductions' }), el('th', { class: 'r', text: 'Pay' }))),
        el('tbody', {}, people.map((x) => el('tr', {},
          el('td', {}, el('div', { text: x.w.name }), el('span', { class: 'muted note', text: S.rates[x.w.id] ? fmtPeso(S.rates[x.w.id]) + '/day' : 'No daily rate' })),
          el('td', { class: 'r num', text: String(x.days) }), el('td', { class: 'r num hide-sm', text: x.ded ? x.ded + ' hrs' : '—' }), el('td', { class: 'r num', text: fmtPeso(x.pay) })))),
        el('tfoot', {}, el('tr', {}, el('td', { text: 'Total' }), el('td', {}), el('td', { class: 'hide-sm' }), el('td', { class: 'r num', text: fmtPeso(total) })))))) : el('div', { class: 'empty', text: 'No attendance this week.' }),
      el('p', { class: 'muted note', text: 'Week runs Monday to Saturday. Daily rate minus deductions: late or undertime 2 hrs, half day 4 hrs. No overtime.' }),
      el('div', {}, el('button', { class: 'btn', text: 'Holidays', onclick: holidaysDialog })));
  }
  function workersView() {
    const list = [...S.workers].sort((a, b) => a.name.localeCompare(b.name));
    return el('div', { class: 'stack' },
      el('div', {}, el('button', { class: 'btn primary', id: 'enroll', text: 'Enroll worker', onclick: () => workerDialog(null) })),
      list.length ? el('div', { class: 'panel' }, el('div', { class: 'ledger-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', { text: 'Worker' }), el('th', { class: 'hide-sm', text: 'Position' }), owner() ? el('th', { class: 'r', text: 'Daily rate' }) : null, el('th', { text: 'Face' }))),
        el('tbody', {}, list.map((w) => el('tr', { class: 'click', tabindex: '0', onclick: () => workerDialog(w), onkeydown: (e) => { if (e.key === 'Enter') workerDialog(w); } },
          el('td', {}, el('div', { class: 'who-row' }, photo(w.photo_path) ? el('img', { class: 'av', src: photo(w.photo_path), alt: '' }) : el('span', { class: 'av' }), el('span', { text: w.name + (w.active === false ? ' (inactive)' : '') }))),
          el('td', { class: 'hide-sm', text: w.position || '—' }),
          owner() ? el('td', { class: 'r num' }, S.rates[w.id] ? document.createTextNode(fmtPeso(S.rates[w.id])) : el('span', { class: 'chip warn', text: 'Set rate' })) : null,
          el('td', {}, (w.faces || []).length ? el('span', { class: 'chip ok', text: w.faces.length + ' photos' }) : el('span', { class: 'chip warn', text: 'None' }))))))))
        : el('div', { class: 'empty', text: 'No workers enrolled for this project yet.' }),
      el('p', { class: 'muted note', text: 'Face data is kept only for enrolled workers who signed the consent form. Deleting a worker removes his face data; his attendance records stay for payroll.' }));
  }
  function peopleView() {
    const pname = (pid) => (S.projects.find((x) => x.id === pid) || {}).name || pid;
    return el('div', { class: 'stack' },
      el('p', { class: 'muted note', text: 'Staff create their own account on this app with their email. They appear here as Waiting until you give them access.' }),
      el('div', { class: 'panel' }, el('div', { class: 'ledger-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', { text: 'Person' }), el('th', { text: 'Access' }), el('th', { class: 'hide-sm', text: 'Projects' }))),
        el('tbody', {}, S.people.map((p) => { const me = p.id === S.me.id; const pr = S.members.filter((m) => m.user_id === p.id).map((m) => pname(m.project_id));
          return el('tr', { class: me ? '' : 'click', tabindex: me ? false : '0', onclick: () => !me && personDialog(p), onkeydown: (e) => { if (!me && e.key === 'Enter') personDialog(p); } },
            el('td', {}, el('div', { text: p.full_name || '—' }), el('span', { class: 'muted note', text: p.email })),
            el('td', {}, el('span', { class: 'chip ' + (p.role === 'owner' ? 'step' : p.role === 'foreman' ? 'ok' : 'late'), text: p.role === 'pending' ? 'Waiting' : p.role })),
            el('td', { class: 'hide-sm', text: p.role === 'owner' ? 'All' : pr.join(', ') || '—' })); }))))));
  }
  function projectsView() {
    return el('div', { class: 'stack' },
      el('div', {}, el('button', { class: 'btn primary', text: 'Add project', onclick: () => projectDialog(null) })),
      el('div', { class: 'panel' }, el('div', { class: 'ledger-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', { text: 'Code' }), el('th', { text: 'Project' }), el('th', { class: 'hide-sm', text: 'Client' }), el('th', { class: 'hide-sm', text: 'Location' }))),
        el('tbody', {}, S.projects.map((p) => el('tr', { class: 'click', tabindex: '0', onclick: () => projectDialog(p), onkeydown: (e) => { if (e.key === 'Enter') projectDialog(p); } },
          el('td', { text: p.id }), el('td', { text: p.name }), el('td', { class: 'hide-sm', text: p.client || '—' }), el('td', { class: 'hide-sm', text: p.location || '—' }))))))));
  }

  async function signOut() { if (S.chan) sb.removeChannel(S.chan); await sb.auth.signOut(); S.me = null; S.session = null; renderAuth('in'); }

  async function boot() {
    try { await loadMe(); } catch (e) { app.replaceChildren(el('div', { class: 'panel auth' }, el('h2', { text: 'Couldn’t connect' }), el('p', { text: errText(e) }), el('button', { class: 'btn primary', text: 'Try again', onclick: boot }))); return; }
    if (!S.session) return renderAuth('in');
    if (!S.me) { app.replaceChildren(el('div', { class: 'panel auth' }, el('p', { text: 'Setting up your account…' }))); setTimeout(boot, 1500); return; }
    if (S.me.role === 'pending') return renderPending();
    render();
    if (S.pid) { try { await loadProject(); } catch (e) { toast(errText(e)); } listen(); render(); }
  }

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.pid && S.me && S.me.role !== 'pending') reload(); });
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { S.me = null; renderAuth('in'); } });
  boot();
})();
