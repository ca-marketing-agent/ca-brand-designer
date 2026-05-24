// ══════════════════════════════════════════════════════
//  CA Brand Designer — app.js
// ══════════════════════════════════════════════════════

// ── STATE ────────────────────────────────────────────
const state = {
  currentStep: 1,
  logoBase64: null,
  refImages: [],      // [{name, base64, mimeType}]
  analysis: null,     // Gemini analysis result
  generatedImages: [], // [{url|base64, engine, prompt}]
  selectedEngine: 'gemini',
};

// ── BACKEND PROXY ─────────────────────────────────────
// Gemini API key is held server-side by the Cloudflare Worker.
const WORKER_URL = 'https://ca-brand-designer-proxy.ca80417520.workers.dev';

// ── API KEYS (localStorage) ───────────────────────────
const KEYS = {
  get gemini()  { return 'worker'; }, // proxied — always available
  get freepik() { return localStorage.getItem('ca_freepik_key') || ''; },
  get canva()   { return localStorage.getItem('ca_canva_key')   || ''; },
};

// ── INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadApiKeyFields();
  updateStatusIndicators();
  initDragDrop();
  state.selectedEngine = 'gemini';
  selectEngine('gemini');
  updateNavStatus();
  buildPromptFromBrand();

  // Color picker sync
  document.getElementById('colorPicker').addEventListener('input', e => {
    const inputs = document.querySelectorAll('.brand-color-input');
    for (const inp of inputs) {
      if (!inp.value.trim()) { inp.value = e.target.value; break; }
    }
  });
});

// ── STEP NAVIGATION ───────────────────────────────────
function goStep(n) {
  if (n < 1 || n > 4) return;
  state.currentStep = n;
  document.querySelectorAll('.step-panel').forEach((p, i) => {
    p.classList.toggle('active', i + 1 === n);
  });
  document.querySelectorAll('.step-item').forEach(item => {
    const s = parseInt(item.dataset.step);
    item.classList.remove('active', 'done');
    if (s === n) item.classList.add('active');
    else if (s < n) item.classList.add('done');
  });
  document.getElementById('prevBtn').style.display = n > 1 ? '' : 'none';
  document.getElementById('nextBtn').textContent = n === 4 ? '完成 ✓' : '下一步 →';
  updateNavStatus();
  if (n === 3) buildPromptFromBrand();
  if (n === 4) renderExportStep();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function nextStep() {
  if (state.currentStep === 4) { toast('已完成所有步驟！', 'success'); return; }
  if (!validateStep(state.currentStep)) return;
  goStep(state.currentStep + 1);
}
function prevStep() { goStep(state.currentStep - 1); }

function validateStep(step) {
  if (step === 1) {
    if (!document.getElementById('brandName').value.trim()) {
      toast('請填寫品牌名稱', 'error'); return false;
    }
    if (!document.getElementById('designGoal').value.trim()) {
      toast('請填寫設計目標', 'error'); return false;
    }
    if (!document.getElementById('platform').value) {
      toast('請選擇使用平台', 'error'); return false;
    }
  }
  return true;
}

function updateNavStatus() {
  const labels = ['品牌設定', '風格參考', 'AI 生圖', '匯出設計'];
  document.getElementById('navStatus').textContent =
    `步驟 ${state.currentStep} / 4 — ${labels[state.currentStep - 1]}`;
}

// ── SETTINGS MODAL ────────────────────────────────────
function openSettings() {
  loadApiKeyFields();
  document.getElementById('settingsModal').classList.add('open');
}
function closeSettings() {
  document.getElementById('settingsModal').classList.remove('open');
}
document.getElementById('settingsModal').addEventListener('click', e => {
  if (e.target === document.getElementById('settingsModal')) closeSettings();
});

function loadApiKeyFields() {
  const f = document.getElementById('freepikKey');
  const c = document.getElementById('canvaKey');
  if (f) f.value = KEYS.freepik;
  if (c) c.value = KEYS.canva;
}

function saveSettings() {
  const fEl = document.getElementById('freepikKey');
  const cEl = document.getElementById('canvaKey');
  const f = fEl ? fEl.value.trim() : '';
  const c = cEl ? cEl.value.trim() : '';
  if (f) localStorage.setItem('ca_freepik_key', f);
  else   localStorage.removeItem('ca_freepik_key');
  if (c) localStorage.setItem('ca_canva_key', c);
  else   localStorage.removeItem('ca_canva_key');
  updateStatusIndicators();
  closeSettings();
  toast('設定已儲存', 'success');
}

function updateStatusIndicators() {
  const set = (id, ok, label) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = ok
      ? `<span class="status-ok">✅ 已設定</span>`
      : `<span class="status-missing">⚪ ${label}</span>`;
  };
  set('freepikStatus', !!KEYS.freepik, '未設定');
  set('canvaStatus',   !!KEYS.canva,   '未設定（可選）');
}

