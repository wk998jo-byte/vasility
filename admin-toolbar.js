/* Admin toolbar — click delegation (works even if app.js init partially fails) */
(function () {
  function closeToolsMenu() {
    var menu = document.getElementById('tools-menu');
    if (menu) menu.classList.add('hidden');
  }

  function handleToolbarClick(e) {
    var btn = e.target.closest('.admin-toolbar button[id], .admin-toolbar__menu-item[id]');
    if (!btn) return;

    var id = btn.id;

    if (id === 'tools-btn') {
      e.preventDefault();
      e.stopPropagation();
      var menu = document.getElementById('tools-menu');
      if (menu) menu.classList.toggle('hidden');
      return;
    }

    if (id === 'admin-logout') return; /* handled by auth.js */

    e.preventDefault();
    e.stopPropagation();
    closeToolsMenu();

    if (typeof window.__sscAdminAction === 'function') {
      window.__sscAdminAction(id, e);
    }
  }

  function handleDocumentClick(e) {
    if (e.target.closest('#tools-btn') || e.target.closest('#tools-menu')) return;
    closeToolsMenu();
  }

  function bind() {
    var toolbar = document.querySelector('.admin-toolbar');
    if (!toolbar || toolbar.dataset.toolbarBound) return;
    toolbar.dataset.toolbarBound = '1';
    toolbar.addEventListener('click', handleToolbarClick);
    document.addEventListener('click', handleDocumentClick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
