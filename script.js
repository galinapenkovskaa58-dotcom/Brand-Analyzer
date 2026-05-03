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
    analysis: null, // { rows, visualNarrative, associativeFieldHtml, contentStrategyHtml }
    moodboard: [], // slot: imageId, whySelected, dnaElement, visualCode
    moodboardKit: null, // цвета, формы, типографика, символы (после сборки)
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
    sectionAssociative: document.getElementById("section-associative"),
    associativeBlock: document.getElementById("associativeBlock"),
    sectionContent: document.getElementById("section-content"),
    contentStrategyBlock: document.getElementById("contentStrategyBlock"),
    sectionMoodboard: document.getElementById("section-moodboard"),
    moodboardCaptureRoot: document.getElementById("moodboardCaptureRoot"),
    moodboardIntro: document.getElementById("moodboardIntro"),
    moodboardGrid: document.getElementById("moodboardGrid"),
    moodboardColorsSwatches: document.getElementById("moodboardColorsSwatches"),
    moodboardColorsCaption: document.getElementById("moodboardColorsCaption"),
    moodboardFormsList: document.getElementById("moodboardFormsList"),
    moodboardTypographyList: document.getElementById("moodboardTypographyList"),
    moodboardSymbolsList: document.getElementById("moodboardSymbolsList"),
    btnDownloadMoodboard: document.getElementById("btnDownloadMoodboard"),
    moodboardExportModal: document.getElementById("moodboardExportModal"),
    btnCloseMoodboardExport: document.getElementById("btnCloseMoodboardExport"),
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

  function hashString(s) {
    let h = 2166136261;
    const str = String(s || "");
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** Образные 2–3 словных маркера под архетип (без «красиво / стильно»). */
  const ASSOCIATIVE_BANK = {
    innocent: [
      "мягкий рассеянный дневной свет",
      "матовая поверхность без бликов",
      "ровная линия горизонта",
      "прозрачная вода у края",
      "тишина между двумя кадрами",
      "необработанное дерево без лака",
      "свежее яблоко с росой",
      "белая ткань в лёгком движении",
      "простор поля после дождя",
      "дыхание перед первым шагом",
      "чистая белая посуда",
      "естественный цвет кожи без фильтра",
      "ласкающий ветер по ткани",
      "первый снег без следов",
      "молочная дымка утра",
      "простая форма без украшений",
      "мягкий контакт ладони с тканью",
      "яркая зелень без насыщения клиппинга",
      "открытая улыбка без позы",
      "прозрачное стекло на солнце",
      "аккуратный узел без давления",
      "ровный стол без лишних предметов",
      "спокойная симметрия окна",
      "дым от чая без драмы",
      "камень обваловый у ручья",
      "детская ладонь на переплёте",
      "мягкая тень под объектом",
      "простыня с естественными складками",
      "сад после полива каплями",
      "луч солнца на перилах",
    ],
    everyman: [
      "кухонный стол после обеда",
      "зацепленная на плече сумка",
      "очередь у кофейни утром",
      "разговор на средней дистанции",
      "джинсы с потёртостью колен",
      "окно квартиры тёплый свет",
      "пакет с хлебом в руке",
      "общий транспорт без глянца",
      "пятница в офисе после дедлайна",
      "кофе в бумажном стакане",
      "разговорный диалог без слогана",
      "двор между домами городской низ",
      "друзья на скамейке в парке",
      "бытовая техника на столешнице",
      "плед на диване в свите",
      "робкая улыбка знакомого лица",
      "ремешок часов изношенный край",
      "продуктовая тележка на парковке",
      "простынный городской небо сумерки",
      "рабочий стол с липучками заметок",
      "застёжка куртки одной рукой",
      "перекрёсток без постановки",
      "пластиковый стаканчик у окна",
      "разговор на улице между делами",
      "купол пара под люстрой кафе",
      "руки в карманах куртки ветер",
      "пакет с овощами без премиум упаковки",
      "папка с документами на барном стуле",
      "пара скутеров у светофора",
      "человеческий масштаб дверного проёма",
    ],
    hero: [
      "напряжённая линия подбородка",
      "контраст света на мышце руки",
      "короткий шаг перед прыжком",
      "циферблат секундомера крупный план",
      "пот на коже под софтбоксом",
      "вертикальная композиция восхождения",
      "резкий поворот корпуса",
      "утренний асфальт после пробежки",
      "металлическая гантеля без декора",
      "точка фокуса между глазами",
      "дыхание в минус на морозе",
      "радиальный свет за спиной героя",
      "подъёмная траектория визуальная",
      "кулак сжатый без агрессии лица",
      "стык шва спортивной формы",
      "контраст красного на сером фоне",
      "пластика завершённого движения",
      "узкая дорога к вершине кадра",
      "пульс на шее макросъёмка",
      "ветровое стекло скорости размытие",
      "ступенька перед финишной чертой",
      "потертость на кроссовках передней части",
      "линза камеры на уровне пояса",
      "рассветный контровой силуэт",
      "штанга без лишнего декора студии",
      "стычный свет стадиона ночью",
      "пальцы на хвате турника",
      "градиент пота на майке",
      "визуальный ритм серии рывков",
      "направленный вектор стрелки композиции",
    ],
    outlaw: [
      "рваный край афиши на столбе",
      "граффити вторым слоем краски",
      "искусственный зернистый шум плёнки",
      "контровой неон на мокром асфальте",
      "сломанная рамка композиции намеренно",
      "цепь на куртке металлический холод",
      "красная лампа без правил белого баланса",
      "асимметрия кадра с отступом",
      "шипованная подошва на бетоне",
      "дым сигареты без лица в кадре",
      "царапина на стекле смартфона",
      "чёрная кожа со складкой давления",
      "вывернутый шов на джинсах",
      "контрастная резкая тень подбородка",
      "сломанная табличка у входа",
      "металлическая решётка лифта",
      "контур города ночью без легенды",
      "слова маркером поверх печати",
      "шипастый ремень пряжка крупный план",
      "искажённый широкоугольник лица",
      "размытый задник со скоростью",
      "чёрно-белый клип зона высоких огней",
      "металл скрежет неполированный",
      "пятно масла на бетоне под светом",
      "провисший провод у потолка комнаты",
      "пластырь на костяшках без истории",
      "разорванный постер у входа метро",
      "красный акцент один на кадр",
      "визуальный шум как посыл бренда",
      "острый угол камеры снизу",
    ],
    explorer: [
      "дорога без конца в кадре",
      "пыльное стекло автобуса за городом",
      "карта с загнутым углом бумаги",
      "рюкзак на сиденье поезда",
      "рассветное небо смена экспозиции",
      "мокрый камень у реки горный",
      "песок между пальцев обуви",
      "петля шнурка на скале",
      "палатка ткань на ветру ночью",
      "закатная полоса горизонта длинная",
      "паспорт с штампом без текста в кадре",
      "локоть на окне вагона размытие снаружи",
      "компас без рекламной подложки",
      "туман между двумя холмами",
      "объектив камеры на камне",
      "капли на рукаве от росы",
      "след от шины на грунтовке",
      "высота до облаков без человека",
      "верёвка на карабине металлический звук визуально",
      "костёр без лица только языки пламени",
      "маршрутная линия на экране смартфона",
      "ветка деревца из-под сапога",
      "горная тропа узкая диагональ",
      "облако пара над чашкой в палатке",
      "песчаная текстура крупным планом",
      "далёкий маяк на контровом свете",
      "очки со следами пальцев на линзе",
      "капли на палаточной молнии",
      "небо шире горизонта кадра",
      "переправа через ручей камни мокрые",
    ],
    creator: [
      "неровная линия карандаша на бумаге",
      "развод чернил инструмент случайный",
      "мазок кисти сухой край",
      "крошки резины ластика на столе",
      "линейка со следами порезов",
      "макетный картон по шаблону смещён",
      "пинцет над миниатюрной деталью",
      "монитор с цветовым профилем калибровки",
      "клавиши с потёртостью букв",
      "катушка ниток без порядка композиции",
      "высеченная форма из бумаги тень",
      "лампа настольная конус света",
      "эскизная сетка карандашом еле видимая",
      "спрей баллончик капля на бетоне",
      "пыль мела на ладони художника",
      "планшет стилус давление линии разное",
      "образец ткани под лупой",
      "типографская строка с интерлиньяжем точным",
      "кусок глины отпечаток пальцев",
      "доска с булавками референсов",
      "стекло палитры смешение двух цветов",
      "фотобокс мягкая ткань складка",
      "кроп отрезанный лишний по правилу третей",
      "штатив шип резьбы металл",
      "чернильное пятно со вторым слоем полупрозрачным",
      "планшетный слой без финальной линии",
      "миниатюрная модель из бумаги складки",
      "кисть с остатком краски на ворсе",
      "стол с инструментами хаос контролируемый",
      "разметка углов для сборки макета",
    ],
    ruler: [
      "идеально выровненная линия шва",
      "глубокий чёрный без провала деталей",
      "тонкая полоска золота как акцент",
      "монолитный камень полированный угол",
      "строгая сетка отступов документ",
      "фирменная папка кожа без перегиба",
      "гравировка серийного номера крупный план",
      "стекло витрины без отпечатков",
      "архитектурный объём симметрия фасада",
      "одна доминирующая вертикаль в кадре",
      "минимум текстур без шума фона",
      "металл матовый анодированный серый",
      "конференц-стол отражение лака ровное",
      "диаграмма без декоративных элементов",
      "рука в запонке чёткий жест",
      "прожекторный свет лобового акцента",
      "прямой луч без рассеивателя жёсткий",
      "дверной проём точная перспектива",
      "книга переплёт ткань рёбра ровные",
      "автомобильная линия кузова без изгиба шума",
      "часы на стене офисного повода",
      "мраморная вена повторяющаяся паттерн",
      "визитная карточка тиснение без лишнего",
      "горизонт ровный интерьер премиум отеля",
      "стойка ресепшн камень стекло металл",
      "печать сургуча на конверте символ власти",
      "шаг центральный коридора перспектива",
      "одна точка акцента в абстрактном фоне",
      "одежда крой без складки случайной",
      "стеклянный переговорный угол отражение города",
    ],
    magician: [
      "перелив хрома под углом камеры",
      "градиент без видимого источника света",
      "островной объект на чёрном фоне",
      "цифровое свечение интерфейса в темноте",
      "линза со звёздными лучами источника",
      "дым машины без видимого выхлопа постановка",
      "отражение экрана на радужке глаза",
      "сканирующая линия голограммы условной",
      "проекция света сквозь стекло призмы",
      "метаморфоза формы между двумя кадрами",
      "контур руки сквозь неоновое свечение",
      "частицы пыли в луче театральном",
      "зеркальная сфера с перевёрнутым городом",
      "плавная интерполяция цвета фона",
      "абстрактная сетка данных без текста",
      "капля воды сжатие времени заморозка",
      "контур лица подсветка RGB край",
      "магнитный левитационный объект студийный",
      "стекло жидкое впечатление через смазку",
      "кольцо света с неестественным падением тени",
      "прозрачный экран слои интерфейса",
      "штрих как след трансформации кадра",
      "бесконечное зеркало коридор без модели",
      "точка перспективы уходящая в свет",
      "контраст холодного и тёплого одномоментно",
      "визуальный глитч один раз по правилу",
      "объёмный звук как метафора без аудио",
      "портал света прямоугольник в стене постановка",
      "линза макро на матрице смартфона",
      "дуга света над объектом продукта",
    ],
    lover: [
      "кожа с естественными порами макро",
      "шёлковый изгиб ткани без резких складок",
      "тепло свечи на бокале стекла",
      "ракушечная текстура раковины крупный план",
      "растрёпанная прядь на скулах",
      "контакт двух ладоней без лица в кадре",
      "бордовый бархат под ладонью",
      "закатное золото на коже предплечья",
      "лепесток с каплей на кончике",
      "дым благовоний мягкий рассеянный",
      "губная помада след на краю стакана",
      "туфля на шпильке контровой свет",
      "воротник кружевной полупрозрачность деликатная",
      "искушение близкой дистанции объектив",
      "матовый фарфор под лучом боковым",
      "водоворот ткани в ладони модели",
      "прозрачный шифон слои наслоение",
      "металл золота матовый без глянца дешёвого",
      "капля масла на мраморе абстракция",
      "ресница крупный план без полного лица",
      "ожерелье как линия на ключицах",
      "дыхание пара над чашкой рядом с цветком",
      "камень гранат под лупой огранки",
      "касание ткани губами без пошлости композиции",
      "контраст шёлка и шерсти тактильный визуал",
      "кровать белое бельё складки естественные",
      "узкий луч на изгибе спины",
      "лак на ногтях отражение окна",
      "флирт взгляда через полупрозрачность ткани",
      "изгиб шеи свет падает по холму ключицы",
    ],
    caregiver: [
      "руки стирающие пятно терпеливо",
      "тепло одеяла на плечах сутулость мягкая",
      "чашка чая пар между собеседниками",
      "аптечка аккуратная разложенная полочка",
      "бинт ровная обмотка без драмы",
      "детская игрушка зачищенная безопасный край",
      "ухоженные растения на подоконнике дома",
      "ковёр без следов обуви у входа",
      "мягкий свет лампы у изголовья",
      "полотенце аккуратная складка вешалка",
      "конверт с запиской рукописная строка",
      "ладонь на спине успокаивающий жест",
      "плед заправленный угол матрас безупречный",
      "консультационный стол документы ровно",
      "пульсоксиметр на пальце бытовой свет",
      "тарелка супа пар без рекламной постановки",
      "пожилая рука и молодая ладонь контакт",
      "очки для чтения цепочка на столе",
      "пледной текстуры комната без холода кадра",
      "расписание приёма на доске без хаоса",
      "игрушечный медведь за спиной ребёнка",
      "укол вакцины кадр без шоковой графики",
      "плед на коленях кресло чтение",
      "конверт из бумаги крафт аккуратный сгиб",
      "аптечный шкафчик семейный порядок",
      "консультация на расстоянии вытянутой руки",
      "детская комната безопасный радиус углов",
      "плед на плечах после прогулки дождь за окном",
      "папка здоровья аккуратная маркировка",
      "разговор лицом к лицу на кухне стол",
    ],
    jester: [
      "слишком короткая перспектива ног",
      "размытый смех без звука кадр",
      "игрушечный реквизит крупнее реальности",
      "конфетти один раз в луче света",
      "перекошенная рамка как будто упала",
      "гипербола пропорций рука голова",
      "неожиданный реквизит в серьёзной обстановке",
      "брызги напитка без последствий монтажа",
      "лицо скрыто маской бумажной плоской",
      "цветной скотч на объективе постановка",
      "игровая доска фишки хаос но смешно",
      "брендовый логотип случайно перевёрнут",
      "бантик на техническом устройстве абсурд",
      "разноцветные носки как акцент без лица",
      "иллюзия провала пола перспектива",
      "глянцевый шарик жвачки на асфальте макро",
      "пластилиновая форма продукта утрировка",
      "надувной матрас в офисном коридоре",
      "кадр из серии «ошибка оператора» постановочная",
      "миска попкорна выше центра кадра",
      "гипербола грима подбородок белый линия",
      "пластиковая уточка в раковине кухни",
      "дурацкая поза серьёзный костюм контраст",
      "шариковая ручка как меч по правилу третей",
      "скользкий пол отражение потолка смешно",
      "лицо закрыто арбузной долькой цветовой акцент",
      "селфи группы без порядка голов",
      "надпись маркером поверх «официальной» графики",
      "пружина игрушки между двумя серьёзными объектами",
      "комический пауза пустой кадр дверной проём",
    ],
    sage: [
      "подчёркнутая сноска в макете страницы",
      "диаграмма без декоративных шрифтов",
      "стопка книг с закладкой текстильной",
      "линза очков отражение экрана данных",
      "структурированная таблица без цветных отвлечений",
      "чёрный текст на тёплой бумаге офсет",
      "график ось координат без украшений легенды",
      "конспект рукописный легкий на полях",
      "микроскоп монокулярный свет холодный",
      "чернильное перо без разводов случайных",
      "библиотечный стеллаж перспектива порядок",
      "цитата в рамке тонкая линия serif",
      "линейка металлическая шаг делений точный",
      "теперь и здесь подпись ко времени кадра",
      "интерфейс IDE монохром без ярких тем",
      "переплет диссертации корешок широкий",
      "архивная папка ярлык рукописный аккуратный",
      "белая доска формула без шуточных элементов",
      "прожектор на текст стены музей экспозиция",
      "линза камеры на штативе лабораторный стол",
      "градиент серого для типографского акцента",
      "строчка кода моноширинная без декора",
      "пузырьковая диаграмма данных минимализм",
      "перфорация блокнота ровная линия отрыва",
      "компас чертёжный без туристического контекста",
      "пластиковая культура чашки Петри студийный стол",
      "линза лупы над микросхемой доказательность",
      "строгий интерлиньяж абзац колонка узкая",
      "график корреляции точки без иллюстраций",
      "архивный конверт печать воска символ проверки",
    ],
  };

  function nicheAssocBoosters(niche) {
    const n = (niche || "").trim();
    if (!n || n.length > 48) return [];
    return [
      `конкретный жест сервиса в нише «${n}»`,
      `визуальный доказательный кадр под «${n}»`,
      `тихая экспертиза без лозунга в поле «${n}»`,
    ];
  }

  function pickAssociativePhrases(archId, seed, min, max) {
    const base = ASSOCIATIVE_BANK[archId] || ASSOCIATIVE_BANK.creator;
    const pool = base.slice();
    const count = min + (hashString(seed + "|cnt|" + archId) % (max - min + 1));
    const used = new Set();
    const out = [];
    let salt = hashString(seed);
    let guard = 0;
    while (out.length < count && guard < pool.length * 6) {
      const idx = (salt + guard * 1103515245) % pool.length;
      salt = hashString(String(salt) + guard);
      const phrase = pool[idx];
      if (!used.has(phrase)) {
        used.add(phrase);
        out.push(phrase);
      }
      guard++;
    }
    for (let i = 0; i < pool.length && out.length < count; i++) {
      if (!used.has(pool[i])) {
        used.add(pool[i]);
        out.push(pool[i]);
      }
    }
    return out;
  }

  function buildAssociativeFieldHtml(brand, arch, nicheBoosters) {
    const seed = [brand.brandName, brand.niche, brand.description].join("|");
    let phrases = pickAssociativePhrases(arch.id, seed, 20, 30);
    const extra = nicheBoosters.slice(0, 3);
    const insAfter = Math.min(5, phrases.length - 1);
    phrases = phrases.slice(0, phrases.length - extra.length);
    extra.forEach((line, i) => {
      phrases.splice(insAfter + i, 0, line);
    });
    if (phrases.length > 30) phrases = phrases.slice(0, 30);
    const items = phrases.map((p) => `<li>${escapeHtml(p)}</li>`).join("\n");
    return `<h2>Ассоциативное поле бренда</h2>\n<ul>\n${items}\n</ul>`;
  }

  function monthSeasonRu(monthIndex) {
    const m = monthIndex + 1;
    if (m === 12 || m <= 2) return { tag: "зима", hint: "период перезапуска планов и подарочных сценариев" };
    if (m <= 5) return { tag: "весна", hint: "обновление рутины и накопление энергии перед активным сезоном" };
    if (m <= 8) return { tag: "лето", hint: "мобильное потребление контента и открытый свет в кадре" };
    return { tag: "осень", hint: "возвращение к системности и закрытию года по проектам" };
  }

  function buildContentStrategyHtml(brand, arch, rows, imageMeta) {
    const emotion = rows.find((r) => r.param === "Эмоция")?.description || "";
    const values = rows.find((r) => r.param === "Ценности")?.description || "";
    const themes = rows.find((r) => r.param === "Темы")?.description || "";
    const niche = brand.niche || "ниша бренда";
    const name = brand.brandName || "Бренд";

    const goal = `Контент для «${escapeHtml(name)}» работает как доказательство архетипа «${escapeHtml(
      arch.ru
    )}»: он закрепляет узнаваемый образ в поле «${escapeHtml(
      niche
    )}» и переводит абстрактную эмоцию («${escapeHtml(emotion)}») в понятные сценарии подписей и кадров. Задача ленты — чтобы аудитория повторяла ключевой смысл бренда без объяснений и узнавала ваш визуальный код среди конкурентных потоков.`;

    const problem = `Аудитория «${escapeHtml(niche)}» часто перегружена одинаковыми визуальными клише и не доверяет обещаниям без доказательств в серии постов. Контент «${escapeHtml(
      name
    )}» снимает эту боль через связку ценности («${escapeHtml(values.slice(0, 120))}${values.length > 120 ? "…" : ""}») и повторяемые темы («${escapeHtml(themes.slice(0, 100))}${themes.length > 100 ? "…" : ""}»), показывая последовательность там, где рынок предлагает случайный набор «красивых» кадров.`;

    const now = new Date();
    const season = monthSeasonRu(now.getMonth());
    const infopovod = `Сезонный контекст (${season.tag}, ${now.getFullYear()}): аудитория ищет смыслы под ${season.hint}. В поле заметен запрос на прозрачность происхождения кадров и осмысленное использование ИИ в графике без потери характера бренда; параллельно растёт интерес к коротким экспертным форматам и честному визуальному языку без «глянцевого» напряжения — уместно показать процесс, «кухню» или до/после без перегруза эффектами. «${escapeHtml(
      name
    )}» может встроиться серией материалов, где каждый пост доказывает один элемент ДНК (архетип «${escapeHtml(arch.ru)}», эмоциональный тон «${escapeHtml(
      emotion
    )}»), а призыв мягко ведёт к действию без давления.`;

    const posts = [
      {
        title: `Карусель: язык «${escapeHtml(arch.ru)}» в трёх доказательствах`,
        gist: `Пять–семь слайдов: повторяемый визуальный код из ваших ${imageMeta.count} материалов + один слайд с формулировкой ценности для «${escapeHtml(niche)}».`,
        format: "карусель",
        dna: `архетип «${escapeHtml(arch.ru)}» и блок ценностей`,
      },
      {
        title: `Рилс: эмоция «${escapeHtml(emotion.slice(0, 40))}${emotion.length > 40 ? "…" : ""}» в одном жесте`,
        gist: `15–25 секунд: один узнаваемый повтор из вашей ленты (свет/ритм/фактура), без лишних декораций — зритель считывает настроение до текста.`,
        format: "рилс",
        dna: `эмоция и визуальные коды из таблицы ДНК`,
      },
      {
        title: `Сторис: линия дня под темы бренда`,
        gist: `Три–четыре сторис: утренний контекст ниши, рабочий процесс, короткий инсайт tone of voice, финальный кадр‑якорь как у постов в основной ленте.`,
        format: "сторис",
        dna: `архетип «${escapeHtml(arch.ru)}» + эмоциональный фон`,
      },
    ];

    const postsHtml = posts
      .map(
        (p) => `<li>
  <strong>${p.title}</strong>
  <p>Суть: ${p.gist}</p>
  <p>Формат: ${escapeHtml(p.format)}.</p>
  <p>Усиливает ДНК: ${p.dna}.</p>
</li>`
      )
      .join("\n");

    return `<h2>Контент-стратегия</h2>
<h3>Цель контента</h3>
<p>${goal}</p>
<h3>Проблема, которую решает контент</h3>
<p>${problem}</p>
<h3>Идеи для 3 постов (Instagram)</h3>
<ul class="content-post-list">
${postsHtml}
</ul>
<h3>Актуальный инфоповод</h3>
<p>${infopovod}</p>`;
  }

  const MockBrandAnalysisEngine = {
    /**
     * Заготовка под OpenAI: сюда же позже придут base64 / image URLs и промпт.
     * @param {BrandPayload} brand
     * @param {ImageSessionMeta} imageMeta
     * @returns {Promise<{ rows, visualNarrative, associativeFieldHtml, contentStrategyHtml, archetype }>}
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

      const nicheBoost = nicheAssocBoosters(brand.niche);
      const associativeFieldHtml = buildAssociativeFieldHtml(brand, arch, nicheBoost);
      const contentStrategyHtml = buildContentStrategyHtml(brand, arch, rows, imageMeta);

      return { rows, visualNarrative, associativeFieldHtml, contentStrategyHtml, archetype: arch };
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
      state.moodboard = [];
      state.moodboardKit = null;
      state.dnaTableHtml = buildTableHtml(result.rows);

      el.dnaTableWrap.innerHTML = state.dnaTableHtml;
      el.sectionDna.hidden = false;
      el.visualBlock.innerHTML = result.visualNarrative;
      el.sectionVisual.hidden = false;

      if (el.associativeBlock && el.sectionAssociative) {
        el.associativeBlock.innerHTML = result.associativeFieldHtml || "";
        el.sectionAssociative.hidden = !result.associativeFieldHtml;
      }
      if (el.contentStrategyBlock && el.sectionContent) {
        el.contentStrategyBlock.innerHTML = result.contentStrategyHtml || "";
        el.sectionContent.hidden = !result.contentStrategyHtml;
      }

      exportDnaPdfReadyHook({ brand: payload, table: state.dnaTableHtml });
      if (el.postAnalysisToolbar) el.postAnalysisToolbar.hidden = false;
      el.sectionDna.scrollIntoView({ behavior: "smooth", block: "start" });
    } finally {
      el.btnAnalyze.disabled = false;
    }
  }

  // ——— Мудборд как система ДНК ———

  function loadImageElementFromFile(file) {
    return new Promise((resolve, reject) => {
      const u = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(u);
        resolve(im);
      };
      im.onerror = () => {
        URL.revokeObjectURL(u);
        reject(new Error("img"));
      };
      im.src = u;
    });
  }

  function rgbToHexR(r, g, b) {
    const x = (v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0");
    return `#${x(r)}${x(g)}${x(b)}`.toUpperCase();
  }

  function dedupeSimilarPalette(arr) {
    const res = [];
    for (const c of arr) {
      if (
        !res.some(
          (x) =>
            Math.abs(x.r - c.r) < 20 &&
            Math.abs(x.g - c.g) < 20 &&
            Math.abs(x.b - c.b) < 20
        )
      ) {
        res.push(c);
      }
    }
    return res.slice(0, 5);
  }

  function kMeansRgb(samples, k) {
    const n = samples.length;
    if (n < k * 6) return null;
    const centroids = [];
    let guard = 0;
    while (centroids.length < k && guard++ < n * 4) {
      centroids.push(samples[(guard * 17) % n].slice());
    }
    while (centroids.length < k) centroids.push(samples[(centroids.length * 13) % n].slice());
    const clusters = Array.from({ length: k }, () => []);
    for (let it = 0; it < 14; it++) {
      clusters.forEach((c) => (c.length = 0));
      for (const p of samples) {
        let bi = 0;
        let bd = Infinity;
        for (let c = 0; c < k; c++) {
          const dx = p[0] - centroids[c][0];
          const dy = p[1] - centroids[c][1];
          const dz = p[2] - centroids[c][2];
          const d = dx * dx + dy * dy + dz * dz;
          if (d < bd) {
            bd = d;
            bi = c;
          }
        }
        clusters[bi].push(p);
      }
      for (let c = 0; c < k; c++) {
        if (!clusters[c].length) continue;
        centroids[c][0] = clusters[c].reduce((s, p) => s + p[0], 0) / clusters[c].length;
        centroids[c][1] = clusters[c].reduce((s, p) => s + p[1], 0) / clusters[c].length;
        centroids[c][2] = clusters[c].reduce((s, p) => s + p[2], 0) / clusters[c].length;
      }
    }
    return dedupeSimilarPalette(
      centroids.map((c) => ({
        r: Math.round(c[0]),
        g: Math.round(c[1]),
        b: Math.round(c[2]),
        hex: rgbToHexR(c[0], c[1], c[2]),
      }))
    );
  }

  async function extractDominantPaletteFromFiles(files, k) {
    const samples = [];
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const s = 40;
    canvas.width = s;
    canvas.height = s;
    for (const file of files) {
      try {
        const img = await loadImageElementFromFile(file);
        ctx.drawImage(img, 0, 0, s, s);
        const d = ctx.getImageData(0, 0, s, s).data;
        for (let i = 0; i < d.length; i += 24) {
          if (d[i + 3] < 35) continue;
          samples.push([d[i], d[i + 1], d[i + 2]]);
        }
      } catch (e) {
        /* skip */
      }
    }
    if (samples.length < k * 10) return null;
    return kMeansRgb(samples, Math.min(5, k));
  }

  function fallbackPaletteForArchetype(archId) {
    const map = {
      innocent: ["#F5F0E8", "#C8D9C4", "#8FA894", "#E8DCC8", "#A89888"],
      sage: ["#EAEAEA", "#6B7C85", "#4A5D66", "#D4C5B0", "#8B7355"],
      creator: ["#2C2C2C", "#D4A574", "#8B9FA8", "#EEE8E2", "#B8956C"],
      ruler: ["#1A1A1A", "#C9A962", "#6E7A82", "#EBE7E0", "#8B7355"],
      magician: ["#1E2A38", "#9B7ED9", "#6BB8C8", "#E8E4F0", "#5C6BC0"],
      outlaw: ["#1C1C1C", "#C94C4C", "#E8D5C4", "#8B7355", "#4A4A4A"],
      explorer: ["#2D4A3E", "#E8C99B", "#9CAF88", "#F4EFE6", "#7D9B83"],
      hero: ["#1F3D6C", "#F4C542", "#E8EDF2", "#C45044", "#6B7C9C"],
      lover: ["#3D2C36", "#E8C8D4", "#C9A9B8", "#F9F3F5", "#9B7B8E"],
      caregiver: ["#E8F0EC", "#A8C4B0", "#7D9B83", "#F5EDE5", "#C4B49A"],
      jester: ["#FFD54F", "#5C6BC0", "#FFFFFF", "#FF7043", "#8BC34A"],
      everyman: ["#5D4037", "#D7CCC8", "#8D6E63", "#EFEBE9", "#A1887F"],
    };
    const hexes = map[archId] || map.creator;
    return hexes.map((hex) => {
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
      return {
        r: parseInt(m[1], 16),
        g: parseInt(m[2], 16),
        b: parseInt(m[3], 16),
        hex,
      };
    });
  }

  const VISUAL_CODE_BANK = {};
  (function initVisualBank() {
    const V = {
      light: ["Рассеянный свет без жёстких теней.", "Мягкий боковой ключ и контролируемые блики."],
      color: ["Сдержанная палитра и один акцентный оттенок.", "Нейтральная база с цветовым фокусом на объект."],
      form: ["Модульная сетка и ясные блоки.", "Плавные линии и уравновешенные пропорции."],
      texture: ["Матовые поверхности и лёгкая зернистость.", "Гладкий фон и тактильный объект в фокусе."],
      composition: ["Фокус по правилу третей.", "Центральная композиция с воздухом по краям."],
    };
    ARCHETYPES.forEach((a) => {
      VISUAL_CODE_BANK[a.id] = V;
    });
  })();

  const ARCH_FORM_LINE = {
    innocent: "Мягкие радиусы и много воздуха, минимум агрессивных углов.",
    sage: "Структурированная сетка: горизонтали и вертикали как опоры ясности.",
    creator: "Авторская композиция и акцент на детали процесса или продукта.",
    ruler: "Симметрия и центрирование, ощущение порядка и контроля качества.",
    magician: "Динамика кадра и направление взгляда к точке «трансформации».",
    outlaw: "Диагонали и намеренный разрыв сетки, визуальное напряжение.",
    explorer: "Глубина пространства и линии пути, исследовательский горизонт.",
    hero: "Монументальность объекта и нижние якоря «силы».",
    lover: "Интимная близость кадра и сенсорный фокус.",
    caregiver: "Тёплые пропорции и обрамление человека или продукта.",
    jester: "Игра масштабом и неожиданный ракурс без потери читаемости.",
    everyman: "Естественная бытовая подача без театральной постановки.",
  };

  const ARCH_TEXTURE_LINE = {
    innocent: "Природные материалы, матовость и отказ от «холодного» глянца.",
    sage: "Гладкий фон и фактурный объект, чтобы подчеркнуть смысл.",
    creator: "Тактильные материалы: бумага, краска, ткань, след работы рук.",
    ruler: "Премиальные гладкие поверхности умеренного блеска.",
    magician: "Мягкие градиенты и лёгкая атмосфера глубины.",
    outlaw: "Шероховатость, зерно, контраст матовое и глянцевое.",
    explorer: "Природные фактуры: дерево, камень, материалы пути.",
    hero: "Плотные материалы и выраженный рельеф формы.",
    lover: "Шёлк, кожа, мягкий свет на телесных и текстильных поверхностях.",
    caregiver: "Тёплый текстиль и «домашняя» тактильность.",
    jester: "Контрастные фактуры для лёгкого визуального сюрприза.",
    everyman: "Привычные материалы повседневности без избыточной стилизации.",
  };

  const SYM_LINES = {
    innocent: [
      "Природный мотив или белое поле как знак чистоты и спокойствия.",
      "Жест заботы или простой бытовой контакт без перегруза.",
      "Мягкий домашний код без агрессивных знаков статуса.",
    ],
    sage: [
      "Иконография знаний: бумага, схема, фокус на факте.",
      "Повторяемый маркер экспертизы в углу кадра.",
      "Спокойный вторичный знак (линейка, сетка) без доминирования.",
    ],
    creator: [
      "Инструмент созидания или материал работы в кадре.",
      "Авторская деталь / штрих как доказательство процесса.",
      "Промежуточное состояние работы как история бренда.",
    ],
    ruler: [
      "Символ качества или статуса в выдержанной форме.",
      "Строгий узнаваемый объект продукта как центр системы.",
      "Геометрический код порядка и премиальности.",
    ],
    magician: [
      "Визуальный переход «до—после» или метафора трансформации.",
      "Световой акцент как точка интереса и изменения.",
      "Абстрактный элемент намёка на инновацию без клише.",
    ],
    outlaw: [
      "Контрастная деталь, ломающая шаблон ленты.",
      "Символ автономии или дерзости в пределах бренда.",
      "Фрагмент «несистемности», считываемый аудиторией ниши.",
    ],
    explorer: [
      "Линия горизонта или символ пути как повтор.",
      "Объект нового пространства без туристического клише.",
      "Указатель направления в мягкой форме.",
    ],
    hero: [
      "Объект преодоления или усилия в центре повествования.",
      "Вертикаль силы и монументальность без агрессии.",
      "Маркер результата в узнаваемой форме.",
    ],
    lover: [
      "Сенсорный объект близости и эстетики.",
      "Деталь красоты без вульгарного акцента.",
      "Руки или контакт как знак близости бренда к аудитории.",
    ],
    caregiver: [
      "Тёплый человеческий жест или забота о теле/пространстве.",
      "Мягкий домашний реквизит без «медицинского холода».",
      "Повтор мотива поддержки в серии кадров.",
    ],
    jester: [
      "Ироничная деталь без обесценивания продукта.",
      "Игра масштабом знакомого объекта.",
      "Лёгкий визуальный каламбур в рамках ToV.",
    ],
    everyman: [
      "Привычный объект повседневности как точка узнавания.",
      "Честный бытовой контекст без глянца.",
      "Повтор «своего» предмета из жизни аудитории.",
    ],
  };

  function pickRot(arr, idx) {
    return arr[idx % arr.length];
  }

  function buildMoodboardSlots(analysis, picks, brandPayload) {
    const arch = analysis.archetype;
    const emotion = analysis.rows.find((r) => r.param === "Эмоция")?.description || "";
    const values = analysis.rows.find((r) => r.param === "Ценности")?.description || "";
    const bank = VISUAL_CODE_BANK[arch.id] || VISUAL_CODE_BANK.creator;
    const bn = brandPayload.brandName || "бренд";
    const nc = brandPayload.niche || "ниша";

    return picks.map((img, idx) => {
      const focus = idx % 3;
      const titles = [`Архетип «${arch.ru}»`, "Эмоция бренда", "Ценности"];
      const details = [
        `Усиливает архетип «${arch.ru}» и узнаваемость «${bn}» в категории «${nc}».`,
        emotion.slice(0, 220) + (emotion.length > 220 ? "…" : ""),
        values.slice(0, 200) + (values.length > 200 ? "…" : ""),
      ];
      const visualCode = [
        `Свет: ${pickRot(bank.light, idx)}`,
        `Цвет: ${pickRot(bank.color, idx)}`,
        `Форма: ${pickRot(bank.form, idx)}`,
        `Текстура: ${pickRot(bank.texture, idx)}`,
        `Композиция: ${pickRot(bank.composition, idx)}`,
      ].join(" ");

      return {
        imageId: img.id,
        whySelected: `Опорный кадр ${idx + 1}/${picks.length}: включён в систему ДНК через ${titles[focus].toLowerCase()} и повторяемые паттерны серии (не декоративный выбор).`,
        dnaElement: `${titles[focus]} — ${details[focus]}`,
        visualCode,
      };
    });
  }

  function buildColorsCaption(arch, emotion, niche, hexList) {
    const em = emotion.slice(0, 115);
    const tail = emotion.length > 115 ? "…" : "";
    const hx = hexList.join(", ");
    return `Доминирующие оттенки (${hx}) извлечены из ваших кадров и поддерживают архетип «${arch.ru}» и эмоцию («${em}${tail}»): задают температуру визуала и узнаваемость в нише «${niche || "—"}».`;
  }

  function buildFormsTextures(arch, niche) {
    const fid = ARCH_FORM_LINE[arch.id] || ARCH_FORM_LINE.creator;
    const tid = ARCH_TEXTURE_LINE[arch.id] || ARCH_TEXTURE_LINE.creator;
    return [
      {
        element: "Формы",
        description: fid,
        dnaWhy: `Связано с архетипом «${arch.ru}»: язык формы считывается до текста в категории «${niche || "—"}».`,
      },
      {
        element: "Фактуры",
        description: tid,
        dnaWhy: `Усиливает тактильное обещание бренда и эмоцию визуальной подачи.`,
      },
      {
        element: "Ритм и повтор",
        description: "Повторяемые приёмы в серии создают узнаваемость ленты.",
        dnaWhy: `Proof point ДНК: стабильность между постами объединяет кадры в систему.`,
      },
    ];
  }

  function buildTypographyKit(arch, tovText) {
    const t = (tovText || "").slice(0, 145);
    const tail = (tovText || "").length > 145 ? "…" : "";
    return [
      {
        name: "Гуманистический гротеск + нейтральный акцент",
        description: "Мягкий шрифт без засечек для основного текста и узкий гротеск для подписей — баланс характера и функции.",
        dnaWhy: `Согласуется с архетипом «${arch.ru}» и заявленным Tone of Voice («${t}${tail}»).`,
      },
      {
        name: "Интерфейсный гротеск высокой читаемости",
        description: "Ровный ритм букв для мобильной ленты и карточек; минимум декора.",
        dnaWhy: `Поддерживает доказательность ДНК и доверие к подаче бренда.`,
      },
      {
        name:
          arch.id === "lover" || arch.id === "ruler"
            ? "Выразительная антиква для заголовков"
            : "Сдержанная антиква или полуантаб для заголовков",
        description:
          arch.id === "sage" || arch.id === "ruler"
            ? "Классическая вертикальная ритмика как знак экспертизы или статуса."
            : "Элегантные засечки для премиальной или эмоциональной иерархии.",
        dnaWhy: `Вторая линия типографики поддерживает эмоцию из блока «Эмоция» в таблице ДНК.`,
      },
    ];
  }

  function buildSymbolsKit(arch, niche, brandName) {
    const lines = SYM_LINES[arch.id] || SYM_LINES.creator;
    const bn = brandName || "бренд";
    return [
      {
        element: "Повтор в ленте",
        meaning: lines[0],
        dnaWhy: `Якорит узнаваемость «${bn}» в «${niche || "—"}» через архетип «${arch.ru}».`,
      },
      {
        element: "Объект-герой",
        meaning: lines[1],
        dnaWhy: `Фокус ДНК: что бренд делает главным носителем смысла в кадре.`,
      },
      {
        element: "Вторичный знак",
        meaning: lines[2],
        dnaWhy: `Усиливает эмоцию и ценности без конкуренции с основным посылом.`,
      },
    ];
  }

  async function buildFullMoodboardKit(analysis, picks, brandPayload) {
    const arch = analysis.archetype;
    const emotionRow = analysis.rows.find((r) => r.param === "Эмоция")?.description || "";
    const tovRow = analysis.rows.find((r) => r.param === "Tone of Voice")?.description || "";

    let palette = await extractDominantPaletteFromFiles(
      picks.map((p) => p.file),
      5
    );
    if (!palette || palette.length < 3) {
      palette = fallbackPaletteForArchetype(arch.id);
    }

    const slots = buildMoodboardSlots(analysis, picks, brandPayload);
    const hexList = palette.map((c) => c.hex);

    return {
      intro: `Архетип «${arch.ru}» → эмоция визуала → опора на ваших ${picks.length} кадрах → элементы ниже. Блоки согласованы с таблицей ДНК; элементы без логической связи с ДНК сюда не попадают (эвристика по описанию и архетипу; позже — ML/OpenAI).`,
      slots,
      colors: palette.slice(0, 5),
      colorsCaption: buildColorsCaption(arch, emotionRow, brandPayload.niche || "", hexList),
      formsTextures: buildFormsTextures(arch, brandPayload.niche || ""),
      typography: buildTypographyKit(arch, tovRow),
      symbols: buildSymbolsKit(arch, brandPayload.niche || "", brandPayload.brandName || ""),
    };
  }

  function renderMoodboardKitPanels() {
    const kit = state.moodboardKit;
    if (!kit) return;

    if (el.moodboardIntro) el.moodboardIntro.textContent = kit.intro;

    if (el.moodboardColorsSwatches) {
      el.moodboardColorsSwatches.innerHTML = "";
      kit.colors.forEach((c) => {
        const sw = document.createElement("div");
        sw.className = "moodboard-swatch";
        const chip = document.createElement("div");
        chip.className = "moodboard-swatch__chip";
        chip.style.background = c.hex;
        const hx = document.createElement("span");
        hx.className = "moodboard-swatch__hex";
        hx.textContent = c.hex;
        sw.appendChild(chip);
        sw.appendChild(hx);
        el.moodboardColorsSwatches.appendChild(sw);
      });
    }
    if (el.moodboardColorsCaption) el.moodboardColorsCaption.textContent = kit.colorsCaption;

    function fillList(ul, items, kind) {
      if (!ul) return;
      ul.innerHTML = "";
      items.forEach((it) => {
        const li = document.createElement("li");
        const strong = document.createElement("strong");
        const meta = document.createElement("span");
        meta.className = "kit-meta";
        const body = document.createElement("div");
        body.className = "mood-card__text";
        body.style.marginTop = "0.25rem";
        if (kind === "typo") {
          strong.textContent = it.name;
          body.textContent = it.description;
          meta.textContent = it.dnaWhy;
        } else if (kind === "sym") {
          strong.textContent = it.element;
          body.textContent = it.meaning;
          meta.textContent = it.dnaWhy;
        } else {
          strong.textContent = it.element;
          body.textContent = it.description;
          meta.textContent = it.dnaWhy;
        }
        li.appendChild(strong);
        li.appendChild(body);
        li.appendChild(meta);
        ul.appendChild(li);
      });
    }

    fillList(el.moodboardFormsList, kit.formsTextures, "form");
    fillList(el.moodboardTypographyList, kit.typography, "typo");
    fillList(el.moodboardSymbolsList, kit.symbols, "sym");
  }

  function renderMoodboardGridImages() {
    el.moodboardGrid.innerHTML = "";
    state.moodboard.forEach((slot) => {
      const img = state.images.find((i) => i.id === slot.imageId);
      if (!img) return;

      const detailId = `mood-why-${slot.imageId}`;

      const card = document.createElement("article");
      card.className = "mood-card";

      const wrap = document.createElement("div");
      wrap.className = "mood-card__img";
      const im = document.createElement("img");
      im.src = img.url;
      im.alt = "Мудборд бренда";
      wrap.appendChild(im);

      const whyRow = document.createElement("div");
      whyRow.className = "mood-card__why-row";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mood-card__why-btn";
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-controls", detailId);
      btn.setAttribute(
        "aria-label",
        "Показать пояснение: почему кадр в мудборде и связь с ДНК"
      );
      const btnLabel = document.createElement("span");
      btnLabel.textContent = "Почему в мудборде";
      const btnIcon = document.createElement("span");
      btnIcon.className = "mood-card__why-btn-icon";
      btnIcon.setAttribute("aria-hidden", "true");
      btnIcon.textContent = "▼";
      btn.appendChild(btnLabel);
      btn.appendChild(btnIcon);
      whyRow.appendChild(btn);

      const details = document.createElement("div");
      details.className = "mood-card__details";
      details.id = detailId;
      details.hidden = true;

      const lb1 = document.createElement("p");
      lb1.className = "mood-card__label";
      lb1.textContent = "Почему в мудборде";
      const p1 = document.createElement("p");
      p1.className = "mood-card__text";
      p1.textContent = slot.whySelected;

      const lb2 = document.createElement("p");
      lb2.className = "mood-card__label";
      lb2.textContent = "Элемент ДНК";
      const p2 = document.createElement("p");
      p2.className = "mood-card__text";
      p2.textContent = slot.dnaElement;

      const lb3 = document.createElement("p");
      lb3.className = "mood-card__label";
      lb3.textContent = "Визуальный код в кадре";
      const p3 = document.createElement("p");
      p3.className = "mood-card__text";
      p3.textContent = slot.visualCode;

      details.appendChild(lb1);
      details.appendChild(p1);
      details.appendChild(lb2);
      details.appendChild(p2);
      details.appendChild(lb3);
      details.appendChild(p3);

      card.appendChild(wrap);
      card.appendChild(whyRow);
      card.appendChild(details);
      el.moodboardGrid.appendChild(card);
    });
  }

  function renderMoodboardFull() {
    renderMoodboardGridImages();
    renderMoodboardKitPanels();
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

  async function buildMoodboardInternal({ rebuild }) {
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

    const brandPayload = getBrandPayload();
    try {
      const kit = await buildFullMoodboardKit(state.analysis, picks, brandPayload);
      state.moodboard = kit.slots;
      state.moodboardKit = kit;
    } catch (e) {
      console.error(e);
      const slotsFallback = buildMoodboardSlots(state.analysis, picks, brandPayload);
      state.moodboard = slotsFallback;
      const fbPalette = fallbackPaletteForArchetype(archId).slice(0, 5);
      state.moodboardKit = {
        intro: `Мудборд по архетипу «${state.analysis.archetype.ru}». Палитра упрощена из‑за ошибки выборки цветов из файлов.`,
        slots: slotsFallback,
        colors: fbPalette,
        colorsCaption: buildColorsCaption(
          state.analysis.archetype,
          state.analysis.rows.find((r) => r.param === "Эмоция")?.description || "",
          brandPayload.niche || "",
          fbPalette.map((c) => c.hex)
        ),
        formsTextures: buildFormsTextures(state.analysis.archetype, brandPayload.niche || ""),
        typography: buildTypographyKit(
          state.analysis.archetype,
          state.analysis.rows.find((r) => r.param === "Tone of Voice")?.description || ""
        ),
        symbols: buildSymbolsKit(
          state.analysis.archetype,
          brandPayload.niche || "",
          brandPayload.brandName || ""
        ),
      };
    }

    renderMoodboardFull();
    el.sectionMoodboard.hidden = false;
    el.sectionMoodboard.scrollIntoView({ behavior: "smooth", block: "start" });
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
    if (!state.moodboard.length || !state.moodboardKit) {
      alert("Сначала соберите мудборд.");
      return;
    }
    const brand = getBrandPayload();
    const kit = state.moodboardKit;

    const itemsParts = [];
    for (const slot of state.moodboard) {
      const img = state.images.find((i) => i.id === slot.imageId);
      if (!img) continue;
      const dataUrl = await fileToDataUrl(img.file);
      itemsParts.push(`
      <article class="mb-card">
        <div class="mb-img"><img src="${dataUrl}" alt="" /></div>
        <div class="mb-cap">
          <p class="mb-l">Почему в мудборде</p>
          <p>${escapeHtml(slot.whySelected)}</p>
          <p class="mb-l">Элемент ДНК</p>
          <p>${escapeHtml(slot.dnaElement)}</p>
          <p class="mb-l">Визуальный код</p>
          <p>${escapeHtml(slot.visualCode)}</p>
        </div>
      </article>`);
    }

    const swatches = kit.colors
      .map(
        (c) =>
          `<div class="sw"><span class="ch" style="background:${escapeHtml(c.hex)}"></span><span class="hx">${escapeHtml(c.hex)}</span></div>`
      )
      .join("");

    const liForms = kit.formsTextures
      .map(
        (it) =>
          `<li><strong>${escapeHtml(it.element)}</strong><div>${escapeHtml(it.description)}</div><span class="meta">${escapeHtml(it.dnaWhy)}</span></li>`
      )
      .join("");

    const liTypo = kit.typography
      .map(
        (it) =>
          `<li><strong>${escapeHtml(it.name)}</strong><div>${escapeHtml(it.description)}</div><span class="meta">${escapeHtml(it.dnaWhy)}</span></li>`
      )
      .join("");

    const liSym = kit.symbols
      .map(
        (it) =>
          `<li><strong>${escapeHtml(it.element)}</strong><div>${escapeHtml(it.meaning)}</div><span class="meta">${escapeHtml(it.dnaWhy)}</span></li>`
      )
      .join("");

    const doc = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<title>Мудборд-система — ${escapeHtml(brand.brandName || "Brand")}</title>
<style>
body{font-family:system-ui,sans-serif;margin:2rem;background:#f6f4f1;color:#1c1b19;line-height:1.45;}
h1{font-size:1.35rem;}
h2{font-size:1.1rem;margin:2rem 0 0.75rem;}
.intro{font-size:0.95rem;color:#444;margin-bottom:1.25rem;padding:0.85rem 1rem;background:#fff;border-radius:12px;border:1px solid #e8e4de;}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1.25rem;}
.mb-card{background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e8e4de;}
.mb-img img{width:100%;display:block;aspect-ratio:4/3;object-fit:cover;}
.mb-cap{padding:0.85rem 1rem;font-size:0.82rem;color:#444;}
.mb-l{font-size:0.68rem;text-transform:uppercase;letter-spacing:.06em;color:#b8956c;font-weight:700;margin:0.65rem 0 0.25rem;}
.mb-l:first-child{margin-top:0;}
.panel{background:#fff;border-radius:14px;border:1px solid #e8e4de;padding:1rem 1.15rem;margin-top:1rem;}
.sw{display:inline-flex;flex-direction:column;gap:0.25rem;margin-right:0.75rem;margin-bottom:0.5rem;}
.ch{width:4rem;height:3rem;border-radius:8px;border:1px solid rgba(0,0,0,.12);}
.hx{font-size:0.72rem;font-family:monospace;color:#666;}
.caption{font-size:0.88rem;color:#555;margin-top:0.65rem;}
ul.kit{list-style:none;padding:0;margin:0;}
ul.kit li{padding:0.65rem 0;border-bottom:1px solid #eee;font-size:0.88rem;color:#444;}
ul.kit li:last-child{border:none;}
ul.kit strong{display:block;color:#1c1b19;margin-bottom:0.25rem;}
.meta{display:block;font-size:0.78rem;color:#b8956c;margin-top:0.35rem;}
.row{display:flex;flex-wrap:wrap;}
</style>
</head>
<body>
<h1>Мудборд-система: ${escapeHtml(brand.brandName || "")}</h1>
<p class="intro">${escapeHtml(kit.intro)}</p>
<h2>Ключевые кадры</h2>
<div class="grid">${itemsParts.join("")}</div>
<section class="panel">
<h2>Цвета бренда</h2>
<div class="row">${swatches}</div>
<p class="caption">${escapeHtml(kit.colorsCaption)}</p>
</section>
<section class="panel">
<h2>Формы и фактуры</h2>
<ul class="kit">${liForms}</ul>
</section>
<section class="panel">
<h2>Типографика</h2>
<ul class="kit">${liTypo}</ul>
</section>
<section class="panel">
<h2>Символы и элементы</h2>
<ul class="kit">${liSym}</ul>
</section>
<p style="margin-top:2rem;font-size:0.85rem;color:#666;">Сформировано Brand Analyzer из загруженных пользователем материалов.</p>
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
    const target = el.moodboardCaptureRoot || el.moodboardGrid;
    try {
      return await html2canvas(target, {
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

  if (el.moodboardGrid) {
    el.moodboardGrid.addEventListener("click", (e) => {
      const btn = e.target.closest(".mood-card__why-btn");
      if (!btn || !el.moodboardGrid.contains(btn)) return;
      const panelId = btn.getAttribute("aria-controls");
      const panel = panelId ? document.getElementById(panelId) : null;
      if (!panel) return;
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", open ? "false" : "true");
      btn.setAttribute(
        "aria-label",
        open
          ? "Показать пояснение: почему кадр в мудборде и связь с ДНК"
          : "Скрыть пояснение к кадру"
      );
      panel.hidden = open;
    });
  }

  el.btnAnalyze.addEventListener("click", runAnalysis);
  el.btnMoodboard.addEventListener("click", () => void buildMoodboardInternal({ rebuild: false }));
  el.btnRebuildMoodboard.addEventListener("click", () => void buildMoodboardInternal({ rebuild: true }));

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