// ── PILL / CHECKBOX HELPERS ───────────────────────────
function togglePill(el, ev) {
  if (ev && ev.target && ev.target.tagName === 'INPUT') return;
  el.classList.toggle('active');
}
function getActivePills(groupId) {
  return [...document.querySelectorAll(`#${groupId} .pill.active`)]
    .map(p => p.querySelector('input').value);
}

// ── LOGO UPLOAD ───────────────────────────────────────
function handleLogoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    state.logoBase64 = e.target.result;
    document.getElementById('logoPlaceholder').style.display = 'none';
    const img = document.getElementById('logoPreview');
    img.src = e.target.result;
    img.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

// ── REFERENCE IMAGE UPLOAD ────────────────────────────
function handleRefUpload(input) {
  const files = [...input.files];
  const remaining = 4 - state.refImages.length;
  if (remaining <= 0) { toast('最多 4 張參考圖', 'info'); return; }
  files.slice(0, remaining).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      state.refImages.push({
        name: file.name,
        base64: e.target.result.split(',')[1],
        dataUrl: e.target.result,
        mimeType: file.type || 'image/jpeg',
      });
      renderRefImages();
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function renderRefImages() {
  const grid = document.getElementById('refImagesGrid');
  grid.innerHTML = state.refImages.map((img, i) => `
    <div class="ref-img-wrap">
      <img src="${img.dataUrl}" alt="${img.name}">
      <button class="ref-img-remove" onclick="removeRefImage(${i})" title="移除">✕</button>
    </div>
  `).join('');
}

function removeRefImage(idx) {
  state.refImages.splice(idx, 1);
  renderRefImages();
}

function initDragDrop() {
  const zone = document.getElementById('refDropZone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const dt = e.dataTransfer;
    if (dt.files.length) handleRefUpload({ files: dt.files, value: '' });
  });
}

