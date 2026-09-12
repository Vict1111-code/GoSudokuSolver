const COMPETITIVE_FUNCTION = 'sudoku-competitive';
let competitiveSessionId = null;
let competitiveStarting = false;
let competitiveVerifying = false;
let lastPuzzleSignature = '';

function phase4cUser(){ return window.SudokuAuth?.getUser?.() || null; }
function phase4cPuzzle(){
  const cells=[...document.querySelectorAll('#board .cell')]; const rows=[];
  for(let r=0;r<9;r++) rows.push(cells.slice(r*9,r*9+9).map(c=>c.classList.contains('given')&&c.value?c.value:'.').join(''));
  return rows;
}
function phase4cBoard(){
  const cells=[...document.querySelectorAll('#board .cell')]; const rows=[];
  for(let r=0;r<9;r++) rows.push(cells.slice(r*9,r*9+9).map(c=>c.value||'.').join(''));
  return rows;
}
function phase4cComplete(board){ return board.length===9 && board.every(r=>r.length===9&&/^[1-9]{9}$/.test(r)); }
async function phase4cStart(mode,difficulty,date=''){
  const user=phase4cUser(); if(!user||competitiveStarting)return;
  const puzzle=phase4cPuzzle(); if(puzzle.join('').replace(/\./g,'').length<17)return;
  const sig=`${mode}|${difficulty}|${date}|${puzzle.join('')}`; if(sig===lastPuzzleSignature&&competitiveSessionId)return;
  competitiveStarting=true;
  try{
    const payload={action:'start',mode,difficulty,puzzle}; if(mode==='daily')payload.date=date;
    const {data,error}=await window.SudokuAuth.supabase.functions.invoke(COMPETITIVE_FUNCTION,{body:payload});
    if(error)throw error;
    competitiveSessionId=data.session_id; lastPuzzleSignature=sig; sessionStorage.setItem('sudokuCompetitiveSession',competitiveSessionId);
    document.getElementById('message').textContent='🛡️ Server-validated competitive session started.';
  }catch(e){console.error('Phase 4C start failed',e);competitiveSessionId=null;document.getElementById('message').textContent='⚠️ Online validation unavailable. This game remains local.';}
  finally{competitiveStarting=false;}
}
async function phase4cVerify(){
  if(!competitiveSessionId||competitiveVerifying)return;
  const board=phase4cBoard(); if(!phase4cComplete(board))return;
  competitiveVerifying=true;
  try{
    const {data,error}=await window.SudokuAuth.supabase.functions.invoke(COMPETITIVE_FUNCTION,{body:{action:'verify',session_id:competitiveSessionId,board,client_score:Number(document.getElementById('score')?.textContent||0)}});
    if(error)throw error; if(!data?.verified)throw new Error('Server did not verify this run');
    const score=Number(data.score||0),xp=Number(data.xp_earned||0);
    document.getElementById('victoryScore').textContent=score;
    document.getElementById('victoryTime').textContent=fmt(data.elapsed_seconds||0);
    document.getElementById('victoryXP').textContent=`+${xp}`;
    document.getElementById('victoryMessage').textContent=`🛡️ Verified by server · ${data.mode==='daily'?'Daily Challenge':data.mode==='speed_run'?'Speed Run':'Competitive'}`;
    document.getElementById('victoryOverlay')?.classList.add('show');
    document.getElementById('message').textContent='🏆 Server verified your win!';
    document.getElementById('score').textContent=score;
    competitiveSessionId=null; sessionStorage.removeItem('sudokuCompetitiveSession');
    const {data:profile}=await window.SudokuAuth.supabase.from('profiles').select('*').eq('id',phase4cUser().id).maybeSingle();
    if(profile){localStorage.sudokuXP=String(profile.xp);localStorage.sudokuStreak=String(profile.current_streak);window.dispatchEvent(new CustomEvent('sudoku:server-profile',{detail:profile}));}
  }catch(e){console.error('Phase 4C verification failed',e);document.getElementById('message').textContent='❌ Server could not verify this completion. No online score was recorded.';}
  finally{competitiveVerifying=false;}
}
function phase4cInstall(){
  const watch=(selector,handler)=>document.querySelectorAll(selector).forEach(el=>el.addEventListener('click',handler));
  watch('#newGame',()=>setTimeout(()=>phase4cStart('classic',document.querySelector('.difficulty-btn.active')?.dataset.level||'easy'),900));
  watch('#dailyChallenge',()=>setTimeout(()=>phase4cStart('daily','medium',new Date().toISOString().slice(0,10)),900));
  watch('#speedRun',()=>setTimeout(()=>phase4cStart('speed_run','medium'),900));
  watch('.difficulty-btn',e=>setTimeout(()=>phase4cStart('classic',e.currentTarget.dataset.level||'easy'),900));
  document.addEventListener('input',e=>{
    if(!e.target.matches('#board .cell')||!competitiveSessionId)return;
    const b=phase4cBoard(); if(phase4cComplete(b)){e.stopImmediatePropagation();phase4cVerify();}
  },true);
  const saved=sessionStorage.getItem('sudokuCompetitiveSession'); if(saved)competitiveSessionId=saved;
}
const phase4cBoot=setInterval(()=>{if(window.SudokuAuth?.supabase){clearInterval(phase4cBoot);phase4cInstall();}},250);
