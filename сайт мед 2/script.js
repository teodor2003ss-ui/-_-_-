

const BADGE_LABELS = { new: 'Ново', promo: 'Промо', bio: 'Био' };


const SUPABASE_URL = 'https://lmjlsczvoelmisnlhrfd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_CP_poas3360AW0aj5RhnGA_Nr5KkQCd';

const db = {
  get headers(){
    return {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    };
  },
  async get(path){
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: db.headers });
    if(!r.ok) throw new Error('Базата не отговори (' + r.status + ')');
    return r.json();
  },
  async rpc(fn, args){
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST', headers: db.headers, body: JSON.stringify(args)
    });
    const data = await r.json().catch(() => null);
    if(!r.ok) throw new Error((data && data.message) || 'Поръчката не можа да бъде записана');
    return data;
  },
    async fn(name, args){
    const r = await fetch(SUPABASE_URL + '/functions/v1/' + name, {
      method: 'POST', headers: db.headers, body: JSON.stringify(args)
    });
    const data = await r.json().catch(() => null);
    if(!r.ok) throw new Error((data && data.error) || 'Плащането не можа да се създаде');
    return data;
  },
  async insert(table, row){
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: Object.assign({}, db.headers, { Prefer: 'return=minimal' }),
      body: JSON.stringify(row)
    });
    return r.ok || r.status === 409;
  }
};

/* -----------------------------------------------------------
   1) ДАННИ ЗА ПРОДУКТИТЕ — вече идват от базата.
   loadCatalog() ги превежда в точно същата форма, която ползва
   останалата част от скрипта, затова рендирането и количката
   не са пипани.
------------------------------------------------------------ */
let CATEGORIES = [{ id: 'all', label: 'Всички' }];
let PRODUCTS   = [];

async function loadCatalog(){
  const [cats, rows] = await Promise.all([
    db.get('categories?select=slug,label&order=sort_order'),
    db.get('products?select=id,name,region,description,photo,jar_photo,jar,badge,'
         + 'categories(slug),'
         + 'variants(id,label,price,old_price,stock,is_default,sort_order)'
         + '&is_active=eq.true')
  ]);

  CATEGORIES = [{ id: 'all', label: 'Всички' }]
    .concat(cats.map(c => ({ id: c.slug, label: c.label })));

  PRODUCTS = rows.map(r => ({
    id:          r.id,
    name:        r.name,
    region:      r.region || '',
    category:    r.categories ? r.categories.slug : null,
    jar:         r.jar,
    badge:       r.badge,
    description: r.description || '',
    photo:       r.photo || null,
    jarPhoto:    r.jar_photo || null,
    variants: (r.variants || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(v => ({
        id:       v.id,
        label:    v.label,
        price:    Number(v.price),
        oldPrice: v.old_price == null ? null : Number(v.old_price),
        stock:    v.stock,
        default:  v.is_default,
      }))
  })).filter(p => p.variants.length > 0);
}

/* -----------------------------------------------------------
   2) СЪСТОЯНИЕ
------------------------------------------------------------ */
const state = {
  category: 'all',
  cart: [], // [{ productId, vIndex, qty }]
};

const fmt = (n) => n.toFixed(2) + ' €';
const getProduct = (id) => PRODUCTS.find(p => p.id === id);
const defaultVariantIndex = (p) => { const i = p.variants.findIndex(v => v.default); return i === -1 ? 0 : i; };
const minVariant = (p) => p.variants.reduce((a, b) => (b.price < a.price ? b : a), p.variants[0]);

/* -----------------------------------------------------------
   3) РЕНДИРАНЕ НА ПРОДУКТИ
------------------------------------------------------------ */
const categoryFilterEl = document.getElementById('categoryFilter');
const productGridEl = document.getElementById('productGrid');

function renderCategories(){
  categoryFilterEl.innerHTML = CATEGORIES.map(cat => `
    <button class="chip ${cat.id === state.category ? 'active' : ''}" data-cat="${cat.id}">
      <svg viewBox="0 0 100 100" aria-hidden="true"><use href="#icon-hex"/></svg>
      ${cat.label}
    </button>
  `).join('');

  categoryFilterEl.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      state.category = btn.dataset.cat;
      renderCategories();
      renderProducts();
    });
  });
}