// ── GEMINI VISION ANALYSIS ────────────────────────────
async function analyzeStyle() {
  if (state.refImages.length === 0) {
    toast('請先上傳至少 1 張參考圖', 'error');
    return;
  }

  document.getElementById('analyzeBtn').disabled = true;
  document.getElementById('analysisLoading').style.display = 'flex';
  document.getElementById('analysisResults').style.display = 'none';

  const steps = ['ls1','ls2','ls3','ls4','ls5'];
  let stepIdx = 0;
  const stepTimer = setInterval(() => {
    if (stepIdx > 0) document.getElementById(steps[stepIdx-1]).className = 'loading-step done';
    if (stepIdx < steps.length) {
      document.getElementById(steps[stepIdx]).className = 'loading-step active';
      stepIdx++;
    }
  }, 1200);

  const brandName = document.getElementById('brandName').value.trim() || '此品牌';
  const platform  = document.getElementById('platform').value || '社群媒體';
  const tones     = getActivePills('toneGroup').join(', ') || '不限';

  const imageParts = state.refImages.map(img => ({
    inlineData: { mimeType: img.mimeType, data: img.base64 }
  }));

  const textPrompt = `
你是一位擁有 20 年國際品牌設計經驗的視覺藝術總監，曾服務 LG、Samsung、SHISEIDO、CITI BANK 等國際品牌，精通色彩理論、印刷學、字體學、構圖法則、設計史、攝影美學。

請對以下 ${state.refImages.length} 張參考圖進行**極度精準**的設計分析，為品牌「${brandName}」萃取可直接落地的視覺語言。
目標平台：${platform}。期望調性：${tones}。

分析要求：
- 配色必須給出**準確的 HEX**（不只大略色相，要逐像素估算）
- 字體要點明**字族分類**（Serif/Sans/Slab/Script/Display/Mono）與**情緒氣質**
- 構圖要套用**設計史術語**（黃金比例、三分法、對稱、不對稱平衡、網格系統、留白哲學）
- 光影要描述**光源方向、硬度、色溫、陰影特徵**
- 一定要點明所屬**設計流派**（Swiss/Bauhaus/Memphis/Brutalism/Y2K/Japandi/Wabi-sabi 等）

僅輸出 JSON，**不要其他文字、不要 markdown 標記**。結構如下：
{
  "colors": [
    {"hex": "#XXXXXX", "role": "Primary/Secondary/Accent/Neutral/Background", "name": "中文色名"}
  ],
  "colorHarmony": "色彩和諧模式（Complementary/Analogous/Triadic/Monochromatic/Split-complementary）+ 1 句解釋",
  "designMovement": "設計流派（例如：Swiss Modernism、Japandi、Y2K Retro-futurism）",
  "styleTags": ["標籤1", "標籤2", "標籤3", "標籤4", "標籤5", "標籤6"],
  "typography": {
    "classification": "字族分類（如 Geometric Sans / Humanist Serif）",
    "weight": "字重特徵（Thin/Light/Regular/Medium/Bold/Black）",
    "hierarchy": "資訊層級處理方式（1–2 句）",
    "pairing": "建議的字體搭配（中英文各 1 種，可舉具體字型）"
  },
  "layout": "版型結構（網格系統、欄位數、邊距、區塊比例，2–3 句）",
  "composition": "構圖法則與焦點分布（術語精準，2–3 句）",
  "lighting": "光線特徵（方向/硬度/色溫/陰影，1–2 句）",
  "texture": "材質與表面質感（霧面/光面/紙感/金屬感/顆粒/漸層，1 句）",
  "negativeSpace": "留白與呼吸感策略（1 句）",
  "mood": "情緒氛圍（3–5 個形容詞 + 1 句總結）",
  "visualElements": ["明顯出現的視覺元素（如：圓點、線條、漸層、剪影、幾何圖形、植物、書法筆觸…），列 4–6 項"],
  "culturalReference": "文化/時代/地域參照（例如：1960s 美式包浩斯、東京銀座精品、北歐 Mid-century）",
  "recommendation": "給設計師的具體落地建議（5–7 句中文，要實際到能直接執行）",
  "englishPrompt": "一段 150–250 字的專業英文 Imagen prompt，要包含：[Subject 主體] + [Composition 構圖] + [Lighting 光線] + [Color Palette HEX 色票] + [Typography 字體質感] + [Texture & Material] + [Photography terms 例如 medium format, 85mm lens, shallow DOF] + [Quality modifiers 例如 award-winning, editorial, 8K, ultra-detailed, sharp focus, professional grade]，融合品牌調性與參考圖風格，文字流暢不要條列。"
}
`;

  try {
    const res = await fetch(`${WORKER_URL}/vision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [...imageParts, { text: textPrompt }]
        }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 8192 }
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonStr = raw.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    const parsed = JSON.parse(jsonStr);

    clearInterval(stepTimer);
    steps.forEach(s => document.getElementById(s).className = 'loading-step done');

    state.analysis = parsed;
    renderAnalysisResults(parsed);
    document.getElementById('analysisLoading').style.display = 'none';
    document.getElementById('analysisResults').style.display = 'block';
    document.getElementById('analyzeBtn').disabled = false;
    toast('風格分析完成！', 'success');

  } catch (err) {
    clearInterval(stepTimer);
    document.getElementById('analysisLoading').style.display = 'none';
    document.getElementById('analyzeBtn').disabled = false;
    toast('分析失敗：' + err.message, 'error');
    console.error('Gemini analysis error:', err);
  }
}

function renderAnalysisResults(data) {
  // Normalize colors: accept either ["#hex"] or [{hex, role, name}]
  const colorObjs = (data.colors || []).map(c =>
    typeof c === 'string' ? { hex: c, role: '', name: '' } : c
  );

  // Color swatches with role + name
  const colorsEl = document.getElementById('resultColors');
  colorsEl.innerHTML = colorObjs.map(c => `
    <div class="swatch" style="background:${c.hex}" onclick="copyText('${c.hex}')" title="${c.hex} ${c.role || ''} ${c.name || ''}">
      <div class="swatch-tooltip">
        <strong>${c.hex}</strong>${c.role ? `<br><span style="opacity:.7;font-size:.7rem;">${c.role}${c.name ? ' · ' + c.name : ''}</span>` : ''}
      </div>
    </div>
  `).join('');

  // Color strip
  const strip = document.getElementById('colorStrip');
  strip.innerHTML = colorObjs.map(c =>
    `<div class="brand-color-seg" style="background:${c.hex}" onclick="copyText('${c.hex}')" title="${c.hex} ${c.role || ''}"></div>`
  ).join('');

  // Style tags
  document.getElementById('resultStyleTags').innerHTML =
    (data.styleTags || []).map(t => `<div class="style-tag">${t}</div>`).join('');

  // Typography (object or string)
  const typo = data.typography;
  const typoText = typeof typo === 'string'
    ? typo
    : typo
      ? [
          typo.classification && `<strong>分類：</strong>${typo.classification}`,
          typo.weight && `<strong>字重：</strong>${typo.weight}`,
          typo.hierarchy && `<strong>層級：</strong>${typo.hierarchy}`,
          typo.pairing && `<strong>建議搭配：</strong>${typo.pairing}`,
        ].filter(Boolean).join('<br>')
      : '—';
  document.getElementById('resultTypography').innerHTML = typoText;

  // Standard fields
  document.getElementById('resultLayout').textContent      = data.layout       || '—';
  document.getElementById('resultMood').textContent        = data.mood         || '—';
  document.getElementById('resultComposition').textContent = data.composition  || '—';

  // Extended fields — render into the extra container if it exists
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
  setText('resultDesignMovement',    data.designMovement);
  setText('resultColorHarmony',      data.colorHarmony);
  setText('resultLighting',          data.lighting);
  setText('resultTexture',           data.texture);
  setText('resultNegativeSpace',     data.negativeSpace);
  setText('resultCulturalReference', data.culturalReference);

  // Visual elements as chips
  const veEl = document.getElementById('resultVisualElements');
  if (veEl) {
    veEl.innerHTML = (data.visualElements || []).map(v => `<div class="style-tag">${v}</div>`).join('') || '—';
  }

  // Recommendation
  document.getElementById('resultRecommendation').textContent = data.recommendation || '—';

  // Auto-fill prompt — keep the analysis prompt separate from base so user sees the rich detail
  if (data.englishPrompt) {
    const brandPrompt = buildBasePrompt();
    document.getElementById('mainPrompt').value =
      `${data.englishPrompt}\n\n${brandPrompt}`;
  }
}

function skipAnalysis() {
  document.getElementById('analysisResults').style.display = 'none';
  toast('已跳過分析，請手動填寫 Prompt', 'info');
}

// ── PROMPT BUILDER ────────────────────────────────────
// Engineered to produce editorial-grade, award-quality output from Imagen 4.
function buildBasePrompt() {
  const name     = document.getElementById('brandName').value.trim();
  const goal     = document.getElementById('designGoal').value.trim();
  const platform = document.getElementById('platform').value;
  const tones    = getActivePills('toneGroup');
  const colors   = [...document.querySelectorAll('.brand-color-input')]
    .map(i => i.value.trim()).filter(Boolean);

  // Platform-specific cinematography hints
  const platformHint = {
    'Instagram':         'editorial social-media composition, mobile-first framing, strong focal point',
    'Facebook':          'engaging social composition, clear focal hierarchy',
    'LINE':              'clean readable composition optimized for mobile preview',
    '官網 Hero':         'cinematic hero composition, wide negative space for headline overlay',
    'Banner 廣告':       'horizontal banner composition with clear product hero and headline-safe negative space',
    '海報':              'poster-grade composition, strong typographic hierarchy support, print-ready',
    'EDM':               'editorial newsletter composition, balanced eye-flow from top to bottom',
    '產品包裝':           'product packaging mockup, premium retail context, studio shelf lighting',
  }[platform] || 'professional editorial composition';

  // Tone → cinematic descriptors
  const toneMap = {
    'Bold 大膽衝擊':   'bold confident energy, high-impact visuals, dramatic contrast',
    'Minimalist 極簡': 'minimalist Japandi aesthetic, generous negative space, refined restraint',
    'Energetic 活力':  'kinetic energy, vibrant saturation, dynamic motion lines',
    'Professional 專業': 'corporate sophistication, polished editorial quality, refined typography',
    'Luxury 奢華':     'luxury fashion editorial, Hasselblad shot, soft directional studio light, premium materials',
    'Playful 趣味':    'playful Memphis-inspired energy, bouncy geometry, joyful palette',
    'Dark 暗黑酷':     'moody chiaroscuro lighting, deep shadows, cinematic noir mood',
    'Clean 清爽':      'Swiss design clarity, crisp grid system, breathable whitespace',
    'Retro 復古':      'retro 70s/80s analog grain, nostalgic palette, vintage print quality',
    'Futuristic 未來感': 'Y2K cyber-futurism, holographic gradients, neo-chrome highlights',
    'Sporty 運動感':   'athletic dynamic energy, motion blur trails, high-performance gear aesthetic',
    'Warm 溫暖':       'warm golden hour light, organic textures, hand-crafted artisanal feel',
  };
  const tonePhrases = tones.map(t => toneMap[t] || t).filter(Boolean);

  // Build a multi-clause, professionally engineered prompt
  const segments = [];

  if (goal) {
    segments.push(`Subject: ${goal}`);
  }
  if (name) {
    segments.push(`Brand identity: ${name}`);
  }
  if (tonePhrases.length) {
    segments.push(`Style direction: ${tonePhrases.join('; ')}`);
  }
  if (colors.length) {
    segments.push(`Brand color palette (must dominate the image): ${colors.join(', ')}`);
  }
  segments.push(`Composition: ${platformHint}, rule-of-thirds, strong focal hierarchy, balanced negative space`);
  segments.push('Lighting: studio-grade directional lighting, soft key with subtle rim light, accurate color temperature, gentle shadow falloff');
  segments.push('Camera & lens: medium-format Hasselblad H6D-100c equivalent, 80mm prime lens, shallow depth of field, tack-sharp focus on focal subject, creamy bokeh fall-off');
  segments.push('Material & texture: physically accurate materials, micro-surface detail, photoreal subsurface scattering, no plastic-looking surfaces');
  segments.push('Color grading: cinematic color science, balanced highlights and shadows, no clipping, true-to-brand HEX values');
  segments.push('Post-production: subtle film grain, no over-sharpening, no HDR halos, no artefacts, no text artefacts, no warped letterforms');
  segments.push('Quality: award-winning editorial photography, Communication Arts Annual quality, commercial advertising grade, 8K ultra-detailed, photoreal, sharp focus, professional retouching, magazine-cover finish');

  return segments.join('. ') + '.';
}

function buildPromptFromBrand() {
  const existing = document.getElementById('mainPrompt')?.value?.trim();
  if (existing && state.analysis) return; // Don't overwrite if analysis already set
  const prompt = document.getElementById('mainPrompt');
  if (prompt) prompt.value = buildBasePrompt();
}

// ── ENGINE SELECTION ──────────────────────────────────
function selectEngine(engine) {
  state.selectedEngine = engine;
  ['gemini','freepik','both'].forEach(e => {
    const card = document.getElementById(`ec-${e}`);
    if (!card) return;
    card.classList.remove('selected-gemini','selected-freepik');
    if (e === engine) card.classList.add(`selected-${engine === 'both' ? 'gemini' : engine}`);
  });
  checkApiWarning();
}

function checkApiWarning() {
  const warn = document.getElementById('apiKeyWarning');
  if (!warn) return;
  const e = state.selectedEngine;
  if ((e === 'freepik' || e === 'both') && !KEYS.freepik) {
    warn.textContent = '⚠️ 需要 Freepik API Key';
  } else {
    warn.textContent = '';
  }
}

// ── IMAGE GENERATION ──────────────────────────────────
async function generateImages() {
  const prompt = document.getElementById('mainPrompt').value.trim();
  if (!prompt) { toast('請填寫 Prompt', 'error'); return; }

  const engine = state.selectedEngine;
  if ((engine === 'freepik' || engine === 'both') && !KEYS.freepik) {
    toast('請先設定 Freepik API Key', 'error'); openSettings(); return;
  }

  document.getElementById('generateBtn').disabled = true;
  document.getElementById('genLoading').style.display = 'block';
  document.getElementById('genResults').style.display = 'none';
  document.getElementById('genLoadingText').textContent = 'AI 生圖中，請稍候…';

  state.generatedImages = [];

  try {
    const count = parseInt(document.getElementById('imageCount').value);
    const size  = document.getElementById('imageSize').value;
    const neg   = document.getElementById('negativePrompt').value.trim();

    if (engine === 'gemini') {
      await generateGemini(prompt, count, size);
    } else if (engine === 'freepik') {
      await generateFreepik(prompt, count, size, neg);
    } else if (engine === 'both') {
      const half = Math.max(1, Math.floor(count / 2));
      await generateGemini(prompt, half, size);
      await generateFreepik(prompt, half, size, neg);
    }

    renderResultsGrid();
    document.getElementById('genLoading').style.display = 'none';
    document.getElementById('genResults').style.display = 'block';
    toast(`生成完成！共 ${state.generatedImages.length} 張，可送 Magnific 升級`, 'success');
  } catch (err) {
    document.getElementById('genLoading').style.display = 'none';
    toast('生圖失敗：' + err.message, 'error');
    console.error('Generation error:', err);
  }

  document.getElementById('generateBtn').disabled = false;
}

// Gemini Imagen 4 — Standard / Ultra / Fast
async function generateGemini(prompt, count, sizeKey) {
  const quality = document.getElementById('imageQuality')?.value || 'standard';
  const qualityRoute = {
    standard: '/imagen',
    ultra:    '/imagen-ultra',
    fast:     '/imagen-fast',
  }[quality] || '/imagen';
  const qualityLabel = { standard: 'Standard', ultra: 'Ultra', fast: 'Fast' }[quality];

  // Ultra only supports 1 image at a time — coerce
  const effectiveCount = quality === 'ultra' ? 1 : count;

  document.getElementById('genLoadingText').textContent =
    `Imagen 4 ${qualityLabel} 生圖中… (${effectiveCount} 張)`;

  const aspectMap = {
    square_1_1:    '1:1',
    portrait_2_3:  '3:4',
    landscape_4_3: '4:3',
    landscape_16_9:'16:9',
  };
  const aspect = aspectMap[sizeKey] || '1:1';

  const res = await fetch(`${WORKER_URL}${qualityRoute}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: effectiveCount,
        aspectRatio: aspect,
        safetyFilterLevel: 'block_only_high',
        personGeneration: 'allow_adult',
      }
    })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error('Gemini: ' + (err.error?.message || `HTTP ${res.status}`));
  }

  const data = await res.json();
  (data.predictions || []).forEach(pred => {
    const b64 = pred.bytesBase64Encoded;
    const mime = pred.mimeType || 'image/png';
    if (b64) {
      state.generatedImages.push({
        dataUrl: `data:${mime};base64,${b64}`,
        engine: 'gemini',
        quality,
        prompt,
      });
    }
  });
}

