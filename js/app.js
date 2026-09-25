/* Froggy Kitchen — app logic (vanilla JS, no build step) */
(() => {
  'use strict';

  const S = FroggyStore;
  const $ = (sel) => document.querySelector(sel);

  /* ================= constants ================= */

  const CUISINES = [
    { id: 'french', label: 'French', emoji: '🥐' },
    { id: 'italian', label: 'Italian', emoji: '🍝' },
    { id: 'jamaican', label: 'Jamaican', emoji: '🌶️' },
    { id: 'mexican', label: 'Mexican', emoji: '🌮' },
    { id: 'thai', label: 'Thai', emoji: '🍜' },
    { id: 'indian', label: 'Indian', emoji: '🍛' },
    { id: 'mediterranean', label: 'Mediterranean', emoji: '🫒' },
    { id: 'caribbean', label: 'Caribbean', emoji: '🏝️' },
    { id: 'american', label: 'American', emoji: '🍔' },
    { id: 'surprise', label: 'Surprise me', emoji: '🎲' },
  ];

  const STAPLES = [
    'Eggs', 'Rice', 'Chicken breast', 'Pasta', 'Tomatoes', 'Onions', 'Garlic',
    'Olive oil', 'Spices', 'Cheese', 'Potatoes', 'Canned beans', 'Spinach',
    'Yogurt', 'Bread', 'Carrots', 'Bell peppers', 'Lemons',
  ];

  const DIETS = [
    { id: 'vegetarian', label: 'Vegetarian 🥬' },
    { id: 'high-protein', label: 'High-protein 💪' },
    { id: 'low-calorie', label: 'Low-calorie 🪶' },
    { id: 'gluten-free', label: 'Gluten-free 🌾' },
  ];

  const DEFAULTS = { goals: { calories: 1800, proteinG: 90 }, waterGoal: 8, weightUnit: 'kg' };

  /* Themes: id must match the [data-theme="…"] blocks in css/styles.css.
   * themeColor is applied to <meta name="theme-color"> for browser chrome / iOS status bar. */
  const THEMES = [
    { id: 'classic', label: 'Classic', emoji: '🐸', themeColor: '#5C9E72' },
    { id: 'night', label: 'Night pond', emoji: '🌙', themeColor: '#101814' },
    { id: 'lagoon', label: 'Lagoon', emoji: '🌊', themeColor: '#4C9E7E' },
  ];

  /* ================= state ================= */

  const state = {
    tab: 'cook',
    pantry: S.get('pantry', []), // [{id, name, usedUp}]
    prefs: Object.assign(
      { cuisine: 'surprise', servings: 2, cookTime: '', diets: [], allergies: '' },
      S.get('prefs', {})
    ),
    settings: Object.assign({ provider: 'anthropic', backupInterval: 86400 }, S.get('settings', {})),
    theme: THEMES.some((t) => t.id === S.get('theme', 'classic')) ? S.get('theme') : 'classic',
    goals: Object.assign({}, DEFAULTS.goals, S.get('goals', {})),
    waterGoal: S.get('waterGoal', DEFAULTS.waterGoal),
    weightUnit: S.get('weightUnit', DEFAULTS.weightUnit),
    lastResults: S.get('lastResults', null), // {req, meals}
  };

  const savePantry = () => S.set('pantry', state.pantry);
  const savePrefs = () => S.set('prefs', state.prefs);
  const favorites = () => S.get('favorites', []);
  const setFavorites = (f) => S.set('favorites', f);
  const history = () => S.get('history', []);

  /* ================= helpers ================= */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  function fmtDay(dayKeyStr) {
    const [y, m, d] = dayKeyStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function activePantry() {
    return state.pantry.filter((p) => !p.usedUp);
  }

  /* ================= tabs & greeting ================= */

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tabbtn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + tab));
    if (tab === 'today') renderToday();
    if (tab === 'favs') renderFavs();
    window.scrollTo({ top: 0 });
  }

  function greeting() {
    const h = new Date().getHours();
    if (h >= 5 && h < 11) return 'Good morning! What shall we cook? 🐸';
    if (h < 14) return "Lunch o'clock — let's find something tasty.";
    if (h < 17) return 'Afternoon! Any cravings today?';
    if (h < 21) return 'Dinner time. Chef Froggy has ideas. 🍳';
    return 'Late-night kitchen? Let’s plan something easy.';
  }

  /* ================= pantry ================= */

  function renderPantry() {
    const count = activePantry().length;
    $('#pantryCount').textContent = String(count);

    // quick-add chips: staples not already in the pantry (any state)
    const have = new Set(state.pantry.map((p) => p.name.toLowerCase()));
    $('#quickAdds').innerHTML = STAPLES.filter((s) => !have.has(s.toLowerCase()))
      .map((s) => `<button type="button" class="chip quick" data-add="${esc(s)}">＋ ${esc(s)}</button>`)
      .join('') || '<span class="hint">All staples added — nice pantry!</span>';

    const sorted = [...state.pantry].sort((a, b) => Number(a.usedUp) - Number(b.usedUp));
    $('#pantryList').innerHTML = sorted.length ? sorted.map((p) => `
      <li class="pantry-item ${p.usedUp ? 'used' : ''}" data-id="${p.id}">
        <button type="button" class="check" data-act="toggle" aria-label="Mark used up">${p.usedUp ? '✓' : ''}</button>
        <span class="name">${esc(p.name)}</span>
        <button type="button" class="rm" data-act="remove" aria-label="Remove">✕</button>
      </li>`).join('')
      : '<li class="empty-note">Nothing here yet — add what’s in your kitchen above. 🧺</li>';
  }

  function addPantryItem(name) {
    name = String(name || '').trim();
    if (!name) return;
    const exists = state.pantry.some((p) => p.name.toLowerCase() === name.toLowerCase());
    if (exists) { toast('Already in your pantry 🐸'); return; }
    state.pantry.push({ id: S.uid(), name, usedUp: false });
    savePantry();
    renderPantry();
  }

  /* ================= cuisine & constraints chips ================= */

  function renderCuisineChips() {
    $('#cuisineChips').innerHTML = CUISINES.map((c) => `
      <button type="button" class="chip ${state.prefs.cuisine === c.id ? 'selected' : ''}" data-cuisine="${c.id}">
        ${c.emoji} ${esc(c.label)}
      </button>`).join('');
  }

  function renderDietChips() {
    $('#dietChips').innerHTML = DIETS.map((d) => `
      <button type="button" class="chip ${state.prefs.diets.includes(d.id) ? 'selected' : ''}" data-diet="${d.id}">
        ${esc(d.label)}
      </button>`).join('');
  }

  function renderServings() {
    $('#servingsVal').textContent = String(state.prefs.servings);
  }

  /* ================= generate flow ================= */

  function collectRequest() {
    const cuisineObj = CUISINES.find((c) => c.id === state.prefs.cuisine) || CUISINES[CUISINES.length - 1];
    return {
      pantry: activePantry().map((p) => p.name),
      cuisine: cuisineObj.id === 'surprise' ? 'surprise' : cuisineObj.label,
      servings: state.prefs.servings,
      maxCookTimeMin: state.prefs.cookTime ? Number(state.prefs.cookTime) : null,
      dietaryNotes: [...state.prefs.diets],
      allergies: $('#allergies').value.trim(),
    };
  }

  async function generate() {
    const btn = $('#generateBtn');
    const status = $('#genStatus');
    const results = $('#results');

    const prov = FroggyProviders.providerById(state.settings.provider);
    if (!prov.local && !state.settings.apiKey) {
      setTab('settings');
      toast('Add your API key in Settings first 🐸');
      return;
    }
    if (prov.local && !state.settings.model) {
      setTab('settings');
      toast('Pick a model from the LM Studio list in Settings 🐸');
      return;
    }

    btn.disabled = true;
    status.classList.remove('hidden');
    status.innerHTML = '<span class="hop">🐸</span> Chef Froggy is stirring the pot…';
    results.innerHTML = '';

    const req = collectRequest();
    try {
      const out = await FroggyProviders.generateMeals(state.settings, req);
      state.lastResults = { req, meals: out.meals };
      S.set('lastResults', state.lastResults);
      status.classList.add('hidden');
      renderResults();
      toast(`${out.meals.length} ideas, fresh from the pond! 🐸`);
    } catch (err) {
      status.classList.add('hidden');
      if (err && err.code === 'NO_KEY') {
        setTab('settings');
        toast('Add your API key in Settings first 🐸');
      } else if (err && err.code === 'NO_MODEL') {
        setTab('settings');
        toast('Pick a model from the LM Studio list in Settings 🐸');
      } else {
        results.innerHTML = `
          <div class="card">
            <p style="font-weight:700">Hmm, the kitchen got a little smoky. 😅</p>
            <p class="hint">${esc(err && err.message ? err.message : 'Something went wrong.')}</p>
            <button type="button" class="big-btn" id="retryBtn">Try again 🐸</button>
          </div>`;
        $('#retryBtn').addEventListener('click', generate);
      }
    } finally {
      btn.disabled = false;
    }
  }

  /* ================= meal cards ================= */

  function matchBadgeText(meal, total) {
    if (total === 0) return '🛒 Fresh shopping list inside';
    const used = meal.usedIngredients.length;
    if (used === 0) return `🛒 Mostly new ingredients this one`;
    return `🧺 Uses ${used} of your ${total} ingredients`;
  }

  function mealCardHTML(meal, totalPantry) {
    const fav = favorites().some((f) => f.id === meal.id);
    const n = meal.nutritionPerServing;
    return `
      <article class="card meal-card" data-meal-id="${meal.id}">
        <div class="meal-top">
          <h3>${esc(meal.name)}</h3>
          <button type="button" class="heart ${fav ? 'on' : ''}" data-act="fav" aria-label="Save to favorites">${fav ? '❤️' : '🤍'}</button>
        </div>
        ${meal.description ? `<p class="desc">${esc(meal.description)}</p>` : ''}
        ${totalPantry === null ? '' : `<span class="match-badge">${esc(matchBadgeText(meal, totalPantry))}</span>`}
        ${meal.indulgent ? '<span class="indulgent-badge">🍰 Indulgent — enjoy it mindfully</span>' : ''}
        ${meal.missingIngredients.length ? `
          <div class="missing">
            <span class="label">🛒 To grab</span>
            <div class="missing-chips">${meal.missingIngredients.map((m) => `<span class="missing-chip">${esc(m)}</span>`).join('')}</div>
          </div>` : ''}
        ${meal.steps.length ? `
          <details>
            <summary>👨‍🍳 Steps (${meal.steps.length})${meal.cookTimeMin ? ` · ~${meal.cookTimeMin} min` : ''}</summary>
            <ol>${meal.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
          </details>` : ''}
        <div class="nutrition">
          <span>${meal.nutritionEstimated ? '≈' : ''}🔥 ${n.calories || '—'} kcal</span><span>💪 P ${n.proteinG || 0}g</span>
          <span>🌾 C ${n.carbsG || 0}g</span><span>🧈 F ${n.fatG || 0}g</span>
          <span class="per-serving">per serving · serves ${meal.servings}${meal.nutritionEstimated ? ' · nutrition estimated from ingredient database' : ''}</span>
        </div>
        ${meal.healthNote ? `<p class="health-note">💚 ${esc(meal.healthNote)}</p>` : ''}
        <div class="meal-actions">
          <button type="button" class="ate" data-act="ate">✓ I ate this · 1 serving</button>
          <button type="button" class="cooked" data-act="cooked">Cooked it 🍳</button>
        </div>
      </article>`;
  }

  function renderResults() {
    const box = $('#results');
    if (!state.lastResults || !state.lastResults.meals.length) return;
    const total = state.lastResults.req.pantry.length;
    box.innerHTML = `
      <h2 class="section-title">Chef Froggy’s picks</h2>
      ${state.lastResults.meals.map((m) => mealCardHTML(m, total)).join('')}
      <p class="results-note">Tap the heart to save a favorite · “I ate this” logs one serving to today. Nutrition facts from <a href="https://www.opennutrition.app" target="_blank" rel="noopener">OpenNutrition</a>.</p>`;
  }

  function findMealById(id) {
    const pools = [state.lastResults && state.lastResults.meals, favorites()];
    for (const pool of pools) if (pool) {
      const m = pool.find((x) => x.id === id);
      if (m) return m;
    }
    return null;
  }

  function onMealAction(act, mealId) {
    const meal = findMealById(mealId);
    if (!meal) return;

    if (act === 'fav') {
      const favs = favorites();
      const i = favs.findIndex((f) => f.id === mealId);
      if (i >= 0) { favs.splice(i, 1); toast('Removed from favorites'); }
      else { favs.unshift(meal); toast('Saved to favorites 🐸'); }
      setFavorites(favs);
    }

    if (act === 'ate') {
      const n = meal.nutritionPerServing || {};
      S.addLogEntry({
        id: S.uid(), name: meal.name, day: S.dayKey(), source: 'meal',
        calories: n.calories || 0, proteinG: n.proteinG || 0, carbsG: n.carbsG || 0, fatG: n.fatG || 0,
      });
      toast('Logged! Froggy approves 🐸');
    }

    if (act === 'cooked') {
      const h = history();
      h.unshift({ id: S.uid(), name: meal.name, day: S.dayKey() });
      S.set('history', h.slice(0, 50));
      toast('Nice cook! Added to your history 🍳');
    }

    renderResults(); // refresh heart state in results
    if (state.tab === 'favs') renderFavs();
    if (state.tab === 'today') renderToday();
  }

  /* ================= today tab ================= */

  function streakDays() {
    let n = 0;
    let offset = S.getLog(S.dayKey()).length > 0 ? 0 : -1; // nothing yet today? streak can still be alive from yesterday
    while (S.getLog(S.dayKeyShifted(offset)).length > 0) { n++; offset--; }
    return n;
  }

  function encouragement(entries, calSum, proSum) {
    const g = state.goals;
    if (!entries.length) return 'A fresh day, a full pond of possibilities! 🐸';
    if (g.calories > 0 && calSum <= g.calories && g.proteinG > 0 && proSum >= g.proteinG) {
      return 'Chef Froggy is beaming — balanced and on track! 🎉';
    }
    if (g.calories > 0 && calSum > g.calories * 1.15) {
      return "You've had a hearty day. Rest up — tomorrow's another pond hop!";
    }
    return 'Steady and easy — you’re doing great.';
  }

  function renderToday() {
    const today = S.dayKey();
    $('#todayDate').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    const entries = S.getLog(today);
    const calSum = Math.round(entries.reduce((a, e) => a + (e.calories || 0), 0));
    const proSum = Math.round(entries.reduce((a, e) => a + (e.proteinG || 0), 0) * 10) / 10;

    $('#froggySays').textContent = encouragement(entries, calSum, proSum);

    // streak chip
    const st = streakDays();
    const chip = $('#streakChip');
    if (st >= 2) {
      chip.classList.remove('hidden');
      chip.textContent = `🐸 ${st}-day logging streak — keep the pond flowing!`;
    } else chip.classList.add('hidden');

    // calorie bar
    const gCal = state.goals.calories || 0;
    $('#calText').textContent = gCal ? `${calSum} / ${gCal} kcal` : '';
    $('#calBar').style.width = gCal ? Math.min(100, (calSum / gCal) * 100) + '%' : '0%';
    if (!gCal) $('#calSub').textContent = 'Set a calorie target in Settings to see progress.';
    else {
      const left = gCal - calSum;
      $('#calSub').textContent = left >= 0 ? `${left} kcal left today` : "You've had a full day — nice work! 🐸";
    }

    // protein bar
    const gPro = state.goals.proteinG || 0;
    $('#proText').textContent = gPro ? `${proSum} / ${gPro} g` : '';
    $('#proBar').style.width = gPro ? Math.min(100, (proSum / gPro) * 100) + '%' : '0%';
    if (!gPro) $('#proSub').textContent = 'Set a protein target in Settings to see progress.';
    else {
      const left = gPro - proSum;
      $('#proSub').textContent = left > 0 ? `${left} g of protein to go` : 'Protein goal met — Chef Froggy is impressed 💪';
    }

    // water
    const w = S.getWater(today);
    const goal = state.waterGoal || 8;
    $('#waterText').textContent = `${w} / ${goal}`;
    $('#droplets').innerHTML = Array.from({ length: goal }, (_, i) => `
      <button type="button" class="drop ${i < w ? 'full' : ''}" data-drop="${i + 1}" aria-label="Water cup ${i + 1}">💧</button>`).join('');

    // weight
    $('#weightUnitLabel').textContent = state.weightUnit;
    renderWeightChart();

    // today's log list
    const list = $('#todayLog');
    if (!entries.length) {
      list.innerHTML = '<li class="empty-note">Nothing logged yet — tap “I ate this” on a meal, or quick-log below.</li>';
    } else {
      list.innerHTML = entries.map((e) => `
        <li class="log-item" data-entry-id="${e.id}">
          <span class="li-name">${esc(e.name)}</span>
          <span class="li-meta">${Math.round(e.calories || 0)} kcal${(e.proteinG || e.carbsG) ? ` · P ${Math.round(e.proteinG || 0)}g` : ''}</span>
          <button type="button" class="rm" data-act="del-log" aria-label="Remove entry">✕</button>
        </li>`).join('');
    }
  }

  function renderWeightChart() {
    const box = $('#weightChart');
    const pts = S.getWeight();
    if (pts.length < 2) {
      box.innerHTML = '';
      $('#weightDelta').textContent = pts.length === 1 ? 'One check-in so far — log another to see your trend.' : 'Log a couple of check-ins and Froggy will draw your trend line. 🐸';
      return;
    }

    const W = 320, H = 140, PX = 30, PY = 22;
    const vals = pts.map((p) => p.value);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (max - min < 0.5) { min -= 0.5; max += 0.5; } // flat line needs room
    const x = (i) => PX + (pts.length === 1 ? 0 : (i / (pts.length - 1)) * (W - 2 * PX));
    const y = (v) => PY + (1 - (v - min) / (max - min)) * (H - 2 * PY);

    const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    // Colors come from CSS variables so the chart follows the active theme.
    const dots = pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4.5" style="fill:var(--pond-deep)"/>`).join('');

    box.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight trend chart">
        <line x1="${PX}" y1="${H - PY + 8}" x2="${W - PX}" y2="${H - PY + 8}" style="stroke:var(--sand-deep)" stroke-width="2"/>
        <polyline points="${line}" fill="none" style="stroke:var(--pond)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${dots}
        <text x="${PX}" y="${H - 4}" font-size="10.5" style="fill:var(--muted)">${esc(fmtDay(pts[0].day))}</text>
        <text x="${W - PX}" y="${H - 4}" font-size="10.5" style="fill:var(--muted)" text-anchor="end">${esc(fmtDay(pts[pts.length - 1].day))}</text>
        <text x="${PX - 6}" y="${(y(max) + 3).toFixed(1)}" font-size="10.5" style="fill:var(--muted)" text-anchor="end">${max.toFixed(1)}</text>
        <text x="${PX - 6}" y="${(y(min) + 3).toFixed(1)}" font-size="10.5" style="fill:var(--muted)" text-anchor="end">${min.toFixed(1)}</text>
      </svg>`;

    const delta = pts[pts.length - 1].value - pts[0].value;
    const sign = delta > 0 ? '+' : '';
    $('#weightDelta').textContent = Math.abs(delta) < 0.05
      ? 'Steady so far — nice and consistent.'
      : `${sign}${delta.toFixed(1)} ${state.weightUnit} since ${fmtDay(pts[0].day)}.`;
  }

  /* ================= favorites & history ================= */

  function renderFavs() {
    const favs = favorites();
    $('#favList').innerHTML = favs.length
      ? favs.map((m) => mealCardHTML(m, null)).join('') + '<p class="results-note">“I ate this” works on favorites too. Nutrition facts from <a href="https://www.opennutrition.app" target="_blank" rel="noopener">OpenNutrition</a>.</p>'
      : '<p class="empty-note" style="background:none;box-shadow:none;padding:4px 2px">No favorites yet — tap the 🤍 on any meal to save it here. 🐸</p>';

    const h = history();
    $('#historyList').innerHTML = h.length
      ? h.slice(0, 30).map((e) => `
        <li class="log-item">
          <span class="li-name">${esc(e.name)}</span>
          <span class="li-meta">${fmtDay(e.day)}</span>
        </li>`).join('')
      : '<li class="empty-note">Meals you “cook” will show up here.</li>';
  }

  /* ================= quick log modal ================= */

  function openModal() { $('#modal').classList.remove('hidden'); setTimeout(() => $('#qlName').focus(), 60); }
  function closeModal() { $('#modal').classList.add('hidden'); $('#quickLogForm').reset(); }

  /* ================= themes ================= */

  /** Build the theme picker chips once (called from init). */
  function renderThemeChips() {
    const box = $('#themeChips');
    if (!box) return;
    box.innerHTML = THEMES.map((t) =>
      `<button type="button" class="chip" data-theme-id="${t.id}">${t.emoji} ${esc(t.label)}</button>`
    ).join('');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-theme-id]');
      if (b && b.dataset.themeId !== state.theme) applyTheme(b.dataset.themeId);
    });
  }

  /** Apply a theme: <html data-theme>, browser chrome color, persistence, chip highlight. */
  function applyTheme(id) {
    const t = THEMES.find((x) => x.id === id) || THEMES[0];
    state.theme = t.id;
    document.documentElement.setAttribute('data-theme', t.id);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.themeColor);
    S.set('theme', t.id);
    document.querySelectorAll('#themeChips .chip').forEach((c) => {
      c.classList.toggle('selected', c.dataset.themeId === t.id);
    });
  }

  /* ================= settings ================= */

  function renderSettings() {
    const sel = $('#providerSel');
    sel.innerHTML = FroggyProviders.PROVIDERS.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join('');
    sel.value = state.settings.provider || 'anthropic';

    applyProviderUI(sel.value);
    $('#apiKeyInput').value = state.settings.apiKey || '';

    $('#calGoal').value = state.goals.calories ?? DEFAULTS.goals.calories;
    $('#proGoal').value = state.goals.proteinG ?? DEFAULTS.goals.proteinG;
    $('#waterGoal').value = state.waterGoal;
    $('#weightUnit').value = state.weightUnit;

    $('#backupIntervalSel').value = String(state.settings.backupInterval ?? 86400);
    renderBackupStatus();
  }

  /** Show/hide + prefill the settings fields that depend on the chosen provider. */
  function applyProviderUI(provId) {
    const prov = FroggyProviders.providerById(provId);
    const isLocal = !!prov.local;

    $('#localFields').classList.toggle('hidden', !isLocal);
    $('#proxyFields').classList.toggle('hidden', isLocal);
    $('#modelSelect').classList.toggle('hidden', !isLocal);
    $('#modelInput').classList.toggle('hidden', isLocal);

    if (isLocal) {
      $('#serverUrl').value = state.settings.serverUrl || 'http://localhost:1234';
      $('#apiKeyInput').placeholder = prov.keyPlaceholder;
      $('#keyHint').textContent = prov.hint;
      refreshLocalModels(); // live list of what LM Studio has right now
    } else {
      const modelVal = state.settings.model && state.settings.model !== prov.defaultModel ? state.settings.model : prov.defaultModel;
      $('#modelInput').value = modelVal;
      $('#modelInput').placeholder = prov.defaultModel;
      $('#apiKeyInput').placeholder = prov.keyPlaceholder;
      $('#keyHint').textContent = prov.hint;
      $('#proxyUrl').value = state.settings.proxyUrl || (provId === 'anthropic' ? 'https://api.anthropic.com' : '');
    }
  }

  /** Ask the local server which models are available right now. */
  async function refreshLocalModels() {
    const sel = $('#modelSelect');
    const statusEl = $('#modelStatus');
    if (!sel || !statusEl) return;
    const url = ($('#serverUrl').value.trim()) || 'http://localhost:1234';
    statusEl.textContent = 'Checking LM Studio…';
    sel.innerHTML = '<option value="">— checking —</option>';
    try {
      const models = await FroggyProviders.listLocalModels({ serverUrl: url });
      if (!models.length) throw new Error('no models');
      sel.innerHTML = models.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
      if (state.settings.model && models.includes(state.settings.model)) sel.value = state.settings.model;
      statusEl.textContent = `${models.length} model${models.length === 1 ? '' : 's'} available right now 🐸`;
    } catch (err) {
      sel.innerHTML = '<option value="">— no models found —</option>';
      const diag = FroggyProviders.diagnoseLocalUrl(url);
      statusEl.textContent = diag || `Couldn't reach LM Studio at ${esc(url)}. Start the server in LM Studio (Developer tab), switch on “Enable CORS” in its settings, then tap Refresh.`;
    }
  }

  function saveSettings() {
    const provId = $('#providerSel').value;
    const prov = FroggyProviders.providerById(provId);
    const isLocal = !!prov.local;
    const modelVal = (isLocal ? $('#modelSelect') : $('#modelInput')).value.trim();
    state.settings = {
      provider: provId,
      model: modelVal || prov.defaultModel,
      apiKey: $('#apiKeyInput').value.trim(),
      serverUrl: isLocal ? ($('#serverUrl').value.trim() || 'http://localhost:1234') : (state.settings.serverUrl || ''),
      proxyUrl: provId === 'anthropic' ? ($('#proxyUrl').value.trim() || 'https://api.anthropic.com') : '',
      backupInterval: Number($('#backupIntervalSel').value) || 0,
    };
    S.set('settings', state.settings);

    const cal = Number($('#calGoal').value), pro = Number($('#proGoal').value);
    state.goals = { calories: cal > 0 ? Math.round(cal) : DEFAULTS.goals.calories, proteinG: pro > 0 ? Math.round(pro) : DEFAULTS.goals.proteinG };
    S.set('goals', state.goals);

    const wg = Number($('#waterGoal').value);
    state.waterGoal = wg >= 1 ? Math.min(20, Math.round(wg)) : DEFAULTS.waterGoal;
    S.set('waterGoal', state.waterGoal);

    state.weightUnit = $('#weightUnit').value === 'lb' ? 'lb' : 'kg';
    S.set('weightUnit', state.weightUnit);

    toast('Settings saved 🐸');
    if (state.tab === 'today') renderToday();
  }

  /* ================= backups ================= */

  const BACKUP_KEY = 'lastBackup'; // ms timestamp of the last triggered backup

  function backupFileName() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `froggy-kitchen-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`;
  }

  function backupDue() {
    const iv = Number(state.settings.backupInterval) || 0;
    if (iv <= 0) return false;
    return Date.now() - S.get(BACKUP_KEY, 0) >= iv * 1000;
  }

  /** Download the current data as a JSON backup. Returns true on success. */
  function triggerBackup(auto) {
    let url;
    try {
      const blob = new Blob([JSON.stringify(S.buildBackup(), null, 2)], { type: 'application/json' });
      url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFileName();
      document.body.appendChild(a); // some mobile browsers need the anchor in the DOM
      a.click();
      a.remove();
    } catch (e) {
      toast('Could not start the backup 😅');
      return false;
    }
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    S.set(BACKUP_KEY, Date.now());
    renderBackupStatus();
    toast(auto ? 'Auto-backup saved to Downloads 🐸' : 'Backup saved to Downloads ⬇️');
    return true;
  }

  function renderBackupStatus() {
    const el = $('#backupStatus');
    if (!el) return;
    const last = S.get(BACKUP_KEY, 0);
    if (!last) { el.textContent = 'No backup saved yet.'; return; }
    const d = new Date(last);
    el.textContent = `Last backup: ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }

  /* ================= init & events ================= */

  function bindEvents() {
    // tab bar
    document.querySelectorAll('.tabbtn').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

    // pantry
    $('#pantryToggle').addEventListener('click', () => {
      const body = $('#pantryBody');
      const open = body.classList.toggle('hidden') === false;
      $('#pantryToggle').setAttribute('aria-expanded', String(open));
    });
    $('#pantryForm').addEventListener('submit', (e) => {
      e.preventDefault();
      addPantryItem($('#pantryInput').value);
      $('#pantryInput').value = '';
      $('#pantryInput').focus();
    });
    $('#quickAdds').addEventListener('click', (e) => {
      const b = e.target.closest('[data-add]');
      if (b) addPantryItem(b.dataset.add);
    });
    $('#pantryList').addEventListener('click', (e) => {
      const item = e.target.closest('.pantry-item');
      if (!item) return;
      const p = state.pantry.find((x) => x.id === item.dataset.id);
      if (!p) return;
      const actBtn = e.target.closest('[data-act]');
      if (actBtn && actBtn.dataset.act === 'toggle') { p.usedUp = !p.usedUp; savePantry(); renderPantry(); }
      else if (actBtn && actBtn.dataset.act === 'remove') { state.pantry = state.pantry.filter((x) => x.id !== p.id); savePantry(); renderPantry(); }
    });

    // cuisine + diets
    $('#cuisineChips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cuisine]');
      if (!b) return;
      state.prefs.cuisine = b.dataset.cuisine; savePrefs(); renderCuisineChips();
    });
    $('#dietChips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-diet]');
      if (!b) return;
      const id = b.dataset.diet;
      state.prefs.diets = state.prefs.diets.includes(id) ? state.prefs.diets.filter((d) => d !== id) : [...state.prefs.diets, id];
      savePrefs(); renderDietChips();
    });

    // servings + cook time + allergies
    $('#servMinus').addEventListener('click', () => { state.prefs.servings = Math.max(1, state.prefs.servings - 1); savePrefs(); renderServings(); });
    $('#servPlus').addEventListener('click', () => { state.prefs.servings = Math.min(8, state.prefs.servings + 1); savePrefs(); renderServings(); });
    $('#cookTime').addEventListener('change', (e) => { state.prefs.cookTime = e.target.value; savePrefs(); });
    $('#allergies').addEventListener('input', () => { state.prefs.allergies = $('#allergies').value; savePrefs(); });

    // generate + meal actions (delegated: results & favorites)
    $('#generateBtn').addEventListener('click', generate);
    const onMealClick = (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const card = e.target.closest('.meal-card');
      if (!card) return;
      onMealAction(btn.dataset.act, card.dataset.mealId);
    };
    $('#results').addEventListener('click', onMealClick);
    $('#favList').addEventListener('click', onMealClick);

    // today: water + log delete + weight form
    $('#droplets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-drop]');
      if (!b) return;
      const target = Number(b.dataset.drop);
      const cur = S.getWater();
      S.setWater(cur === target ? target - 1 : target); // tap the top filled drop to undo
      renderToday();
    });
    $('#todayLog').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act="del-log"]');
      if (!btn) return;
      const item = e.target.closest('.log-item');
      S.removeLogEntry(S.dayKey(), item.dataset.entryId);
      renderToday();
    });
    $('#weightForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = Number($('#weightInput').value);
      if (!Number.isFinite(v) || v <= 0) { toast('Enter a weight first 🐸'); return; }
      S.addWeight(Math.round(v * 10) / 10);
      $('#weightInput').value = '';
      renderToday();
      toast('Check-in logged ⚖️');
    });

    // quick log modal
    $('#quickLogBtn').addEventListener('click', openModal);
    $('#modalClose').addEventListener('click', closeModal);
    $('#modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    $('#quickLogForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#qlName').value.trim();
      if (!name) return;
      S.addLogEntry({
        id: S.uid(), name, day: S.dayKey(), source: 'manual',
        calories: Math.max(0, Number($('#qlCal').value) || 0),
        proteinG: Math.max(0, Number($('#qlPro').value) || 0),
        carbsG: Math.max(0, Number($('#qlCarb').value) || 0),
        fatG: Math.max(0, Number($('#qlFat').value) || 0),
      });
      closeModal();
      renderToday();
      toast('Logged ✓ Froggy approves 🐸');
    });

    // settings
    $('#providerSel').addEventListener('change', () => applyProviderUI($('#providerSel').value));
    $('#refreshModelsBtn').addEventListener('click', () => refreshLocalModels());
    $('#saveSettingsBtn').addEventListener('click', saveSettings);
    $('#exportBtn').addEventListener('click', () => triggerBackup(false));

    // restore from a backup file (replaces current data after confirmation)
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          const n = S.importAll(parsed); // validates + counts froggy.* keys
          if (!n) throw new Error('no froggy.* keys');
          const when = parsed && parsed.exportedAt ? ` from ${new Date(parsed.exportedAt).toLocaleString()}` : '';
          if (confirm(`Restore backup${when}?\nThis replaces your current data with the file's contents.`)) {
            toast(`Restored ${n} items 🐸`);
            location.reload();
          }
        } catch (err) {
          toast('That file does not look like a Froggy Kitchen backup 😅');
        } finally { e.target.value = ''; }
      };
      reader.onerror = () => toast('Could not read that file 😅');
      reader.readAsText(file);
    });
    $('#clearBtn').addEventListener('click', () => {
      if (!confirm('Clear ALL Froggy Kitchen data on this device? This cannot be undone.')) return;
      S.clearAll();
      location.reload();
    });
  }

  function init() {
    renderThemeChips();
    applyTheme(state.theme); // head script already applied it pre-paint; this syncs state + chip highlight
    $('#greeting').textContent = greeting();
    renderPantry();
    renderCuisineChips();
    renderDietChips();
    renderServings();
    $('#cookTime').value = state.prefs.cookTime || '';
    $('#allergies').value = state.prefs.allergies || '';
    renderSettings();
    if (state.lastResults && state.lastResults.meals) renderResults();
    bindEvents();

    // service worker (offline app shell; iOS Safari supports SWs)
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is a bonus */ });
      });
    }

    // auto-backup: if the interval has elapsed since the last backup, save on load;
    // while the app stays open, re-check every minute (covers long sessions)
    if (backupDue()) setTimeout(() => triggerBackup(true), 1500);
    setInterval(() => { if (document.visibilityState === 'visible' && backupDue()) triggerBackup(true); }, 60000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
