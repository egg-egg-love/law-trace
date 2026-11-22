/* =========================================================
   Law Trace 法痕律迹 v4.2 — application
   No external dependencies. All knowledge is local.
   ========================================================= */
(() => {
  'use strict';

  /* -----------------------------------------------------
     Utilities
     ----------------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const blank = '<span class="doc-blank">＿＿＿＿＿＿</span>';
  const uid = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtMoney = (n) => Number(n || 0).toLocaleString('zh-CN');

  const CN_DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const CN_UNITS = { 十: 10, 百: 100, 千: 1000 };
  function cnNumber(value) {
    if (/^\d+$/.test(value)) return Number(value);
    let total = 0;
    let section = 0;
    let num = 0;
    for (const ch of value) {
      if (ch in CN_DIGITS) num = CN_DIGITS[ch];
      else if (ch in CN_UNITS) { section += (num || 1) * CN_UNITS[ch]; num = 0; }
      else return null;
    }
    return total + section + num;
  }

  function parseCitationCode(code) {
    const m = String(code || '').match(/^《([^》]+)》第([0-9一二三四五六七八九十百千零〇两]+)条(之[一二三四五六七八九十]+)?/);
    if (!m) return null;
    return { law: m[1], arabic: cnNumber(m[2]), suffix: m[3] || '' };
  }

  function hydrateLegalCitations() {
    const corpus = window.LT_LEGAL;
    if (!corpus || !corpus.articles) return { verified: 0, missing: 0 };
    let verified = 0;
    let missing = 0;
    const hydrate = (obj) => {
      if (!obj || !obj.code) return;
      const parsed = parseCitationCode(obj.code);
      if (!parsed) { missing += 1; return; }
      const rec = corpus.articles[`${parsed.law}|${parsed.arabic}${parsed.suffix}`];
      if (!rec) {
        missing += 1;
        obj.verified = false;
        console.warn('[LawTrace] 未在官方法律库中核验到引用：', obj.code);
        return;
      }
      obj.text = rec.text;
      obj.code = `《${parsed.law}》${rec.article}`;
      obj.law = parsed.law;
      obj.article = rec.article;
      obj.source = rec.source;
      obj.sourceUrl = rec.sourceUrl;
      obj.verified = true;
      verified += 1;
    };
    LT.cases.forEach((c) => (c.laws || []).forEach(hydrate));
    LT.topics.forEach((t) => (t.laws || []).forEach(hydrate));
    return { verified, missing };
  }

  const SHARE_QUERY = location.search || '?sharecode=LQSAHBTIYJ';
  let deferredInstallPrompt = null;
  const standaloneMode = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const hint = document.getElementById('installState');
    if (hint) hint.textContent = '浏览器已支持安装，点击右侧按钮即可。';
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    toast('已安装到桌面，可从开始菜单或桌面打开', 'ok');
  });

  function installApp() {
    if (standaloneMode()) { toast('当前已经是桌面应用模式', 'ok'); return; }
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then((choice) => {
        if (choice.outcome === 'accepted') toast('正在安装 Law Trace', 'ok');
        else toast('已取消安装', '');
        deferredInstallPrompt = null;
      });
      return;
    }
    openInstallHelp();
  }

  function openInstallHelp() {
    openModal(`
      <div class="modal-head"><div><div class="modal-kicker">Install as desktop app</div><h3>把法痕律迹装到桌面</h3><p>和普通软件一样，从桌面或开始菜单直接打开</p></div><button class="icon-btn" data-close-modal>${icon('close')}</button></div>
      <div class="modal-body">
        <div class="install-steps">
          <div class="install-step"><b>01</b><div><b>Chrome / Edge 桌面版</b><p>打开本页后，点击地址栏右侧的“安装”图标；或打开浏览器菜单 → “安装 Law Trace 法痕律迹”。安装后会自动生成桌面快捷方式。</p></div></div>
          <div class="install-step"><b>02</b><div><b>Windows 开始菜单</b><p>安装完成后，在开始菜单搜索“法痕律迹”即可打开；也可右键固定到任务栏。</p></div></div>
          <div class="install-step"><b>03</b><div><b>手机 / 平板</b><p>Chrome 菜单 → “安装应用”；iPhone Safari → 分享 → “添加到主屏幕”。</p></div></div>
        </div>
        <p class="muted-line" style="margin-top:10px">安装依赖 HTTPS 或 localhost。当前页面：${esc(location.origin)}。安装的是本应用本身，不会上传咨询记录或草稿。</p>
      </div>
      <div class="modal-foot"><button class="btn btn-primary" data-close-modal>知道了</button></div>`);
  }

  const DB = {
    read(key, fallback) {
      try {
        const raw = localStorage.getItem(`lt4.${key}`);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    write(key, value) {
      try { localStorage.setItem(`lt4.${key}`, JSON.stringify(value)); } catch (e) { /* ignore quota */ }
    },
    remove(key) {
      try { localStorage.removeItem(`lt4.${key}`); } catch (e) { /* ignore */ }
    },
    clearAll() {
      try {
        Object.keys(localStorage).filter((k) => k.startsWith('lt4.')).forEach((k) => localStorage.removeItem(k));
      } catch (e) { /* ignore */ }
    }
  };

  const now = () => new Date();
  const fmtDate = (d = now()) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  const fmtDateLong = (d = now()) => `${fmtDate(d)} ${['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][d.getDay()]}`;
  const fmtHm = (d = now()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fmtStamp = (d = now()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const minsAgoText = (mins) => {
    if (mins <= 0) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    if (mins < 1440) return `${Math.floor(mins / 60)} 小时前`;
    return `${Math.floor(mins / 1440)} 天前`;
  };
  const clockForMinsAgo = (mins) => {
    const d = new Date(Date.now() - mins * 60000);
    return fmtHm(d);
  };
  const greeting = () => {
    const h = now().getHours();
    if (h < 6) return '夜深了';
    if (h < 12) return '上午好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  };

  function moneyCN(num) {
    const n = Math.round(Number(num) || 0);
    if (!n) return '零元整';
    const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
    const units = ['', '拾', '佰', '仟'];
    const big = ['', '万', '亿', '兆'];
    let str = '';
    let group = 0;
    let rest = n;
    while (rest > 0 && group < 4) {
      let part = rest % 10000;
      let sub = '';
      let zero = false;
      let pos = 0;
      while (part > 0) {
        const d = part % 10;
        if (d === 0) {
          if (sub && !zero) { sub = '零' + sub; zero = true; }
        } else {
          sub = digits[d] + units[pos] + sub;
          zero = false;
        }
        part = Math.floor(part / 10);
        pos += 1;
      }
      if (sub) str = sub + big[group] + str;
      rest = Math.floor(rest / 10000);
      group += 1;
    }
    return `${str}元整`;
  }

  function sparkline(values, color = '#a7792d', fill = true) {
    const arr = values.length ? values : [0, 0];
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const span = max - min || 1;
    const pts = arr.map((v, i) => {
      const x = (i / Math.max(1, arr.length - 1)) * 96 + 2;
      const y = 26 - ((v - min) / span) * 20;
      return [x, y];
    });
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const area = `${line} L98 30 L2 30 Z`;
    return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      ${fill ? `<path d="${area}" fill="${color}" opacity=".1"/>` : ''}
      <path d="${line}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
      <circle cx="${pts[pts.length - 1][0].toFixed(1)}" cy="${pts[pts.length - 1][1].toFixed(1)}" r="1.6" fill="${color}"/>
    </svg>`;
  }

  function copyText(text) {
    const value = String(text ?? '');
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(value).catch(() => fallbackCopy(value));
    }
    return Promise.resolve(fallbackCopy(value));
  }
  function fallbackCopy(value) {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
  }
  function download(filename, text, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob(['\ufeff', text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function toast(message, kind = '') {
    const wrap = $('#toastWrap');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    const ico = kind === 'warn' ? 'alert' : kind === 'ok' ? 'check' : 'spark';
    el.innerHTML = `${icon(ico)}<span>${esc(message)}</span>`;
    wrap.appendChild(el);
    setTimeout(() => { el.classList.add('out'); }, 2600);
    setTimeout(() => el.remove(), 3000);
  }

  /* -----------------------------------------------------
     State
     ----------------------------------------------------- */
  const state = {
    route: 'home',
    med: {
      inited: false, caseId: null, caseCache: null, started: false, done: false, busy: false,
      epoch: 0, s: null, tension: 'mid', form: { brief: '', aName: '', bName: '' },
      lawOpen: false, lawActive: -1
    },
    adv: {
      messages: DB.read('adv.messages', []),
      topicId: null, busy: false, epoch: 0, soothing: DB.read('adv.soothing', true)
    },
    docs: {
      typeId: DB.read('docs.type', 'mediation'),
      values: DB.read('docs.current', null) || {},
      touched: {},
      drafts: DB.read('docs.drafts', [])
    },
    radar: {
      risks: [], messages: [], filter: 'pending', selected: null, auto: false,
      timer: null, queueIndex: 0, riskStatuses: DB.read('radar.statuses', {}),
      connected: DB.read('radar.connected', false),
      groupName: DB.read('radar.groupName', LT.community.group || ''),
      groupCount: 0
    },
    events: DB.read('events', []),
    legalAudit: { verified: 0, missing: 0 }
  };

  const ROUTES = {
    home: { title: '总览' },
    mediate: { title: '三方调解' },
    advisor: { title: '法律顾问' },
    docs: { title: '文书生成' },
    radar: { title: '风险雷达' }
  };
  const EVENT_ICON = { mediate: 'scale', radar: 'radar', advisor: 'chat', docs: 'doc', system: 'spark' };

  function addEvent(type, title, desc, route) {
    state.events.unshift({ id: uid('ev'), type, title, desc, ts: Date.now(), route });
    state.events = state.events.slice(0, 24);
    DB.write('events', state.events);
  }

  /* -----------------------------------------------------
     Routing & chrome
     ----------------------------------------------------- */
  function go(route) {
    if (!ROUTES[route]) route = 'home';
    const hash = `#/${route}`;
    if (location.hash === hash) {
      renderRoute();
      return;
    }
    location.hash = hash;
  }

  function renderRoute() {
    const raw = location.hash.replace(/^#\/?/, '') || 'home';
    const route = ROUTES[raw] ? raw : 'home';
    const changed = state.route !== route;
    state.route = route;
    $$('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === route));
    $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.route === route));
    $$('.mobile-nav a').forEach((n) => n.classList.toggle('active', n.dataset.route === route));
    const crumb = $('#crumb');
    if (crumb) crumb.textContent = ROUTES[route].title;
    document.title = `${ROUTES[route].title} · Law Trace 法痕律迹`;
    closeSidebar();

    if (state.radar.timer) { clearInterval(state.radar.timer); state.radar.timer = null; }
    if (route === 'home') renderHome();
    if (route === 'mediate') renderMediation();
    if (route === 'advisor') renderAdvisor();
    if (route === 'docs') renderDocs();
    if (route === 'radar') renderRadar();
    if (route === 'radar' && state.radar.auto) startRadarTimer();

    if (changed) $('#viewport').scrollTop = 0;
  }

  function openSidebar() {
    $('#sidebar').classList.add('open');
    $('#scrim').classList.add('show');
  }
  function closeSidebar() {
    $('#sidebar').classList.remove('open');
    $('#scrim').classList.remove('show');
  }

  function syncIdentity() {
    const c = LT.community;
    const initials = c.initials || (c.mediator || '张').slice(-2).toUpperCase();
    if ($('#communityChipText')) $('#communityChipText').textContent = c.name;
    if ($('#sideUserName')) $('#sideUserName').textContent = c.mediator;
    if ($('#sideUserRole')) $('#sideUserRole').textContent = `${c.name} · ${(c.role || '调解员').split(' · ')[0]}`;
    if ($('#sideAvatar')) $('#sideAvatar').textContent = initials;
    if ($('#topAvatar')) $('#topAvatar').textContent = initials;
    if ($('#groupTitle')) $('#groupTitle').textContent = c.group || `${c.name}业主群`;
    if ($('#groupAvatar')) $('#groupAvatar').textContent = (c.group || c.name).slice(0, 1);
  }

  function updateChrome() {
    const today = $('#todayLabel');
    if (today) today.textContent = fmtDateLong();
    const count = pendingRisks().length;
    const badge = $('#bellBtn .badge');
    if (badge) {
      badge.textContent = String(count);
      badge.style.display = count ? 'grid' : 'none';
    }
    const watch = $('#botWatchCount');
    if (watch) watch.textContent = String(count);
    const botText = $('#botStatusText');
    if (botText) botText.textContent = state.radar.connected ? '小律 · 值守中' : '小律 · 待接入';
    renderSideQueue();
  }

  function renderSideQueue() {
    const box = $('#sideQueue');
    if (!box) return;
    const risks = pendingRisks();
    const top = risks[0];
    const med = state.med;
    const rows = [];
    if (med.started && !med.done) {
      rows.push(`<a class="side-item" data-go="mediate"><i class="green"></i><div><b>调解在办 · ${esc(med.s?.caseName || '')}</b><span>第 ${med.s?.round || 1} 轮 · 和解概率 ${med.s?.prob || 0}%</span></div></a>`);
    }
    if (top) {
      rows.push(`<a class="side-item" data-risk-id="${esc(top.id)}"><i class="red"></i><div><b>${esc(top.title)}</b><span>${top.level === 'high' ? '高风险' : '中风险'} ${top.score} · 待处置</span></div></a>`);
    }
    const c = $('#sideWorkCount');
    if (!rows.length) {
      box.innerHTML = `<div class="side-peace"><span class="sp-icon">${icon('spark')}</span><b>今日社区平安祥和</b><p>暂无在办事项。愿邻里和顺，诸事安宁。</p></div>`;
      if (c) c.textContent = '0';
      return;
    }
    box.innerHTML = rows.join('');
    if (c) c.textContent = String(rows.length);
  }

  /* -----------------------------------------------------
     Home
     ----------------------------------------------------- */
  function pendingRisks() {
    return state.radar.risks.filter((r) => r.status === 'pending');
  }
  function activeRisks() {
    return state.radar.risks.filter((r) => r.status !== 'closed');
  }
  function riskCounts() {
    const all = state.radar.risks;
    return {
      total: all.length,
      high: all.filter((r) => r.level === 'high' && r.status !== 'closed').length,
      mid: all.filter((r) => r.level === 'mid' && r.status !== 'closed').length,
      pending: all.filter((r) => r.status === 'pending').length,
      dispatched: all.filter((r) => r.status === 'dispatched').length,
      closed: all.filter((r) => r.status === 'closed').length
    };
  }
  function vitalScore() {
    const c = riskCounts();
    if (!c.high && !c.mid && !c.pending) return 100;
    return clamp(Math.round(96 - c.high * 7 - c.mid * 3 - c.pending * 1.5), 46, 98);
  }

  function renderHome() {
    const today = fmtDateLong();
    $('#homeDate').textContent = today;
    $('#homeGreeting').textContent = `${greeting()}，${LT.community.mediator}。`;
    const risks = pendingRisks();
    const rc = riskCounts();
    const score = vitalScore();
    const medActive = state.med.started && !state.med.done;
    const advToday = state.adv.messages.filter((m) => m.role === 'user').length;
    const docCount = state.docs.drafts.length;
    const hasDoc = docCount > 0 || Object.keys(state.docs.touched).some((k) => state.docs.touched[k]);

    if (risks.length || medActive) {
      $('#homeLede').innerHTML = `今天有 <b>${rc.pending}</b> 项风险待处置${medActive ? '，<b>1</b> 起调解在办' : ''}。<span>${rc.high ? `其中 ${rc.high} 项为高风险，建议优先处理。` : '整体平稳，按节奏推进即可。'}</span>`;
    } else {
      $('#homeLede').innerHTML = `今天社区平安祥和，暂无待处置风险。<span>愿邻里和顺，诸事安宁。</span>`;
    }

    const stats = [
      { label: '调解成功率', value: state.med.done ? '100' : '—', unit: state.med.done ? '%' : '暂无数据', delta: state.med.done ? '本次推演已达成' : '完成推演后统计', tone: 'jade', spark: [0, 0, 0, 0, 0, 0, state.med.done ? 100 : 0] },
      { label: '待处置风险', value: String(rc.pending), unit: '项', delta: rc.high ? `${rc.high} 项高风险` : '无高风险', tone: 'red', spark: [0, 0, 0, 0, 0, 0, rc.pending] },
      { label: '今日答疑', value: String(advToday), unit: '人次', delta: advToday ? '本次会话记录' : '暂无咨询', tone: 'blue', spark: [0, 0, 0, 0, 0, 0, advToday] },
      { label: '文书草稿', value: String(docCount), unit: '份', delta: docCount ? '已保存在本机' : '暂无草稿', tone: 'gold', spark: [0, 0, 0, 0, 0, 0, docCount] }
    ];
    $('#statGrid').innerHTML = stats.map((s) => `
      <article class="stat-card ${s.tone}">
        <div class="stat-top"><span>${s.label}</span>${icon(s.tone === 'red' ? 'alert' : s.tone === 'blue' ? 'chat' : s.tone === 'jade' ? 'scale' : 'doc')}</div>
        <div class="stat-val"><b>${s.value}</b><span>${s.unit}</span></div>
        <div class="stat-foot"><span>${s.delta}</span><div class="stat-spark">${sparkline(s.spark, s.tone === 'red' ? '#b51f2a' : s.tone === 'jade' ? '#a7792d' : s.tone === 'blue' ? '#8b5a2b' : '#c9a45b')}</div></div>
      </article>`).join('');

    const queue = [];
    const topRisk = risks[0];
    if (topRisk) {
      queue.push({ kind: 'risk', id: topRisk.id, icon: 'alert', tone: 'red', tag: topRisk.level === 'high' ? '高风险' : '中风险', tagCls: topRisk.level === 'high' ? 'tag-red' : 'tag-gold', title: topRisk.title, meta: `${LT.radar.categories[topRisk.cat].name} · ${topRisk.author} · ${minsAgoText(topRisk.minsAgo)}`, time: topRisk.time, go: 'risk' });
    }
    if (medActive) {
      queue.push({ kind: 'med', icon: 'scale', tone: 'gold', tag: '在办', tagCls: 'tag-gold', title: `调解 · ${state.med.s?.caseName || '进行中的调解'}`, meta: `第 ${state.med.s?.round || 1} 轮 · ${state.med.s?.aName || '申请人'} / ${state.med.s?.bName || '被申请人'}`, time: '进行中', go: 'mediate' });
    }
    if (hasDoc) {
      const docScore = docCompleteness().score;
      queue.push({ kind: 'docs', icon: 'doc', tone: 'blue', tag: docScore >= 100 ? '可导出' : '待完善', tagCls: docScore >= 100 ? 'tag-jade' : 'tag-blue', title: `文书 · ${LT.docTypes.find((t) => t.id === state.docs.typeId)?.name || '人民调解协议书'}`, meta: `要素完整度 ${docScore}% · 草稿自动保存`, time: docScore >= 100 ? '可导出' : '待补充', go: 'docs' });
    }
    if (!queue.length) {
      $('#homeQueue').innerHTML = `<div class="empty-peace"><span class="ep-icon">${icon('spark')}</span><div><b>今天社区平安祥和</b><p>没有待处置的纠纷或风险。愿邻里和顺，诸事安宁。</p></div><button class="text-btn" data-go="mediate">开始一次调解<svg><use href="#i-arrow"/></svg></button></div>`;
    } else {
      $('#homeQueue').innerHTML = queue.map((q) => `
        <div class="queue-row" ${q.go === 'risk' ? `data-risk-id="${esc(q.id)}"` : `data-go="${q.go}"`}>
          <span class="queue-icon ${q.tone === 'red' ? 'tone-red' : q.tone === 'gold' ? 'tone-gold' : 'tone-blue'}">${icon(q.icon)}</span>
          <div class="queue-main"><b>${esc(q.title)}<span class="tag ${q.tagCls}">${q.tag}</span></b><span>${esc(q.meta)}</span></div>
          <span class="queue-time">${esc(q.time)}</span>
          <span class="queue-go">${icon('arrow')}</span>
        </div>`).join('');
    }

    const ring = $('#vitalRing');
    ring.style.setProperty('--p', String(score));
    $('#vitalScore').textContent = String(score);
    const status = score >= 100 ? '平稳 · 安宁' : score >= 82 ? '平稳 · 局部紧绷' : score >= 68 ? '关注 · 局部承压' : '预警 · 需重点处置';
    $('#vitalLabel').textContent = status;
    $('#vitalNote').textContent = score >= 100
      ? '社区暂无风险事件。今天的平安，就是最好的工作成果。'
      : rc.high ? `${rc.high} 项高风险需优先处置，其余事项按节奏推进。` : '整体风险可控，保持关注即可。';
    $('#vitalBreakdown').innerHTML = [
      ['高风险', rc.high, '#b51f2a'],
      ['中风险', rc.mid, '#a9761f'],
      ['待处置', rc.pending, '#8b5a2b'],
      ['已闭环', rc.closed, '#a7792d']
    ].map(([label, val, color]) => `<div class="vb-row"><i style="background:${color}"></i>${label}<b>${val}</b></div>`).join('');
    $('#vitalSpark').innerHTML = sparkline(score >= 100 ? [86, 89, 92, 94, 97, 99, 100] : [score, score, score, score, score, score, score], '#a7792d');

    const topHigh = risks.find((r) => r.level === 'high') || risks[0];
    const watchTitle = $('#watchTitle');
    const watchSub = $('#watchSub');
    const watchLive = $('#watchLive');
    const watchRow = $('#watchRiskRow');
    if (topHigh) {
      if (watchTitle) watchTitle.textContent = '小律正在巡群';
      if (watchSub) watchSub.textContent = state.radar.connected ? `${state.radar.groupName || '业主群'}${state.radar.groupCount ? ` · ${state.radar.groupCount}人` : ''}` : '尚未接入业主群';
      if (watchLive) { watchLive.innerHTML = `<i></i>${state.radar.connected ? 'ON' : 'OFF'}`; watchLive.classList.toggle('off', !state.radar.connected); }
      if (watchRow) watchRow.classList.remove('peace');
      $('#watchRiskTitle').textContent = topHigh.title;
      $('#watchRiskMeta').textContent = `${topHigh.level === 'high' ? '高风险' : '中风险'} ${topHigh.score} · ${topHigh.time} 识别 · ${topHigh.status === 'pending' ? '待派单' : '处置中'}`;
      $('#watchRiskText').textContent = `“${topHigh.quote}” ${topHigh.advice[0]?.t || ''}：${topHigh.advice[0]?.d || ''}`;
    } else {
      if (watchTitle) watchTitle.textContent = '小律静候佳音';
      if (watchSub) watchSub.textContent = state.radar.connected ? (state.radar.groupName || '业主群') : '尚未接入业主群';
      if (watchLive) { watchLive.innerHTML = `<i></i>${state.radar.connected ? 'ON' : 'OFF'}`; watchLive.classList.toggle('off', !state.radar.connected); }
      if (watchRow) watchRow.classList.add('peace');
      $('#watchRiskTitle').textContent = '今日社区平安祥和';
      $('#watchRiskMeta').textContent = state.radar.connected ? '暂无风险事件 · 小律值守中' : '暂无风险事件 · 小律待接入';
      $('#watchRiskText').textContent = state.radar.connected
        ? '群内暂未出现需要升级的风险。愿邻里和顺，诸事安宁。'
        : '愿邻里和顺，诸事安宁。接入业主群后，小律会安静值守。';
    }
    $('#watchCount').textContent = String(state.radar.risks.length);

    if (state.events.length) {
      $('#activityList').innerHTML = state.events.slice(0, 5).map((e) => `
        <div class="activity-row">
          <span class="activity-icon">${icon(EVENT_ICON[e.type] || 'spark')}</span>
          <div class="activity-main"><b>${esc(e.title)}</b><span>${esc(e.desc)}</span></div>
          <span class="activity-time">${minsAgoText(Math.max(0, Math.round((Date.now() - e.ts) / 60000)))}</span>
        </div>`).join('');
    } else {
      $('#activityList').innerHTML = `<div class="empty-peace"><span class="ep-icon">${icon('shield')}</span><div><b>今天还没有需要记录的事项</b><p>社区平安，就是最好的消息。愿每一次相遇都和顺。</p></div></div>`;
    }

    const labels = ['一', '二', '三', '四', '五', '六', '日'];
    const todayIdx = (now().getDay() + 6) % 7;
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    state.events.forEach((e) => {
      const idx = (new Date(e.ts).getDay() + 6) % 7;
      dayCounts[idx] += 1;
    });
    const totalEvents = dayCounts.reduce((a, b) => a + b, 0);
    if (!totalEvents) {
      $('#trendChart').innerHTML = `<div class="trend-empty">${icon('spark')}<span>本周还没有调解与风险记录</span><span>愿社区安宁，数据留白也是一种好消息。</span></div>`;
    } else {
      const max = Math.max(...dayCounts, 1);
      $('#trendChart').innerHTML = dayCounts.map((v, i) => `
        <div class="trend-col ${i === todayIdx ? 'today' : ''}">
          <b>${v}</b>
          <div class="trend-bar" style="height:${Math.round((v / max) * 76)}px"></div>
          <span>${labels[i]}</span>
        </div>`).join('');
    }
    const trendFoot = $('.trend-foot');
    if (trendFoot) {
      const medCount = state.events.filter((e) => e.type === 'mediate').length;
      const riskCount = state.events.filter((e) => e.type === 'radar').length;
      trendFoot.innerHTML = `<span>本周留痕 <b>${state.events.length}</b> 条</span><span>调解 <b>${medCount}</b> 起</span><span>风险 <b>${riskCount}</b> 条</span>`;
    }
    const trendDelta = $('#trendDelta');
    if (trendDelta) {
      trendDelta.textContent = state.events.length ? `${state.events.length} 条留痕` : '暂无数据';
      trendDelta.className = state.events.length ? 'delta up' : 'delta';
    }

    updateChrome();
  }

  /* -----------------------------------------------------
     Modal / palette infrastructure
     ----------------------------------------------------- */
  function openModal(html, opts = {}) {
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modal-backdrop" data-close-modal></div>
      <div class="modal ${opts.wide ? 'wide' : ''} ${opts.xwide ? 'xwide' : ''}" role="dialog" aria-modal="true">
        ${html}
      </div>`;
    root.hidden = false;
    root.querySelector('.modal').focus?.();
    document.body.classList.add('modal-open');
  }
  function closeModal() {
    const root = $('#modalRoot');
    root.hidden = true;
    root.innerHTML = '';
    document.body.classList.remove('modal-open');
  }

  function openPalette() {
    const palette = $('#palette');
    palette.hidden = false;
    $('#paletteInput').value = '';
    renderPalette('');
    setTimeout(() => $('#paletteInput').focus(), 30);
  }
  function closePalette() {
    $('#palette').hidden = true;
  }
  function paletteItems() {
    return [
      { label: '总览', hint: '工作台 / 法治体征', route: 'home', icon: 'home' },
      { label: '三方调解模拟器', hint: '选择案件 · 策略推演 · 生成协议', route: 'mediate', icon: 'scale' },
      { label: '私人法律顾问', hint: '情绪安抚开关 · 13 类纠纷答疑', route: 'advisor', icon: 'chat' },
      { label: '法律文书生成', hint: '6 类文书 · 要素校验 · 导出', route: 'docs', icon: 'doc' },
      { label: '社区风险雷达', hint: '群聊接入 · 风险研判 · 闭环', route: 'radar', icon: 'radar' },
      { label: '开始一次调解', hint: '进入调解庭', action: () => go('mediate'), icon: 'scale' },
      { label: '模拟一条风险消息', hint: '让小律实时研判', action: () => { go('radar'); setTimeout(() => simulateRadarMessage(), 260); }, icon: 'plus' },
      { label: '接入新的业主群', hint: '小律入群向导', action: () => openJoinGroup(), icon: 'wechat' },
      { label: '生成社区法治周报', hint: '汇总风险与处置', action: () => openRadarReport(), icon: 'book' },
      { label: '法律数据来源与核验', hint: '国家法律法规数据库官方文本', action: () => openLegalSources(), icon: 'shield' },
      { label: '安装到桌面', hint: '像普通软件一样打开', action: () => installApp(), icon: 'download' },
      { label: '新建人民调解协议书', hint: '文书生成', action: () => { state.docs.typeId = 'mediation'; go('docs'); }, icon: 'doc' }
    ];
  }
  function renderPalette(query) {
    const q = query.trim().toLowerCase();
    const items = paletteItems().filter((i) => !q || `${i.label}${i.hint}`.toLowerCase().includes(q));
    const box = $('#paletteResults');
    if (!items.length) { box.innerHTML = '<div class="risk-empty">没有匹配项</div>'; return; }
    box.innerHTML = items.map((i, idx) => `
      <div class="palette-item ${idx === 0 ? 'active' : ''}" data-palette-index="${idx}">
        <span class="pi-icon">${icon(i.icon)}</span>
        <div><b>${esc(i.label)}</b><span>${esc(i.hint)}</span></div>
        <kbd>↵</kbd>
      </div>`).join('');
    box.dataset.items = JSON.stringify(items.map((i) => i.label));
    box._items = items;
  }
  function runPaletteItem(index) {
    const box = $('#paletteResults');
    const items = box._items || [];
    const item = items[index];
    if (!item) return;
    closePalette();
    if (item.route) go(item.route);
    if (item.action) item.action();
  }

  function openNotifications() {
    const risks = activeRisks().slice(0, 5);
    openModal(`
      <div class="modal-head"><div><div class="modal-kicker">Notifications</div><h3>待处理提醒</h3><p>风险派单、调解进度与文书状态</p></div><button class="icon-btn" data-close-modal>${icon('close')}</button></div>
      <div class="modal-body">
        <div class="step-list">
          ${risks.map((r) => `<div class="step-row"><b style="background:${r.level === 'high' ? 'var(--red-soft)' : 'var(--amber-soft)'};color:${r.level === 'high' ? 'var(--red)' : 'var(--amber)'}">${r.level === 'high' ? '!' : '·'}</b><div><b>${esc(r.title)}</b><span>${r.time} · ${r.status === 'pending' ? '待派单' : '处置中'} · 建议 ${esc(r.assignee)}</span></div></div>`).join('') || '<p class="muted-line">暂无待处理风险。今天社区平安祥和。</p>'}
          ${state.med.started && !state.med.done ? `<div class="step-row"><b style="background:var(--gold-soft);color:var(--gold)">调</b><div><b>调解在办</b><span>${esc(state.med.s?.caseName || '')} · 第 ${state.med.s?.round || 1} 轮</span></div></div>` : ''}
        </div>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" data-close-modal>关闭</button><button class="btn btn-primary" data-go="radar">打开风险雷达</button></div>`);
  }

  function openLegalSources() {
    const legal = window.LT_LEGAL;
    if (!legal) { toast('法律数据未加载', 'warn'); return; }
    const totalArticles = legal.laws.reduce((n, l) => n + l.articleCount, 0);
    openModal(`
      <div class="modal-head"><div><div class="modal-kicker">Authoritative law data</div><h3>法律数据来源与核验</h3><p>国家法律法规数据库官方文本 · 不用模型生成法条</p></div><button class="icon-btn" data-close-modal>${icon('close')}</button></div>
      <div class="modal-body">
        <div class="legal-source-summary">
          <div><b>${legal.laws.length}</b><span>部法律</span></div>
          <div><b>${totalArticles.toLocaleString('zh-CN')}</b><span>条官方条文</span></div>
          <div><b>${legal.verifiedCitationCount}</b><span>条法条已核验</span></div>
          <div><b>${legal.missingCitationCount}</b><span>处缺失</span></div>
        </div>
        <p class="muted-line" style="margin:10px 0 12px">来源：${esc(legal.source)}，生成日期 ${esc(legal.generatedAt)}。应用内所有法条文本均来自官方 DOCX / 全国人大官网原文解析，未做改写、摘要或模型生成。</p>
        <div class="legal-source-table">
          <div class="lst-head"><span>法律</span><span>施行</span><span>条文</span><span>官方</span></div>
          ${legal.laws.map((l) => `<div class="lst-row"><b>${esc(l.title)}</b><span>${esc(l.effective || l.published || '—')}</span><span>${l.articleCount}</span><a href="${esc(l.sourceUrl)}" target="_blank" rel="noopener">原文</a></div>`).join('')}
        </div>
        <div class="legal-source-actions">
          <a class="btn btn-ghost btn-sm" href="legal/legal-corpus.json?sharecode=LQSAHBTIYJ" download>${icon('download')}下载完整法条库</a>
          <a class="btn btn-ghost btn-sm" href="legal/SOURCES.md?sharecode=LQSAHBTIYJ" target="_blank" rel="noopener">${icon('doc')}来源与校验清单</a>
        </div>
        <p class="muted-line" style="margin-top:10px">核验结果：${legal.missingCitationCount === 0 ? '全部引用均命中官方原文。' : `有 ${legal.missingCitationCount} 处引用未命中，应用已标记并禁止用模型补写。`}</p>
      </div>
      <div class="modal-foot"><button class="btn btn-primary" data-close-modal>知道了</button></div>`, { wide: true });
  }

  function openSettings() {
    openModal(`
      <div class="modal-head"><div><div class="modal-kicker">Settings</div><h3>工作台设置</h3><p>本机数据，不上传云端</p></div><button class="icon-btn" data-close-modal>${icon('close')}</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label class="field"><span>社区名称</span><input id="setCommunity" value="${esc(LT.community.name)}" /></label>
          <label class="field"><span>调解员</span><input id="setMediator" value="${esc(LT.community.mediator)}" /></label>
        </div>
        <p class="muted-line" style="margin:4px 0 14px">社区名称会显示在文书、报告与工作台署名处。工作台默认不预置任何虚构的纠纷或风险。</p>
        <div class="step-list">
          <div class="step-row"><b>版</b><div><b>Law Trace v${esc(LT.version)}</b><span>纯静态前端 · 无需构建 · 本地知识引擎</span></div></div>
          <div class="step-row"><b>隐</b><div><b>数据只保存在本机</b><span>咨询记录、草稿、风险处置状态均使用 localStorage。</span></div></div>
          <div class="step-row"><b>法</b><div><b>权威法律数据</b><span>国家法律法规数据库官方文本，应用内 ${state.legalAudit.verified} 条法条已核验。</span><button class="btn btn-ghost btn-sm" data-legal-source style="margin-top:5px">查看来源与核验</button></div></div>
          <div class="step-row"><b>装</b><div><b>安装到桌面</b><span id="installState">${standaloneMode() ? '当前已在桌面应用模式运行。' : '安装后像普通软件一样从桌面或开始菜单打开。'}</span><button class="btn btn-ghost btn-sm" data-install-app style="margin-top:5px">${standaloneMode() ? '已安装' : '安装 Law Trace'}</button></div></div>
        </div>
        <div class="field" style="margin-top:14px"><span>演示与清理</span><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" id="loadDemo">载入演示数据</button><button class="btn btn-ghost btn-sm" id="resetLocal" style="color:var(--red);border-color:#ecc9c3">清除本机全部数据</button></div></div>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" data-close-modal>取消</button><button class="btn btn-primary" id="saveSettings">保存设置</button></div>`);
    $('#saveSettings').addEventListener('click', () => {
      LT.community.name = $('#setCommunity').value.trim() || '幸福里社区';
      LT.community.mediator = $('#setMediator').value.trim() || '张琳';
      LT.community.full = `${LT.community.name}人民调解委员会`;
      LT.community.initials = LT.community.mediator.slice(-2).toUpperCase();
      DB.write('community', {
        name: LT.community.name, mediator: LT.community.mediator,
        full: LT.community.full, initials: LT.community.initials
      });
      toast('设置已保存', 'ok');
      closeModal();
      syncIdentity();
      renderRoute();
    });
    $('#loadDemo').addEventListener('click', () => {
      closeModal();
      loadDemoRadar();
    });
    $('#resetLocal').addEventListener('click', () => {
      DB.clearAll();
      toast('已清除本机数据，刷新后回到空白工作台', 'ok');
      setTimeout(() => location.reload(), 700);
    });
  }

  /* -----------------------------------------------------
     Boot + global bindings
     ----------------------------------------------------- */
  function bindGlobal() {
    document.addEventListener('click', (e) => {
      const routeEl = e.target.closest('[data-route]');
      if (routeEl) { e.preventDefault(); go(routeEl.dataset.route); return; }
      const goEl = e.target.closest('[data-go]');
      if (goEl) { e.preventDefault(); go(goEl.dataset.go); return; }
      const riskEl = e.target.closest('[data-risk-id]');
      if (riskEl) { e.preventDefault(); focusRisk(riskEl.dataset.riskId); return; }
      const closeEl = e.target.closest('[data-close-modal]');
      if (closeEl) { e.preventDefault(); closeModal(); return; }
      if (e.target.closest('[data-legal-source]')) { e.preventDefault(); openLegalSources(); return; }
      if (e.target.closest('[data-install-app]')) { e.preventDefault(); installApp(); return; }
      if (e.target.closest('[data-open-settings]')) { e.preventDefault(); openSettings(); return; }
      if (e.target.closest('[data-close-palette]')) { closePalette(); return; }
      const pal = e.target.closest('[data-palette-index]');
      if (pal) { runPaletteItem(Number(pal.dataset.paletteIndex)); return; }
    });

    $('#menuBtn').addEventListener('click', openSidebar);
    $('#scrim').addEventListener('click', closeSidebar);
    $('#topSearch').addEventListener('click', openPalette);
    $('#bellBtn').addEventListener('click', openNotifications);
    $('#homeReport').addEventListener('click', openDailyReport);

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if ($('#palette').hidden) openPalette(); else closePalette();
      }
      if (e.key === 'Escape') {
        if (!$('#modalRoot').hidden) closeModal();
        else if (!$('#palette').hidden) closePalette();
        else closeSidebar();
      }
      if (!$('#palette').hidden) {
        const input = $('#paletteInput');
        if (e.key === 'Enter') {
          const active = $('.palette-item.active');
          const idx = active ? Number(active.dataset.paletteIndex) : 0;
          runPaletteItem(idx);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = $$('.palette-item');
          if (!items.length) return;
          const idx = items.findIndex((it) => it.classList.contains('active'));
          const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
          items.forEach((it, i) => it.classList.toggle('active', i === next));
          items[next].scrollIntoView({ block: 'nearest' });
          input.focus();
        }
      }
    });

    const paletteInput = $('#paletteInput');
    if (paletteInput) paletteInput.addEventListener('input', (e) => renderPalette(e.target.value));

    window.addEventListener('hashchange', renderRoute);
  }

  function boot() {
    bindGlobal();
    const today = $('#todayLabel');
    if (today) today.textContent = fmtDateLong();
    if (!location.hash) {
      try { history.replaceState(null, '', '#/home'); } catch (e) { location.hash = '#/home'; }
    }
    // v5: remove old seeded demo operations; business data starts empty.
    if (DB.read('schema', 0) < 5) {
      DB.remove('events');
      DB.remove('radar.statuses');
      DB.write('schema', 5);
      state.events = [];
    }
    state.legalAudit = hydrateLegalCitations();
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (manifestLink && location.search) manifestLink.href = `manifest.webmanifest${location.search}`;
    if (standaloneMode()) {
      const topInstall = $('#installTop');
      if (topInstall) topInstall.style.display = 'none';
    }
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js' + SHARE_QUERY).catch(() => {});
    }
    const savedCommunity = DB.read('community', null);
    if (savedCommunity) Object.assign(LT.community, savedCommunity);
    syncIdentity();
    if (!DB.read('docs.current', null)) {
      const first = LT.docTypes.find((t) => t.id === state.docs.typeId) || LT.docTypes[0];
      state.docs.values = { ...first.sample };
      state.docs.touched = {};
      DB.write('docs.current', state.docs.values);
    } else if (!Object.keys(state.docs.values || {}).length) {
      state.docs.values = defaultDocValues(state.docs.typeId);
      DB.write('docs.current', state.docs.values);
    }
    if (state.adv.messages.length) restoreAdvisor();
    renderRoute();
    updateChrome();
  }

  /* Expose a tiny debug surface for local QA (no production impact). */
  window.LawTrace = { state, go, toast };

  /* =====================================================
     Module 1 · Mediation simulator
     ===================================================== */
  const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

  function getCase(id) {
    if (state.med.caseCache && state.med.caseCache.id === id) return state.med.caseCache;
    return LT.cases.find((c) => c.id === id) || LT.cases[0];
  }

  function inferCaseId(text) {
    const rules = [
      [/预付|充值|健身房|会员卡|退款|消费/, 'prepaid'],
      [/工资|欠薪|辞退|劳动|社保|加班|工伤/, 'wage'],
      [/赡养|老人|子女|医药费|养老/, 'support'],
      [/押金|租房|房东|退租|二房东/, 'deposit'],
      [/狗|宠物|咬伤|扑倒|遛狗/, 'pet'],
      [/噪音|广场舞|音响|扰民|装修|半夜/, 'noise'],
      [/漏水|渗水|相邻|楼上|闭水/, 'leak'],
      [/物业|电梯|小区|业委会|物业费|公共收益/, 'property']
    ];
    for (const [re, id] of rules) if (re.test(text)) return id;
    return null;
  }

  function parseBriefAmount(text) {
    const matches = [...String(text).matchAll(/(\d[\d,]{1,})(?:\.\d+)?\s*(万元|元)/g)];
    let best = 0;
    matches.forEach((m) => {
      let n = Number(m[1].replace(/,/g, ''));
      if (m[2] === '万元') n *= 10000;
      if (n > best) best = n;
    });
    return best || 0;
  }

  function genericCase(brief, aName, bName) {
    const amount = parseBriefAmount(brief) || 6000;
    const max = Math.max(2000, Math.round(amount * 1.6));
    const aBottom = Math.round(amount * 0.7);
    const bMax = Math.round(amount * 0.9);
    return {
      id: 'generic', name: '综合纠纷', short: '综合 · 自动匹配', icon: 'scale', base: 40, brief,
      a: {
        name: aName || '申请人', role: '申请人', kind: '个人',
        claim: '要求对方停止侵害并赔偿实际损失。', emo: 60, trust: 38,
        flex: 26, interest: '希望问题尽快得到解决，得到一个明确、可执行的答复。',
        hidden: `只要对方给出明确时间和可执行方案，金额可以协商到 ${fmtMoney(aBottom)} 元左右。`,
        bottom: `${fmtMoney(aBottom)} 元`, evidence: 62, risk: 50
      },
      b: {
        name: bName || '被申请人', role: '被申请人', kind: '个人',
        claim: '认可部分事实，但对责任比例和金额有异议。', emo: 54, trust: 36,
        flex: 24, interest: '希望一次性了结，不愿意承担没有依据的部分。',
        hidden: `如果是自己的责任愿意承担，最高可以接受到 ${fmtMoney(bMax)} 元左右，但要求一次性了结。`,
        bottom: `${fmtMoney(bMax)} 元`, evidence: 48, risk: 58
      },
      axis: { min: 0, max, unit: '元', aStart: amount, aEnd: aBottom, bStart: Math.round(amount * 0.3), bEnd: bMax },
      issues: [
        { t: '争议事实与责任比例如何认定', w: 40 },
        { t: '损失金额与赔偿范围', w: 36 },
        { t: '履行方式与一次性了结', w: 24 }
      ],
      laws: [
        { code: '《民法典》第一千一百六十五条', text: '行为人因过错侵害他人民事权益造成损害的，应当承担侵权责任。' },
        { code: '《民法典》第二百八十八条', text: '不动产的相邻权利人应当按照有利生产、方便生活、团结互助、公平合理的原则，正确处理相邻关系。' },
        { code: '《人民调解法》第二十二条', text: '人民调解员应当充分听取当事人的陈述，讲解有关法律、法规和国家政策，耐心疏导，在当事人平等协商、互谅互让的基础上提出纠纷解决方案。' }
      ],
      open: {
        m: '今天不急着分对错，先把事情的经过和各自的底线说清楚。能谈的谈，不能谈的把证据固定下来。',
        a: '我的诉求很明确：该修的要修，该赔的要赔。我不是来吵架的，但也不能一直拖。',
        b: '我有我的难处。该承担的部分我认，但不能没有依据地让我全担。'
      },
      react: {
        empathy: {
          a: '其实我更在意的是对方有没有把这件事当回事。只要态度诚恳，金额可以谈。',
          b: '我也不是不讲理。有人愿意认真听我说，我就愿意继续谈。'
        },
        law: {
          a: '法律规定的责任我认，但我希望对方也拿出同样的诚意。',
          b: '该我承担的我不会推，但责任比例和金额要按证据来。'
        },
        caucus: {
          pa: '如果对方今天给出明确时间和方案，您最希望先落实哪一件事？',
          pb: '您最担心的是不是被认定全责、以后没完没了？我们可以在协议里写一次性了结。',
          a: '只要方案能执行，我可以适当让步。',
          b: '如果是我的责任，我愿意承担，但要写清楚到此为止。'
        },
        bridge: {
          a: '先修复 / 先处理问题，赔偿按实际损失来，这个结构我可以接受。',
          b: '如果金额合理、一次了结，我愿意配合履行。'
        },
        cool: {
          a: '缓一缓可以，但希望下次能有明确方案。',
          b: '冷静一下也好，我把证据整理好再来谈。'
        }
      },
      options: [
        {
          title: '方案 A · 折中履行', amount: Math.round(amount * 0.78), tag: '推荐',
          desc: '责任与金额各让一步，约定明确履行期限。',
          terms: [
            `被申请人于协议签订之日起15日内一次性支付人民币${fmtMoney(Math.round(amount * 0.78))}元。`,
            '申请人放弃其余赔偿请求，双方就本次争议一次性了结。',
            '逾期未付的，申请人有权依法主张权利。'
          ]
        },
        {
          title: '方案 B · 分期履行', amount: Math.round(amount * 0.85), tag: '减压',
          desc: '金额略高，分两期支付，给对方筹措时间。',
          terms: [
            `被申请人分两期支付人民币${fmtMoney(Math.round(amount * 0.85))}元，首期50%于7日内支付。`,
            '余款于30日内付清，任何一期逾期，全部余额立即到期。',
            '双方就本次争议不再另行主张。'
          ]
        }
      ],
      agreement: {
        perform: '被申请人按约定时间将款项支付至申请人账户；双方共同签署履行确认。',
        clauses: [
          '本协议为一次性了结，双方就本次争议不再另行主张。',
          '本协议经双方签字、人民调解委员会盖章后生效。',
          '一方不履行的，另一方可依法向人民法院申请司法确认或提起诉讼。'
        ]
      }
    };
  }

  function resolveCase(brief, aName, bName) {
    const id = inferCaseId(brief);
    if (!id) return genericCase(brief, aName, bName);
    const base = LT.cases.find((c) => c.id === id) || LT.cases[0];
    return {
      ...base,
      brief,
      a: { ...base.a, name: aName || base.a.name },
      b: { ...base.b, name: bName || base.b.name }
    };
  }

  function currentMedCase() {
    return state.med.caseCache || (state.med.caseId ? getCase(state.med.caseId) : null);
  }

  function saveMedForm() {
    state.med.form = {
      brief: $('#medBrief').value,
      aName: $('#medAName').value,
      bName: $('#medBName').value
    };
  }

  function updateMedMatch() {
    saveMedForm();
    const brief = state.med.form.brief.trim();
    if (!brief) {
      state.med.caseCache = null;
      state.med.caseId = null;
      renderMedCaseInfo();
      renderPartyStrip();
      updateMedUI();
      return;
    }
    const c = resolveCase(brief, state.med.form.aName.trim(), state.med.form.bName.trim());
    state.med.caseCache = c;
    state.med.caseId = c.id;
    state.med.lawActive = -1;
    renderMedCaseInfo();
    renderPartyStrip();
    updateMedUI();
  }

  function initMediation() {
    state.med.inited = true;
    fillMedSetup();
    updateMedMatch();
    renderMedStreamEmpty();
    $('#medStart').addEventListener('click', startMediation);
    $('#medReset').addEventListener('click', () => { resetMediation(); toast('推演已重置'); });
    $('#medAuto').addEventListener('click', autoMediate);
    $('#tensionSeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tension]');
      if (!b) return;
      state.med.tension = b.dataset.tension;
      $$('#tensionSeg button').forEach((x) => x.classList.toggle('active', x === b));
    });
    let timer = null;
    ['medBrief', 'medAName', 'medBName'].forEach((id) => {
      $(`#${id}`).addEventListener('input', () => {
        saveMedForm();
        clearTimeout(timer);
        timer = setTimeout(updateMedMatch, 220);
      });
    });
    $('#medSample').addEventListener('click', () => {
      const c = LT.cases[0];
      state.med.form = { brief: c.brief, aName: c.a.name, bName: c.b.name };
      fillMedSetup();
      updateMedMatch();
      toast('已填入示例案情，可直接修改', 'ok');
    });
    $('#lawStrip').addEventListener('click', (e) => {
      const toggle = e.target.closest('[data-law-toggle]');
      if (toggle) {
        state.med.lawOpen = !state.med.lawOpen;
        renderLawStrip(currentMedCase());
        return;
      }
      const chip = e.target.closest('[data-law-index]');
      if (chip) {
        state.med.lawActive = Number(chip.dataset.lawIndex);
        state.med.lawOpen = true;
        renderLawStrip(currentMedCase());
      }
    });
  }

  function fillMedSetup() {
    const f = state.med.form || {};
    $('#medBrief').value = f.brief || '';
    $('#medAName').value = f.aName || '';
    $('#medBName').value = f.bName || '';
    $$('#tensionSeg button').forEach((x) => x.classList.toggle('active', x.dataset.tension === state.med.tension));
  }

  function selectMedCase(id, options = {}) {
    const base = LT.cases.find((c) => c.id === id) || LT.cases[0];
    const brief = options.brief || base.brief;
    const aName = options.aName || base.a.name;
    const bName = options.bName || base.b.name;
    state.med.started = false;
    state.med.done = false;
    state.med.busy = false;
    state.med.s = null;
    state.med.epoch += 1;
    state.med.tension = 'mid';
    state.med.form = { brief, aName, bName };
    state.med.caseCache = resolveCase(brief, aName, bName);
    state.med.caseId = state.med.caseCache.id;
    fillMedSetup();
    renderMedCaseInfo();
    renderPartyStrip();
    renderMedStreamEmpty();
    updateMedUI();
  }

  function renderMedCaseInfo() {
    const c = currentMedCase();
    if (!c) {
      $('#medCaseName').textContent = '待填写案情';
      $('#medCaseSub').textContent = '填写案情后自动匹配调解模型与法律依据';
      $('#medIssues').innerHTML = '<p class="muted-line" style="padding:0 0 4px">填写案情后，这里会显示争议焦点与权重。</p>';
      $('#medRound').textContent = '第 0 轮';
      renderLawStrip(null);
      return;
    }
    $('#medCaseName').textContent = c.name;
    $('#medCaseSub').textContent = `${LT.community.full} · 自动匹配 · 不公开调解`;
    $('#medIssues').innerHTML = c.issues.map((it, i) => `
      <div class="issue">
        <span class="issue-no">0${i + 1}</span>
        <div><b>${esc(it.t)}</b><div class="issue-bar"><i style="width:${it.w}%"></i></div></div>
        <em>${it.w}%</em>
      </div>`).join('');
    renderLawStrip(c);
    $('#medRound').textContent = '第 0 轮';
  }

  function renderLawStrip(c) {
    const strip = $('#lawStrip');
    if (!strip) return;
    if (!c) {
      strip.innerHTML = `<div class="law-strip-empty">${icon('book')}填写案情后，这里会自动显示可引用的法律依据。</div>`;
      return;
    }
    const open = !!state.med.lawOpen;
    const active = Number.isInteger(state.med.lawActive) ? state.med.lawActive : -1;
    strip.innerHTML = `<div class="law-strip-head"><b>法律依据</b><span>${c.laws.length} 条</span><button type="button" class="law-source-btn" data-legal-source>权威来源</button><button type="button" data-law-toggle class="${open ? 'open' : ''}">${open ? '收起' : '展开'}${icon('chevron')}</button></div>
      <div class="law-strip-chips">${c.laws.map((l, i) => `<button type="button" class="law-chip ${active === i ? 'active' : ''}" data-law-index="${i}" title="${esc(l.text)}"><b>${esc(l.code)}</b><span>${esc(l.text)}</span></button>`).join('')}</div>
      ${open ? `<div class="law-strip-panel">${c.laws.map((l) => `<div class="law-item"><b>${esc(l.code)}<i class="law-official">官方原文</i></b><p>${esc(l.text)}</p></div>`).join('')}</div>` : ''}`;
  }

  function renderMedStreamEmpty() {
    $('#medStream').innerHTML = `<div class="empty-stage">
      <span class="empty-mark"><svg viewBox="0 0 24 24"><use href="#i-scale"/></svg></span>
      <b>三方推演将在这里展开</b>
      <p>左侧填写案情并进入调解庭。<br>建议先共情、再释法，最后才谈方案。</p>
    </div>`;
  }

  function renderPartyStrip() {
    const s = state.med.s;
    const c = s?.case || currentMedCase();
    if (!s || !state.med.started) {
      const aName = c?.a?.name || state.med.form?.aName || '申请人';
      const bName = c?.b?.name || state.med.form?.bName || '被申请人';
      const aEmo = c?.a?.emo ?? 50;
      const bEmo = c?.b?.emo ?? 50;
      const aTrust = c?.a?.trust ?? 40;
      const bTrust = c?.b?.trust ?? 40;
      $('#partyStrip').innerHTML = `
        <div class="party-card a"><span class="party-avatar">${esc(aName[0] || '甲')}</span><div class="party-info"><b>${esc(aName)}</b><span>${esc(c?.a?.role || '申请人')}</span><div class="party-meters"><span class="pm emo"><i style="width:${aEmo}%"></i></span><span class="pm trust"><i style="width:${aTrust}%"></i></span></div></div><div class="party-nums"><span>情 ${aEmo}</span><span>信 ${aTrust}</span></div></div>
        <span class="mediator-connector">${icon('scale')}</span>
        <div class="party-card b"><span class="party-avatar">${esc(bName[0] || '乙')}</span><div class="party-info"><b>${esc(bName)}</b><span>${esc(c?.b?.role || '被申请人')}</span><div class="party-meters"><span class="pm emo"><i style="width:${bEmo}%"></i></span><span class="pm trust"><i style="width:${bTrust}%"></i></span></div></div><div class="party-nums"><span>情 ${bEmo}</span><span>信 ${bTrust}</span></div></div>`;
      return;
    }
    const card = (p, party, cls) => `
      <div class="party-card ${cls}">
        <span class="party-avatar">${esc((p.name || (cls === 'a' ? '甲' : '乙'))[0])}</span>
        <div class="party-info"><b title="${esc(p.name)}">${esc(p.name)}</b><span>${esc(p.role)}</span>
          <div class="party-meters"><span class="pm emo" title="情绪 ${p.emo}"><i style="width:${p.emo}%"></i></span><span class="pm trust" title="信任 ${p.trust}"><i style="width:${p.trust}%"></i></span></div>
        </div>
        <div class="party-nums"><span>情 ${p.emo}</span><span>信 ${p.trust}</span></div>
      </div>`;
    $('#partyStrip').innerHTML = `${card(s.A, 'a', 'a')}<span class="mediator-connector">${icon('scale')}</span>${card(s.B, 'b', 'b')}`;
  }

  function calcOffer(s, party) {
    const ax = s.case.axis;
    if (party === 'a') return ax.aStart + (ax.aEnd - ax.aStart) * (s.A.flex / 100);
    return ax.bStart + (ax.bEnd - ax.bStart) * (s.B.flex / 100);
  }

  function calcProb(s) {
    const trust = (s.A.trust + s.B.trust) / 2;
    const flex = (s.A.flex + s.B.flex) / 2;
    const emo = (s.A.emo + s.B.emo) / 2;
    const ax = s.case.axis;
    const range = ax.max - ax.min || 1;
    const gap = Math.max(0, calcOffer(s, 'a') - calcOffer(s, 'b'));
    let p = 0.33 * trust + 0.36 * flex + 0.17 * (100 - emo) + 12 + (s.case.base - 40) * 0.35;
    p -= (gap / range) * 16;
    return clamp(Math.round(p), 6, 96);
  }

  function buildSession() {
    const brief = $('#medBrief').value.trim();
    if (brief.length < 8) {
      toast('请先填写案情简述（至少 8 个字），系统会自动匹配调解模型', 'warn');
      $('#medBrief').focus();
      return null;
    }
    const aName = $('#medAName').value.trim();
    const bName = $('#medBName').value.trim();
    const c = resolveCase(brief, aName, bName);
    state.med.caseCache = c;
    state.med.caseId = c.id;
    state.med.form = { brief, aName, bName };
    const tension = state.med.tension;
    const tAdj = tension === 'high' ? 1 : tension === 'low' ? -1 : 0;
    const s = {
      caseId: c.id, caseName: c.name, case: c,
      brief,
      aName: aName || c.a.name,
      bName: bName || c.b.name,
      tension,
      round: 1, maxRounds: 3, done: false, busy: false, epoch: ++state.med.epoch,
      used: {}, proposals: 0, option: null, agreement: null, auto: false,
      A: {
        name: aName || c.a.name, role: c.a.role,
        emo: clamp(c.a.emo + tAdj * 8, 5, 98),
        trust: clamp(c.a.trust - tAdj * 6, 5, 98),
        flex: c.a.flex, hidden: false, bottom: false
      },
      B: {
        name: bName || c.b.name, role: c.b.role,
        emo: clamp(c.b.emo + tAdj * 8, 5, 98),
        trust: clamp(c.b.trust - tAdj * 6, 5, 98),
        flex: c.b.flex, hidden: false, bottom: false
      }
    };
    s.prob = calcProb(s);
    s.prevProb = s.prob;
    return s;
  }

  async function startMediation() {
    if (state.med.busy) return;
    const s = buildSession();
    if (!s) return;
    state.med.s = s;
    state.med.started = true;
    state.med.done = false;
    state.med.busy = false;
    $('#medStream').innerHTML = '';
    renderMedCaseInfo();
    renderPartyStrip();
    updateMedUI();
    addEvent('mediate', '开始一次调解推演', `${s.caseName} · ${s.aName} / ${s.bName}`, 'mediate');
    addMedMsg('sys', `调解开始 · ${s.caseName} · 不公开调解`);
    await typeThenMediator(s, s.case.open.m);
    if (s.epoch !== state.med.epoch) return;
    addMedMsg('a', s.case.open.a);
    await sleep(420);
    if (s.epoch !== state.med.epoch) return;
    addMedMsg('b', s.case.open.b);
    updateMedUI();
    toast('已进入调解庭，请选择第 1 轮策略', 'ok');
  }

  async function typeThenMediator(s, text) {
    clearTyping();
    const typing = document.createElement('div');
    typing.className = 'msg-row me';
    typing.innerHTML = `<span class="msg-avatar" style="background:var(--gold-soft);color:var(--gold)">调</span><div class="msg-body"><div class="msg-meta"><b>调解员 · ${esc(LT.community.mediator)}</b><span>正在组织语言</span></div><div class="typing-row"><i></i><i></i><i></i></div></div>`;
    $('#medStream').appendChild(typing);
    scrollMed();
    await sleep(520);
    if (s.epoch !== state.med.epoch) return;
    typing.remove();
    addMedMsg('me', text);
  }

  function clearTyping() {
    $$('#medStream .typing-row').forEach((el) => el.closest('.msg-row')?.remove());
  }

  function addMedMsg(role, text, extra = {}) {
    if (!text) return;
    const s = state.med.s;
    const c = getCase(state.med.caseId);
    const stream = $('#medStream');
    const row = document.createElement('div');
    if (role === 'sys') {
      row.className = 'msg-row sys';
      row.innerHTML = `<span class="sys-pill"><i></i>${esc(text)}</span>`;
      stream.appendChild(row);
      scrollMed();
      return;
    }
    const side = role === 'a' || role === 'b' ? role : 'me';
    const name = role === 'a' ? (s?.aName || c.a.name) : role === 'b' ? (s?.bName || c.b.name) : `调解员 · ${LT.community.mediator}`;
    const av = role === 'a' ? (name[0] || '甲') : role === 'b' ? (name[0] || '乙') : '调';
    const avStyle = role === 'a' ? 'background:var(--red-soft);color:var(--red)' : role === 'b' ? 'background:var(--blue-soft);color:var(--blue)' : 'background:var(--gold-soft);color:var(--gold);border:1px solid #ead9b8';
    row.className = `msg-row ${role === 'a' || role === 'b' ? role : 'me'}`;
    const deltas = extra.deltas
      ? `<div class="state-change">${Object.entries(extra.deltas).map(([k, v]) => `<span class="${v < 0 ? 'down' : 'up'}">${k} ${v > 0 ? '+' : ''}${v}</span>`).join('')}</div>`
      : '';
    row.innerHTML = `<span class="msg-avatar" style="${avStyle}">${esc(av)}</span>
      <div class="msg-body">
        <div class="msg-meta"><b>${esc(name)}</b><span>${extra.tag ? `<span style="color:var(--gold)">${esc(extra.tag)}</span> · ` : ''}${fmtHm()}</span></div>
        <div class="msg-bubble">${esc(text)}</div>
        ${deltas}
      </div>`;
    stream.appendChild(row);
    scrollMed();
  }

  function addCaucusCard(title, lines) {
    const stream = $('#medStream');
    const el = document.createElement('div');
    el.className = 'caucus-card';
    el.innerHTML = `<header>${icon('lock')} ${esc(title)}</header>${lines.map((l) => `<p>${l}</p>`).join('')}`;
    stream.appendChild(el);
    scrollMed();
  }

  function scrollMed() {
    const stream = $('#medStream');
    if (stream) stream.scrollTop = stream.scrollHeight;
  }

  function strategyLine(key, s) {
    const c = s.case;
    const a = s.aName;
    const b = s.bName;
    const maps = {
      empathy: `我先复述一遍我听到的：${b}在意的不是“故意不配合”，而是自己的处境没有被看见。${a}这边也有实际难处。今天不急着分对错，先把各自最不能接受的那一件事说清楚。`,
      law: `我们把边界说清楚。《${c.laws[0].code.replace(/[《》]/g, '')}》规定：${c.laws[0].text.slice(0, 58)}……。这不是偏袒谁，而是让接下来的方案有一个可执行的底线。`,
      caucus: `先分开聊十分钟。两位把“最不能接受什么”和“最希望对方先做什么”分别告诉我，我不会直接转述，只用来找方案。`,
      bridge: `把两边的立场翻译一下：${a}真正要的是${c.a.interest.replace(/。$/, '')}；${b}真正要的是${c.b.interest.replace(/。$/, '')}。我们试试用交换，而不是对抗。`,
      cool: `今天先到这里吧。情绪都太高，继续谈只会说伤人的话。我们约明天上午十点再谈，期间各自把证据和底线想清楚，我分别联系。`
    };
    return maps[key] || '';
  }

  function applyStrategy(key, s) {
    const before = { A: { ...s.A }, B: { ...s.B } };
    const usedBefore = s.used[key] ? 1 : 0;
    const damp = usedBefore ? 0.55 : 1;
    const add = (party, field, value) => {
      s[party][field] = Math.round(clamp(s[party][field] + value, 4, 98));
    };
    const def = LT.strategies[key];
    if (key === 'empathy') {
      add('A', 'emo', -12 * damp); add('B', 'emo', -16 * damp);
      add('A', 'trust', 7 * damp); add('B', 'trust', 10 * damp);
      add('A', 'flex', 4 * damp); add('B', 'flex', 5 * damp);
      const target = s.A.emo >= s.B.emo ? 'A' : 'B';
      s[target].hidden = true;
    } else if (key === 'law') {
      const edge = s.case.a.evidence >= s.case.b.evidence ? 'A' : 'B';
      const other = edge === 'A' ? 'B' : 'A';
      add(edge, 'flex', 14 * damp);
      add(other, 'flex', 5 * damp);
      add('A', 'emo', s.A.emo > 62 ? 3 : -3);
      add('B', 'emo', s.B.emo > 62 ? 3 : -3);
      add('A', 'trust', s.A.emo > 62 ? -2 : 4);
      add('B', 'trust', s.B.emo > 62 ? -2 : 4);
    } else if (key === 'caucus') {
      add('A', 'emo', -8); add('B', 'emo', -8);
      add('A', 'trust', 6); add('B', 'trust', 6);
      add('A', 'flex', 8); add('B', 'flex', 8);
      s.A.hidden = true; s.B.hidden = true; s.A.bottom = true; s.B.bottom = true;
    } else if (key === 'bridge') {
      add('A', 'emo', -5 * damp); add('B', 'emo', -5 * damp);
      add('A', 'trust', 6 * damp); add('B', 'trust', 6 * damp);
      add('A', 'flex', 13 * damp); add('B', 'flex', 13 * damp);
    } else if (key === 'cool') {
      add('A', 'emo', -13); add('B', 'emo', -13);
      add('A', 'trust', 2); add('B', 'trust', 2);
      add('A', 'flex', 2); add('B', 'flex', 2);
    }
    return {
      A: {
        emo: s.A.emo - before.A.emo,
        trust: s.A.trust - before.A.trust,
        flex: s.A.flex - before.A.flex
      },
      B: {
        emo: s.B.emo - before.B.emo,
        trust: s.B.trust - before.B.trust,
        flex: s.B.flex - before.B.flex
      }
    };
  }

  async function useStrategy(key) {
    const s = state.med.s;
    if (!s || !state.med.started || s.done || s.busy) return;
    const def = LT.strategies[key];
    const used = s.used[key] || 0;
    if (!def || used >= def.max) return;
    if (def.requires === 'hidden' && !s.A.hidden && !s.B.hidden) {
      toast('先通过共情或背对背，了解双方真实诉求', 'warn');
      return;
    }
    s.busy = true;
    state.med.busy = true;
    s.used[key] = used + 1;
    updateMedUI();
    addMedMsg('sys', `第 ${s.round} 轮 · ${def.name}`);
    await sleep(260);
    if (s.epoch !== state.med.epoch) return;
    await typeThenMediator(s, strategyLine(key, s));
    if (s.epoch !== state.med.epoch) return;
    if (key === 'caucus') {
      const c = s.case;
      addCaucusCard('背对背 · 仅调解员可见', [
        `<b>单独对 ${esc(s.aName)}：</b>${esc(c.react.caucus.pa)}`,
        `<b>单独对 ${esc(s.bName)}：</b>${esc(c.react.caucus.pb)}`
      ]);
      await sleep(420);
    }
    const deltas = applyStrategy(key, s);
    if (s.epoch !== state.med.epoch) return;
    if (key === 'empathy' || key === 'caucus') {
      const revealed = [];
      if (s.A.hidden) revealed.push(`<b>${esc(s.aName)}：</b>${esc(s.case.a.hidden)}`);
      if (s.B.hidden) revealed.push(`<b>${esc(s.bName)}：</b>${esc(s.case.b.hidden)}`);
      if (revealed.length) {
        addCaucusCard('调解员手记 · 已触达真实诉求', revealed);
      }
    }
    await sleep(380);
    if (s.epoch !== state.med.epoch) return;
    addMedMsg('a', s.case.react[key]?.a || '我明白调解员的意思，但还是要看对方能拿出什么方案。', {
      deltas: { '情绪': deltas.A.emo, '信任': deltas.A.trust, '让步': deltas.A.flex }
    });
    await sleep(560);
    if (s.epoch !== state.med.epoch) return;
    addMedMsg('b', s.case.react[key]?.b || '只要对方是真诚的，我愿意继续谈。', {
      deltas: { '情绪': deltas.B.emo, '信任': deltas.B.trust, '让步': deltas.B.flex }
    });
    s.prevProb = s.prob;
    s.prob = calcProb(s);
    s.round += 1;
    s.busy = false;
    state.med.busy = false;
    updateMedUI();
    if (s.round > s.maxRounds) {
      toast('三轮推演结束，现在可以提出方案', 'ok');
    }
  }

  function hiddenKnown(s) {
    return !!(s && (s.A.hidden || s.B.hidden));
  }

  function strategyDisabled(key, s) {
    if (!s || !state.med.started || s.done) return { disabled: true, reason: '进入调解庭后可用' };
    if (s.busy) return { disabled: true, reason: '推演中…' };
    const def = LT.strategies[key];
    if ((s.used[key] || 0) >= def.max) return { disabled: true, reason: '本轮已用尽' };
    if (def.requires === 'hidden' && !hiddenKnown(s)) return { disabled: true, reason: '先了解真实诉求' };
    return { disabled: false, reason: '' };
  }

  function renderStrategyGrid() {
    const s = state.med.s;
    const grid = $('#strategyGrid');
    const dock = $('#medDock');
    const dockTitle = $('.dock-head b');
    if (!s || !state.med.started) {
      grid.innerHTML = Object.entries(LT.strategies).map(([key, def]) => `
        <button class="strategy-card" disabled title="进入调解庭后可用">
          <span class="sc-top">${icon(def.icon)}<em>${def.tag}</em></span>
          <b>${def.name}</b><span>${def.desc}</span>
        </button>`).join('');
      grid.hidden = false;
      $('#proposalDock').hidden = true;
      if (dockTitle) dockTitle.textContent = '选择本轮策略';
      $('#medDockHint').textContent = '共 3 轮 · 先降温再谈方案';
      return;
    }
    if (s.done) {
      grid.hidden = true;
      if (dockTitle) dockTitle.textContent = '调解结果';
      renderDoneDock();
      return;
    }
    if (s.round > s.maxRounds) {
      grid.hidden = true;
      if (dockTitle) dockTitle.textContent = '方案磋商';
      $('#medDockHint').textContent = '双方接受度达到 60% 即可促成签约';
      renderProposalDock();
      return;
    }
    if (dockTitle) dockTitle.textContent = '选择本轮策略';
    grid.hidden = false;
    $('#proposalDock').hidden = true;
    grid.innerHTML = Object.entries(LT.strategies).map(([key, def]) => {
      const st = strategyDisabled(key, s);
      const left = def.max - (s.used[key] || 0);
      return `<button class="strategy-card" data-strategy="${key}" ${st.disabled ? 'disabled' : ''} title="${esc(st.reason || def.tip)}">
        <span class="sc-top">${icon(def.icon)}<em>${def.tag}</em></span>
        <b>${def.name}</b><span>${def.desc}</span>
        <span class="sc-left">${left}</span>
      </button>`;
    }).join('');
    $('#medDockHint').textContent = `第 ${s.round} / ${s.maxRounds} 轮 · 先降温再谈方案`;
    $$('#strategyGrid .strategy-card').forEach((btn) => {
      btn.addEventListener('click', () => useStrategy(btn.dataset.strategy));
    });
  }

  function acceptance(option, s) {
    const ax = s.case.axis;
    const range = ax.max - ax.min || 1;
    let a = 55 + ((option.amount - ax.aEnd) / range) * 130 + s.A.flex * 0.28 - Math.max(0, s.A.emo - 55) * 0.35;
    let b = 55 + ((ax.bEnd - option.amount) / range) * 130 + s.B.flex * 0.28 - Math.max(0, s.B.emo - 55) * 0.35;
    return { a: clamp(Math.round(a), 5, 97), b: clamp(Math.round(b), 5, 97) };
  }

  function renderProposalDock() {
    const s = state.med.s;
    const box = $('#proposalDock');
    box.hidden = false;
    const dock = $('#medDock');
    if (dock) dock.classList.add('proposal');
    const opts = s.case.options.map((opt, idx) => {
      const acc = acceptance(opt, s);
      return `<button class="proposal-card" data-option="${idx}">
        <div class="pc-head"><b>${esc(opt.title)}</b><span>${esc(opt.tag || '方案')}</span></div>
        <div class="pc-amount">${fmtMoney(opt.amount)}<em>${esc(s.case.axis.unit)}</em></div>
        <p>${esc(opt.desc)}</p>
        <div class="acc-bars">
          <div class="acc"><span>甲方接受度<b>${acc.a}%</b></span><i><b style="width:${acc.a}%"></b></i></div>
          <div class="acc b"><span>乙方接受度<b>${acc.b}%</b></span><i><b style="width:${acc.b}%"></b></i></div>
        </div>
      </button>`;
    }).join('');
    box.innerHTML = `<div class="proposal-title"><b>第 ${s.maxRounds} 轮结束 · 提出可执行方案</b><span>接受度由情绪、信任与让步区间实时计算</span></div>
      <div class="proposal-grid">${opts}</div>
      <div style="display:flex;gap:6px;margin-top:7px">
        ${s.proposals > 0 ? `<button class="btn btn-ghost btn-sm" id="medExtraRound">${icon('refresh')}再谈一轮</button>` : ''}
        <span style="font-size:9px;color:var(--faint);line-height:1.5;flex:1">点击方案即代表调解员正式提出。双方接受度均达到 60% 才会促成签约。</span>
      </div>`;
    $$('#proposalDock [data-option]').forEach((btn) => btn.addEventListener('click', () => proposeOption(Number(btn.dataset.option))));
    const extra = $('#medExtraRound');
    if (extra) extra.addEventListener('click', () => {
      if (s.maxRounds >= 5) { toast('已到达推演上限，请调整方案', 'warn'); return; }
      s.maxRounds += 1;
      s.round = s.maxRounds;
      $('#proposalDock').hidden = true;
      renderStrategyGrid();
      toast('已增加一轮磋商，可继续使用策略');
    });
  }

  async function proposeOption(index) {
    const s = state.med.s;
    if (!s || s.busy || s.done) return;
    const opt = s.case.options[index];
    if (!opt) return;
    s.busy = true;
    state.med.busy = true;
    const acc = acceptance(opt, s);
    addMedMsg('sys', '方案磋商 · 调解员提出书面方案');
    await sleep(220);
    await typeThenMediator(s, `综合两边的底线，我提出一个书面方案：${opt.terms[0]} ${opt.terms[1] || ''} 核心金额为 ${fmtMoney(opt.amount)} ${s.case.axis.unit}。两位看是否能接受。`);
    await sleep(480);
    if (s.epoch !== state.med.epoch) return;
    const aOK = acc.a >= 60;
    const bOK = acc.b >= 60;
    addMedMsg('a', aOK ? s.case.react.bridge?.a || '这个方案我可以接受，但要写进协议。' : '这个金额还是低于我的底线。如果对方不能再加一点，我只能走其他程序。');
    await sleep(520);
    if (s.epoch !== state.med.epoch) return;
    addMedMsg('b', bOK ? s.case.react.bridge?.b || '如果能把后续义务写清楚，我可以签。' : '这个条件超出了我能承受的范围，我需要再和家里/公司商量。');
    await sleep(420);
    if (s.epoch !== state.med.epoch) return;
    s.busy = false;
    state.med.busy = false;
    if (aOK && bOK) {
      s.done = true;
      state.med.done = true;
      s.prob = 96;
      s.prevProb = 96;
      s.option = opt;
      s.agreement = {
        option: opt,
        amount: opt.amount,
        terms: opt.terms.slice(),
        clauses: s.case.agreement.clauses.slice(),
        perform: s.case.agreement.perform,
        aName: s.aName,
        bName: s.bName,
        date: fmtDate(),
        caseName: s.caseName
      };
      addMedMsg('sys', '调解成功 · 双方达成一致');
      addEvent('mediate', `${s.caseName}达成调解协议`, `${s.aName}与${s.bName}接受「${opt.title}」，金额 ${fmtMoney(opt.amount)} ${s.case.axis.unit}。`, 'mediate');
      toast('调解成功，协议条款已生成', 'ok');
      updateMedUI();
      renderStrategyGrid();
    } else {
      s.proposals += 1;
      addMedMsg('sys', `方案未获双方接受 · 甲方接受度 ${acc.a}% / 乙方 ${acc.b}%`);
      toast('双方仍有分歧，可再谈一轮或调整方案', 'warn');
      updateMedUI();
      renderStrategyGrid();
    }
  }

  function renderDoneDock() {
    const s = state.med.s;
    const dock = $('#medDock');
    if (!s || !s.agreement) return;
    $('#proposalDock').hidden = true;
    $('#strategyGrid').hidden = true;
    const box = $('#proposalDock');
    box.hidden = false;
    box.innerHTML = `<div class="med-done">
      <div class="med-done-head"><span class="done-mark">${icon('check')}</span><div><b>调解成功 · ${esc(s.caseName)}</b><span>${esc(s.aName)} / ${esc(s.bName)} · ${fmtMoney(s.agreement.amount)} ${esc(s.case.axis.unit)}</span></div></div>
      <div class="proposal-card" style="cursor:default;padding:10px 12px">
        <div class="pc-head"><b>${esc(s.agreement.option.title)}</b><span>已达成</span></div>
        <p style="margin-top:4px">${esc(s.agreement.option.terms[0])}</p>
      </div>
      <div class="med-done-actions">
        <button class="btn btn-primary btn-sm" id="medToDoc">${icon('doc')}生成调解协议</button>
        <button class="btn btn-ghost btn-sm" id="medViewAgreement">${icon('eye')}查看条款</button>
        <button class="btn btn-ghost btn-sm" id="medCopy">${icon('copy')}复制纪要</button>
      </div>
    </div>`;
    $('#medToDoc').addEventListener('click', () => { prefillDocFromMed(); toast('已带入文书生成', 'ok'); go('docs'); });
    $('#medViewAgreement').addEventListener('click', openMedAgreement);
    $('#medCopy').addEventListener('click', () => {
      copyText(medAgreementText()).then(() => toast('调解纪要已复制', 'ok'));
    });
  }

  function medAgreementText() {
    const s = state.med.s;
    if (!s?.agreement) return '';
    const a = s.agreement;
    return [`调解纪要 · ${a.caseName}`, `甲方：${a.aName}`, `乙方：${a.bName}`, `时间：${a.date}`, `方案：${a.option.title}`, `金额：${fmtMoney(a.amount)} ${s.case.axis.unit}`, ...a.terms.map((t, i) => `${CN_NUM[i] || i + 1}、${t}`), ...a.clauses.map((t, i) => `${CN_NUM[i + a.terms.length] || i + 1}、${t}`), `履行：${a.perform}`].join('\n');
  }

  function openMedAgreement() {
    const s = state.med.s;
    if (!s?.agreement) return;
    const a = s.agreement;
    openModal(`
      <div class="modal-head"><div><div class="modal-kicker">Mediation Agreement</div><h3>调解协议条款</h3><p>${esc(s.caseName)} · ${esc(a.date)}</p></div><button class="icon-btn" data-close-modal>${icon('close')}</button></div>
      <div class="modal-body">
        <div class="paper-party"><b>甲方：</b>${esc(a.aName)}</div>
        <div class="paper-party"><b>乙方：</b>${esc(a.bName)}</div>
        <div class="paper-party"><b>核心金额：</b>${fmtMoney(a.amount)} ${esc(s.case.axis.unit)}（${moneyCN(a.amount)}）</div>
        <h3 style="font-family:var(--serif);font-size:14px;margin:16px 0 8px">协议内容</h3>
        <ol style="font-size:12px;line-height:2;color:var(--text-2)">${a.terms.map((t) => `<li style="margin-bottom:4px">${esc(t)}</li>`).join('')}${a.clauses.map((t) => `<li style="margin-bottom:4px">${esc(t)}</li>`).join('')}</ol>
        <p class="muted-line" style="margin-top:10px">履行方式：${esc(a.perform)}</p>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" data-close-modal>关闭</button><button class="btn btn-primary" id="modalToDoc">带入文书生成</button></div>`);
    $('#modalToDoc').addEventListener('click', () => { closeModal(); prefillDocFromMed(); go('docs'); });
  }

  function prefillDocFromMed() {
    const s = state.med.s;
    let aName, bName, type, fact, terms, perform, amount;
    if (s?.agreement) {
      const a = s.agreement;
      aName = a.aName; bName = a.bName; type = s.caseName;
      fact = `${s.brief} 经${LT.community.full}调解，双方自愿达成如下协议：`;
      terms = [...a.terms, ...a.clauses].map((t, i) => `${CN_NUM[i] || i + 1}、${t}`).join('\n');
      perform = a.perform;
      amount = a.amount;
    } else {
      const c = getCase(state.med.caseId);
      aName = c.a.name; bName = c.b.name; type = c.name;
      fact = c.brief;
      terms = c.options[0].terms.map((t, i) => `${CN_NUM[i] || i + 1}、${t}`).join('\n');
      perform = c.agreement.perform;
      amount = c.options[0].amount;
    }
    state.docs.typeId = 'mediation';
    state.docs.values = {
      no: `（${now().getFullYear()}）幸民调字第${String(18).padStart(3, '0')}号`,
      date: fmtDate(),
      a: `${aName}。`,
      b: `${bName}。`,
      type,
      fact,
      terms,
      perform,
      org: LT.community.full,
      mediator: LT.community.mediator
    };
    state.docs.touched = {};
    DB.write('docs.current', state.docs.values);
    DB.write('docs.type', 'mediation');
    if (state.route === 'docs') renderDocs();
  }

  function updateMedUI() {
    const s = state.med.s;
    const c = s?.case || currentMedCase();
    const started = !!(state.med.started && s);
    const locked = !!state.med.started;
    ['medBrief', 'medAName', 'medBName'].forEach((id) => {
      const el = $(`#${id}`);
      if (el) el.disabled = locked;
    });
    $$('#tensionSeg button').forEach((b) => { b.disabled = locked; });
    const sampleBtn = $('#medSample');
    if (sampleBtn) sampleBtn.disabled = locked;
    const startBtn = $('#medStart');
    if (startBtn) startBtn.disabled = locked;
    if (!c) {
      $('#medProb').textContent = '—';
      $('#medProbDelta').textContent = '—';
      $('#medProbDelta').className = 'delta';
      $('#medProbBar').style.width = '0%';
      $('#medRound').textContent = '第 0 轮';
      const st0 = $('#medStageStatus');
      st0.className = 'state-pill';
      st0.innerHTML = '<i></i>等待开始';
      $('#zopaLabel').textContent = '待填写案情';
      $('#zopaA').textContent = '甲方 —';
      $('#zopaB').textContent = '乙方 —';
      const f0 = $('#zopaBar .zopa-fill');
      if (f0) { f0.style.width = '0%'; f0.style.left = '2%'; }
      const pa0 = $('#zopaBar .pin-a'); const pb0 = $('#zopaBar .pin-b');
      if (pa0) pa0.style.left = '2%';
      if (pb0) pb0.style.left = '98%';
      $('#medReading').innerHTML = '<p class="muted-line" style="padding:2px 0">填写案情后，这里会显示信任、让步空间与诉讼风险。</p>';
      $('#medRiskTip').className = 'risk-tip';
      $('#medRiskTip').innerHTML = `${icon('spark')}<p>先把案情写清楚，系统会自动匹配模型与法条，再开始推演。</p>`;
      renderStrategyGrid();
      renderPartyStrip();
      return;
    }
    const prob = started ? s.prob : c.base;
    const prev = started ? s.prevProb : c.base;
    const delta = prob - prev;
    $('#medProb').textContent = String(prob);
    const deltaEl = $('#medProbDelta');
    deltaEl.textContent = started && delta !== 0 ? `${delta > 0 ? '+' : ''}${delta}%` : '—';
    deltaEl.className = `delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`;
    $('#medProbBar').style.width = `${prob}%`;
    $('#medRound').textContent = !started ? '第 0 轮' : s.done ? '已达成' : s.round > s.maxRounds ? '方案磋商' : `第 ${s.round} 轮`;
    const st = $('#medStageStatus');
    if (!started) { st.className = 'state-pill'; st.innerHTML = '<i></i>等待开始'; }
    else if (s.done) { st.className = 'state-pill done'; st.innerHTML = '<i></i>调解成功'; }
    else if (s.busy) { st.className = 'state-pill warn'; st.innerHTML = '<i></i>推演中'; }
    else if (s.round > s.maxRounds) { st.className = 'state-pill warn'; st.innerHTML = '<i></i>方案磋商'; }
    else { st.className = 'state-pill live'; st.innerHTML = '<i></i>调解进行中'; }

    const ax = c.axis;
    let aOffer = ax.aStart;
    let bOffer = ax.bStart;
    if (started) { aOffer = calcOffer(s, 'a'); bOffer = calcOffer(s, 'b'); }
    const toPct = (v) => clamp(((v - ax.min) / (ax.max - ax.min || 1)) * 100, 2, 98);
    const ap = toPct(aOffer);
    const bp = toPct(bOffer);
    const fill = $('#zopaBar .zopa-fill');
    if (fill) {
      if (bOffer >= aOffer) {
        fill.style.left = `${ap}%`;
        fill.style.width = `${Math.max(0, bp - ap)}%`;
        fill.style.background = 'linear-gradient(90deg, rgba(47,107,90,.55), var(--jade-2))';
      } else {
        fill.style.left = `${bp}%`;
        fill.style.width = `${Math.max(0, ap - bp)}%`;
        fill.style.background = 'linear-gradient(90deg, #d9a79f, #c66a5f)';
      }
    }
    const pinA = $('#zopaBar .pin-a');
    const pinB = $('#zopaBar .pin-b');
    if (pinA) pinA.style.left = `${ap}%`;
    if (pinB) pinB.style.left = `${bp}%`;
    const overlap = bOffer - aOffer;
    $('#zopaLabel').textContent = !started ? '尚未开始' : overlap >= 0 ? `已重叠 ${fmtMoney(Math.round(overlap))} ${ax.unit}` : `差距 ${fmtMoney(Math.round(-overlap))} ${ax.unit}`;
    $('#zopaA').textContent = started ? `甲方 ${fmtMoney(Math.round(aOffer))} ${ax.unit}` : '甲方 —';
    $('#zopaB').textContent = started ? `乙方 ${fmtMoney(Math.round(bOffer))} ${ax.unit}` : '乙方 —';

    if (started) {
      const trust = Math.round((s.A.trust + s.B.trust) / 2);
      const flex = Math.round((s.A.flex + s.B.flex) / 2);
      const stronger = c.a.evidence >= c.b.evidence ? '甲方' : '乙方';
      const known = s.A.bottom || s.B.bottom;
      $('#medReading').innerHTML = `
        <div class="readout-row"><span>平均信任</span><b>${trust} / 100</b></div>
        <div class="readout-row"><span>让步空间</span><b>${flex} / 100</b></div>
        <div class="readout-row"><span>证据优势</span><b>${stronger} · ${Math.max(c.a.evidence, c.b.evidence)}%</b></div>
        <div class="readout-row"><span>诉讼风险</span><b>甲 ${c.a.risk} · 乙 ${c.b.risk}</b></div>
        <div class="readout-row"><span>真实底线</span><b>${known ? '已掌握' : '未掌握'}</b></div>`;
    } else {
      $('#medReading').innerHTML = `
        <div class="readout-row"><span>平均信任</span><b>—</b></div>
        <div class="readout-row"><span>让步空间</span><b>—</b></div>
        <div class="readout-row"><span>证据优势</span><b>${c.a.evidence >= c.b.evidence ? '甲方' : '乙方'}</b></div>
        <div class="readout-row"><span>诉讼风险</span><b>甲 ${c.a.risk} · 乙 ${c.b.risk}</b></div>
        <div class="readout-row"><span>真实底线</span><b>未掌握</b></div>`;
    }

    if (!started) {
      $('#medRiskTip').className = 'risk-tip';
      $('#medRiskTip').innerHTML = `${icon('alert')}<p>开始推演后，这里会给出实时的节奏提醒。</p>`;
    } else if (s.done) {
      $('#medRiskTip').className = 'risk-tip ok';
      $('#medRiskTip').innerHTML = `${icon('check')}<p>方案已获双方接受，建议立即制作调解协议，并告知可申请司法确认。</p>`;
    } else if (Math.max(s.A.emo, s.B.emo) >= 82) {
      $('#medRiskTip').className = 'risk-tip danger';
      $('#medRiskTip').innerHTML = `${icon('alert')}<p>一方情绪已接近临界（${Math.max(s.A.emo, s.B.emo)}/100）。此时继续释法容易激化，建议先共情或背对背降温。</p>`;
    } else if (s.round > s.maxRounds && prob < 55) {
      $('#medRiskTip').className = 'risk-tip';
      $('#medRiskTip').innerHTML = `${icon('alert')}<p>和解概率仍偏低。可以增加一轮磋商，或调整方案金额，把“可接受区间”往中间拉。</p>`;
    } else if (bOffer >= aOffer && prob >= 55) {
      $('#medRiskTip').className = 'risk-tip ok';
      $('#medRiskTip').innerHTML = `${icon('spark')}<p>双方方案区间已经重叠，可以提出具体方案，并明确履行期限与违约后果。</p>`;
    } else {
      $('#medRiskTip').className = 'risk-tip';
      $('#medRiskTip').innerHTML = `${icon('spark')}<p>当前差距 ${fmtMoney(Math.max(0, aOffer - bOffer))} ${ax.unit}。优先用利益桥接，把“立场”换成“交换”。</p>`;
    }

    renderStrategyGrid();
    renderPartyStrip();
  }

  function resetMediation() {
    const epoch = state.med.epoch + 1;
    const form = state.med.form || { brief: '', aName: '', bName: '' };
    const caseId = state.med.caseId;
    state.med = {
      inited: true, caseId, caseCache: state.med.caseCache, started: false, done: false, busy: false,
      epoch, s: null, tension: 'mid', form, lawOpen: false, lawActive: -1
    };
    fillMedSetup();
    renderMedCaseInfo();
    renderPartyStrip();
    renderMedStreamEmpty();
    updateMedUI();
  }

  function chooseAutoStrategy(s) {
    const avgEmo = (s.A.emo + s.B.emo) / 2;
    const can = (k) => (s.used[k] || 0) < LT.strategies[k].max;
    if (avgEmo > 74 && can('empathy')) return 'empathy';
    if (!s.A.hidden && !s.B.hidden && can('caucus')) return 'caucus';
    if (hiddenKnown(s) && can('bridge')) return 'bridge';
    if (s.round >= 2 && can('law')) return 'law';
    if (can('empathy')) return 'empathy';
    if (can('bridge')) return 'bridge';
    if (can('law')) return 'law';
    return 'cool';
  }

  async function autoMediate() {
    if (state.med.busy) { toast('推演正在进行中'); return; }
    if (!state.med.started) {
      await startMediation();
      await sleep(700);
    }
    const s = state.med.s;
    if (!s || s.done) { toast('本轮推演已结束'); return; }
    $('#medAuto').disabled = true;
    $('#medAuto').innerHTML = `${icon('refresh')}推演中…`;
    let guard = 0;
    while (s.round <= s.maxRounds && !s.done && guard < 5) {
      guard += 1;
      const key = chooseAutoStrategy(s);
      await useStrategy(key);
      await sleep(350);
      if (s.epoch !== state.med.epoch) break;
    }
    if (!s.done && s.round > s.maxRounds) {
      const scored = s.case.options.map((o, i) => {
        const acc = acceptance(o, s);
        return { i, min: Math.min(acc.a, acc.b) };
      }).sort((a, b) => b.min - a.min);
      if (scored[0] && scored[0].min >= 55) {
        await proposeOption(scored[0].i);
      } else {
        toast('自动推演完成：仍有分歧，建议手动调整方案或再谈一轮', 'warn');
      }
    }
    $('#medAuto').disabled = false;
    $('#medAuto').innerHTML = `${icon('play')}自动推演`;
    updateMedUI();
  }

  function renderMediation() {
    if (!state.med.inited) initMediation();
    else {
      renderMedCaseInfo();
      renderPartyStrip();
      updateMedUI();
    }
  }

  /* =====================================================
     Module 2 · Advisor
     ===================================================== */
  const ADV_QUICK = [
    { label: '物业费能不交吗？', text: '电梯一直坏，物业还催缴物业费，我能不交吗？' },
    { label: '朋友借钱不还', text: '朋友借了我3万块钱，只有微信转账记录，一直不还，怎么办？' },
    { label: '被辞退能赔多少', text: '公司突然把我辞退了，没有提前通知，我能拿多少赔偿？' },
    { label: '楼上噪音扰民', text: '楼上每天半夜装修，孩子没法睡觉，说了也不听，怎么处理？' },
    { label: '预付卡不给退', text: '健身房搬走了，私教课还剩四千多，商家说概不退款，怎么办？' },
    { label: '房东不退押金', text: '退租时房东以墙面有污渍为由扣着6000元押金不退，合理吗？' },
    { label: '遭遇家暴', text: '我老公昨天动手打我，还威胁我不许报警，我该怎么办？' },
    { label: '子女不赡养', text: '我78岁了，三个子女只有小女儿管我，老大两年没给赡养费，能起诉吗？' }
  ];

  function renderAdvisor() {
    if (!state.adv.inited) initAdvisor();
    else {
      renderAdvStream();
      renderSootheCard();
      const topic = state.adv.topicId ? LT.topics.find((t) => t.id === state.adv.topicId) : null;
      renderAdvSide(topic);
    }
  }

  function initAdvisor() {
    state.adv.inited = true;
    $('#advQuick').innerHTML = ADV_QUICK.map((q) => `<button type="button" data-adv-q="${esc(q.text)}">${esc(q.label)}</button>`).join('');
    renderAdvStream();
    renderSootheCard();
    renderAdvSide(null);
    $('#sootheToggle').addEventListener('change', (e) => {
      state.adv.soothing = e.target.checked;
      DB.write('adv.soothing', state.adv.soothing);
      renderSootheCard();
      renderAdvStream();
      toast(state.adv.soothing ? '已开启情绪安抚：先回应感受，再讲法律' : '已切换专业模式：直接给法律分析', 'ok');
    });
    $('#sootheModes').addEventListener('click', (e) => {
      const mode = e.target.closest('[data-soothe-mode]');
      if (!mode) return;
      state.adv.soothing = mode.dataset.sootheMode === 'on';
      DB.write('adv.soothing', state.adv.soothing);
      $('#sootheToggle').checked = state.adv.soothing;
      renderSootheCard();
      renderAdvStream();
    });
    $('#advModeTag').addEventListener('click', () => {
      state.adv.soothing = !state.adv.soothing;
      DB.write('adv.soothing', state.adv.soothing);
      renderSootheCard();
      renderAdvStream();
      toast(state.adv.soothing ? '已开启情绪安抚' : '已切换到专业模式', 'ok');
    });
    const form = $('#advForm');
    const input = $('#advInput');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      sendAdvice(input.value);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAdvice(input.value);
      }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = `${Math.min(110, input.scrollHeight)}px`;
    });
    $('#advQuick').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-adv-q]');
      if (!btn) return;
      input.value = btn.dataset.advQ;
      sendAdvice(input.value);
    });
    $('#advExport').addEventListener('click', exportAdvisor);
    $('#advClear').addEventListener('click', clearAdvisor);
    $('#advStream').addEventListener('click', (e) => {
      const follow = e.target.closest('[data-follow]');
      if (follow) { input.value = follow.dataset.follow; sendAdvice(follow.dataset.follow); return; }
      const doc = e.target.closest('[data-doc-topic]');
      if (doc) { docFromAdvisor(doc.dataset.docTopic); return; }
      const med = e.target.closest('[data-med-topic]');
      if (med) { medFromAdvisor(med.dataset.medTopic); return; }
    });
  }

  function advIntroHTML() {
    return `<div class="adv-intro">
      <b>你好，我是小律。</b>
      <p>把遇到的事直接说清楚就好。需要被理解的时候，可以打开右侧的「情绪安抚」；只想直接听法律结论，就关掉它。</p>
      <p>法律的部分，我来拆成判断、依据和一张能照着做的清单。</p>
      <div class="intro-tags"><span>情绪安抚可开关</span><span>13 类基层纠纷</span><span>条文依据</span><span>行动清单</span><span>可转文书</span></div>
    </div>`;
  }

  function renderAdvStream() {
    const stream = $('#advStream');
    if (!stream) return;
    const msgs = state.adv.messages;
    let html = `<div class="adv-day">今天 · ${esc(LT.community.name)}法律服务工作站</div>${advIntroHTML()}`;
    if (!msgs.length) {
      html += `<div class="adv-starters">
        <div class="starters-head"><b>不知道从哪说起？</b><span>选一个最近常遇到的情形</span></div>
        <div class="starter-grid">
          ${[ADV_QUICK[0], ADV_QUICK[1], ADV_QUICK[2], ADV_QUICK[6]].map((q, i) => `<button class="starter-card" data-follow="${esc(q.text)}"><span class="starter-no">0${i + 1}</span><b>${esc(q.label)}</b><span>${esc(q.text)}</span><i>${icon('arrow')}</i></button>`).join('')}
        </div>
      </div>`;
    }
    for (const m of msgs) {
      if (m.role === 'user') {
        html += `<div class="adv-msg user">
          <span class="msg-avatar">我</span>
          <div class="adv-msg-body">
            <div class="adv-user-bubble">${esc(m.text)}</div>
            <div class="adv-user-meta"><span>${esc(m.time || '')}</span></div>
          </div>
        </div>`;
      } else {
        const topic = LT.topics.find((t) => t.id === m.topicId) || null;
        html += `<div class="adv-msg bot"><span class="msg-avatar">${icon('bot')}</span><div class="adv-msg-body">${buildAdvAnswer(topic, m.emoKey || 'calm', m.userText || '', m.danger)}</div></div>`;
      }
    }
    if (state.adv.busy) {
      html += `<div class="adv-msg bot"><span class="msg-avatar">${icon('bot')}</span><div class="adv-msg-body"><div class="adv-answer"><div class="ans-typing"><i></i><i></i><i></i></div><div style="font-size:9px;color:var(--faint);padding:0 12px 10px">正在整理法律依据与行动清单…</div></div></div></div>`;
    }
    stream.innerHTML = html;
    const rows = Array.from(stream.querySelectorAll('.adv-msg'));
    const lastUser = [...rows].reverse().find((el) => el.classList.contains('user'));
    if (lastUser) {
      const streamRect = stream.getBoundingClientRect();
      const rowRect = lastUser.getBoundingClientRect();
      stream.scrollTop = Math.max(0, stream.scrollTop + rowRect.top - streamRect.top - 6);
    } else {
      stream.scrollTop = 0;
    }
  }

  function buildAdvAnswer(topic, emoKey, userText, danger) {
    const t = topic || {};
    const soothing = state.adv.soothing;
    const empathy = (t.empathy && (t.empathy[emoKey] || t.empathy.default)) || '这件事落到谁身上都不轻松。我们先把事实和诉求理清楚，再决定下一步。';
    const verdict = t.verdict || '先把事实、时间、金额和你的诉求说清楚，再判断走协商、调解还是诉讼。';
    const points = t.points || [
      '先确认法律关系：是合同、侵权，还是家庭 / 相邻关系。不同关系对应不同的责任和证据。',
      '把“发生了什么”按时间写成一条线：谁、何时、做了什么、造成了什么后果。',
      '在采取行动前，先判断时效与管辖：一般民事纠纷诉讼时效为三年，劳动争议仲裁时效为一年。'
    ];
    const laws = t.laws || [{ code: '《民法典》第1165条', text: '行为人因过错侵害他人民事权益造成损害的，应当承担侵权责任。' }];
    const actions = t.actions || [
      { t: '整理材料', d: '把合同、转账、聊天记录、照片等证据按时间整理。' },
      { t: '书面沟通', d: '用微信或书面方式提出明确诉求，保留对方回复。' },
      { t: '寻求调解', d: '向社区调委会、司法所或12348申请免费调解。' },
      { t: '依法维权', d: '协商不成的，向有管辖权的法院起诉或申请仲裁。' }
    ];
    const evidence = t.evidence || ['合同 / 协议', '付款或转账记录', '沟通记录', '现场照片 / 录音'];
    const caution = t.caution || '不要用堵门、曝光隐私、扣留财物等方式维权，可能让你从有理变成担责。';
    const followups = t.followups || ['我该先做什么', '需要准备哪些证据', '要不要请律师'];
    const crisis = danger || (userText && LT.dangerWords.some((w) => userText.includes(w)));
    const crisisBlock = crisis ? `<section><div class="ans-caution" style="background:var(--red-soft)">${icon('alert')}<span><b>如果正处于危险中：</b>先离开现场，拨打 110；家暴可同时联系妇联 12338 或社区庇护机构。任何证据都不值得用安全去换。</span></div></section>` : '';
    const empathyBlock = soothing ? `<section class="ans-empathy">
        <div class="ans-label">${icon('heart')}先回应你的感受</div>
        <p>${esc(empathy)}</p>
      </section>` : '';
    return `<div class="adv-answer">
      ${empathyBlock}
      ${crisisBlock}
      <section>
        <div class="ans-label">${icon('scale')}${soothing ? '法律分析' : '直接说结论'}</div>
        <div class="ans-verdict">${esc(verdict)}</div>
        <div class="ans-points" style="margin-top:8px">${points.map((p, i) => `<div class="ans-point"><i>0${i + 1}</i><span>${esc(p)}</span></div>`).join('')}</div>
      </section>
      <section>
        <div class="ans-label">${icon('book')}依据</div>
        <div class="ans-laws">${laws.map((l) => `<div class="ans-law"><b>${esc(l.code)}</b> · ${esc(l.text)}</div>`).join('')}</div>
      </section>
      <section>
        <div class="ans-label">${icon('check')}你可以这样做</div>
        <div class="ans-actions">${actions.slice(0, 4).map((a, i) => `<div class="ans-action"><i>${i + 1}</i><div><b>${esc(a.t)}</b><span>${esc(a.d)}</span></div></div>`).join('')}</div>
      </section>
      <section>
        <div class="ans-label">${icon('folder')}证据清单</div>
        <div class="ans-evidence">${evidence.map((e) => `<span>${esc(e)}</span>`).join('')}</div>
        <div class="ans-caution" style="margin-top:7px">${icon('alert')}<span>${esc(caution)}</span></div>
      </section>
      <div class="ans-foot">
        ${followups.slice(0, 2).map((f) => `<button data-follow="${esc(f)}">${esc(f)}</button>`).join('')}
        <button data-doc-topic="${esc(t.id || '')}">${icon('doc')}生成文书</button>
        ${t.id && !['dv', 'fraud', 'highfall'].includes(t.id) ? `<button data-med-topic="${esc(t.id)}">${icon('scale')}转调解</button>` : ''}
      </div>
    </div>`;
  }

  function detectEmotion(text) {
    const scores = { angry: 0, anxious: 0, wronged: 0, helpless: 0, fearful: 0 };
    Object.keys(LT.emotionLex).forEach((key) => {
      Object.entries(LT.emotionLex[key]).forEach(([word, weight]) => {
        if (!text.includes(word)) return;
        const count = text.split(word).length - 1;
        scores[key] += weight * Math.min(2, count);
      });
    });
    const danger = LT.dangerWords.some((w) => text.includes(w));
    if (danger) scores.fearful += 7;
    let best = 'calm';
    let bestScore = 5.5;
    Object.entries(scores).forEach(([key, value]) => {
      if (value > bestScore) { best = key; bestScore = value; }
    });
    return { key: best, danger };
  }

  function matchTopic(text, emo) {
    if (emo.danger && /(家暴|打我|动手|威胁|杀|救命|尾随)/.test(text)) {
      return LT.topics.find((t) => t.id === 'dv') || null;
    }
    let best = null;
    let bestScore = 0;
    for (const topic of LT.topics) {
      let score = 0;
      Object.entries(topic.keys).forEach(([key, weight]) => {
        if (text.includes(key)) score += weight;
      });
      if (score > bestScore) { bestScore = score; best = topic; }
    }
    return bestScore >= 2 ? best : null;
  }

  function sendAdvice(raw) {
    const text = String(raw || '').trim();
    if (!text) return;
    if (state.adv.busy) { toast('小律正在回答上一条，请稍候'); return; }
    const emo = detectEmotion(text);
    const topic = matchTopic(text, emo);
    const msg = {
      role: 'user', text, emoKey: emo.key, danger: emo.danger, time: fmtHm()
    };
    state.adv.messages.push(msg);
    state.adv.messages = state.adv.messages.slice(-30);
    state.adv.topicId = topic?.id || null;
    state.adv.busy = true;
    const epoch = ++state.adv.epoch;
    $('#advInput').value = '';
    $('#advInput').style.height = 'auto';
    renderAdvStream();
    renderAdvSide(topic);
    renderSafety(emo);
    DB.write('adv.messages', state.adv.messages);
    setTimeout(() => {
      if (epoch !== state.adv.epoch) return;
      state.adv.busy = false;
      state.adv.messages.push({
        role: 'bot', topicId: topic?.id || null, emoKey: emo.key,
        userText: text, danger: emo.danger, time: fmtHm()
      });
      state.adv.messages = state.adv.messages.slice(-30);
      renderAdvStream();
      DB.write('adv.messages', state.adv.messages);
      addEvent('advisor', '完成一次法律咨询', topic ? `已生成「${topic.title}」的结构化建议` : '已生成综合法律建议', 'advisor');
      if (emo.danger) toast('检测到安全风险，已给出紧急处置建议', 'warn');
    }, 760);
  }

  function renderSootheCard() {
    const on = !!state.adv.soothing;
    const toggle = $('#sootheToggle');
    if (toggle) toggle.checked = on;
    const tag = $('#advModeTag');
    if (tag) tag.innerHTML = `<i></i>情绪安抚 · ${on ? '开' : '关'}`;
    const desc = $('#sootheDesc');
    if (desc) desc.textContent = on
      ? '开启后，小律会先回应你的感受，再给法律建议；关闭则直接进入专业分析。'
      : '当前为专业模式：小律会直接给出法律判断、依据和行动清单，不做情绪回应。';
    $$('#sootheModes button').forEach((el) => el.classList.toggle('active', (el.dataset.sootheMode === 'on') === on));
  }

  function renderSafety(emo) {
    const card = $('#advSafety');
    if (!card) return;
    if (!emo || !emo.danger) { card.hidden = true; return; }
    card.hidden = false;
    const last = [...state.adv.messages].reverse().find((m) => m.role === 'user');
    const txt = last?.text || '';
    const isDv = /(家暴|打我|动手|威胁|尾随)/.test(txt);
    $('#advSafetyText').textContent = isDv
      ? '先离开危险现场，确认自己在安全的地方。拨打 110 报警并要求出警记录；就医验伤，保留照片、病历和聊天记录。可以向法院申请人身安全保护令。'
      : '如果你或身边的人有伤害自己的念头，请立即联系身边可信任的人，并拨打 110 或心理援助热线 12356。你不需要一个人扛。';
  }

  function renderAdvSide(topic) {
    if (topic) {
      $('#advLaws').innerHTML = topic.laws.map((l) => `<div class="law-item"><b>${esc(l.code)}<i class="law-official">官方原文</i></b><p>${esc(l.text)}</p></div>`).join('') + `<div class="law-source-line"><button type="button" data-legal-source>${icon('shield')}法条来源：国家法律法规数据库</button></div>`;
      $('#advCases').innerHTML = topic.cases.map((c) => `<div class="case-item"><b>${esc(c.title)}</b><p>${esc(c.result)}</p><div class="case-meta"><span>${esc(c.tag)}</span><span>${esc(c.days)}结案</span></div></div>`).join('');
    } else {
      $('#advLaws').innerHTML = '<p class="muted-line">提问后自动关联相关条文。</p>';
      $('#advCases').innerHTML = '<p class="muted-line">选择一个话题后显示。</p>';
    }
  }

  function clearAdvisor() {
    state.adv.epoch += 1;
    state.adv.busy = false;
    state.adv.messages = [];
    state.adv.topicId = null;
    DB.remove('adv.messages');
    DB.remove('adv.emotions');
    renderAdvStream();
    renderSootheCard();
    renderAdvSide(null);
    toast('已开始新对话', 'ok');
  }

  function exportAdvisor() {
    const msgs = state.adv.messages;
    if (!msgs.length) { toast('还没有咨询记录'); return; }
    const lines = [`Law Trace 法痕律迹 · 私人法律顾问咨询记录`, `社区：${LT.community.name}`, `导出时间：${fmtStamp()}`, ''];
    msgs.forEach((m) => {
      if (m.role === 'user') {
        lines.push(`【咨询人】${m.time || ''} ${m.text}`, '');
      } else {
        const topic = LT.topics.find((t) => t.id === m.topicId);
        lines.push(`【小律】${topic ? `争议类型：${topic.title}` : '综合法律建议'}`, topic ? `结论：${topic.verdict}` : '', ...(topic?.actions || []).map((a) => `- ${a.t}：${a.d}`), '');
      }
    });
    lines.push('本记录为普法参考，不替代执业律师意见。');
    download(`法痕律迹-咨询记录-${fmtDate().replace(/[年月日]/g, '')}.txt`, lines.join('\n'));
    toast('咨询记录已导出', 'ok');
  }

  function docFromAdvisor(topicId) {
    const topic = LT.topics.find((t) => t.id === topicId);
    const lastUser = [...state.adv.messages].reverse().find((m) => m.role === 'user');
    const fact = `${lastUser?.text || ''}${topic ? `\n\n经初步分析：${topic.points[0]}` : ''}`;
    const evidence = topic ? topic.evidence.map((e, i) => `${i + 1}. ${e}；`).join('\n') : '';
    const date = fmtDate();
    if (topicId === 'labor') {
      state.docs.typeId = 'arbitration';
      state.docs.values = {
        a: '申请人（咨询人）：姓名、性别、身份证号、住址、电话（待补充）',
        b: '被申请人：单位名称、地址、法定代表人（待补充）',
        claims: '一、请求裁决被申请人支付拖欠工资 / 违法解除赔偿金（金额待核算）；\n二、请求裁决被申请人承担本案仲裁费用。',
        fact,
        evidence: evidence || '劳动合同、工资流水、考勤记录、解除通知。',
        court: 'XX区劳动人事争议仲裁委员会',
        date
      };
    } else {
      state.docs.typeId = 'letter';
      state.docs.values = {
        no: `法痕律函〔${now().getFullYear()}〕第${String(Math.floor(Math.random() * 80) + 10).padStart(3, '0')}号`,
        date,
        client: '委托人（咨询人）',
        to: '收函人（相关责任方）',
        matter: `关于${topic?.title || '相关争议'}的函`,
        fact: `${fact}\n\n依据：${topic?.laws.map((l) => l.code).join('、') || '《民法典》相关规定'}。`,
        demand: (topic?.actions || []).map((a, i) => `${CN_NUM[i] || i + 1}、${a.t}：${a.d}`).join('\n'),
        deadline: '收到本函之日起7日内',
        org: '法痕律迹基层法律服务工作站',
        signer: LT.community.mediator
      };
    }
    state.docs.touched = {};
    DB.write('docs.type', state.docs.typeId);
    DB.write('docs.current', state.docs.values);
    go('docs');
    toast('已生成文书草稿，请补充身份信息与金额', 'ok');
  }

  function medFromAdvisor(topicId) {
    const map = { property: 'property', labor: 'wage', consume: 'prepaid', noise: 'noise', rent: 'deposit', support: 'support', pet: 'pet' };
    const caseId = map[topicId] || 'property';
    const lastUser = [...state.adv.messages].reverse().find((m) => m.role === 'user');
    go('mediate');
    setTimeout(() => {
      if (!state.med.inited) initMediation();
      selectMedCase(caseId, {
        brief: lastUser?.text || undefined,
        aName: '咨询人',
        bName: '对方当事人'
      });
      updateMedMatch();
      toast('已带入调解案件，可编辑案情后开始推演', 'ok');
    }, 80);
  }

  function restoreAdvisor() {
    const lastUser = [...state.adv.messages].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      state.adv.topicId = [...state.adv.messages].reverse().find((m) => m.role === 'bot')?.topicId || null;
    }
  }

  /* =====================================================
     Module 3 · Documents
     ===================================================== */
  const DOC_LAW_COUNT = { mediation: 3, letter: 3, complaint: 3, arbitration: 3, opinion: 3, enforce: 2 };
  const DOC_SUB = {
    mediation: "PEOPLE'S MEDIATION AGREEMENT",
    letter: "LAWYER'S LETTER",
    complaint: 'CIVIL COMPLAINT',
    arbitration: 'LABOR ARBITRATION APPLICATION',
    opinion: 'LEGAL OPINION',
    enforce: 'APPLICATION FOR ENFORCEMENT'
  };

  function defaultDocValues(typeId) {
    const type = LT.docTypes.find((t) => t.id === typeId) || LT.docTypes[0];
    const date = fmtDate();
    const no = `（${now().getFullYear()}）幸民调字第${String(18).padStart(3, '0')}号`;
    const map = {
      mediation: { no, date, a: '', b: '', type: '', fact: '', terms: '', perform: '', org: LT.community.full, mediator: LT.community.mediator },
      letter: { no: `法痕律函〔${now().getFullYear()}〕第067号`, date, client: '', to: '', matter: '', fact: '', demand: '', deadline: '收到本函之日起7日内', org: '法痕律迹基层法律服务工作站', signer: LT.community.mediator },
      complaint: { a: '', b: '', claims: '', fact: '', evidence: '', court: 'XX区人民法院', date },
      arbitration: { a: '', b: '', claims: '', fact: '', evidence: '', court: 'XX区劳动人事争议仲裁委员会', date },
      opinion: { no: `法意字〔${now().getFullYear()}〕第021号`, date, client: '', subject: '', fact: '', analysis: '', conclusion: '', org: '法痕律迹基层法律服务工作站', signer: LT.community.mediator },
      enforce: { a: '', b: '', basis: '', claims: '', fact: '', court: 'XX区人民法院', date }
    };
    return { ...(map[type.id] || map.mediation) };
  }

  function docType() {
    return LT.docTypes.find((t) => t.id === state.docs.typeId) || LT.docTypes[0];
  }

  function renderDocs() {
    if (!state.docs.inited) initDocs();
    else {
      renderDocTypes();
      renderDocForm();
      updateDocsUI();
    }
  }

  function initDocs() {
    state.docs.inited = true;
    if (!LT.docTypes.some((t) => t.id === state.docs.typeId)) state.docs.typeId = 'mediation';
    const defaults = defaultDocValues(state.docs.typeId);
    state.docs.values = { ...defaults, ...(state.docs.values || {}) };
    $('#docTypeTabs').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-doc-type]');
      if (!btn) return;
      switchDocType(btn.dataset.docType);
    });
    $('#docForm').addEventListener('input', (e) => {
      const input = e.target.closest('[data-doc-key]');
      if (!input) return;
      state.docs.values[input.dataset.docKey] = input.value;
      state.docs.touched[input.dataset.docKey] = true;
      updateDocsUI();
      scheduleDocSave();
    });
    $('#docForm').addEventListener('blur', (e) => {
      if (e.target.closest('[data-doc-key]')) updateDocsUI();
    }, true);
    $('#docSample').addEventListener('click', loadDocSample);
    $('#docFromMed').addEventListener('click', () => { prefillDocFromMed(); renderDocs(); toast('已从调解带入', 'ok'); });
    $('#docClear').addEventListener('click', clearDoc);
    $('#docGenerate').addEventListener('click', generateDoc);
    $('#docNew').addEventListener('click', clearDoc);
    $('#docCopy').addEventListener('click', copyDoc);
    $('#docDownload').addEventListener('click', downloadDoc);
    $('#docPrint').addEventListener('click', printDoc);
    $('#docSave').addEventListener('click', saveDocDraft);
    $('#docDrafts').addEventListener('click', openDrafts);
    const clauseBtn = $('#docClauses');
    if (clauseBtn) clauseBtn.addEventListener('click', openClauses);
    renderDocTypes();
    renderDocForm();
    updateDocsUI();
  }

  function renderDocTypes() {
    $('#docTypeTabs').innerHTML = LT.docTypes.map((t) => `
      <button class="doc-type ${t.id === state.docs.typeId ? 'active' : ''}" data-doc-type="${t.id}" title="${esc(t.desc)}">
        <span class="dt-icon">${icon(t.icon)}</span>
        <div><b>${esc(t.name)}</b><span>${esc(t.code)}</span></div>
      </button>`).join('');
    $('#docTypeCode').textContent = docType().code;
    $('#docDraftCount').textContent = String(state.docs.drafts.length);
  }

  function renderDocForm() {
    const t = docType();
    const v = state.docs.values;
    let html = '';
    let buffer = [];
    const flush = () => {
      if (buffer.length) html += `<div class="field-row">${buffer.join('')}</div>`;
      buffer = [];
    };
    t.fields.forEach((f) => {
      const val = v[f.key] ?? '';
      const missing = state.docs.touched[f.key] && f.required && !String(val).trim();
      let control;
      if (f.type === 'textarea') {
        control = `<textarea data-doc-key="${f.key}" rows="${f.rows || 4}" placeholder="${esc(f.ph || '')}">${esc(val)}</textarea>`;
      } else {
        control = `<input data-doc-key="${f.key}" value="${esc(val)}" placeholder="${esc(f.ph || '')}" autocomplete="off" />`;
      }
      const fieldHTML = `<label class="field ${missing ? 'field-err' : ''}" data-field="${f.key}">
        <span>${esc(f.label)}${f.required ? '<em>*</em>' : ''}</span>
        ${control}
        ${f.hint ? `<span class="field-hint">${esc(f.hint)}</span>` : ''}
      </label>`;
      if (f.half && f.type !== 'textarea') buffer.push(fieldHTML);
      else { flush(); html += fieldHTML; }
    });
    flush();
    $('#docForm').innerHTML = html;
  }

  function switchDocType(id) {
    if (id === state.docs.typeId) return;
    const store = DB.read('docs.byType', {});
    store[state.docs.typeId] = state.docs.values;
    DB.write('docs.byType', store);
    state.docs.typeId = id;
    state.docs.values = { ...defaultDocValues(id), ...(store[id] || {}) };
    state.docs.touched = {};
    DB.write('docs.type', id);
    DB.write('docs.current', state.docs.values);
    renderDocTypes();
    renderDocForm();
    updateDocsUI();
    $('#paperScroll').scrollTop = 0;
  }

  function docCompleteness() {
    const t = docType();
    const v = state.docs.values || {};
    const required = t.fields.filter((f) => f.required);
    const filled = required.filter((f) => String(v[f.key] || '').trim().length >= (f.type === 'textarea' ? 4 : 1));
    const missing = required.filter((f) => !filled.includes(f));
    const issues = validateDocFields(t, v, false);
    let score = Math.round((filled.length / Math.max(1, required.length)) * 100);
    if (issues.some((i) => i.level === 'err')) score = Math.max(0, score - 15);
    return { score, missing, total: required.length, filled: filled.length, issues };
  }

  function validateDocFields(t, v, includeMissing = true) {
    const issues = [];
    const get = (k) => String(v[k] || '').trim();
    const required = t.fields.filter((f) => f.required);
    const missing = required.filter((f) => !get(f.key) || (f.type === 'textarea' && get(f.key).length < 4));
    if (includeMissing && missing.length) issues.push({ level: 'warn', text: `还缺 ${missing.length} 项：${missing.slice(0, 3).map((f) => f.label).join('、')}${missing.length > 3 ? '…' : ''}` });
    if (get('a') && get('b') && get('a') === get('b')) issues.push({ level: 'err', text: '甲方与乙方信息不能完全相同' });
    const dateKey = t.fields.find((f) => f.key === 'date');
    if (dateKey && get('date') && !/^\d{4}年\d{1,2}月\d{1,2}日$/.test(get('date'))) issues.push({ level: 'warn', text: '日期建议写成「2026年11月18日」格式' });
    t.fields.forEach((f) => {
      const val = get(f.key);
      if (!val) return;
      if (/电话|联系方式/.test(f.label) && !/1[3-9]\d{9}/.test(val)) issues.push({ level: 'warn', text: `${f.label}中未识别到有效的11位手机号` });
      if (/身份证/.test(f.label) && !/\d{17}[\dXx]/.test(val)) issues.push({ level: 'warn', text: '身份证号建议核对18位格式' });
      if (f.type === 'textarea' && f.key === 'fact' && val.length > 0 && val.length < 30) issues.push({ level: 'warn', text: '事实描述偏短，建议补充时间、地点、经过和金额' });
      if (f.type === 'textarea' && f.key === 'terms' && val && !/^\s*(一|二|三|四|五|\d+)[、.．]/m.test(val)) issues.push({ level: 'warn', text: '协议内容建议逐条编号，一条只写一件事' });
    });
    const amountFields = ['claims', 'demand', 'terms', 'conclusion'];
    amountFields.forEach((k) => {
      if (get(k) && /\d{4,}/.test(get(k)) && !/元|万元|人民币/.test(get(k))) issues.push({ level: 'warn', text: '出现金额数字，建议同时写明币种「人民币」与「元」' });
    });
    if (['letter', 'complaint', 'arbitration'].includes(t.id) && get('fact') && !/(民法典|法律|条)/.test(get('fact') + get('terms') + get('demand'))) issues.push({ level: 'warn', text: '正文尚未引用法律依据，建议补充条文名称与条款' });
    if (t.id === 'mediation' && get('terms') && !/(7日|30日|日内|期限)/.test(get('terms') + get('perform'))) issues.push({ level: 'warn', text: '协议缺少明确的履行期限' });
    return issues;
  }

  function updateDocsUI() {
    const comp = docCompleteness();
    $('#docScore').textContent = String(comp.score);
    $('#docScoreRing').style.setProperty('--p', String(comp.score));
    $('#docScoreText').textContent = comp.score >= 100 ? '要素齐全，可签字用印' : comp.score >= 70 ? '主体要素已具备，仍有细节待补' : comp.score > 0 ? '继续补充关键要素' : '填写关键要素后自动校验';
    const hasTouched = Object.keys(state.docs.touched || {}).some((k) => state.docs.touched[k]);
    $('#docFieldCount').textContent = `${comp.filled} / ${comp.total}${hasTouched ? '' : ' · 示例'}`;
    const errorCount = comp.issues.filter((i) => i.level === 'err').length;
    $('#docStruct').textContent = comp.score >= 100 ? '结构 完整' : errorCount ? '结构 待修' : '结构 待补';
    $('#docLawPill').textContent = `法条 已引 ${DOC_LAW_COUNT[state.docs.typeId] || 2}`;
    $('#docTerm').textContent = comp.issues.some((i) => /术语|编号|金额/.test(i.text)) ? '术语 待规范' : '术语 规范';
    renderDocValidate(comp);
    renderDocPreview();
  }

  function renderDocValidate(comp) {
    const bar = $('#docValidate');
    if (!comp.filled) {
      bar.innerHTML = `<span class="ok">${icon('check')}尚未开始填写</span><span>填写后自动校验主体、金额、期限与法条引用</span>`;
      return;
    }
    const issues = comp.issues.slice(0, 2).map((i) => ({ level: i.level, text: i.text, icon: i.level === 'err' ? 'close' : 'alert' }));
    if (comp.missing.length) issues.unshift({ level: 'warn', text: `还缺 ${comp.missing.length} 项：${comp.missing.slice(0, 3).map((f) => f.label).join('、')}`, icon: 'alert' });
    if (!issues.length) {
      bar.innerHTML = `<span class="ok">${icon('check')}要素校验通过</span><span>${comp.filled}/${comp.total} 项必填 · 可导出或打印</span>`;
      return;
    }
    bar.innerHTML = issues.slice(0, 3).map((i) => `<span class="${i.level}">${icon(i.icon)}${esc(i.text)}</span>`).join('');
  }

  function linesHTML(text, cls = 'noindent') {
    return String(text || '').split(/\n+/).filter((l) => l.trim()).map((l) => `<p class="${cls}">${esc(l)}</p>`).join('');
  }

  function paperHead(t, v, noKey = 'no') {
    const no = v[noKey] ? `<div class="paper-no">${esc(v[noKey])}</div>` : '';
    return `<div class="paper-kicker">LAW TRACE · ${esc(LT.community.name)}基层法律服务工作站</div>
      <h2>${esc(t.name)}</h2>
      <div class="paper-sub">${esc(DOC_SUB[t.id] || 'LEGAL DOCUMENT')}</div>
      ${no}`;
  }

  function paperFooter(t) {
    return `<div class="paper-foot"><span>LAW TRACE 法痕律迹 · ${esc(LT.community.name)}</span><span>${esc(t.code)} · 第 1 页 / 共 1 页</span></div>`;
  }

  function legalArticleText(law, arabic) {
    const rec = window.LT_LEGAL?.articles?.[`${law}|${arabic}`];
    if (!rec) return '';
    return `《${law}》${rec.article}：${rec.text}`;
  }

  function legalNote(t) {
    const map = {
      mediation: legalArticleText('人民调解法', 31) || '《人民调解法》第三十一条：经人民调解委员会调解达成的调解协议，具有法律约束力，当事人应当按照约定履行。',
      letter: '《民法典》及《律师法》相关规定。本函不构成对任何事实的最终认定。',
      complaint: legalArticleText('民事诉讼法', 123) || '《民事诉讼法》第一百二十三条：起诉应当向人民法院递交起诉状，并按照被告人数提出副本。',
      arbitration: legalArticleText('劳动争议调解仲裁法', 27) || '《劳动争议调解仲裁法》第二十七条：劳动争议申请仲裁的时效期间为一年。',
      opinion: '本意见仅基于委托人提供的事实与材料出具，不构成对第三方或诉讼结果的承诺。',
      enforce: legalArticleText('民事诉讼法', 247) || '《民事诉讼法》第二百四十七条：发生法律效力的民事判决、裁定，当事人必须履行。'
    };
    return `<div class="paper-legal">${esc(map[t.id] || '')}${['mediation','complaint','arbitration','enforce'].includes(t.id) ? `<span class="paper-law-source">来源：国家法律法规数据库</span>` : ''}</div>`;
  }

  function signatures(columns, extra = '') {
    return `<div class="paper-sign">${columns.map((c) => `<div class="sign-col">${c.map((l) => `<div>${l}</div>`).join('')}</div>`).join('')}</div>${extra}`;
  }

  function seal(text, sub = '专用章') {
    return `<span class="seal">${esc(text)}<br>${esc(sub)}</span>`;
  }

  function renderDocPreview() {
    const t = docType();
    const v = state.docs.values;
    const paper = $('#docPaper');
    paper.innerHTML = docHTML(t, v);
    const scroll = $('#paperScroll');
    if (scroll) scroll.scrollTop = 0;
  }

  function docHTML(t, v) {
    const g = (k) => String(v[k] || '').trim();
    const val = (k) => g(k) ? esc(g(k)) : blank;
    const partyA = val('a');
    const partyB = val('b');
    if (t.id === 'mediation') {
      return `${paperHead(t, v)}
        <div class="paper-party"><b>甲方（申请人）：</b>${partyA}</div>
        <div class="paper-party"><b>乙方（被申请人）：</b>${partyB}</div>
        <div class="paper-party"><b>纠纷类型：</b>${val('type')}</div>
        <h3><span class="num">一</span>纠纷简要情况</h3>
        ${g('fact') ? `<p>${esc(g('fact'))}</p>` : `<p>${blank}</p>`}
        <h3><span class="num">二</span>协议内容</h3>
        ${g('terms') ? linesHTML(g('terms')) : `<p>${blank}</p>`}
        <h3><span class="num">三</span>履行方式与期限</h3>
        ${g('perform') ? `<p>${esc(g('perform'))}</p>` : `<p>${blank}</p>`}
        <p style="margin-top:14px">本协议经人民调解委员会调解，双方自愿达成，具有民事合同性质。双方应当按照约定履行；一方不履行的，另一方可以依法向人民法院申请司法确认或提起诉讼。</p>
        ${legalNote(t)}
        ${signatures([
          [`甲方（签字）：<span class="sign-line"></span>`, `日期：${esc(g('date') || '＿＿＿＿年＿＿月＿＿日')}`],
          [`乙方（签字）：<span class="sign-line"></span>`, `日期：${esc(g('date') || '＿＿＿＿年＿＿月＿＿日')}`],
          [`调解员：${esc(g('mediator') || '＿＿＿＿')}`, `调解组织：${esc(g('org') || '＿＿＿＿')}${seal('人民调解')}`]
        ])}
        ${paperFooter(t)}`;
    }
    if (t.id === 'letter') {
      return `${paperHead(t, v)}
        <p class="noindent"><b>致：</b>${val('to')}</p>
        <p class="noindent" style="margin-top:4px"><b>委托人：</b>${val('client')}</p>
        <p class="noindent" style="margin-top:12px">本所接受委托人委托，就${g('matter') ? esc(g('matter')) : blank}事宜，现致函如下：</p>
        <h3><span class="num">一</span>事实与理由</h3>
        ${g('fact') ? `<p>${esc(g('fact'))}</p>` : `<p>${blank}</p>`}
        <h3><span class="num">二</span>函告事项</h3>
        ${g('demand') ? linesHTML(g('demand')) : `<p>${blank}</p>`}
        <h3><span class="num">三</span>履行期限与法律后果</h3>
        <p>请于${g('deadline') ? esc(g('deadline')) : blank}内予以书面回复并履行上述事项。逾期未履行的，委托人将依法采取包括但不限于提起诉讼、申请财产保全等措施，由此产生的诉讼费、保全费、律师费等合理费用将由责任方承担。</p>
        ${legalNote(t)}
        ${signatures([
          [`发函单位：${esc(g('org') || '＿＿＿＿')}`, `承办人：${esc(g('signer') || '＿＿＿＿')}`, `日期：${esc(g('date') || '＿＿＿＿年＿＿月＿＿日')}${seal('律所', '印章')}`]
        ])}
        ${paperFooter(t)}`;
    }
    if (t.id === 'complaint') {
      return `${paperHead(t, v)}
        <p class="noindent"><b>原告：</b>${partyA}</p>
        <p class="noindent"><b>被告：</b>${partyB}</p>
        <h3><span class="num">一</span>诉讼请求</h3>
        ${g('claims') ? linesHTML(g('claims')) : `<p>${blank}</p>`}
        <h3><span class="num">二</span>事实与理由</h3>
        ${g('fact') ? `<p>${esc(g('fact'))}</p>` : `<p>${blank}</p>`}
        <h3><span class="num">三</span>证据清单</h3>
        ${g('evidence') ? linesHTML(g('evidence')) : `<p>${blank}</p>`}
        <p class="noindent" style="margin-top:22px">此致</p>
        <p class="noindent"><b>${esc(g('court') || '＿＿＿＿人民法院')}</b></p>
        ${legalNote(t)}
        ${signatures([
          [`具状人（签字 / 盖章）：<span class="sign-line"></span>`, `日期：${esc(g('date') || '＿＿＿＿年＿＿月＿＿日')}`]
        ])}
        ${paperFooter(t)}`;
    }
    if (t.id === 'arbitration') {
      return `${paperHead(t, v)}
        <p class="noindent"><b>申请人：</b>${partyA}</p>
        <p class="noindent"><b>被申请人：</b>${partyB}</p>
        <h3><span class="num">一</span>仲裁请求</h3>
        ${g('claims') ? linesHTML(g('claims')) : `<p>${blank}</p>`}
        <h3><span class="num">二</span>事实与理由</h3>
        ${g('fact') ? `<p>${esc(g('fact'))}</p>` : `<p>${blank}</p>`}
        <h3><span class="num">三</span>证据清单</h3>
        ${g('evidence') ? linesHTML(g('evidence')) : `<p>${blank}</p>`}
        <p class="noindent" style="margin-top:22px">此致</p>
        <p class="noindent"><b>${esc(g('court') || '＿＿＿＿劳动人事争议仲裁委员会')}</b></p>
        ${legalNote(t)}
        ${signatures([
          [`申请人（签字）：<span class="sign-line"></span>`, `日期：${esc(g('date') || '＿＿＿＿年＿＿月＿＿日')}`]
        ])}
        ${paperFooter(t)}`;
    }
    if (t.id === 'opinion') {
      return `${paperHead(t, v)}
        <p class="noindent"><b>委托人：</b>${val('client')}</p>
        <p class="noindent"><b>事项：</b>${val('subject')}</p>
        <h3><span class="num">一</span>事实摘要</h3>
        ${g('fact') ? `<p>${esc(g('fact'))}</p>` : `<p>${blank}</p>`}
        <h3><span class="num">二</span>法律分析</h3>
        ${g('analysis') ? `<p>${esc(g('analysis'))}</p>` : `<p>${blank}</p>`}
        <h3><span class="num">三</span>结论与建议</h3>
        ${g('conclusion') ? `<p>${esc(g('conclusion'))}</p>` : `<p>${blank}</p>`}
        <p style="margin-top:14px">以上意见，供委托人决策参考。</p>
        ${legalNote(t)}
        ${signatures([
          [`出具单位：${esc(g('org') || '＿＿＿＿')}${seal('法律服务')}`, `出具人：${esc(g('signer') || '＿＿＿＿')}`, `日期：${esc(g('date') || '＿＿＿＿年＿＿月＿＿日')}`]
        ])}
        ${paperFooter(t)}`;
    }
    return `${paperHead(t, v)}
      <p class="noindent"><b>申请执行人：</b>${partyA}</p>
      <p class="noindent"><b>被执行人：</b>${partyB}</p>
      <h3><span class="num">一</span>执行依据</h3>
      ${g('basis') ? `<p>${esc(g('basis'))}</p>` : `<p>${blank}</p>`}
      <h3><span class="num">二</span>执行请求</h3>
      ${g('claims') ? linesHTML(g('claims')) : `<p>${blank}</p>`}
      <h3><span class="num">三</span>事实与理由</h3>
      ${g('fact') ? `<p>${esc(g('fact'))}</p>` : `<p>${blank}</p>`}
      <p class="noindent" style="margin-top:22px">此致</p>
      <p class="noindent"><b>${esc(g('court') || '＿＿＿＿人民法院')}</b></p>
      ${legalNote(t)}
      ${signatures([
        [`申请执行人（签字 / 盖章）：<span class="sign-line"></span>`, `日期：${esc(g('date') || '＿＿＿＿年＿＿月＿＿日')}`]
      ])}
      ${paperFooter(t)}`;
  }

  function scheduleDocSave() {
    clearTimeout(state.docs.saveTimer);
    state.docs.saveTimer = setTimeout(() => {
      DB.write('docs.current', state.docs.values);
      DB.write('docs.type', state.docs.typeId);
    }, 350);
  }

  function loadDocSample() {
    const t = docType();
    state.docs.values = { ...t.sample };
    state.docs.touched = Object.fromEntries(Object.keys(t.sample).map((k) => [k, true]));
    renderDocForm();
    updateDocsUI();
    toast('已载入示例要素', 'ok');
  }

  function clearDoc() {
    state.docs.values = defaultDocValues(state.docs.typeId);
    state.docs.touched = {};
    renderDocForm();
    updateDocsUI();
    DB.write('docs.current', state.docs.values);
    toast('已清空当前文书');
  }

  function generateDoc() {
    const t = docType();
    t.fields.forEach((f) => { state.docs.touched[f.key] = true; });
    renderDocForm();
    updateDocsUI();
    const comp = docCompleteness();
    if (comp.score >= 100 && !comp.issues.some((i) => i.level === 'err')) {
      toast('文书要素齐全，可复制、下载或打印', 'ok');
      $('#paperScroll').scrollTop = 0;
    } else {
      const first = comp.missing[0];
      toast(`还缺 ${comp.missing.length} 项要素，请继续补充`, 'warn');
      if (first) {
        const el = $(`[data-doc-key="${first.key}"]`);
        if (el) { el.focus(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      }
    }
  }

  function docPlainText() {
    return $('#docPaper').innerText.replace(/\n{3,}/g, '\n\n').trim();
  }

  function copyDoc() {
    copyText(docPlainText()).then(() => toast('文书全文已复制', 'ok'));
  }

  function downloadDoc() {
    const t = docType();
    const styles = `<style>
      body{font-family:"SimSun","Songti SC",serif;font-size:14px;line-height:2;color:#222;margin:0}
      .doc-paper{padding:0;width:auto;min-height:0;box-shadow:none;background:#fff}
      .paper-kicker{text-align:center;font-family:"Microsoft YaHei",sans-serif;font-size:9pt;letter-spacing:3px;color:#a08a62;margin-bottom:8px}
      h2{text-align:center;font-size:24pt;letter-spacing:6px;margin:0 0 6px}
      .paper-sub{text-align:center;font-size:8pt;letter-spacing:1px;color:#9a8a6c;margin-bottom:20px}
      .paper-no{text-align:right;font-size:10pt;margin-bottom:16px}
      .paper-party{font-size:12pt;line-height:2;margin-bottom:4px}
      h3{font-size:12pt;margin:16px 0 6px}
      p{font-size:12pt;line-height:2;text-align:justify;text-indent:2em;margin:0 0 2px}
      p.noindent{text-indent:0}
      .paper-list p{text-indent:0}
      .paper-sign{display:flex;gap:30px;margin-top:40px}
      .sign-col{flex:1;font-size:11pt;line-height:2.3}
      .sign-line{display:inline-block;width:100px;border-bottom:1px solid #555}
      .paper-date{text-align:right;margin-top:30px}
      .paper-foot{display:none}
      .seal{display:inline-grid;place-items:center;width:60px;height:60px;border:2px solid #b33a32;border-radius:50%;color:#b33a32;font-size:8pt;transform:rotate(-12deg);margin-left:8px}
      .doc-blank{color:#999}
      .paper-legal{font-size:9pt;color:#777;border-top:1px dashed #ccc;padding-top:6px;margin-top:10px;text-indent:0}
      @page{size:A4;margin:22mm 18mm}
    </style>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(t.name)}</title>${styles}</head><body><div class="doc-paper">${$('#docPaper').innerHTML}</div></body></html>`;
    download(`${t.name}-${fmtDate().replace(/[年月]/g, '-').replace('日', '')}.doc`, html, 'application/msword;charset=utf-8');
    toast('已下载 .doc 文件', 'ok');
  }

  function printDoc() {
    const t = docType();
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) { toast('浏览器阻止了打印窗口，请允许弹窗后重试', 'warn'); return; }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(t.name)}</title>
      <style>
        body{font-family:"SimSun","Songti SC",serif;font-size:14px;line-height:2;color:#222;margin:0;padding:0}
        .paper-kicker{text-align:center;font-family:"Microsoft YaHei",sans-serif;font-size:9pt;letter-spacing:3px;color:#a08a62;margin-bottom:8px}
        h2{text-align:center;font-size:24pt;letter-spacing:6px;margin:0 0 6px}
        .paper-sub{text-align:center;font-size:8pt;letter-spacing:1px;color:#9a8a6c;margin-bottom:20px}
        .paper-no{text-align:right;font-size:10pt;margin-bottom:16px}
        .paper-party{font-size:12pt;line-height:2;margin-bottom:4px}
        h3{font-size:12pt;margin:16px 0 6px}
        p{font-size:12pt;line-height:2;text-align:justify;text-indent:2em;margin:0 0 2px}
        p.noindent{text-indent:0}
        .paper-sign{display:flex;gap:30px;margin-top:40px}
        .sign-col{flex:1;font-size:11pt;line-height:2.3}
        .sign-line{display:inline-block;width:100px;border-bottom:1px solid #555}
        .paper-foot{display:none}
        .seal{display:inline-grid;place-items:center;width:60px;height:60px;border:2px solid #b33a32;border-radius:50%;color:#b33a32;font-size:8pt;transform:rotate(-12deg);margin-left:8px}
        .doc-blank{color:#999}
        .paper-legal{font-size:9pt;color:#777;border-top:1px dashed #ccc;padding-top:6px;margin-top:10px;text-indent:0}
        @page{size:A4;margin:22mm 18mm}
      </style></head><body><div class="doc-paper">${$('#docPaper').innerHTML}</div>
      <script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script></body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
    toast('已打开打印窗口，可选择「另存为 PDF」', 'ok');
  }

  function saveDocDraft() {
    const t = docType();
    const entry = {
      id: uid('draft'), typeId: t.id, typeName: t.name,
      values: { ...state.docs.values }, score: docCompleteness().score, savedAt: Date.now()
    };
    state.docs.drafts.unshift(entry);
    state.docs.drafts = state.docs.drafts.slice(0, 12);
    DB.write('docs.drafts', state.docs.drafts);
    $('#docDraftCount').textContent = String(state.docs.drafts.length);
    addEvent('docs', `保存文书草稿 · ${t.name}`, `要素完整度 ${entry.score}%`, 'docs');
    toast('草稿已保存到本机', 'ok');
  }

  function openDrafts() {
    const drafts = state.docs.drafts;
    openModal(`
      <div class="modal-head"><div><div class="modal-kicker">Local drafts</div><h3>文书草稿</h3><p>仅保存在本机浏览器，最多保留 12 份</p></div><button class="icon-btn" data-close-modal>${icon('close')}</button></div>
      <div class="modal-body">
        ${drafts.length ? `<div class="step-list">${drafts.map((d, i) => `<div class="step-row" style="align-items:center"><b style="background:var(--gold-soft);color:var(--gold)">${String(i + 1).padStart(2, '0')}</b><div style="flex:1"><b>${esc(d.typeName)} · ${d.score}%</b><span>${fmtStamp(new Date(d.savedAt))}</span></div><button class="btn btn-ghost btn-sm" data-load-draft="${d.id}">打开</button><button class="icon-btn" data-del-draft="${d.id}" title="删除">${icon('trash')}</button></div>`).join('')}</div>` : '<p class="muted-line">还没有保存的草稿。点击「保存草稿」即可留档。</p>'}
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" data-close-modal>关闭</button></div>`);
    $$('[data-load-draft]').forEach((b) => b.addEventListener('click', () => {
      const d = state.docs.drafts.find((x) => x.id === b.dataset.loadDraft);
      if (!d) return;
      state.docs.typeId = d.typeId;
      state.docs.values = { ...defaultDocValues(d.typeId), ...d.values };
      state.docs.touched = {};
      DB.write('docs.type', d.typeId);
      DB.write('docs.current', state.docs.values);
      closeModal();
      renderDocTypes();
      renderDocForm();
      updateDocsUI();
      toast('草稿已打开', 'ok');
    }));
    $$('[data-del-draft]').forEach((b) => b.addEventListener('click', () => {
      state.docs.drafts = state.docs.drafts.filter((x) => x.id !== b.dataset.delDraft);
      DB.write('docs.drafts', state.docs.drafts);
      closeModal();
      openDrafts();
      toast('草稿已删除');
    }));
  }

  function openClauses() {
    const groups = [...new Set(LT.clauses.map((c) => c.group))];
    openModal(`
      <div class="modal-head"><div><div class="modal-kicker">Clause library</div><h3>常用条款库</h3><p>点击条款，追加到「协议内容」</p></div><button class="icon-btn" data-close-modal>${icon('close')}</button></div>
      <div class="modal-body">
        ${groups.map((g) => `<div class="rd-block"><h4>${icon('book')}${esc(g)}</h4><div class="step-list">${LT.clauses.filter((c) => c.group === g).map((c) => `<button class="btn btn-ghost btn-sm" style="justify-content:flex-start;text-align:left;height:auto;padding:8px 10px;white-space:normal" data-clause="${esc(c.text)}">${esc(c.text)}</button>`).join('')}</div></div>`).join('')}
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" data-close-modal>关闭</button></div>`);
    $$('[data-clause]').forEach((b) => b.addEventListener('click', () => {
      const t = docType();
      if (!t.fields.some((f) => f.key === 'terms')) { toast('当前文书没有「协议内容」字段', 'warn'); return; }
      const cur = String(state.docs.values.terms || '').trim();
      const nextNo = cur ? cur.split(/\n/).filter(Boolean).length + 1 : 1;
      state.docs.values.terms = `${cur ? `${cur}\n` : ''}${CN_NUM[nextNo - 1] || nextNo}、${b.dataset.clause}`;
      state.docs.touched.terms = true;
      closeModal();
      renderDocForm();
      updateDocsUI();
      toast('条款已追加', 'ok');
    }));
  }

  /* =====================================================
     Module 4 · Radar
     ===================================================== */
  const RADAR_ADVICE = {
    facility: [
      { t: '现场核查', d: '物业工程部 2 小时内到场，设置警戒并确认是否有人被困。' },
      { t: '专业处置', d: '电梯、燃气、外墙等联系持证维保单位，禁止物业自行冒险作业。' },
      { t: '同步报备', d: '涉及电梯困人、高空坠物的，同步报街道应急办与住建部门。' },
      { t: '群内反馈', d: '处置进展由物业在群内统一回复，避免居民猜测和次生舆情。' }
    ],
    fire: [
      { t: '立即劝阻', d: '网格员或物业上门劝阻飞线充电，当场清理楼道可燃物。' },
      { t: '拍照留证', d: '记录充电位置、楼层和车辆信息，作为后续处罚依据。' },
      { t: '依法处理', d: '拒不整改的，报消防救援机构，依据《消防法》第二十八条处理。' },
      { t: '群内警示', d: '发布消防提示，明确消防通道禁停、楼道禁充。' }
    ],
    neighbor: [
      { t: '分开倾听', d: '调解员 24 小时内分别联系双方，避免在群内公开对线。' },
      { t: '固定影响', d: '建议受影响居民连续记录时间、音量或漏水情况，保留视频。' },
      { t: '背对背调解', d: '把“停止侵害”和“赔偿”分开谈，先形成可执行的时段 / 修复约定。' },
      { t: '回访', d: '一周内回访，确认约定是否执行；反复的升级为社区重点案件。' }
    ],
    property: [
      { t: '梳理诉求', d: '把群内诉求归并为服务、收费、公共收益三类，形成清单。' },
      { t: '三方联席', d: '组织物业、业委会筹备组、居民代表召开联席会，限期书面答复。' },
      { t: '核查账目', d: '要求物业公示公共收益与维修资金使用明细，必要时报住建部门。' },
      { t: '防止升级', d: '关注“联合维权”“拉横幅”等表述，提前介入，引导依法表达。' }
    ],
    fraud: [
      { t: '群内止付提醒', d: '立即发布反诈提示并 @全体，要求勿点链接、勿转账、勿给验证码。' },
      { t: '联系可能受害人', d: '私聊已点击或已转账居民，引导拨打 110 / 96110 并联系银行止付。' },
      { t: '固定证据', d: '保存链接、二维码、对方账号和聊天记录，交给社区民警。' },
      { t: '二次防骗', d: '提醒居民不要相信“帮忙追款”“黑客追回”，避免二次被骗。' }
    ],
    public: [
      { t: '现场稳控', d: '网格员与社区民警到场，分离冲突双方，避免肢体冲突。' },
      { t: '固定证据', d: '调取监控、记录时间地点与人员，保存群聊截图。' },
      { t: '依法处置', d: '高空抛物、堵门、围堵等涉嫌违法的，及时报警并移交执法部门。' },
      { t: '诉求通道', d: '为居民提供调解、信访、12345 等正规反映渠道，防止情绪外溢。' }
    ]
  };
  const RADAR_LAWS = {
    facility: ['《民法典》第一千二百五十三条 · 建筑物、构筑物脱落坠落致害责任'],
    fire: ['《消防法》第二十八条 · 不得占用、堵塞、封闭消防通道'],
    neighbor: ['《民法典》第二百八十八条 · 相邻关系处理原则', '《生态环境法典》第五百九十三条 · 公共场所噪声污染防治'],
    property: ['《民法典》第二百八十二条 · 公共收益归业主共有', '《民法典》第九百四十三条 · 物业服务事项公开义务'],
    fraud: ['《反电信网络诈骗法》第十八条 · 预警劝阻', '《刑法》第二百六十六条 · 诈骗罪'],
    public: ['《民法典》第一千二百五十四条 · 高空抛物责任']
  };
  const RADAR_SUBJECT = {
    facility: [[/电梯|困人/, '电梯困人'], [/落水管|外墙|坠|松动|摇晃/, '外墙设施松动'], [/井盖/, '井盖缺失'], [/水管|停水/, '水管爆裂']],
    fire: [[/电动车|充电|飞线|电线/, '楼道电动车充电'], [/消防通道/, '消防通道被占用'], [/燃气/, '燃气泄漏风险'], [/起火|冒烟|着火/, '火情隐患']],
    neighbor: [[/广场舞|音响/, '广场舞噪音'], [/装修|砸墙/, '装修噪音'], [/漏水/, '邻里漏水'], [/狗|遛狗/, '遛狗纠纷'], [/停车/, '停车位纠纷']],
    property: [[/公共收益|公示/, '公共收益争议'], [/业委会/, '业委会成立争议'], [/物业费/, '物业费争议']],
    fraud: [[/退款|链接/, '退款链接涉诈'], [/刷单/, '刷单返利'], [/投资|理财/, '投资理财诈骗'], [/保健品/, '保健品诈骗']],
    public: [[/高空抛物/, '高空抛物'], [/拉横幅|联合|街道反映|讨个说法/, '群体性聚集苗头'], [/堵门|围堵|打架/, '公共秩序风险']]
  };
  const DEFAULT_ASSIGNEE = { facility: '物业工程部', fire: '物业工程部', neighbor: '调解员张琳', property: '网格员小周', fraud: '社区民警', public: '社区民警' };

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i += 1) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36);
  }

  function radarSubject(cat, text) {
    const rules = RADAR_SUBJECT[cat] || [];
    for (const [re, label] of rules) if (re.test(text)) return label;
    return `${LT.radar.categories[cat].name}风险`;
  }

  function analyzeRadarMessage(msg, opts = {}) {
    const text = String(msg.text || '');
    if (!text.trim()) return null;
    if (/^(收到|已通知|已处理|已到场)/.test(text) && /物业|维保/.test(msg.name || '')) return null;
    let best = { cat: null, score: 0, hits: [] };
    LT.radar.rules.forEach((rule) => {
      const cat = rule.cat;
      let score = 0;
      const hits = [];
      Object.entries(rule.keys).forEach(([word, weight]) => {
        if (text.includes(word)) { score += weight; hits.push(word); }
      });
      if (score > best.score) best = { cat, score, hits };
    });
    if (!best.cat) return null;
    const boosts = LT.radar.boostWords.filter((w) => text.includes(w));
    const calm = LT.radar.calmWords.filter((w) => text.includes(w));
    let score = 30 + best.score + boosts.length * 9 - calm.length * 18;
    if (text.length > 80) score += 2;
    // A few contextual combinations that keyword dictionaries miss.
    if (best.cat === 'fire' && /(楼道|消防通道).*(充电|停车|堆)/.test(text)) score += 14;
    if (best.cat === 'fraud' && /(退款|团购).*(链接|银行卡|验证码)/.test(text)) score += 16;
    if (best.cat === 'facility' && /(困|卡).*(电梯|楼)/.test(text)) score += 8;
    score = clamp(Math.round(score), 5, 98);
    if (score < 52) return null;
    const level = score >= 80 ? 'high' : score >= 62 ? 'mid' : 'low';
    const title = `${radarSubject(best.cat, text)}${/(\d+栋)/.test(text) ? ` · ${text.match(/(\d+栋)/)[1]}` : ''}`;
    const id = `risk-${best.cat}-${hashString(title + (msg.name || ''))}`;
    const existing = state.radar.risks.find((r) => r.id === id);
    if (existing) {
      if (existing.status === 'closed') {
        existing.status = 'pending';
        existing.history.push({ label: '出现新的同类消息，风险重新打开', time: fmtHm() });
      }
      existing.mentions = (existing.mentions || 0) + 1;
      existing.quote = text;
      existing.time = msg.time || fmtHm();
      existing.score = Math.max(existing.score, score);
      existing.level = existing.score >= 80 ? 'high' : existing.score >= 62 ? 'mid' : 'low';
      existing.history.push({ label: `关联到新的群消息（第 ${existing.mentions + 1} 条）`, time: fmtHm() });
      return existing;
    }
    const risk = {
      id, cat: best.cat, level, score, title,
      quote: text, author: msg.name || '群成员', avatar: msg.avatar || (msg.name || '群')[0], color: msg.color || '#746f63',
      time: msg.time || fmtHm(), minsAgo: opts.minsAgo ?? 0,
      hits: best.hits, boosts, calm,
      status: 'pending', assignee: DEFAULT_ASSIGNEE[best.cat] || '网格员小周',
      mentions: 0,
      advice: RADAR_ADVICE[best.cat] || [],
      laws: RADAR_LAWS[best.cat] || [],
      summary: `${LT.radar.categories[best.cat].name}信号：命中「${best.hits.slice(0, 4).join('、')}」。${boosts.length ? `并出现紧急表述「${boosts.slice(0, 3).join('、')}」。` : ''}`,
      history: [{ label: '小律识别并生成风险事件', time: msg.time || fmtHm() }]
    };
    state.radar.risks.push(risk);
    return risk;
  }

  function seedRadar(force = false) {
    if (state.radar.risks.length && !force) return;
    if (force) {
      state.radar.risks = [];
      state.radar.messages = [];
      state.radar.riskStatuses = {};
      state.radar.selected = null;
      state.radar.filter = 'pending';
      state.radar.connected = true;
      state.radar.groupName = '幸福里花园业主群（演示）';
      state.radar.groupCount = 368;
      DB.remove('radar.statuses');
    }
    state.radar.risks = [];
    state.radar.messages = [];
    const sortedFeed = [...LT.radar.feed].sort((a, b) => b.minsAgo - a.minsAgo);
    sortedFeed.forEach((m, i) => {
      const message = {
        id: `seed-${i}`,
        name: m.name, text: m.text, avatar: m.avatar || m.name[0], color: m.color || '#746f63',
        minsAgo: m.minsAgo, time: clockForMinsAgo(m.minsAgo), isBot: false
      };
      state.radar.messages.push(message);
      if (m.riskHint) {
        const risk = analyzeRadarMessage(message, { minsAgo: m.minsAgo });
        if (risk) message.riskId = risk.id;
      }
    });
    // Default statuses create a realistic, non-empty closed loop.
    const defaults = ['pending', 'dispatched', 'pending', 'dispatched', 'pending', 'pending', 'closed'];
    state.radar.risks.forEach((r, i) => {
      r.status = defaults[i] || 'pending';
      if (r.status === 'dispatched') r.history.push({ label: `已派单至${r.assignee}`, time: r.time });
      if (r.status === 'closed') r.history.push({ label: '已闭环：物业完成维修并群内反馈', time: r.time });
    });
    applyStoredRiskStatus();
    // Add a couple of bot messages into the group stream.
    const highRisks = state.radar.risks.filter((r) => r.level === 'high').slice(0, 2);
    highRisks.forEach((r, idx) => {
      const source = state.radar.messages.find((m) => m.riskId === r.id);
      const mins = (source?.minsAgo || 10) - 0.4;
      const text = r.cat === 'facility'
        ? `@网格员小周 识别到「${r.title}」高风险 ${r.score}。已建议派单物业工程部，请确认被困人员安全，2 小时内反馈现场情况。`
        : r.cat === 'fraud'
          ? `@全体成员 检测到涉诈退款链接。请勿点击、勿填写银行卡和验证码；如已转账，立即拨打 110 或 96110，并联系银行止付。`
          : `@物业-小刘 识别到「${r.title}」风险 ${r.score}，请立即上门核查并拍照留存，处置结果在群内反馈。`;
      state.radar.messages.push({
        id: `bot-seed-${idx}`, name: '小律', text, isBot: true, riskId: r.id,
        minsAgo: mins, time: clockForMinsAgo(mins), avatar: '律', color: '#a7792d'
      });
    });
    state.radar.messages.sort((a, b) => b.minsAgo - a.minsAgo);
    updateChrome();
    saveRiskStatuses();
  }

  function applyStoredRiskStatus() {
    const stored = state.radar.riskStatuses || {};
    state.radar.risks.forEach((r) => {
      const s = stored[r.id];
      if (!s) return;
      r.status = s.status || r.status;
      r.assignee = s.assignee || r.assignee;
      r.history = Array.isArray(s.history) && s.history.length ? s.history : r.history;
      r.resolution = s.resolution || '';
    });
  }

  function saveRiskStatuses() {
    const map = {};
    state.radar.risks.forEach((r) => {
      map[r.id] = { status: r.status, assignee: r.assignee, history: r.history, resolution: r.resolution || '' };
    });
    state.radar.riskStatuses = map;
    DB.write('radar.statuses', map);
  }

  function renderRadar() {
    if (!state.radar.inited) initRadar();
    renderGroupHeader();
    renderRadarStats();
    renderGroupFeed();
    renderRiskIndex();
    renderRiskPanel();
    updateChrome();
  }

  function initRadar() {
    state.radar.inited = true;
    $('#radarSimulate').addEventListener('click', simulateRadarMessage);
    $('#radarNewGroup').addEventListener('click', openJoinGroup);
    $('#radarPaste').addEventListener('click', openPasteAnalyze);
    $('#radarReport').addEventListener('click', openRadarReport);
    $('#radarToggle').addEventListener('change', (e) => {
      state.radar.auto = e.target.checked;
      if (state.radar.auto) { startRadarTimer(); toast('自动巡群已开启，小律将持续研判新消息', 'ok'); }
      else { stopRadarTimer(); toast('已暂停自动巡群'); }
    });
    $('#groupForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#groupInput');
      sendGroupMessage(input.value);
      input.value = '';
    });
    $('#groupFeed').addEventListener('click', (e) => {
      if (e.target.closest('[data-join-group]')) { openJoinGroup(); return; }
      if (e.target.closest('[data-load-demo]')) { loadDemoRadar(); return; }
    });
    $('#riskTabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-filter]');
      if (!b) return;
      state.radar.filter = b.dataset.filter;
      state.radar.selected = null;
      $$('#riskTabs button').forEach((x) => x.classList.toggle('active', x === b));
      renderRiskPanel();
    });
    $('#riskList').addEventListener('click', (e) => {
      const item = e.target.closest('[data-risk-open]');
      if (item) focusRisk(item.dataset.riskOpen);
    });
    $('#riskDetail').addEventListener('click', (e) => {
      const back = e.target.closest('[data-risk-back]');
      if (back) { state.radar.selected = null; renderRiskPanel(); return; }
      const dispatch = e.target.closest('[data-risk-dispatch]');
      if (dispatch) { dispatchRisk(dispatch.dataset.riskDispatch); return; }
      const close = e.target.closest('[data-risk-close]');
      if (close) { openCloseRisk(close.dataset.riskClose); return; }
      const reopen = e.target.closest('[data-risk-reopen]');
      if (reopen) { reopenRisk(reopen.dataset.riskReopen); return; }
      const notice = e.target.closest('[data-risk-notice]');
      if (notice) { sendRiskNotice(notice.dataset.riskNotice); return; }
      const med = e.target.closest('[data-risk-med]');
      if (med) { riskToMediation(med.dataset.riskMed); return; }
      const del = e.target.closest('[data-risk-delete]');
      if (del) {
        state.radar.risks = state.radar.risks.filter((r) => r.id !== del.dataset.riskDelete);
        state.radar.selected = null;
        saveRiskStatuses();
        renderRadar();
        toast('已移除该风险事件');
      }
    });
  }

  function renderGroupHeader() {
    const connected = !!state.radar.connected;
    const title = $('#groupTitle');
    const meta = $('#groupMeta');
    const bot = $('#groupBotStatus');
    const toggle = $('#radarToggle');
    if (title) title.textContent = connected ? (state.radar.groupName || '业主群') : '尚未接入业主群';
    const avatar = $('#groupAvatar');
    if (avatar) avatar.textContent = connected ? (state.radar.groupName || '群').slice(0, 1) : '群';
    if (meta) meta.innerHTML = connected
      ? `<i class="pulse-dot"></i>${state.radar.groupCount ? `${state.radar.groupCount} 人 · ` : ''}小律值守中 · 只读公开消息`
      : '<i class="pulse-dot"></i>接入后开始监测公开群消息';
    if (bot) bot.innerHTML = `<svg><use href="#i-bot"/></svg>${connected ? '小律已接入' : '小律待接入'}`;
    if (toggle) {
      toggle.disabled = !connected;
      toggle.checked = connected && state.radar.auto;
    }
  }

  function renderRadarStats() {
    const c = riskCounts();
    const closedRate = state.radar.risks.length ? Math.round((c.closed / state.radar.risks.length) * 100) : 0;
    const members = state.radar.connected ? (state.radar.groupCount || 0) : 0;
    const msgs = state.radar.messages.length;
    $('#radarStats').innerHTML = `
      <div class="rstat"><span class="rstat-icon tone-jade">${icon('users')}</span><div><b>${members || '—'}</b><span>${state.radar.connected ? '群成员' : '未接入群聊'}</span></div><span class="rstat-delta">${state.radar.connected ? '<em>已接入</em>公开群' : '等待接入'}</span></div>
      <div class="rstat"><span class="rstat-icon tone-blue">${icon('chat')}</span><div><b>${msgs}</b><span>今日消息</span></div><span class="rstat-delta"><em>${msgs ? `+${msgs}` : '0'}</em>新增</span></div>
      <div class="rstat"><span class="rstat-icon tone-red">${icon('alert')}</span><div><b>${state.radar.risks.length}</b><span>风险预警</span></div><span class="rstat-delta"><em>${c.high} 高风险</em>${c.pending} 待处置</span></div>
      <div class="rstat"><span class="rstat-icon tone-gold">${icon('shield')}</span><div><b>${closedRate}%</b><span>闭环率</span></div><span class="rstat-delta">${c.closed} / ${state.radar.risks.length} 已闭环</span></div>`;
  }

  function renderGroupFeed() {
    const feed = $('#groupFeed');
    if (!feed) return;
    const items = state.radar.messages;
    if (!items.length) {
      feed.innerHTML = `<div class="group-empty-state">
        <span class="ge-mark">${icon('wechat')}</span>
        <b>${state.radar.connected ? '群聊已接入，等待消息' : '把真实生活接进来'}</b>
        <p>${state.radar.connected ? '小律会安静读取公开群消息。有人在群里发出风险信号时，右侧会生成研判与处置建议。' : '还没有接入业主群。接入后，小律只读取公开群消息，不获取私聊和成员手机号。'}</p>
        <div class="group-empty-actions">
          ${state.radar.connected ? '' : `<button class="btn btn-primary btn-sm" data-join-group>${icon('wechat')}接入新群</button>`}
          <button class="btn btn-ghost btn-sm" data-load-demo>${icon('spark')}载入演示数据</button>
        </div>
      </div>`;
      return;
    }
    let html = `<div class="g-empty" style="padding:2px 0 10px">今天 · ${esc(fmtDate())}</div>`;
    items.forEach((m) => {
      const risk = m.riskId ? state.radar.risks.find((r) => r.id === m.riskId) : null;
      const isSelf = !!m.isSelf;
      const cls = m.isBot ? 'bot' : isSelf ? 'self' : '';
      const note = risk ? `<div class="risk-note ${risk.level}" data-risk-id="${esc(risk.id)}">${icon(risk.level === 'high' ? 'alert' : 'radar')}<span>${risk.level === 'high' ? '高风险' : risk.level === 'mid' ? '中风险' : '低风险'} · ${esc(risk.title)}</span><b>${risk.score}</b></div>` : '';
      html += `<div class="g-msg ${cls}" ${m.isBot ? '' : ''}>
        <span class="g-avatar" style="background:${esc(m.color || '#746f63')}">${esc(m.avatar || (m.name || '群')[0])}</span>
        <div class="g-body">
          <div class="g-meta"><b>${esc(m.name)}</b><span>${esc(m.time)}</span>${m.isBot ? '<span style="color:var(--gold)">AI群助手</span>' : ''}</div>
          <div class="g-bubble">${m.isBot ? `<b>小律：</b>` : ''}${esc(m.text)}</div>
          ${note}
        </div>
      </div>`;
    });
    feed.innerHTML = html;
    feed.scrollTop = feed.scrollHeight;
  }

  function renderRiskIndex() {
    const active = activeRisks();
    const c = riskCounts();
    const avg = active.length ? active.reduce((s, r) => s + r.score, 0) / active.length : 0;
    const index = active.length ? clamp(Math.round(avg * 0.42 + c.pending * 2 + c.dispatched * 1.2), 0, 100) : 0;
    const label = index >= 75 ? '高风险' : index >= 50 ? '中等风险' : index >= 30 ? '关注' : '平稳';
    $('#riskIndex').textContent = String(index);
    $('#riskIndex').nextElementSibling.textContent = label;
    const arc = $('#riskArc');
    if (arc) arc.setAttribute('stroke-dashoffset', String(182 * (1 - index / 100)));
    $('#riskCounts').innerHTML = `
      <div class="rc high"><b>${c.high}</b><span>高风险</span></div>
      <div class="rc mid"><b>${c.mid}</b><span>中风险</span></div>
      <div class="rc"><b>${c.pending}</b><span>待处置</span></div>
      <div class="rc"><b>${c.closed}</b><span>已闭环</span></div>`;
    const cats = Object.entries(LT.radar.categories).map(([key, cat]) => {
      const count = active.filter((r) => r.cat === key).length;
      return { key, cat, count };
    }).sort((a, b) => b.count - a.count);
    const max = Math.max(1, ...cats.map((x) => x.count));
    $('#riskCats').innerHTML = cats.map(({ key, cat, count }) => `
      <div class="rcat"><i style="background:${cat.color}"></i><span>${esc(cat.name)}</span><div class="rcat-bar"><b style="width:${(count / max) * 100}%;background:${cat.color}"></b></div><em>${count}</em></div>`).join('');
  }

  function riskMatchesFilter(r) {
    if (state.radar.filter === 'all') return true;
    return r.status === state.radar.filter;
  }

  function renderRiskPanel() {
    const list = $('#riskList');
    const detail = $('#riskDetail');
    if (!list || !detail) return;
    const c = riskCounts();
    const visibleCount = state.radar.risks.filter(riskMatchesFilter).length;
    $('#riskSummary').textContent = `${visibleCount} 条 · ${c.pending} 条待处置`;
    $$('#riskTabs button').forEach((x) => x.classList.toggle('active', x.dataset.filter === state.radar.filter));
    if (state.radar.selected) {
      const risk = state.radar.risks.find((r) => r.id === state.radar.selected);
      if (risk) {
        list.hidden = true;
        detail.hidden = false;
        renderRiskDetail(risk);
        return;
      }
    }
    list.hidden = false;
    detail.hidden = true;
    const filtered = state.radar.risks.filter(riskMatchesFilter).sort((a, b) => {
      const order = { pending: 0, dispatched: 1, closed: 2 };
      return (order[a.status] - order[b.status]) || (b.score - a.score);
    });
    if (!filtered.length) {
      list.innerHTML = state.radar.risks.length
        ? '<div class="risk-empty">当前分组没有风险事件</div>'
        : '<div class="risk-empty">还没有风险事件。<br>接入业主群或载入演示数据后，小律会开始研判。</div>';
      return;
    }
    list.innerHTML = filtered.map((r) => `
      <button class="risk-item ${state.radar.selected === r.id ? 'active' : ''}" data-risk-open="${esc(r.id)}">
        <div class="risk-item-head">
          <span class="risk-level ${r.level}">${r.level === 'high' ? '高' : r.level === 'mid' ? '中' : '低'}</span>
          <span class="risk-cat">${esc(LT.radar.categories[r.cat].name)}</span>
          <em>${esc(r.time)}</em>
        </div>
        <b>${esc(r.title)}</b>
        <p>${esc(r.quote)}</p>
        <div class="ri-foot"><span>${esc(r.author)}</span>${r.mentions ? `<span>关联 ${r.mentions + 1} 条</span>` : ''}<span class="ri-status">${r.status === 'pending' ? '待处置' : r.status === 'dispatched' ? '处置中' : '已闭环'}</span></div>
      </button>`).join('');
  }

  function renderRiskDetail(r) {
    const box = $('#riskDetail');
    const statusText = r.status === 'pending' ? '待处置' : r.status === 'dispatched' ? '处置中' : '已闭环';
    box.innerHTML = `
      <button class="rd-back" data-risk-back>${icon('chevron')}返回风险列表</button>
      <div class="risk-detail-head"><h3>${esc(r.title)}</h3><span class="risk-level ${r.level}">${r.level === 'high' ? '高风险' : r.level === 'mid' ? '中风险' : '低风险'} ${r.score}</span><button class="icon-btn" data-risk-back>${icon('close')}</button></div>
      <div class="rd-meta"><span>${esc(LT.radar.categories[r.cat].name)}</span><span>${esc(r.author)}</span><span>${esc(r.time)}</span><span>${statusText}</span>${r.mentions ? `<span>关联 ${r.mentions + 1} 条</span>` : ''}</div>
      <div class="rd-quote"><b>群消息原文</b>“${esc(r.quote)}”</div>
      <div class="rd-block"><h4>${icon('spark')}小律研判</h4><p>${esc(r.summary)}</p><div class="rd-tags">${r.hits.slice(0, 5).map((h) => `<span>命中 · ${esc(h)}</span>`).join('')}${r.boosts.map((b) => `<span>紧急 · ${esc(b)}</span>`).join('')}${r.calm.map((c) => `<span class="calm">缓和 · ${esc(c)}</span>`).join('')}</div></div>
      <div class="rd-block"><h4>${icon('scale')}法律依据</h4><ul>${r.laws.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>
      <div class="rd-block"><h4>${icon('check')}处置建议</h4><ul>${r.advice.map((a) => `<li><b>${esc(a.t)}：</b>${esc(a.d)}</li>`).join('')}</ul></div>
      ${r.status === 'pending' ? `<div class="rd-assign"><select id="riskAssignee">${LT.radar.assignees.map((a) => `<option ${a === r.assignee ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></div>` : ''}
      <div class="rd-actions">
        ${r.status === 'pending' ? `<button class="btn btn-primary btn-sm" data-risk-dispatch="${esc(r.id)}">${icon('send')}派单处置</button>` : ''}
        ${r.status === 'dispatched' ? `<button class="btn btn-primary btn-sm" data-risk-close="${esc(r.id)}">${icon('check')}标记闭环</button>` : ''}
        ${r.status === 'closed' ? `<button class="btn btn-ghost btn-sm" data-risk-reopen="${esc(r.id)}">${icon('refresh')}重新打开</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-risk-notice="${esc(r.id)}">${icon('wechat')}群内提示</button>
        ${['neighbor', 'property'].includes(r.cat) ? `<button class="btn btn-ghost btn-sm" data-risk-med="${esc(r.id)}">${icon('scale')}转调解</button>` : ''}
      </div>
      <div class="rd-block" style="margin-top:10px"><h4>${icon('clock')}处置记录</h4><div class="rd-timeline">${r.history.map((h, i) => `<div class="rd-step ${i < r.history.length - 1 || r.status === 'closed' ? 'done' : ''}"><i>${icon('check')}</i><div><b>${esc(h.label)}</b><span>${esc(h.time)}</span></div></div>`).join('')}</div></div>`;
    box.querySelectorAll('[data-risk-back]').forEach((b) => b.addEventListener('click', () => { state.radar.selected = null; renderRiskPanel(); }));
  }

  function focusRisk(id) {
    if (state.route !== 'radar') {
      go('radar');
      setTimeout(() => focusRisk(id), 160);
      return;
    }
    state.radar.selected = id;
    renderRiskPanel();
  }

  function dispatchRisk(id) {
    const risk = state.radar.risks.find((r) => r.id === id);
    if (!risk) return;
    const sel = $('#riskAssignee');
    if (sel) risk.assignee = sel.value;
    risk.status = 'dispatched';
    risk.history.push({ label: `已派单至${risk.assignee}`, time: fmtHm() });
    saveRiskStatuses();
    addEvent('radar', `${risk.title} 已派单`, `已派单至${risk.assignee}，要求 2 小时内反馈处置结果。`, 'radar');
    state.radar.selected = risk.id;
    renderRadar();
    toast(`已派单至${risk.assignee}`, 'ok');
  }

  function openCloseRisk(id) {
    const risk = state.radar.risks.find((r) => r.id === id);
    if (!risk) return;
    openModal(`
      <div class="modal-head"><div><div class="modal-kicker">Close the loop</div><h3>标记闭环</h3><p>${esc(risk.title)}</p></div><button class="icon-btn" data-close-modal>${icon('close')}</button></div>
      <div class="modal-body">
        <label class="field"><span>处置结果 <em>*</em></span><textarea id="closeNote" rows="4" placeholder="如：物业已完成电梯主板更换，困人故障排除；群内已反馈，居民确认。"></textarea></label>
        <div class="form-grid">
          <label class="field"><span>处置人</span><input id="closeBy" value="${esc(risk.assignee)}" /></label>
          <label class="field"><span>回访日期</span><input id="closeDate" value="${esc(fmtDate())}" /></label>
        </div>
        <p class="muted-line">闭环后会计入社区法治体征与周报，仍可在「已闭环」中重新打开。</p>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" data-close-modal>取消</button><button class="btn btn-primary" id="confirmClose">确认闭环</button></div>`);
    $('#confirmClose').addEventListener('click', () => {
      const note = $('#closeNote').value.trim();
      if (!note) { toast('请填写处置结果', 'warn'); $('#closeNote').focus(); return; }
      risk.status = 'closed';
      risk.resolution = note;
      risk.assignee = $('#closeBy').value.trim() || risk.assignee;
      risk.history.push({ label: `已闭环：${note}`, time: fmtHm() });
      saveRiskStatuses();
      addEvent('radar', `${risk.title} 已闭环`, note, 'radar');
      closeModal();
      state.radar.selected = risk.id;
      renderRadar();
      toast('风险已闭环', 'ok');
    });
  }

  function reopenRisk(id) {
    const risk = state.radar.risks.find((r) => r.id === id);
    if (!risk) return;
    risk.status = 'pending';
    risk.history.push({ label: '重新打开，转回待处置', time: fmtHm() });
    saveRiskStatuses();
    state.radar.selected = risk.id;
    renderRadar();
    toast('已重新打开');
  }

  function sendRiskNotice(id) {
    const risk = state.radar.risks.find((r) => r.id === id);
    if (!risk) return;
    const template = LT.radar.templates[risk.cat] || LT.radar.categories[risk.cat].advice;
    state.radar.messages.push({
      id: uid('bot'), name: '小律', text: template, isBot: true, time: fmtHm(), minsAgo: 0, avatar: '律', color: '#a7792d'
    });
    renderGroupFeed();
    renderRadarStats();
    copyText(template);
    toast('提示已发送到群并复制', 'ok');
    risk.history.push({ label: '已在群内发布处置提示', time: fmtHm() });
    saveRiskStatuses();
  }

  function riskToMediation(id) {
    const risk = state.radar.risks.find((r) => r.id === id);
    if (!risk) return;
    const caseId = risk.cat === 'property' ? 'property' : 'noise';
    go('mediate');
    setTimeout(() => {
      if (!state.med.inited) initMediation();
      selectMedCase(caseId, {
        brief: `风险雷达转入：${risk.quote}（${risk.author}，${risk.time}）`,
        aName: risk.author || '申请人',
        bName: '对方当事人'
      });
      updateMedMatch();
      toast('已转入调解，可编辑案情后开始推演', 'ok');
    }, 100);
  }

  function startRadarTimer() {
    stopRadarTimer();
    state.radar.auto = true;
    const toggle = $('#radarToggle');
    if (toggle) toggle.checked = true;
    state.radar.timer = setInterval(() => {
      if (state.route !== 'radar') { stopRadarTimer(); return; }
      simulateRadarMessage(true);
    }, 9000);
  }

  function stopRadarTimer() {
    if (state.radar.timer) { clearInterval(state.radar.timer); state.radar.timer = null; }
  }

  function injectMessage(msg, opts = {}) {
    if (!state.radar.connected) {
      state.radar.connected = true;
      state.radar.groupName = '业主群';
      DB.write('radar.connected', true);
      DB.write('radar.groupName', state.radar.groupName);
    }
    const message = {
      id: uid('msg'), name: msg.name, text: msg.text,
      avatar: msg.avatar || (msg.name || '群')[0], color: msg.color || '#746f63',
      time: fmtHm(), minsAgo: 0, isSelf: !!opts.self, isBot: !!msg.isBot
    };
    state.radar.messages.push(message);
    renderGroupFeed();
    let risk = null;
    if (!message.isBot) {
      risk = analyzeRadarMessage(message, { minsAgo: 0 });
      if (risk) {
        message.riskId = risk.id;
        if (opts.openDetail) state.radar.selected = risk.id;
      }
    }
    renderGroupHeader();
    renderGroupFeed();
    renderRadarStats();
    renderRiskIndex();
    renderRiskPanel();
    updateChrome();
    saveRiskStatuses();
    if (risk && risk.level === 'high' && !opts.noBot) {
      const typing = $('#groupTyping');
      if (typing) typing.hidden = false;
      setTimeout(() => {
        if (typing) typing.hidden = true;
        if (state.route !== 'radar') return;
        const text = risk.cat === 'facility'
          ? `@网格员小周 识别到「${risk.title}」高风险 ${risk.score}。建议立即联系维保并确认现场安全，2 小时内反馈。`
          : risk.cat === 'fraud'
            ? `@全体成员 检测到涉诈信息，请勿点击链接、勿转账、勿提供验证码。如已转账，立即拨打 110 或 96110。`
            : `@网格员小周 识别到「${risk.title}」风险 ${risk.score}，建议按处置清单跟进，并在群内反馈结果。`;
        state.radar.messages.push({ id: uid('bot'), name: '小律', text, isBot: true, riskId: risk.id, time: fmtHm(), minsAgo: 0, avatar: '律', color: '#a7792d' });
        renderGroupFeed();
        renderRadarStats();
      }, 1100);
    }
    return risk;
  }

  function simulateRadarMessage(silent = false) {
    const incoming = LT.radar.incoming;
    const msg = incoming[state.radar.queueIndex % incoming.length];
    state.radar.queueIndex += 1;
    const risk = injectMessage({ ...msg, avatar: msg.avatar || msg.name[0], color: msg.color || '#746f63' }, { openDetail: false });
    if (!silent) {
      if (risk) toast(`已模拟群消息，识别为「${risk.title}」`, risk.level === 'high' ? 'warn' : '');
      else toast('已模拟群消息，未识别到明显风险');
    }
    return risk;
  }

  function sendGroupMessage(text) {
    const value = String(text || '').trim();
    if (!value) return;
    if (value.length > 300) { toast('单条消息过长，请精简到 300 字以内', 'warn'); return; }
    const risk = injectMessage({ name: '网格员小周（我）', text: value, avatar: '周', color: '#a7792d' }, { self: true, openDetail: true });
    if (risk) toast(`小律研判：${LT.radar.categories[risk.cat].name} · ${risk.score} 分`, risk.level === 'high' ? 'warn' : 'ok');
    else toast('小律研判：暂未识别到需要升级的风险');
  }

  function openPasteAnalyze() {
    openModal(`
      <div class="modal-head"><div><div class="modal-kicker">Manual analysis</div><h3>粘贴一段群消息</h3><p>小律会按同一套风险模型研判，不会上传到云端</p></div><button class="icon-btn" data-close-modal>${icon('close')}</button></div>
      <div class="modal-body">
        <label class="field"><span>发言人称谓</span><input id="pasteName" placeholder="如：3栋-王阿姨" /></label>
        <label class="field"><span>消息内容 <em>*</em></span><textarea id="pasteText" rows="5" placeholder="例如：电梯又困人了，老人被困在6楼，警铃没人接。"></textarea></label>
        <p class="muted-line">仅用于本地演示与分析，不会发送到微信群。</p>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" data-close-modal>取消</button><button class="btn btn-primary" id="runPaste">开始研判</button></div>`);
    $('#runPaste').addEventListener('click', () => {
      const text = $('#pasteText').value.trim();
      const name = $('#pasteName').value.trim() || '群成员';
      if (!text) { toast('请先粘贴消息内容', 'warn'); return; }
      closeModal();
      go('radar');
      setTimeout(() => {
        const risk = injectMessage({ name, text, avatar: name[0], color: '#8b5a2b' }, { openDetail: true });
        if (risk) toast(`研判完成：${risk.title} · ${risk.score} 分`, risk.level === 'high' ? 'warn' : 'ok');
        else toast('研判完成：未识别到明显风险');
      }, 120);
    });
  }

  function qrPattern() {
    const size = 21;
    const cells = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const finder = (x < 7 && y < 7) || (x > size - 8 && y < 7) || (x < 7 && y > size - 8);
        let on = false;
        if (finder) {
          const lx = x > size - 8 ? x - (size - 7) : x;
          const ly = y > size - 8 ? y - (size - 7) : y;
          on = lx === 0 || lx === 6 || ly === 0 || ly === 6 || (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4);
        } else {
          on = hashString(`${x}-${y}-lawtrace`).charCodeAt(0) % 3 === 0;
        }
        if (on) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
      }
    }
    return `<svg viewBox="0 0 21 21" width="126" height="126" style="background:#fff" aria-label="群二维码示意">${cells.join('')}</svg>`;
  }

  function openJoinGroup() {
    openModal(`
      <div class="modal-head"><div><div class="modal-kicker">Connect a group</div><h3>把小律接进业主群</h3><p>以「群助手」身份入群，只读取公开群消息</p></div><button class="icon-btn" data-close-modal>${icon('close')}</button></div>
      <div class="modal-body">
        <div style="display:flex;gap:16px;align-items:center;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--surf-2);margin-bottom:14px">
          <div style="flex:none;border:6px solid #fff;border-radius:6px;line-height:0;box-shadow:0 2px 10px rgba(0,0,0,.08)">${qrPattern()}</div>
          <div><b style="font-size:12.5px">群主扫码授权</b><p class="muted-line" style="margin-top:4px">由群主或管理员扫码，授权「小律」作为群助手入群。不会读取私聊、通讯录和手机号。</p><div class="soft-tag" style="margin-top:7px">仅公开群聊</div></div>
        </div>
        <div class="step-list">
          <div class="step-row"><b>01</b><div><b>设置监测范围</b><span>设施隐患、消防安全、邻里冲突、物业矛盾、诈骗信息、公共秩序</span></div></div>
          <div class="step-row"><b>02</b><div><b>选择推送对象</b><span>网格员、调解员、物业负责人、社区民警</span></div></div>
          <div class="step-row"><b>03</b><div><b>确认值守方式</b><span>静默监测；高风险自动在群内提示并派单</span></div></div>
        </div>
        <label class="field" style="margin-top:12px"><span>群名称</span><input id="joinGroupName" placeholder="输入真实的业主群名称" /></label>
        <div class="choice-grid">
          <label class="choice"><input type="checkbox" checked /><div><b>高风险即时提示</b><span>电梯困人、火情、诈骗</span></div></label>
          <label class="choice"><input type="checkbox" checked /><div><b>每日风险摘要</b><span>每天 18:00 推送网格员</span></div></label>
        </div>
        <p class="muted-line" style="margin-top:10px">当前为前端演示，不调用微信接口，只保存群名称与监测设置；正式接入需配置企业微信 / 社群助手。</p>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" data-close-modal>稍后再说</button><button class="btn btn-primary" id="completeJoin">保存接入设置</button></div>`);
    $('#completeJoin').addEventListener('click', () => {
      const name = $('#joinGroupName').value.trim();
      if (!name) { toast('请先填写真实的群名称', 'warn'); $('#joinGroupName').focus(); return; }
      closeModal();
      state.radar.connected = true;
      state.radar.groupName = name;
      state.radar.groupCount = 0;
      DB.write('radar.connected', true);
      DB.write('radar.groupName', name);
      addEvent('radar', `小律已接入「${name}」`, '群助手已开始静默值守，仅分析公开群消息。', 'radar');
      toast(`「${name}」接入成功，小律开始值守`, 'ok');
      state.radar.messages.push({ id: uid('sys'), name: '小律', isBot: true, text: `已接入「${name}」。我会静默关注设施、消防、邻里、物业、诈骗和公共秩序风险，只在需要时提示。`, time: fmtHm(), minsAgo: 0, avatar: '律', color: '#a7792d' });
      renderRadar();
    });
  }

  function applyDemoRadar() {
    seedRadar(true);
    state.events = (LT.activity || []).map((e) => ({ ...e, ts: Date.now() - (e.minsAgo || 0) * 60000, id: uid('ev') }));
    DB.write('events', state.events);
    if (state.route !== 'radar') go('radar');
    setTimeout(() => {
      renderRadar();
      toast('已载入演示数据（仅本次页面，不会写入真实台账）', 'ok');
    }, 60);
  }

  function loadDemoRadar() {
    if (state.radar.risks.length || state.radar.messages.length) {
      openModal(`<div class="modal-head"><div><div class="modal-kicker">Demo data</div><h3>载入演示数据？</h3><p>当前群聊与风险列表会被演示数据替换</p></div><button class="icon-btn" data-close-modal>${icon('close')}</button></div>
        <div class="modal-body"><p>演示数据用于展示小律的识别、派单与闭环流程，只存在于本次页面，不会写入真实工作台账。文书草稿和咨询记录不受影响。</p></div>
        <div class="modal-foot"><button class="btn btn-ghost" data-close-modal>取消</button><button class="btn btn-primary" id="confirmDemo">载入演示数据</button></div>`);
      $('#confirmDemo').addEventListener('click', () => { closeModal(); applyDemoRadar(); });
      return;
    }
    applyDemoRadar();
  }

  function reportMetrics() {
    const c = riskCounts();
    const total = state.radar.risks.length;
    const closedRate = total ? Math.round((c.closed / total) * 100) : 0;
    return { c, total, closedRate };
  }

  function openRadarReport() {
    const { c, total, closedRate } = reportMetrics();
    const top = [...state.radar.risks].sort((a, b) => b.score - a.score).slice(0, 5);
    const cats = Object.entries(LT.radar.categories).map(([key, cat]) => ({ cat, count: state.radar.risks.filter((r) => r.cat === key).length })).filter((x) => x.count);
    const html = `
      <div class="report-paper">
        <div class="report-head"><div><h2>社区法治风险周报</h2><p>${esc(LT.community.name)} · ${esc(fmtDate())} · 小律自动生成</p></div><div style="text-align:right;font-size:9px;color:var(--faint)">LAW TRACE<br>${esc(LT.community.mediator)}</div></div>
        <div class="report-kpis">
          <div class="report-kpi"><b>${total}</b><span>风险事件</span></div>
          <div class="report-kpi"><b>${c.pending}</b><span>待处置</span></div>
          <div class="report-kpi"><b>${c.closed}</b><span>已闭环</span></div>
          <div class="report-kpi"><b>${closedRate}%</b><span>闭环率</span></div>
        </div>
        <div class="report-section"><h3>一、本周风险概况</h3><p>本周共识别 ${total} 条风险事件，其中高风险 ${c.high} 条、中风险 ${c.mid} 条。${total === 0 ? '本周暂无风险事件，社区平稳。' : c.pending ? `目前仍有 ${c.pending} 条待处置，建议优先处理高风险事件。` : '所有风险均已进入处置流程。'}</p>
          <table class="report-table"><thead><tr><th>类型</th><th>数量</th><th>占比</th></tr></thead><tbody>${cats.length ? cats.map(({ cat, count }) => `<tr><td>${esc(cat.name)}</td><td>${count}</td><td>${Math.round((count / total) * 100)}%</td></tr>`).join('') : '<tr><td colspan="3">本周暂无风险数据</td></tr>'}</tbody></table>
        </div>
        <div class="report-section"><h3>二、重点关注事件</h3><ul>${top.length ? top.map((r) => `<li><b>${esc(r.title)}</b>（${r.level === 'high' ? '高' : r.level === 'mid' ? '中' : '低'}风险 ${r.score}，${r.status === 'pending' ? '待处置' : r.status === 'dispatched' ? '处置中' : '已闭环'}）：${esc(r.summary)}</li>`).join('') : '<li>本周暂无风险事件，社区平稳。</li>'}</ul></div>
        <div class="report-section"><h3>三、处置建议</h3><ul><li>对电梯、消防通道、飞线充电等高风险点位开展一次联合巡查，形成整改清单。</li><li>对公共收益、物业费争议，推动物业限期书面答复，必要时召开三方联席会。</li><li>对涉诈链接与“退款”话术，在群内置顶反诈提示，并同步社区民警。</li><li>对已闭环事件开展 7 日回访，避免问题反弹。</li></ul></div>
        <div class="report-section"><h3>四、下周关注</h3><p>电梯维保配件到货情况、楼道充电整改、广场舞时段约定执行情况，以及公共收益公示进度。</p></div>
        <p style="font-size:8px;color:var(--faint);border-top:1px solid var(--line);padding-top:6px">本报告由法痕律迹社区风险雷达自动生成，数据仅用于基层治理演示。</p>
      </div>`;
    openModal(`<div class="modal-head"><div><div class="modal-kicker">Weekly report</div><h3>社区法治风险周报</h3><p>自动汇总雷达数据与处置进展</p></div><button class="icon-btn" data-close-modal>${icon('close')}</button></div>
      <div class="modal-body">${html}</div>
      <div class="modal-foot"><button class="btn btn-ghost" data-close-modal>关闭</button><button class="btn btn-ghost" id="copyReport">${icon('copy')}复制</button><button class="btn btn-primary" id="printReport">${icon('print')}打印 / PDF</button></div>`, { wide: true });
    $('#copyReport').addEventListener('click', () => copyText($('.report-paper').innerText).then(() => toast('周报已复制', 'ok')));
    $('#printReport').addEventListener('click', () => printHTML($('.report-paper').outerHTML, '社区法治风险周报'));
  }

  function openDailyReport() {
    const c = riskCounts();
    const top = pendingRisks().slice(0, 4);
    const html = `
      <div class="report-paper">
        <div class="report-head"><div><h2>今日法治工作日报</h2><p>${esc(fmtDateLong())} · ${esc(LT.community.name)}</p></div><div style="text-align:right;font-size:9px;color:var(--faint)">LAW TRACE<br>${esc(LT.community.mediator)}</div></div>
        <div class="report-kpis"><div class="report-kpi"><b>${c.pending}</b><span>待处置风险</span></div><div class="report-kpi"><b>${state.adv.messages.filter((m) => m.role === 'user').length}</b><span>今日答疑</span></div><div class="report-kpi"><b>${state.docs.drafts.length}</b><span>文书草稿</span></div><div class="report-kpi"><b>${state.med.started ? (state.med.done ? '已达成' : '进行中') : '待开始'}</b><span>在办调解</span></div></div>
        <div class="report-section"><h3>一、风险处置</h3><p>今日共识别 ${state.radar.risks.length} 条风险，其中高风险 ${c.high} 条。${top.length ? `待处置事项：${top.map((r) => r.title).join('、')}。` : '暂无待处置风险。'}</p></div>
        <div class="report-section"><h3>二、调解与咨询</h3><p>${state.med.started ? `在办调解「${esc(state.med.s?.caseName || '')}」进行至第 ${state.med.s?.round || 1} 轮，当前和解概率 ${state.med.s?.prob || 0}%${state.med.done ? '，已达成协议' : ''}。` : '今日尚未开始新的调解推演。'} 私人法律顾问累计记录 ${state.adv.messages.filter((m) => m.role === 'user').length} 次咨询。</p></div>
        <div class="report-section"><h3>三、明日建议</h3><ul><li>优先处置高风险事件，压实物业与维保单位责任。</li><li>对已达成调解协议的案件，提醒当事人申请司法确认。</li><li>持续关注业主群内电梯、消防与公共收益相关表述，防止风险升级。</li></ul></div>
        <div class="report-section"><h3>四、今日法治提示</h3><p>${esc(LT.tips[now().getDate() % LT.tips.length])}</p></div>
        <p style="font-size:8px;color:var(--faint);border-top:1px solid var(--line);padding-top:6px">本日报由法痕律迹工作台自动生成。</p>
      </div>`;
    openModal(`<div class="modal-head"><div><div class="modal-kicker">Daily report</div><h3>今日法治工作日报</h3><p>${esc(fmtDateLong())}</p></div><button class="icon-btn" data-close-modal>${icon('close')}</button></div>
      <div class="modal-body">${html}</div>
      <div class="modal-foot"><button class="btn btn-ghost" data-close-modal>关闭</button><button class="btn btn-ghost" id="copyDaily">${icon('copy')}复制</button><button class="btn btn-primary" id="printDaily">${icon('print')}打印 / PDF</button></div>`, { wide: true });
    $('#copyDaily').addEventListener('click', () => copyText($('.report-paper').innerText).then(() => toast('日报已复制', 'ok')));
    $('#printDaily').addEventListener('click', () => printHTML($('.report-paper').outerHTML, '今日法治工作日报'));
  }

  function printHTML(inner, title) {
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) { toast('浏览器阻止了打印窗口，请允许弹窗后重试', 'warn'); return; }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>
        body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;color:#2a211c;margin:0;padding:28px 34px;background:#fff}
        .report-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #7d131b;padding-bottom:10px;margin-bottom:14px}
        .report-head h2{font-family:"Songti SC",serif;font-size:22px;margin:0;letter-spacing:1px}
        .report-head p{font-size:9px;color:#746f63;margin:2px 0 0}
        .report-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
        .report-kpi{background:#fdf7ee;border:1px solid #eadcc8;border-radius:8px;padding:8px 10px}
        .report-kpi b{display:block;font-size:21px}
        .report-kpi span{font-size:8px;color:#746f63}
        .report-section{margin-bottom:14px}
        .report-section h3{font-size:12px;border-left:3px solid #c9a45b;padding-left:7px;margin:0 0 6px}
        .report-section p,.report-section li{font-size:10px;line-height:1.8;color:#4a3a31}
        .report-section ul{padding-left:14px;margin:0}
        .report-section li{list-style:disc}
        .report-table{width:100%;border-collapse:collapse;font-size:9px}
        .report-table th,.report-table td{border:1px solid #eadcc8;padding:5px 7px;text-align:left}
        .report-table th{background:#fdf7ee}
        @page{size:A4;margin:16mm}
      </style></head><body>${inner}<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script></body></html>`);
    w.document.close();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
