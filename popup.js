// ── Fetch and display the Chrome-signed-in account email ─────────────────────
function loadChromeAccount() {
  const emailEl = document.getElementById('chromeEmail');

  // getProfileUserInfo always returns the actual Chrome profile account —
  // unlike getAuthToken which can return a cached token for a different account
  chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (info) => {
    if (chrome.runtime.lastError) {
      console.warn('[SGA] getProfileUserInfo error:', chrome.runtime.lastError.message);
      emailEl.textContent = 'Could not detect account';
      emailEl.style.color = '#aaa';
      return;
    }

    if (info?.email) {
      emailEl.textContent = info.email;
    } else {
      emailEl.textContent = 'No Google account signed into Chrome';
      emailEl.style.color = '#aaa';
    }
  });
}

// ── Groq API key — save and load ─────────────────────────────────────────────
function loadSavedKey() {
  chrome.storage.local.get(['groqApiKey'], (result) => {
    if (result.groqApiKey) {
      const input = document.getElementById('groqKeyInput');
      // Show masked version so user knows a key is already saved
      input.placeholder = '✅ Key saved — paste a new one to update';
    }
  });
}

document.getElementById('saveKeyBtn').addEventListener('click', () => {
  const input  = document.getElementById('groqKeyInput');
  const status = document.getElementById('keyStatus');
  const key    = input.value.trim();

  if (!key) {
    status.textContent = 'Please paste your Groq API key first.';
    status.className   = 'key-status error';
    return;
  }

  if (!key.startsWith('gsk_')) {
    status.textContent = 'That doesn\'t look like a Groq key (should start with gsk_).';
    status.className   = 'key-status error';
    return;
  }

  chrome.storage.local.set({ groqApiKey: key }, () => {
    if (chrome.runtime.lastError) {
      status.textContent = 'Save failed: ' + chrome.runtime.lastError.message;
      status.className   = 'key-status error';
      return;
    }
    input.value        = '';
    input.placeholder  = '✅ Key saved — paste a new one to update';
    status.textContent = '✅ API key saved successfully!';
    status.className   = 'key-status saved';
    setTimeout(() => { status.textContent = ''; }, 3000);
  });
});

// ── Setup button → open form.html as a new tab ────────────────────────────────
document.getElementById('setupBtn').addEventListener('click', () => {
  const btn = document.getElementById('setupBtn');
  btn.disabled = true;
  btn.textContent = 'Opening…';

  chrome.tabs.create({ url: chrome.runtime.getURL('form.html') }, () => {
    setTimeout(() => window.close(), 400);
  });
});

// ── Reset button → clear all stored rules ────────────────────────────────────
document.getElementById('resetBtn').addEventListener('click', () => {
  const btn = document.getElementById('resetBtn');
  btn.disabled = true;
  btn.textContent = 'Resetting…';

  chrome.storage.local.remove(
    ['userProfile', 'highlightRules', 'matchMode', 'rulesGeneratedAt', 'activeFilter'],
    () => {
      if (chrome.runtime.lastError) {
        btn.disabled = false;
        btn.textContent = '🗑 Reset Rules';
        console.error('[SGA] Reset error:', chrome.runtime.lastError);
        return;
      }
      btn.textContent = '✅ Rules Cleared';
      console.log('[SGA] All rules cleared from storage.');
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = '🗑 Reset Rules';
      }, 2000);
    }
  );
});

// ── On load ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadChromeAccount();
  loadSavedKey();
});