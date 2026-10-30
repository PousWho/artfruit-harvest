/* Native selects remain the data source; this layer only supplies their popup UI. */
(() => {
  'use strict';
  const controls = new Map();
  const nativeValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  const nativeIndex = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
  let sequence = 0, opened = null, scheduled = false, search = '', searchTime = 0;

  function labelText(select) {
    if (select.getAttribute('aria-label')) return select.getAttribute('aria-label');
    const labelled = select.getAttribute('aria-labelledby');
    if (labelled) return labelled.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
    return [...select.labels].map(label => {
      const copy = label.cloneNode(true);
      copy.querySelectorAll('select,.glass-select').forEach(node => node.remove());
      return copy.textContent.trim();
    }).join(' ') || select.title || 'Выберите значение';
  }

  function disabled(option) {
    return option.disabled || (option.parentElement?.tagName === 'OPTGROUP' && option.parentElement.disabled);
  }

  function close(returnFocus = false) {
    if (!opened) return;
    const record = opened;
    opened = null;
    record.trigger.setAttribute('aria-expanded', 'false');
    record.trigger.removeAttribute('aria-activedescendant');
    record.wrapper.classList.remove('glass-select-open');
    record.menu?.remove();
    record.menu = null;
    search = '';
    if (returnFocus && record.trigger.isConnected && !record.trigger.disabled) record.trigger.focus({ preventScroll: true });
  }

  function position(record) {
    if (!record.menu) return;
    const rect = record.trigger.getBoundingClientRect();
    if (!rect.width || !rect.height || record.trigger.closest('[inert]')) { close(); return; }
    const viewport = window.visualViewport;
    const screenWidth = viewport?.width || window.innerWidth;
    const screenHeight = viewport?.height || window.innerHeight;
    const offsetX = viewport?.offsetLeft || 0, offsetY = viewport?.offsetTop || 0;
    const width = Math.min(Math.max(rect.width, 220), screenWidth - 24);
    const below = offsetY + screenHeight - rect.bottom - 12;
    const above = rect.top - offsetY - 12;
    const upward = below < 170 && above > below;
    const room = Math.max(80, Math.min(330, upward ? above : below));
    record.menu.style.width = width + 'px';
    record.menu.style.maxHeight = room + 'px';
    record.menu.style.left = Math.max(offsetX + 12, Math.min(rect.left, offsetX + screenWidth - width - 12)) + 'px';
    const height = Math.min(record.menu.scrollHeight, room);
    record.menu.style.top = (upward ? Math.max(offsetY + 8, rect.top - height - 6) : rect.bottom + 6) + 'px';
    record.menu.dataset.side = upward ? 'above' : 'below';
  }

  function highlight(record, index, scroll = true) {
    const option = record.select.options[index];
    if (!option || disabled(option) || option.hidden) return;
    record.activeIndex = index;
    record.menu.querySelectorAll('.glass-select-option').forEach(node => node.classList.toggle('is-active', Number(node.dataset.glassIndex) === index));
    const active = record.menu.querySelector('[data-glass-index="' + index + '"]');
    if (active) {
      record.trigger.setAttribute('aria-activedescendant', active.id);
      if (scroll) {
        const menuRect = record.menu.getBoundingClientRect(), activeRect = active.getBoundingClientRect();
        if (activeRect.top < menuRect.top + 9) record.menu.scrollTop -= menuRect.top + 9 - activeRect.top;
        else if (activeRect.bottom > menuRect.bottom - 12) record.menu.scrollTop += activeRect.bottom - menuRect.bottom + 12;
      }
    }
  }

  function drawMenu(record) {
    record.menu.replaceChildren();
    let group = null;
    [...record.select.options].forEach((option, index) => {
      if (option.hidden || option.parentElement?.hidden) return;
      const optgroup = option.parentElement?.tagName === 'OPTGROUP' ? option.parentElement : null;
      if (optgroup && optgroup !== group) {
        const heading = document.createElement('div');
        heading.className = 'glass-select-group';
        heading.textContent = optgroup.label;
        heading.setAttribute('role', 'presentation');
        record.menu.append(heading);
      }
      group = optgroup;
      const row = document.createElement('div');
      row.className = 'glass-select-option';
      row.id = record.key + '-option-' + index;
      row.dataset.glassIndex = String(index);
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(option.selected));
      row.setAttribute('aria-disabled', String(disabled(option)));
      const text = document.createElement('span');
      text.textContent = option.label;
      const mark = document.createElement('span');
      mark.className = 'glass-select-check';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = option.selected ? '✓' : '';
      row.append(text, mark);
      row.addEventListener('pointermove', event => { if (event.pointerType !== 'touch' && !disabled(option)) highlight(record, index, false); });
      row.addEventListener('pointerdown', event => { if (event.pointerType !== 'touch') event.preventDefault(); });
      row.addEventListener('click', event => { event.stopPropagation(); commit(record, index); });
      record.menu.append(row);
    });
    if (!record.menu.children.length) {
      const empty = document.createElement('div');
      empty.className = 'glass-select-empty';
      empty.textContent = 'Нет доступных вариантов';
      record.menu.append(empty);
    }
    const allowed = enabledIndexes(record);
    record.activeIndex = allowed.includes(record.select.selectedIndex) ? record.select.selectedIndex : (allowed[0] ?? -1);
    if (record.activeIndex >= 0) highlight(record, record.activeIndex, false);
    else record.trigger.removeAttribute('aria-activedescendant');
  }

  function enabledIndexes(record) {
    return [...record.select.options].flatMap((option, index) => disabled(option) || option.hidden || option.parentElement?.hidden ? [] : [index]);
  }

  function open(record) {
    if (record.select.disabled || record.select.matches(':disabled')) return;
    close();
    sync(record);
    opened = record;
    const menu = document.createElement('div');
    menu.className = 'glass-select-menu';
    menu.id = record.key + '-list';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', labelText(record.select));
    record.menu = menu;
    // Keep a dialog's popup in its accessible modal subtree. Fixed positioning
    // prevents card overflow containers from cutting off ordinary popups.
    (record.select.closest('[role="dialog"]') || document.body).append(menu);
    record.trigger.setAttribute('aria-expanded', 'true');
    record.wrapper.classList.add('glass-select-open');
    drawMenu(record);
    position(record);
    if (record.activeIndex >= 0) highlight(record, record.activeIndex);
    record.trigger.focus({ preventScroll: true });
  }

  function commit(record, index) {
    const option = record.select.options[index];
    if (!record.select.isConnected || !option || disabled(option) || option.hidden) return;
    const changed = record.select.selectedIndex !== index;
    record.select.selectedIndex = index;
    close(true);
    sync(record);
    if (changed) {
      record.select.dispatchEvent(new Event('input', { bubbles: true }));
      record.select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    schedule();
  }

  function sync(record) {
    const select = record.select;
    const text = select.selectedOptions[0]?.label || 'Выберите значение';
    if (record.text.textContent !== text) record.text.textContent = text;
    const name = labelText(select);
    if (record.trigger.getAttribute('aria-label') !== name) record.trigger.setAttribute('aria-label', name);
    record.trigger.disabled = select.matches(':disabled');
    for (const name of ['aria-required', 'aria-invalid', 'aria-describedby']) {
      const value = name === 'aria-required' ? (select.required ? 'true' : null) : select.getAttribute(name);
      if (value == null) record.trigger.removeAttribute(name);
      else if (record.trigger.getAttribute(name) !== value) record.trigger.setAttribute(name, value);
    }
    record.wrapper.hidden = select.hidden;
    if (opened === record) {
      if (record.trigger.disabled || !record.trigger.getClientRects().length || select.closest('[inert]')) close();
      else { drawMenu(record); position(record); }
    }
  }

  function upgrade(select) {
    if (controls.has(select) || select.multiple || select.size > 1) return;
    const key = 'glass-' + (++sequence);
    const wrapper = document.createElement('span');
    wrapper.className = 'glass-select';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'glass-select-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', key + '-list');
    trigger.dataset.glassFor = select.id || key;
    const text = document.createElement('span');
    text.className = 'glass-select-value';
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('class', 'glass-select-arrow');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.setAttribute('viewBox', '0 0 18 18');
    arrow.setAttribute('focusable', 'false');
    const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    chevron.setAttribute('d', 'M5 7l4 4 4-4');
    arrow.append(chevron);
    trigger.append(text, arrow);
    const record = { select, wrapper, trigger, text, key, menu: null, activeIndex: -1, oldTabIndex: select.getAttribute('tabindex'), oldHidden: select.getAttribute('aria-hidden'), properties: {} };
    controls.set(select, record);
    select.before(wrapper);
    wrapper.append(select, trigger);
    select.classList.add('glass-select-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    for (const [property, descriptor] of [['value', nativeValue], ['selectedIndex', nativeIndex]]) {
      record.properties[property] = Object.getOwnPropertyDescriptor(select, property);
      Object.defineProperty(select, property, { configurable: true, get() { return descriptor.get.call(this); }, set(value) { descriptor.set.call(this, value); schedule(); } });
    }
    trigger.addEventListener('click', () => opened === record ? close() : open(record));
    select.addEventListener('change', schedule);
    select.addEventListener('input', schedule);
    sync(record);
  }

  function discard(record) {
    if (opened === record) close();
    controls.delete(record.select);
    record.select.removeEventListener('change', schedule);
    record.select.removeEventListener('input', schedule);
    record.select.classList.remove('glass-select-native');
    if (record.oldTabIndex == null) record.select.removeAttribute('tabindex'); else record.select.setAttribute('tabindex', record.oldTabIndex);
    if (record.oldHidden == null) record.select.removeAttribute('aria-hidden'); else record.select.setAttribute('aria-hidden', record.oldHidden);
    for (const [property, descriptor] of Object.entries(record.properties)) {
      if (descriptor) Object.defineProperty(record.select, property, descriptor); else delete record.select[property];
    }
    if (record.wrapper.contains(record.select)) {
      if (record.wrapper.parentNode) record.wrapper.replaceWith(record.select);
      else record.select.remove();
    } else record.wrapper.remove();
  }

  function refresh() {
    scheduled = false;
    for (const record of controls.values()) {
      if (!record.select.isConnected || !record.wrapper.contains(record.select)) discard(record);
      else sync(record);
    }
    document.querySelectorAll('select').forEach(upgrade);
  }

  function schedule() {
    if (!scheduled) { scheduled = true; queueMicrotask(refresh); }
  }

  document.addEventListener('keydown', event => {
    const trigger = event.target.closest('.glass-select-trigger');
    if (!trigger) return;
    const record = [...controls.values()].find(item => item.trigger === trigger);
    if (!record || trigger.disabled) return;
    const isOpen = opened === record;
    if (event.key === 'Escape' && isOpen) { event.preventDefault(); event.stopImmediatePropagation(); close(true); return; }
    if (event.key === 'Tab') { close(); return; }
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Enter' || event.key === ' ') { isOpen ? commit(record, record.activeIndex) : open(record); return; }
      if (!isOpen) open(record);
      const indexes = enabledIndexes(record);
      if (!indexes.length) return;
      const index = indexes.indexOf(record.activeIndex);
      const next = event.key === 'Home' ? indexes[0] : event.key === 'End' ? indexes.at(-1) : indexes[(index + (event.key === 'ArrowDown' ? 1 : -1) + indexes.length) % indexes.length];
      highlight(record, next);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      if (!isOpen) open(record);
      const now = performance.now();
      search = now - searchTime > 700 ? event.key : search + event.key;
      searchTime = now;
      const query = (/^(.)\1*$/u.test(search) ? search[0] : search).toLocaleLowerCase('ru-RU');
      const indexes = enabledIndexes(record), start = indexes.indexOf(record.activeIndex);
      const ordered = [...indexes.slice(start + 1), ...indexes.slice(0, start + 1)];
      const match = ordered.find(index => record.select.options[index].label.trim().toLocaleLowerCase('ru-RU').startsWith(query));
      if (match != null) highlight(record, match);
    }
  }, true);

  document.addEventListener('pointerdown', event => {
    if (opened && !opened.wrapper.contains(event.target) && !opened.menu.contains(event.target)) close();
  }, true);
  document.addEventListener('focusin', event => {
    if (opened && !opened.wrapper.contains(event.target) && !opened.menu.contains(event.target)) close();
  });
  document.addEventListener('click', event => {
    const label = event.target.closest('label');
    if (!label || event.target.closest('button,input,a')) return;
    const select = label.control?.tagName === 'SELECT' ? label.control : label.querySelector('select');
    const record = controls.get(select);
    if (record) { event.preventDefault(); record.trigger.focus(); }
  });
  document.addEventListener('reset', () => setTimeout(schedule, 0));
  window.addEventListener('resize', () => opened && position(opened));
  window.visualViewport?.addEventListener('resize', () => opened && position(opened));
  document.addEventListener('scroll', event => {
    if (opened && !opened.menu.contains(event.target)) close();
  }, true);
  // Value assignments do not emit mutations; the instance setters above cover
  // those. This observer handles rebuilt options, imports, modals and removals.
  new MutationObserver(records => {
    if (records.some(record => {
      if (record.target instanceof Element && record.target.closest('select')) return true;
      if (record.type === 'attributes') return record.target.matches?.('fieldset,[inert]') || record.attributeName === 'inert';
      return [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && (node.matches('select') || node.querySelector('select')));
    })) schedule();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected', 'hidden', 'label', 'value', 'required', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-invalid', 'inert'] });
  refresh();
})();