function productCardHTML(p, index){
  const multi = p.variants.length > 1;
  const priceBlock = multi
    ? (() => { const mv = minVariant(p); return `<span class="from-label">От</span> ${fmt(mv.price)}<span class="product-unit">/ ${mv.label}</span>`; })()
    : (() => { const v = p.variants[0]; return `${v.oldPrice ? `<span class="old">${fmt(v.oldPrice)}</span>` : ''}${fmt(v.price)}<span class="product-unit">${v.label}</span>`; })();

  return `
    <article class="product-card reveal" data-id="${p.id}" style="transition-delay:${Math.min(index, 8) * 55}ms">
          <div class="product-media"${p.photo ? ` style="background-image:url('${p.photo}')"` : ''}>
        ${p.badge ? `<span class="product-badge ${p.badge}">${BADGE_LABELS[p.badge]}</span>` : ''}
                ${p.jarPhoto ? `<img class="jar-photo" src="${p.jarPhoto}" alt="${p.name}">` : `<svg viewBox="0 0 120 160"><use href="#jar-${p.jar}"/></svg>`}
      </div>
      <h3 class="product-name">${p.name}</h3>
      <p class="product-region">${p.region}</p>
      <div class="product-footer">
        <div class="product-price">${priceBlock}</div>
        <button class="add-btn" data-id="${p.id}" data-multi="${multi}">${multi ? 'Избери' : 'Добави'}</button>
      </div>
    </article>
  `;
}

function renderProducts(){
const list = (state.category === 'all' ? PRODUCTS : PRODUCTS.filter(p => p.category === state.category))
    .slice()
    .sort((a, b) => minVariant(a).price - minVariant(b).price);
  productGridEl.innerHTML = list.map(productCardHTML).join('');

  // клик върху картата (без бутона) → отваря детайлния изглед
  productGridEl.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if(e.target.closest('.add-btn')) return;
      openProductModal(Number(card.dataset.id));
    });
  });

  // бутонът: при 1 грамаж → бързо добавяне; при няколко → отваря избора
  productGridEl.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      if(btn.dataset.multi === 'true'){ openProductModal(id); return; }
      const p = getProduct(id);
      function addToCart(productId, vIndex, qty = 1){
  const variant = getProduct(productId).variants[vIndex];
  const entry = state.cart.find(c => c.productId === productId && c.vIndex === vIndex);
  const already = entry ? entry.qty : 0;

  const canAdd = Math.max(0, variant.stock - already);
  if(canAdd === 0) return false;
  const finalQty = Math.min(qty, canAdd);

  if(entry){ entry.qty += finalQty; } else { state.cart.push({ productId, vIndex, qty: finalQty }); }
  renderCart();
  bumpCartBadge();
  return true;
}
      btn.textContent = 'Добавено ✓';
      btn.classList.add('added');
      setTimeout(() => { btn.textContent = 'Добави'; btn.classList.remove('added'); }, 900);
    });
  });

  observeReveal();
}

/* -----------------------------------------------------------
   4) ЛОГИКА НА КОЛИЧКАТА
   Всеки ред в количката е {productId, vIndex, qty} — така един и същ
   продукт може да е в количката с два различни грамажа едновременно.
------------------------------------------------------------ */
const cartItemsEl = document.getElementById('cartItems');
const cartSubtotalEl = document.getElementById('cartSubtotal');
const cartCountEl = document.getElementById('cartCount');
const checkoutBtn = document.getElementById('checkoutBtn');

function addToCart(productId, vIndex, qty = 1){
  const entry = state.cart.find(c => c.productId === productId && c.vIndex === vIndex);
  if(entry){ entry.qty += qty; } else { state.cart.push({ productId, vIndex, qty }); }
  renderCart();
  bumpCartBadge();
}

function changeQty(productId, vIndex, delta){
  const entry = state.cart.find(c => c.productId === productId && c.vIndex === vIndex);
  if(!entry) return;
  entry.qty += delta;
  if(entry.qty <= 0){ state.cart = state.cart.filter(c => !(c.productId === productId && c.vIndex === vIndex)); }
  renderCart();
}

function removeFromCart(productId, vIndex){
  state.cart = state.cart.filter(c => !(c.productId === productId && c.vIndex === vIndex));
  renderCart();
}

function cartSubtotal(){
  return state.cart.reduce((sum, c) => {
    const v = getProduct(c.productId).variants[c.vIndex];
    return sum + v.price * c.qty;
  }, 0);
}

