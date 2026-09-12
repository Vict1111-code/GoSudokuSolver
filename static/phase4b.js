(() => {
  const CLOUD_KEY = 'sudokuCloudSavedAt';
  let lastBoard = '';
  let submittedFingerprint = '';
  let syncing = false;

  const $ = id => document.getElementById(id);
  const authReady = () => window.SudokuAuth?.supabase && window.SudokuAuth?.getUser();

  function boardValues() {
    return [...document.querySelectorAll('#board .cell')].map(c => c.value || '');
  }

  function currentInitial() {
    return [...document.querySelectorAll('#board .cell')].map(c => c.classList.contains('given') ? Number(c.value || 0) : 0);
  }

  function matrix(values) {
    const out = [];
    for (let r = 0; r < 9; r++) out.push(values.slice(r * 9, r * 9 + 9).map(v => Number(v || 0)));
    return out;
  }

  function modeAndDifficulty() {
    const badge = $('modeBadge')?.textContent || '';
    const label = $('levelLabel')?.textContent?.toLowerCase() || 'easy';
    const mode = badge.includes('Daily') ? 'daily' : badge.includes('Speed Run') ? 'speed_run' : 'classic';
    const difficulty = label.includes('hard') ? 'difficult' : label.includes('medium') ? 'medium' : 'easy';
    return { mode, difficulty };
  }

  function timerSeconds() {
    const text = $('timer')?.textContent || '00:00';
    const parts = text.split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }

  async function solutionFor(initial) {
    const rows = [];
    for (let r = 0; r < 9; r++) rows.push(initial.slice(r * 9, r * 9 + 9).map(v => v || '.').join(''));
    const res = await fetch('/solve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) });
    if (!res.ok) throw new Error('Could not solve saved puzzle');
    const data = await res.json();
    if (!data.solved) throw new Error('Could not solve saved puzzle');
    return data.board;
  }

  async function cloudSave(silent = true) {
    if (syncing || !authReady()) return false;
    const values = boardValues();
    const initial = currentInitial();
    if (initial.filter(Boolean).length === 0 || values.every(v => !v)) return false;
    syncing = true;
    try {
      const { supabase } = window.SudokuAuth;
      const user = window.SudokuAuth.getUser();
      const { mode, difficulty } = modeAndDifficulty();
      const solution = await solutionFor(initial);
      const remaining = mode === 'speed_run' ? timerSeconds() : null;
      const payload = {
        user_id: user.id,
        puzzle: initial,
        initial_board: initial,
        board: matrix(values),
        solution,
        difficulty,
        mode,
        seconds: mode === 'speed_run' ? Math.max(0, 300 - timerSeconds()) : timerSeconds(),
        remaining_seconds: remaining,
        score: Number($('score')?.textContent || 0),
        hints: Number($('hints')?.textContent || 0),
        mistakes: 0,
        daily_date: mode === 'daily' ? new Date().toISOString().slice(0, 10) : null,
        updated_at: new Date().toISOString()
      };
      const { error } = await supabase.from('saved_games').upsert(payload);
      if (error) throw error;
      localStorage.setItem(CLOUD_KEY, String(Date.now()));
      if (!silent) $('message').textContent = '☁️ Progress saved to your account.';
      return true;
    } catch (e) {
      console.error('Cloud save failed', e);
      return false;
    } finally {
      syncing = false;
    }
  }

  async function loadCloudSave() {
    if (!authReady()) return false;
    try {
      const { supabase } = window.SudokuAuth;
      const user = window.SudokuAuth.getUser();
      const { data, error } = await supabase.from('saved_games').select('*').eq('user_id', user.id).maybeSingle();
      if (error || !data) return false;
      const local = JSON.parse(localStorage.getItem('sudokuSavedGame') || 'null');
      if (local && Number(local.savedAt || 0) >= new Date(data.updated_at).getTime()) return false;
      const values = data.board.flat().map(v => v || '');
      localStorage.sudokuSavedGame = JSON.stringify({
        initial: data.initial_board,
        solution: data.solution,
        values,
        seconds: data.seconds || 0,
        score: data.score || 0,
        hints: data.hints ?? 3,
        level: data.difficulty === 'hard' ? 'difficult' : data.difficulty,
        dailyMode: data.mode === 'daily',
        speedRunMode: data.mode === 'speed_run',
        speedRunRemaining: data.remaining_seconds ?? 300,
        dailyDate: data.daily_date || '',
        mistakesThisGame: data.mistakes || 0,
        hintsThisGame: 0,
        savedAt: new Date(data.updated_at).getTime()
      });
      localStorage.removeItem(CLOUD_KEY);
      return true;
    } catch (e) {
      console.error('Cloud load failed', e);
      return false;
    }
  }

  async function deleteCloudSave() {
    if (!authReady()) return;
    try {
      const { supabase } = window.SudokuAuth;
      await supabase.from('saved_games').delete().eq('user_id', window.SudokuAuth.getUser().id);
    } catch (e) { console.error('Cloud save delete failed', e); }
  }

  async function loadGlobalLeaderboard() {
    const box = $('leaderboard');
    if (!box || !authReady()) return;
    box.innerHTML = '<p class="modal-note">☁️ Loading global rankings…</p>';
    const { supabase } = window.SudokuAuth;
    const { data, error } = await supabase.from('global_leaderboard').select('*').limit(50);
    if (error) {
      box.innerHTML = '<p class="modal-note">Global leaderboard unavailable right now.</p>';
      return;
    }
    box.innerHTML = data.length ? data.map(row => `<div class="leaderboard-row"><b>#${row.rank}</b><strong>${escapeHtml(row.player)}</strong><span>${row.score} pts</span><span>${formatTime(row.completion_time_seconds)}</span></div>`).join('') : '<p class="modal-note">Be the first player on the global leaderboard!</p>';
  }

  function escapeHtml(value) { return String(value).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])); }
  function formatTime(seconds) { const s = Math.max(0, Number(seconds || 0)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }

  async function submitCompletedRun() {
    if (!authReady()) return;
    const values = boardValues();
    if (values.some(v => !v) || document.querySelector('#board .cell.error')) return;
    const fingerprint = values.join('') + '|' + ($('score')?.textContent || '') + '|' + ($('modeBadge')?.textContent || '');
    if (fingerprint === submittedFingerprint) return;
    submittedFingerprint = fingerprint;
    const { mode, difficulty } = modeAndDifficulty();
    const seconds = mode === 'speed_run' ? Math.max(0, 300 - timerSeconds()) : timerSeconds();
    const score = Number($('score')?.textContent || 0);
    const xpEarned = mode === 'daily' ? 150 : mode === 'speed_run' ? 125 : 100;
    try {
      const { data, error } = await window.SudokuAuth.supabase.rpc('submit_game_run', {
        p_difficulty: difficulty,
        p_mode: mode,
        p_score: score,
        p_completion_time_seconds: seconds,
        p_xp_earned: xpEarned,
        p_mistakes: 0,
        p_hints_used: Math.max(0, 3 - Number($('hints')?.textContent || 0)),
        p_daily_date: mode === 'daily' ? new Date().toISOString().slice(0, 10) : null
      });
      if (error) throw error;
      if (data) {
        localStorage.sudokuXP = String(data.xp);
        localStorage.sudokuStreak = String(data.streak);
        localStorage.sudokuWins = String(data.wins);
        localStorage.sudokuStatsWins = String(data.wins);
        if (data.best_time_seconds != null) localStorage.sudokuBestTime = String(data.best_time_seconds);
        $('message').textContent = '☁️ Run submitted to the global leaderboard!';
      }
      await deleteCloudSave();
      await loadGlobalLeaderboard();
      window.SudokuAuth.sync?.();
    } catch (e) {
      console.error('Run submission failed', e);
      $('message').textContent = 'Run completed locally. Cloud submission failed, but your local progress is safe.';
    }
  }

  function bind() {
    $('saveGame')?.addEventListener('click', () => setTimeout(() => cloudSave(false), 150));
    $('progressBtn')?.addEventListener('click', () => setTimeout(loadGlobalLeaderboard, 100));
    $('accountButton')?.addEventListener('click', () => setTimeout(loadGlobalLeaderboard, 150));
    document.addEventListener('input', () => {
      clearTimeout(window.sudokuCloudSaveTimer);
      window.sudokuCloudSaveTimer = setTimeout(() => cloudSave(true), 1200);
    });
    setInterval(() => cloudSave(true), 10000);
    setInterval(() => {
      const values = boardValues();
      const key = values.join('');
      if (key !== lastBoard) {
        lastBoard = key;
        if (values.every(Boolean)) setTimeout(submitCompletedRun, 300);
      }
    }, 700);
    setInterval(loadGlobalLeaderboard, 30000);
    setTimeout(async () => {
      if (await loadCloudSave()) {
        $('message').textContent = '☁️ Cloud save found. Use Continue to resume it.';
        if (typeof updateContinueBar === 'function') updateContinueBar();
      }
      loadGlobalLeaderboard();
    }, 1200);
  }

  const boot = setInterval(() => {
    if (window.SudokuAuth?.supabase) { clearInterval(boot); bind(); }
  }, 250);
})();
