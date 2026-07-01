/* Navigation — uses window.sscAuth for admin gate */
(function () {
  function highlight(view) {
    document.querySelectorAll('.nav-btn[data-view]').forEach(function (btn) {
      btn.classList.toggle('nav-active', btn.dataset.view === view);
    });
  }

  function adminIsLoggedIn() {
    if (window.sscAuth && window.sscAuth.isLoggedIn()) return true;
    return false;
  }

  function switchViewBasic(view) {
    if (!view) return;

    if (view === 'admin' && !adminIsLoggedIn()) {
      document.querySelectorAll('.view').forEach(function (v) { v.classList.add('hidden'); });
      var login = document.getElementById('view-admin-login');
      if (login) login.classList.remove('hidden');
      highlight('admin');
      window.scrollTo(0, 0);
      return;
    }

    document.querySelectorAll('.view').forEach(function (v) { v.classList.add('hidden'); });
    var target = document.getElementById('view-' + view);
    if (target) {
      target.classList.remove('hidden');
      target.style.display = '';
    }
    highlight(view);
    try { localStorage.setItem('ssc_last_view', view); } catch (e) { /* ignore */ }
    window.scrollTo(0, 0);
  }

  function go(view) {
    if (typeof window.__sscNavReady === 'function') {
      window.__sscNavReady(view);
    } else {
      switchViewBasic(view);
    }
  }

  window.sscSwitchView = go;

  function onNavTap(e) {
    var btn = e.currentTarget;
    var view = btn.getAttribute('data-view');
    if (!view) return;
    e.preventDefault();
    e.stopPropagation();
    go(view);
  }

  function bindNav() {
    document.querySelectorAll('.nav-btn[data-view]').forEach(function (btn) {
      if (btn.dataset.navBound) return;
      btn.dataset.navBound = '1';
      btn.addEventListener('click', onNavTap);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindNav);
  } else {
    bindNav();
  }
})();