function renderCart(){
  if(state.cart.length === 0){
    cartItemsEl.innerHTML = `
      <div class="cart-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4h2l2.4 12.4A2 2 0 0 0 9.36 18H18a2 2 0 0 0 1.96-1.6L21.6 8H6.2"/></svg>
        <p>Количката е празна.<br>Разгледай магазина и добави любим буркан.</p>
      </div>`;
  } else {
    cartItemsEl.innerHTML = state.cart.map(c => {
      const p = getProduct(c.productId);
      const v = p.variants[c.vIndex];
      return `
        <div class="cart-item">
          ${p.jarPhoto
  ? `<img class="cart-item-jar" src="${p.jarPhoto}" alt="${p.name}">`
  : `<svg class="cart-item-jar" viewBox="0 0 120 160"><use href="#jar-${p.jar}"/></svg>`
}
          <div>
            <div class="cart-item-name">${p.name}</div>
            <div class="cart-item-region">${v.label}</div>
            <div class="qty-stepper">
              <button data-act="minus" data-pid="${p.id}" data-vi="${c.vIndex}" aria-label="Намали">−</button>
              <span>${c.qty}</span>
              <button data-act="plus" data-pid="${p.id}" data-vi="${c.vIndex}" aria-label="Увеличи">+</button>
            </div>
          </div>
          <div class="cart-item-end">
            <span class="cart-item-price">${fmt(v.price * c.qty)}</span>
            <button class="cart-item-remove" data-act="remove" data-pid="${p.id}" data-vi="${c.vIndex}">премахни</button>
          </div>
        </div>`;
    }).join('');
  }

  cartItemsEl.querySelectorAll('[data-act]').forEach(btn => {
    const pid = Number(btn.dataset.pid);
    const vi = Number(btn.dataset.vi);
    btn.addEventListener('click', () => {
      if(btn.dataset.act === 'plus') changeQty(pid, vi, 1);
      if(btn.dataset.act === 'minus') changeQty(pid, vi, -1);
      if(btn.dataset.act === 'remove') removeFromCart(pid, vi);
    });
  });

  cartSubtotalEl.textContent = fmt(cartSubtotal());
  checkoutBtn.disabled = state.cart.length === 0;
  updateCartCount();
}

function updateCartCount(){
  const total = state.cart.reduce((sum, c) => sum + c.qty, 0);
  cartCountEl.hidden = total === 0;
  cartCountEl.textContent = total;
}

function bumpCartBadge(){
  updateCartCount();
  cartCountEl.classList.remove('pulse');
  void cartCountEl.offsetWidth; // рестартира анимацията
  cartCountEl.classList.add('pulse');
}

/* -----------------------------------------------------------
   общ помощник: overlay-ът се вижда, ако количката, checkout
   модала ИЛИ продуктовият модал са отворени
------------------------------------------------------------ */
const overlay = document.getElementById('overlay');
const cartDrawer = document.getElementById('cartDrawer');
const checkoutModal = document.getElementById('checkoutModal');
const productModal = document.getElementById('productModal');

function syncOverlay(){
  const anyOpen = cartDrawer.classList.contains('is-open')
    || checkoutModal.classList.contains('is-open')
    || productModal.classList.contains('is-open');
  overlay.classList.toggle('is-open', anyOpen);
}

function openCart(){
  cartDrawer.classList.add('is-open');
  cartDrawer.setAttribute('aria-hidden', 'false');
  syncOverlay();
}
function closeCart(){
  cartDrawer.classList.remove('is-open');
  cartDrawer.setAttribute('aria-hidden', 'true');
  syncOverlay();
}
document.getElementById('cartBtn').addEventListener('click', openCart);
document.getElementById('closeCart').addEventListener('click', closeCart);

/* -----------------------------------------------------------
   5) ДЕТАЙЛЕН ИЗГЛЕД НА ПРОДУКТ (грамаж + количество)
------------------------------------------------------------ */
const pmBadge = document.getElementById('pmBadge');
const pmJarUse = document.getElementById('pmJarUse');
const pmJarSvg = document.getElementById('pmJarSvg');
const pmPhoto = document.getElementById('pmPhoto');
const pmDesc = document.getElementById('pmDesc');
const pmName = document.getElementById('pmName');
const pmRegion = document.getElementById('pmRegion');
const pmVariantBlock = document.getElementById('pmVariantBlock');
const pmVariants = document.getElementById('pmVariants');
const pmQty = document.getElementById('pmQty');
const pmTotal = document.getElementById('pmTotal');
const pmAddBtn = document.getElementById('pmAddBtn');

const pmState = { productId: null, vIndex: 0, qty: 1 };

function openProductModal(productId){
  const p = getProduct(productId);
  pmState.productId = productId;
  pmState.vIndex = defaultVariantIndex(p);
  pmState.qty = 1;
  renderProductModal();

  cartDrawer.classList.remove('is-open');
  cartDrawer.setAttribute('aria-hidden', 'true');
  productModal.classList.add('is-open');
  productModal.setAttribute('aria-hidden', 'false');
  syncOverlay();
}

