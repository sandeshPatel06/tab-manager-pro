/**
 * Universal browser API wrapper for cross-browser compatibility.
 * Prefers native `browser` namespace (Firefox) over `chrome` (Chrome/Edge).
 */
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', () => {
  const els = {
    saveBtn: document.getElementById('save'),
    status: document.getElementById('status'),
    workspaceList: document.getElementById('workspace-list'),
    workspaceName: document.getElementById('workspace-name'),
    btnSaveWorkspace: document.getElementById('btn-save-workspace'),
    btnRestoreWorkspace: document.getElementById('btn-restore-workspace'),
    btnDeleteWorkspace: document.getElementById('btn-delete-workspace'),
    btnExportWorkspaces: document.getElementById('btn-export-workspaces'),
    btnImportWorkspaces: document.getElementById('btn-import-workspaces'),
    importFile: document.getElementById('import-workspaces-file'),
    btnCollapseGroups: document.getElementById('btn-collapse-groups'),
    btnExpandGroups: document.getElementById('btn-expand-groups')
  };

  // Init
  async function init() {
    await loadSettings();
    const { workspaces } = await sendMessage({ action: 'listWorkspaces' });
    renderWorkspaces(workspaces || []);
  }

  // Load
  async function loadSettings() {
    const result = await sendMessage({ action: 'getSettings' });
    if (!result.success) return;

    const s = result.settings;
    document.getElementById('default-sort-mode').value = s.defaultSortMode || 'domain';
    document.getElementById('default-snooze-value').value = s.defaultSnoozeValue || 60;
    document.getElementById('default-snooze-unit').value = s.defaultSnoozeUnit || 'minutes';
    document.getElementById('scope').value = s.scope || 'currentWindow';
    document.getElementById('duplicate-mode').value = s.duplicateMatchMode || 'exact';
    document.getElementById('keep-rule').value = s.smartKeepRule || 'active';
    document.getElementById('group-preset').value = s.groupPreset || 'domain';
    
    document.getElementById('exclude-pinned').checked = !!s.excludePinned;
    document.getElementById('exclude-muted').checked = !!s.excludeMuted;
    document.getElementById('exclude-audible').checked = !!s.excludeAudible;
    document.getElementById('excluded-domains').value = s.excludedDomains || '';
    
    document.getElementById('auto-cleanup').checked = !!s.autoCleanup;
    document.getElementById('auto-cleanup-interval').value = s.autoCleanupIntervalMin || 30;
    document.getElementById('auto-discard').checked = !!s.autoDiscard;
    document.getElementById('auto-discard-threshold').value = s.autoDiscardThresholdMin || 60;
    document.getElementById('auto-backup').checked = !!s.autoBackup;
    
    document.getElementById('custom-group-rules').value = s.customGroupRules || '';
  }

  // Save
  async function saveSettings() {
    const settings = {
      defaultSortMode: document.getElementById('default-sort-mode').value,
      defaultSnoozeValue: parseInt(document.getElementById('default-snooze-value').value),
      defaultSnoozeUnit: document.getElementById('default-snooze-unit').value,
      scope: document.getElementById('scope').value,
      duplicateMatchMode: document.getElementById('duplicate-mode').value,
      smartKeepRule: document.getElementById('keep-rule').value,
      groupPreset: document.getElementById('group-preset').value,
      
      excludePinned: document.getElementById('exclude-pinned').checked,
      excludeMuted: document.getElementById('exclude-muted').checked,
      excludeAudible: document.getElementById('exclude-audible').checked,
      excludedDomains: document.getElementById('excluded-domains').value,
      
      autoCleanup: document.getElementById('auto-cleanup').checked,
      autoCleanupIntervalMin: parseInt(document.getElementById('auto-cleanup-interval').value),
      autoDiscard: document.getElementById('auto-discard').checked,
      autoDiscardThresholdMin: parseInt(document.getElementById('auto-discard-threshold').value),
      autoBackup: document.getElementById('auto-backup').checked,

      customGroupRules: document.getElementById('custom-group-rules').value
    };

    const result = await sendMessage({ action: 'updateSettings', settings });
    showStatus(
      result.success
        ? 'Settings Applied Successfully'
        : result.error || 'Could not save settings'
    );
  }

  // Workspaces
  function renderWorkspaces(workspaces) {
    els.workspaceList.innerHTML = '';
    if (!workspaces.length) {
      els.workspaceList.innerHTML = '<option value="">No workspaces found</option>';
      return;
    }
    workspaces.forEach(ws => {
      const opt = document.createElement('option');
      opt.value = ws.id;
      opt.textContent = `${ws.name} (${ws.tabs.length} tabs)`;
      els.workspaceList.appendChild(opt);
    });
  }

  function showStatus(msg) {
    els.status.textContent = msg;
    els.status.classList.add('show');
    setTimeout(() => els.status.classList.remove('show'), 3000);
  }

  async function sendMessage(msg) {
    try {
      return await browserAPI.runtime.sendMessage(msg);
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  // Events
  els.saveBtn.addEventListener('click', saveSettings);
  
  els.btnSaveWorkspace.addEventListener('click', async () => {
    const name = els.workspaceName.value.trim();
    if (!name) return;
    const result = await sendMessage({ action: 'saveWorkspace', name, scope: document.getElementById('scope').value });
    if (result.success) {
      els.workspaceName.value = '';
      renderWorkspaces(result.workspaces);
      showStatus('Workspace Saved');
    }
  });

  els.btnRestoreWorkspace.addEventListener('click', async () => {
    const id = els.workspaceList.value;
    if (!id) return;
    const result = await sendMessage({ action: 'restoreWorkspace', id });
    if (result.success) showStatus(`Restored ${result.restored} Tabs`);
  });

  els.btnDeleteWorkspace.addEventListener('click', async () => {
    const id = els.workspaceList.value;
    if (!id) return;
    const result = await sendMessage({ action: 'deleteWorkspace', id });
    if (result.success) {
      renderWorkspaces(result.workspaces);
      showStatus('Workspace Deleted');
    }
  });

  els.btnExportWorkspaces.addEventListener('click', async () => {
    const result = await sendMessage({ action: 'exportWorkspaces' });
    if (!result.success) {
      showStatus(result.error || 'Could not export workspaces');
      return;
    }

    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tab-manager-workspaces-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showStatus('Workspaces exported');
  });

  els.btnImportWorkspaces.addEventListener('click', () => {
    els.importFile.click();
  });

  els.importFile.addEventListener('change', async () => {
    const file = els.importFile.files?.[0];
    if (!file) return;

    const result = await sendMessage({
      action: 'importWorkspaces',
      payload: await file.text()
    });
    els.importFile.value = '';

    if (result.success) {
      renderWorkspaces(result.workspaces);
      showStatus(`Imported ${result.imported} workspace${result.imported === 1 ? '' : 's'}`);
    } else {
      showStatus(result.error || 'Could not import workspaces');
    }
  });

  function updateGroupCollapse(collapsed) {
    return async () => {
      const result = await sendMessage({
        action: collapsed ? 'collapseGroups' : 'expandGroups',
        scope: document.getElementById('scope').value
      });

      showStatus(
        result.success
          ? `${collapsed ? 'Collapsed' : 'Expanded'} ${result.updated} group${result.updated === 1 ? '' : 's'}`
          : result.error || 'Could not update groups'
      );
    };
  }

  els.btnCollapseGroups.addEventListener('click', updateGroupCollapse(true));
  els.btnExpandGroups.addEventListener('click', updateGroupCollapse(false));

  // Sidebar Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const sectionId = item.getAttribute('data-section');
      
      // Update sidebar
      document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // Update sections
      document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
      document.getElementById(`section-${sectionId}`).classList.add('active');
    });
  });

  init();
});
