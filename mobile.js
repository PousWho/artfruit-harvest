(() => {
  const header = document.querySelector('.artfruit-header');
  const toggle = document.querySelector('.mobile-menu-toggle');
  const narrow = matchMedia('(max-width:900px)');
  function closeMenu(restoreFocus = narrow.matches && !!document.activeElement.closest('.header-nav')) {
    header.classList.remove('is-menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Открыть меню');
    if (restoreFocus) toggle.focus({preventScroll:true});
  }
  toggle.addEventListener('click', () => {
    const open = !header.classList.contains('is-menu-open');
    header.classList.toggle('is-menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  });
  document.addEventListener('pointerdown', e => { if (!header.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && header.classList.contains('is-menu-open')) closeMenu(true); });
  header.addEventListener('click', e => { if (e.target.closest('[data-view],[data-action]')) closeMenu(); });
  narrow.addEventListener('change', () => closeMenu());
  new MutationObserver(() => { if (narrow.matches) {closeMenu();window.scrollTo({top:0,behavior:'instant'});} }).observe(document.body,{attributes:true,attributeFilter:['data-current-view']});
  const backdrop = document.getElementById('modalBackdrop');
  function fitDialog() {
    const viewport = window.visualViewport;
    backdrop.style.setProperty('--dialog-height', `${viewport ? viewport.height : innerHeight}px`);
    backdrop.style.setProperty('--dialog-top', `${viewport ? viewport.offsetTop : 0}px`);
  }
  window.visualViewport?.addEventListener('resize', fitDialog);
  window.visualViewport?.addEventListener('scroll', fitDialog);
  window.addEventListener('resize', fitDialog);
  fitDialog();
  function labelScrollAreas() {
    document.querySelectorAll('.table-scroll,.chart,.replay-scroll').forEach(el => {
      if (el.querySelector('#forecastRows')) return;
      el.tabIndex = 0;
      if (!el.hasAttribute('role')) el.setAttribute('role','region');
      if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label',el.classList.contains('replay-scroll')?'Недели сезона, горизонтальная прокрутка':el.classList.contains('chart')?'График, горизонтальная прокрутка':'Таблица, горизонтальная прокрутка');
    });
  }
  labelScrollAreas();
  new MutationObserver(labelScrollAreas).observe(document.querySelector('.app'),{childList:true,subtree:true});
  new MutationObserver(labelScrollAreas).observe(document.getElementById('modalBody'),{childList:true,subtree:true});
  document.body.classList.add('mobile-ready');
})();
