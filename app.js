const demoData = {
  category: "smartphone",
  products: [
    {
      store: "Магазин A",
      name: "Nova One 256 GB",
      price: "69 990 ₽",
      badge: "Товар 01",
      url: null,
      image: null,
      offers: [
        { store: "Магазин A", price: "69 990 ₽", available: true, url: null },
        { store: "Магазин C", price: "67 490 ₽", available: true, url: null },
        { store: "Маркетплейс", price: "66 990 ₽", available: true, url: null }
      ]
    },
    {
      store: "Магазин B",
      name: "Orbit Pro 256 GB",
      price: "72 990 ₽",
      badge: "Товар 02",
      url: null,
      image: null,
      offers: [
        { store: "Магазин B", price: "72 990 ₽", available: true, url: null },
        { store: "Магазин C", price: "71 490 ₽", available: true, url: null },
        { store: "Маркетплейс", price: "70 890 ₽", available: false, url: null }
      ]
    }
  ],
  summary: "У Nova One больше аккумулятор и ниже цена. Orbit Pro легче и предлагает экран с более высокой частотой обновления. Выбор зависит от того, что важнее: автономность и цена или экран и вес.",
  specs: [
    { key: "display", label: "Экран", a: "6,7″ OLED", b: "6,7″ OLED", diff: "Одинаковый тип и диагональ", important: true, type: "same" },
    { key: "refresh", label: "Частота экрана", a: "120 Гц", b: "144 Гц", diff: "Второй товар +24 Гц", important: true, type: "win-b" },
    { key: "ram", label: "Оперативная память", a: "12 ГБ", b: "12 ГБ", diff: "Одинаково", important: true, type: "same" },
    { key: "storage", label: "Память", a: "256 ГБ", b: "256 ГБ", diff: "Одинаково", important: true, type: "same" },
    { key: "battery", label: "Аккумулятор", a: "5200 мА·ч", b: "4700 мА·ч", diff: "Первый товар +500 мА·ч", important: true, type: "win-a" },
    { key: "weight", label: "Вес", a: "205 г", b: "188 г", diff: "Второй товар легче на 17 г", important: false, type: "win-b" }
  ]
};

const CATEGORY_LABELS = {
  gpu: "Видеокарты",
  cpu: "Процессоры",
  smartphone: "Смартфоны",
  laptop: "Ноутбуки",
  monitor: "Мониторы",
  tv: "Телевизоры",
  ssd: "SSD",
  headphones: "Наушники",
  refrigerator: "Холодильники",
  "washing-machine": "Стиральные машины",
  generic: "Товары"
};

const els = {
  urlA: document.querySelector("#urlA"),
  urlB: document.querySelector("#urlB"),
  compareButton: document.querySelector("#compareButton"),
  demoButton: document.querySelector("#demoButton"),
  formNote: document.querySelector("#formNote"),
  results: document.querySelector("#results"),
  resultContext: document.querySelector("#resultContext"),
  productGrid: document.querySelector("#productGrid"),
  summaryCard: document.querySelector("#summaryCard"),
  specBody: document.querySelector("#specBody"),
  tableProductA: document.querySelector("#tableProductA"),
  tableProductB: document.querySelector("#tableProductB"),
  offersSection: document.querySelector("#offersSection"),
  offersGrid: document.querySelector("#offersGrid")
};

const YANDEX_API_ENDPOINT = "https://functions.yandexcloud.net/d4ea624dbpvf3irs1iev";
const queryApi = new URLSearchParams(location.search).get("api");
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_ENDPOINT = queryApi
  ? queryApi.replace(/\/$/, "")
  : isLocal
    ? "http://localhost:8787/api/compare"
    : YANDEX_API_ENDPOINT;

let activeFilter = "all";
let currentData = null;

function isValidUrl(value) {
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch { return false; }
}

function hostLabel(value) {
  try { return new URL(value).hostname.replace(/^www\./, ""); }
  catch { return "магазин"; }
}

function categoryLabel(category) {
  if (!category) return "Категория определяется автоматически";
  return CATEGORY_LABELS[category] || humanizeCategory(category);
}

