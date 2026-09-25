/* Froggy Kitchen — LLM provider layer.
 * One thin interface: generateMeals(settings, request) -> { meals: [...] }
 * Providers: Anthropic Claude (default), Google Gemini, Groq. All called
 * directly from the browser; the API key never leaves this device except in
 * the request to the chosen provider. */

const FroggyProviders = (() => {
  const PROVIDERS = [
    {
      id: 'lmstudio',
      label: 'LM Studio · Local (free & private)',
      defaultModel: '', // discovered live from the server's /v1/models — no fixed default
      keyPlaceholder: 'only needed if LM Studio auth is on',
      hint: 'Runs entirely on your machine. In LM Studio: Developer tab → start the server, and switch ON “Enable CORS” in its Settings. Then pick a model below (Refresh re-checks what’s available).',
      local: true,
    },
    {
      id: 'anthropic',
      label: 'Claude · Anthropic (recommended)',
      defaultModel: 'claude-haiku-4-5',
      keyPlaceholder: 'sk-ant-…',
      hint: 'Get a key at console.anthropic.com. Haiku 4.5 is $1/$5 per M tokens — casual use costs well under $2/month.',
    },
    {
      id: 'gemini',
      label: 'Gemini · Google AI Studio (free tier)',
      defaultModel: 'gemini-2.5-flash',
      keyPlaceholder: 'AIza…',
      hint: 'Free API key at aistudio.google.com — no credit card needed.',
    },
    {
      id: 'groq',
      label: 'Groq (free tier)',
      defaultModel: 'llama-3.3-70b-versatile',
      keyPlaceholder: 'gsk_…',
      hint: 'Free API key at console.groq.com — no credit card needed.',
    },
  ];

  const SCHEMA = `{
  "meals": [
    {
      "name": "string — short, appetizing dish name",
      "description": "string — one or two mouth-watering sentences",
      "usedIngredients": ["EXACT pantry item names this recipe uses (verbatim from the provided list)"],
      "missingIngredients": ["everything else needed, with rough amounts, e.g. '200g feta cheese'"],
      "steps": ["4-8 short beginner-friendly steps, plain language, no jargon"],
      "cookTimeMin": 30,
      "servings": 2,
      "nutritionPerServing": { "calories": 450, "proteinG": 30, "carbsG": 45, "fatG": 16 },
      "healthNote": "string — one gentle positive sentence about why this is a good choice",
      "indulgent": false
    }
  ]
}`;

  const SYSTEM = [
    'You are the recipe engine inside "Froggy Kitchen", a friendly meal app for a beginner home cook.',
    'Persona: Chef Froggy, a tiny unbothered African dwarf frog in a chef hat. Warm, playful, encouraging. Health-positive language only — never diet-shaming, never guilt, never words like "cheat" or "bad food".',
    'Health rules: prioritize balanced meals (protein + vegetables + smart carbs). Default to calorie-conscious portions for the requested servings. If a meal is genuinely indulgent (fried, heavy cream, dessert-forward), set indulgent=true and say so honestly in one gentle line — never hide it.',
    'You MUST respond with ONLY valid JSON matching this exact schema — no markdown, no code fences, no commentary before or after:',
    SCHEMA,
    'Rules: return 3-5 meals. "usedIngredients" must be an EXACT subset of the pantry list provided (copy names verbatim) and may only contain ingredients that are genuinely in the recipe. "missingIngredients" lists everything else needed so a beginner could shop for it. Steps must be doable by someone who rarely cooks. nutritionPerServing is your best honest estimate for ONE serving. Respect maxCookTimeMin, servings, dietaryNotes and allergies strictly — an allergy means zero of that ingredient or its common cross-contacts.',
  ].join('\n');

  function buildUserMessage(req) {
    const payload = {
      pantry: req.pantry, // array of active (not used-up) ingredient names
      cuisine: req.cuisine, // e.g. "Italian" or "surprise"
      servings: req.servings,
      maxCookTimeMin: req.maxCookTimeMin || null,
      dietaryNotes: req.dietaryNotes, // e.g. ["vegetarian", "high-protein"]
      allergies: req.allergies || '',
    };
    let msg =
      'Plan meals now.\n' +
      JSON.stringify(payload) +
      '\nCuisine note: if cuisine is "surprise", pick a different fun cuisine for each meal. Return the JSON only.';

    // Ground the model's nutrition estimates in verified per-100 g facts (OpenNutrition database).
    if (typeof FroggyFoodDB !== 'undefined') {
      const facts = FroggyFoodDB.factsFor(req.pantry || []);
      if (facts.length) {
        msg +=
          '\nVerified nutrition per 100 g for your pantry items (OpenNutrition database):\n' +
          facts.map((f) => `- ${f.name}: ${f.c} kcal, protein ${f.p} g, carbs ${f.k} g, fat ${f.f} g`).join('\n') +
          '\nUse these values to compute honest nutritionPerServing estimates — never leave calories/protein/fat blank or zero for a meal that contains them.';
      }
    }
    return msg;
  }

  /* ---------------- provider calls ---------------- */

  async function callAnthropic(settings, req) {
    const base = (settings.proxyUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    const res = await fetch(base + '/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        // Allows calling the API straight from a browser (no backend needed).
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 4096,
        temperature: 0.7,
        system: SYSTEM,
        messages: [{ role: 'user', content: buildUserMessage(req) }],
      }),
    });
    if (!res.ok) throw new Error(await friendlyHttpError(res));
    const data = await res.json();
    const block = (data.content || []).find((b) => b.type === 'text');
    if (!block) throw new Error('The model returned no text. Try again.');
    return block.text;
  }

  async function callGemini(settings, req) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': settings.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: buildUserMessage(req) }] }],
        generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) throw new Error(await friendlyHttpError(res));
    const data = await res.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const text = parts.map((p) => p.text || '').join('');
    if (!text) throw new Error('The model returned no text. Try again.');
    return text;
  }

  async function callGroq(settings, req) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: buildUserMessage(req) },
        ],
      }),
    });
    if (!res.ok) throw new Error(await friendlyHttpError(res));
    const data = await res.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('The model returned no text. Try again.');
    return text;
  }

  /* Local inference (LM Studio) — OpenAI-compatible server on the user's machine */

  function localBase(settings) {
    return (String((settings && settings.serverUrl) || 'http://localhost:1234').trim() || 'http://localhost:1234').replace(/\/+$/, '');
  }

  /**
   * Diagnose why a local/LAN LM Studio URL can't be reached from this page —
   * browser security rules (Chrome Private Network Access, mixed content), not the app.
   * Returns an explanation string, or null when nothing specific applies (server down / CORS off).
   */
  function diagnoseLocalUrl(url, pageHref) {
    let host;
    try { host = new URL(String(url)).hostname.toLowerCase(); } catch { return null; }
    const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const isPrivateIp = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
    if (!isLoopback && !isPrivateIp) return null; // public URL — the generic error is fine

    const href = pageHref || (typeof location !== 'undefined' ? location.href : '');
    let proto = '', pageHost = '';
    try { const u = new URL(href); proto = u.protocol; pageHost = u.hostname.toLowerCase(); } catch {}
    const pageSecure = proto === 'https:';
    // file:// URLs have an empty hostname — opening index.html directly is a local usage
    const pageLocal = !proto || proto === 'file:' || ['localhost', '127.0.0.1', '::1'].includes(pageHost);

    if (pageSecure && !pageLocal) {
      // Viewing the app from a public HTTPS site (e.g. GitHub Pages).
      const wrongDevice = isLoopback
        ? `If you're on a different device (e.g. your phone), note that ${host} means *that* device, not your computer — use the computer's LAN IP instead (like http://192.168.x.x:8080). `
        : '';
      return `${wrongDevice}Browsers block HTTPS pages from calling local/LAN servers (Chrome's Private Network Access / mixed-content rules), and LM Studio doesn't send the header Chrome requires. Fix: on your computer run \`python3 -m http.server 8090 --bind 0.0.0.0\`, open that address here (e.g. http://192.168.x.x:8090), and set the server URL to the same IP with port 8080.`;
    }
    if (!pageSecure && isLoopback && !pageLocal) {
      return `${host} points at the device you're viewing this page on, not your computer. Use your computer's LAN IP instead (e.g. http://192.168.x.x:8080) and enable “Serve on local network” in LM Studio.`;
    }
    return null; // server down / CORS off — the generic message applies
  }

  /** Live list of the models LM Studio has available right now. */
  async function listLocalModels(settings) {
    const res = await fetch(localBase(settings) + '/v1/models', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(await friendlyHttpError(res));
    const data = await res.json();
    return (Array.isArray(data.data) ? data.data : [])
      .map((m) => String(m && m.id || '').trim())
      .filter(Boolean);
  }

  async function callLocal(settings, req) {
    const headers = { 'content-type': 'application/json' };
    if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`; // only when LM Studio auth is on
    const res = await fetch(localBase(settings) + '/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.7,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: buildUserMessage(req) },
        ],
      }),
    });
    if (!res.ok) throw new Error(await friendlyHttpError(res));
    const data = await res.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('The model returned no text. Try again.');
    return text;
  }

  async function friendlyHttpError(res) {
    let detail = '';
    try {
      const j = await res.json();
      detail = (j.error && (j.error.message || j.error)) || j.message || '';
    } catch (e) { /* ignore */ }
    if (res.status === 401 || res.status === 403) return 'That API key was rejected. Double-check it in Settings.';
    if (res.status === 429) return 'The provider is rate-limiting us or the account has no credits left. Try again in a minute, or switch providers in Settings.';
    if (res.status >= 500) return 'The provider had a hiccup. Give it a moment and try again.';
    return `Provider error (${res.status})${detail ? ': ' + String(detail).slice(0, 160) : ''}.`;
  }

  /* ---------------- JSON extraction & normalization ---------------- */

  function extractJSON(text) {
    let t = String(text).trim();
    // strip code fences if the model added them anyway
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('No JSON found in the model reply.');
    return JSON.parse(t.slice(start, end + 1));
  }

  function num(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, n) : fallback;
  }

  function strArr(v) {
    if (!Array.isArray(v)) return [];
    return v.map((s) => String(s).trim()).filter(Boolean).slice(0, 40);
  }

  /** Validate + coerce model output into the shape the UI renders. */
  function normalizeMeals(obj, req) {
    if (!obj || !Array.isArray(obj.meals)) throw new Error('The reply did not match the expected format.');
    const pantrySet = new Set((req.pantry || []).map((s) => s.toLowerCase()));

    const meals = obj.meals.slice(0, 6).map((m) => {
      if (!m || typeof m !== 'object' || !String(m.name || '').trim()) return null;
      const n = (m.nutritionPerServing && typeof m.nutritionPerServing === 'object') ? m.nutritionPerServing : {};
      // honest match score: only count pantry names the model actually listed
      const used = strArr(m.usedIngredients).filter((s) => pantrySet.has(s.toLowerCase()));

      let cal = Math.round(num(n.calories));
      let pro = Math.round(num(n.proteinG) * 10) / 10;
      let carb = Math.round(num(n.carbsG) * 10) / 10;
      let fat = Math.round(num(n.fatG) * 10) / 10;

      // If the model returned no nutrition at all, estimate it from the ingredient database
      // (clearly marked as estimated on the card). Rough assumption: ~125 g of the meal's
      // pantry ingredients per serving, split evenly across them.
      let nutritionEstimated = false;
      if (!cal && !pro && !carb && !fat) {
        const facts = used.map((u) => FroggyFoodDB.lookup(u)).filter(Boolean);
        if (facts.length) {
          const gramsEach = 125 / facts.length;
          cal = Math.round(facts.reduce((a, f) => a + (f.c * gramsEach) / 100, 0));
          pro = Math.round(facts.reduce((a, f) => a + (f.p * gramsEach) / 100, 0) * 10) / 10;
          carb = Math.round(facts.reduce((a, f) => a + (f.k * gramsEach) / 100, 0) * 10) / 10;
          fat = Math.round(facts.reduce((a, f) => a + (f.f * gramsEach) / 100, 0) * 10) / 10;
          nutritionEstimated = true;
        }
      }

      return {
        id: FroggyStore.uid(),
        name: String(m.name).trim().slice(0, 90),
        description: String(m.description || '').trim().slice(0, 300),
        usedIngredients: used,
        missingIngredients: strArr(m.missingIngredients),
        steps: strArr(m.steps).slice(0, 12),
        cookTimeMin: num(m.cookTimeMin),
        servings: Math.min(12, Math.max(1, Math.round(num(m.servings, req.servings || 2)) || (req.servings || 2))),
        nutritionPerServing: { calories: cal, proteinG: pro, carbsG: carb, fatG: fat },
        nutritionEstimated,
        healthNote: String(m.healthNote || '').trim().slice(0, 240),
        indulgent: m.indulgent === true,
      };
    }).filter(Boolean);

    if (!meals.length) throw new Error('The model returned no usable meals. Try again!');
    return { meals };
  }

  /* ---------------- public API ---------------- */

  async function generateMeals(settings, req) {
    const prov = providerById(settings.provider);
    const key = String(settings.apiKey || '').trim();
    if (!key && !prov.local) {
      const err = new Error('no-key');
      err.code = 'NO_KEY';
      throw err;
    }
    let model = String(settings.model || '').trim() || prov.defaultModel;
    if (prov.local && !model) {
      const err = new Error('Pick a model from the LM Studio list in Settings first.');
      err.code = 'NO_MODEL';
      throw err;
    }
    const s = { ...settings, apiKey: key, model };

    let text;
    try {
      if (s.provider === 'gemini') text = await callGemini(s, req);
      else if (s.provider === 'groq') text = await callGroq(s, req);
      else if (prov.local) text = await callLocal(s, req);
      else text = await callAnthropic(s, req); // default
    } catch (err) {
      if (err instanceof TypeError) {
        const diag = prov.local ? diagnoseLocalUrl(localBase(settings)) : null;
        throw new Error(prov.local
          ? `Could not reach LM Studio at ${localBase(settings)}.` + (diag ? ' ' + diag : ' Start the server in LM Studio and make sure “Enable CORS” is switched on.')
          : 'Could not reach the provider. Check your internet connection — or the API base URL in Settings.');
      }
      throw err;
    }

    return normalizeMeals(extractJSON(text), req);
  }

  function providerById(id) {
    return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];
  }

  return { PROVIDERS, generateMeals, providerById, listLocalModels, diagnoseLocalUrl };
})();
