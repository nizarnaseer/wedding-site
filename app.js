function _renderDiscountCards(discounts) {
  if (!Object.keys(discounts).length) return;

  document.querySelectorAll('.pkg-btn, .pkg-btn--featured').forEach(btn => {
    const onclickStr = btn.getAttribute('onclick') || '';
    const match = onclickStr.match(/openBookingModal\('([^']+)','([^']+)'\)/);
    if (!match) return;
    const pkgName  = match[1];
    const pkgPrice = match[2];
    const raw      = discounts[pkgName];
    if (!raw) return;

    // Support {v,t} format (new) and plain number (legacy)
    const discVal  = (typeof raw === 'object') ? raw.v : raw;
    const discType = (typeof raw === 'object') ? raw.t : 'fixed';
    if (!discVal || discVal <= 0) return;

    const origNum    = parseInt(pkgPrice.replace(/[^0-9]/g, ''));
    const discAmt    = discType === 'pct' ? Math.round(origNum * discVal / 100) : discVal;
    const pct        = discType === 'pct' ? discVal : Math.round(discVal / origNum * 100);
    const discounted = Math.max(0, origNum - discAmt);

    const card = btn.closest('.package-card');
    if (!card || card.querySelector('.pkg-discounted')) return;

    card.style.overflow = 'hidden';
    const ribbon = document.createElement('div');
    ribbon.className = 'discount-ribbon';
    ribbon.innerHTML = `<span>${pct}% OFF</span>`;
    card.appendChild(ribbon);

    const badge = card.querySelector('.pkg-badge');
    if (badge) {
      badge.insertAdjacentHTML('afterend',
        `<div class="discount-tag-pill">Special Offer - Save RM ${discAmt.toLocaleString()}</div>`
      );
    }

    const amountEl = card.querySelector('.pkg-amount');
    if (!amountEl) return;
    amountEl.style.textDecoration = 'line-through';
    amountEl.style.color          = 'rgba(255,255,255,0.3)';
    amountEl.style.fontSize       = '2rem';

    const discEl = document.createElement('div');
    discEl.className = 'pkg-discounted';
    discEl.innerHTML =
      `<span style="font-family:'Cormorant Garamond',serif;font-size:2.6rem;font-weight:300;color:#c9a96e;line-height:1;">${discounted.toLocaleString()}</span>` +
      `<span style="display:block;font-size:0.72rem;letter-spacing:1.5px;color:#4ade80;margin-top:4px;">SAVE RM ${discAmt.toLocaleString()}</span>`;
    amountEl.parentElement.insertAdjacentElement('afterend', discEl);
  });
}function applyDiscountsToPkgCards() {
  // Primary: fetch discounts.json from the same server (works on all devices)
  fetch('discounts.json?v=' + Date.now())
    .then(r => r.json())
    .then(data => {
      const discounts = data.pkg_discounts || {};
      const promos    = data.promo_codes   || {};
      localStorage.setItem('pkg_discounts', JSON.stringify(discounts));
      localStorage.setItem('promo_codes',   JSON.stringify(promos));
      _renderDiscountCards(discounts);
    })
    .catch(() => {
      // Fallback: use localStorage (works on localhost)
      _renderDiscountCards(JSON.parse(localStorage.getItem('pkg_discounts') || '{}'));
    });
}

function _renderDiscountCards(discounts) {
  if (!Object.keys(discounts).length) return;

  document.querySelectorAll('.pkg-btn, .pkg-btn--featured').forEach(btn => {
    const onclickStr = btn.getAttribute('onclick') || '';
    const match = onclickStr.match(/openBookingModal\('([^']+)','([^']+)'\)/);
    if (!match) return;
    const pkgName  = match[1];
    const pkgPrice = match[2];
    const discAmt  = discounts[pkgName];
    if (!discAmt || discAmt <= 0) return;

    const origNum    = parseInt(pkgPrice.replace(/[^0-9]/g, ''));
    const discounted = origNum - discAmt;
    const pct        = Math.round(discAmt / origNum * 100);

    const card = btn.closest('.package-card');
    if (!card || card.querySelector('.pkg-discounted')) return;

    // ── Corner ribbon ──
    card.style.overflow = 'hidden'; // needed for ribbon clipping
    const ribbon = document.createElement('div');
    ribbon.className = 'discount-ribbon';
    ribbon.innerHTML = `<span>${pct}% OFF</span>`;
    card.appendChild(ribbon);

    // ── Tag icon next to pkg-badge ──
    const badge = card.querySelector('.pkg-badge');
    if (badge) {
      badge.insertAdjacentHTML('afterend',
        `<div class="discount-tag-pill">🏷️ Special Offer &mdash; Save RM ${discAmt}</div>`
      );
    }

    // ── Strike-through original price ──
    const amountEl = card.querySelector('.pkg-amount');
    if (!amountEl) return;
    amountEl.style.textDecoration = 'line-through';
    amountEl.style.color          = 'rgba(255,255,255,0.3)';
    amountEl.style.fontSize       = '2rem';

    // ── New discounted price ──
    const discEl = document.createElement('div');
    discEl.className = 'pkg-discounted';
    discEl.innerHTML =
      `<span style="font-family:'Cormorant Garamond',serif;font-size:2.6rem;font-weight:300;color:#c9a96e;line-height:1;">${discounted.toLocaleString()}</span>` +
      `<span style="display:block;font-size:0.72rem;letter-spacing:1.5px;color:#4ade80;margin-top:4px;">SAVE RM ${discAmt}</span>`;
    amountEl.parentElement.insertAdjacentElement('afterend', discEl);
  });
}
