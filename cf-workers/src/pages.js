// ============================================================
// HTML Pages — Login, Channel Listing, Video Player
// All pages are TV-optimized (large targets, keyboard nav,
// HLS.js playback, dark mode)
// ============================================================

// ── LOGIN PAGE ────────────────────────────────────────────────
export function loginPage(config) {
  const meta = config?.meta_data ?? {};
  const appName = meta.hname || 'JioTV+';
  const favicon = meta.himg  || 'https://jiotvimages.cdn.jio.com/dare_images/images/Jio_Cinema_logo.png';
  const bgPic   = meta.bgpic || 'https://images.unsplash.com/photo-1593078166039-c9878df5c520?w=1920&q=80';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Login – ${appName}</title>
  <link rel="icon" href="${favicon}"/>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Plus Jakarta Sans',sans-serif;background:#020617;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden;color:#f8fafc}
    .bg{position:fixed;inset:0;background:url('${bgPic}') center/cover no-repeat;filter:brightness(.3);z-index:-1}
    .card{background:rgba(15,23,42,.9);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.1);box-shadow:0 50px 100px -20px rgba(0,0,0,.9);width:100%;max-width:440px;border-radius:2rem;padding:2.5rem;animation:fadeIn .6s ease}
    @keyframes fadeIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
    .logo{text-align:center;margin-bottom:1.5rem}
    .logo img{width:64px;height:64px;border-radius:16px;object-fit:cover}
    .logo h1{font-size:1.6rem;font-weight:800;margin-top:.6rem;background:linear-gradient(135deg,#6366f1,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
    .logo p{color:#64748b;font-size:.85rem;margin-top:.3rem}
    .field{margin-bottom:1rem}
    .field label{display:block;font-size:.8rem;font-weight:600;color:#94a3b8;margin-bottom:.4rem;text-transform:uppercase;letter-spacing:.05em}
    .field input{width:100%;background:rgba(2,6,23,.5);border:1.5px solid rgba(255,255,255,.1);border-radius:.75rem;padding:.9rem 1rem;color:#f1f5f9;font-size:1rem;font-family:inherit;transition:all .3s;outline:none}
    .field input:focus{border-color:#6366f1;background:rgba(2,6,23,.8);box-shadow:0 0 20px rgba(99,102,241,.2)}
    .field input::placeholder{color:#475569}
    #otp-input{font-size:1.5rem;letter-spacing:.5rem;font-weight:700;text-align:center}
    .btn{width:100%;border:none;border-radius:.75rem;padding:.95rem;font-size:1rem;font-weight:700;font-family:inherit;cursor:pointer;transition:all .25s;position:relative;overflow:hidden}
    .btn-primary{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;box-shadow:0 8px 24px rgba(99,102,241,.35)}
    .btn-primary:hover,#send-btn:focus,#verify-btn:focus{transform:translateY(-2px);box-shadow:0 12px 32px rgba(99,102,241,.45)}
    .btn-secondary{background:rgba(255,255,255,.06);color:#94a3b8;margin-top:.5rem}
    .btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
    .msg{padding:.75rem 1rem;border-radius:.6rem;font-size:.85rem;font-weight:600;text-align:center;margin-top:.75rem;display:none}
    .msg.success{background:rgba(34,197,94,.12);color:#4ade80;border:1px solid rgba(34,197,94,.25)}
    .msg.error{background:rgba(239,68,68,.12);color:#f87171;border:1px solid rgba(239,68,68,.25)}
    .otp-box{display:none}
    .timer{text-align:center;color:#64748b;font-size:.8rem;margin-top:.5rem}
    .spin{display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:6px}
    @keyframes spin{to{transform:rotate(360deg)}}
  </style>
</head>
<body>
  <div class="bg"></div>
  <div class="card">
    <div class="logo">
      <img src="${favicon}" alt="${appName}" onerror="this.style.display='none'"/>
      <h1>${appName}</h1>
      <p>Login with your Jio number</p>
    </div>

    <!-- Step 1: Phone number -->
    <div id="phone-box">
      <div class="field">
        <label>Jio Mobile Number</label>
        <input type="tel" id="phone" placeholder="Enter 10-digit number" maxlength="10" autocomplete="tel" inputmode="numeric"/>
      </div>
      <button class="btn btn-primary" id="send-btn" onclick="sendOTP()">Send OTP</button>
      <div class="msg" id="send-msg"></div>
    </div>

    <!-- Step 2: OTP verification -->
    <div class="otp-box" id="otp-box">
      <div class="field">
        <label>Enter OTP</label>
        <input type="number" id="otp-input" class="otp-input" placeholder="------" maxlength="6" autocomplete="one-time-code" inputmode="numeric"/>
      </div>
      <button class="btn btn-primary" id="verify-btn" onclick="verifyOTP()">Verify &amp; Watch</button>
      <button class="btn btn-secondary" id="back-btn" onclick="goBack()">&#8592; Change Number</button>
      <div class="timer" id="timer-txt"></div>
      <div class="msg" id="otp-msg"></div>
    </div>
  </div>

  <script>
    let timerInterval;

    function showMsg(id, text, type) {
      const el = document.getElementById(id);
      el.textContent = text;
      el.className = 'msg ' + type;
      el.style.display = 'block';
    }

    function setLoading(btnId, loading, text) {
      const btn = document.getElementById(btnId);
      btn.disabled = loading;
      btn.innerHTML = loading ? '<span class="spin"></span>' + text : text;
    }

    async function sendOTP() {
      const phone = document.getElementById('phone').value.trim();
      if (!/^[6-9]\\d{9}$/.test(phone)) {
        showMsg('send-msg', 'Enter a valid 10-digit Indian mobile number', 'error');
        return;
      }
      setLoading('send-btn', true, 'Sending OTP...');
      try {
        const res = await fetch('/api/otpsend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: phone })
        });
        const data = await res.json();
        if (data.message === 'SUCCESS') {
          document.getElementById('phone-box').style.display = 'none';
          document.getElementById('otp-box').style.display = 'block';
          showMsg('otp-msg', data.ui_label, 'success');
          startTimer(120);
          setTimeout(() => document.getElementById('otp-input').focus(), 100);
        } else {
          showMsg('send-msg', data.ui_label, 'error');
        }
      } catch (e) {
        showMsg('send-msg', 'Network error. Please try again.', 'error');
      }
      setLoading('send-btn', false, 'Send OTP');
    }

    async function verifyOTP() {
      const otp = document.getElementById('otp-input').value.trim();
      if (!/^\\d{6}$/.test(otp)) {
        showMsg('otp-msg', 'Enter the 6-digit OTP', 'error');
        return;
      }
      setLoading('verify-btn', true, 'Verifying...');
      try {
        const res = await fetch('/api/otpverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otp })
        });
        const data = await res.json();
        if (data.message === 'SUCCESS') {
          showMsg('otp-msg', data.ui_label, 'success');
          clearInterval(timerInterval);
          setTimeout(() => window.location.href = '/', 800);
        } else {
          showMsg('otp-msg', data.ui_label, 'error');
          setLoading('verify-btn', false, 'Verify &amp; Watch');
        }
      } catch (e) {
        showMsg('otp-msg', 'Network error. Please try again.', 'error');
        setLoading('verify-btn', false, 'Verify &amp; Watch');
      }
    }

    function goBack() {
      document.getElementById('otp-box').style.display = 'none';
      document.getElementById('phone-box').style.display = 'block';
      clearInterval(timerInterval);
    }

    function startTimer(secs) {
      let s = secs;
      const el = document.getElementById('timer-txt');
      timerInterval = setInterval(() => {
        el.textContent = 'OTP expires in ' + s + 's';
        if (--s < 0) { clearInterval(timerInterval); el.textContent = 'OTP expired. Please request again.'; }
      }, 1000);
    }

    // Enter key support
    document.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if (document.getElementById('otp-box').style.display === 'block') verifyOTP();
        else sendOTP();
      }
    });
  </script>
</body>
</html>`;
}

// ── CHANNEL LISTING PAGE ──────────────────────────────────────
export function channelPage(config, channels) {
  const meta    = config?.meta_data ?? {};
  const appName = meta.hname || 'JioTV+';
  const favicon = meta.himg  || 'https://jiotvimages.cdn.jio.com/dare_images/images/Jio_Cinema_logo.png';

  const categories = config?.channelCategoryMapping ?? {};
  const catList    = Object.entries(categories).map(([id, name]) => `<option value="${id}">${name}</option>`).join('');

  const languages  = config?.languageIdMapping ?? {};
  const langList   = Object.entries(languages).map(([id, name]) => `<option value="${id}">${name}</option>`).join('');

  const jioChannels = channels?.result ?? [];

  const channelCards = jioChannels.map(ch => {
    const id    = ch.channel_id   ?? '';
    const name  = ch.channel_name ?? 'Unknown';
    const logo  = `https://jiotvimages.cdn.jio.com/dare_images/images/${ch.logoUrl ?? ''}`;
    const catId = String(ch.channelCategoryId ?? '');
    const langId= String(ch.channelLanguageId ?? '');
    const cat   = categories[catId] ?? 'General';
    return `<button class="ch-card" tabindex="0" data-id="${id}" data-cat="${catId}" data-lang="${langId}" data-name="${name.toLowerCase()}" onclick="playChannel('${id}','${name.replace(/'/g,"\\'")}','${ch.logoUrl ?? ''}')">
      <img src="${logo}" alt="${name}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22/>'"/>
      <span>${name}</span>
    </button>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${appName} – Live TV</title>
  <link rel="icon" href="${favicon}"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    :root{--bg:#07090f;--surface:#0f1117;--card:#161922;--border:#1e2330;--accent:#6366f1;--accent2:#8b5cf6;--text:#e2e8f0;--muted:#64748b;--radius:12px}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
    header{background:var(--surface);border-bottom:1px solid var(--border);padding:12px 20px;display:flex;align-items:center;gap:16px;position:sticky;top:0;z-index:100;backdrop-filter:blur(12px)}
    .logo-txt{font-size:1.2rem;font-weight:800;background:linear-gradient(135deg,#6366f1,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;white-space:nowrap}
    .search{flex:1;background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:8px;padding:8px 14px;color:var(--text);font-size:.9rem;font-family:inherit;outline:none;transition:border-color .2s}
    .search:focus{border-color:var(--accent)}
    .search::placeholder{color:var(--muted)}
    select{background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--text);font-size:.85rem;font-family:inherit;outline:none;cursor:pointer;max-width:130px}
    select option{background:#1a1d24}
    .logout-btn{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:#f87171;padding:7px 14px;border-radius:8px;cursor:pointer;font-size:.8rem;font-weight:600;white-space:nowrap;transition:all .2s}
    .logout-btn:hover{background:rgba(239,68,68,.25)}
    .controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    main{padding:16px 20px}
    .section-title{font-size:.7rem;text-transform:uppercase;letter-spacing:2px;color:var(--muted);margin-bottom:12px;font-weight:700}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
    @media(min-width:768px){.grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}}
    @media(min-width:1280px){.grid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}}
    .ch-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:12px 8px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;transition:all .2s;text-align:center;width:100%;min-height:110px;justify-content:center}
    .ch-card:hover,.ch-card:focus{border-color:var(--accent);background:rgba(99,102,241,.08);transform:translateY(-2px);box-shadow:0 8px 24px rgba(99,102,241,.2);outline:2px solid var(--accent)}
    .ch-card img{width:56px;height:56px;object-fit:contain;border-radius:8px;background:#111}
    .ch-card span{font-size:.72rem;font-weight:600;color:var(--text);line-height:1.3;max-width:120px;word-break:break-word}
    .hidden{display:none!important}
    .empty-msg{grid-column:1/-1;text-align:center;color:var(--muted);padding:40px;font-size:.9rem}
    .count-badge{background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);color:#a5b4fc;font-size:.75rem;font-weight:700;padding:3px 10px;border-radius:50px}
  </style>
</head>
<body>
  <header>
    <span class="logo-txt">${appName}</span>
    <input class="search" type="search" id="search" placeholder="Search channels..." oninput="filterChannels()" autocomplete="off"/>
    <div class="controls">
      <select id="cat-filter" onchange="filterChannels()"><option value="">All Genres</option>${catList}</select>
      <select id="lang-filter" onchange="filterChannels()"><option value="">All Languages</option>${langList}</select>
      <span class="count-badge" id="count-badge">${jioChannels.length} channels</span>
      <button class="logout-btn" onclick="logout()">Logout</button>
    </div>
  </header>
  <main>
    <p class="section-title">Live Channels</p>
    <div class="grid" id="channel-grid">
      ${channelCards}
      <div class="empty-msg hidden" id="empty-msg">No channels match your search</div>
    </div>
  </main>

  <script>
    function filterChannels() {
      const q    = document.getElementById('search').value.toLowerCase();
      const cat  = document.getElementById('cat-filter').value;
      const lang = document.getElementById('lang-filter').value;
      const cards = document.querySelectorAll('.ch-card');
      let visible = 0;
      cards.forEach(card => {
        const matchName = !q    || card.dataset.name.includes(q);
        const matchCat  = !cat  || card.dataset.cat  === cat;
        const matchLang = !lang || card.dataset.lang  === lang;
        const show = matchName && matchCat && matchLang;
        card.classList.toggle('hidden', !show);
        if (show) visible++;
      });
      document.getElementById('empty-msg').classList.toggle('hidden', visible > 0);
      document.getElementById('count-badge').textContent = visible + ' channels';
    }

    function playChannel(id, name, logo) {
      window.location.href = '/play.php?id=' + id + '&cid=' + encodeURIComponent(logo) + '&name=' + encodeURIComponent(name);
    }

    async function logout() {
      await fetch('/logout', { method: 'POST' });
      window.location.href = '/login';
    }

    // Keyboard navigation for TV remote
    document.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && document.activeElement.tagName !== 'INPUT') {
        history.back();
      }
    });
  </script>
</body>
</html>`;
}

// ── VIDEO PLAYER PAGE ────────────────────────────────────────
export function playerPage(channelId, channelName, logoUrl, config) {
  const meta    = config?.meta_data ?? {};
  const appName = meta.hname || 'JioTV+';
  const favicon = meta.himg  || logoUrl || '';

  function hexToStr(hex) {
    let s = '';
    for (let i = 0; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i,i+2),16));
    return s;
  }
  const JIOTV_TOKEN = atob(hexToStr('536b6c5552553545556b46665331564e5156493d'));
  const streamUrl = `/live.m3u8?id=${channelId}&token=${JIOTV_TOKEN}`;
  const logoFull  = logoUrl ? `https://jiotvimages.cdn.jio.com/dare_images/images/${logoUrl}` : favicon;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${channelName} | ${appName}</title>
  <link rel="icon" href="${logoFull}"/>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.css"/>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.4.14/dist/hls.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.min.js"><\/script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{width:100%;height:100%;background:#000;overflow:hidden;font-family:sans-serif}
    video,.plyr,.plyr__video-wrapper{width:100vw;height:100dvh}
    video,.plyr{position:fixed;top:0;left:0}
    .plyr{margin:0!important}
    .back-btn{position:fixed;top:16px;left:16px;z-index:999;background:rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.2);color:#fff;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:.85rem;font-weight:600;backdrop-filter:blur(8px);transition:all .2s;text-decoration:none;display:flex;align-items:center;gap:6px;opacity:0;transition:opacity .3s}
    body:hover .back-btn{opacity:1}
    .channel-info{position:fixed;top:16px;right:16px;z-index:999;display:flex;align-items:center;gap:10px;background:rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:8px 14px;backdrop-filter:blur(8px);opacity:0;transition:opacity .3s}
    body:hover .channel-info{opacity:1}
    .channel-info img{width:36px;height:36px;object-fit:contain;border-radius:6px}
    .channel-info span{color:#fff;font-size:.85rem;font-weight:600;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .error-overlay{display:none;position:fixed;inset:0;background:#000;align-items:center;justify-content:center;flex-direction:column;gap:16px;z-index:999}
    .error-overlay.show{display:flex}
    .error-overlay h2{color:#fff;font-size:1.2rem}
    .error-overlay p{color:#888;font-size:.85rem}
    .retry-btn{background:#6366f1;color:#fff;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:.9rem;font-weight:600}
  </style>
</head>
<body>
  <a href="/" class="back-btn">&#8592; All Channels</a>
  <div class="channel-info">
    <img src="${logoFull}" alt="${channelName}" onerror="this.style.display='none'"/>
    <span>${channelName}</span>
  </div>

  <video id="player" playsinline controls></video>

  <div class="error-overlay" id="error-overlay">
    <h2>&#9888; Stream Error</h2>
    <p id="error-msg">Could not load the channel. Try again.</p>
    <button class="retry-btn" onclick="location.reload()">Retry</button>
    <a href="/" style="color:#888;font-size:.8rem">&#8592; Back to channels</a>
  </div>

  <script>
    const SRC = '${streamUrl}&_t=' + Date.now();
    const video = document.getElementById('player');

    const player = new Plyr(video, {
      controls: ['play','progress','current-time','mute','volume','fullscreen'],
      fullscreen: { enabled: true, fallback: true, iosNative: true },
      resetOnEnd: false,
      keyboard: { focused: true, global: true },
    });

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxLoadingDelay: 4,
        maxBufferLength: 30,
        startFragPrefetch: true
      });
      hls.loadSource(SRC);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (e, data) => {
        if (data.fatal) {
          document.getElementById('error-msg').textContent = data.details || 'Fatal stream error';
          document.getElementById('error-overlay').classList.add('show');
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari)
      video.src = SRC;
      video.play().catch(() => {});
    } else {
      document.getElementById('error-overlay').classList.add('show');
    }

    // Back button / Backspace → go to channel list
    document.addEventListener('keydown', e => {
      if (e.key === 'Backspace' || e.key === 'BrowserBack') {
        window.location.href = '/';
      }
    });
  </script>
</body>
</html>`;
}

// ── ERROR PAGE ────────────────────────────────────────────────
export function errorPage(title, message, link = '/', linkText = 'Go Back') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
  <style>
    body{font-family:sans-serif;background:#07090f;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:12px;text-align:center;padding:20px}
    h1{font-size:1.5rem;color:#f87171}
    p{color:#64748b;font-size:.9rem}
    a{background:#6366f1;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:8px;display:inline-block}
  </style>
</head>
<body>
  <h1>&#9888; ${title}</h1>
  <p>${message}</p>
  <a href="${link}">${linkText}</a>
</body>
</html>`;
}
