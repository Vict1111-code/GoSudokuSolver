import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.105.0/+esm';

const SUPABASE_URL = 'https://zafgtxckmegogvxffajn.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_pKpdFMRc61QJJVgrIbL4Pg_MWg5VgXV';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const authState = { user: null, profile: null, syncing: false };
const $ = id => document.getElementById(id);

function setAuthMessage(text, error = false) {
  const el = $('authMessage');
  if (!el) return;
  el.textContent = text || '';
  el.className = `auth-message ${error ? 'error' : ''}`;
}

function openAuth(mode = 'login') {
  $('authOverlay')?.classList.add('show');
  switchAuthMode(mode);
}

function closeAuth() { $('authOverlay')?.classList.remove('show'); }

function switchAuthMode(mode) {
  const login = mode === 'login';
  $('authTitle').textContent = login ? 'Welcome back' : 'Create your account';
  $('authSubtitle').textContent = login ? 'Sign in to sync your Sudoku progress.' : 'Create an account and keep your progress anywhere.';
  $('authSubmit').textContent = login ? '🔐 Sign In' : '🚀 Create Account';
  $('authNameWrap').style.display = login ? 'none' : 'block';
  $('authConfirmWrap').style.display = login ? 'none' : 'block';
  $('authSwitch').textContent = login ? 'Need an account? Create one' : 'Already have an account? Sign in';
  $('authForm').dataset.mode = mode;
  setAuthMessage('');
}

function renderAccount() {
  const user = authState.user;
  const button = $('accountButton');
  const guest = $('guestMode');
  const signed = $('signedInMode');
  if (!button) return;
  if (!user) {
    button.textContent = '👤 Sign In';
    button.classList.remove('signed-in');
    guest?.classList.remove('hidden');
    signed?.classList.add('hidden');
    return;
  }
  const name = authState.profile?.display_name || user.user_metadata?.display_name || user.email?.split('@')[0] || 'Player';
  button.textContent = `👤 ${name}`;
  button.classList.add('signed-in');
  guest?.classList.add('hidden');
  signed?.classList.remove('hidden');
  $('accountName').textContent = name;
  $('accountEmail').textContent = user.email || '';
  $('cloudXP').textContent = `${authState.profile?.xp ?? 0} XP`;
  $('cloudStreak').textContent = `${authState.profile?.current_streak ?? 0} streak`;
}

async function loadProfile(user) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (data) {
    authState.profile = data;
    localStorage.sudokuXP = String(data.xp ?? 0);
    localStorage.sudokuStreak = String(data.current_streak ?? 0);
    renderAccount();
  }
}

async function syncLocalProgress() {
  if (!authState.user || authState.syncing) return;
  const localXP = Number(localStorage.sudokuXP || 0);
  const localStreak = Number(localStorage.sudokuStreak || 0);
  const localWins = Number(localStorage.sudokuStatsWins || localStorage.sudokuWins || 0);
  const localBest = Number(localStorage.sudokuBestTime || 0);
  const current = authState.profile || {};
  if (localXP === Number(current.xp || 0) && localStreak === Number(current.current_streak || 0) && localWins === Number(current.wins || 0) && (!localBest || localBest === Number(current.best_time_seconds || 0))) return;
  authState.syncing = true;
  const payload = {
    id: authState.user.id,
    xp: Math.max(localXP, Number(current.xp || 0)),
    level: Math.floor(Math.max(localXP, Number(current.xp || 0)) / 100) + 1,
    current_streak: Math.max(localStreak, Number(current.current_streak || 0)),
    best_streak: Math.max(localStreak, Number(current.best_streak || 0)),
    wins: Math.max(localWins, Number(current.wins || 0)),
    best_time_seconds: localBest > 0 ? (current.best_time_seconds ? Math.min(localBest, current.best_time_seconds) : localBest) : current.best_time_seconds
  };
  const { data, error } = await supabase.from('profiles').upsert(payload).select('*').single();
  if (!error && data) {
    authState.profile = data;
    localStorage.sudokuXP = String(data.xp);
    localStorage.sudokuStreak = String(data.current_streak);
    renderAccount();
  }
  authState.syncing = false;
}

async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

async function signUp(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
  if (error) throw error;
  if (!data.session) return null;
  return data.user;
}

async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const mode = form.dataset.mode || 'login';
  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;
  const name = $('authName').value.trim();
  const confirm = $('authConfirm').value;
  if (!email || !password) return setAuthMessage('Please enter your email and password.', true);
  if (mode === 'signup' && password !== confirm) return setAuthMessage('Passwords do not match.', true);
  if (mode === 'signup' && password.length < 6) return setAuthMessage('Password must be at least 6 characters.', true);
  try {
    $('authSubmit').disabled = true;
    setAuthMessage(mode === 'login' ? 'Signing you in…' : 'Creating your account…');
    const user = mode === 'login' ? await signIn(email, password) : await signUp(email, password, name || 'Sudoku Player');
    if (!user) {
      setAuthMessage('Account created. Check your email to confirm your address, then sign in.');
      return;
    }
    await loadProfile(user);
    closeAuth();
    renderAccount();
    location.reload();
  } catch (error) {
    setAuthMessage(error.message || 'Authentication failed. Please try again.', true);
  } finally {
    $('authSubmit').disabled = false;
  }
}

async function initAuth() {
  $('accountButton')?.addEventListener('click', () => authState.user ? $('accountPanel')?.classList.toggle('show') : openAuth('login'));
  $('authClose')?.addEventListener('click', closeAuth);
  $('authLoginTab')?.addEventListener('click', () => switchAuthMode('login'));
  $('authSignupTab')?.addEventListener('click', () => switchAuthMode('signup'));
  $('authSwitch')?.addEventListener('click', () => switchAuthMode($('authForm').dataset.mode === 'login' ? 'signup' : 'login'));
  $('authForm')?.addEventListener('submit', handleSubmit);
  $('logoutButton')?.addEventListener('click', async () => { try { await signOut(); location.reload(); } catch (e) { setAuthMessage(e.message, true); } });
  $('accountPanelClose')?.addEventListener('click', () => $('accountPanel')?.classList.remove('show'));
  $('authOverlay')?.addEventListener('click', e => { if (e.target.id === 'authOverlay') closeAuth(); });

  const { data: { session } } = await supabase.auth.getSession();
  authState.user = session?.user || null;
  if (authState.user) {
    try { await loadProfile(authState.user); } catch (e) { console.error('Profile load failed', e); }
  }
  renderAccount();

  supabase.auth.onAuthStateChange((_event, session) => {
    authState.user = session?.user || null;
    if (!authState.user) authState.profile = null;
    renderAccount();
  });

  setInterval(syncLocalProgress, 10000);
  window.SudokuAuth = {
    supabase,
    getUser: () => authState.user,
    getProfile: () => authState.profile,
    sync: syncLocalProgress,
    open: openAuth,
    signOut
  };
}

initAuth();
