const demoData = {
  products: [
    { store: "DNS", name: "Radeon RX 580 8 GB", price: "—", badge: "Товар 01", url: "https://www.dns-shop.ru/" },
    { store: "М.Видео", name: "GeForce GTX 1060 6 GB", price: "—", badge: "Товар 02", url: "https://www.mvideo.ru/" }
  ],
  summary: "RX 580 предлагает больший объём видеопамяти и более широкую шину памяти. GTX 1060 заметно экономичнее по энергопотреблению. Итоговый выбор зависит от конкретных цен, состояния карты и сценария использования.",
  specs: [
    { key: "gpu", label: "Графический процессор", a: "Radeon RX 580", b: "GeForce GTX 1060", diff: "Разные GPU", important: true, type: "neutral" },
    { key: "vram", label: "Видеопамять", a: "8 ГБ", b: "6 ГБ", diff: "RX 580 +2 ГБ", important: true, type: "win-a" },
    { key: "memory", label: "Тип памяти", a: "GDDR5", b: "GDDR5", diff: "Одинаково", important: true, type: "same" },
    { key: "bus", label: "Шина памяти", a: "256 бит", b: "192 бит", diff: "RX 580 +64 бит", important: true, type: "win-a" },
    { key: "tdp", label: "Энергопотребление (TDP)", a: "185 Вт", b: "120 Вт", diff: "GTX 1060 −65 Вт", important: true, type: "win-b" },
    { key: "power", label: "Доп. питание", a: "1 × 8-pin", b: "1 × 6-pin", diff: "Разные требования", important: true, type: "neutral" }
  ]
};

const els = {
  urlA: document.querySelector("#urlA"), urlB: document.querySelector("#urlB"),
  compareButton: document.querySelector("#compareButton"), demoButton: document.querySelector("#demoButton"),
  formNote: document.querySelector("#formNote"), results: document.querySelector("#results"),
  productGrid: document.querySelector("#productGrid"), summaryCard: document.querySelector("#summaryCard"),
  specBody: document.querySelector("#specBody"), tableProductA: document.querySelector("#tableProductA"),
  tableProductB: document.querySelector("#tableProductB")
};

const YANDEX_API_ENDPOINT = "https://functions.yandexcloud.net/d4e8s55p90sv6i1lj2ii";
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

function showNote(text, state = "") {
  els.formNote.className = `form-note ${state}`.trim();
  els.formNote.textContent = text;
}

function renderProducts(products) {
  els.productGrid.innerHTML = products.map((product) => `
    <article class="product-card">
      <div class="product-store">${escapeHtml(product.store)}</div>
      <h3>${escapeHtml(product.name)}</h3>
      <div class="product-meta">
        <span class="product-price">${escapeHtml(product.price)}</span>
        <span class="product-badge">${escapeHtml(product.badge)}</span>
      </div>
    </article>`).join("");
  els.tableProductA.textContent = products[0].name;
  els.tableProductB.textContent = products[1].name;
}

function renderSummary(summary) {
  els.summaryCard.innerHTML = `<div class="summary-icon">↗</div><div><h3>Что здесь действительно отличается</h3><p>${escapeHtml(summary)}</p></div>`;
}

function renderSpecs() {
  if (!currentData) return;
  const visibleSpecs = currentData.specs.filter((spec) => {
    if (activeFilter === "diff") return spec.type !== "same";
    if (activeFilter === "important") return spec.important;
    return true;
  });

  els.specBody.innerHTML = visibleSpecs.map((spec) => {
    const diffClass = spec.type === "win-a" || spec.type === "win-b" ? "win" : spec.type === "warn" ? "warn" : "";
    return `<tr>
      <td class="spec-name">${escapeHtml(spec.label)}${spec.important ? '<span class="importance">важно</span>' : ""}</td>
      <td class="spec-value">${escapeHtml(spec.a)}</td>
      <td class="spec-value">${escapeHtml(spec.b)}</td>
      <td class="spec-diff ${diffClass}">${escapeHtml(spec.diff)}</td>
    </tr>`;
  }).join("");
}

function renderComparison(data) {
  currentData = data;
  renderProducts(data.products);
  renderSummary(data.summary);
  renderSpecs();
  els.results.classList.remove("hidden");
  requestAnimationFrame(() => els.results.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function runDemo() {
  els.urlA.value = "https://www.dns-shop.ru/product/.../radeon-rx-580/";
  els.urlB.value = "https://www.mvideo.ru/products/.../geforce-gtx-1060/";
  showNote("Демо использует подготовленный набор данных.", "ok");
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
  showNote(`Получаю характеристики с ${hostLabel(a)} и ${hostLabel(b)} через российский Parser API…`);

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ urls: [a, b] })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw payload.error || { message: `API вернул HTTP ${response.status}` };

    renderComparison(mapApiResponse(payload));
    showNote("Характеристики получены через Yandex Cloud и нормализованы.", "ok");
  } catch (error) {
    const candidates = error?.details?.candidates;
    const host = error?.details?.host;
    const hostPrefix = host ? `${host}: ` : "";
    const suffix = Array.isArray(candidates) && candidates.length
      ? ` Найдено товаров: ${candidates.map((item) => item.title).join("; ")}. Вставь ссылку конкретного товара.`
      : "";
    showNote(`${hostPrefix}${error?.message || "Не удалось получить характеристики."}${suffix}`, "error");
  } finally {
    setLoading(false);
  }
}

function mapApiResponse(payload) {
  return {
    products: payload.products.map((product, index) => ({
      store: product.store || product.source,
      name: product.title,
      price: formatPrice(product.price),
      badge: `Товар 0${index + 1}`,
      url: product.url
    })),
    summary: payload.summary || "Сравнение готово.",
    specs: payload.comparison.map((row) => ({
      key: row.key,
      label: row.label,
      a: row.displayValues[0],
      b: row.displayValues[1],
      diff: row.note,
      important: row.important,
      type: !row.different ? "same" : row.winner === 0 ? "win-a" : row.winner === 1 ? "win-b" : row.preference === "context" ? "warn" : "neutral"
    }))
  };
}

function formatPrice(price) {
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
  els.compareButton.textContent = loading ? "Сравниваю…" : "Сравнить";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
