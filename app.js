const demoData = {
  products: [
    {
      store: "DNS",
      name: "Radeon RX 580 8 GB",
      price: "—",
      badge: "Товар 01",
      url: "https://www.dns-shop.ru/"
    },
    {
      store: "М.Видео",
      name: "GeForce GTX 1060 6 GB",
      price: "—",
      badge: "Товар 02",
      url: "https://www.mvideo.ru/"
    }
  ],
  summary: "RX 580 предлагает больший объём видеопамяти и более широкую шину памяти. GTX 1060 заметно экономичнее по энергопотреблению. Итоговый выбор зависит от конкретных цен, состояния карты и сценария использования — Specly не должен превращать одну цифру в универсальный «рейтинг победителя».",
  specs: [
    { key: "gpu", label: "Графический процессор", a: "Radeon RX 580", b: "GeForce GTX 1060", diff: "Разные GPU", important: true, type: "neutral" },
    { key: "vram", label: "Видеопамять", a: "8 ГБ", b: "6 ГБ", diff: "RX 580 +2 ГБ", important: true, type: "win-a" },
    { key: "memory", label: "Тип памяти", a: "GDDR5", b: "GDDR5", diff: "Одинаково", important: true, type: "same" },
    { key: "bus", label: "Шина памяти", a: "256 бит", b: "192 бит", diff: "RX 580 +64 бит", important: true, type: "win-a" },
    { key: "tdp", label: "Энергопотребление (TDP)", a: "185 Вт", b: "120 Вт", diff: "GTX 1060 −65 Вт", important: true, type: "win-b" },
    { key: "power", label: "Доп. питание", a: "1 × 8-pin", b: "1 × 6-pin", diff: "Разные требования", important: true, type: "neutral" },
    { key: "process", label: "Техпроцесс", a: "14 нм", b: "16 нм", diff: "Не сравнивать напрямую", important: false, type: "warn" },
    { key: "api", label: "DirectX", a: "12", b: "12", diff: "Одинаково", important: false, type: "same" }
  ]
};

const els = {
  urlA: document.querySelector("#urlA"),
  urlB: document.querySelector("#urlB"),
  compareButton: document.querySelector("#compareButton"),
  demoButton: document.querySelector("#demoButton"),
  formNote: document.querySelector("#formNote"),
  results: document.querySelector("#results"),
  productGrid: document.querySelector("#productGrid"),
  summaryCard: document.querySelector("#summaryCard"),
  specBody: document.querySelector("#specBody"),
  tableProductA: document.querySelector("#tableProductA"),
  tableProductB: document.querySelector("#tableProductB")
};

let activeFilter = "all";
let currentData = null;

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function hostLabel(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "магазин";
  }
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
    </article>
  `).join("");

  els.tableProductA.textContent = products[0].name;
  els.tableProductB.textContent = products[1].name;
}

function renderSummary(summary) {
  els.summaryCard.innerHTML = `
    <div class="summary-icon">↗</div>
    <div>
      <h3>Что здесь действительно отличается</h3>
      <p>${escapeHtml(summary)}</p>
    </div>
  `;
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
    return `
      <tr>
        <td class="spec-name">${escapeHtml(spec.label)}${spec.important ? '<span class="importance">важно</span>' : ""}</td>
        <td class="spec-value">${escapeHtml(spec.a)}</td>
        <td class="spec-value">${escapeHtml(spec.b)}</td>
        <td class="spec-diff ${diffClass}">${escapeHtml(spec.diff)}</td>
      </tr>
    `;
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
  els.urlA.value = "https://www.dns-shop.ru/catalog/.../radeon-rx-580/";
  els.urlB.value = "https://www.mvideo.ru/products/.../geforce-gtx-1060/";
  showNote("Демо использует подготовленный набор данных. Реальный серверный парсер подключим следующим этапом.", "ok");
  renderComparison(demoData);
}

function compareEnteredUrls() {
  const a = els.urlA.value.trim();
  const b = els.urlB.value.trim();

  if (!isValidUrl(a) || !isValidUrl(b)) {
    showNote("Вставь две полные ссылки, начинающиеся с http:// или https://.", "error");
    return;
  }

  if (a === b) {
    showNote("Ссылки одинаковые — для сравнения нужны два разных товара.", "error");
    return;
  }

  showNote(`Ссылки распознаны: ${hostLabel(a)} и ${hostLabel(b)}. Интерфейс готов; для чтения характеристик этих страниц нужен серверный парсер/API.`, "ok");

  const placeholder = {
    products: [
      { store: hostLabel(a), name: "Товар по первой ссылке", price: "Ожидает парсер", badge: "Товар 01", url: a },
      { store: hostLabel(b), name: "Товар по второй ссылке", price: "Ожидает парсер", badge: "Товар 02", url: b }
    ],
    summary: "Specly уже принимает и проверяет ссылки, но намеренно не подменяет реальные характеристики выдуманными данными. Следующий слой проекта — серверный модуль извлечения и нормализации характеристик.",
    specs: [
      { key: "status", label: "Статус получения данных", a: "Нужен backend", b: "Нужен backend", diff: "Парсер ещё не подключён", important: true, type: "warn" }
    ]
  };

  renderComparison(placeholder);
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
