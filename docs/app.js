/* 小金庫 PWA v2
 * 這個檔案會放在公開的 GitHub 上：不能寫入任何金額、密碼、金鑰、網址或銀行名稱。
 * 網址與裝置金鑰由使用者第一次打開時貼上「App 設定碼」，只存在這台手機。
 */
(function () {
  'use strict';

  var LS_CFG = 'xjk.cfg';
  var LS_THEME = 'xjk.theme';
  var LS_PK = 'xjk.pk';
  var LOCK_AFTER_MS = 5 * 60 * 1000;

  var S = { cfg: null, session: null, meta: null, home: null, page: 'home', sub: null, settings: null, hiddenAt: 0, busy: false, pkCh: null };
  var app = document.getElementById('app');
  var tabs = document.getElementById('tabs');

  // ---------- 小工具 ----------
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    n = Math.round(Number(n) || 0);
    return (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('en-US');
  }
  function wan(n) {
    var v = (Number(n) || 0) / 10000;
    return (Math.round(v * 10) / 10).toLocaleString('en-US') + ' 萬';
  }
  function usd(n) { return (Number(n) || 0).toFixed(2); }
  function pct(n) { return Math.max(0, Math.min(100, Number(n) || 0)); }
  function todayTw() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date()); }
  function monthTw() { return todayTw().slice(0, 7); }
  function shiftMonth(key, d) {
    var y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7)) + d;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    return y + '-' + (m < 10 ? '0' : '') + m;
  }
  function monthLabel(key) { return Number(key.slice(0, 4)) + ' 年 ' + Number(key.slice(5, 7)) + ' 月'; }
  function toNum(v) { var n = Number(String(v == null ? '' : v).replace(/[,\s，]/g, '')); return isNaN(n) ? NaN : n; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  var ICON = {
    refresh: '<svg class="i" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    lock: '<svg class="i" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    left: '<svg class="i" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
    right: '<svg class="i" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    chev: '<svg class="i chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    wifi: '<svg class="i" viewBox="0 0 24 24"><path d="M2 8.5a15 15 0 0 1 20 0"/><path d="M5 12a10 10 0 0 1 14 0"/><path d="M8.5 15.5a5 5 0 0 1 7 0"/><path d="M12 19h.01"/><path d="M3 3l18 18"/></svg>',
    bulb: '<svg class="i" viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>',
    face: '<svg class="i" viewBox="0 0 24 24"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9.5v3.5h-1"/><path d="M9.5 16a3.5 3.5 0 0 0 5 0"/></svg>',
  };

  function theme(t) {
    var v = t === '淺色' ? 'light' : t === '深色' ? 'dark' : '';
    if (v) document.documentElement.setAttribute('data-theme', v);
    else document.documentElement.removeAttribute('data-theme');
    lsSet(LS_THEME, v || null);
  }

  // ---------- 金額輸入：自動加千分位 ----------
  function moneyInput(id, value, extra) {
    var v = value === '' || value == null ? '' : Math.round(Number(value)).toLocaleString('en-US');
    return '<input class="in num ' + (extra || '') + '" id="' + id + '" inputmode="numeric" autocomplete="off" data-money value="' + esc(v) + '" placeholder="0">';
  }
  function bindMoney(root) {
    $$('[data-money]', root).forEach(function (el) {
      el.addEventListener('input', function () {
        var digits = el.value.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');
        el.value = digits ? Number(digits).toLocaleString('en-US') : '';
      });
    });
  }

  // ---------- 面板（從下方滑出） ----------
  function sheet(html, onMount) {
    var wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = '<div class="backdrop"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + html + '</div>';
    document.body.appendChild(wrap);
    var api = { el: $('.sheet', wrap), close: function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } };
    $('.backdrop', wrap).onclick = api.close;
    bindMoney(api.el);
    if (onMount) onMount(api);
    return api;
  }
  function ask(title, text, okLabel, danger) {
    return new Promise(function (resolve) {
      sheet('<h3>' + esc(title) + '</h3>' + (text ? '<div class="msg-big">' + text + '</div>' : '') +
        '<button class="btn' + (danger ? ' danger' : '') + '" data-ok>' + esc(okLabel || '確定') + '</button><button class="btn ghost" data-no>取消</button>', function (s) {
        $('[data-ok]', s.el).onclick = function () { s.close(); resolve(true); };
        $('[data-no]', s.el).onclick = function () { s.close(); resolve(false); };
        $('.backdrop', s.el.parentNode).onclick = function () { s.close(); resolve(false); };
      });
    });
  }
  function notice(title, text) {
    return new Promise(function (resolve) {
      sheet('<h3>' + esc(title) + '</h3><div class="msg-big">' + text + '</div><button class="btn" data-ok>好</button>', function (s) {
        $('[data-ok]', s.el).onclick = function () { s.close(); resolve(); };
        $('.backdrop', s.el.parentNode).onclick = function () { s.close(); resolve(); };
      });
    });
  }

  // ---------- 設定碼 ----------
  function loadCfg() {
    try { var c = JSON.parse(lsGet(LS_CFG) || 'null'); if (c && c.u && c.t) return c; } catch (e) {}
    return null;
  }
  function parseSetupCode(code) {
    code = String(code || '').trim().replace(/\s+/g, '');
    if (code.indexOf('XJK1.') !== 0) throw new Error('設定碼格式不對，要以 XJK1. 開頭');
    var json = new TextDecoder().decode(b64uToBuf(code.slice(5)));
    var o = JSON.parse(json);
    if (!o.u || !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(o.u) || !o.t) throw new Error('設定碼內容不對');
    return { u: o.u, t: o.t };
  }

  // ---------- base64url ----------
  function b64uToBuf(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bufToB64u(buf) {
    var bytes = new Uint8Array(buf), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function bufToHex(bytes) {
    return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  // ---------- API ----------
  function OfflineError() { this.offline = true; this.message = '需要網路'; }

  function api(action, data, opts) {
    opts = opts || {};
    if (!navigator.onLine) return Promise.reject(new OfflineError());
    var body = Object.assign({ appToken: S.cfg.t, session: S.session, action: action }, data || {});
    return fetch(S.cfg.u, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      cache: 'no-store',
    }).catch(function () { throw new OfflineError(); })
      .then(function (r) { return r.json().catch(function () { throw new Error('伺服器回應格式錯誤'); }); })
      .then(function (j) {
        if (!j.ok && j.needPin && !opts.noLock) { lock('閒置太久，請重新解鎖'); throw new Error('locked'); }
        if (!j.ok) { var e = new Error(j.error || '發生錯誤'); e.resp = j; throw e; }
        return j;
      });
  }

  function showError(err) {
    if (!err || err.message === 'locked') return;
    if (err.offline) { toast('需要網路，請確認連線後再試'); return; }
    toast(err.message || '發生錯誤');
  }

  function offlineView() {
    return '<div class="offline">' + ICON.wifi + '<div style="font-size:17px;font-weight:600;color:var(--text)">需要網路</div><div>小金庫要連上網路才能讀取資料，連線後再試一次。</div><button class="chip-btn" data-act="reload">重新整理</button></div>';
  }

  // ---------- 第一次設定 ----------
  function renderSetup(msg) {
    tabs.classList.add('hidden');
    app.innerHTML =
      '<div class="lock">' +
      '<img class="logo" src="icons/icon-192.png" alt="">' +
      '<h1>歡迎使用小金庫</h1>' +
      '<div class="muted" style="max-width:320px">在電腦打開「小金庫」試算表 → 選單「小金庫 → 顯示金鑰」，複製「App 設定碼」，貼到下面。</div>' +
      '<div style="width:100%;max-width:360px;margin-top:20px">' +
      '<textarea class="in" id="code" rows="4" placeholder="XJK1.…" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>' +
      '<div class="msg" id="msg" style="margin:8px 0">' + esc(msg || '') + '</div>' +
      '<button class="btn" id="go">完成設定</button>' +
      '</div></div>';
    $('#go').onclick = function () {
      var btn = this, m = $('#msg');
      var cfg;
      try { cfg = parseSetupCode($('#code').value); } catch (e) { m.textContent = e.message; return; }
      btn.disabled = true; m.textContent = '';
      S.cfg = cfg;
      api('status', {}, { noLock: true }).then(function (r) {
        lsSet(LS_CFG, JSON.stringify(cfg));
        if (!r.pinSet) { m.textContent = '還沒設定密碼，請先在試算表選單設定 6 位數密碼。'; btn.disabled = false; return; }
        renderUnlock();
      }).catch(function (e) {
        S.cfg = null; btn.disabled = false;
        m.textContent = e.offline ? '需要網路才能完成設定' : (e.message || '設定失敗');
      });
    };
  }

  // ---------- 解鎖（密碼／Face ID） ----------
  function lock(msg) {
    if (S.session) api('logout', {}, { noLock: true }).catch(function () {});
    S.session = null;
    S.home = null;
    S.settings = null;
    $$('.sheet-wrap').forEach(function (w) { w.parentNode.removeChild(w); });
    renderUnlock(msg);
  }

  function onUnlocked(r) {
    S.session = r.session;
    S.meta = r.meta;
    if (r.home) S.home = r.home;
    if (r.meta && r.meta.theme) theme(r.meta.theme);
    S.sub = null;
    go(S.page === 'add' ? 'home' : S.page || 'home');
  }

  function hasFaceId() { return !!lsGet(LS_PK) && !!window.PublicKeyCredential; }

  function fetchChallenge() {
    return api('passkeyStart', {}, { noLock: true }).then(function (r) {
      S.pkCh = { challenge: r.challenge, ids: r.ids, at: Date.now() };
      return S.pkCh;
    });
  }

  function faceIdLogin(m) {
    var ch = S.pkCh;
    if (!ch || Date.now() - ch.at > 240000) {
      m.textContent = '準備中，請再按一次';
      fetchChallenge().then(function () { m.textContent = ''; }).catch(function (e) { m.textContent = e.offline ? '需要網路' : e.message; });
      return;
    }
    S.pkCh = null;
    S.busy = true;
    navigator.credentials.get({
      publicKey: {
        challenge: b64uToBuf(ch.challenge),
        rpId: location.hostname,
        allowCredentials: ch.ids.map(function (id) { return { type: 'public-key', id: b64uToBuf(id), transports: ['internal', 'hybrid'] }; }),
        userVerification: 'required',
        timeout: 60000,
      },
    }).then(function (cred) {
      m.textContent = '驗證中…';
      return api('passkeyFinish', {
        id: bufToB64u(cred.rawId),
        clientDataJSON: bufToB64u(cred.response.clientDataJSON),
        authenticatorData: bufToB64u(cred.response.authenticatorData),
        signature: bufToB64u(cred.response.signature),
      }, { noLock: true });
    }).then(function (r) {
      S.busy = false;
      onUnlocked(r);
    }).catch(function (e) {
      S.busy = false;
      if (e && e.resp && e.resp.unknownKey) lsSet(LS_PK, null);
      if (e && e.name === 'NotAllowedError') m.textContent = '已取消，可以再按一次或輸入密碼';
      else m.textContent = e && e.offline ? '需要網路才能解鎖' : ((e && e.message) || 'Face ID 失敗，請輸入密碼');
      fetchChallenge().catch(function () {});
    });
  }

  function renderUnlock(msg) {
    tabs.classList.add('hidden');
    var pin = '';
    var face = hasFaceId();
    app.innerHTML =
      '<div class="lock">' +
      '<img class="logo" src="icons/icon-192.png" alt="">' +
      '<h1>小金庫</h1><div class="muted">' + (face ? '用 Face ID 或 6 位數密碼解鎖' : '輸入 6 位數密碼') + '</div>' +
      (face ? '<button class="btn faceid" id="faceBtn">' + ICON.face + '使用 Face ID</button>' : '') +
      '<div class="dots" id="dots"><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
      '<div class="msg" id="msg">' + esc(msg || '') + '</div>' +
      '<div class="pad" id="pad">' +
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button class="num" data-k="' + n + '">' + n + '</button>'; }).join('') +
      '<button class="ghost" data-k="reset" aria-label="重新設定">重設</button><button class="num" data-k="0">0</button><button class="ghost" data-k="del" aria-label="刪除">刪除</button>' +
      '</div></div>';
    var dots = $('#dots'), m = $('#msg');
    function paint() { Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle('on', i < pin.length); }); }
    function submit() {
      S.busy = true;
      m.textContent = '解鎖中…';
      api('unlock', { pin: pin }, { noLock: true }).then(function (r) {
        S.busy = false;
        onUnlocked(r);
      }).catch(function (e) {
        S.busy = false;
        pin = ''; paint();
        dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
        if (navigator.vibrate) navigator.vibrate(200);
        m.textContent = e.offline ? '需要網路才能解鎖' : (e.message || '密碼錯誤');
      });
    }
    $('#pad').onclick = function (ev) {
      var b = ev.target.closest('button'); if (!b || S.busy) return;
      var k = b.getAttribute('data-k');
      if (k === 'del') pin = pin.slice(0, -1);
      else if (k === 'reset') {
        ask('重新設定這台手機？', '會清除這台手機上的小金庫設定，要重新貼上 App 設定碼。試算表裡的資料不會受影響。', '清除並重新設定', true).then(function (ok) {
          if (!ok) return;
          lsSet(LS_CFG, null); lsSet(LS_PK, null);
          S.cfg = null; renderSetup();
        });
        return;
      } else if (pin.length < 6) pin += k;
      m.textContent = '';
      paint();
      if (pin.length === 6) submit();
    };
    if (face) {
      $('#faceBtn').onclick = function () { if (!S.busy) faceIdLogin(m); };
      fetchChallenge().catch(function (e) { if (e.resp && /還沒啟用/.test(e.message)) { lsSet(LS_PK, null); $('#faceBtn').classList.add('hidden'); } });
    }
  }

  // 切到背景超過 5 分鐘要重新解鎖
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { S.hiddenAt = Date.now(); return; }
    if (S.session && S.hiddenAt && Date.now() - S.hiddenAt > LOCK_AFTER_MS) lock();
    else if (S.session && S.page === 'home' && !S.sub) refreshHome();
    S.hiddenAt = 0;
  });

  // ---------- 導覽 ----------
  function go(page) {
    if (!S.session) return renderUnlock();
    S.page = page;
    if (page !== 'settings') S.sub = null;
    tabs.classList.remove('hidden');
    $$('button', tabs).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-page') === page); });
    window.scrollTo(0, 0);
    ({ home: pageHome, trends: pageTrends, add: pageAdd, accounts: pageAccounts, settings: pageSettings })[page]();
  }
  tabs.onclick = function (ev) {
    var b = ev.target.closest('button[data-page]'); if (!b) return;
    var p = b.getAttribute('data-page');
    if (p === 'settings') S.sub = null;
    go(p);
  };

  function header(title, sub, right, back) {
    return '<div class="top"><div>' + (back ? '<button class="back" data-back>' + ICON.left + esc(back) + '</button>' : '') +
      '<h1>' + esc(title) + '</h1>' + (sub ? '<div class="sub" id="topSub">' + sub + '</div>' : '') + '</div><div>' + (right || '') + '</div></div>';
  }
  function loading(title, back) {
    app.innerHTML = header(title, '', '', back) + '<div class="grid"><div class="skeleton full" style="grid-column:1/-1"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
    var b = $('[data-back]'); if (b) b.onclick = function () { S.sub = null; pageSettings(); };
  }
  function failed(title, e) {
    if (e && e.message === 'locked') return;
    app.innerHTML = header(title) + (e && e.offline ? offlineView() : '<div class="offline"><div>讀取失敗：' + esc(e && e.message) + '</div><button class="chip-btn" data-act="reload">再試一次</button></div>');
    var b = $('[data-act="reload"]'); if (b) b.onclick = function () { go(S.page); };
  }

  // ---------- 圖表 ----------
  function sparkline(values) {
    if (values.length < 2) return '<div class="muted" style="margin-top:10px">對帳兩次以上，這裡會出現趨勢。</div>';
    var W = 300, H = 64, pad = 4;
    var min = Math.min.apply(null, values.concat([0])), max = Math.max.apply(null, values.concat([0]));
    if (max === min) max = min + 1;
    var x = function (i) { return pad + i * (W - pad * 2) / (values.length - 1); };
    var y = function (v) { return pad + (max - v) * (H - pad * 2) / (max - min); };
    var d = values.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
    var last = values[values.length - 1];
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<line x1="0" x2="' + W + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="var(--text2)" stroke-width="1" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" opacity=".6"/>' +
      '<path d="' + d + '" fill="none" stroke="' + (last >= 0 ? 'var(--asset)' : 'var(--debt)') + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>' +
      '</svg>';
  }

  function lineChart(labels, series) {
    var W = 340, H = 180, L = 44, R = 8, T = 10, B = 24;
    var all = [0];
    series.forEach(function (s) { all = all.concat(s.values); });
    var min = Math.min.apply(null, all), max = Math.max.apply(null, all);
    if (max === min) max = min + 1;
    var n = labels.length;
    var x = function (i) { return n === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (n - 1); };
    var y = function (v) { return T + (max - v) * (H - T - B) / (max - min); };
    var out = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="趨勢圖">';
    [max, 0, min].filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (v) {
      out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="' + (v === 0 ? 'var(--text2)' : 'var(--line)') + '"' + (v === 0 ? ' stroke-dasharray="4 4"' : '') + '/>' +
        '<text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="10" fill="var(--text2)">' + esc(wan(v).replace(' 萬', '萬')) + '</text>';
    });
    labels.forEach(function (lb, i) {
      if (n > 6 && i % Math.ceil(n / 6) && i !== n - 1) return;
      out += '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10" fill="var(--text2)">' + esc(lb) + '</text>';
    });
    series.forEach(function (s) {
      var d = s.values.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
      out += '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2.2" stroke-linejoin="round"' + (s.dash ? ' stroke-dasharray="5 4"' : '') + '/>';
      s.values.forEach(function (v, i) { out += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="2.5" fill="' + s.color + '"/>'; });
    });
    return out + '</svg>';
  }

  function barChart(rows) {
    var W = 340, H = 180, L = 44, R = 8, T = 10, B = 24;
    var max = 1;
    rows.forEach(function (r) { max = Math.max(max, r.income, r.expense); });
    var n = rows.length, slot = (W - L - R) / n, bw = Math.max(3, slot * 0.32);
    var y = function (v) { return T + (max - v) * (H - T - B) / max; };
    var out = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="每月收支">';
    [max, max / 2, 0].forEach(function (v) {
      out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)"/>' +
        '<text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="10" fill="var(--text2)">' + esc(wan(v).replace(' 萬', '萬')) + '</text>';
    });
    rows.forEach(function (r, i) {
      var cx = L + slot * i + slot / 2;
      out += '<rect x="' + (cx - bw - 1) + '" y="' + y(r.income) + '" width="' + bw + '" height="' + (y(0) - y(r.income)) + '" rx="2" fill="var(--asset)"/>';
      out += '<rect x="' + (cx + 1) + '" y="' + y(r.expense) + '" width="' + bw + '" height="' + (y(0) - y(r.expense)) + '" rx="2" fill="var(--debt)"/>';
      if (n <= 6 || i % 2 === (n - 1) % 2) out += '<text x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10" fill="var(--text2)">' + Number(r.month.slice(5)) + '月</text>';
    });
    return out + '</svg>';
  }

  // ---------- 首頁 ----------
  // 有上次的資料就先顯示，背景再更新
  function pageHome() {
    if (S.home) { renderHome(S.home, true); refreshHome(); return; }
    loading('小金庫');
    refreshHome();
  }

  function refreshHome() {
    return api('home').then(function (r) {
      S.home = r.data;
      if (S.page === 'home' && S.session) renderHome(r.data, false);
    }).catch(function (e) {
      if (S.page !== 'home') return;
      if (S.home) { var s = $('#topSub'); if (s) s.textContent = e.offline ? '沒有網路，顯示的是上次的數字' : '更新失敗：' + e.message; }
      else failed('小金庫', e);
    });
  }

  function renderHome(d, stale) {
    var y = window.scrollY;
    var v = d.vti, living = d.living, em = d.emergency;
    var livingPct = living.budget > 0 ? living.remaining / living.budget * 100 : 0;
    var vtiBody;
    if (!v.price) vtiBody = '<div class="muted">股價暫時抓不到</div>';
    else {
      vtiBody = '<div class="mid num ' + (v.triggered.length ? 'warn' : '') + '">−' + v.dropPct + '%</div>' +
        '<div class="muted num">現價 $' + usd(v.price) + '</div>';
      if (v.triggered.length) {
        var amt = v.triggered.reduce(function (a, t) { return a + t.amount; }, 0);
        vtiBody += '<div class="muted warn" style="margin-top:6px">已跌破 ' + esc(v.triggered[v.triggered.length - 1].label.replace('-', '−')) + '，可加碼 <span class="num">' + money(amt) + '</span></div>';
      } else if (v.next) {
        vtiBody += '<div class="muted num" style="margin-top:6px">下一階 −' + v.next.pct + '%　$' + usd(v.next.price) + '<br>還差 ' + v.next.distancePct + '%</div>';
      } else {
        vtiBody += '<div class="muted" style="margin-top:6px">加碼階梯都已完成</div>';
      }
    }
    var tips = (d.suggestions || []).map(function (s) { return '<p>' + esc(s.text) + '</p>'; }).join('') || '<p>目前一切正常，繼續保持。</p>';

    app.innerHTML =
      header('小金庫', stale ? '<span class="updating">更新中…</span>' : '更新於 ' + esc(d.asOf),
        '<button class="icon-btn" data-act="refresh" aria-label="重新整理">' + ICON.refresh + '</button><button class="icon-btn" data-act="lock" aria-label="鎖定">' + ICON.lock + '</button>') +
      (d.reconciled ? '' : '<div class="banner">還沒做過第一次對帳，淨資產先不準。到「帳戶」頁按「開始對帳」。</div>') +
      '<div class="grid">' +
      '<section class="card full"><h2>本月生活費剩多少</h2>' +
      '<div class="row"><div class="big num ' + (living.remaining < 0 ? 'debt' : livingPct < 20 ? 'warn' : '') + '">' + money(living.remaining) + '</div>' +
      '<span class="muted num">預算 ' + money(living.budget) + '</span></div>' +
      '<div class="bar ' + (livingPct < 20 ? 'warn' : '') + '"><i style="width:' + pct(livingPct) + '%"></i></div>' +
      '<div class="row"><span class="muted num">已花 ' + money(living.spent) + (living.topUp ? '・本月已補 ' + money(living.topUp) : '') + '</span>' +
      '<button class="chip-btn" style="margin:0" data-act="topup">補生活費</button></div></section>' +
      '<section class="card full"><h2>淨資產</h2>' +
      '<div class="big num ' + (d.netWorth < 0 ? 'debt' : '') + '">' + money(d.netWorth) + '</div>' +
      '<div class="row" style="margin-top:6px"><span class="muted">資產 <b class="asset num">' + money(d.assets) + '</b></span><span class="muted">負債 <b class="debt num">' + money(d.debtTotal) + '</b></span></div>' +
      sparkline((d.trend || []).map(function (t) { return t.net; })) +
      '</section>' +
      '<section class="card"><h2>300 萬進度</h2><div class="mid num">' + d.invest.pct + '%</div>' +
      '<div class="bar"><i style="width:' + pct(d.invest.pct) + '%"></i></div>' +
      '<div class="muted num">' + wan(d.invest.value) + ' / ' + wan(d.invest.goal) + '</div>' +
      (d.invest.vxus ? '<div class="muted num" style="font-size:12px">VTI ' + wan(d.invest.vti) + '・VXUS ' + wan(d.invest.vxus) + '</div>' : '') + '</section>' +
      '<section class="card"><h2>預備金</h2><div class="mid num">' + em.months + ' <span style="font-size:15px;font-weight:500">個月</span></div>' +
      '<div class="bar ' + (em.months < em.target ? 'warn' : '') + '"><i style="width:' + pct(em.months / em.target * 100) + '%"></i></div>' +
      '<div class="muted num">目標 ' + em.target + ' 個月・' + wan(em.amount) + '</div></section>' +
      '<section class="card"><h2>VTI 加碼提醒</h2>' + vtiBody + '</section>' +
      '<section class="card"><h2>負債</h2>' + d.debts.map(function (x) {
        return '<div class="row"><span class="muted" style="font-size:14px">' + esc(x.name) + '</span><span class="num debt" style="font-weight:600">' + wan(x.balance) + '</span></div>';
      }).join('') + '</section>' +
      '<section class="card full tip tips"><h2>' + ICON.bulb + '建議</h2>' + tips +
      '<button class="chip-btn" data-act="summary">複製本月摘要</button></section>' +
      '</div>';
    window.scrollTo(0, y);

    $('[data-act="refresh"]').onclick = function () {
      var s = $('#topSub'); if (s) s.innerHTML = '<span class="updating">更新中…</span>';
      refreshHome();
    };
    $('[data-act="lock"]').onclick = function () { lock(); };
    $('[data-act="topup"]').onclick = function () { topUpSheet(); };
    $('[data-act="summary"]').onclick = function () {
      var btn = this; btn.disabled = true;
      api('summary').then(function (r) {
        btn.disabled = false;
        return copyText(r.data.text).then(function () { toast('已複製，可以貼到 Claude 討論'); });
      }).catch(function (e) { btn.disabled = false; showError(e); });
    };
  }

  function topUpSheet() {
    sheet('<h3>補生活費</h3><div class="muted" style="margin:-8px 0 14px">轉錢到生活費帳戶之後，在這裡記一下補了多少，本月預算會跟著增加。</div>' +
      '<div class="field"><label for="tu">這次補了多少（元）</label>' + moneyInput('tu', '', 'amount') + '</div>' +
      '<button class="btn" data-ok>加到本月預算</button><button class="btn ghost" data-no>取消</button>', function (s) {
      setTimeout(function () { $('#tu').focus(); }, 300);
      $('[data-no]', s.el).onclick = s.close;
      $('[data-ok]', s.el).onclick = function () {
        var n = toNum($('#tu').value);
        if (!(n > 0)) return toast('請輸入金額');
        var btn = this; btn.disabled = true;
        api('topUpLiving', { amount: Math.round(n) }).then(function () {
          s.close(); toast('已補 ' + money(n) + ' 元'); refreshHome();
        }).catch(function (e) { btn.disabled = false; showError(e); });
      };
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).catch(function () { return fallbackCopy(text); });
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
  }

  // ---------- 記一筆 ----------
  var addState = { type: '支出', category: '' };

  function pageAdd() {
    var meta = S.meta;
    if (!meta) { loading('記一筆'); return api('meta').then(function (r) { S.meta = r.data; pageAdd(); }).catch(function (e) { failed('記一筆', e); }); }
    var cats = meta.categories[addState.type] || [];
    if (cats.indexOf(addState.category) < 0) addState.category = '';
    var tiers = (S.home && S.home.vti && S.home.vti.tiers) || [];
    app.innerHTML =
      header('記一筆', '平常用捷徑記就好，這裡適合補記或記投資、還款') +
      '<div class="stack">' +
      '<div class="seg" id="types">' + meta.types.map(function (t) { return '<button class="' + (t === addState.type ? 'on' : '') + '" data-t="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>' +
      '<div class="field"><label for="amt">金額（元）</label>' + moneyInput('amt', '', 'amount') + '</div>' +
      '<div class="field"><span class="label">分類</span><div class="chips" id="cats">' + cats.map(function (c) {
        return '<button class="' + (c === addState.category ? 'on' : '') + '" data-c="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field ' + (addState.type === '投資' && addState.category === '加碼' ? '' : 'hidden') + '" id="stageBox"><label for="stage">加碼階段</label><select class="in" id="stage">' +
      '<option value="年終首筆">年終首筆</option>' + tiers.map(function (t) { return '<option value="' + esc(t.label) + '">' + esc(t.label.replace('-', '−')) + '（$' + usd(t.price) + '）' + (t.recorded ? '・已記錄' : '') + '</option>'; }).join('') +
      '<option value="其他">其他</option></select></div>' +
      '<div class="field"><label for="note">備註（可不填）</label><input class="in" id="note" maxlength="100" autocomplete="off"></div>' +
      '<div class="field"><label for="date">日期</label><input class="in" id="date" type="date" value="' + todayTw() + '" max="' + todayTw() + '"></div>' +
      '<button class="btn" id="save">記下來</button>' +
      '</div>';
    bindMoney(app);

    $('#types').onclick = function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      addState.type = b.getAttribute('data-t'); addState.category = ''; pageAdd();
    };
    $('#cats').onclick = function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      addState.category = b.getAttribute('data-c');
      Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); });
      $('#stageBox').classList.toggle('hidden', !(addState.type === '投資' && addState.category === '加碼'));
    };
    $('#save').onclick = function () {
      var btn = this;
      var amount = toNum($('#amt').value);
      if (!(amount > 0)) return toast('請輸入金額');
      if (!addState.category) return toast('請選分類');
      var date = $('#date').value;
      var payload = { type: addState.type, category: addState.category, amount: Math.round(amount), note: $('#note').value };
      if (date && date !== todayTw()) payload.date = date + ' 12:00';
      if (addState.type === '投資' && addState.category === '加碼') {
        payload.stage = $('#stage').value;
        if (S.home && S.home.vti) payload.price = S.home.vti.price;
      }
      btn.disabled = true;
      api('add', payload).then(function () {
        toast('已記錄：' + payload.type + ' ' + payload.category + ' ' + money(payload.amount) + ' 元');
        addState.category = '';
        S.home = null;
        go('home');
      }).catch(function (e) { btn.disabled = false; showError(e); });
    };
  }

  // ---------- 趨勢 ----------
  var trendMonth = null;
  function pageTrends() {
    trendMonth = trendMonth || monthTw();
    loading('趨勢');
    api('trends', { month: trendMonth }).then(function (r) { if (S.page === 'trends') renderTrends(r.data); }).catch(function (e) { failed('趨勢', e); });
  }

  function renderTrends(d) {
    var worth = d.worth || [];
    var flow = d.flow || [];
    var catMax = d.categories.length ? d.categories[0].amount : 1;
    var catTotal = d.categories.reduce(function (a, c) { return a + c.amount; }, 0);
    app.innerHTML = header('趨勢') +
      '<div class="stack">' +
      '<section class="card"><h2>淨資產與投資資產</h2>' +
      (worth.length ? lineChart(worth.map(function (w) { return Number(w.month.slice(5)) + '月'; }), [
        { values: worth.map(function (w) { return w.net; }), color: 'var(--asset)' },
        { values: worth.map(function (w) { return w.invest; }), color: 'var(--warn)', dash: true },
      ]) + '<div class="legend"><span><i style="background:var(--asset)"></i>淨資產</span><span><i style="background:var(--warn)"></i>投資資產</span></div>'
        : '<div class="muted">每月對帳後，這裡會出現趨勢。</div>') +
      '</section>' +
      '<section class="card"><h2>每月收支（近 12 個月）</h2>' + barChart(flow.map(function (f) { return { month: f.month, income: f.income, expense: f.expenseSmoothed }; })) +
      '<div class="legend"><span><i style="background:var(--asset)"></i>收入</span><span><i style="background:var(--debt)"></i>支出（保險按月攤提）</span></div></section>' +
      '<section class="card"><div class="monthnav"><button class="icon-btn" data-m="-1" aria-label="上個月">' + ICON.left + '</button>' +
      '<h2 style="margin:0">' + esc(monthLabel(d.categoryMonth)) + '各分類支出</h2>' +
      '<button class="icon-btn" data-m="1" aria-label="下個月" ' + (d.categoryMonth >= monthTw() ? 'disabled style="opacity:.3"' : '') + '>' + ICON.right + '</button></div>' +
      (d.categories.length ? '<div class="muted num" style="margin:4px 0 10px">合計 ' + money(catTotal) + ' 元</div>' + d.categories.map(function (c) {
        return '<div class="hbar"><span>' + esc(c.category) + '</span><span class="track"><i style="width:' + (c.amount / catMax * 100) + '%"></i></span><span class="num">' + money(c.amount) + '</span></div>';
      }).join('') : '<div class="muted" style="margin-top:8px">這個月沒有支出紀錄。</div>') +
      '</section></div>';
    $$('[data-m]').forEach(function (b) {
      b.onclick = function () { trendMonth = shiftMonth(trendMonth, Number(b.getAttribute('data-m'))); pageTrends(); };
    });
  }

  // ---------- 帳戶 ----------
  var listMonth = null;
  function pageAccounts() {
    listMonth = listMonth || monthTw();
    loading('帳戶');
    Promise.all([api('reconcileInfo'), S.home ? Promise.resolve({ data: S.home }) : api('home'), api('list', { month: listMonth }), api('meta')])
      .then(function (rs) { S.home = rs[1].data; S.meta = rs[3].data; if (S.page === 'accounts') renderAccounts(rs[0].data, rs[1].data, rs[2].data); })
      .catch(function (e) { failed('帳戶', e); });
  }

  function renderAccounts(info, home, list) {
    var last = info.last || {};
    var accounts = (S.meta && S.meta.accounts) || [];
    var labels = (S.meta && S.meta.accountLabels) || {};
    var short = function (a) { return String(labels[a] || a).replace(/（.*$/, ''); };
    var cashTotal = accounts.reduce(function (t, a) { return t + (Number(last[a]) || 0); }, 0);

    var balances = info.last
      ? accounts.map(function (a) {
        return '<div class="bal-row"><span>' + esc(short(a)) + '</span><span class="num">' + (last[a] == null ? '—' : money(last[a])) + '</span></div>';
      }).join('') +
      '<div class="bal-row"><span>VTI</span><span class="num">' + (last.shares || 0) + ' 股</span></div>' +
      (last.vxusShares ? '<div class="bal-row"><span>VXUS</span><span class="num">' + last.vxusShares + ' 股</span></div>' : '') +
      '<div class="bal-total"><span>現金合計</span><span class="num">' + money(cashTotal) + '</span></div>'
      : '<div class="muted">還沒對帳過。按下面的按鈕，填入各帳戶目前的餘額。</div>';

    var form =
      '<div class="muted" style="margin-bottom:12px">打開各銀行 App，填目前餘額。已帶入上次的數字，有變的才改。</div>' +
      accounts.map(function (a) {
        return '<div class="field"><label for="acc-' + esc(a) + '">' + esc(labels[a] || a) + '</label>' +
          moneyInput('acc-' + a, last[a] != null ? last[a] : '').replace('<input ', '<input data-acc="' + esc(a) + '" ') + '</div>';
      }).join('') +
      '<div class="two"><div class="field"><label for="shares">VTI 股數</label><input class="in num" id="shares" inputmode="decimal" value="' + (last.shares != null ? last.shares : '') + '" placeholder="0"></div>' +
      '<div class="field"><label for="vxus">VXUS 股數</label><input class="in num" id="vxus" inputmode="decimal" value="' + (last.vxusShares != null ? last.vxusShares : '') + '" placeholder="0"></div></div>' +
      (info.otherIsNew ? '<div class="muted" style="margin:-4px 0 12px">「其他帳戶」是第一次填，這次不會算進差額。</div>' : '') +
      (info.expected != null ? '<div class="row" style="margin-bottom:4px"><span class="muted">記帳推算應該有</span><span class="num">' + money(info.expected) + '</span></div>' +
        '<div class="row" style="margin-bottom:14px"><span class="muted">實際 − 推算</span><span class="num" id="diff">—</span></div>' : '') +
      '<button class="btn" id="rec">完成對帳</button><button class="btn ghost" id="recCancel">先不要</button>';

    app.innerHTML = header('帳戶', info.last ? '上次對帳 ' + esc(info.last.date) : '還沒對帳過') +
      '<section class="card"><h2>各帳戶餘額</h2>' + balances +
      '<button class="btn" id="recOpen" style="margin-top:14px">開始對帳</button>' +
      '<div id="recForm" class="hidden" style="margin-top:16px">' + form + '</div></section>' +

      '<div class="section-title">負債</div><div class="list">' + home.debts.map(function (d) {
        return '<div class="item"><div class="grow"><div class="title">' + esc(d.name) + '</div><div class="meta">利率 ' + (d.rate * 100).toFixed(3).replace(/\.?0+$/, '') + '%' +
          (d.monthlyInterest ? '・每月利息約 ' + money(d.monthlyInterest) : '') + (d.deferDate ? '・延繳到期 ' + esc(d.deferDate) : '') + '</div></div><div class="amt num debt">' + money(d.balance) + '</div></div>';
      }).join('') + '</div>' +

      '<div class="section-title monthnav"><button class="icon-btn" data-m="-1" aria-label="上個月">' + ICON.left + '</button><span>' + esc(monthLabel(list.month)) + '明細</span>' +
      '<button class="icon-btn" data-m="1" aria-label="下個月" ' + (list.month >= monthTw() ? 'disabled style="opacity:.3"' : '') + '>' + ICON.right + '</button></div>' +
      '<div class="muted" style="margin:-4px 0 8px">點一筆可以修改或刪除。</div>' +
      '<div class="list" id="txlist">' + (list.items.length ? list.items.map(function (t) {
        var sign = t.type === '收入' ? '+' : '−';
        var cls = t.type === '收入' ? 'asset' : t.type === '支出' ? '' : 'muted';
        return '<div class="item" data-id="' + esc(t.id) + '" role="button" tabindex="0"><div class="grow"><div class="title">' + esc(t.category) + (t.note ? '・' + esc(t.note) : '') + '</div>' +
          '<div class="meta">' + esc(t.date.slice(5)) + '・' + esc(t.type) + '・' + esc(t.source) + '</div></div><div class="amt num ' + cls + '">' + sign + money(t.amount) + '</div>' + ICON.chev + '</div>';
      }).join('') : '<div class="empty">這個月還沒有紀錄</div>') + '</div>';
    bindMoney(app);

    var formEl = $('#recForm'), openBtn = $('#recOpen');
    openBtn.onclick = function () { formEl.classList.remove('hidden'); openBtn.classList.add('hidden'); };
    $('#recCancel').onclick = function () { formEl.classList.add('hidden'); openBtn.classList.remove('hidden'); };
    if (!info.last) openBtn.onclick();

    var inputs = $$('[data-acc]');
    function sumActual() {
      var sum = 0, ok = true;
      inputs.forEach(function (i) {
        var isNewOther = info.otherIsNew && i.getAttribute('data-acc') === '其他';
        var n = toNum(i.value);
        if (isNaN(n) || i.value === '') { if (!isNewOther && i.getAttribute('data-acc') !== '其他') ok = false; } else if (!isNewOther) sum += n;
      });
      return ok ? sum : null;
    }
    function updateDiff() {
      var el = $('#diff'); if (!el) return;
      var sum = sumActual();
      if (sum == null) { el.textContent = '—'; el.className = 'num'; return; }
      var diff = Math.round(sum - info.expected);
      el.textContent = (diff > 0 ? '+' : '') + money(diff);
      el.className = 'num ' + (diff < 0 ? 'debt' : diff > 0 ? 'asset' : '');
    }
    inputs.forEach(function (i) { i.addEventListener('input', updateDiff); });
    updateDiff();

    $('#rec').onclick = function () {
      var btn = this, data = {};
      for (var k = 0; k < inputs.length; k++) {
        var name = inputs[k].getAttribute('data-acc');
        var n = toNum(inputs[k].value);
        if (name === '其他' && inputs[k].value === '') n = 0;
        else if (inputs[k].value === '' || isNaN(n) || n < 0) return toast('請填' + short(name) + '的餘額');
        data[name] = Math.round(n);
      }
      var sh = toNum($('#shares').value);
      if ($('#shares').value === '' || isNaN(sh) || sh < 0) return toast('請填 VTI 股數');
      data.shares = sh;
      var vx = $('#vxus').value === '' ? 0 : toNum($('#vxus').value);
      if (isNaN(vx) || vx < 0) return toast('VXUS 股數格式不對');
      data.vxusShares = vx;
      var diffText = $('#diff') ? $('#diff').textContent : '';
      ask('確定完成對帳？', info.expected != null ? '實際比記帳推算的 <b class="num">' + esc(diffText) + '</b> 元。差額會自動補記一筆。' : '這是第一次對帳，會記下目前的數字當作起點。', '完成對帳').then(function (ok) {
        if (!ok) return;
        btn.disabled = true;
        api('reconcile', data).then(function (r) {
          S.home = null;
          return notice('對帳完成', esc(r.data.message));
        }).then(function () { pageAccounts(); }).catch(function (e) { btn.disabled = false; showError(e); });
      });
    };

    $$('[data-m]').forEach(function (b) {
      b.onclick = function () { listMonth = shiftMonth(listMonth, Number(b.getAttribute('data-m'))); pageAccounts(); };
    });

    $('#txlist').onclick = function (ev) {
      var row = ev.target.closest('[data-id]'); if (!row) return;
      var t = list.items.filter(function (x) { return x.id === row.getAttribute('data-id'); })[0];
      if (t) editTxSheet(t);
    };
  }

  function editTxSheet(t) {
    var cats = (S.meta && S.meta.categories[t.type]) || [t.category];
    if (cats.indexOf(t.category) < 0) cats = [t.category].concat(cats);
    var cat = t.category;
    var date = t.date.slice(0, 10);
    sheet('<h3>修改這一筆</h3><div class="muted" style="margin:-8px 0 14px">' + esc(t.type) + '・來源：' + esc(t.source) + '</div>' +
      '<div class="field"><label for="eAmt">金額（元）</label>' + moneyInput('eAmt', t.amount, 'amount') + '</div>' +
      '<div class="field"><span class="label">分類</span><div class="chips" id="eCats">' + cats.map(function (c) {
        return '<button class="' + (c === cat ? 'on' : '') + '" data-c="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field"><label for="eNote">備註</label><input class="in" id="eNote" maxlength="100" value="' + esc(t.note) + '"></div>' +
      '<div class="field"><label for="eDate">日期</label><input class="in" id="eDate" type="date" value="' + esc(date) + '" max="' + todayTw() + '"></div>' +
      '<button class="btn" data-save>儲存修改</button>' +
      '<button class="btn danger" data-del>刪除這筆</button>' +
      '<button class="btn ghost" data-no>取消</button>', function (s) {
      $('#eCats', s.el).onclick = function (ev) {
        var b = ev.target.closest('button'); if (!b) return;
        cat = b.getAttribute('data-c');
        $$('button', this).forEach(function (x) { x.classList.toggle('on', x === b); });
      };
      $('[data-no]', s.el).onclick = s.close;
      $('[data-save]', s.el).onclick = function () {
        var n = toNum($('#eAmt').value);
        if (!(n > 0)) return toast('金額要大於 0');
        var d = $('#eDate').value;
        var payload = { id: t.id, amount: Math.round(n), category: cat, note: $('#eNote').value };
        if (d && d !== date) payload.date = d + ' 12:00';
        var btn = this; btn.disabled = true;
        api('edit', payload).then(function () { s.close(); toast('已修改'); S.home = null; pageAccounts(); })
          .catch(function (e) { btn.disabled = false; showError(e); });
      };
      var delBtn = $('[data-del]', s.el), armed = false;
      delBtn.onclick = function () {
        if (!armed) { armed = true; delBtn.textContent = '再按一次確定刪除'; return; }
        delBtn.disabled = true;
        api('delete', { id: t.id }).then(function () { s.close(); toast('已刪除'); S.home = null; pageAccounts(); })
          .catch(function (e) { delBtn.disabled = false; showError(e); });
      };
    });
  }

  // ---------- 設定 ----------
  var SUBS = [
    { key: 'goals', title: '目標與預算', hint: '投資目標、生活費、加碼' },
    { key: 'fixed', title: '固定支出', hint: '每月自動入帳的項目' },
    { key: 'debts', title: '負債', hint: '學貸、借款' },
    { key: 'security', title: 'Face ID 與密碼', hint: '' },
    { key: 'look', title: '外觀', hint: '' },
  ];

  function pageSettings() {
    if (S.sub) return renderSub();
    app.innerHTML = header('設定') +
      '<div class="menu">' + SUBS.map(function (x) {
        var hint = x.key === 'security' ? (hasFaceId() ? 'Face ID 已啟用' : 'Face ID 未啟用') : x.key === 'look' ? ((S.meta && S.meta.theme) || '自動') : x.hint;
        return '<button data-sub="' + x.key + '"><span class="grow">' + esc(x.title) + '</span><span class="hint">' + esc(hint) + '</span>' + ICON.chev + '</button>';
      }).join('') + '</div>' +
      '<div class="section-title">這台手機</div>' +
      '<div class="menu"><button id="lockNow"><span class="grow">立即鎖定</span>' + ICON.chev + '</button>' +
      '<button id="forget"><span class="grow debt">清除這台手機的設定</span>' + ICON.chev + '</button></div>' +
      '<div class="muted" style="text-align:center;margin-top:16px">小金庫 v2</div>';
    $$('[data-sub]').forEach(function (b) { b.onclick = function () { S.sub = b.getAttribute('data-sub'); window.scrollTo(0, 0); renderSub(); }; });
    $('#lockNow').onclick = function () { lock(); };
    $('#forget').onclick = function () {
      ask('清除這台手機的設定？', '清除後要重新貼上 App 設定碼才能使用。試算表裡的資料不會受影響。', '清除', true).then(function (ok) {
        if (!ok) return;
        lsSet(LS_CFG, null); lsSet(LS_PK, null);
        if (S.session) api('logout', {}, { noLock: true }).catch(function () {});
        S.cfg = null; S.session = null;
        renderSetup();
      });
    };
  }

  function loadSettings() {
    if (S.settings) return Promise.resolve(S.settings);
    return api('getSettings').then(function (r) { S.settings = r.data; return r.data; });
  }

  function renderSub() {
    var info = SUBS.filter(function (x) { return x.key === S.sub; })[0];
    loading(info.title, '設定');
    loadSettings().then(function (d) {
      if (S.page !== 'settings' || S.sub !== info.key) return;
      ({ goals: subGoals, fixed: subFixed, debts: subDebts, security: subSecurity, look: subLook })[info.key](d, info);
      var b = $('[data-back]'); if (b) b.onclick = function () { S.sub = null; window.scrollTo(0, 0); pageSettings(); };
    }).catch(function (e) { failed(info.title, e); });
  }

  function subGoals(d, info) {
    var s = d.settings, meta = d.meta;
    var livingCats = String(s['生活費類別'] || '').split(/[、,，\s]+/).filter(Boolean);
    var tiers = String(s['加碼階梯'] || '').split(/[、,，\s]+/).filter(Boolean).map(function (p) {
      var m = p.match(/^-?(\d+(?:\.\d+)?)%?[:：](\d+)$/); return m ? { pct: m[1], amount: m[2] } : null;
    }).filter(Boolean);
    while (tiers.length < 3) tiers.push({ pct: '', amount: '' });
    function moneyField(k, label, hint) {
      return '<div class="field"><label for="s-' + k + '">' + esc(label) + '</label>' + moneyInput('s-' + k, s[k]).replace('<input ', '<input data-s="' + esc(k) + '" ') +
        (hint ? '<div class="muted" style="margin-top:4px">' + esc(hint) + '</div>' : '') + '</div>';
    }
    app.innerHTML = header(info.title, '', '', '設定') +
      '<section class="card">' +
      moneyField('生活費預算', '每月生活費預算（元）') +
      '<div class="field"><span class="label">生活費包含的分類</span><div class="chips" id="livingCats">' + meta.categories['支出'].map(function (c) {
        return '<button class="' + (livingCats.indexOf(c) >= 0 ? 'on' : '') + '" data-c="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('') + '</div></div>' +
      moneyField('投資目標', '投資目標（元）') +
      '<div class="field"><label for="s-em">預備金目標（個月）</label><input class="in num" id="s-em" data-s="預備金目標月數" inputmode="numeric" value="' + esc(s['預備金目標月數']) + '"></div>' +
      moneyField('每月必要支出預設', '每月必要支出預設（元）', '記帳資料不足 3 個月時用這個數字算預備金月數') +
      moneyField('買車基金', '買車基金已分配（元）', '預備金 = 預備金帳戶餘額 − 買車基金') +
      '</section>' +
      '<div class="section-title">VTI 加碼</div><section class="card">' +
      '<div class="muted" style="margin-bottom:10px">從 52 週高點（$' + usd(d.quote.high52) + '）下跌多少 % 時，加碼多少元。</div>' +
      tiers.map(function (t, i) {
        return '<div class="two"><div class="field"><label for="tp' + i + '">第 ' + (i + 1) + ' 階 跌幅 %</label><input class="in num" id="tp' + i + '" data-tp inputmode="decimal" value="' + esc(t.pct) + '"></div>' +
          '<div class="field"><label for="ta' + i + '">加碼金額</label>' + moneyInput('ta' + i, t.amount).replace('<input ', '<input data-ta ') + '</div></div>';
      }).join('') +
      '<div class="field"><label for="s-deadline">加碼期限</label><input class="in" type="date" id="s-deadline" data-s="加碼期限" value="' + esc(s['加碼期限']) + '"></div>' +
      '</section>' +
      '<div class="section-title">通知</div><section class="card">' +
      '<div class="field"><label for="s-email">提醒信寄到</label><input class="in" type="email" id="s-email" data-s="通知Email" value="' + esc(s['通知Email']) + '" autocapitalize="off"></div>' +
      '</section>' +
      '<button class="btn" id="saveS" style="margin-top:16px">儲存</button>';
    bindMoney(app);
    $('#livingCats').onclick = function (ev) { var b = ev.target.closest('button'); if (b) b.classList.toggle('on'); };
    $('#saveS').onclick = function () {
      var btn = this, out = {};
      $$('[data-s]').forEach(function (i) { out[i.getAttribute('data-s')] = String(i.value).replace(/,/g, ''); });
      var cats = $$('#livingCats button.on').map(function (x) { return x.getAttribute('data-c'); });
      if (!cats.length) return toast('生活費至少要選一個分類');
      out['生活費類別'] = cats.join('、');
      var tp = $$('[data-tp]'), ta = $$('[data-ta]'), parts = [];
      for (var i = 0; i < tp.length; i++) {
        var p = toNum(tp[i].value), a = toNum(ta[i].value);
        if (tp[i].value === '' && ta[i].value === '') continue;
        if (!(p > 0 && p < 100) || !(a > 0)) return toast('第 ' + (i + 1) + ' 階的跌幅或金額不對');
        parts.push(p + ':' + Math.round(a));
      }
      if (!parts.length) return toast('至少要有一階加碼');
      out['加碼階梯'] = parts.join('、');
      btn.disabled = true;
      api('saveSettings', { settings: out }).then(function (r) { btn.disabled = false; S.settings = r.data; S.home = null; toast('已儲存'); })
        .catch(function (e) { btn.disabled = false; showError(e); });
    };
  }

  function fixedCats(meta) { return meta.categories['支出'].concat(meta.categories['投資'], meta.categories['還款']); }

  function subFixed(d, info) {
    app.innerHTML = header(info.title, '', '', '設定') +
      '<div class="muted" style="margin-bottom:10px">每個月會花、金額差不多的錢。到了入帳日，系統會自動幫你記一筆，<b>這些就不用再用捷徑記</b>。金額有差，到「帳戶」頁的明細改那一筆就好。</div>' +
      '<div class="list" id="fixedList">' + (d.fixed.length ? d.fixed.map(function (f, i) {
        var when = f.freq === '每年' ? '每年 ' + f.month + ' 月 ' + f.day + ' 號' : '每月 ' + f.day + ' 號';
        return '<div class="item" data-i="' + i + '" role="button" tabindex="0"><div class="grow"><div class="title' + (f.enabled ? '' : ' muted') + '">' + esc(f.name) + (f.enabled ? '' : '（暫停）') + '</div>' +
          '<div class="meta">' + esc(f.category) + '・' + esc(when) + '</div></div><div class="amt num">' + money(f.amount) + '</div>' + ICON.chev + '</div>';
      }).join('') : '<div class="empty">還沒有固定支出</div>') + '</div>' +
      '<button class="btn ghost" id="addF" style="margin-top:12px">新增一項</button>';
    $('#fixedList').onclick = function (ev) {
      var row = ev.target.closest('[data-i]'); if (row) fixedSheet(d, Number(row.getAttribute('data-i')));
    };
    $('#addF').onclick = function () { fixedSheet(d, -1); };
  }

  function fixedSheet(d, idx) {
    var isNew = idx < 0;
    var f = isNew ? { name: '', category: '餐費', amount: '', freq: '每月', day: 5, month: 3, enabled: true } : d.fixed[idx];
    var cats = fixedCats(d.meta);
    var freq = f.freq;
    sheet('<h3>' + (isNew ? '新增固定支出' : '修改固定支出') + '</h3>' +
      '<div class="field"><label for="fName">名稱</label><input class="in" id="fName" value="' + esc(f.name) + '" placeholder="例如：房租"></div>' +
      '<div class="field"><label for="fAmt">金額（元）</label>' + moneyInput('fAmt', f.amount) + '</div>' +
      '<div class="field"><label for="fCat">分類</label><select class="in" id="fCat">' + cats.map(function (c) { return '<option' + (c === f.category ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><span class="label">頻率</span><div class="seg" id="fFreq"><button class="' + (freq === '每月' ? 'on' : '') + '">每月</button><button class="' + (freq === '每年' ? 'on' : '') + '">每年</button></div></div>' +
      '<div class="two"><div class="field' + (freq === '每年' ? '' : ' hidden') + '" id="fMonthBox"><label for="fMonth">幾月</label><input class="in num" id="fMonth" inputmode="numeric" value="' + esc(f.month) + '"></div>' +
      '<div class="field"><label for="fDay">幾號入帳</label><input class="in num" id="fDay" inputmode="numeric" value="' + esc(f.day) + '"></div></div>' +
      '<div class="row" style="align-items:center;margin-bottom:16px"><span>啟用（關掉就暫停自動入帳）</span><label class="toggle"><input type="checkbox" id="fOn"' + (f.enabled ? ' checked' : '') + '><span></span></label></div>' +
      '<button class="btn" data-save>儲存</button>' + (isNew ? '' : '<button class="btn danger" data-del>刪除這一項</button>') + '<button class="btn ghost" data-no>取消</button>', function (s) {
      $('#fFreq', s.el).onclick = function (ev) {
        var b = ev.target.closest('button'); if (!b) return;
        freq = b.textContent;
        $$('button', this).forEach(function (x) { x.classList.toggle('on', x === b); });
        $('#fMonthBox', s.el).classList.toggle('hidden', freq !== '每年');
      };
      $('[data-no]', s.el).onclick = s.close;
      function save(list, btn, msg) {
        btn.disabled = true;
        api('saveFixed', { items: list }).then(function (r) { s.close(); S.settings = r.data; toast(msg); renderSub(); })
          .catch(function (e) { btn.disabled = false; showError(e); });
      }
      $('[data-save]', s.el).onclick = function () {
        var item = { name: $('#fName').value.trim(), category: $('#fCat').value, amount: toNum($('#fAmt').value), freq: freq, day: toNum($('#fDay').value), month: toNum($('#fMonth').value), enabled: $('#fOn').checked };
        if (!item.name) return toast('請填名稱');
        if (!(item.amount >= 0)) return toast('請填金額');
        if (!(item.day >= 1 && item.day <= 31)) return toast('入帳日要是 1 到 31');
        if (freq === '每年' && !(item.month >= 1 && item.month <= 12)) return toast('月份要是 1 到 12');
        var list = d.fixed.slice();
        if (isNew) list.push(item); else list[idx] = item;
        save(list, this, '已儲存');
      };
      var del = $('[data-del]', s.el), armed = false;
      if (del) del.onclick = function () {
        if (!armed) { armed = true; del.textContent = '再按一次確定刪除'; return; }
        save(d.fixed.filter(function (_, i) { return i !== idx; }), del, '已刪除');
      };
    });
  }

  function subDebts(d, info) {
    app.innerHTML = header(info.title, '', '', '設定') +
      '<div class="muted" style="margin-bottom:10px">用「記一筆 → 還款」還本金時，餘額會自動減少。</div>' +
      '<div class="list" id="debtList">' + (d.debts.length ? d.debts.map(function (x, i) {
        return '<div class="item" data-i="' + i + '" role="button" tabindex="0"><div class="grow"><div class="title">' + esc(x.name) + '</div>' +
          '<div class="meta">利率 ' + (Math.round(x.rate * 100000) / 1000) + '%' + (x.deferDate ? '・延繳到期 ' + esc(x.deferDate) : '') + '</div></div><div class="amt num debt">' + money(x.balance) + '</div>' + ICON.chev + '</div>';
      }).join('') : '<div class="empty">沒有負債</div>') + '</div>' +
      '<button class="btn ghost" id="addD" style="margin-top:12px">新增一項</button>';
    $('#debtList').onclick = function (ev) { var row = ev.target.closest('[data-i]'); if (row) debtSheet(d, Number(row.getAttribute('data-i'))); };
    $('#addD').onclick = function () { debtSheet(d, -1); };
  }

  function debtSheet(d, idx) {
    var isNew = idx < 0;
    var x = isNew ? { name: '', balance: '', rate: 0, deferDate: '', note: '' } : d.debts[idx];
    sheet('<h3>' + (isNew ? '新增負債' : '修改負債') + '</h3>' +
      '<div class="field"><label for="dName">名稱</label><input class="in" id="dName" value="' + esc(x.name) + '"></div>' +
      '<div class="two"><div class="field"><label for="dBal">餘額（元）</label>' + moneyInput('dBal', x.balance) + '</div>' +
      '<div class="field"><label for="dRate">年利率 %</label><input class="in num" id="dRate" inputmode="decimal" value="' + esc(Math.round(x.rate * 100000) / 1000) + '"></div></div>' +
      '<div class="field"><label for="dDate">延繳到期日（沒有就留空）</label><input class="in" type="date" id="dDate" value="' + esc(x.deferDate || '') + '"></div>' +
      '<div class="field"><label for="dNote">備註</label><input class="in" id="dNote" value="' + esc(x.note) + '"></div>' +
      '<button class="btn" data-save>儲存</button>' + (isNew ? '' : '<button class="btn danger" data-del>刪除這一項</button>') + '<button class="btn ghost" data-no>取消</button>', function (s) {
      $('[data-no]', s.el).onclick = s.close;
      function pack(list) { return list.map(function (y) { return { name: y.name, balance: y.balance, rate: (Math.round(Number(y.rate) * 100000) / 1000) + '%', deferDate: y.deferDate || '', note: y.note || '' }; }); }
      function save(list, btn, msg) {
        btn.disabled = true;
        api('saveDebts', { debts: list }).then(function (r) { s.close(); S.settings = r.data; S.home = null; S.meta = null; toast(msg); renderSub(); })
          .catch(function (e) { btn.disabled = false; showError(e); });
      }
      $('[data-save]', s.el).onclick = function () {
        var name = $('#dName').value.trim(), bal = toNum($('#dBal').value), rate = toNum($('#dRate').value);
        if (!name) return toast('請填名稱');
        if (!(bal >= 0)) return toast('請填餘額');
        if (!(rate >= 0)) return toast('利率格式不對');
        var list = pack(d.debts);
        var item = { name: name, balance: bal, rate: rate + '%', deferDate: $('#dDate').value, note: $('#dNote').value };
        if (isNew) list.push(item); else list[idx] = item;
        save(list, this, '已儲存');
      };
      var del = $('[data-del]', s.el), armed = false;
      if (del) del.onclick = function () {
        if (!armed) { armed = true; del.textContent = '再按一次確定刪除'; return; }
        save(pack(d.debts.filter(function (_, i) { return i !== idx; })), del, '已刪除');
      };
    });
  }

  function subSecurity(d, info) {
    var supported = !!window.PublicKeyCredential;
    var on = hasFaceId();
    app.innerHTML = header(info.title, '', '', '設定') +
      '<div class="section-title" style="margin-top:0">Face ID</div><section class="card">' +
      (supported
        ? '<div style="margin-bottom:12px">' + (on ? '這台手機已啟用 Face ID。打開小金庫時看一下手機就能解鎖，密碼仍然可以用。' : '啟用後，打開小金庫時看一下手機就能解鎖，不用輸入密碼。') + '</div>' +
        (on ? '<button class="btn danger" id="pkOff">停用這台手機的 Face ID</button>' : '<button class="btn" id="pkOn" disabled>準備中…</button>') +
        '<div class="msg" id="pkMsg" style="margin-top:8px"></div>'
        : '<div class="muted">這個瀏覽器不支援 Face ID 登入。請從主畫面的小金庫圖示打開。</div>') +
      '</section>' +
      '<div class="section-title">修改 6 位數密碼</div><section class="card">' +
      '<div class="field"><label for="p0">目前密碼</label><input class="in num" id="p0" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password"></div>' +
      '<div class="field"><label for="p1">新密碼</label><input class="in num" id="p1" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>' +
      '<div class="field"><label for="p2">再輸入一次新密碼</label><input class="in num" id="p2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>' +
      '<button class="btn" id="saveP">更新密碼</button></section>';

    if (supported && !on) {
      var reg = null, btn = $('#pkOn'), m = $('#pkMsg');
      var prep = function () {
        btn.disabled = true; btn.textContent = '準備中…';
        api('passkeyRegStart').then(function (r) { reg = { r: r, at: Date.now() }; btn.disabled = false; btn.textContent = '啟用 Face ID'; })
          .catch(function (e) { m.textContent = e.offline ? '需要網路' : e.message; });
      };
      prep();
      btn.onclick = function () {
        if (!reg || Date.now() - reg.at > 240000) return prep();
        var r = reg.r; reg = null; btn.disabled = true;
        navigator.credentials.create({
          publicKey: {
            challenge: b64uToBuf(r.challenge),
            rp: { name: '小金庫', id: location.hostname },
            user: { id: new TextEncoder().encode(r.userId), name: '小金庫', displayName: '小金庫' },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
            authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
            excludeCredentials: (r.exclude || []).map(function (id) { return { type: 'public-key', id: b64uToBuf(id) }; }),
            attestation: 'none',
            timeout: 60000,
          },
        }).then(function (cred) {
          var att = cborDecode(new Uint8Array(cred.response.attestationObject));
          var authData = att.authData;
          var idLen = (authData[53] << 8) | authData[54];
          var cose = cborDecode(authData.slice(55 + idLen));
          var x = cose.get(-2), y = cose.get(-3);
          if (cose.get(3) !== -7 || !x || !y) throw new Error('這台手機的金鑰格式不支援');
          m.textContent = '儲存中…';
          return api('passkeyRegFinish', {
            id: bufToB64u(cred.rawId), x: bufToHex(x), y: bufToHex(y),
            clientDataJSON: bufToB64u(cred.response.clientDataJSON), authenticatorData: bufToB64u(authData), device: 'iPhone',
          }).then(function () { lsSet(LS_PK, bufToB64u(cred.rawId)); toast('Face ID 已啟用'); renderSub(); });
        }).catch(function (e) {
          m.textContent = e && e.name === 'NotAllowedError' ? '已取消' : e && e.name === 'InvalidStateError' ? '這台手機已經啟用過，請先停用再重新啟用' : ((e && e.message) || '啟用失敗');
          prep();
        });
      };
    }
    if (on) {
      $('#pkOff').onclick = function () {
        ask('停用 Face ID？', '停用後要用 6 位數密碼解鎖。之後可以再重新啟用。', '停用', true).then(function (ok) {
          if (!ok) return;
          var id = lsGet(LS_PK);
          api('passkeyRemove', { id: id }).catch(function () {}).then(function () { lsSet(LS_PK, null); toast('已停用'); renderSub(); });
        });
      };
    }
    $('#saveP').onclick = function () {
      var p0 = $('#p0').value, p1 = $('#p1').value, p2 = $('#p2').value;
      if (!/^\d{6}$/.test(p1)) return toast('新密碼要是 6 位數字');
      if (p1 !== p2) return toast('兩次輸入的新密碼不一樣');
      var b = this; b.disabled = true;
      api('changePin', { oldPin: p0, newPin: p1 }).then(function () {
        b.disabled = false; toast('密碼已更新');
        ['p0', 'p1', 'p2'].forEach(function (id) { $('#' + id).value = ''; });
      }).catch(function (e) { b.disabled = false; showError(e); });
    };
  }

  function subLook(d, info) {
    var cur = d.settings['外觀'] || '自動';
    app.innerHTML = header(info.title, '', '', '設定') +
      '<div class="seg" id="theme">' + ['自動', '淺色', '深色'].map(function (t) { return '<button class="' + (cur === t ? 'on' : '') + '">' + t + '</button>'; }).join('') + '</div>' +
      '<div class="muted" style="margin-top:10px">「自動」會跟著 iPhone 的淺色／深色模式切換。</div>';
    $('#theme').onclick = function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      var t = b.textContent;
      theme(t);
      $$('button', this).forEach(function (x) { x.classList.toggle('on', x === b); });
      api('saveSettings', { settings: { '外觀': t } }).then(function (r) { S.settings = r.data; if (S.meta) S.meta.theme = t; }).catch(showError);
    };
  }

  // ---------- 最小 CBOR 解碼（只用來讀 Face ID 註冊時的公鑰） ----------
  function cborDecode(bytes) {
    var pos = 0;
    function len(info) {
      if (info < 24) return info;
      var n = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : -1;
      if (n < 0) throw new Error('CBOR 格式不支援');
      var v = 0;
      for (var i = 0; i < n; i++) v = v * 256 + bytes[pos++];
      return v;
    }
    function item() {
      var b = bytes[pos++], major = b >> 5, info = b & 31;
      if (major === 0) return len(info);
      if (major === 1) return -1 - len(info);
      if (major === 2) { var l = len(info); var out = bytes.slice(pos, pos + l); pos += l; return out; }
      if (major === 3) { var l2 = len(info); var s = new TextDecoder().decode(bytes.slice(pos, pos + l2)); pos += l2; return s; }
      if (major === 4) { var n = len(info), arr = []; for (var i = 0; i < n; i++) arr.push(item()); return arr; }
      if (major === 5) {
        var m = len(info), map = new Map();
        for (var j = 0; j < m; j++) { var k = item(); map.set(k, item()); }
        map.authData = map.get('authData');
        return map;
      }
      if (major === 7) return info === 20 ? false : info === 21 ? true : null;
      throw new Error('CBOR 格式不支援');
    }
    return item();
  }

  // ---------- 啟動 ----------
  window.addEventListener('online', function () { if (S.session && $('.offline')) go(S.page); });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

  S.cfg = loadCfg();
  if (!S.cfg) renderSetup();
  else renderUnlock();
})();