// Freepik Mystic (async polling)
async function generateFreepik(prompt, count, sizeKey, negPrompt) {
  document.getElementById('genLoadingText').textContent = 'Freepik Mystic 生圖中…';

  const sizeMap = {
    square_1_1:    'square_1_1',
    portrait_2_3:  'portrait_2_3',
    landscape_4_3: 'landscape_4_3',
    landscape_16_9:'widescreen_16_9',
  };

  const body = {
    prompt,
    negative_prompt: negPrompt || 'blurry, low quality, watermark, distorted',
    guidance_scale: 7,
    num_inference_steps: 30,
    num_images: count,
    image: { size: sizeMap[sizeKey] || 'square_1_1' },
    styling: { style: 'photo' },
  };

  const createRes = await fetch('https://api.freepik.com/v1/ai/mystic', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Freepik-API-Key': KEYS.freepik,
    },
    body: JSON.stringify(body),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error('Freepik: ' + (err.message || `HTTP ${createRes.status}`));
  }

  const createData = await createRes.json();
  const taskId = createData.data?.task_id;
  if (!taskId) throw new Error('Freepik: 未取得 task_id');

  // Poll until done
  const imageUrls = await pollFreepik(taskId);
  imageUrls.forEach(url => {
    state.generatedImages.push({ dataUrl: url, engine: 'freepik', prompt });
  });
}

