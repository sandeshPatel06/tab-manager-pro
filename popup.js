const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', () => {
  const els = {
    tabCount: document.getElementById('tab-count'),
    status: document.getElementById('status'),
    btnOpenSettings: document.getElementById('btn-open-settings'),
    btnGroup: document.getElementById('btn-group'),
    btnRemove: document.getElementById('btn-remove'),
    btnZen: document.getElementById('btn-zen'),
    btnUndo: document.getElementById('btn-undo'),
    btnSort: document.getElementById('btn-sort'),
    openTabsList: document.getElementById('open-tabs-list'),
    tabSearch: document.getElementById('tab-search'),
  };

  let currentWindowId = null;
  let cachedSettings = { scope: 'currentWindow' };

  /**
   * Initializes the popup by fetching initial state from the background worker.
   */
  async function init() {
    const win = await browserAPI.windows.getCurrent({ populate: false });
    currentWindowId = win?.id;

    const initData = await sendMessage({ action: 'initPopup' });
    if (initData.success) {
      cachedSettings = initData.settings || {};
      updateUndoButton(initData.undoDepth || 0);
      loadTabs();
    } else {
      showStatus(initData.error || 'Could not load tabs', 'error');
    }
  }

  /**
   * Updates the Undo button UI state based on the current undo stack depth.
   * @param {number} depth - The number of actions available to undo.
   */
  function updateUndoButton(depth) {
    if (!els.btnUndo) return;
    const span = els.btnUndo.querySelector('span');
    if (span) span.textContent = depth > 0 ? `Undo (${depth})` : 'Undo';
    els.btnUndo.disabled = depth === 0;
  }

  /**
   * Displays a temporary status toast message to the user.
   * @param {string} msg - The message to display.
   * @param {string} tone - 'success' or 'error'.
   */
  function showStatus(msg, tone = 'success') {
    els.status.textContent = msg;
    els.status.className = `status ${tone} show`;
    setTimeout(() => els.status.classList.remove('show'), 3000);
  }

  async function sendMessage(msg) {
    try {
      return await browserAPI.runtime.sendMessage(msg);
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  // Bind Events
  els.btnOpenSettings.addEventListener('click', () => {
    browserAPI.runtime.openOptionsPage();
  });

  els.btnGroup.addEventListener('click', async () => {
    const result = await sendMessage({ 
      action: 'groupTabs', 
      scope: cachedSettings.scope, 
      currentWindowId 
    });
    if (result.success) {
      showStatus(result.groupsCreated > 0 ? `${result.groupsCreated} Groups created` : 'No groups created');
    }
  });

  els.btnRemove.addEventListener('click', async () => {
    const result = await sendMessage({ 
      action: 'removeDuplicates', 
      scope: cachedSettings.scope, 
      currentWindowId 
    });
    if (result.success) {
      showStatus(result.removed > 0 ? `${result.removed} Duplicates removed` : 'No duplicates found');
      updateUndoButton(result.undoDepth || 0);
      loadTabs();
    }
  });

  if (els.btnZen) {
    els.btnZen.addEventListener('click', async () => {
      const result = await sendMessage({ action: 'zenMode' });
      if (result.success) {
        showStatus(`${result.stashedCount} tabs stashed in Zen Mode.`);
        loadTabs();
      } else {
        showStatus(result.error || 'No background tabs to stash.', 'error');
      }
    });
  }

  els.btnUndo.addEventListener('click', async () => {
    const result = await sendMessage({ action: 'undoLastRemoval' });
    if (result.success) {
      showStatus(`${result.restored} Tab(s) restored`);
      updateUndoButton(result.undoDepth || 0);
      loadTabs();
    }
  });

  els.btnSort.addEventListener('click', async () => {
    const sortBy = cachedSettings.defaultSortMode || 'domain';
    const result = await sendMessage({
      action: 'sortTabs',
      sortBy,
      sortDirection: sortBy === 'recent' ? 'desc' : 'asc',
      scope: cachedSettings.scope,
      currentWindowId
    });
    if (result.success) {
      showStatus(`Tabs sorted`);
      loadTabs();
    }
  });

  /**
   * Core function to load, search, and render tabs efficiently.
   * Includes debouncing logic for the search input to save CPU cycles.
   */
  let searchTimeout;
  async function loadTabs() {
    const sortBy = cachedSettings.defaultSortMode || 'domain';
    const openResult = await sendMessage({
      action: 'searchTabs',
      query: '',
      sortBy,
      sortDirection: sortBy === 'recent' ? 'desc' : 'asc',
      scope: cachedSettings.scope,
      currentWindowId
    });

    if (!openResult.success) {
      showStatus(openResult.error || 'Could not load tabs', 'error');
      return;
    }

    const total = Number.isFinite(openResult.total)
      ? openResult.total
      : (openResult.results || []).length;
    els.tabCount.textContent = `${total} Tab${total === 1 ? '' : 's'}`;
    renderTabList(els.openTabsList, openResult.results || []);

    // Filter locally: the background already returned the matching scope.
    els.tabSearch.oninput = (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const query = e.target.value.toLowerCase();
        const filtered = openResult.results.filter(t =>
          (t.title || '').toLowerCase().includes(query) ||
          (t.url || '').toLowerCase().includes(query)
        );
        renderTabList(els.openTabsList, filtered);
      }, 250);
    };
  }

  // Event Delegation for maximum performance (O(1) memory instead of O(N) closures)
  els.openTabsList.addEventListener('click', async (e) => {
    const row = e.target.closest('.result-item');
    if (!row) return;

    const tabId = parseInt(row.dataset.tabId, 10);
    const windowId = parseInt(row.dataset.windowId, 10);

    if (e.target.closest('.close-btn')) {
      e.stopPropagation();
      const result = await sendMessage({ action: 'closeTab', tabId });
      if (result.success) {
        loadTabs();
      } else {
        showStatus(result.error || 'Could not close tab', 'error');
      }
      return;
    }

    if (e.target.closest('.snooze-btn')) {
      e.stopPropagation();
      const value = Number(cachedSettings.defaultSnoozeValue) || 60;
      const unit = cachedSettings.defaultSnoozeUnit === 'hours' ? 'hours' : 'minutes';
      const durationMinutes = unit === 'hours' ? value * 60 : value;
      const result = await sendMessage({ action: 'snoozeTab', tabId, durationMinutes });

      if (result.success) {
        showStatus(`Tab snoozed for ${value} ${unit}`);
        loadTabs();
      } else {
        showStatus(result.error || 'Could not snooze tab', 'error');
      }
      return;
    }

    browserAPI.runtime.sendMessage({ action: 'focusTab', tabId, windowId });
    window.close();
  });

  // Handle broken favicons without violating MV3 CSP (no inline onerror)
  els.openTabsList.addEventListener('error', (e) => {
    if (e.target && e.target.tagName === 'IMG') {
      e.target.src = 'icons/icon16.png';
    }
  }, true); // true for capture phase, as error events do not bubble

  /**
   * Renders tab lists efficiently using DocumentFragment to prevent DOM layout thrashing.
   */
  function renderTabList(container, tabs) {
    container.innerHTML = '';

    if (!tabs.length) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'result-item';
      emptyMsg.style.justifyContent = 'center';
      emptyMsg.style.color = 'var(--muted)';
      emptyMsg.style.fontSize = '12px';
      emptyMsg.textContent = 'No open tabs';
      container.appendChild(emptyMsg);
      return;
    }

    const fragment = document.createDocumentFragment();

    tabs.forEach(tab => {
      const row = document.createElement('div');
      row.className = `result-item ${tab.audible ? 'audible' : ''}`;
      row.dataset.tabId = tab.id;
      row.dataset.windowId = tab.windowId;
      
      const faviconUrl = tab.favIconUrl || 'icons/icon16.png';
      
      // Static structure for the row
      row.innerHTML = `
        <div class="row" style="gap: 12px; flex: 1; min-width: 0;">
          <img class="favicon" alt="">
          <div class="result-content">
            <div class="result-title-row">
              <span class="result-title"></span>
              <div class="indicator-row"></div>
            </div>
            <span class="result-url"></span>
          </div>
        </div>
        <div class="row btn-container" style="gap: 4px;"></div>
      `;
      
      // Safely set attributes and text
      const img = row.querySelector('.favicon');
      img.src = faviconUrl;

      row.querySelector('.result-title').textContent = tab.title || 'Untitled';
      row.querySelector('.result-url').textContent = tab.url || '';

      // Add indicators manually
      const indicators = row.querySelector('.indicator-row');
      if (tab.audible) {
        indicators.innerHTML += '<svg class="tag-icon warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
      }
      if (tab.discarded) {
        indicators.innerHTML += '<svg class="tag-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
      }

      const btnContainer = row.querySelector('.btn-container');
      btnContainer.innerHTML = '<button class="mini-btn snooze-btn" title="Snooze Tab"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></button><button class="mini-btn focus-btn" title="Focus Tab"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg></button><button class="mini-btn close-btn" title="Close Tab"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>';
      
      fragment.appendChild(row);
    });
    
    container.appendChild(fragment);
  }

  init();
});
