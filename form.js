// ── UI helpers ────────────────────────────────────────────────────────────────

function setLoading(isLoading) {
  const btn     = document.getElementById('submitBtn');
  const spinner = document.getElementById('spinner');
  const btnText = document.getElementById('btnText');

  if (!btn || !spinner || !btnText) return;

  btn.disabled          = isLoading;
  spinner.style.display = isLoading ? 'inline-block' : 'none';
  btnText.textContent   = isLoading
    ? 'AI is generating your rules…'
    : '✨ Generate My Highlighting Rules';
}

function setStatus(message, type = '') {
  const el = document.getElementById('statusMsg');
  if (!el) return;
  el.textContent = message;
  el.className   = type;  // '' = green (success) | 'info' = grey | 'error' = red
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(profile) {
  return `You are an email-prioritisation assistant for a Chrome extension that highlights Gmail emails.

A user has told you about themselves. Your job is to return a JSON object with personalised email-highlighting rules the extension will use to colour their inbox.

## User Profile
- Name: ${profile.name}
- Age: ${profile.age || 'not specified'}
- Gender: ${profile.gender || 'not specified'}
- Profession: ${profile.profession}
- Important senders / domains entered by user: ${profile.importantSenders || 'not specified'}
- What they care about (their own words): "${profile.message}"

## Output Format
Return ONLY a valid JSON object — absolutely no markdown, no explanation, no code fences, no text before or after.

{
  "rules": [
    {
      "priority": "HIGH",
      "color": "#fff0f0",
      "borderColor": "#e74c3c",
      "senderKeywords": ["sender@example.com", "@domain.com"],
      "subjectKeywords": ["keyword1", "keyword2"],
      "bodyKeywords": ["phrase1", "phrase2"],
      "reason": "One sentence shown to user explaining why this is highlighted"
    }
  ],
  "matchMode": "any"
}

## Priority Color Guide
- HIGH   → color: "#fff0f0",  borderColor: "#e74c3c"   (red  — urgent, deadlines, payments)
- MEDIUM → color: "#fffbe6",  borderColor: "#f39c12"   (amber — opportunities, events, meetings)
- LOW    → color: "#f0fff4",  borderColor: "#27ae60"   (green — general info, newsletters)

## Instructions
1. Generate 5–8 rules total, mixing HIGH / MEDIUM / LOW priorities.
2. Tailor all keywords to the user's specific profession and free-text message.
3. If the user listed specific senders/domains, include them as senderKeywords in a HIGH rule.
4. Each rule must have at least 2 keywords in at least one keyword array.
5. All keyword strings must be lowercase.
6. Return ONLY the raw JSON. Nothing else.`;
}

// ── Groq API call ─────────────────────────────────────────────────────────────

async function generateRulesWithAI(profile, groqApiKey) {
  // Groq — free tier, very fast, no billing required
  // Model: llama-3.3-70b-versatile (best quality on Groq free tier)
  const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

  let response;

  try {
    response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + groqApiKey
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.4,
        max_tokens: 1200,
        messages: [
          {
            role: 'system',
            content: 'You are an email-prioritisation assistant. Always respond with valid raw JSON only — no markdown, no code fences, no explanation.'
          },
          {
            role: 'user',
            content: buildPrompt(profile)
          }
        ]
      })
    });
  } catch (networkErr) {
    throw new Error('Network error — check your internet connection. (' + networkErr.message + ')');
  }

  if (!response.ok) {
    let errMsg = `Groq API returned status ${response.status}`;
    try {
      const errBody = await response.json();
      // Groq uses OpenAI-compatible error shape: { error: { message: "..." } }
      errMsg = errBody?.error?.message || errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }

  const data = await response.json();

  // Groq / OpenAI-compatible response shape:
  // data.choices[0].message.content
  const rawText = data?.choices?.[0]?.message?.content || '';

  if (!rawText) throw new Error('Groq returned an empty response. Please try again.');

  // Strip any accidental markdown fences just in case
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    console.error('[SGA] Raw Groq response:', rawText);
    throw new Error('Groq response was not valid JSON. Please try again.');
  }

  if (!Array.isArray(parsed.rules) || parsed.rules.length === 0) {
    throw new Error('Groq returned rules in unexpected format. Please try again.');
  }

  return parsed;
}

// ── Save to chrome.storage using CALLBACK (most reliable in MV3) ──────────────

function saveToStorage(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        reject(new Error('Storage error: ' + chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

// ── Open Gmail in the current tab ─────────────────────────────────────────────
// Since form.html runs as a full tab, we can just navigate it to Gmail.
// content.js is already injected there and will auto-read rules from storage.

function openGmail() {
  // Replace current tab (form.html) with Gmail inbox
  window.location.href = 'https://mail.google.com/mail/u/0/#inbox';
}

// ── Form submit ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  const form = document.getElementById('userForm');

  if (!form) {
    console.error('[SGA] userForm not found in DOM');
    return;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();   // ← prevents page reload / form clear

    // Collect all field values
    const profile = {
      name:             (document.getElementById('name')?.value             || '').trim(),
      age:              (document.getElementById('age')?.value              || '').trim(),
      gender:           (document.getElementById('gender')?.value           || ''),
      profession:       (document.getElementById('profession')?.value       || ''),
      importantSenders: (document.getElementById('importantSenders')?.value || '').trim(),
      message:          (document.getElementById('message')?.value          || '').trim()
    };

    // Basic validation
    if (!profile.name) {
      setStatus('Please enter your name.', 'error');
      return;
    }
    if (!profile.message && !profile.importantSenders) {
      setStatus('Please describe what emails you care about, or enter some senders.', 'error');
      return;
    }

    // ── Step 1: Show loading ──
    setLoading(true);
    setStatus('Checking your API key…', 'info');

    // Read Groq key from storage before anything else
    let groqApiKey;
    try {
      groqApiKey = await new Promise((resolve, reject) => {
        chrome.storage.local.get(['groqApiKey'], (result) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          resolve(result.groqApiKey || null);
        });
      });
    } catch (err) {
      setLoading(false);
      setStatus('❌ Could not read API key from storage. Please try again.', 'error');
      return;
    }

    if (!groqApiKey) {
      setLoading(false);
      setStatus('❌ No Groq API key found. Please open the extension popup and save your key first.', 'error');
      return;
    }

    try {

      // ── Step 2: Call Groq API ──
      setStatus('Groq is analysing your profile and generating rules…', 'info');
      const aiResult = await generateRulesWithAI(profile, groqApiKey);
      console.log('[SGA] AI rules generated:', aiResult);

      // ── Step 3: Save rules to chrome.storage.local ──
      setStatus('Saving your personalised rules…', 'info');
      await saveToStorage({
        userProfile:      profile,
        highlightRules:   aiResult.rules,
        matchMode:        aiResult.matchMode || 'any',
        rulesGeneratedAt: Date.now()
      });

      // ── Step 4: Success → go to Gmail ──
      setLoading(false);
      setStatus('✅ Done! ' + aiResult.rules.length + ' rules created. Opening your Gmail…');

      // Short pause so user sees the success message, then navigate to Gmail
      setTimeout(openGmail, 1500);

    } catch (err) {
      setLoading(false);
      console.error('[SGA] Error during rule generation:', err);
      setStatus('❌ ' + err.message, 'error');
      // DO NOT clear the form — user can fix and retry
    }
  });

});