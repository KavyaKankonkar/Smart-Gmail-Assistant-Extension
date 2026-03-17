'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

const PRIORITY_DEFAULTS = {
  HIGH:   { color: '#fff0f0', borderColor: '#e74c3c' },
  MEDIUM: { color: '#fffbe6', borderColor: '#f39c12' },
  LOW:    { color: '#f0fff4', borderColor: '#27ae60' }
};

const PRIORITY_LABELS = {
  HIGH:   { emoji: '🔴', label: 'HIGH',   color: '#e74c3c' },
  MEDIUM: { emoji: '🟡', label: 'MEDIUM', color: '#f39c12' },
  LOW:    { emoji: '🟢', label: 'LOW',    color: '#27ae60' }
};

// Active priority filter — null means "show all"
let activePriorityFilter = null;

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — EMAIL DATA EXTRACTION
// ══════════════════════════════════════════════════════════════════════════════

function extractEmailData(row) {
  const senderEl  = row.querySelector('.yW span[email]') || row.querySelector('.yW');
  const subjectEl = row.querySelector('.y6 span:not(.y2)') || row.querySelector('.bog');
  const snippetEl = row.querySelector('.y2');

  const subjectRaw = subjectEl?.innerText?.trim() || '';
  const bodyRaw    = snippetEl?.innerText?.trim()  || '';

  return {
    senderEmail: (senderEl?.getAttribute('email') || '').toLowerCase(),
    senderName:  (senderEl?.innerText || '').trim(),
    subject:     subjectRaw.toLowerCase(),
    subjectRaw,
    body:        bodyRaw.toLowerCase(),
    bodyRaw
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — RULE MATCHING
// ══════════════════════════════════════════════════════════════════════════════

function ruleMatches(emailData, rule) {
  const checks = [];

  if (rule.senderKeywords?.length) {
    checks.push(rule.senderKeywords.some(kw => {
      const k = kw.toLowerCase();
      return k.startsWith('@')
        ? emailData.senderEmail.endsWith(k)
        : emailData.senderEmail.includes(k) || emailData.senderName.toLowerCase().includes(k);
    }));
  }

  if (rule.subjectKeywords?.length) {
    checks.push(rule.subjectKeywords.some(kw => emailData.subject.includes(kw.toLowerCase())));
  }

  if (rule.bodyKeywords?.length) {
    checks.push(rule.bodyKeywords.some(kw => emailData.body.includes(kw.toLowerCase())));
  }

  if (!checks.length) return false;
  return checks.some(Boolean);
}

function getBestMatchingRule(emailData, rules) {
  for (const priority of ['HIGH', 'MEDIUM', 'LOW']) {
    const match = rules.find(r => r.priority === priority && ruleMatches(emailData, r));
    if (match) return match;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — SMART DATE EXTRACTOR
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Scans subject + body text for a date mention.
 * Returns { date: Date, label: string } — label is the human-readable found date.
 * Falls back to tomorrow if nothing is found.
 */
function extractDateFromText(text) {
  const now = new Date();

  // "today" / "tomorrow"
  const todayTomorrow = text.match(/\b(today|tomorrow)\b/i);
  if (todayTomorrow) {
    const d = new Date(now);
    if (todayTomorrow[1].toLowerCase() === 'tomorrow') d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return { date: d, label: todayTomorrow[1] };
  }

  // "in 3 days" / "in 2 weeks"
  const relative = text.match(/\bin\s+(\d+)\s+(day|days|week|weeks)\b/i);
  if (relative) {
    const d      = new Date(now);
    const amount = parseInt(relative[1]);
    const unit   = relative[2].toLowerCase();
    d.setDate(d.getDate() + (unit.startsWith('week') ? amount * 7 : amount));
    d.setHours(9, 0, 0, 0);
    return { date: d, label: `in ${relative[1]} ${relative[2]}` };
  }

  // DD/MM/YYYY or MM/DD/YYYY or YYYY-MM-DD
  const numDate = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (numDate) {
    const parsed = new Date(numDate[0]);
    if (!isNaN(parsed.getTime())) {
      parsed.setHours(9, 0, 0, 0);
      return { date: parsed, label: numDate[0] };
    }
  }

  // "Jan 15", "15 Jan", "January 15", "15 January"
  const months = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const monthDay = text.match(
    new RegExp(`(\\d{1,2})\\s+(${months})|(${months})\\s+(\\d{1,2})`, 'i')
  );
  if (monthDay) {
    const raw    = monthDay[0];
    const parsed = new Date(`${raw} ${now.getFullYear()}`);
    if (!isNaN(parsed.getTime())) {
      // If the date is already in the past this year, assume next year
      if (parsed < now) parsed.setFullYear(now.getFullYear() + 1);
      parsed.setHours(9, 0, 0, 0);
      return { date: parsed, label: raw };
    }
  }

  // Default: tomorrow at 9am
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return { date: tomorrow, label: 'tomorrow (default)' };
}

/** Format Date → Google Calendar URL date string: YYYYMMDDTHHmmSS */
function toGCalDate(date) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth()+1)}${p(date.getDate())}` +
         `T${p(date.getHours())}${p(date.getMinutes())}00`;
}

/** Build a Google Calendar "new event" URL — no API key needed */
function buildCalendarUrl(subject, startDate) {
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // +1 hour
  const url     = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text',   subject || 'Email Reminder');
  url.searchParams.set('dates',  `${toGCalDate(startDate)}/${toGCalDate(endDate)}`);
  url.searchParams.set('sf',     'true');
  url.searchParams.set('output', 'xml');
  return url.toString();
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — HIGHLIGHT + FILTER
// ══════════════════════════════════════════════════════════════════════════════

function applyHighlight(row, rule) {
  const def = PRIORITY_DEFAULTS[rule.priority] || PRIORITY_DEFAULTS.LOW;
  row.style.backgroundColor = rule.color       || def.color;
  row.style.borderLeft      = `4px solid ${rule.borderColor || def.borderColor}`;
  row.style.transition      = 'background-color 0.3s, border-left 0.3s';
  row.setAttribute('data-sga-priority',    rule.priority);
  row.setAttribute('data-sga-reason',      rule.reason || '');
  row.setAttribute('data-sga-highlighted', 'true');
}

function removeHighlight(row) {
  row.style.backgroundColor = '';
  row.style.borderLeft      = '';
  row.removeAttribute('data-sga-priority');
  row.removeAttribute('data-sga-reason');
  row.removeAttribute('data-sga-highlighted');
}

function applyFilter() {
  let matchCount = 0;

  document.querySelectorAll('tr.zA').forEach(row => {
    const p = row.getAttribute('data-sga-priority');
    if (!activePriorityFilter) {
      row.style.display = '';
    } else {
      const visible = (p === activePriorityFilter);
      row.style.display = visible ? '' : 'none';
      if (visible) matchCount++;
    }
  });

  // Remove any existing empty-state message
  document.getElementById('sga-empty-msg')?.remove();

  // Show empty state message if a filter is active but no emails matched
  if (activePriorityFilter && matchCount === 0) {
    const emojis  = { HIGH: '🔴', MEDIUM: '🟡', LOW: '🟢' };
    const emoji   = emojis[activePriorityFilter] || '';
    const msg     = document.createElement('div');
    msg.id        = 'sga-empty-msg';
    msg.textContent = `${emoji} No ${activePriorityFilter.toLowerCase()} priority emails in your inbox.`;
    Object.assign(msg.style, {
      position:   'fixed',
      top:        '50%',
      left:       '50%',
      transform:  'translate(-50%, -50%)',
      background: '#1a1a24',
      color:      '#aaa',
      fontSize:   '14px',
      fontFamily: 'Google Sans, Arial, sans-serif',
      padding:    '18px 28px',
      borderRadius: '10px',
      border:     '1px solid #2a2a38',
      boxShadow:  '0 4px 20px rgba(0,0,0,0.3)',
      zIndex:     '999997',
      pointerEvents: 'none'
    });
    document.body.appendChild(msg);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — CALENDAR MODAL
// Shows a checklist of all highlighted emails with extracted dates.
// User selects which to add → opens one Google Calendar tab per selection.
// ══════════════════════════════════════════════════════════════════════════════

function openCalendarModal() {
  // Remove any existing modal
  document.getElementById('sga-cal-modal')?.remove();

  // ── Collect all currently highlighted rows ────────────────────────────────
  const highlightedRows = [...document.querySelectorAll('tr.zA[data-sga-highlighted]')];

  if (highlightedRows.length === 0) {
    showToast('No highlighted emails found. Run the highlighter first.');
    return;
  }

  // Build email data list with extracted dates
  const emails = highlightedRows.map(row => {
    const data     = extractEmailData(row);
    const priority = row.getAttribute('data-sga-priority') || 'LOW';
    const combined = data.subjectRaw + ' ' + data.bodyRaw;
    const { date, label } = extractDateFromText(combined);
    return { data, priority, date, dateLabel: label };
  });

  // ── Build modal overlay ───────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'sga-cal-modal';
  Object.assign(overlay.style, {
    position:       'fixed',
    inset:          '0',
    background:     'rgba(0,0,0,0.55)',
    zIndex:         '999999',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    fontFamily:     'Google Sans, Arial, sans-serif'
  });

  // Close on backdrop click
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });

  // ── Modal card ────────────────────────────────────────────────────────────
  const modal = document.createElement('div');
  Object.assign(modal.style, {
    background:   '#1a1a24',
    border:       '1px solid #2a2a38',
    borderRadius: '14px',
    padding:      '0',
    width:        '580px',
    maxWidth:     '95vw',
    maxHeight:    '80vh',
    display:      'flex',
    flexDirection:'column',
    boxShadow:    '0 20px 60px rgba(0,0,0,0.6)',
    overflow:     'hidden'
  });

  // ── Modal header ──────────────────────────────────────────────────────────
  const modalHeader = document.createElement('div');
  Object.assign(modalHeader.style, {
    padding:        '18px 20px 14px',
    borderBottom:   '1px solid #2a2a38',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    flexShrink:     '0'
  });

  const modalTitle = document.createElement('div');
  Object.assign(modalTitle.style, { display: 'flex', flexDirection: 'column', gap: '3px' });

  const titleText = document.createElement('div');
  titleText.textContent = '📅 Add Emails to Google Calendar';
  Object.assign(titleText.style, { fontSize: '15px', fontWeight: '600', color: '#fff' });

  const subtitleText = document.createElement('div');
  subtitleText.textContent = `${emails.length} highlighted email${emails.length !== 1 ? 's' : ''} found — select which to schedule`;
  Object.assign(subtitleText.style, { fontSize: '11px', color: '#777' });

  modalTitle.appendChild(titleText);
  modalTitle.appendChild(subtitleText);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  Object.assign(closeBtn.style, {
    background:   'none',
    border:       'none',
    color:        '#666',
    fontSize:     '16px',
    cursor:       'pointer',
    padding:      '4px 8px',
    borderRadius: '6px',
    lineHeight:   '1'
  });
  closeBtn.addEventListener('mouseenter', () => closeBtn.style.color = '#fff');
  closeBtn.addEventListener('mouseleave', () => closeBtn.style.color = '#666');
  closeBtn.addEventListener('click', () => overlay.remove());

  modalHeader.appendChild(modalTitle);
  modalHeader.appendChild(closeBtn);

  // ── Select all row ────────────────────────────────────────────────────────
  const selectAllRow = document.createElement('div');
  Object.assign(selectAllRow.style, {
    padding:        '10px 20px',
    borderBottom:   '1px solid #2a2a38',
    display:        'flex',
    alignItems:     'center',
    gap:            '8px',
    flexShrink:     '0',
    background:     '#14141c'
  });

  const selectAllChk = document.createElement('input');
  selectAllChk.type    = 'checkbox';
  selectAllChk.checked = true;
  selectAllChk.id      = 'sga-select-all';
  Object.assign(selectAllChk.style, { cursor: 'pointer', accentColor: '#e74c3c', width: '14px', height: '14px' });

  const selectAllLabel = document.createElement('label');
  selectAllLabel.htmlFor     = 'sga-select-all';
  selectAllLabel.textContent = 'Select / Deselect all';
  Object.assign(selectAllLabel.style, { fontSize: '12px', color: '#aaa', cursor: 'pointer' });

  selectAllRow.appendChild(selectAllChk);
  selectAllRow.appendChild(selectAllLabel);

  // ── Email list ────────────────────────────────────────────────────────────
  const listContainer = document.createElement('div');
  Object.assign(listContainer.style, {
    overflowY:  'auto',
    flexGrow:   '1',
    padding:    '8px 0'
  });

  const checkboxes = [];

  emails.forEach((item, idx) => {
    const pri     = PRIORITY_LABELS[item.priority] || PRIORITY_LABELS.LOW;
    const rowEl   = document.createElement('div');
    rowEl.id      = `sga-cal-row-${idx}`;
    Object.assign(rowEl.style, {
      display:      'flex',
      alignItems:   'flex-start',
      gap:          '12px',
      padding:      '10px 20px',
      borderBottom: '1px solid #1e1e2a',
      cursor:       'pointer',
      transition:   'background 0.15s'
    });

    rowEl.addEventListener('mouseenter', () => rowEl.style.background = '#20202c');
    rowEl.addEventListener('mouseleave', () => rowEl.style.background = 'transparent');

    // Checkbox
    const chk    = document.createElement('input');
    chk.type     = 'checkbox';
    chk.checked  = true;
    chk.dataset.idx = idx;
    Object.assign(chk.style, {
      marginTop:   '3px',
      cursor:      'pointer',
      accentColor: '#e74c3c',
      flexShrink:  '0',
      width:       '14px',
      height:      '14px'
    });
    checkboxes.push(chk);

    // Clicking the row toggles the checkbox
    rowEl.addEventListener('click', e => {
      if (e.target !== chk) chk.checked = !chk.checked;
    });

    // Content
    const content = document.createElement('div');
    Object.assign(content.style, { flex: '1', minWidth: '0' });

    // Subject line
    const subjectLine = document.createElement('div');
    Object.assign(subjectLine.style, {
      fontSize:     '13px',
      fontWeight:   '500',
      color:        '#e8e8f0',
      whiteSpace:   'nowrap',
      overflow:     'hidden',
      textOverflow: 'ellipsis'
    });
    subjectLine.textContent = item.data.subjectRaw || '(No subject)';

    // Meta row: priority badge + detected date
    const metaRow = document.createElement('div');
    Object.assign(metaRow.style, {
      display:    'flex',
      alignItems: 'center',
      gap:        '8px',
      marginTop:  '4px',
      flexWrap:   'wrap'
    });

    // Priority badge
    const badge = document.createElement('span');
    badge.textContent = `${pri.emoji} ${pri.label}`;
    Object.assign(badge.style, {
      fontSize:     '10px',
      fontWeight:   '600',
      color:        pri.color,
      background:   pri.color + '20',
      border:       `1px solid ${pri.color}44`,
      borderRadius: '4px',
      padding:      '1px 6px'
    });

    // Detected date
    const dateTag = document.createElement('span');
    Object.assign(dateTag.style, {
      fontSize:  '11px',
      color:     '#888'
    });
    const formattedDate = item.date.toLocaleDateString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
    dateTag.textContent = `📅 ${formattedDate}  (detected: "${item.dateLabel}")`;

    metaRow.appendChild(badge);
    metaRow.appendChild(dateTag);

    // Snippet preview
    const snippet = document.createElement('div');
    Object.assign(snippet.style, {
      fontSize:     '11px',
      color:        '#666',
      marginTop:    '3px',
      whiteSpace:   'nowrap',
      overflow:     'hidden',
      textOverflow: 'ellipsis'
    });
    snippet.textContent = item.data.bodyRaw || '';

    content.appendChild(subjectLine);
    content.appendChild(metaRow);
    content.appendChild(snippet);

    rowEl.appendChild(chk);
    rowEl.appendChild(content);
    listContainer.appendChild(rowEl);
  });

  // ── Select all logic ──────────────────────────────────────────────────────
  selectAllChk.addEventListener('change', () => {
    checkboxes.forEach(c => c.checked = selectAllChk.checked);
  });

  // ── Modal footer ──────────────────────────────────────────────────────────
  const footer = document.createElement('div');
  Object.assign(footer.style, {
    padding:        '14px 20px',
    borderTop:      '1px solid #2a2a38',
    display:        'flex',
    justifyContent: 'flex-end',
    gap:            '10px',
    flexShrink:     '0',
    background:     '#14141c'
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  Object.assign(cancelBtn.style, {
    padding:      '9px 18px',
    background:   'transparent',
    border:       '1px solid #2a2a38',
    borderRadius: '8px',
    color:        '#888',
    fontSize:     '13px',
    cursor:       'pointer',
    fontFamily:   'Google Sans, Arial, sans-serif'
  });
  cancelBtn.addEventListener('mouseenter', () => cancelBtn.style.borderColor = '#555');
  cancelBtn.addEventListener('mouseleave', () => cancelBtn.style.borderColor = '#2a2a38');
  cancelBtn.addEventListener('click', () => overlay.remove());

  const addBtn = document.createElement('button');
  addBtn.textContent = '📅 Add Selected to Calendar';
  Object.assign(addBtn.style, {
    padding:      '9px 18px',
    background:   'linear-gradient(135deg, #e74c3c, #c0392b)',
    border:       'none',
    borderRadius: '8px',
    color:        '#fff',
    fontSize:     '13px',
    fontWeight:   '600',
    cursor:       'pointer',
    fontFamily:   'Google Sans, Arial, sans-serif'
  });
  addBtn.addEventListener('mouseenter', () => addBtn.style.opacity = '0.85');
  addBtn.addEventListener('mouseleave', () => addBtn.style.opacity = '1');

  addBtn.addEventListener('click', () => {
    const selected = checkboxes
      .map((chk, idx) => chk.checked ? emails[idx] : null)
      .filter(Boolean);

    if (selected.length === 0) {
      showToast('Please select at least one email.');
      return;
    }

    // Open one Google Calendar tab per selected email
    selected.forEach((item, i) => {
      // Stagger tab openings slightly so browser doesn't block them as popups
      setTimeout(() => {
        const url = buildCalendarUrl(item.data.subjectRaw, item.date);
        window.open(url, '_blank');
      }, i * 300);
    });

    overlay.remove();
    showToast(`✅ Opening ${selected.length} calendar event${selected.length > 1 ? 's' : ''}…`);
  });

  footer.appendChild(cancelBtn);
  footer.appendChild(addBtn);

  // ── Assemble modal ────────────────────────────────────────────────────────
  modal.appendChild(modalHeader);
  modal.appendChild(selectAllRow);
  modal.appendChild(listContainer);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — TOAST NOTIFICATION
// ══════════════════════════════════════════════════════════════════════════════

function showToast(message) {
  document.getElementById('sga-toast')?.remove();

  const toast = document.createElement('div');
  toast.id = 'sga-toast';
  toast.textContent = message;
  Object.assign(toast.style, {
    position:     'fixed',
    bottom:       '90px',
    right:        '24px',
    background:   '#1a1a24',
    color:        '#e8e8f0',
    border:       '1px solid #2a2a38',
    borderRadius: '8px',
    padding:      '10px 16px',
    fontSize:     '12px',
    zIndex:       '999999',
    boxShadow:    '0 4px 16px rgba(0,0,0,0.4)',
    maxWidth:     '280px',
    lineHeight:   '1.4',
    animation:    'sgaFadeIn 0.2s ease'
  });

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// Inject CSS for toast animation
const style = document.createElement('style');
style.textContent = `@keyframes sgaFadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }`;
document.head.appendChild(style);

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — FLOATING FILTER PANEL
// Buttons: 🔴 HIGH | 🟡 MEDIUM | 🟢 LOW | ☰ All | 📅 Calendar
// ══════════════════════════════════════════════════════════════════════════════

function createFilterPanel() {
  if (document.getElementById('sga-filter-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'sga-filter-panel';
  Object.assign(panel.style, {
    position:      'fixed',
    bottom:        '24px',
    right:         '24px',
    zIndex:        '99998',
    background:    '#1a1a24',
    border:        '1px solid #2a2a38',
    borderRadius:  '14px',
    padding:       '12px 14px',
    boxShadow:     '0 8px 32px rgba(0,0,0,0.4)',
    display:       'flex',
    flexDirection: 'column',
    gap:           '8px',
    minWidth:      '170px',
    fontFamily:    'Google Sans, Arial, sans-serif'
  });

  // Header
  const header = document.createElement('div');
  header.textContent = '✉ SGA Controls';
  Object.assign(header.style, {
    fontSize:       '10px',
    fontWeight:     '600',
    color:          '#e74c3c',
    textTransform:  'uppercase',
    letterSpacing:  '0.08em',
    paddingBottom:  '6px',
    borderBottom:   '1px solid #2a2a38',
    marginBottom:   '2px'
  });
  panel.appendChild(header);

  // ── Priority filter buttons ───────────────────────────────────────────────
  const filterSection = document.createElement('div');
  Object.assign(filterSection.style, { display: 'flex', flexDirection: 'column', gap: '6px' });

  const filterLabel = document.createElement('div');
  filterLabel.textContent = 'FILTER BY PRIORITY';
  Object.assign(filterLabel.style, { fontSize: '9px', color: '#555', fontWeight: '600', letterSpacing: '0.06em' });
  filterSection.appendChild(filterLabel);

  const filterButtons = [
    { label: '🔴  HIGH only',   priority: 'HIGH',   activeColor: '#e74c3c' },
    { label: '🟡  MEDIUM only', priority: 'MEDIUM', activeColor: '#f39c12' },
    { label: '🟢  LOW only',    priority: 'LOW',    activeColor: '#27ae60' },
    { label: '☰  Show All',     priority: null,     activeColor: '#888'    }
  ];

  const filterBtnEls = {};

  filterButtons.forEach(({ label, priority, activeColor }) => {
    const btn = document.createElement('button');
    btn.textContent        = label;
    btn.dataset.priority   = priority || 'ALL';
    Object.assign(btn.style, {
      padding:      '7px 10px',
      fontSize:     '12px',
      fontFamily:   'Google Sans, Arial, sans-serif',
      fontWeight:   '500',
      border:       '1px solid #2a2a38',
      borderRadius: '7px',
      background:   '#0f0f13',
      color:        '#e8e8f0',
      cursor:       'pointer',
      textAlign:    'left',
      transition:   'all 0.15s'
    });

    const isActive = () => (activePriorityFilter || 'ALL') === (priority || 'ALL');

    btn.addEventListener('mouseenter', () => {
      if (!isActive()) btn.style.background = '#22222e';
    });
    btn.addEventListener('mouseleave', () => {
      if (!isActive()) btn.style.background = '#0f0f13';
    });

    btn.addEventListener('click', () => {
      activePriorityFilter = priority;
      chrome.storage.local.set({ activeFilter: priority });

      // Reset all buttons
      Object.values(filterBtnEls).forEach(b => {
        b.style.background  = '#0f0f13';
        b.style.color       = '#e8e8f0';
        b.style.borderColor = '#2a2a38';
        b.style.fontWeight  = '500';
      });

      // Activate clicked button
      btn.style.background  = activeColor + '22';
      btn.style.color       = activeColor;
      btn.style.borderColor = activeColor;
      btn.style.fontWeight  = '600';

      applyFilter();
    });

    filterBtnEls[priority || 'ALL'] = btn;
    filterSection.appendChild(btn);
  });

  panel.appendChild(filterSection);

  // ── Divider ───────────────────────────────────────────────────────────────
  const divider = document.createElement('div');
  Object.assign(divider.style, {
    height:     '1px',
    background: '#2a2a38',
    margin:     '2px 0'
  });
  panel.appendChild(divider);

  // ── Calendar section ──────────────────────────────────────────────────────
  const calSection = document.createElement('div');
  Object.assign(calSection.style, { display: 'flex', flexDirection: 'column', gap: '6px' });

  const calLabel = document.createElement('div');
  calLabel.textContent = 'GOOGLE CALENDAR';
  Object.assign(calLabel.style, { fontSize: '9px', color: '#555', fontWeight: '600', letterSpacing: '0.06em' });
  calSection.appendChild(calLabel);

  const calBtn = document.createElement('button');
  calBtn.textContent = '📅  Add to Calendar';
  Object.assign(calBtn.style, {
    padding:      '8px 10px',
    fontSize:     '12px',
    fontFamily:   'Google Sans, Arial, sans-serif',
    fontWeight:   '600',
    border:       '1px solid #e74c3c44',
    borderRadius: '7px',
    background:   '#e74c3c18',
    color:        '#e74c3c',
    cursor:       'pointer',
    textAlign:    'left',
    transition:   'all 0.15s'
  });
  calBtn.addEventListener('mouseenter', () => {
    calBtn.style.background   = '#e74c3c30';
    calBtn.style.borderColor  = '#e74c3c';
  });
  calBtn.addEventListener('mouseleave', () => {
    calBtn.style.background   = '#e74c3c18';
    calBtn.style.borderColor  = '#e74c3c44';
  });
  calBtn.addEventListener('click', openCalendarModal);

  calSection.appendChild(calBtn);
  panel.appendChild(calSection);

  document.body.appendChild(panel);

  // Restore saved filter on load
  chrome.storage.local.get(['activeFilter'], result => {
    const saved = result.activeFilter;
    const btn   = filterBtnEls[saved || 'ALL'];
    if (btn) btn.click();
    else filterBtnEls['ALL'].click();
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 9 — TOOLTIP
// ══════════════════════════════════════════════════════════════════════════════

(function setupTooltip() {
  const tip = document.createElement('div');
  tip.id = 'sga-tooltip';
  Object.assign(tip.style, {
    position:      'fixed',
    background:    '#1a1a24',
    color:         '#e8e8f0',
    fontSize:      '11px',
    padding:       '7px 11px',
    borderRadius:  '7px',
    border:        '1px solid #2a2a38',
    pointerEvents: 'none',
    zIndex:        '999998',
    display:       'none',
    maxWidth:      '300px',
    lineHeight:    '1.6',
    boxShadow:     '0 4px 16px rgba(0,0,0,0.4)',
    whiteSpace:    'pre-line'
  });
  document.body.appendChild(tip);

  document.addEventListener('mouseover', e => {
    const row      = e.target.closest('tr[data-sga-highlighted]');
    if (!row) { tip.style.display = 'none'; return; }
    const priority = row.getAttribute('data-sga-priority');
    const reason   = row.getAttribute('data-sga-reason');
    if (!priority) { tip.style.display = 'none'; return; }
    const pri = PRIORITY_LABELS[priority] || PRIORITY_LABELS.LOW;
    tip.textContent   = `${pri.emoji} ${pri.label} priority${reason ? '\n' + reason : ''}`;
    tip.style.display = 'block';
  });

  document.addEventListener('mousemove', e => {
    tip.style.left = (e.clientX + 14) + 'px';
    tip.style.top  = (e.clientY - 36) + 'px';
  });

  document.addEventListener('mouseout', e => {
    if (!e.target.closest('tr[data-sga-highlighted]')) tip.style.display = 'none';
  });
})();

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 10 — CORE SCAN + INIT
// ══════════════════════════════════════════════════════════════════════════════

function scanAndHighlight(rules) {
  if (!rules?.length) return;
  document.querySelectorAll('tr.zA').forEach(row => {
    const emailData   = extractEmailData(row);
    const matchedRule = getBestMatchingRule(emailData, rules);
    if (matchedRule) applyHighlight(row, matchedRule);
    else             removeHighlight(row);
  });
  applyFilter();
}

function loadAndScan() {
  chrome.storage.local.get(['highlightRules'], result => {
    if (chrome.runtime.lastError) return;
    if (!result.highlightRules?.length) return;
    scanAndHighlight(result.highlightRules);
  });
}

// Build panel + run initial scan
createFilterPanel();
loadAndScan();

// Re-scan on Gmail DOM changes (SPA navigation)
let debounceTimer = null;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadAndScan, 500);
});
observer.observe(document.body, { childList: true, subtree: true });

// Instant re-scan when form saves new rules
chrome.runtime.onMessage.addListener(message => {
  if (message.type === 'RULES_UPDATED') setTimeout(loadAndScan, 300);
});