async function pollFreepik(taskId, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    await sleep(2000);
    document.getElementById('genLoadingText').textContent =
      `Freepik 生圖中… (${i+1}/${maxRetries})`;

    const res = await fetch(`https://api.freepik.com/v1/ai/mystic/${taskId}`, {
      headers: { 'X-Freepik-API-Key': KEYS.freepik },
    });
    if (!res.ok) continue;

    const data = await res.json();
    const status = data.data?.status || data.data?.task_status;

    if (status === 'COMPLETED' || status === 'SUCCESS') {
      const imgs = data.data?.generated_images || data.data?.images || [];
      return imgs.map(img => img.url || img).filter(Boolean);
    }
    if (status === 'FAILED' || status === 'ERROR') {
      throw new Error('Freepik 生圖失敗');
    }
  }
  throw new Error('Freepik 逾時（超過 60 秒）');
}

function renderResultsGrid() {
  const grid = document.getElementById('resultsGrid');
  grid.innerHTML = state.generatedImages.map((img, i) => `
    <div class="result-card">
      <div class="result-img-wrap">
        <img src="${img.dataUrl}" alt="Generated ${i+1}" loading="lazy">
        <div class="engine-label label-${img.engine}">
          ${img.engine === 'gemini' ? '🔵 Gemini' : '🟠 Freepik'}
        </div>
      </div>
      <div class="result-actions">
        <button class="btn btn-secondary btn-sm" onclick="downloadImage(${i})">⬇ 下載</button>
        <button class="btn btn-sm" onclick="openMagnificWithIdx(${i})" style="background:linear-gradient(135deg,#FF1493,#C71585);color:white;">Magnific 升級</button>
        <button class="btn btn-canva btn-sm" onclick="openCanvaWithIdx(${i})">Canva →</button>
      </div>
    </div>
  `).join('');
}

