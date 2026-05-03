/**
 * Brand Analyzer — клиентская логика.
 * Архитектура: слой данных → UI → BrandAnalysisService (сейчас мок, позже OpenAI).
 */

(function () {
  "use strict";

  // ——— Константы ———
  const MIN_IMAGES_QUALITY = 9;
  const MAX_IMAGES = 30;
  const MOODBOARD_MIN = 9;
  const MOODBOARD_MAX = 12;
  const DNA_FILENAME = "brand-analyzer-dna.html";
  const MOODBOARD_FILENAME = "brand-analyzer-moodboard.html";
  const MOODBOARD_FILENAME_PNG = "brand-analyzer-moodboard.png";
  const MOODBOARD_FILENAME_PDF = "brand-analyzer-moodboard.pdf";
  const THEME_STORAGE_KEY = "brand-analyzer-theme";

  /** 12 архетипов Марк и Пирсон (для маппинга и будущего API) */
  const ARCHETYPES = [
    { id: "innocent", ru: "Невинный" },
    { id: "everyman", ru: "Муж на улице" },
    { id: "hero", ru: "Герой" },
    { id: "outlaw", ru: "Бунтарь" },
    { id: "explorer", ru: "Искатель" },
    { id: "creator", ru: "Творец" },
    { id: "ruler", ru: "Правитель" },
    { id: "magician", ru: "Волшебник" },
    { id: "lover", ru: "Любовник" },
    { id: "caregiver", ru: "Опекун" },
    { id: "jester", ru: "Шут" },
    { id: "sage", ru: "Мудрец" },
  ];

  // ——— Состояние сессии (без localStorage) ———
  const state = {
    images: [], // { id, file, url, priority }
    analysis: null, // { rows, visualNarrative, recommendations }
    moodboard: [], // { imageId }
    dnaTableHtml: "",
  };

  let imageIdSeq = 0;
  let splitReviewNextId = 0;
  /** @type {{ originalFile: File, items: { blob: Blob, url: string, tempId: number }[], resolve: function(any): void, hint: string } | null} */
  let splitReviewPending = null;

  // ——— DOM ———
  const el = {
    fileInput: document.getElementById("fileInput"),
    btnUpload: document.getElementById("btnUploadImages"),
    gallery: document.getElementById("gallery"),
    counter: document.getElementById("imageCounter"),
    warnMin: document.getElementById("warnMinImages"),
    infoMax: document.getElementById("infoMaxImages"),
    splitBusy: document.getElementById("splitBusy"),
    splitHint: document.getElementById("splitHint"),
    splitReviewSection: document.getElementById("splitReviewSection"),
    splitReviewLead: document.getElementById("splitReviewLead"),
    splitReviewGrid: document.getElementById("splitReviewGrid"),
    btnSplitConfirm: document.getElementById("btnSplitConfirm"),
    btnSplitCancel: document.getElementById("btnSplitCancel"),
    brandForm: document.getElementById("brand-form"),
    btnAnalyze: document.getElementById("btnAnalyze"),
    btnMoodboard: document.getElementById("btnMoodboard"),
    btnRebuildMoodboard: document.getElementById("btnRebuildMoodboard"),
    postAnalysisToolbar: document.getElementById("postAnalysisToolbar"),
    btnDownloadDnaQuick: document.getElementById("btnDownloadDnaQuick"),
    btnViewDnaQuick: document.getElementById("btnViewDnaQuick"),
    btnDownloadMoodboardQuick: document.getElementById("btnDownloadMoodboardQuick"),
    actionHint: document.getElementById("actionHint"),
    sectionDna: document.getElementById("section-dna"),
    dnaTableWrap: document.getElementById("dnaTableWrap"),
    btnDownloadDna: document.getElementById("btnDownloadDna"),
    btnViewDna: document.getElementById("btnViewDna"),
    sectionVisual: document.getElementById("section-visual"),
    visualBlock: document.getElementById("visualCodeBlock"),
    sectionMoodboard: document.getElementById("section-moodboard"),
    moodboardGrid: document.getElementById("moodboardGrid"),
    btnDownloadMoodboard: document.getElementById("btnDownloadMoodboard"),
    moodboardExportModal: document.getElementById("moodboardExportModal"),
    btnCloseMoodboardExport: document.getElementById("btnCloseMoodboardExport"),
    sectionReco: document.getElementById("section-reco"),
    recoList: document.getElementById("recoList"),
    modal: document.getElementById("dnaModal"),
    modalBody: document.getElementById("dnaModalBody"),
    btnCloseModal: document.getElementById("btnCloseModal"),
    themeToggle: document.getElementById("themeToggle"),
    themeToggleLabel: document.getElementById("themeToggleLabel"),
  };

  // ——— Утилиты ———
  function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
  }

  function getBrandPayload() {
    const form = el.brandForm;
    if (!form) return {};
    const fd = new FormData(form);
    return {
      brandName: (fd.get("brandName") || "").toString().trim(),
      niche: (fd.get("niche") || "").toString().trim(),
      link: (fd.get("link") || "").toString().trim(),
      description: (fd.get("description") || "").toString().trim(),
    };
  }

  function validateBrand(p) {
    return Boolean(p.brandName && p.niche && p.description);
  }

  function updateCounter() {
    const n = state.images.length;
    el.counter.textContent = `Изображений: ${n} / ${MAX_IMAGES}`;
    el.warnMin.hidden = !(n > 0 && n < MIN_IMAGES_QUALITY);
  }

  function renderGallery() {
    el.gallery.innerHTML = "";
    state.images.forEach((img) => {
      const item = document.createElement("div");
      item.className = "gallery__item" + (img.priority ? " gallery__item--selected" : "");
      item.dataset.id = String(img.id);

      const image = document.createElement("img");
      image.src = img.url;
      image.alt = img.file.name || "Загруженное изображение";

      const overlay = document.createElement("div");
      overlay.className = "gallery__overlay";

      const top = document.createElement("div");
      top.className = "gallery__toolbar";
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn--small btn--danger";
      del.textContent = "Удалить";
      del.addEventListener("click", () => removeImage(img.id));
      top.appendChild(del);

      const foot = document.createElement("div");
      foot.className = "gallery__footer";
      const lab = document.createElement("label");
      lab.className = "gallery__check";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = img.priority;
      cb.addEventListener("change", () => {
        img.priority = cb.checked;
        item.classList.toggle("gallery__item--selected", img.priority);
      });
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode("В мудборд"));

      foot.appendChild(lab);
      overlay.appendChild(top);
      overlay.appendChild(foot);
      item.appendChild(image);
      item.appendChild(overlay);
      el.gallery.appendChild(item);
    });
    updateCounter();
    updateActionHint();
  }

  function removeImage(id) {
    const idx = state.images.findIndex((i) => i.id === id);
    if (idx === -1) return;
    const removed = state.images.splice(idx, 1)[0];
    URL.revokeObjectURL(removed.url);
    renderGallery();
  }

  function getScreenshotSplitter() {
    const s = window.BrandAnalyzerScreenshotSplit;
    return s && typeof s.trySplit === "function" ? s : null;
  }

  function showSplitBusy(on) {
    if (el.splitBusy) el.splitBusy.hidden = !on;
  }

  function showSplitHint(msg) {
    if (!el.splitHint || !msg) return;
    el.splitHint.textContent = msg;
    el.splitHint.hidden = false;
    clearTimeout(showSplitHint._t);
    showSplitHint._t = setTimeout(() => {
      el.splitHint.hidden = true;
    }, 8000);
  }

  function blobToFile(blob, name) {
    return new File([blob], name, { type: blob.type || "image/png", lastModified: Date.now() });
  }

  function addOneImageFile(file) {
    if (state.images.length >= MAX_IMAGES) return false;
    const id = ++imageIdSeq;
    const url = URL.createObjectURL(file);
    state.images.push({ id, file, url, priority: false });
    return true;
  }

  function revokeSplitReviewItems(items) {
    items.forEach((it) => URL.revokeObjectURL(it.url));
  }

  function closeSplitReviewUi() {
    if (el.splitReviewSection) el.splitReviewSection.hidden = true;
    if (el.splitReviewGrid) el.splitReviewGrid.innerHTML = "";
  }

  function renderSplitReviewGrid() {
    if (!el.splitReviewGrid || !splitReviewPending) return;
    el.splitReviewGrid.innerHTML = "";
    splitReviewPending.items.forEach((it) => {
      const wrap = document.createElement("div");
      wrap.className = "split-review-item";
      const image = document.createElement("img");
      image.src = it.url;
      image.alt = "Фрагмент скриншота";
      const rem = document.createElement("button");
      rem.type = "button";
      rem.className = "split-review-item__remove";
      rem.setAttribute("aria-label", "Удалить фрагмент");
      rem.textContent = "×";
      rem.addEventListener("click", () => {
        const idx = splitReviewPending.items.findIndex((x) => x.tempId === it.tempId);
        if (idx === -1) return;
        URL.revokeObjectURL(splitReviewPending.items[idx].url);
        splitReviewPending.items.splice(idx, 1);
        renderSplitReviewGrid();
      });
      wrap.appendChild(image);
      wrap.appendChild(rem);
      el.splitReviewGrid.appendChild(wrap);
    });
  }

  function openSplitReviewAwaitUser(originalFile, blobs, hint) {
    return new Promise((resolve) => {
      const items = blobs.map((blob) => ({
        blob,
        url: URL.createObjectURL(blob),
        tempId: ++splitReviewNextId,
      }));
      splitReviewPending = {
        originalFile,
        items,
        resolve,
        hint: hint || "",
      };
      const hintPart = splitReviewPending.hint ? ` (${splitReviewPending.hint})` : "";
      el.splitReviewLead.textContent = `Найдено ${blobs.length} фрагментов из «${originalFile.name}». Удалите ошибочные миниатюры крестиком, затем нажмите «Добавить фрагменты в галерею» или оставьте целый скриншот.${hintPart}`;
      el.splitReviewSection.hidden = false;
      renderSplitReviewGrid();
      el.splitReviewSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function confirmSplitAddFragments() {
    const p = splitReviewPending;
    if (!p || typeof p.resolve !== "function") return;
    if (!p.items.length) {
      alert("Не осталось ни одного фрагмента. Нажмите «Оставить исходный скриншот» или не удаляйте все миниатюры.");
      return;
    }
    const blobs = p.items.map((it) => it.blob);
    const res = p.resolve;
    const toRevoke = p.items.slice();
    splitReviewPending = null;
    closeSplitReviewUi();
    revokeSplitReviewItems(toRevoke);
    res({ useOriginal: false, blobs });
  }

  function cancelSplitUseOriginal() {
    const p = splitReviewPending;
    if (!p || typeof p.resolve !== "function") return;
    const res = p.resolve;
    const toRevoke = p.items.slice();
    splitReviewPending = null;
    closeSplitReviewUi();
    revokeSplitReviewItems(toRevoke);
    res({ useOriginal: true });
  }

  async function addFiles(fileList) {
    const incoming = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    if (!incoming.length) return;

    let skippedMax = false;
    const splitter = getScreenshotSplitter();

    for (const file of incoming) {
      if (state.images.length >= MAX_IMAGES) {
        skippedMax = true;
        break;
      }

      if (splitter) {
        showSplitBusy(true);
        let result;
        try {
          result = await splitter.trySplit(file);
        } catch (e) {
          console.error(e);
          result = { useOriginalOnly: true, hint: "" };
        }
        showSplitBusy(false);

        if (!result.useOriginalOnly && result.blobs && result.blobs.length > 1) {
          const choice = await openSplitReviewAwaitUser(file, result.blobs, result.hint || "");
          if (!choice.useOriginal && choice.blobs && choice.blobs.length) {
            const base = (file.name || "screen").replace(/\.[^.]+$/, "") || "screen";
            for (let i = 0; i < choice.blobs.length; i++) {
              if (state.images.length >= MAX_IMAGES) {
                skippedMax = true;
                break;
              }
              addOneImageFile(blobToFile(choice.blobs[i], `${base}-${i + 1}.png`));
            }
          } else {
            if (!addOneImageFile(file)) skippedMax = true;
          }
        } else {
          if (result.hint) showSplitHint(result.hint);
          if (!addOneImageFile(file)) skippedMax = true;
        }
      } else if (!addOneImageFile(file)) {
        skippedMax = true;
      }
    }

    el.infoMax.hidden = !skippedMax;
    if (skippedMax) {
      setTimeout(() => {
        el.infoMax.hidden = true;
      }, 5000);
    }
    renderGallery();
  }

  // ——— Сервис анализа (мок + точка расширения для OpenAI) ———

  /**
   * @typedef {Object} BrandPayload
   * @property {string} brandName
   * @property {string} niche
   * @property {string} link
   * @property {string} description
   */

  /**
   * @typedef {Object} ImageSessionMeta
   * @property {number} count
   * @property {number} prioritizedCount
   * @property {string[]} fileNamesSample
   */

  const keywordArchetypeHints = [
    { keys: ["премиум", "роскош", "элит", "статус", "лидер рынка"], arch: "ruler" },
    { keys: ["трансформац", "магия", "инновац", "будущ"], arch: "magician" },
    { keys: ["дерзост", "бунт", "разруш", "свобод", "провокац"], arch: "outlaw" },
    { keys: ["приключ", "исслед", "путешеств", "новые горизонт"], arch: "explorer" },
    { keys: ["герой", "побед", "сила", "достиж", "спорт"], arch: "hero" },
    { keys: ["эко", "чистот", "простот", "искрен", "довер"], arch: "innocent" },
    { keys: ["забот", "поддерж", "семь", "здоров", "тёпл"], arch: "caregiver" },
    { keys: ["юмор", "лёгк", "игр", "ирони"], arch: "jester" },
    { keys: ["знани", "эксперт", "аналит", "обучен", "факт"], arch: "sage" },
    { keys: ["творч", "дизайн", "арт", "уникальн", "авторск"], arch: "creator" },
    { keys: ["чувств", "эстетик", "страст", "близост"], arch: "lover" },
    { keys: ["близк", "свой", "честн", "будни", "доступ"], arch: "everyman" },
  ];

  function scoreArchetype(text) {
    const t = (text || "").toLowerCase();
    const scores = {};
    ARCHETYPES.forEach((a) => {
      scores[a.id] = 0;
    });
    keywordArchetypeHints.forEach((h) => {
      if (h.keys.some((k) => t.includes(k))) scores[h.arch] += 3;
    });
    let best = ARCHETYPES[0].id;
    let max = -1;
    Object.keys(scores).forEach((id) => {
      if (scores[id] > max) {
        max = scores[id];
        best = id;
      }
    });
    if (max <= 0) {
      const niche = t;
      if (/it|софт|tech|digital|saas/.test(niche)) best = "magician";
      else if (/мод|fashion|стиль/.test(niche)) best = "lover";
      else if (/food|еда|рестор|кофе/.test(niche)) best = "everyman";
      else best = "creator";
    }
    return ARCHETYPES.find((a) => a.id === best) || ARCHETYPES[0];
  }

  function pickEmotion(archetypeId, text) {
    const t = text.toLowerCase();
    const map = {
      innocent: "Спокойная надежда и ощущение «всё хорошо».",
      everyman: "Солидарность и уют «свой среди своих».",
      hero: "Вдохновение и мотивация к действию.",
      outlaw: "Напряжение и желание выделиться из системы.",
      explorer: "Любопытство и свобода выбора.",
      creator: "Вдохновение и желание создавать новое.",
      ruler: "Уверенность и ощущение контроля качества.",
      magician: "Очарование перемен и «вау»-эффект.",
      lover: "Близость, чувственность, эстетическое удовольствие.",
      caregiver: "Тепло, забота и снижение тревоги.",
      jester: "Лёгкость, ирония, разрядка.",
      sage: "Ясность, интеллектуальное уважение, спокойная уверенность.",
    };
    if (/тревог|срочн|остр/.test(t)) return "Сдержанное напряжение, которое бренд мягко снимает через визуальный порядок.";
    return map[archetypeId] || map.creator;
  }

  function buildValues(archetypeRu, niche) {
    return `Аутентичность в рамках ниши «${niche}», последовательность образа и честность обещания аудитории. Архетип «${archetypeRu}» задаёт этический вектор: бренд не продаёт случайный lifestyle, а закрепляет узнаваемый смысл.`;
  }

  function buildThemes(brandName, niche, count) {
    return `Повторяющаяся визуальная тема «${niche}» в подаче ${brandName}: ритм контента, тип героев кадра и повторяемые смысловые акценты. На выборке из ${count} ваших изображений видно устойчивые сюжеты, а не разовые «красивые» кадры.`;
  }

  function buildVisualCodesList(archetypeId) {
    const base = [
      "Цвет: преобладающая палитра поддерживает эмоциональный тон архетипа (насыщенность/монохром).",
      "Свет: характер освещения (мягкий контраст или жёсткий графический свет) задаёт доверие или динамику.",
      "Композиция: устойчивые сетки и отступы или намеренный хаос — оба читаются как код бренда.",
      "Фактуры: материалы в кадре (ткань, металл, бумага) усиливают тактильную ассоциацию с продуктом.",
      "Движение и ритм: серия кадров показывает, ускоряется ли визуальный темп или выдержан медитативный повтор.",
      "Ракурсы и масштаб: повторяемый «язык» съёмки связывает разные посты в единую систему.",
      "Поведение объектов/людей в кадре: поза, взгляд, дистанция до камеры — неслучайный ToV визуала.",
    ];
    const extra = {
      ruler: "Стиль обработки: сдержанная ретушь и премиальная чистота кадра.",
      outlaw: "Стиль обработки: контраст, зернистость или намеренный «сырой» вид.",
      sage: "Стиль обработки: информативные детали, акцент на текстуре и доказательности.",
    };
    const codes = base.slice(0, 5);
    if (extra[archetypeId]) codes.push(extra[archetypeId]);
    codes.push("Повторяющиеся элементы: логотип, пропсы, фон — якоря узнаваемости в вашей ленте.");
    return codes;
  }

  function buildToneOfVoice(archetypeRu, niche) {
    return `Тон коммуникации в ниши «${niche}» согласован с архетипом «${archetypeRu}»: лексика, длина фраз и степень эмоциональности должны совпадать с тем, как бренд «звучит» в описании и как он показан визуально — без разрыва между текстом и кадром.`;
  }

  function buildProofPoints(brandName, count, link) {
    const linkPart = link
      ? ` Канал (${link}) должен визуально подтверждать те же паттерны, что и загруженная серия.`
      : "";
    return `${brandName} доказывает ДНК через повторяемость визуальных решений в ${count} ваших материалах: одни и те же принципы композиции, цвета и настроения.${linkPart}`;
  }

  const MockBrandAnalysisEngine = {
    /**
     * Заготовка под OpenAI: сюда же позже придут base64 / image URLs и промпт.
     * @param {BrandPayload} brand
     * @param {ImageSessionMeta} imageMeta
     * @returns {Promise<{ rows: { param: string, description: string, why: string }[], visualNarrative: string, recommendations: string[] }>}
     */
    async generate(brand, imageMeta) {
      const mergedText = [brand.brandName, brand.niche, brand.description].join(" ");
      const arch = scoreArchetype(mergedText);
      const emotion = pickEmotion(arch.id, mergedText);
      const visualList = buildVisualCodesList(arch.id);
      const visualCodesCell = visualList.map((v, i) => `${i + 1}. ${v}`).join(" ");

      const rows = [
        {
          param: "Архетип",
          description: `Доминирует архетип «${arch.ru}» (модель 12 архетипов Марк и Пирсон).`,
          why: `Сопоставление описания и ниши («${brand.niche}») с архетипическими маркерами: в тексте бренда прослеживаются сигналы, характерные для «${arch.ru}», а не случайный набор эпитетов.`,
        },
        {
          param: "Эмоция",
          description: emotion,
          why: `Эмоция выведена как следствие архетипа и формулировок бренда, а не как «красивое слово». На серии из ${imageMeta.count} кадров ожидается согласованное настроение, совпадающее с этой доминантой.`,
        },
        {
          param: "Ценности",
          description: buildValues(arch.ru, brand.niche),
          why: `Ценности привязаны к обещанию бренда перед аудиторией ниши и к архетипу «${arch.ru}», чтобы отчёт отражал ДНК, а не общие маркетинговые клише.`,
        },
        {
          param: "Темы",
          description: buildThemes(brand.brandName, brand.niche, imageMeta.count),
          why: `Темы — это повторяющиеся смысловые и визуальные мотивы в ваших загрузках; они проверяются на согласованность с описанием, а не оцениваются «по красоте».`,
        },
        {
          param: "Визуальные коды",
          description: visualCodesCell,
          why: `Список из ${visualList.length} пунктов отражает цвет, свет, композицию, фактуры, движение, ракурсы, настроение, повторы, обработку и ритм — как опору для чтения ДНК в визуале.`,
        },
        {
          param: "Tone of Voice",
          description: buildToneOfVoice(arch.ru, brand.niche),
          why: `ToV согласован с архетипом и нишей; далее при подключении API его можно сверить с реальными подписями к постам на загруженных скриншотах.`,
        },
        {
          param: "Proof Points",
          description: buildProofPoints(brand.brandName, imageMeta.count, brand.link),
          why: `Доказательства ДНК — в повторяемости и узнаваемости паттернов на ваших изображениях и в связке с описанием бренда, без подмены стоковыми фото.`,
        },
      ];

      const visualNarrative = `
        <p><strong>Визуальный код в связке с ДНК.</strong> Ниже — расшифровка того, как абстрактные категории проявляются в кадрах, которые вы предоставили (не из фотобанков).</p>
        <ul>
          ${visualList.map((v) => `<li>${escapeHtml(v)}</li>`).join("")}
        </ul>
        <p>Архетип «${escapeHtml(arch.ru)}» задаёт рамку интерпретации: одинаковые визуальные приёмы читаются как намеренный код бренда, а не как случайный «красивый» стиль.</p>
      `.trim();

      const recommendations = [
        `Закрепите 3–5 визуальных правил (цвет, свет, композиция), которые уже читаются в ваших ${imageMeta.count} материалах, и явно пропишите их в гайдлайне.`,
        `Синхронизируйте подписи и заголовки с архетипом «${arch.ru}», чтобы Tone of Voice не расходился с кадром.`,
        imageMeta.prioritizedCount > 0
          ? `Вы отметили ${imageMeta.prioritizedCount} приоритетных кадра — используйте их как эталон при следующих съёмках или скриншотах ленты.`
          : `Отметьте в галерее 6–10 эталонных кадров — это ускорит сбор мудборда под ДНК при следующем проходе.`,
        `Подготовьте мини-мудборд для команды: 9–12 кадров только из собственных материалов, как в этом отчёте.`,
        `Для PDF-экспорта всего отчёта подключите на следующем этапе печать из браузера или серверный рендер — структура данных уже разделена на блоки.`,
      ];

      return { rows, visualNarrative, recommendations, archetype: arch };
    },
  };

  /**
   * Фасад для смены реализации на OpenAI без переписывания UI.
   */
  const BrandAnalysisService = {
    /**
     * @param {BrandPayload} brandPayload
     * @param {{ images: typeof state.images }} session
     */
    async analyzeBrandDNA(brandPayload, session) {
      const imageMeta = {
        count: session.images.length,
        prioritizedCount: session.images.filter((i) => i.priority).length,
        fileNamesSample: session.images.slice(0, 5).map((i) => i.file.name),
      };
      // future: return OpenAIClient.analyze({ ...brandPayload, images: base64[] });
      return MockBrandAnalysisEngine.generate(brandPayload, imageMeta);
    },
  };

  function buildTableHtml(rows, { forExport = false } = {}) {
    const cls = forExport ? "dna-table dna-table--export" : "dna-table";
    const rowsHtml = rows
      .map(
        (r) => `
      <tr>
        <td>${escapeHtml(r.param)}</td>
        <td>${escapeHtml(r.description)}</td>
        <td>${escapeHtml(r.why)}</td>
      </tr>`
      )
      .join("");
    return `
<table class="${cls}">
  <thead>
    <tr>
      <th>Параметр</th>
      <th>Описание</th>
      <th>Почему</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml}
  </tbody>
</table>`.trim();
  }

  function downloadTextFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime || "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function buildDnaExportDocument(innerTableHtml, brandTitle) {
    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <title>ДНК бренда — ${escapeHtml(brandTitle)}</title>
  <style>
    body { font-family: Georgia, serif; margin: 2rem; color: #1c1b19; background: #faf8f5; }
    h1 { font-size: 1.5rem; }
    table { border-collapse: collapse; width: 100%; background: #fff; }
    th, td { border: 1px solid #e8e4de; padding: 0.75rem 1rem; vertical-align: top; text-align: left; font-size: 0.95rem; }
    th { background: #f0ebe4; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #5c5a56; }
    td:first-child { font-weight: 600; color: #2f4f4f; white-space: nowrap; }
    .note { font-size: 0.85rem; color: #5c5a56; margin-top: 1.5rem; }
    @media print { body { background: #fff; } }
  </style>
</head>
<body>
  <h1>ДНК бренда: ${escapeHtml(brandTitle)}</h1>
  ${innerTableHtml}
  <p class="note">Файл сформирован Brand Analyzer. Для PDF: откройте этот HTML и используйте «Печать → Сохранить как PDF» в браузере.</p>
</body>
</html>`;
  }

  /**
   * Зарезервировано под будущий PDF без сторонних CDN.
   */
  function exportDnaPdfReadyHook(_payload) {
    // future: window.print() на отдельной странице или серверный PDF
    return null;
  }

  function updateActionHint() {
    const p = getBrandPayload();
    const n = state.images.length;
    if (!validateBrand(p)) {
      el.actionHint.textContent = "Заполните название, нишу и описание бренда.";
      return;
    }
    if (n === 0) {
      el.actionHint.textContent = "Загрузите изображения (скриншоты ленты / фото продукта).";
      return;
    }
    if (n < MIN_IMAGES_QUALITY) {
      el.actionHint.textContent = "Анализ доступен, но для качества лучше не менее 9 изображений.";
      return;
    }
    el.actionHint.textContent = "Можно запускать анализ ДНК и сбор мудборда.";
  }

  async function runAnalysis() {
    const payload = getBrandPayload();
    if (!validateBrand(payload)) {
      alert("Заполните название бренда, нишу и описание.");
      return;
    }
    if (state.images.length === 0) {
      alert("Загрузите хотя бы одно изображение. Для отчёта рекомендуется от 9 кадров.");
      return;
    }

    el.btnAnalyze.disabled = true;
    try {
      const result = await BrandAnalysisService.analyzeBrandDNA(payload, state);
      state.analysis = result;
      state.dnaTableHtml = buildTableHtml(result.rows);

      el.dnaTableWrap.innerHTML = state.dnaTableHtml;
      el.sectionDna.hidden = false;
      el.visualBlock.innerHTML = result.visualNarrative;
      el.sectionVisual.hidden = false;

      el.recoList.innerHTML = "";
      result.recommendations.forEach((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        el.recoList.appendChild(li);
      });
      el.sectionReco.hidden = false;

      exportDnaPdfReadyHook({ brand: payload, table: state.dnaTableHtml });
      if (el.postAnalysisToolbar) el.postAnalysisToolbar.hidden = false;
      el.sectionDna.scrollIntoView({ behavior: "smooth", block: "start" });
    } finally {
      el.btnAnalyze.disabled = false;
    }
  }

  /** Детерминированный «скоринг» кадра для мудборда (мок; позже заменить на ответ модели). */
  function scoreImageForMoodboard(img, index, archetypeId) {
    let score = (index % 7) + (img.priority ? 20 : 0);
    const name = (img.file.name || "").toLowerCase();
    for (let i = 0; i < name.length; i++) score += name.charCodeAt(i) % 5;
    const archSalt = archetypeId.length * 3;
    score += archSalt % 4;
    return score;
  }

  function buildMoodboardInternal({ rebuild }) {
    if (!state.analysis) {
      alert("Сначала выполните анализ бренда.");
      return;
    }
    if (state.images.length < MOODBOARD_MIN) {
      alert(`Для мудборда нужно минимум ${MOODBOARD_MIN} изображений в сессии.`);
      return;
    }

    const archId = state.analysis.archetype?.id || "creator";
    const sorted = [...state.images].sort((a, b) => {
      const sa = scoreImageForMoodboard(a, a.id, archId);
      const sb = scoreImageForMoodboard(b, b.id, archId);
      if (sb !== sa) return sb - sa;
      return a.id - b.id;
    });

    const target = Math.min(
      MOODBOARD_MAX,
      Math.max(MOODBOARD_MIN, Math.min(sorted.length, 12))
    );

    let picks = sorted.slice(0, target);
    if (rebuild && picks.length > MOODBOARD_MIN) {
      const rotateBy = 1 + (state.images.length % 3);
      picks = sorted.slice(rotateBy).concat(sorted.slice(0, rotateBy)).slice(0, target);
    }

    state.moodboard = picks.map((img) => ({ imageId: img.id }));

    renderMoodboard();
    el.sectionMoodboard.hidden = false;
    el.sectionMoodboard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderMoodboard() {
    el.moodboardGrid.innerHTML = "";
    state.moodboard.forEach((slot) => {
      const img = state.images.find((i) => i.id === slot.imageId);
      if (!img) return;

      const card = document.createElement("article");
      card.className = "mood-card";

      const wrap = document.createElement("div");
      wrap.className = "mood-card__img";
      const im = document.createElement("img");
      im.src = img.url;
      im.alt = "Мудборд бренда";
      wrap.appendChild(im);

      card.appendChild(wrap);
      el.moodboardGrid.appendChild(card);
    });
  }

  function openModal() {
    if (!state.dnaTableHtml) return;
    el.modalBody.innerHTML = state.dnaTableHtml;
    el.modal.hidden = false;
    el.btnCloseModal.focus();
  }

  function closeModal() {
    el.modal.hidden = true;
    el.modalBody.innerHTML = "";
  }

  async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async function downloadMoodboardHtml() {
    if (!state.moodboard.length) {
      alert("Сначала соберите мудборд.");
      return;
    }
    const brand = getBrandPayload();
    const dataUrls = [];
    for (const slot of state.moodboard) {
      const img = state.images.find((i) => i.id === slot.imageId);
      if (!img) continue;
      dataUrls.push(await fileToDataUrl(img.file));
    }

    const itemsHtml = dataUrls
      .map(
        (dataUrl) => `
      <figure class="card"><img src="${dataUrl}" alt="" /></figure>`
      )
      .join("");

    const doc = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<title>Мудборд — ${escapeHtml(brand.brandName || "Brand")}</title>
<style>
body{font-family:system-ui,sans-serif;margin:2rem;background:#f6f4f1;color:#1c1b19;}
h1{font-size:1.4rem;}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1.25rem;}
.card{background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e8e4de;}
.card img{width:100%;display:block;aspect-ratio:4/3;object-fit:cover;}
</style>
</head>
<body>
<h1>Мудборд: ${escapeHtml(brand.brandName || "")}</h1>
<div class="grid">${itemsHtml}</div>
<p style="margin-top:2rem;font-size:0.85rem;color:#666;">Сформировано Brand Analyzer из загруженных пользователем файлов.</p>
</body>
</html>`;
    downloadTextFile(MOODBOARD_FILENAME, doc, "text/html;charset=utf-8");
  }

  function closeMoodboardExportModal() {
    if (!el.moodboardExportModal) return;
    el.moodboardExportModal.hidden = true;
  }

  function openMoodboardExportModal() {
    if (!el.moodboardExportModal) return;
    if (!state.moodboard.length) {
      alert("Сначала соберите мудборд.");
      return;
    }
    el.moodboardExportModal.hidden = false;
    if (el.btnCloseMoodboardExport) el.btnCloseMoodboardExport.focus();
  }

  async function captureMoodboardGridCanvas() {
    if (typeof html2canvas !== "function") {
      throw new Error("NO_HTML2CANVAS");
    }
    const section = el.sectionMoodboard;
    const wasHidden = section.hidden;
    if (wasHidden) section.hidden = false;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    const bg = dark ? "#121110" : "#f6f4f1";
    try {
      return await html2canvas(el.moodboardGrid, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: bg,
      });
    } finally {
      if (wasHidden) section.hidden = true;
    }
  }

  function blobFromCanvas(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("TOBLOB"))), type, quality);
    });
  }

  async function downloadMoodboardPng() {
    if (!state.moodboard.length) {
      alert("Сначала соберите мудборд.");
      return;
    }
    if (typeof html2canvas !== "function") {
      alert("Не удалось загрузить html2canvas (нужен интернет для CDN). Экспорт в PNG недоступен.");
      return;
    }
    const canvas = await captureMoodboardGridCanvas();
    const blob = await blobFromCanvas(canvas, "image/png");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = MOODBOARD_FILENAME_PNG;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2500);
  }

  function appendCanvasToPdf(pdf, canvas, useJpeg) {
    const imgData = useJpeg ? canvas.toDataURL("image/jpeg", 0.92) : canvas.toDataURL("image/png");
    const fmt = useJpeg ? "JPEG" : "PNG";
    const margin = 10;
    const usableW = pdf.internal.pageSize.getWidth() - margin * 2;
    const usableH = pdf.internal.pageSize.getHeight() - margin * 2;
    const imgW = usableW;
    const imgH = (canvas.height * imgW) / canvas.width;

    let heightLeft = imgH;
    let y = margin;

    pdf.addImage(imgData, fmt, margin, y, imgW, imgH, undefined, "FAST");
    heightLeft -= usableH;

    while (heightLeft > 1) {
      y = margin - (imgH - heightLeft);
      pdf.addPage();
      pdf.addImage(imgData, fmt, margin, y, imgW, imgH, undefined, "FAST");
      heightLeft -= usableH;
    }
  }

  async function downloadMoodboardPdf() {
    if (!state.moodboard.length) {
      alert("Сначала соберите мудборд.");
      return;
    }
    const jspdfLib = window.jspdf;
    const JsPDF = jspdfLib && typeof jspdfLib.jsPDF === "function" ? jspdfLib.jsPDF : typeof window.jsPDF === "function" ? window.jsPDF : null;
    if (typeof html2canvas !== "function" || !JsPDF) {
      alert("Не удалось загрузить библиотеки для PDF. Проверьте интернет и обновите страницу.");
      return;
    }
    const canvas = await captureMoodboardGridCanvas();
    const pdf = new JsPDF({ orientation: "p", unit: "mm", format: "a4" });
    appendCanvasToPdf(pdf, canvas, true);
    pdf.save(MOODBOARD_FILENAME_PDF);
  }

  async function runMoodboardExport(format) {
    closeMoodboardExportModal();
    try {
      if (format === "html") await downloadMoodboardHtml();
      else if (format === "png") await downloadMoodboardPng();
      else if (format === "pdf") await downloadMoodboardPdf();
    } catch (err) {
      console.error(err);
      alert(
        "Не удалось сформировать файл мудборда. Для PNG и PDF проверьте интернет (CDN), разрешите загрузку скриптов и попробуйте снова."
      );
    }
  }

  // ——— События ———
  el.btnUpload.addEventListener("click", () => el.fileInput.click());
  el.fileInput.addEventListener("change", (e) => {
    const fl = e.target.files;
    void addFiles(fl).finally(() => {
      el.fileInput.value = "";
    });
  });

  if (el.btnSplitConfirm) el.btnSplitConfirm.addEventListener("click", confirmSplitAddFragments);
  if (el.btnSplitCancel) el.btnSplitCancel.addEventListener("click", cancelSplitUseOriginal);

  el.btnAnalyze.addEventListener("click", runAnalysis);
  el.btnMoodboard.addEventListener("click", () => buildMoodboardInternal({ rebuild: false }));
  el.btnRebuildMoodboard.addEventListener("click", () => buildMoodboardInternal({ rebuild: true }));

  function downloadDnaFile() {
    if (!state.analysis) return;
    const brand = getBrandPayload();
    const inner = buildTableHtml(state.analysis.rows, { forExport: true });
    const html = buildDnaExportDocument(inner, brand.brandName || "Бренд");
    downloadTextFile(DNA_FILENAME, html, "text/html;charset=utf-8");
  }

  el.btnDownloadDna.addEventListener("click", downloadDnaFile);
  if (el.btnDownloadDnaQuick) el.btnDownloadDnaQuick.addEventListener("click", downloadDnaFile);

  el.btnViewDna.addEventListener("click", openModal);
  if (el.btnViewDnaQuick) el.btnViewDnaQuick.addEventListener("click", openModal);
  el.btnCloseModal.addEventListener("click", closeModal);
  el.modal.addEventListener("click", (e) => {
    if (e.target.matches("[data-close-modal]")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!el.modal.hidden) closeModal();
    if (el.moodboardExportModal && !el.moodboardExportModal.hidden) closeMoodboardExportModal();
    if (el.splitReviewSection && !el.splitReviewSection.hidden && splitReviewPending) cancelSplitUseOriginal();
  });

  if (el.moodboardExportModal) {
    el.moodboardExportModal.addEventListener("click", (e) => {
      if (e.target.matches("[data-close-moodboard-export]")) closeMoodboardExportModal();
      const btn = e.target.closest("[data-export-format]");
      if (btn) {
        const fmt = btn.getAttribute("data-export-format");
        if (fmt) runMoodboardExport(fmt);
      }
    });
    if (el.btnCloseMoodboardExport) {
      el.btnCloseMoodboardExport.addEventListener("click", closeMoodboardExportModal);
    }
  }

  el.btnDownloadMoodboard.addEventListener("click", openMoodboardExportModal);
  if (el.btnDownloadMoodboardQuick) el.btnDownloadMoodboardQuick.addEventListener("click", openMoodboardExportModal);

  el.brandForm.addEventListener("input", updateActionHint);
  el.brandForm.addEventListener("change", updateActionHint);

  // ——— Тема (светлая / тёмная) ———
  function isDarkTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark";
  }

  function applyTheme(dark) {
    if (dark) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    try {
      if (dark) localStorage.setItem(THEME_STORAGE_KEY, "dark");
      else localStorage.removeItem(THEME_STORAGE_KEY);
    } catch (e) {
      /* private mode */
    }
    syncThemeToggle();
  }

  function syncThemeToggle() {
    const dark = isDarkTheme();
    const btn = el.themeToggle;
    const label = el.themeToggleLabel;
    if (btn) {
      btn.setAttribute("aria-pressed", dark ? "true" : "false");
      btn.setAttribute("aria-label", dark ? "Включить светлую тему" : "Включить тёмную тему");
    }
    if (label) label.textContent = dark ? "Светлая тема" : "Тёмная тема";
  }

  if (el.themeToggle) {
    el.themeToggle.addEventListener("click", () => applyTheme(!isDarkTheme()));
    syncThemeToggle();
  }

  updateCounter();
  updateActionHint();
})();
