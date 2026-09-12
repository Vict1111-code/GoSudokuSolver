(() => {
  const css = `
    .online-panel{position:fixed;inset:0;background:rgba(3,7,18,.72);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;z-index:120;padding:20px}
    .online-panel.show{display:flex}.online-card{width:min(620px,100%);max-height:90vh;overflow:auto;background:var(--card,#111827);border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.4)}
    .online-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.online-head h2{margin:0}.online-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.online-card input{width:100%;box-sizing:border-box;margin:6px 0;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:inherit}.online-card button{border:0;border-radius:10px;padding:10px 14px;cursor:pointer}.online-primary{font-weight:700}.online-status{min-height:24px;margin:10px 0}.online-table{width:100%;border-collapse:collapse;margin-top:14px;font-size:.9rem}.online-table th,.online-table td{text-align:left;padding:9px;border-bottom:1px solid rgba(255,255,255,.1)}
    .account-chip{display:inline-flex;align-items:center;gap:8px;margin-right:6px;padding:8px 11px;border-radius:999px;background:rgba(255,255,255,.08);font-size:.85rem}.online-muted{opacity:.7;font-size:.9rem}
    @media(max-width:600px){.online-grid{grid-template-columns:1fr}.online-card{padding:18px}}
  `;
  const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
  const panel=document.createElement('div');panel.className='online-panel';panel.id='onlinePanel';panel.innerHTML=`<div class="online-card">
    <div class="online-head"><div><h2>🌐 Sudoku Quest Online</h2><div class="online-muted">Sync your profile and compete on the global leaderboard.</div></div><button id="onlineClose" aria-label="Close">✕</button></div>
    <div id="onlineContent"></div>
  </div>`;document.body.appendChild(panel);
  const content=document.getElementById('onlineContent');
  let me=null;
  const api=async(path,options={})=>{const r=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});let data={};try{data=await r.json()}catch{}if(!r.ok)throw Error(data.error||'Request failed');return data};
  function open(){panel.classList.add('show');render();}
  function close(){panel.classList.remove('show');}
  function render(){content.innerHTML=me?loggedInView():authView();}
  function authView(){return `<div class="online-grid" style="margin-top:18px"><form id="loginForm"><h3>Log in</h3><input name="username" placeholder="Username" autocomplete="username" required><input name="password" type="password" placeholder="Password" autocomplete="current-password" required><button class="online-primary" type="submit">Log in</button></form><form id="registerForm"><h3>Create account</h3><input name="username" placeholder="Username" autocomplete="username" required><input name="password" type="password" placeholder="Password (8+ chars)" autocomplete="new-password" required><button class="online-primary" type="submit">Create account</button></form></div><div class="online-status" id="onlineStatus">Your local progress continues to work without an account.</div>`}
  function loggedInView(){return `<div style="margin-top:18px"><div class="account-chip">👤 ${escapeHTML(me.username)} · Level ${me.level} · ${me.xp} XP</div><button id="logoutBtn">Log out</button><h3 style="margin-top:20px">🏆 Global Leaderboard</h3><div id="globalBoard">Loading...</div><div class="online-status" id="onlineStatus">Completed runs can be submitted to the global board.</div></div>`}
  function escapeHTML(s){return String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
  async function refreshMe(){try{const d=await api('/api/me');me=d.authenticated?d:null}catch{me=null}render();if(me)loadLeaderboard();}
  async function loadLeaderboard(){const box=document.getElementById('globalBoard');if(!box)return;try{const rows=await api('/api/leaderboard');if(!rows.length){box.innerHTML='<p class="online-muted">No global runs yet. Be the first!</p>';return}box.innerHTML=`<table class="online-table"><thead><tr><th>#</th><th>Player</th><th>Score</th><th>Time</th><th>Mode</th><th>Date</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${escapeHTML(r.username)}</td><td>${r.score}</td><td>${fmtOnline(r.seconds)}</td><td>${escapeHTML(r.mode)}</td><td>${escapeHTML(r.date)}</td></tr>`).join('')}</tbody></table>`}catch(e){box.innerHTML=`<p class="online-muted">${escapeHTML(e.message)}</p>`}}
  function fmtOnline(s){return `${String(Math.floor(Number(s)/60)).padStart(2,'0')}:${String(Number(s)%60).padStart(2,'0')}`}
  async function submitRun(){if(!me||!window.sudokuState)return;const s=window.sudokuState;try{await api('/api/submit-run',{method:'POST',body:JSON.stringify({score:Number(s.score)||0,seconds:s.speedRunMode?300-Number(s.speedRunRemaining||0):Number(s.seconds)||0,difficulty:s.level||'easy',mode:s.dailyMode?'daily':s.speedRunMode?'speed':'standard',xp:Number(localStorage.sudokuXP||0),streak:Number(localStorage.sudokuStreak||0)})});await refreshMe()}catch(e){console.info('Online run not submitted:',e.message)}}
  panel.addEventListener('click',e=>{if(e.target===panel)close()});document.getElementById('onlineClose').onclick=close;
  content.addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const status=document.getElementById('onlineStatus');const fd=new FormData(form);try{const data=await api(form.id==='loginForm'?'/api/login':'/api/register',{method:'POST',body:JSON.stringify({username:fd.get('username'),password:fd.get('password')})});status.textContent=`Welcome, ${data.username}!`;await refreshMe()}catch(err){status.textContent=err.message}});
  content.addEventListener('click',async e=>{if(e.target.id==='logoutBtn'){await api('/api/logout',{method:'POST'}).catch(()=>{});me=null;render()}});
  const onlineBtn=document.createElement('button');onlineBtn.className='daily-btn';onlineBtn.textContent='🌐 Online';onlineBtn.onclick=open;document.querySelector('.top-actions')?.insertBefore(onlineBtn,document.getElementById('soundToggle'));
  const oldFinish=window.finishGame; if(typeof oldFinish==='function'){window.finishGame=function(){const result=oldFinish.apply(this,arguments);setTimeout(()=>{if(me)submitRun()},500);return result}}
  refreshMe();
})();