function closeProductModal(){
  productModal.classList.remove('is-open');
  productModal.setAttribute('aria-hidden', 'true');
  syncOverlay();
}

function renderProductModal(){
  const p = getProduct(pmState.productId);

  pmName.textContent = p.name;
  pmRegion.textContent = p.region;
  pmDesc.textContent = p.description || '';
if(p.jarPhoto){
  pmPhoto.src = p.jarPhoto; pmPhoto.alt = p.name;
  pmPhoto.style.display = 'block';
  pmJarSvg.style.display = 'none';
} else {
  pmPhoto.style.display = 'none';
  pmJarSvg.style.display = 'block';
  pmJarUse.setAttribute('href', `#jar-${p.jar}`);
}

  if(p.badge){
    pmBadge.hidden = false;
    pmBadge.textContent = BADGE_LABELS[p.badge];
    pmBadge.className = `product-badge ${p.badge}`;
  } else {
    pmBadge.hidden = true;
  }

  if(p.variants.length > 1){
    pmVariantBlock.hidden = false;
        pmVariants.innerHTML = p.variants.map((v, i) => `
      <button type="button"
              class="variant-pill ${i === pmState.vIndex ? 'active' : ''} ${v.stock === 0 ? 'sold-out' : ''}"
              data-vi="${i}" ${v.stock === 0 ? 'disabled' : ''}>
        ${v.label}<span class="v-price">${v.stock === 0 ? 'изчерпан' : fmt(v.price)}</span>
      </button>
    `).join('');
    pmVariants.querySelectorAll('.variant-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        pmState.vIndex = Number(btn.dataset.vi);
        renderProductModal();
      });
    });
  } else {
    pmVariantBlock.hidden = true;
  }

    const variant = p.variants[pmState.vIndex];
  pmState.qty = Math.min(pmState.qty, Math.max(1, variant.stock));
  pmQty.textContent = pmState.qty;
  pmTotal.textContent = fmt(variant.price * pmState.qty);

  pmAddBtn.disabled = variant.stock === 0;
  pmAddBtn.textContent = variant.stock === 0 ? 'Изчерпан' : 'Добави в количката';
}

document.getElementById('pmQtyStepper').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if(!btn) return;
  if(btn.dataset.act === 'plus') pmState.qty += 1;
  if(btn.dataset.act === 'minus') pmState.qty = Math.max(1, pmState.qty - 1);
  renderProductModal();
});

pmAddBtn.addEventListener('click', () => {
  addToCart(pmState.productId, pmState.vIndex, pmState.qty);
  pmAddBtn.textContent = 'Добавено ✓';
  setTimeout(() => {
    pmAddBtn.textContent = 'Добави в количката';
    closeProductModal();
  }, 500);
});

document.getElementById('closeProductModal').addEventListener('click', closeProductModal);

/* -----------------------------------------------------------
   6) CHECKOUT
------------------------------------------------------------ */
const orderSummaryEl = document.getElementById('orderSummary');
const checkoutFormWrap = document.getElementById('checkoutForm');
const checkoutSuccessWrap = document.getElementById('checkoutSuccess');
const orderForm = document.getElementById('orderForm');

function openCheckout(){
  if(state.cart.length === 0) return;
  orderSummaryEl.innerHTML = state.cart.map(c => {
    const p = getProduct(c.productId);
    const v = p.variants[c.vIndex];
    return `<div class="order-summary-row"><span>${c.qty} × ${p.name} (${v.label})</span><span>${fmt(v.price * c.qty)}</span></div>`;
  }).join('') + `<div class="order-summary-total"><span>Общо</span><span>${fmt(cartSubtotal())}</span></div>`;

  checkoutFormWrap.hidden = false;
  checkoutSuccessWrap.hidden = true;
  checkoutModal.classList.add('is-open');
  checkoutModal.setAttribute('aria-hidden', 'false');
  cartDrawer.classList.remove('is-open');
  cartDrawer.setAttribute('aria-hidden', 'true');
  syncOverlay();
}

function closeCheckout(){
  checkoutModal.classList.remove('is-open');
  checkoutModal.setAttribute('aria-hidden', 'true');
  syncOverlay();
}

document.getElementById('checkoutBtn').addEventListener('click', openCheckout);
document.getElementById('closeCheckout').addEventListener('click', closeCheckout);