function humanizeCategory(value) {
  return String(value)
    .replace(/[-_]+/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function showNote(text, state = "") {
  els.formNote.className = `form-note ${state}`.trim();
  els.formNote.textContent = text;
}

function renderContext(data) {
  const category = categoryLabel(data.category);
  const count = data.specs.length;
  const differences = data.specs.filter((spec) => spec.type !== "same").length;
  els.resultContext.innerHTML = `
    <span class="context-pill"><b>${escapeHtml(category)}</b></span>
    <span>${count} параметров сопоставлено</span>
    <span>${differences} отличий найдено</span>
    ${data.partial ? '<span class="context-pill">Частичный результат</span>' : ''}`;
}

function renderProducts(products, category) {
  const label = categoryLabel(category);
  els.productGrid.innerHTML = products.map((product) => {
    const sourceAction = product.url
      ? `<a class="product-link" href="${escapeAttribute(product.url)}" target="_blank" rel="noreferrer">Открыть товар ↗</a>`
      : `<span class="product-link disabled">Демо-товар</span>`;

    return `
      <article class="product-card">
        <div class="product-topline">
          <div class="product-store">${escapeHtml(product.store || "Источник")}</div>
          <span class="category-badge">${escapeHtml(label)}</span>
        </div>
        <h3>${escapeHtml(product.name)}</h3>
        <div class="product-meta">
          <span class="product-price">${escapeHtml(product.price || "Цена не найдена")}</span>
          <span class="product-badge">${escapeHtml(product.badge)}</span>
        </div>
        <div class="product-actions">${sourceAction}</div>
      </article>`;
  }).join("");

  els.tableProductA.textContent = products[0]?.name || "Товар 1";
  els.tableProductB.textContent = products[1]?.name || "Товар 2";
}

function renderSummary(summary) {
  els.summaryCard.innerHTML = `
    <div class="summary-icon">↗</div>
    <div>
      <h3>Что здесь действительно отличается</h3>
      <p>${escapeHtml(summary || "Сравнение готово.")}</p>
    </div>`;
}

function renderSpecs() {
  if (!currentData) return;

  const visibleSpecs = currentData.specs.filter((spec) => {
    if (activeFilter === "diff") return spec.type !== "same";
    if (activeFilter === "important") return spec.important;
    return true;
  });

  if (!visibleSpecs.length) {
    els.specBody.innerHTML = `<tr><td colspan="4" class="empty-row">По этому фильтру характеристик нет.</td></tr>`;
    return;
  }

  els.specBody.innerHTML = visibleSpecs.map((spec) => {
    const diffClass = spec.type === "win-a" || spec.type === "win-b"
      ? "win"
      : spec.type === "warn"
        ? "warn"
        : "";

    return `<tr>
      <td class="spec-name">${escapeHtml(spec.label)}${spec.important ? '<span class="importance">важно</span>' : ""}</td>
      <td class="spec-value">${escapeHtml(spec.a)}</td>
      <td class="spec-value">${escapeHtml(spec.b)}</td>
      <td class="spec-diff ${diffClass}">${escapeHtml(spec.diff)}</td>
    </tr>`;
  }).join("");
}

function renderOffers(products) {
  const hasAnyOffers = products.some((product) => Array.isArray(product.offers) && product.offers.length);
  els.offersSection.classList.toggle("hidden", !hasAnyOffers);
  if (!hasAnyOffers) return;

  els.offersGrid.innerHTML = products.map((product, index) => {
    const offers = Array.isArray(product.offers) ? product.offers : [];
    const rows = offers.length
      ? offers.map(renderOffer).join("")
      : `<div class="offer-empty">Предложения пока не найдены.</div>`;

    return `
      <article class="offer-column">
        <div class="offer-product-head">
          <span>Товар 0${index + 1}</span>
          <h4>${escapeHtml(product.name)}</h4>
        </div>
        <div class="offer-list">${rows}</div>
      </article>`;
  }).join("");
}

function renderOffer(offer) {
  const availabilityClass = offer.available === false ? "unavailable" : "";
  const availability = offer.available === false ? "Нет в наличии" : offer.available === true ? "В наличии" : "Наличие уточняется";
  const action = offer.url
    ? `<a class="buy-button" href="${escapeAttribute(offer.url)}" target="_blank" rel="noreferrer">К товару →</a>`
    : `<span class="buy-button disabled">Демо</span>`;

  return `
    <div class="offer-row ${availabilityClass}">
      <div class="offer-store">
        <strong>${escapeHtml(offer.store || "Магазин")}</strong>
        <small>${escapeHtml(availability)}</small>
      </div>
      <div class="offer-price">${escapeHtml(offer.price || "Цена не найдена")}</div>
      ${action}
    </div>`;
}

function renderComparison(data) {
  currentData = data;
  renderContext(data);
  renderProducts(data.products, data.category);
  renderSummary(data.summary);
  renderSpecs();
  renderOffers(data.products);
  els.results.classList.remove("hidden");
  requestAnimationFrame(() => els.results.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function runDemo() {
  els.urlA.value = "https://магазин-a.ru/product/nova-one-256";
  els.urlB.value = "https://магазин-b.ru/product/orbit-pro-256";
  showNote("Демо показывает универсальный интерфейс Specly на примере смартфонов.", "ok");
  renderComparison(demoData);
}

async function compareEnteredUrls() {
  const a = els.urlA.value.trim();
  const b = els.urlB.value.trim();

  if (!isValidUrl(a) || !isValidUrl(b)) {
    return showNote("Вставь две полные ссылки, начинающиеся с http:// или https://.", "error");
  }
  if (a === b) {
    return showNote("Ссылки одинаковые — для сравнения нужны два разных товара.", "error");
  }

  setLoading(true);
  showNote(`Определяю товары и получаю данные с ${hostLabel(a)} и ${hostLabel(b)}…`);

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ urls: [a, b] })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw payload.error || { message: `API вернул HTTP ${response.status}` };

    renderComparison(mapApiResponse(payload));
    showNote(
      currentData?.partial
        ? "Получен частичный результат: один из источников не отдал все характеристики, но доступные данные и ссылки сохранены."
        : "Товары распознаны, доступные характеристики сопоставлены.",
      "ok"
    );
  } catch (error) {
    const candidates = error?.details?.candidates;
    const host = error?.details?.host;
    const hostPrefix = host ? `${host}: ` : "";
    const suffix = Array.isArray(candidates) && candidates.length
      ? ` Найдено товаров: ${candidates.map((item) => item.title).join("; ")}. Вставь ссылку конкретного товара.`
      : "";
    showNote(`${hostPrefix}${error?.message || "Не удалось получить данные о товарах."}${suffix}`, "error");
  } finally {
    setLoading(false);
  }
}

function mapApiResponse(payload) {
  const products = (payload.products || []).map((product, index) => {
    const ownOffer = product.url
      ? [{
          store: product.store || product.source || hostLabel(product.url),
          price: formatPrice(product.price),
          available: product.available ?? null,
          url: product.url
        }]
      : [];

    const offers = Array.isArray(product.offers) && product.offers.length
      ? product.offers.map((offer) => ({
          store: offer.store || offer.source || "Магазин",
          price: formatPrice(offer.price),
          available: offer.available ?? null,
          url: offer.url || null
        }))
      : ownOffer;

    return {
      store: product.store || product.source || "Источник",
      name: product.title || product.name || `Товар ${index + 1}`,
      price: formatPrice(product.price),
      badge: `Товар 0${index + 1}`,
      url: product.url || null,
      image: product.image || null,
      offers
    };
  });

  return {
    category: payload.category || "generic",
    products,
    partial: payload.status === "partial" || Boolean(payload.partialComparison),
    errors: Array.isArray(payload.errors) ? payload.errors : [],
    summary: payload.summary || "Сравнение готово.",
    specs: (payload.comparison || []).map((row) => ({
      key: row.key,
      label: row.label,
      a: row.displayValues?.[0] ?? displayFallback(row.values?.[0]),
      b: row.displayValues?.[1] ?? displayFallback(row.values?.[1]),
      diff: row.note || (row.different ? "Значения отличаются" : "Одинаково"),
      important: Boolean(row.important),
      type: !row.different
        ? "same"
        : row.winner === 0
          ? "win-a"
          : row.winner === 1
            ? "win-b"
            : row.preference === "context"
              ? "warn"
              : "neutral"
    }))
  };
}

function displayFallback(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function formatPrice(price) {
  if (typeof price === "string") return price;
  if (!price || price.value == null) return "Цена не найдена";
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: price.currency || "RUB",
      maximumFractionDigits: 0
    }).format(price.value);
  } catch {
    return `${price.value} ${price.currency || ""}`.trim();
  }
}

function setLoading(loading) {
  els.compareButton.disabled = loading;
  els.compareButton.innerHTML = loading ? "Сравниваю…" : "Сравнить товары <span>→</span>";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

els.compareButton.addEventListener("click", compareEnteredUrls);
els.demoButton.addEventListener("click", runDemo);

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    activeFilter = button.dataset.filter;
    renderSpecs();
  });
});

[els.urlA, els.urlB].forEach((input) => {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") compareEnteredUrls();
  });
});
