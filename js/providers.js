/* Froggy Kitchen — LLM provider layer.
 * One thin interface: generateMeals(settings, request) -> { meals: [...] }
 * Providers: Anthropic Claude (default), Google Gemini, Groq. All called
 * directly from the browser; the API key never leaves this device except in
 * the request to the chosen provider. */

const FroggyProviders = (() => {
  const PROVIDERS = [
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
    return (
      'Plan meals now.\n' +
      JSON.stringify(payload) +
      '\nCuisine note: if cuisine is "surprise", pick a different fun cuisine for each meal. Return the JSON only.'
    );
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
      return {
        id: FroggyStore.uid(),
        name: String(m.name).trim().slice(0, 90),
        description: String(m.description || '').trim().slice(0, 300),
        usedIngredients: used,
        missingIngredients: strArr(m.missingIngredients),
        steps: strArr(m.steps).slice(0, 12),
        cookTimeMin: num(m.cookTimeMin),
        servings: Math.min(12, Math.max(1, Math.round(num(m.servings, req.servings || 2)) || (req.servings || 2))),
        nutritionPerServing: {
          calories: Math.round(num(n.calories)),
          proteinG: Math.round(num(n.proteinG) * 10) / 10,
          carbsG: Math.round(num(n.carbsG) * 10) / 10,
          fatG: Math.round(num(n.fatG) * 10) / 10,
        },
        healthNote: String(m.healthNote || '').trim().slice(0, 240),
        indulgent: m.indulgent === true,
      };
    }).filter(Boolean);

    if (!meals.length) throw new Error('The model returned no usable meals. Try again!');
    return { meals };
  }

  /* ---------------- public API ---------------- */

  async function generateMeals(settings, req) {
    const key = String(settings.apiKey || '').trim();
    if (!key) {
      const err = new Error('no-key');
      err.code = 'NO_KEY';
      throw err;
    }
    const model = String(settings.model || '').trim() || (PROVIDERS.find((p) => p.id === settings.provider) || {}).defaultModel;
    const s = { ...settings, apiKey: key, model };

    let text;
    try {
      if (s.provider === 'gemini') text = await callGemini(s, req);
      else if (s.provider === 'groq') text = await callGroq(s, req);
      else text = await callAnthropic(s, req); // default
    } catch (err) {
      if (err instanceof TypeError) throw new Error('Could not reach the provider. Check your internet connection — or the API base URL in Settings.');
      throw err;
    }

    return normalizeMeals(extractJSON(text), req);
  }

  function providerById(id) {
    return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];
  }

  return { PROVIDERS, generateMeals, providerById };
})();