overlay.addEventListener('click', () => { closeCart(); closeCheckout(); closeProductModal(); });
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape'){ closeCart(); closeCheckout(); closeProductModal(); }
});


orderForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const submitBtn = orderForm.querySelector('button[type="submit"]');
  const data = new FormData(orderForm);

  // Пращат се само variant_id и количество. Цените и общата сума се
  // смятат в базата, за да не може някой да си поръча за 0.01 €.
  const items = state.cart.map(c => ({
    variant_id: getProduct(c.productId).variants[c.vIndex].id,
    qty: c.qty
  }));
  function orderError(msg){
  let box = document.getElementById('orderError');
  if(!box){
    box = document.createElement('p');
    box.id = 'orderError';
    box.className = 'order-error';
    orderForm.insertBefore(box, orderForm.lastElementChild);
  }
  box.textContent = msg;
  box.hidden = !msg;
}

  try {

    const result = await db.rpc('place_order', {
      p_customer: {
        name:     data.get('name'),
        phone:    data.get('phone'),
        email:    data.get('email'),
        address:  data.get('address'),
        city:     data.get('city'),
        delivery: data.get('delivery'),
        payment:  data.get('payment'),
      },
      p_items: items
    });

    state.cart = [];
    renderCart();
    orderForm.reset();

    if(result.needs_payment){
      submitBtn.textContent = 'Прехвърляне към плащане…';
      const { url } = await db.fn('create-checkout', { token: result.payment_token });
      window.location.href = url;
      return;
    }

    document.getElementById('orderNumber').textContent = result.order_number;
    checkoutFormWrap.hidden = true;
    checkoutSuccessWrap.hidden = false;

    loadCatalog().then(renderProducts).catch(() => {});
  } catch (err) {
    orderError(err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Потвърди поръчката';
  }
});

document.getElementById('continueShopping').addEventListener('click', closeCheckout);
/* -----------------------------------------------------------
   7) ДРЕБНИ UI ПОВЕДЕНИЯ
------------------------------------------------------------ */

/* мобилно меню */
const navToggle = document.getElementById('navToggle');
const siteHeader = document.querySelector('.site-header');
navToggle.addEventListener('click', () => {
  const isOpen = siteHeader.classList.toggle('nav-open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});
document.querySelectorAll('.main-nav a').forEach(a => {
  a.addEventListener('click', () => {
    siteHeader.classList.remove('nav-open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

/* FAQ акордеон */
document.querySelectorAll('.faq-item').forEach(item => {
  const btn = item.querySelector('.faq-question');
  btn.addEventListener('click', () => {
    const isOpen = item.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(isOpen));
  });
});

/* бюлетин (декоративен, без реален бекенд) */
document.getElementById('newsletterForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  form.querySelector('button').textContent = 'Записан ✓';
  form.querySelector('input').value = '';
  setTimeout(() => { form.querySelector('button').textContent = 'Абонирай се'; }, 2200);
});

/* scroll-reveal анимации */
let revealObserver;
function observeReveal(){
  if(!revealObserver){
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
  }
  document.querySelectorAll('.reveal:not(.is-visible)').forEach(el => revealObserver.observe(el));
}

/* -----------------------------------------------------------
   СТАРТ
------------------------------------------------------------ */
function checkPaymentReturn(){
  const params = new URLSearchParams(window.location.search);
  const paid = params.get('paid');
  const canceled = params.get('canceled');
  if(!paid && !canceled) return;

  history.replaceState(null, '', window.location.pathname);

  if(paid){
    document.getElementById('orderNumber').textContent = paid;
    checkoutFormWrap.hidden = true;
    checkoutSuccessWrap.hidden = false;
  } else {
    checkoutFormWrap.hidden = false;
    checkoutSuccessWrap.hidden = true;
    orderError('Плащането беше прекъснато. Поръчка ' + canceled
      + ' е запазена за час — обади се, ако искаш да я платиш при доставка.');
  }

  checkoutModal.classList.add('is-open');
  checkoutModal.setAttribute('aria-hidden', 'false');
  syncOverlay();
}

async function boot(){
  productGridEl.innerHTML = '<p class="grid-status">Зареждане на продуктите…</p>';

  try {
    await loadCatalog();
    renderCategories();
    renderProducts();
  } catch (err) {
    console.error(err);
    productGridEl.innerHTML =
      '<p class="grid-status grid-status--error">Продуктите не могат да се заредят в момента.'
      + '<br>Провери интернет връзката си и опресни страницата.</p>';
  }

  renderCart();
  observeReveal();
  checkPaymentReturn();
}

boot();