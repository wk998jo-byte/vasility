/**
 * SSC Admin Auth — loads FIRST, survives app.js failures & tab switches.
 * Single source of truth: window.sscAuth
 */
(function () {
  var AUTH_KEY = 'ssc_admin';
  var AUTH_USER_KEY = 'ssc_admin_user';
  var AUTH_TOKEN_KEY = 'ssc_admin_token';
  var AUTH_COOKIE = 'ssc_admin_session';
  var AUTH_DAYS = 30;

  var state = { loggedIn: false, user: '' };

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function storageSet(key, val) {
    try { localStorage.setItem(key, val); return true; } catch (e) { return false; }
  }

  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  function setCookie(user) {
    var maxAge = AUTH_DAYS * 24 * 60 * 60;
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = AUTH_COOKIE + '=1; path=/; max-age=' + maxAge + '; SameSite=Lax' + secure;
    document.cookie = AUTH_USER_KEY + '=' + encodeURIComponent(user || 'admin') + '; path=/; max-age=' + maxAge + '; SameSite=Lax' + secure;
  }

  function clearCookie() {
    document.cookie = AUTH_COOKIE + '=; path=/; max-age=0; SameSite=Lax';
    document.cookie = AUTH_USER_KEY + '=; path=/; max-age=0; SameSite=Lax';
  }

  function readCookieUser() {
    if (document.cookie.indexOf(AUTH_COOKIE + '=') === -1) return null;
    var match = document.cookie.match(new RegExp('(?:^|; )' + AUTH_USER_KEY + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : 'admin';
  }

  function load() {
    if (state.loggedIn) return true;

    var token = storageGet(AUTH_TOKEN_KEY);
    if (token) {
      state.loggedIn = true;
      state.user = storageGet(AUTH_USER_KEY) || 'admin';
      return true;
    }

    if (storageGet(AUTH_KEY) === 'true') {
      state.loggedIn = true;
      state.user = storageGet(AUTH_USER_KEY) || 'admin';
      return true;
    }

    try {
      if (sessionStorage.getItem(AUTH_KEY) === 'true') {
        state.loggedIn = true;
        state.user = sessionStorage.getItem(AUTH_USER_KEY) || 'admin';
        save(state.user);
        return true;
      }
    } catch (e) { /* ignore */ }

    var cookieUser = readCookieUser();
    if (cookieUser !== null) {
      state.loggedIn = true;
      state.user = cookieUser;
      save(state.user);
      return true;
    }

    return false;
  }

  function save(user, token) {
    state.loggedIn = true;
    state.user = user || 'admin';
    storageSet(AUTH_KEY, 'true');
    storageSet(AUTH_USER_KEY, state.user);
    if (token) storageSet(AUTH_TOKEN_KEY, token);
    try {
      sessionStorage.setItem(AUTH_KEY, 'true');
      sessionStorage.setItem(AUTH_USER_KEY, state.user);
    } catch (e) { /* ignore */ }
    setCookie(state.user);
  }

  function clear() {
    state.loggedIn = false;
    state.user = '';
    storageRemove(AUTH_KEY);
    storageRemove(AUTH_USER_KEY);
    storageRemove(AUTH_TOKEN_KEY);
    try {
      sessionStorage.removeItem(AUTH_KEY);
      sessionStorage.removeItem(AUTH_USER_KEY);
    } catch (e) { /* ignore */ }
    clearCookie();
  }

  function isLoggedIn() {
    if (state.loggedIn) return true;
    return load();
  }

  function getUser() {
    load();
    return state.user;
  }

  async function tryLogin(username, password) {
    try {
      var res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password }),
      });
      if (!res.ok) return false;
      var data = await res.json();
      if (!data.token) return false;
      save(username, data.token);
      return true;
    } catch (e) {
      return false;
    }
  }

  function updateLogoutUi() {
    var show = isLoggedIn();
    var desktop = document.getElementById('admin-logout');
    var mobile = document.getElementById('admin-logout-mobile');
    if (desktop) desktop.classList.toggle('hidden', !show);
    if (mobile) mobile.classList.toggle('hidden', !show);
    if (show && typeof lucide !== 'undefined') lucide.createIcons();
  }

  function bindLogout() {
    function doLogout() {
      clear();
      updateLogoutUi();
      if (typeof window.sscSwitchView === 'function') window.sscSwitchView('report');
    }
    document.getElementById('admin-logout')?.addEventListener('click', doLogout);
    document.getElementById('admin-logout-mobile')?.addEventListener('click', doLogout);
  }

  function bindLoginForm() {
    var form = document.getElementById('admin-login-form');
    if (!form || form.dataset.authBound) return;
    form.dataset.authBound = '1';

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var username = document.getElementById('admin-username');
      var password = document.getElementById('admin-password');
      var error = document.getElementById('login-error');
      var card = document.querySelector('.admin-login-card');
      var submitBtn = document.getElementById('login-submit');

      if (submitBtn) submitBtn.disabled = true;
      var ok = await tryLogin(username.value.trim(), password.value);
      if (submitBtn) submitBtn.disabled = false;

      if (ok) {
        if (error) error.classList.add('hidden');
        password.value = '';
        updateLogoutUi();
        if (typeof window.sscSwitchView === 'function') {
          window.sscSwitchView('admin');
        }
      } else {
        if (error) error.classList.remove('hidden');
        if (card) {
          card.classList.remove('login-shake');
          void card.offsetWidth;
          card.classList.add('login-shake');
        }
      }
    });

    document.getElementById('login-back')?.addEventListener('click', function () {
      if (typeof window.sscSwitchView === 'function') window.sscSwitchView('report');
    });
  }

  window.sscAuth = {
    load: load,
    save: save,
    clear: clear,
    isLoggedIn: isLoggedIn,
    getUser: getUser,
    tryLogin: tryLogin,
    updateLogoutUi: updateLogoutUi
  };

  window.isAdminLoggedIn = isLoggedIn;

  load();

  function initAuthUi() {
    bindLoginForm();
    bindLogout();
    updateLogoutUi();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthUi);
  } else {
    initAuthUi();
  }
})();