// ── EXPORT STEP ───────────────────────────────────────
function renderExportStep() {
  // Color palette
  const paletteEl = document.getElementById('exportColorPalette');
  if (state.analysis?.colors?.length) {
    paletteEl.innerHTML = `
      <div class="brand-color-strip" style="height:60px;margin-bottom:12px;">
        ${state.analysis.colors.map(hex =>
          `<div class="brand-color-seg" style="background:${hex}" onclick="copyText('${hex}')" title="${hex}"></div>`
        ).join('')}
      </div>
      <div class="color-palette">
        ${state.analysis.colors.map(hex => `
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
            <div class="swatch" style="background:${hex}" onclick="copyText('${hex}')">
              <div class="swatch-tooltip">${hex}</div>
            </div>
            <div style="font-size:.65rem;color:var(--muted);">${hex}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Image list
  const listEl = document.getElementById('exportImageList');
  if (state.generatedImages.length === 0) {
    listEl.innerHTML = '<div style="color:var(--muted);font-size:.85rem;">請先在「AI 生圖」步驟生成圖片</div>';
    return;
  }
  listEl.innerHTML = `
    <div class="results-grid">
      ${state.generatedImages.map((img, i) => `
        <div class="result-card">
          <div class="result-img-wrap">
            <img src="${img.dataUrl}" alt="Generated ${i+1}">
            <div class="engine-label label-${img.engine}">
              ${img.engine === 'gemini' ? '🔵 Gemini' : '🟠 Freepik'}
            </div>
          </div>
          <div class="result-actions">
            <button class="btn btn-secondary btn-sm" onclick="downloadImage(${i})">⬇ 下載</button>
            <button class="btn btn-canva btn-sm" onclick="openCanvaWithIdx(${i})">Canva →</button>
          </div>
        </div>
      `).join('')}
    </div>
    <div style="margin-top:16px;">
      <button class="btn btn-secondary" onclick="downloadAll()">⬇ 全部下載</button>
    </div>
  `;
}

// ── DOWNLOAD ──────────────────────────────────────────
function downloadImage(idx) {
  const img = state.generatedImages[idx];
  if (!img) return;
  const a = document.createElement('a');
  a.href = img.dataUrl;
  a.download = `ca-design-${idx+1}-${img.engine}.png`;
  a.click();
  toast('圖片下載中…', 'info');
}

function downloadAll() {
  if (state.generatedImages.length === 0) { toast('沒有圖片可下載', 'error'); return; }
  state.generatedImages.forEach((_, i) => {
    setTimeout(() => downloadImage(i), i * 500);
  });
  toast(`開始下載 ${state.generatedImages.length} 張圖片`, 'info');
}

// ── MAGNIFIC INTEGRATION ──────────────────────────────
function openMagnific() {
  if (state.generatedImages.length > 0) {
    openMagnificWithIdx(0);
  } else {
    window.open('https://magnific.ai', '_blank');
    toast('請上傳要升級的圖片到 Magnific', 'info');
  }
}

function openMagnificWithIdx(idx) {
  const img = state.generatedImages[idx];
  if (!img) return;
  downloadImage(idx);
  setTimeout(() => {
    window.open('https://magnific.ai', '_blank');
    toast('圖片已下載 → 在 Magnific 上傳並選 Upscale', 'success');
  }, 800);
}

// ── CANVA INTEGRATION ─────────────────────────────────
function openCanvaWithImage() {
  if (state.generatedImages.length > 0) {
    openCanvaWithIdx(0);
  } else {
    window.open('https://www.canva.com/create/', '_blank');
    toast('請在 Canva 上傳設計素材', 'info');
  }
}

function openCanvaWithIdx(idx) {
  const img = state.generatedImages[idx];
  if (!img) return;
  // Download the image first
  downloadImage(idx);
  // Then open Canva after brief delay
  setTimeout(() => {
    const platform = document.getElementById('platform').value;
    let canvaUrl = 'https://www.canva.com/create/';
    if (platform.includes('Instagram') && platform.includes('1:1')) canvaUrl = 'https://www.canva.com/create/instagram-posts/';
    else if (platform.includes('限時動態') || platform.includes('9:16')) canvaUrl = 'https://www.canva.com/create/instagram-stories/';
    else if (platform.includes('Facebook 封面')) canvaUrl = 'https://www.canva.com/create/facebook-covers/';
    else if (platform.includes('海報')) canvaUrl = 'https://www.canva.com/create/posters/';
    else if (platform.includes('名片')) canvaUrl = 'https://www.canva.com/create/business-cards/';
    window.open(canvaUrl, '_blank');
    toast('圖片已下載，請在 Canva 上傳作為底圖', 'success');
  }, 800);
}

// ── FREEPIK SEARCH ────────────────────────────────────
function searchFreepik() {
  const tags = state.analysis?.styleTags || [];
  const brand = document.getElementById('brandName').value.trim();
  const industry = document.getElementById('industry').value;
  const terms = [...tags.slice(0,3), brand, industry].filter(Boolean).join(' ');
  const query = encodeURIComponent(terms || 'brand design');
  window.open(`https://www.freepik.com/search?query=${query}&type=vector`, '_blank');
}

function copyPrompt() {
  const prompt = document.getElementById('mainPrompt')?.value?.trim();
  if (!prompt) { toast('沒有 Prompt', 'error'); return; }
  copyText(prompt);
}

// ── UTILS ─────────────────────────────────────────────
function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    toast(`已複製：${text.slice(0, 40)}${text.length > 40 ? '…' : ''}`, 'success');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    toast('已複製到剪貼簿', 'success');
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── TOAST ─────────────────────────────────────────────
function toast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type] || '💬'}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'slideIn .3s ease reverse';
    setTimeout(() => el.remove(), 280);
  }, 3500);
}
