/* ═══════════════════════════════════════════════
   NIZAR NASEER STUDIO — app.js
   ═══════════════════════════════════════════════ */

/* ─── GOOGLE CALENDAR CONFIG ─── */
const GCAL_CONFIG = {
  clientId:   'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
  apiKey:     'YOUR_GOOGLE_API_KEY',
  calendarId: 'primary',
  scopes:     'https://www.googleapis.com/auth/calendar.readonly',
};

/* ─── STUDIO CONFIG ─── */
const STUDIO_BASE     = { lat: 5.1253, lng: 100.5009, name: 'Parit Buntar, Perak' };
const TRAVEL_FREE_KM  = 50;
const TRAVEL_RATE_KM  = 1;
const HOTEL_FEE       = 150;
const DEPOSIT_AMOUNT  = 200;
/* ─── CONFIG (set values in config.js) ─── */
const CFG              = window.STUDIO_CONFIG || {};
const W3F_FALLBACK_KEY = CFG.web3forms_key       || '6be870cf-b9ec-42bd-a26f-8d5f09087bf3';
const GCAL_API_KEY     = CFG.google_api_key      || '';
const GCAL_ID          = CFG.google_calendar_id  || '';
const SITE_DOMAIN      = CFG.site_domain         || 'https://weddingclicks.us';
const JSONBIN_BIN_ID   = localStorage.getItem('jsonbin_bin_id') || '';


/* ─── PER-PACKAGE DATE + SESSION CONFIG ─── */
// maxDates: how many separate days the client can pick
// sessions: how many function+time slots to show PER DAY
const PKG_DATE_CONFIG = {
  // Photography
  'Nikah / Sanding / Tandang':       { maxDates: 1, sessions: 1 },
  'Tunang':                           { maxDates: 1, sessions: 1 },
  'Nikah':                            { maxDates: 1, sessions: 1 },
  'Sanding':                          { maxDates: 1, sessions: 1 },
  'Nikah & Sanding Photography':      { maxDates: 1, sessions: 2 },
  'TRIO E (3 Events)':                { maxDates: 1, sessions: 3 },
  'Pre Wed Photography':              { maxDates: 1, sessions: 1 },
  'Tunang + Nikah + Sanding':         { maxDates: 1, sessions: 3 },
  // Videography
  'Nikah Video':                      { maxDates: 1, sessions: 1 },
  'Nikah + Sanding Video':            { maxDates: 1, sessions: 2 },
  'Full Package Video':               { maxDates: 1, sessions: 3 },
};

/* ─── DATE SLOT LABELS (multi-date display) ─── */
const DATE_LABELS = ['1st Day', '2nd Day', '3rd Day'];

/* Session label hints */
const SESSION_HINTS = [
  ['e.g. Nikah', 'e.g. Sanding', 'e.g. Tandang'],
];

/* Helper: max dates allowed for current package */
function maxDatesForPkg() {
  return (PKG_DATE_CONFIG[activePackage.name] || { maxDates: 1 }).maxDates;
}
/* Helper: sessions (function+time rows) per day for current package */
function sessionsForPkg() {
  return (PKG_DATE_CONFIG[activePackage.name] || { sessions: 1 }).sessions;
}



/* ─── STATE ─── */
let gcalConnected  = false;
let busyDates      = new Set();
let selectedDates  = [];        // array of YYYY-MM-DD strings (multi-date support)
let selectedDate   = null;      // legacy single-date alias (selectedDates[0])
let currentDateSlot = 0;        // which date slot is being picked (0,1,2)
let isEnquiryDate  = false;
let isEnquiryMode  = false;
let currentYear    = new Date().getFullYear();
let currentMonth   = new Date().getMonth();
let activePackage  = { name: '', price: '', baseAmount: 0 };
let travelFeeAmount = 0;        // RM travel fee computed from location
let locationCoords  = null;     // { lat, lng, name } of client location
let tokenClient    = null;
let gapiInited     = false;
let gisInited      = false;


/* ══════════════════════════════════════
   NAV SCROLL
══════════════════════════════════════ */
window.addEventListener('scroll', () => {
  document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 40);
});

/* ══════════════════════════════════════
   MOBILE MENU
══════════════════════════════════════ */
document.getElementById('navBurger').addEventListener('click', () => {
  document.getElementById('mobileMenu').classList.add('open');
});
document.getElementById('mobileClose').addEventListener('click', () => {
  document.getElementById('mobileMenu').classList.remove('open');
});
/* ══════════════════════════════════════
   GALLERY — loaded from gallery.json
   Manage albums at: weddingclicks.us/gallery-manager.html
   Photos on Cloudinary CDN — zero Vercel storage.
══════════════════════════════════════ */
let ALBUMS = [];

fetch('/api/gallery')
  .then(r => r.json())
  .then(data => {
    if (data.albums && data.albums.length > 0) {
      ALBUMS = data.albums;
      buildGallery();
    } else {
      // Fallback to static gallery.json
      return fetch('gallery.json?v=' + Date.now())
        .then(r => r.json())
        .then(d => { ALBUMS = d.albums || []; buildGallery(); });
    }
  })
  .catch(() => {
    fetch('gallery.json?v=' + Date.now())
      .then(r => r.json())
      .then(d => { ALBUMS = d.albums || []; buildGallery(); })
      .catch(() => buildGallery());
  });

document.querySelectorAll('.mobile-link').forEach(l =>
  l.addEventListener('click', () => document.getElementById('mobileMenu').classList.remove('open'))
);

/* ══════════════════════════════════════
   SCROLL REVEAL
══════════════════════════════════════ */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1 });

function addReveal(el) { el.classList.add('reveal'); revealObserver.observe(el); }



/* ─── GALLERY BUILD ─── */
const lazyBgObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const el = entry.target;
      const src = el.dataset.src;
      const fallback = el.dataset.fallback;
      const g = el.dataset.g;
      setElBgDirect(el, src, fallback, g);
      observer.unobserve(el);
    }
  });
}, { rootMargin: '0px 0px 300px 0px' });

/* Set background with auto-fallback: tries local path → Unsplash → gradient */
function setElBg(el, localSrc, fallbackSrc, gradient) {
  const darkColor = gradient.match(/#[0-9a-f]+/i)?.[0] || '#111';
  el.style.backgroundColor = darkColor;
  el.style.background = gradient;
  
  el.dataset.src = localSrc || '';
  el.dataset.fallback = fallbackSrc || '';
  el.dataset.g = gradient || '';
  
  lazyBgObserver.observe(el);
}

function setElBgDirect(el, localSrc, fallbackSrc, gradient) {
  el.style.backgroundSize  = 'cover';
  el.style.backgroundPosition = 'center';
  const tryLoad = (src, onFail) => {
    const img = new Image();
    img.onload  = () => { el.style.backgroundImage = `url('${src}')`; };
    img.onerror = onFail;
    img.src = src;
  };
  if (localSrc) {
    tryLoad(localSrc, () => {
      if (fallbackSrc) tryLoad(fallbackSrc, () => { el.style.background = gradient; });
      else el.style.background = gradient;
    });
  } else if (fallbackSrc) {
    tryLoad(fallbackSrc, () => { el.style.background = gradient; });
  } else {
    el.style.background = gradient;
  }
}

function buildGallery(filter = 'all') {
  const grid = document.getElementById('galleryGrid');
  grid.innerHTML = '';
  
  if (window.galleryIntervals) {
    window.galleryIntervals.forEach(clearInterval);
  }
  window.galleryIntervals = [];

  ALBUMS
    .filter(a => filter === 'all' || a.category.toLowerCase() === filter)
    .forEach(album => {
      const teasers = album.teasers || [];
      const div     = document.createElement('div');
      div.className = `gallery-item${album.layout ? ' ' + album.layout : ''}`;
      
      div.innerHTML = `
        <div class="gallery-bg-layer layer-1" style="position:absolute;inset:0;background-size:cover;background-position:center;opacity:1;z-index:1;"></div>
        <div class="gallery-bg-layer layer-2" style="position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;z-index:1;transition:opacity 1.2s ease-in-out;"></div>
        <div class="gallery-placeholder" style="position:relative;z-index:2;">${album.title}</div>
        <div class="gallery-overlay" style="z-index:3;">
          <div>
            <span style="display:block;font-size:0.6rem;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">${album.category}${album.venue ? ' · ' + album.venue : ''}</span>
            <span style="font-size:0.9rem;color:var(--text);font-family:'Cormorant Garamond',serif;">${album.title}</span>
          </div>
        </div>`;
      
      const layers = [div.querySelector('.layer-1'), div.querySelector('.layer-2')];
      let currentTeaserIdx = 0;
      let activeLayerIdx = 0;

      if (teasers.length > 0) {
        setElBgDirect(layers[0], teasers[0].src, teasers[0].fallback, teasers[0].g);
      }

      if (teasers.length > 1) {
        const intervalId = setInterval(() => {
          const nextTeaserIdx = (currentTeaserIdx + 1) % teasers.length;
          const nextTeaser = teasers[nextTeaserIdx];
          
          const nextActiveLayerIdx = 1 - activeLayerIdx;
          const nextActiveLayer = layers[nextActiveLayerIdx];
          const prevActiveLayer = layers[activeLayerIdx];
          
          // Pre-load on the hidden layer
          setElBgDirect(nextActiveLayer, nextTeaser.src, nextTeaser.fallback, nextTeaser.g);
          
          // Trigger crossfade transition
          nextActiveLayer.style.transition = 'opacity 1.2s ease-in-out';
          nextActiveLayer.style.opacity = 1;
          prevActiveLayer.style.transition = 'opacity 1.2s ease-in-out';
          prevActiveLayer.style.opacity = 0;
          
          activeLayerIdx = nextActiveLayerIdx;
          currentTeaserIdx = nextTeaserIdx;
        }, 3000 + Math.random() * 800);
        
        window.galleryIntervals.push(intervalId);
      }

      div.style.cursor = 'pointer';
      div.addEventListener('click', () => openLightbox(album.id));
      addReveal(div);
      grid.appendChild(div);
    });
}

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    buildGallery(btn.dataset.filter);
  });
});

/* ══════════════════════════════════════
   LIGHTBOX
══════════════════════════════════════ */
let lbAlbum  = null;
let lbIndex  = 0;

function openLightbox(albumId) {
  lbAlbum = ALBUMS.find(a => a.id === albumId);
  if (!lbAlbum) return;
  lbIndex = 0;

  document.getElementById('lbCategory').textContent = lbAlbum.category;
  document.getElementById('lbTitle').textContent    = lbAlbum.title;
  document.getElementById('lbDate').textContent     = lbAlbum.date;

  renderLbImage();
  renderLbThumbs();

  document.getElementById('lightboxOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function renderLbImage() {
  const teaser = lbAlbum.teasers[lbIndex];
  const img    = document.getElementById('lbImg');
  setElBg(img, teaser.src, teaser.fallback, teaser.g);

  document.getElementById('lbCounter').textContent = `${lbIndex + 1} / ${lbAlbum.teasers.length}`;
  document.getElementById('lbPrev').disabled = lbIndex === 0;
  document.getElementById('lbNext').disabled = lbIndex === lbAlbum.teasers.length - 1;

  document.querySelectorAll('.lb-thumb').forEach((t, i) => {
    t.classList.toggle('active', i === lbIndex);
  });
}

function renderLbThumbs() {
  const wrap = document.getElementById('lbThumbs');
  wrap.innerHTML = '';
  lbAlbum.teasers.forEach((t, i) => {
    const thumb = document.createElement('div');
    thumb.className = `lb-thumb${i === 0 ? ' active' : ''}`;
    setElBg(thumb, t.src, t.fallback, t.g);
    thumb.addEventListener('click', () => { lbIndex = i; renderLbImage(); });
    wrap.appendChild(thumb);
  });
}

function lbNav(delta) {
  lbIndex = Math.max(0, Math.min(lbAlbum.teasers.length - 1, lbIndex + delta));
  renderLbImage();
}

function closeLightbox() {
  document.getElementById('lightboxOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function closeLightboxIfOverlay(e) {
  if (e.target === document.getElementById('lightboxOverlay')) closeLightbox();
}

// Keyboard navigation
document.addEventListener('keydown', e => {
  if (!document.getElementById('lightboxOverlay').classList.contains('open')) return;
  if (e.key === 'ArrowRight') lbNav(1);
  if (e.key === 'ArrowLeft')  lbNav(-1);
  if (e.key === 'Escape')     closeLightbox();
});


/* ══════════════════════════════════════
   GOOGLE CALENDAR — PUBLIC API KEY (no login needed)
   Reads busy dates from photographer's public Google Calendar.
   Setup: set google_api_key + google_calendar_id in config.js
══════════════════════════════════════ */
function showConnectedBanner(msg) {
  const banner = document.getElementById('gcalConnectedBanner');
  if (!banner) return;
  banner.style.display = 'flex';
  const span = banner.querySelector('span:nth-child(2)');
  if (span) span.textContent = msg;
}

async function loadCalendarBusy() {

  if (!GCAL_API_KEY || GCAL_API_KEY.startsWith('YOUR') ||
      !GCAL_ID      || GCAL_ID.startsWith('YOUR')) {
    // Config not set — show all dates as available (no fake busy)
    gcalConnected = true;
    renderCalendar();
    return;
  }

  const now  = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const to   = new Date(now.getFullYear(), now.getMonth() + 4, 0).toISOString();

  try {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GCAL_ID)}/events`
      + `?key=${GCAL_API_KEY}`
      + `&timeMin=${from}&timeMax=${to}`
      + `&singleEvents=true&orderBy=startTime`
      + `&maxResults=250`;

    const res  = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    busyDates.clear();
    (data.items || []).forEach(event => {
      const allDay = !!event.start.date;   // all-day events use .date not .dateTime
      const start  = (event.start.date || event.start.dateTime || '').split('T')[0];
      const end    = (event.end.date   || event.end.dateTime   || '').split('T')[0];
      if (!start) return;
      let d = new Date(start + 'T00:00:00');
      const e = new Date(end  + 'T00:00:00');
      // Google Calendar all-day end date is exclusive (day after last day)
      // Timed events: include end date
      while (allDay ? d < e : d <= e) {
        busyDates.add(toYMD(new Date(d)));
        d.setDate(d.getDate() + 1);
      }
    });

    // Also load locally booked dates (persist across page refresh)
    const savedBooked = JSON.parse(localStorage.getItem('bookedDates') || '[]');
    savedBooked.forEach(d => busyDates.add(d));

    // Load database-driven booked dates
    try {
      let loaded = false;
      try {
        const dbRes = await fetch('/api/settings?key=booked_dates');
        if (dbRes.ok) {
          const dbDates = await dbRes.json();
          if (Array.isArray(dbDates) && dbDates.length > 0) {
            dbDates.forEach(d => busyDates.add(d));
            loaded = true;
          }
        }
      } catch(e) {}

      if (!loaded) {
        const dbRes = await fetch('booked-dates.json?v=' + Date.now());
        if (dbRes.ok) {
          const dbDates = await dbRes.json();
          if (Array.isArray(dbDates)) {
            dbDates.forEach(d => busyDates.add(d));
          }
        }
      }
    } catch (e) {
      console.warn('DB dates error:', e);
    }

    gcalConnected = true;
    showConnectedBanner('📅 Booking Calendar synced — busy dates greyed out');
    renderCalendar();
  } catch (err) {
    console.warn('Calendar API error:', err.message);
    // Try to load booked-dates.json / api even if GCAL fails
    try {
      let loaded = false;
      try {
        const dbRes = await fetch('/api/settings?key=booked_dates');
        if (dbRes.ok) {
          const dbDates = await dbRes.json();
          if (Array.isArray(dbDates) && dbDates.length > 0) {
            dbDates.forEach(d => busyDates.add(d));
            loaded = true;
          }
        }
      } catch(e) {}

      if (!loaded) {
        const dbRes = await fetch('booked-dates.json?v=' + Date.now());
        if (dbRes.ok) {
          const dbDates = await dbRes.json();
          if (Array.isArray(dbDates)) {
            dbDates.forEach(d => busyDates.add(d));
          }
        }
      }
    } catch (e) {}
    gcalConnected = true;
    renderCalendar();
  }
}


/* ══════════════════════════════════════
   CALENDAR RENDER
══════════════════════════════════════ */
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function toYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function renderCalendar() {
  document.getElementById('calMonthLabel').textContent = `${MONTHS[currentMonth]} ${currentYear}`;
  const grid     = document.getElementById('calGrid');
  grid.innerHTML = '';
  const today    = new Date();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMo = new Date(currentYear, currentMonth + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day cal-day--empty';
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMo; day++) {
    const cell    = document.createElement('div');
    const date    = new Date(currentYear, currentMonth, day);
    const ymd     = toYMD(date);
    const isPast  = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isBusy  = busyDates.has(ymd);
    const selIdx  = selectedDates.indexOf(ymd);  // -1 or 0,1,2
    const isToday = ymd === toYMD(today);

    cell.className = 'cal-day';
    if (isPast)      cell.classList.add('cal-day--past');
    if (isBusy && selIdx === -1) cell.classList.add('cal-day--busy');
    if (selIdx >= 0 && !busyDates.has(ymd)) cell.classList.add('cal-day--selected');
    if (selIdx >= 0 && busyDates.has(ymd))  cell.classList.add('cal-day--enquiry');
    if (isToday)     cell.classList.add('cal-day--today');
    cell.textContent = day;
    // Show slot number on selected dates
    if (selIdx >= 0) {
      const badge = document.createElement('span');
      badge.style.cssText = 'position:absolute;top:2px;right:3px;font-size:0.5rem;font-weight:700;';
      badge.textContent = selIdx + 1;
      cell.style.position = 'relative';
      cell.appendChild(badge);
    }
    cell.setAttribute('data-date', ymd);

    if (!isPast) {
      cell.addEventListener('click', () => isBusy ? selectBusyDate(ymd) : selectDate(ymd));
    }
    grid.appendChild(cell);
  }

  document.getElementById('calPrev').disabled =
    currentYear === today.getFullYear() && currentMonth === today.getMonth();
}

function selectDate(ymd) {
  const maxD = maxDatesForPkg();
  const idx  = selectedDates.indexOf(ymd);
  if (idx >= 0) {
    selectedDates.splice(idx, 1);          // deselect
  } else if (selectedDates.length < maxD) {
    selectedDates.push(ymd);               // add
  } else {
    selectedDates[maxD - 1] = ymd;         // replace last
  }
  selectedDate  = selectedDates[0] || null;
  isEnquiryDate = false;
  document.getElementById('enquiryBanner').classList.remove('show');
  document.getElementById('btnContinue').disabled = selectedDates.length === 0;
  renderCalendar();
  updateCalendarSlotHeader();
}

function selectBusyDate(ymd) {
  // For enquiry: allow selecting a busy date (replaces selectedDates with just this one)
  selectedDates = [ymd];
  selectedDate  = ymd;
  isEnquiryDate = true;
  renderCalendar();
  updateCalendarSlotHeader();
  document.getElementById('enquiryBanner').classList.add('show');
  document.getElementById('btnContinue').disabled = true;
}

function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  if (currentMonth < 0)  { currentMonth = 11; currentYear--; }
  isEnquiryDate = false;
  document.getElementById('enquiryBanner').classList.remove('show');
  renderCalendar();
}

/* ══════════════════════════════════════
   LOCATION + TRAVEL FEE
══════════════════════════════════════ */
// Haversine formula — distance in km between two lat/lng points
function haversineKm(lat1, lng1, lat2, lng2) {
  const R  = 6371;
  const dL = (lat2 - lat1) * Math.PI / 180;
  const dG = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(dL/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dG/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function computeTravelFee(lat, lng) {
  const dist = haversineKm(STUDIO_BASE.lat, STUDIO_BASE.lng, lat, lng);
  const km   = Math.round(dist);
  const box  = document.getElementById('travelFeeBox');
  box.style.display = 'block';

  if (km <= TRAVEL_FREE_KM) {
    travelFeeAmount = 0;
    box.className   = 'travel-free';
    box.innerHTML   = `✅ <strong>Free travel</strong> — ${km} km from Parit Buntar (within ${TRAVEL_FREE_KM} km free radius)`;
  } else {
    const extra     = km - TRAVEL_FREE_KM;
    travelFeeAmount = extra * TRAVEL_RATE_KM;
    box.className   = 'travel-fee';
    box.innerHTML   = `🚗 <strong>Travel fee: RM ${travelFeeAmount}</strong> — ${km} km from Parit Buntar (${extra} km × RM${TRAVEL_RATE_KM}/km)<div class="travel-hotel">🏨 + RM ${HOTEL_FEE} hotel accommodation required for overnight stay</div>`;
  }
  updateTotal();
}

let locDebounce = null;
function onLocationInput() {
  clearTimeout(locDebounce);
  const val = document.getElementById('bLocation').value.trim();
  if (val.length < 3) {
    document.getElementById('locationSuggestions').style.display = 'none';
    document.getElementById('locationActions').style.display     = 'none';
    document.getElementById('travelFeeBox').style.display        = 'none';
    travelFeeAmount = 0;
    updateTotal();
    return;
  }
  locDebounce = setTimeout(() => geocodeSuggest(val), 400);
}

async function geocodeSuggest(query) {
  // Use Nominatim (free, no key needed)
  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=my&limit=5&q=${encodeURIComponent(query)}`;
  try {
    const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    const box  = document.getElementById('locationSuggestions');
    if (!data.length) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    box.innerHTML = data.map(p => `<div class="loc-suggestion" data-lat="${p.lat}" data-lng="${p.lon}" data-name="${p.display_name}">${p.display_name}</div>`).join('');
    box.querySelectorAll('.loc-suggestion').forEach(el => {
      el.addEventListener('click', () => {
        const lat  = parseFloat(el.dataset.lat);
        const lng  = parseFloat(el.dataset.lng);
        const name = el.dataset.name;
        document.getElementById('bLocation').value = name;
        box.style.display = 'none';
        // Maps link
        document.getElementById('locationActions').style.display = 'block';
        document.getElementById('mapsLink').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
        locationCoords = { lat, lng, name };
        computeTravelFee(lat, lng);
      });
    });
  } catch { /* silent */ }
}

/* ══════════════════════════════════════
   ADD-ON TOGGLE & TOTAL
══════════════════════════════════════ */
function updateTotal() {
  const checkboxes = document.querySelectorAll('.addon-card input[type=checkbox]');
  let addonsTotal  = 0;
  const addonNames = [];

  checkboxes.forEach(cb => {
    const card = cb.closest('.addon-card');
    if (cb.checked) {
      card.classList.add('selected');
      addonsTotal += parseInt(cb.value);
      addonNames.push(cb.dataset.label);
    } else {
      card.classList.remove('selected');
    }
  });

  // Travel + hotel fees
  const hotelFee = travelFeeAmount > 0 ? HOTEL_FEE : 0;
  const travelRow = document.getElementById('sumTravelRow');
  if (travelFeeAmount > 0 || hotelFee > 0) {
    travelRow.style.display = 'flex';
    const travelLabel = `RM ${travelFeeAmount} (travel) + RM ${hotelFee} (hotel)`;
    document.getElementById('sumTravel').textContent = travelLabel;
  } else {
    travelRow.style.display = 'none';
  }

  // Package discount — handle both {v,t} object format (from server) and legacy plain number
  const discounts   = JSON.parse(localStorage.getItem('pkg_discounts') || '{}');
  const rawDisc     = discounts[activePackage.name];
  let discountAmt   = 0;
  if (rawDisc) {
    const discVal  = (typeof rawDisc === 'object') ? (rawDisc.v || 0) : rawDisc;
    const discType = (typeof rawDisc === 'object') ? (rawDisc.t || 'fixed') : 'fixed';
    discountAmt = discType === 'pct'
      ? Math.round(activePackage.baseAmount * discVal / 100)
      : discVal;
  }
  const discRow     = document.getElementById('sumDiscountRow');
  if (discountAmt > 0) {
    discRow.style.display = 'flex';
    document.getElementById('sumDiscount').textContent = `- RM ${discountAmt}`;
  } else {
    discRow.style.display = 'none';
  }

  // Promo code discount
  let promoAmt  = 0;
  let promoCode = '';
  const promoInput = document.getElementById('promoCodeInput');
  if (promoInput && promoInput.value.trim()) {
    const code       = promoInput.value.trim().toUpperCase();
    const promoCodes = JSON.parse(localStorage.getItem('promo_codes') || '{}');
    
    let discount = 0;
    if (Array.isArray(promoCodes)) {
      const match = promoCodes.find(p => p.code === code);
      if (match) discount = match.discount;
    } else if (promoCodes && typeof promoCodes === 'object') {
      discount = promoCodes[code] || 0;
    }

    if (discount > 0) {
      promoAmt  = discount;
      promoCode = code;
      document.getElementById('promoFeedback').textContent = `✅ "${code}" applied — RM ${promoAmt} off!`;
      document.getElementById('promoFeedback').style.color = '#4ade80';
    } else if (code) {
      document.getElementById('promoFeedback').textContent = '❌ Invalid promo code';
      document.getElementById('promoFeedback').style.color = '#f87171';
    }
  } else if (document.getElementById('promoFeedback')) {
    document.getElementById('promoFeedback').textContent = '';
  }

  const promoRow = document.getElementById('sumPromoRow');
  if (promoAmt > 0 && promoRow) {
    promoRow.style.display = 'flex';
    document.getElementById('sumPromo').textContent = `- RM ${promoAmt} (${promoCode})`;
  } else if (promoRow) {
    promoRow.style.display = 'none';
  }

  const totalDiscAmt = discountAmt + promoAmt;
  const origTotal    = activePackage.baseAmount + addonsTotal + travelFeeAmount + hotelFee;
  const total        = Math.max(0, origTotal - totalDiscAmt);

  // Add-ons row
  const addonsRow = document.getElementById('sumAddonsRow');
  if (addonNames.length > 0) {
    addonsRow.style.display = 'flex';
    document.getElementById('sumAddons').textContent = addonNames.join(', ') + ` (+RM ${addonsTotal})`;
  } else {
    addonsRow.style.display = 'none';
  }

  // Show total — with strikethrough if discounted
  const priceEl = document.getElementById('sumPrice');
  if (totalDiscAmt > 0) {
    priceEl.innerHTML = `<span style="text-decoration:line-through;color:var(--muted);font-size:0.85em;margin-right:6px;">RM ${origTotal.toLocaleString()}</span><span style="color:var(--gold);">RM ${total.toLocaleString()}</span>`;
  } else {
    priceEl.textContent = `RM ${total.toLocaleString()}`;
  }
  activePackage.totalAmount  = total;
  activePackage.appliedPromo = promoCode;
}

/* ══════════════════════════════════════
   BOOKING MODAL
══════════════════════════════════════ */
function openBookingModal(name, price) {
  const rawAmt = parseInt((price || '').replace(/[^0-9]/g, '')) || 0;
  activePackage = {
    name,
    price,
    baseAmount:   rawAmt,
    totalAmount:  rawAmt,
  };
  selectedDates   = [];
  selectedDate    = null;
  currentDateSlot = 0;
  travelFeeAmount = 0;
  locationCoords  = null;
  isEnquiryDate   = false;
  isEnquiryMode   = false;

  const now = new Date();
  currentYear  = now.getFullYear();
  currentMonth = now.getMonth();

  showStep('stepCalendar');
  updateCalendarSlotHeader();
  document.getElementById('modalPackageLabel').textContent = `${name} — ${price}`;
  document.getElementById('btnContinue').disabled          = true;
  document.getElementById('enquiryBanner').classList.remove('show');

  // Load real busy dates from Google Calendar (auto, no login needed)
  loadCalendarBusy();

  renderCalendar();
  document.getElementById('bookingModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}


/* Show which date slot we're picking */
function updateCalendarSlotHeader() {
  const maxD  = maxDatesForPkg();
  const total = selectedDates.length;
  const title = total === 0
    ? 'Select Your Date(s)'
    : total < maxD
      ? `Add Day ${total + 1}? (or tap Continue)`
      : maxD === 1 ? 'Date selected' : 'All dates selected';
  document.getElementById('modalTitle').textContent = title;

  // Hint about max dates for this package
  const hint = document.getElementById('calDateHint');
  if (hint) hint.textContent = maxD > 1 ? `This package allows up to ${maxD} days. Tap dates to add.` : '';

  const container = document.getElementById('calSelectedDates');
  if (!container) return;
  if (selectedDates.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = selectedDates.map((d, i) => {
    const fmt = new Date(d + 'T00:00:00').toLocaleDateString('en-MY', { day:'numeric', month:'short' });
    return `<span class="date-chip"><span class="date-chip-label">${DATE_LABELS[i] || 'Day '+(i+1)}</span>${fmt} <span style="cursor:pointer;opacity:0.6;" onclick="removeDate(${i})">✕</span></span>`;
  }).join('');
}

function closeBookingModal() {
  document.getElementById('bookingModal').classList.remove('open');
  document.body.style.overflow = '';
}

function closeIfOverlay(e) {
  if (e.target === document.getElementById('bookingModal')) closeBookingModal();
}

function showStep(id) {
  ['stepCalendar','stepDetails','stepConfirm'].forEach(s => {
    document.getElementById(s).style.display = s === id ? 'block' : 'none';
  });
}

function removeDate(idx) {
  selectedDates.splice(idx, 1);
  selectedDate    = selectedDates[0] || null;
  currentDateSlot = selectedDates.length;
  document.getElementById('btnContinue').disabled = selectedDates.length === 0;
  renderCalendar();
  updateCalendarSlotHeader();
}

function goToStep2(enquiry = false) {
  if (selectedDates.length === 0) return;
  isEnquiryMode   = enquiry;
  selectedDate    = selectedDates[0];

  const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-MY', { weekday:'short', year:'numeric', month:'long', day:'numeric' });
  const datesSummary = selectedDates.map((d,i) => `${DATE_LABELS[i]}: ${fmtDate(d)}`).join(' · ');

  document.getElementById('sumPkg').textContent   = activePackage.name;
  document.getElementById('sumDate').textContent  = datesSummary;
  document.getElementById('sumPrice').textContent = activePackage.price;

  // Date chips on Step 2
  const box  = document.getElementById('selectedDatesBox');
  const list = document.getElementById('selectedDatesList');
  if (selectedDates.length > 1) {
    box.style.display  = 'block';
    list.innerHTML = selectedDates.map((d, i) => {
      const fmt = fmtDate(d);
      return `<span class="date-chip"><span class="date-chip-label">${DATE_LABELS[i]}</span>${fmt}</span>`;
    }).join('');
  } else {
    box.style.display = 'none';
  }

  const evtSection = document.getElementById('eventDetailsSection');
  const evtList    = document.getElementById('eventDetailsList');

  // Generate time slot options (5:00 AM – 11:30 PM, every 30 min)
  const timeOptions = (() => {
    let opts = '<option value="">— Select time —</option>';
    for (let h = 5; h <= 23; h++) {
      for (let m of [0, 30]) {
        const hh   = String(h).padStart(2,'0');
        const mm   = String(m).padStart(2,'0');
        const ampm = h < 12 ? 'AM' : 'PM';
        const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
        opts += `<option value="${hh}:${mm}">${h12}:${mm} ${ampm}</option>`;
      }
    }
    return opts;
  })();

  const funcOptions =
    '<option value="">— Select function —</option>' +
    ['Nikah','Sanding','Tandang','Reception','Engagement','Portrait','Birthday'].map(f =>
      `<option value="${f}">${f}</option>`).join('');

  const selectStyle = 'background:var(--dark3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-family:inherit;font-size:0.88rem;outline:none;width:100%;cursor:pointer;';

  const sessions = sessionsForPkg();
  const sessionLabels = ['Nikah','Sanding','Tunang','Tandang','Reception','Majlis 1','Majlis 2','Majlis 3'];

  evtList.innerHTML = selectedDates.map((d, i) => {
    const fmt   = fmtDate(d);
    const label = DATE_LABELS[i] || `Day ${i+1}`;

    // Build session rows for this date
    let sessionRows = '';
    for (let s = 0; s < sessions; s++) {
      const sessionLabel = sessions > 1 ? `Session ${s+1}` : 'Function / Event';
      sessionRows += `
        <div style="padding:10px 0 4px;${s > 0 ? 'border-top:1px solid rgba(255,255,255,0.06);margin-top:6px;' : ''}">
          ${sessions > 1 ? `<p style="font-size:0.68rem;letter-spacing:1px;text-transform:uppercase;color:var(--gold);margin-bottom:8px;">${sessionLabel}</p>` : ''}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="form-group">
              <label for="evtFunc_${i}_${s}">Function / Event</label>
              <select id="evtFunc_${i}_${s}" aria-label="Function or Event type" required style="${selectStyle}">${funcOptions}</select>
            </div>
            <div class="form-group">
              <label for="evtTime_${i}_${s}">Start Time</label>
              <select id="evtTime_${i}_${s}" aria-label="Function start time" required style="${selectStyle}">${timeOptions}</select>
            </div>
          </div>
        </div>`;
    }

    return `
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:14px;margin-bottom:10px;">
        <p style="font-size:0.72rem;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:10px;">${label} — ${fmt}</p>
        ${sessionRows}
      </div>`;
  }).join('');
  evtSection.style.display = 'block';


  document.getElementById('step2Title').textContent = enquiry ? 'Send Availability Enquiry' : 'Your Details';
  document.getElementById('modalSummaryLabel').textContent = enquiry
    ? `Enquiry — ${activePackage.name}`
    : `${activePackage.name} — ${activePackage.price}`;
  document.getElementById('enquiryNotice').style.display  = enquiry ? 'block' : 'none';
  document.getElementById('depositNotice').style.display  = enquiry ? 'none'  : 'block';

  document.querySelector('.addons-section').style.display = enquiry ? 'none' : 'block';
  document.getElementById('sumAddonsRow').style.display   = 'none';

  document.getElementById('btnSubmitBooking').textContent = enquiry
    ? '📲 Send Enquiry to Photographer'
    : 'Confirm Booking & Secure Date';

  document.querySelectorAll('.addon-card input[type=checkbox]').forEach(cb => {
    cb.checked = false;
    cb.closest('.addon-card').classList.remove('selected');
  });
  document.getElementById('bLocation').value = '';
  document.getElementById('locationActions').style.display = 'none';
  document.getElementById('travelFeeBox').style.display    = 'none';
  travelFeeAmount = 0;
  updateTotal();
  showStep('stepDetails');
}

function goToStep1() {
  isEnquiryMode = false;
  showStep('stepCalendar');
}

/* ─── GENERATE ENQUIRY REF ─── */
/* ─── HTML EMAIL BUILDER ─── */
function buildEmailHTML(o) {
  // o = { type, ref, name, email, phone, location, pkg, price, datesBlock, notes, approveLink, actionNote }
  var phoneClean = (o.phone || '').replace(/[^0-9]/g, '');
  var waLink     = phoneClean ? 'https://wa.me/60' + phoneClean.replace(/^0/, '') : '';
  var mapsLink   = o.location ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.location) : '';
  var wazeLink   = o.location ? 'https://waze.com/ul?q=' + encodeURIComponent(o.location) : '';
  var isEnquiry  = o.type.includes('ENQUIRY');
  var headerBg   = isEnquiry ? '#1a1108' : '#0e1a0e';
  var accentHex  = isEnquiry ? '#c9a96e' : '#22c55e';
  var priceClr   = isEnquiry ? '#b8860b' : '#16a34a';
  var typeLabel  = isEnquiry ? '📋 New Booking Enquiry' : '✅ New Direct Booking';

  // Build dates section
  var datesHtml = '';
  var datesLines = (o.datesBlock || '').split('\n').filter(Boolean);
  for (var i = 0; i < datesLines.length; i++) {
    var parts = datesLines[i].split('|');
    var dateTitle = parts[0] ? parts[0].trim() : '';
    var dateDetail = parts[1] ? parts[1].trim() : '';
    datesHtml += '<div style="background:#fff;border-left:3px solid ' + accentHex + ';border-radius:4px;padding:8px 12px;margin-bottom:6px;">';
    datesHtml += '<p style="margin:0;font-size:13px;font-weight:bold;color:#111;">' + dateTitle + '</p>';
    if (dateDetail) datesHtml += '<p style="margin:3px 0 0;font-size:12px;color:#666;">' + dateDetail + '</p>';
    datesHtml += '</div>';
  }

  // Phone section
  var phoneHtml = '';
  if (o.phone && waLink) {
    phoneHtml = '<a href="' + waLink + '" style="font-size:20px;font-weight:bold;color:#25d366;text-decoration:none;">📲 ' + o.phone + '</a>'
              + '<p style="margin:4px 0 0;font-size:11px;color:#999;">Tap to open WhatsApp</p>';
  } else {
    phoneHtml = '<p style="margin:0;font-size:16px;color:#999;">Not provided</p>';
  }

  // Location section
  var locationHtml = '';
  if (o.location && mapsLink) {
    locationHtml = '<p style="margin:0;font-size:14px;color:#111;">' + o.location + '</p>'
      + '<p style="margin:8px 0 0;">'
      + '<a href="' + mapsLink + '" style="display:inline-block;background:#4285F4;color:#fff;padding:6px 14px;border-radius:4px;text-decoration:none;font-size:12px;font-weight:bold;margin-right:8px;">🗺️ Google Maps</a>'
      + '<a href="' + wazeLink + '" style="display:inline-block;background:#00bfff;color:#000;padding:6px 14px;border-radius:4px;text-decoration:none;font-size:12px;font-weight:bold;">🚗 Waze</a>'
      + '</p>';
  } else {
    locationHtml = '<p style="margin:0;font-size:14px;color:#999;">Not provided — ask client for location</p>';
  }

  // Notes section
  var notesHtml = '';
  if (o.notes && o.notes !== 'None') {
    notesHtml = '<tr><td style="padding:20px 32px 0;">'
      + '<p style="margin:0 0 8px;font-size:10px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#999;">NOTES FROM CLIENT</p>'
      + '<p style="margin:0;padding:12px 16px;background:#fffbf0;border:1px solid #f0e0b0;border-radius:6px;font-size:13px;color:#555;line-height:1.6;">' + o.notes + '</p>'
      + '</td></tr>';
  }

  // Action section
  var actionHtml = '';
  if (o.approveLink) {
    actionHtml = '<div style="background:#f0f7f0;border:1px solid #b7ddb7;border-radius:8px;padding:20px;text-align:center;">'
      + '<p style="margin:0 0 12px;font-size:13px;color:#333;">Review and respond to this booking:</p>'
      + '<a href="' + o.approveLink + '" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px;">✅ Approve Booking</a>'
      + '<p style="margin:10px 0 0;font-size:11px;color:#999;">Or reply DECLINE to this email with a reason</p>'
      + '</div>';
  } else if (o.actionNote) {
    actionHtml = '<div style="background:#fffbf0;border:1px solid #f0d080;border-radius:8px;padding:16px;">'
      + '<p style="margin:0;font-size:13px;color:#856404;">' + o.actionNote + '</p>'
      + '</div>';
  }

  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Nizar Naseer Studio</title></head>'
    + '<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f4f4" style="padding:24px 0;"><tr><td align="center">'
    + '<table width="600" cellpadding="0" cellspacing="0" style="max-width:96%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">'

    // Header
    + '<tr><td bgcolor="' + headerBg + '" style="padding:24px 32px;">'
    + '<p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:' + accentHex + ';">' + typeLabel + '</p>'
    + '<p style="margin:4px 0 0;font-size:20px;font-weight:bold;color:#ffffff;font-family:Georgia,serif;">Nizar Naseer Studio</p>'
    + '<p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,0.4);">Ref: ' + o.ref + '</p>'
    + '</td></tr>'

    // CLIENT CONTACT block
    + '<tr><td style="padding:24px 32px 0;">'
    + '<p style="margin:0 0 12px;font-size:10px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#999;">CLIENT CONTACT</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;border:1px solid #ececec;"><tr>'
    + '<td style="padding:16px 20px;border-right:1px solid #ececec;width:50%;vertical-align:top;">'
    + '<p style="margin:0 0 2px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;">Name</p>'
    + '<p style="margin:0;font-size:18px;font-weight:bold;color:#111;">' + o.name + '</p>'
    + '<p style="margin:4px 0 0;font-size:12px;color:#666;">' + o.email + '</p>'
    + '</td>'
    + '<td style="padding:16px 20px;vertical-align:top;">'
    + '<p style="margin:0 0 2px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;">WhatsApp</p>'
    + phoneHtml
    + '</td></tr></table>'
    + '</td></tr>'

    // BOOKING DETAILS block
    + '<tr><td style="padding:20px 32px 0;">'
    + '<p style="margin:0 0 12px;font-size:10px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#999;">BOOKING DETAILS</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;border:1px solid #ececec;"><tr>'
    + '<td style="padding:14px 20px;border-right:1px solid #ececec;width:55%;border-bottom:1px solid #ececec;vertical-align:top;">'
    + '<p style="margin:0 0 2px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;">Package</p>'
    + '<p style="margin:0;font-size:15px;font-weight:bold;color:#111;">' + o.pkg + '</p>'
    + '</td>'
    + '<td style="padding:14px 20px;border-bottom:1px solid #ececec;vertical-align:top;">'
    + '<p style="margin:0 0 2px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;">Price</p>'
    + '<p style="margin:0;font-size:18px;font-weight:bold;color:' + priceClr + ';">' + o.price + '</p>'
    + '</td></tr>'
    + '<tr><td colspan="2" style="padding:14px 20px;">'
    + '<p style="margin:0 0 8px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;">📅 Dates & Functions</p>'
    + datesHtml
    + '</td></tr></table>'
    + '</td></tr>'

    // LOCATION block
    + '<tr><td style="padding:20px 32px 0;">'
    + '<p style="margin:0 0 12px;font-size:10px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#999;">LOCATION</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;border:1px solid #ececec;">'
    + '<tr><td style="padding:14px 20px;">' + locationHtml + '</td></tr>'
    + '</table></td></tr>'

    // NOTES (conditional)
    + notesHtml

    // ACTION
    + '<tr><td style="padding:24px 32px;">' + actionHtml + '</td></tr>'

    // FOOTER
    + '<tr><td bgcolor="#f9f9f9" style="padding:14px 32px;border-top:1px solid #ececec;text-align:center;">'
    + '<p style="margin:0;font-size:11px;color:#aaa;">Nizar Naseer Studio · Automated Booking Notification · ' + o.ref + '</p>'
    + '</td></tr>'

    + '</table></td></tr></table></body></html>';
}

function genRef() {
  return 'ENQ-' + Date.now().toString().slice(-6);
}

/* ─── SUBMIT ─── */
function submitBooking(e) {
  e.preventDefault();
  const first    = document.getElementById('bFirstName').value.trim();
  const last     = document.getElementById('bLastName').value.trim();
  const groomName = document.getElementById('bGroomName')?.value.trim() || '';
  const brideName = document.getElementById('bBrideName')?.value.trim() || '';
  const coupleLabel = (groomName && brideName) ? `${groomName} & ${brideName}` : (groomName || brideName || '');
  const email    = document.getElementById('bEmail').value.trim();
  const phoneRaw = document.getElementById('bPhone').value.trim();
  // Normalize Malaysian number — auto-add leading 0 if missing
  const phoneCleanRaw = phoneRaw.replace(/[\s\-\+\(\)]/g, '');
  const phone = phoneCleanRaw
    ? (phoneCleanRaw.startsWith('60') ? '0' + phoneCleanRaw.slice(2)
      : phoneCleanRaw.startsWith('0') ? phoneCleanRaw
      : '0' + phoneCleanRaw)
    : '';
  const notes    = document.getElementById('bNotes').value.trim();
  const location = document.getElementById('bLocation').value.trim();
  const name     = `${first} ${last}`;
  const ref      = genRef();

  // Collect per-date event details (each date may have multiple sessions)
  const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-MY', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const numSessions = sessionsForPkg();
  const eventDetails = selectedDates.map((d, i) => {
    const label = selectedDates.length > 1 ? `${DATE_LABELS[i]}: ` : '';
    const sessionParts = [];
    for (let s = 0; s < numSessions; s++) {
      const fn = document.getElementById(`evtFunc_${i}_${s}`)?.value.trim() || '—';
      const tm = document.getElementById(`evtTime_${i}_${s}`)?.value || '—';
      sessionParts.push(numSessions > 1 ? `Session ${s+1}: ${fn} @ ${tm}` : `${fn} @ ${tm}`);
    }
    return `${label}${fmtDate(d)}\n  ${sessionParts.join('\n  ')}`;
  });
  const dateStr     = fmtDate(selectedDates[0]);
  const datesBlock  = eventDetails.join('\n');

  // Travel & hotel
  const hotelFee    = travelFeeAmount > 0 ? HOTEL_FEE : 0;
  const locationLine = location
    ? `📍 Location: ${location}${travelFeeAmount > 0 ? ` (RM ${travelFeeAmount} travel + RM ${hotelFee} hotel)` : ' (within free zone)'}`
    : '';

  // Validate all required fields
  if (!first || !last || !email || !phone) {
    alert('Please fill in your name, email and phone number.');
    return;
  }
  const locVal = document.getElementById('bLocation').value.trim();
  if (!locVal) {
    alert('Please enter your event location.');
    document.getElementById('bLocation').focus();
    return;
  }
  const _numSessions = sessionsForPkg();
  for (let i = 0; i < selectedDates.length; i++) {
    for (let s = 0; s < _numSessions; s++) {
      const fn = document.getElementById(`evtFunc_${i}_${s}`)?.value || '';
      const tm = document.getElementById(`evtTime_${i}_${s}`)?.value || '';
      if (!fn || !tm) {
        const label = _numSessions > 1 ? `Day ${i+1}, Session ${s+1}` : `Day ${i+1}`;
        alert(`Please select the function and time for ${label}.`);
        return;
      }
    }
  }

  if (isEnquiryMode) {
    /* ── ENQUIRY: Email via Web3Forms + WhatsApp via wa.me ── */
    // Use current origin (works on localhost AND Netlify).
    // Only fall back to SITE_DOMAIN if opened as a local file (file://)
    const approveOrigin = (window.location.protocol === 'file:') ? SITE_DOMAIN : window.location.origin;
    const approveBase   = approveOrigin + '/approve.html';
    // Build price breakdown
    const baseAmt  = activePackage.baseAmount || parseInt((activePackage.price || '').replace(/[^0-9]/g,'')) || 0;
    const totalAmt = activePackage.totalAmount || baseAmt;
    const priceBreakdown = [
      `📦 Package (${activePackage.name}): RM ${baseAmt.toLocaleString()}`,
      ...(travelFeeAmount > 0 ? [`🚗 Travel Fee (>${TRAVEL_FREE_KM}km): RM ${travelFeeAmount}`, `🏨 Hotel Accommodation: RM ${HOTEL_FEE}`] : []),
      `━━━━━━━━━━━━━━`,
      `💰 TOTAL: RM ${totalAmt.toLocaleString()}`,
    ].join('\n');
    const approveParams = new URLSearchParams({
      ref, name, email,
      phone:    phone || 'Not provided',
      package:  activePackage.name,
      price:    `RM ${totalAmt.toLocaleString()}`,
      date:     datesBlock,
      location: location || 'Not provided',
      notes:    notes || 'None',
    });
    const approveLink = `${approveBase}?${approveParams.toString()}`;

    // Google Calendar quick-add link (photographer clicks to add event)
    const gcalDate = selectedDates[0].replace(/-/g, ''); // YYYYMMDD
    const calTitle = coupleLabel
      ? `${coupleLabel} — ${activePackage.name}`
      : `[${ref}] ${name} — ${activePackage.name}`;
    const gcalTitle = encodeURIComponent(calTitle);
    const gcalDetail = encodeURIComponent(
      `Ref: ${ref}\n` +
      (coupleLabel ? `Couple: ${coupleLabel}\n` : '') +
      `Client: ${name} | ${phone}\n` +
      `Package: ${activePackage.name}\n` +
      `Schedule:\n${datesBlock}\n` +
      `Notes: ${notes || 'None'}\n` +
      `Approve: ${approveLink}`
    );
    const gcalLoc = encodeURIComponent(location || '');
    const gcalLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${gcalTitle}&dates=${gcalDate}/${gcalDate}&details=${gcalDetail}&location=${gcalLoc}`;

    const waMsg =
      `🔔 *New Booking Enquiry*\n` +
      `━━━━━━━━━━━━━━\n` +
      `📋 Ref: *${ref}*\n` +
      `👤 Client: *${name}*\n` +
      `📱 WhatsApp: ${phone || 'Not provided'}\n` +
      `📧 Email: ${email}\n` +
      `📦 Package: *${activePackage.name}*\n` +
      (coupleLabel ? `💑 Couple: *${coupleLabel}*\n` : '') +
      `💰 Price: RM ${(activePackage.totalAmount || activePackage.baseAmount).toLocaleString()}\n` +
      `📍 Location: ${location || 'Not provided'}${travelFeeAmount > 0 ? ` (Travel: RM ${travelFeeAmount} + Hotel: RM ${HOTEL_FEE})` : ''}\n` +
      `📅 Dates:\n${eventDetails.map(e => '  ' + e).join('\n')}\n` +
      `📝 Notes: ${notes || 'None'}\n` +
      `━━━━━━━━━━━━━━\n` +
      `✅ To *APPROVE*, open:\n${approveLink}\n\n` +
      `❌ To *DECLINE*, reply to this message.`;

    const PHOTOGRAPHER = '601118736810';
    const w3fKey = localStorage.getItem('web3forms_key') || W3F_FALLBACK_KEY;

    /* 1️⃣ Email via Web3Forms */
    if (w3fKey) {
      const mapsUrl      = location ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(location) : 'Not provided';
      const wazeUrl      = location ? 'https://waze.com/ul?q=' + encodeURIComponent(location) : 'Not provided';
      const displayPhone = phone || 'Not provided';
      fetch('https://api.web3forms.com/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          access_key:  w3fKey,
          from_name:   'Nizar Naseer Studio',
          subject:     coupleLabel
            ? `📋 [ENQUIRY] ${ref} — ${coupleLabel} — ${activePackage.name}`
            : `📋 [ENQUIRY] ${ref} — ${name} — ${activePackage.name}`,
          name, email, replyto: email,
          // ── CLIENT ──
          '📍 REF':          ref,
          '👤 Client Name':   name,
          ...(coupleLabel ? { '💑 Couple (Groom & Bride)': coupleLabel } : {}),
          '📱 WhatsApp':      phone ? phone + ' — wa.me/60' + phone.replace(/^0/,'') : 'Not provided',
          '📧 Email':         email,
          // ── BOOKING ──
          '📦 Package':       activePackage.name,
          '📅 Date(s)':        datesBlock.replace(/\n/g, ' ┃ '),
          '📍 Location':      location || 'Not provided',
          '🗺️ Google Maps':   mapsUrl,
          '🗯️ Waze':           wazeUrl,
          // ── PRICE BREAKDOWN ──
          '💳 Base Package':   `RM ${baseAmt.toLocaleString()}`,
          ...(travelFeeAmount > 0 ? {
            '🚗 Travel Fee':    `RM ${travelFeeAmount} (distance >50km)`,
            '🏨 Hotel Fee':     `RM ${HOTEL_FEE}`,
          } : {}),
          '💰 TOTAL PRICE':    `RM ${totalAmt.toLocaleString()}`,
          // ── NOTES ──
          '📝 Notes':          notes || 'None',
          // ── ACTION ──
          '✅ APPROVE LINK':  approveLink,
          '📅 ADD TO CALENDAR': gcalLink,
          message:         `ENQUIRY ${ref} | ${name} | ${displayPhone}\n${activePackage.name} | RM ${totalAmt.toLocaleString()}\nDate: ${datesBlock}\nApprove: ${approveLink}`,
        }),
      }).catch(() => {});
    }


    /* 2️⃣  Auto-WhatsApp to photographer via CallMeBot (server-side) */
    fetch('/api/store-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId:     ref,
        clientName:    name,
        couple:        coupleLabel,
        clientEmail:   email,
        clientPhone:   phone,
        packageName:   activePackage.name,
        eventDate:     selectedDates[0],
        location:      location || '',
        notes:         notes || '',
        totalAmount:   activePackage.totalAmount || activePackage.baseAmount || 0,
        depositAmount: 100,
        datesBlock,
        approveLink,
        notify: true,   // ← triggers auto-WhatsApp to photographer
      }),
    }).catch(() => {});

    /* 3️⃣ Auto-add to Google Calendar */
    fetch('/api/add-calendar-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:       `[${ref}] ${name} — ${activePackage.name}`,
        date:        selectedDates[0],
        startTime:   document.getElementById('evtTime_0_0')?.value || '',
        description: `Ref: ${ref}\nClient: ${name}\nPhone: ${phone}\nEmail: ${email}\nPackage: ${activePackage.name}\nLocation: ${location || 'TBD'}\nNotes: ${notes || 'None'}\nApprove: ${approveLink}`,
        location:    location || '',
        ref,
      }),
    }).catch(() => {});

    const how = w3fKey
      ? 'Email + WhatsApp notification sent. You\'ll hear back within 24 hours.'
      : 'WhatsApp has opened — tap Send to notify the photographer.';

    document.getElementById('confirmMsg').textContent =
      `Thank you, ${first}! Your enquiry (${ref}) for ${activePackage.name} is submitted. ${how}`;

  } else {
    /* ── DIRECT BOOKING: notify owner + mark dates busy ── */
    selectedDates.forEach(d => busyDates.add(d));
    // Persist booked dates to localStorage so calendar blocks them after refresh
    const savedBooked = JSON.parse(localStorage.getItem('bookedDates') || '[]');
    selectedDates.forEach(d => { if (!savedBooked.includes(d)) savedBooked.push(d); });
    localStorage.setItem('bookedDates', JSON.stringify(savedBooked));

    const PHOTOGRAPHER = '601118736810';
    const w3fKey = localStorage.getItem('web3forms_key') || W3F_FALLBACK_KEY;

    const waMsg =
      `✅ *New Direct Booking*\n` +
      `━━━━━━━━━━━━━━\n` +
      `📋 Ref: *${ref}*\n` +
      `👤 Client: *${name}*\n` +
      `📱 WhatsApp: ${phone || 'Not provided'}\n` +
      `📧 Email: ${email}\n` +
      `📦 Package: *${activePackage.name}*\n` +
      `💰 Price: RM ${(activePackage.totalAmount || activePackage.baseAmount).toLocaleString()}\n` +
      `📍 Location: ${location || 'Not provided'}${travelFeeAmount > 0 ? ` (Travel: RM ${travelFeeAmount} + Hotel: RM ${HOTEL_FEE})` : ''}\n` +
      `📅 Dates:\n${eventDetails.map(e => '  ' + e).join('\n')}\n` +
      `📝 Notes: ${notes || 'None'}\n` +
      `━━━━━━━━━━━━━━\n` +
      `💳 Awaiting RM ${DEPOSIT_AMOUNT} deposit from client to confirm slot.`;

    /* Email */
    if (w3fKey) {
      const baseAmt2     = activePackage.baseAmount || parseInt((activePackage.price || '').replace(/[^0-9]/g,'')) || 0;
      const totalAmt2    = activePackage.totalAmount || baseAmt2;
      const mapsUrl2     = location ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(location) : 'Not provided';
      const wazeUrl2     = location ? 'https://waze.com/ul?q=' + encodeURIComponent(location) : 'Not provided';
      const displayPhone2 = phone || 'Not provided';
      fetch('https://api.web3forms.com/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          access_key:  w3fKey,
          from_name:   'Nizar Naseer Studio',
          subject:     `✅ [BOOKING] ${ref} — ${name} — ${activePackage.name}`,
          name, email, replyto: email,
          // ── CLIENT ──
          '📍 REF':           ref,
          '👤 Client Name':    name,
          '📱 WhatsApp':       phone ? phone + ' — wa.me/60' + phone.replace(/^0/,'') : 'Not provided',
          '📧 Email':          email,
          // ── BOOKING ──
          '📦 Package':        activePackage.name,
          '📅 Date(s)':         datesBlock.replace(/\n/g, ' ┃ '),
          '📍 Location':       location || 'Not provided',
          '🗺️ Google Maps':    mapsUrl2,
          '🗯️ Waze':            wazeUrl2,
          // ── PRICE BREAKDOWN ──
          '💳 Base Package':    `RM ${baseAmt2.toLocaleString()}`,
          ...(travelFeeAmount > 0 ? {
            '🚗 Travel Fee':     `RM ${travelFeeAmount} (distance >50km)`,
            '🏨 Hotel Fee':      `RM ${HOTEL_FEE}`,
          } : {}),
          '💰 TOTAL PRICE':     `RM ${totalAmt2.toLocaleString()}`,
          // ── NOTES & ACTION ──
          '📝 Notes':           notes || 'None',
          '⚠️ ACTION':           `Send client RM ${DEPOSIT_AMOUNT} deposit payment link to confirm slot.`,
          message:          `BOOKING ${ref} | ${name} | ${displayPhone2}\n${activePackage.name} | RM ${totalAmt2.toLocaleString()}\nDate: ${datesBlock}\nLocation: ${location || 'Not provided'}`,
        }),
      }).catch(() => {});
    }

    /* WhatsApp */
    window.open(`https://wa.me/${PHOTOGRAPHER}?text=${encodeURIComponent(waMsg)}`, '_blank');

    /* Auto-add to Google Calendar */
    fetch('/api/add-calendar-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:       `[${ref}] ${name} — ${activePackage.name}`,
        date:        selectedDates[0],
        startTime:   document.getElementById('evtTime_0_0')?.value || '',
        description: `Ref: ${ref}\nClient: ${name}\nPhone: ${phone}\nEmail: ${email}\nPackage: ${activePackage.name}\nLocation: ${location || 'TBD'}\nNotes: ${notes || 'None'}`,
        location:    location || '',
        ref,
      }),
    }).catch(() => {});

    document.getElementById('confirmMsg').textContent =
      `Thank you, ${first}! Your ${activePackage.name} (${selectedDates.length} day${selectedDates.length>1?'s':''}) is confirmed. ` +
      `Please complete the RM ${DEPOSIT_AMOUNT} deposit to fully secure your date. The photographer has been notified.`;
  }

  /* 3️⃣ Save to Netlify Forms (always — for admin dashboard) */
  fetch('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      'form-name':   'booking-enquiry',
      'ref':         ref,
      'client_name': name,
      'phone':       phone || 'Not provided',
      'email':       email,
      'package':     activePackage.name,
      'price':       `RM ${(activePackage.totalAmount || activePackage.baseAmount).toLocaleString()}`,
      'date':        datesBlock,
      'location':    location || 'Not provided',
      'notes':       notes || 'None',
    }).toString(),
  }).catch(() => {});

  showStep('stepConfirm');
}


/* ══════════════════════════════════════
   CONTACT FORM
══════════════════════════════════════ */
function handleContact(e) {
  e.preventDefault();
  
  const name = document.getElementById('cName').value;
  const email = document.getElementById('cEmail').value;
  const subject = document.getElementById('cSubject').value || 'No Subject';
  const message = document.getElementById('cMessage').value;

  const s = document.getElementById('formSuccess');
  s.classList.add('show');
  
  // 1. Submit email notification via Web3Forms
  const key = (window.STUDIO_CONFIG || {}).web3forms_key || '6be870cf-b9ec-42bd-a26f-8d5f09067bf3';
  if (key) {
    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        access_key: key,
        subject: `✉️ [Contact Form] ${subject}`,
        from_name: 'WeddingClicks Portfolio',
        name,
        email,
        message
      })
    }).catch(err => console.error('Contact email submit failed:', err));
  }

  // 2. Submit to Netlify Form to display in Admin Dashboard
  const ctRef = 'CT-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  fetch('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      'form-name':   'booking-enquiry',
      'ref':         ctRef,
      'client_name': name,
      'phone':       'Not provided',
      'email':       email,
      'package':     'Get in Touch Message',
      'price':       'N/A',
      'date':        'N/A',
      'notes':       `Subject: ${subject}\n\nVision: ${message}`,
    })
  }).catch(() => {});

  e.target.reset();
  setTimeout(() => s.classList.remove('show'), 5000);
}

/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  buildGallery();
  applyDiscountsToPkgCards();

  document.querySelectorAll('.package-card, .about-text, .contact-left, .contact-form, .section-header')
    .forEach(addReveal);

  // Load Google APIs only if real credentials provided
  const hasRealCreds = !GCAL_CONFIG.clientId.includes('YOUR_GOOGLE');
  if (hasRealCreds) {
    const s1 = document.createElement('script');
    s1.src = 'https://apis.google.com/js/api.js';
    s1.onload = gapiLoaded;
    document.head.appendChild(s1);

    const s2 = document.createElement('script');
    s2.src = 'https://accounts.google.com/gsi/client';
    s2.onload = gisLoaded;
    document.head.appendChild(s2);
  }
});

/* ══════════════════════════════════════
   APPLY DISCOUNTS TO PACKAGE CARDS
   Fetches discounts.json (same domain) so ALL
   visitors see the same discounts everywhere.
══════════════════════════════════════ */
function applyDiscountsToPkgCards() {
  fetch('/api/settings?key=site_discounts')
    .then(r => r.json())
    .then(data => {
      if (data && (Object.keys(data.pkg_discounts || {}).length > 0 || Object.keys(data.promo_codes || {}).length > 0)) {
        const discounts = data.pkg_discounts || {};
        const promos    = data.promo_codes   || {};
        localStorage.setItem('pkg_discounts', JSON.stringify(discounts));
        localStorage.setItem('promo_codes',   JSON.stringify(promos));
        localStorage.setItem('combo_bundle_discount', String(data.combo_bundle_discount !== undefined ? data.combo_bundle_discount : 150));
        _renderDiscountCards(discounts);
      } else {
        throw new Error("Empty DB");
      }
    })
    .catch(() => {
      fetch('discounts.json?v=' + Date.now())
        .then(r => r.json())
        .then(data => {
          const discounts = data.pkg_discounts || {};
          const promos    = data.promo_codes   || {};
          localStorage.setItem('pkg_discounts', JSON.stringify(discounts));
          localStorage.setItem('promo_codes',   JSON.stringify(promos));
          localStorage.setItem('combo_bundle_discount', String(data.combo_bundle_discount !== undefined ? data.combo_bundle_discount : 150));
          _renderDiscountCards(discounts);
        })
        .catch(() => {
          _renderDiscountCards(JSON.parse(localStorage.getItem('pkg_discounts') || '{}'));
        });
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
    const raw      = discounts[pkgName];
    if (!raw) return;

    // Support {v, t} format (pct/fixed) and legacy plain number (fixed)
    const discVal  = (typeof raw === 'object') ? raw.v : raw;
    const discType = (typeof raw === 'object') ? raw.t : 'fixed';
    if (!discVal || discVal <= 0) return;

    const origNum    = parseInt(pkgPrice.replace(/[^0-9]/g, ''));
    const discAmt    = discType === 'pct' ? Math.round(origNum * discVal / 100) : discVal;
    const pct        = discType === 'pct' ? discVal : Math.round(discVal / origNum * 100);
    const discounted = Math.max(0, origNum - discAmt);

    const card = btn.closest('.package-card');
    if (!card || card.querySelector('.pkg-discounted')) return;

    // ── Corner ribbon ──
    const ribbonContainer = document.createElement('div');
    ribbonContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;border-radius:inherit;pointer-events:none;z-index:1;';
    const ribbon = document.createElement('div');
    ribbon.className = 'discount-ribbon';
    ribbon.innerHTML = `<span>${pct}% OFF</span>`;
    ribbonContainer.appendChild(ribbon);
    card.appendChild(ribbonContainer);

    // ── Tag icon next to pkg-badge ──
    const badge = card.querySelector('.pkg-badge');
    if (badge) {
      badge.insertAdjacentHTML('afterend',
        `<div class="discount-tag-pill">Special Offer &mdash; Save RM ${discAmt.toLocaleString()}</div>`
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

  // ── TNS dropdown card discount ──
  _applyTNSDiscount(discounts);
}

function _applyTNSDiscount(discounts) {
  const sel = document.getElementById('tnsSelect');
  if (!sel) return;
  const parts   = sel.value.split('|');
  const name    = parts[0] + ' Photography';   // e.g. "Tunang Photography"
  const baseNum = parseInt(parts[1]) || 0;
  const priceEl = document.getElementById('tnsPrice');
  if (!priceEl) return;

  // Remove any previous discount display on the TNS card
  const tnsCard = document.getElementById('pkg1');
  if (tnsCard) {
    const old = tnsCard.querySelector('.tns-disc-badge');
    if (old) old.remove();
    const oldStrike = tnsCard.querySelector('.tns-orig-strike');
    if (oldStrike) { oldStrike.remove(); }
  }

  const raw = discounts ? discounts[name] : null;
  if (!raw) {
    priceEl.textContent = parts[1];
    priceEl.style.textDecoration = '';
    priceEl.style.color = '';
    priceEl.style.fontSize = '';
    return;
  }
  const discVal  = (typeof raw === 'object') ? (raw.v || 0) : raw;
  const discType = (typeof raw === 'object') ? (raw.t || 'fixed') : 'fixed';
  if (!discVal || discVal <= 0) { priceEl.textContent = parts[1]; return; }

  const discAmt    = discType === 'pct' ? Math.round(baseNum * discVal / 100) : discVal;
  const finalPrice = Math.max(0, baseNum - discAmt);
  const pct        = discType === 'pct' ? discVal : Math.round(discVal / baseNum * 100);

  // Strike original, show new price
  priceEl.textContent = finalPrice.toLocaleString();
  if (tnsCard) {
    const origEl = document.createElement('div');
    origEl.className = 'tns-orig-strike';
    origEl.style.cssText = 'font-size:0.9rem;color:rgba(255,255,255,0.3);text-decoration:line-through;margin-bottom:2px;';
    origEl.textContent = 'RM ' + baseNum.toLocaleString();
    priceEl.closest('.pkg-price').insertAdjacentElement('beforebegin', origEl);

    const saveBadge = document.createElement('div');
    saveBadge.className = 'tns-disc-badge';
    saveBadge.style.cssText = 'font-size:0.72rem;color:#4ade80;margin-top:4px;letter-spacing:0.5px;';
    saveBadge.textContent = `SAVE RM ${discAmt} (${pct}% OFF)`;
    priceEl.closest('.pkg-price').insertAdjacentElement('afterend', saveBadge);
  }
}

/* ══════════════════════════════════════
   AI PACKAGE ADVISOR (BILINGUAL LOCAL ENGINE)
══════════════════════════════════════ */
let aiCurrentStep = 0;
let aiLang = 'en';
let aiSelEvents = [];
let aiSelService = 'photo';
let aiSelBudget = 'standard';
let packagesDataCache = { photography: [], videography: [] };

// Fetch package configurations to match prices dynamically
fetch('/api/settings?key=site_packages')
  .then(r => r.json())
  .then(data => {
    if (Array.isArray(data) || (data && (data.photography || data.videography))) {
      packagesDataCache = data;
    } else {
      throw new Error("Empty DB packages");
    }
  })
  .catch(() => {
    fetch('/packages.json?v=' + Date.now())
      .then(r => r.json())
      .then(data => { packagesDataCache = data; })
      .catch(() => {});
  });

const AI_LANG = {
  en: {
    eyebrow: "Virtual Assistant",
    title: "✨ AI Package Advisor",
    step: "Step",
    of: "of",
    prevBtn: "Back",
    nextBtn: "Continue",
    finishBtn: "Close Advisor",
    bookBtn: "📅 Confirm & Book This Package",
    estimateTotal: "Estimated Total",
    comboDiscount: "🎁 Combo Bundle Discount",
    suggestionHeader: "Your Suggested Package",
    suggestionSub: "Based on your choices, the AI advisor recommends:",
    adviceTitle: "💡 Advisor Advice:",
    alertNoSelect: "Please select at least one event to help us recommend.",
    
    // Step 1: Events
    q1: "Which events are you planning for your wedding celebration? (Select all that apply)",
    evtNikahTitle: "Nikah (Solemnization)",
    evtNikahDesc: "The core marriage contract ceremony",
    evtSandingTitle: "Sanding (Reception)",
    evtSandingDesc: "The main feast & throne sitting ceremony",
    evtTandangTitle: "Tandang (Bertandang)",
    evtTandangDesc: "The reception hosting by the groom's side",
    evtTunangTitle: "Bertunang (Engagement)",
    evtTunangDesc: "The traditional engagement ring exchange",
    evtPrewedTitle: "Pre-Wedding Shoot",
    evtPrewedDesc: "Professional couple portrait session before the main day",
    evtBirthdayTitle: "Birthday / Other Events",
    evtBirthdayDesc: "Family reunions, birthday parties, cukur jambul, aqiqah",

    // Step 6: Services
    q2: "What services are you looking to book for these events?",
    srvPhotoTitle: "Photography Only",
    srvPhotoDesc: "Stills capture of all moments and outdoor sessions",
    srvVideoTitle: "Videography Only",
    srvVideoDesc: "Event highlight reels and full cinematic footage",
    srvComboTitle: "Photo + Video Combo",
    srvComboDesc: "Complete wedding documentation at a combined package discount",

    // Step 7: Budget
    q3: "What is your target budget for your wedding photography and videography?",
    budgetValueTitle: "Budget / Value Focused",
    budgetValueDesc: "Essential high-quality coverages (Under RM 1,200)",
    budgetStandardTitle: "Standard / Balanced",
    budgetStandardDesc: "Highly popular packages and combos (RM 1,200 - RM 2,500)",
    budgetPremiumTitle: "Premium / Complete",
    budgetPremiumDesc: "No compromises, full day coverage and drone options (RM 2,500+)"
  },
  ms: {
    eyebrow: "Pembantu Maya",
    title: "✨ Penasihat Pakej AI",
    step: "Langkah",
    of: "daripada",
    prevBtn: "Kembali",
    nextBtn: "Seterusnya",
    finishBtn: "Tutup Penasihat",
    bookBtn: "📅 Sahkan & Tempah Pakej Ini",
    waBtn: "💬 Hantar Butiran ke WhatsApp",
    estimateTotal: "Anggaran Jumlah",
    comboDiscount: "🎁 Diskaun Kombo Komplit",
    suggestionHeader: "Cadangan Pakej Anda",
    suggestionSub: "Berdasarkan pilihan anda, penasihat AI mencadangkan:",
    adviceTitle: "💡 Nasihat Penasihat:",
    alertNoSelect: "Sila pilih sekurang-kurangnya satu acara untuk membantu kami mencadangkan pakej.",
    
    // Step 5: Events
    q1: "Apakah acara yang sedang anda rancang untuk majlis perkahwinan anda? (Pilih semua yang berkenaan)",
    evtNikahTitle: "Nikah (Akad Nikah)",
    evtNikahDesc: "Upacara akad nikah dan akad perkahwinan teras",
    evtSandingTitle: "Sanding (Resepsi)",
    evtSandingDesc: "Majlis bersanding dan kenduri perkahwinan utama",
    evtTandangTitle: "Tandang (Bertandang)",
    evtTandangDesc: "Majlis bertandang pihak lelaki",
    evtTunangTitle: "Bertunang (Tunang)",
    evtTunangDesc: "Majlis pertunangan dan pertukaran cincin",
    evtPrewedTitle: "Sesi Pre-Wedding",
    evtPrewedDesc: "Sesi fotografi potret pasangan sebelum hari perkahwinan",
    evtBirthdayTitle: "Hari Lahir / Acara Lain",
    evtBirthdayDesc: "Hari lahir, perjumpaan keluarga, cukur jambul, aqiqah",

    // Step 6: Services
    q2: "Apakah perkhidmatan yang ingin anda tempah untuk acara tersebut?",
    srvPhotoTitle: "Fotografi Sahaja",
    srvPhotoDesc: "Tangkapan foto untuk semua momen beserta sesi outdoor",
    srvVideoTitle: "Videography Sahaja",
    srvVideoDesc: "Montaj video highlights dan rakaman sinematik penuh",
    srvComboTitle: "Kombo Foto + Video",
    srvComboDesc: "Dokumentasi perkahwinan lengkap pada harga diskaun gabungan",

    // Step 7: Budget
    q3: "Apakah sasaran bajet anda untuk fotografi dan videografi perkahwinan anda?",
    budgetValueTitle: "Fokus Bajet / Nilai",
    budgetValueDesc: "Liputan berkualiti tinggi yang ringkas (Bawah RM 1,200)",
    budgetStandardTitle: "Standard / Seimbang",
    budgetStandardDesc: "Pakej dan kombo yang sangat popular (RM 1,200 - RM 2,500)",
    budgetPremiumTitle: "Premium / Lengkap",
    budgetPremiumDesc: "Tanpa kompromi, liputan penuh sepanjang hari & pilihan drone (RM 2,500+)"
  }
};

function openAiAdvisor() {
  aiCurrentStep = 0;
  aiName = '';
  aiPhone = '';
  aiDate = '';
  aiVenue = '';
  aiSelEvents = [];
  aiSelService = 'photo';
  aiSelBudget = 'standard';
  
  showAiStep(0);
  document.getElementById('aiAdvisorOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeAiAdvisor() {
  document.getElementById('aiAdvisorOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function setAiLanguage(lang) {
  aiLang = lang;
  showAiStep(1);
}

function renderCheckbox(name, value, title, desc) {
  return `
    <label style="display:flex; align-items:center; gap:12px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:10px; padding:12px 16px; cursor:pointer;" class="ai-opt-label">
      <input type="checkbox" name="${name}" value="${value}" style="accent-color:var(--gold); width:18px; height:18px;"/>
      <div>
        <strong style="display:block; font-size:0.85rem; color:#e8e4df;">${title}</strong>
        <span style="font-size:0.7rem; color:var(--muted);">${desc}</span>
      </div>
    </label>
  `;
}

function renderRadio(name, value, title, desc, checked = false) {
  return `
    <label style="display:flex; align-items:center; gap:12px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:10px; padding:12px 16px; cursor:pointer;" class="ai-opt-label">
      <input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''} style="accent-color:var(--gold); width:18px; height:18px;"/>
      <div>
        <strong style="display:block; font-size:0.85rem; color:#e8e4df;">${title}</strong>
        <span style="font-size:0.7rem; color:var(--muted);">${desc}</span>
      </div>
    </label>
  `;
}

function showAiStep(step) {
  aiCurrentStep = step;
  
  const content = document.getElementById('aiAdvisorContent');
  const progressBarWrap = document.getElementById('aiProgressBarWrap');
  const progressBar = document.getElementById('aiProgressBar');
  const stepIndicator = document.getElementById('aiStepIndicator');
  const progressText = document.getElementById('aiProgressText');
  const footerControls = document.getElementById('aiFooterControls');
  const btnPrev = document.getElementById('aiBtnPrev');
  const btnNext = document.getElementById('aiBtnNext');

  // Step 0: Language Select Screen
  if (step === 0) {
    progressBarWrap.style.display = 'none';
    footerControls.style.display = 'none';
    
    document.getElementById('aiHeaderTitle').textContent = "✨ AI Advisor";
    
    content.innerHTML = `
      <p style="font-size:0.85rem; color:var(--text); line-height:1.6; text-align:center; margin-bottom:24px;">
        Choose your preferred language / Pilih bahasa pilihan anda untuk memulakan penasihat pakej AI.
      </p>
      <div style="display:flex; flex-direction:column; gap:12px; max-width:280px; margin:0 auto;">
        <button onclick="setAiLanguage('en')" style="background:linear-gradient(135deg,#1a1208 0%,#2a1e0a 100%); border:1px solid var(--gold); color:var(--gold); border-radius:12px; padding:14px; font-weight:600; font-size:0.9rem; cursor:pointer; font-family:'Inter',sans-serif;">🇬🇧 English</button>
        <button onclick="setAiLanguage('ms')" style="background:linear-gradient(135deg,#1a1208 0%,#2a1e0a 100%); border:1px solid var(--gold); color:var(--gold); border-radius:12px; padding:14px; font-weight:600; font-size:0.9rem; cursor:pointer; font-family:'Inter',sans-serif;">🇲🇾 Bahasa Melayu</button>
      </div>
    `;
    return;
  }

  progressBarWrap.style.display = 'block';
  footerControls.style.display = 'flex';
  progressBar.style.background = 'var(--gold)';

  const tx = AI_LANG[aiLang];
  document.getElementById('aiHeaderEyebrow').textContent = tx.eyebrow;
  document.getElementById('aiHeaderTitle').textContent = tx.title;
  btnPrev.textContent = tx.prevBtn;
  btnNext.textContent = step === 7 ? (aiLang === 'ms' ? 'Analisis Pakej' : 'Analyze & Recommend') : tx.nextBtn;
  btnPrev.style.visibility = step === 1 ? 'hidden' : 'visible';

  // We have steps 1 to 7. Update percentage accordingly
  const pctVal = Math.round((step / 7) * 100);
  progressBar.style.width = pctVal + '%';
  stepIndicator.textContent = `${tx.step} ${step} ${tx.of} 7`;

  if (step === 1) {
    progressText.textContent = aiLang === 'ms' ? 'Nama Anda' : 'Your Name';
    content.innerHTML = `
      <p style="font-size:0.85rem; color:var(--text); line-height:1.6; margin-bottom:20px; text-align:center;">
        ${aiLang === 'ms' ? 'Hai! Saya pembantu AI anda. Siapakah nama anda?' : 'Hello! I am your AI assistant. What is your name?'}
      </p>
      <input type="text" id="aiInputName" value="${aiName}" placeholder="${aiLang === 'ms' ? 'Nama Penuh Anda' : 'Your Full Name'}" style="width:100%; padding:14px; background:#121210; border:1px solid rgba(201,169,110,0.25); border-radius:10px; color:#fff; font-family:'Inter',sans-serif; text-align:center; font-size:1rem;" />
    `;
    setTimeout(() => { const el = document.getElementById('aiInputName'); if(el) el.focus(); }, 100);

  } else if (step === 2) {
    progressText.textContent = aiLang === 'ms' ? 'Nombor WhatsApp' : 'WhatsApp Number';
    content.innerHTML = `
      <p style="font-size:0.85rem; color:var(--text); line-height:1.6; margin-bottom:20px; text-align:center;">
        ${aiLang === 'ms' ? `Selamat berkenalan, <strong>${aiName}</strong>! Apakah nombor WhatsApp anda?` : `Nice to meet you, <strong>${aiName}</strong>! What is your WhatsApp number?`}
      </p>
      <input type="tel" id="aiInputPhone" value="${aiPhone}" placeholder="e.g. 0123456789" style="width:100%; padding:14px; background:#121210; border:1px solid rgba(201,169,110,0.25); border-radius:10px; color:#fff; font-family:'Inter',sans-serif; text-align:center; font-size:1rem;" />
    `;
    setTimeout(() => { const el = document.getElementById('aiInputPhone'); if(el) el.focus(); }, 100);

  } else if (step === 3) {
    progressText.textContent = aiLang === 'ms' ? 'Tarikh Acara' : 'Event Date';
    content.innerHTML = `
      <p style="font-size:0.85rem; color:var(--text); line-height:1.6; margin-bottom:20px; text-align:center;">
        ${aiLang === 'ms' ? 'Bilakah tarikh majlis atau hari bahagia anda?' : 'When is your wedding or event date?'}
      </p>
      <input type="date" id="aiInputDate" value="${aiDate}" style="width:100%; padding:14px; background:#121210; border:1px solid rgba(201,169,110,0.25); border-radius:10px; color:#fff; font-family:'Inter',sans-serif; text-align:center; font-size:1rem; color-scheme:dark;" />
    `;

  } else if (step === 4) {
    progressText.textContent = aiLang === 'ms' ? 'Lokasi / Dewan' : 'Venue / Location';
    content.innerHTML = `
      <p style="font-size:0.85rem; color:var(--text); line-height:1.6; margin-bottom:20px; text-align:center;">
        ${aiLang === 'ms' ? 'Di manakah majlis anda akan diadakan? (Negeri, Bandar atau Nama Dewan)' : 'Where is the location or venue name? (e.g. Kuala Lumpur, Johor, Dewan Perdana)'}
      </p>
      <input type="text" id="aiInputVenue" value="${aiVenue}" placeholder="e.g. Dewan Perdana Felda, KL" style="width:100%; padding:14px; background:#121210; border:1px solid rgba(201,169,110,0.25); border-radius:10px; color:#fff; font-family:'Inter',sans-serif; text-align:center; font-size:1rem;" />
    `;
    setTimeout(() => { const el = document.getElementById('aiInputVenue'); if(el) el.focus(); }, 100);

  } else if (step === 5) {
    progressText.textContent = aiLang === 'ms' ? 'Pilih Acara' : 'Select Events';
    content.innerHTML = `
      <p style="font-size:0.85rem; color:var(--text); line-height:1.6; margin-bottom:20px;">${tx.q1}</p>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${renderCheckbox('aiEvent', 'nikah', tx.evtNikahTitle, tx.evtNikahDesc)}
        ${renderCheckbox('aiEvent', 'sanding', tx.evtSandingTitle, tx.evtSandingDesc)}
        ${renderCheckbox('aiEvent', 'tandang', tx.evtTandangTitle, tx.evtTandangDesc)}
        ${renderCheckbox('aiEvent', 'tunang', tx.evtTunangTitle, tx.evtTunangDesc)}
        ${renderCheckbox('aiEvent', 'prewed', tx.evtPrewedTitle, tx.evtPrewedDesc)}
        ${renderCheckbox('aiEvent', 'birthday', tx.evtBirthdayTitle, tx.evtBirthdayDesc)}
      </div>
    `;
    aiSelEvents.forEach(val => {
      const input = content.querySelector(`input[value="${val}"]`);
      if (input) input.checked = true;
    });

  } else if (step === 6) {
    progressText.textContent = aiLang === 'ms' ? 'Pilih Perkhidmatan' : 'Select Services';
    content.innerHTML = `
      <p style="font-size:0.85rem; color:var(--text); line-height:1.6; margin-bottom:20px;">${tx.q2}</p>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${renderRadio('aiService', 'photo', tx.srvPhotoTitle, tx.srvPhotoDesc, aiSelService === 'photo')}
        ${renderRadio('aiService', 'video', tx.srvVideoTitle, tx.srvVideoDesc, aiSelService === 'video')}
        ${renderRadio('aiService', 'combo', tx.srvComboTitle, tx.srvComboDesc, aiSelService === 'combo')}
      </div>
    `;

  } else if (step === 7) {
    progressText.textContent = aiLang === 'ms' ? 'Tentukan Bajet' : 'Define Budget';
    content.innerHTML = `
      <p style="font-size:0.85rem; color:var(--text); line-height:1.6; margin-bottom:20px;">${tx.q3}</p>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${renderRadio('aiBudget', 'budget', tx.budgetValueTitle, tx.budgetValueDesc, aiSelBudget === 'budget')}
        ${renderRadio('aiBudget', 'standard', tx.budgetStandardTitle, tx.budgetStandardDesc, aiSelBudget === 'standard')}
        ${renderRadio('aiBudget', 'premium', tx.budgetPremiumTitle, tx.budgetPremiumDesc, aiSelBudget === 'premium')}
      </div>
    `;

  } else if (step === 8) {
    progressBarWrap.style.display = 'block';
    progressBar.style.width = '100%';
    progressBar.style.background = '#4ade80';
    stepIndicator.textContent = tx.suggestionHeader;
    progressText.textContent = tx.suggestionSub;
    btnNext.textContent = tx.finishBtn;
    btnNext.onclick = () => closeAiAdvisor();
  }
}

function nextAiStep() {
  if (aiCurrentStep === 1) {
    const input = document.getElementById('aiInputName');
    if (!input || !input.value.trim()) {
      alert(aiLang === 'ms' ? 'Sila masukkan nama anda.' : 'Please enter your name.');
      return;
    }
    aiName = input.value.trim();
  } 
  else if (aiCurrentStep === 2) {
    const input = document.getElementById('aiInputPhone');
    if (!input || !input.value.trim()) {
      alert(aiLang === 'ms' ? 'Sila masukkan nombor WhatsApp anda.' : 'Please enter your WhatsApp number.');
      return;
    }
    aiPhone = input.value.trim();
  }
  else if (aiCurrentStep === 3) {
    const input = document.getElementById('aiInputDate');
    if (!input || !input.value) {
      alert(aiLang === 'ms' ? 'Sila pilih tarikh acara.' : 'Please select your event date.');
      return;
    }
    aiDate = input.value;
  }
  else if (aiCurrentStep === 4) {
    const input = document.getElementById('aiInputVenue');
    if (!input || !input.value.trim()) {
      alert(aiLang === 'ms' ? 'Sila masukkan lokasi dewan/majlis.' : 'Please enter your venue or location.');
      return;
    }
    aiVenue = input.value.trim();
  }
  else if (aiCurrentStep === 5) {
    const checked = Array.from(document.querySelectorAll('input[name="aiEvent"]:checked')).map(c => c.value);
    if (checked.length === 0) {
      alert(AI_LANG[aiLang].alertNoSelect);
      return;
    }
    aiSelEvents = checked;
  } 
  else if (aiCurrentStep === 6) {
    aiSelService = document.querySelector('input[name="aiService"]:checked').value;
  } 
  else if (aiCurrentStep === 7) {
    aiSelBudget = document.querySelector('input[name="aiBudget"]:checked').value;
    calculateAiRecommendation();
    return;
  }
  showAiStep(aiCurrentStep + 1);
}

function prevAiStep() {
  showAiStep(aiCurrentStep - 1);
}

function calculateAiRecommendation() {
  let photoRec = null;
  let videoRec = null;
  let advice = '';

  const photos = packagesDataCache.photography || [];
  const videos = packagesDataCache.videography || [];
  const tx = AI_LANG[aiLang];

  // 1. Photographic Matches
  if (aiSelService === 'photo' || aiSelService === 'combo') {
    if (aiSelEvents.length === 1 && aiSelEvents.includes('prewed')) {
      photoRec = photos.find(p => p.id === 'pkg4') || { name: 'Pre Wed Photography', price: 550, id: 'pkg4' };
      advice = aiLang === 'ms' ? 'Sesi Pre-Wedding 2-jam kami adalah pilihan paling sesuai untuk sesi outdoor pasangan yang kasual.' : 'Since you only need a couple session, our 2-hour Pre-Wedding option is ideal.';
    }
    else if (aiSelEvents.length === 1 && aiSelEvents.includes('birthday')) {
      photoRec = { id: 'pkg1', name: aiLang === 'ms' ? 'Pakej Single Event (Aqiqah/Birthday)' : 'Single Event Package (Aqiqah/Birthday)', price: 900, features: ['Unlimited pictures, fully edited', 'Free outdoor session', 'Cover 3-4 hours'] };
      advice = aiLang === 'ms' ? 'Untuk perjumpaan keluarga, hari lahir atau cukur jambul, variasi Single Event kami memberikan liputan 3-4 jam yang komplit.' : 'For family events, birthdays or cukur jambul, our Single Event variant provides a complete 3-4 hours of coverage.';
    }
    else if (aiSelEvents.length === 1) {
      const ev = aiSelEvents[0];
      const tnsNames = { nikah: 'Nikah', sanding: 'Sanding', tunang: 'Tunang' };
      const eventName = tnsNames[ev] || 'Nikah';
      const variantPrice = ev === 'nikah' ? 700 : 900;
      photoRec = { id: 'pkg1', name: `Single Event — ${eventName}`, price: variantPrice, features: ['Unlimited pictures, fully edited', 'Free outdoor session', 'Cover 3-4 hours'] };
      advice = aiLang === 'ms' ? `Bagi satu acara sahaja (${eventName}), memilih variasi ini di dalam Pakej Single adalah penyelesaian paling jimat.` : `For a single event (${eventName}), booking this variant on the Single Package is the most cost-effective solution.`;
    }
    else if (aiSelEvents.length === 2 && aiSelEvents.includes('nikah') && aiSelEvents.includes('sanding')) {
      photoRec = photos.find(p => p.id === 'pkg2') || { name: 'Nikah & Sanding Photography', price: 1450, id: 'pkg2' };
      advice = aiLang === 'ms' ? 'Oleh kerana anda mengadakan majlis Akad Nikah & Resepsi Bersanding, pakej kombo khas ini akan menjimatkan sehingga RM 150 berbanding tempahan secara berasingan.' : 'Since you are hosting both Nikah and Sanding, booking the combined Nikah & Sanding photography package saves you RM 150 compared to booking them separately.';
    }
    else if (aiSelEvents.length === 3 && aiSelEvents.includes('nikah') && aiSelEvents.includes('sanding') && aiSelEvents.includes('tunang')) {
      photoRec = photos.find(p => p.id === 'pkg5') || { name: 'Tunang + Nikah + Sanding Combo', price: 2000, id: 'pkg5' };
      advice = aiLang === 'ms' ? 'Bagi liputan lengkap 3 acara perkahwinan (Tunang, Nikah & Sanding), pakej ini menawarkan penjimatan maksimum sebanyak RM 500 dengan liputan hari penuh.' : 'For all 3 events, the Tunang + Nikah + Sanding package offers maximum value, saving you RM 500 in total with full day coverages.';
    }
    else {
      photoRec = photos.find(p => p.id === 'pkg3') || { name: 'TRIO E (3 Events)', price: 2400, id: 'pkg3' };
      advice = aiLang === 'ms' ? 'Pakej TRIO E kami merangkumi sehingga tiga tarikh acara yang berbeza mengikut perancangan fleksibel anda.' : 'Our TRIO E multi-event package covers up to three arbitrary wedding sessions on separate dates.';
    }
  }

  // 2. Videographic Matches
  if (aiSelService === 'video' || aiSelService === 'combo') {
    if (aiSelEvents.includes('nikah') && aiSelEvents.length === 1) {
      videoRec = videos.find(v => v.id === 'vid1') || { name: 'Nikah Video', price: 950, id: 'vid1' };
    }
    else if (aiSelEvents.includes('nikah') && aiSelEvents.includes('sanding') && aiSelEvents.length <= 2) {
      videoRec = videos.find(v => v.id === 'vid2') || { name: 'Nikah + Sanding Video', price: 1500, id: 'vid2' };
    }
    else {
      videoRec = videos.find(v => v.id === 'vid3') || { name: 'Full Package Video (3 Events)', price: 2200, id: 'vid3' };
    }
  }

  // Render Results HTML
  const content = document.getElementById('aiAdvisorContent');
  let resultHtml = `
    <div style="text-align:center; padding:10px 0 20px;">
      <span style="font-size:2.5rem; display:block; margin-bottom:10px;">✨</span>
      <h4 style="font-family:'Cormorant Garamond',serif; font-size:1.4rem; color:var(--gold); font-weight:300; margin:0 0 6px;">${tx.suggestionHeader}</h4>
      <p style="font-size:0.75rem; color:var(--muted); margin:0;">${tx.suggestionSub}</p>
    </div>
    <div style="background:rgba(201,169,110,0.05); border:1px solid rgba(201,169,110,0.25); border-radius:15px; padding:20px; margin-bottom:24px;">
  `;
  
  let totalPrice = 0;
  let pkgNameCombined = '';

  if (photoRec) {
    resultHtml += `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:${videoRec ? '1px solid rgba(255,255,255,0.06)' : 'none'}; padding-bottom:${videoRec ? '12px' : '0'}; margin-bottom:${videoRec ? '12px' : '0'};">
        <div>
          <span style="font-size:0.6rem; color:var(--gold); text-transform:uppercase; letter-spacing:1px; display:block;">📸 ${aiLang === 'ms' ? 'Cadangan Fotografi' : 'Photography Suggested'}</span>
          <strong style="font-size:0.9rem; color:#e8e4df; font-family:'Inter',sans-serif;">${photoRec.name}</strong>
        </div>
        <strong style="color:var(--gold); font-size:1.1rem;">RM ${photoRec.price}</strong>
      </div>
    `;
    totalPrice += photoRec.price;
    pkgNameCombined += photoRec.name;
  }

  if (videoRec) {
    resultHtml += `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span style="font-size:0.6rem; color:var(--gold); text-transform:uppercase; letter-spacing:1px; display:block;">🎬 ${aiLang === 'ms' ? 'Cadangan Videografi' : 'Videography Suggested'}</span>
          <strong style="font-size:0.9rem; color:#e8e4df; font-family:'Inter',sans-serif;">${videoRec.name}</strong>
        </div>
        <strong style="color:var(--gold); font-size:1.1rem;">RM ${videoRec.price}</strong>
      </div>
    `;
    totalPrice += videoRec.price;
    pkgNameCombined += (pkgNameCombined ? ' + ' : '') + videoRec.name;
  }

  // Combo discount check
  if (aiSelService === 'combo' && photoRec && videoRec) {
    const comboDiscount = parseInt(localStorage.getItem('combo_bundle_discount') || '150');
    totalPrice -= comboDiscount;
    resultHtml += `
      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px dashed rgba(201,169,110,0.3); padding-top:12px; margin-top:12px;">
        <span style="font-size:0.75rem; color:#4ade80;">${tx.comboDiscount}</span>
        <strong style="color:#4ade80; font-size:0.85rem;">- RM ${comboDiscount}</strong>
      </div>
    `;
  }

  resultHtml += `
    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.1); padding-top:16px; margin-top:16px;">
      <strong style="font-size:0.85rem; color:#e8e4df; letter-spacing:1px; text-transform:uppercase;">${tx.estimateTotal}</strong>
      <strong style="color:var(--gold); font-size:1.4rem; font-family:'Cormorant Garamond',serif;">RM ${totalPrice}</strong>
    </div>
  </div>
  `;

  // Lead Profile Summary
  resultHtml += `
    <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:14px; margin-bottom:24px; font-size:0.75rem; display:grid; grid-template-columns:1fr 1fr; gap:8px;">
      <div><span style="color:var(--muted);">${aiLang==='ms'?'Klien':'Client'}:</span> <strong style="color:#e8e4df;">${aiName}</strong></div>
      <div><span style="color:var(--muted);">${aiLang==='ms'?'WhatsApp':'Phone'}:</span> <strong style="color:#e8e4df;">${aiPhone}</strong></div>
      <div><span style="color:var(--muted);">${aiLang==='ms'?'Tarikh':'Date'}:</span> <strong style="color:#e8e4df;">${aiDate}</strong></div>
      <div><span style="color:var(--muted);">${aiLang==='ms'?'Lokasi':'Venue'}:</span> <strong style="color:#e8e4df;">${aiVenue}</strong></div>
    </div>
  `;

  // Action Buttons
  const packageToBook = photoRec ? photoRec.id : (videoRec ? videoRec.id : '');
  resultHtml += `
    <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:24px;">
      <button onclick="aiAdvisorBook('${packageToBook}', ${totalPrice})" style="width:100%; background:var(--gold); border:none; color:#000; font-weight:700; font-family:'Inter',sans-serif; font-size:0.8rem; text-transform:uppercase; letter-spacing:1px; padding:14px 0; border-radius:10px; cursor:pointer;">
        ${tx.bookBtn}
      </button>
      <button onclick="sendAiWhatsApp('${pkgNameCombined.replace(/'/g, "\\'")}', ${totalPrice})" style="width:100%; background:#25d366; border:none; color:#fff; font-weight:700; font-family:'Inter',sans-serif; font-size:0.8rem; text-transform:uppercase; letter-spacing:1px; padding:14px 0; border-radius:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
        ${tx.waBtn}
      </button>
    </div>
  `;

  // Advice text box
  resultHtml += `
    <div style="font-size:0.78rem; color:var(--muted); line-height:1.6; background:rgba(255,255,255,0.02); padding:14px; border-radius:10px;">
      <strong style="color:#e8e4df; display:block; margin-bottom:4px;">${tx.adviceTitle}</strong>
      ${advice} ${aiLang === 'ms' 
        ? 'Semua fail foto/video akan dihantar dalam format digital resolusi tinggi, diedit secara profesional dan sedia untuk dicetak atau dikongsi di media sosial.' 
        : 'All capture deliverables will be sent in high-resolution digital format, with professional colors and details optimized for printing and online sharing.'}
    </div>
  `;

  content.innerHTML = resultHtml;
  showAiStep(8);
}

let aiConverted = false;
let aiExitSurveyShown = false;

function closeAiAdvisor() {
  // If they are on Step 0 (language select), already converted, or survey was shown: close directly
  if (aiCurrentStep === 0 || aiConverted || aiExitSurveyShown) {
    closeAiAdvisorDirectly();
    return;
  }
  
  // Show exit survey
  aiExitSurveyShown = true;
  triggerExitSurvey();
}

function closeAiAdvisorDirectly() {
  document.getElementById('aiAdvisorOverlay').classList.remove('open');
  document.body.style.overflow = '';
  if (!aiConverted) {
    sendAiAdvisorSessionSummary("Just closed the widget");
  }
}

function triggerExitSurvey() {
  const content = document.getElementById('aiAdvisorContent');
  const progressBarWrap = document.getElementById('aiProgressBarWrap');
  const footerControls = document.getElementById('aiFooterControls');
  
  progressBarWrap.style.display = 'none';
  footerControls.style.display = 'none';
  
  document.getElementById('aiHeaderTitle').textContent = aiLang === 'ms' ? 'Maklum Balas / Feedback' : 'Feedback Survey';

  if (aiLang === 'ms') {
    content.innerHTML = `
      <p style="font-size:0.85rem; color:var(--text); line-height:1.6; text-align:center; margin-bottom:20px;">
        Sebelum anda pergi, boleh kami tahu mengapa anda menutup penasihat pakej ini?
      </p>
      <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">
        <button onclick="submitExitFeedback(1)" onmouseover="this.style.background='rgba(201,169,110,0.1)';this.style.borderColor='var(--gold)';" onmouseout="this.style.background='rgba(255,255,255,0.02)';this.style.borderColor='rgba(255,255,255,0.08)';" style="text-align:left; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); padding:12px 16px; border-radius:10px; color:#e8e4df; cursor:pointer; font-size:0.8rem; font-family:'Inter',sans-serif; transition:all 0.2s ease;">💰 Harga terlalu tinggi untuk bajet saya</button>
        <button onclick="submitExitFeedback(2)" onmouseover="this.style.background='rgba(201,169,110,0.1)';this.style.borderColor='var(--gold)';" onmouseout="this.style.background='rgba(255,255,255,0.02)';this.style.borderColor='rgba(255,255,255,0.08)';" style="text-align:left; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); padding:12px 16px; border-radius:10px; color:#e8e4df; cursor:pointer; font-size:0.8rem; font-family:'Inter',sans-serif; transition:all 0.2s ease;">📅 Tarikh majlis belum tetap / muktamad</button>
        <button onclick="submitExitFeedback(3)" onmouseover="this.style.background='rgba(201,169,110,0.1)';this.style.borderColor='var(--gold)';" onmouseout="this.style.background='rgba(255,255,255,0.02)';this.style.borderColor='rgba(255,255,255,0.08)';" style="text-align:left; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); padding:12px 16px; border-radius:10px; color:#e8e4df; cursor:pointer; font-size:0.8rem; font-family:'Inter',sans-serif; transition:all 0.2s ease;">❌ Tiada pakej yang sesuai dengan kehendak saya</button>
        <button onclick="submitExitFeedback(4)" onmouseover="this.style.background='rgba(201,169,110,0.1)';this.style.borderColor='var(--gold)';" onmouseout="this.style.background='rgba(255,255,255,0.02)';this.style.borderColor='rgba(255,255,255,0.08)';" style="text-align:left; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); padding:12px 16px; border-radius:10px; color:#e8e4df; cursor:pointer; font-size:0.8rem; font-family:'Inter',sans-serif; transition:all 0.2s ease;">🔍 Saja tengok-tengok / Survey sahaja</button>
      </div>
      <div style="text-align:center;">
        <button onclick="closeAiAdvisorDirectly()" style="background:transparent; border:none; color:var(--muted); font-size:0.75rem; text-decoration:underline; cursor:pointer; font-family:'Inter',sans-serif;">Tutup Sahaja</button>
      </div>
    `;
  } else {
    content.innerHTML = `
      <p style="font-size:0.85rem; color:var(--text); line-height:1.6; text-align:center; margin-bottom:20px;">
        Before you go, could you let us know why you are closing the package advisor?
      </p>
      <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">
        <button onclick="submitExitFeedback(1)" onmouseover="this.style.background='rgba(201,169,110,0.1)';this.style.borderColor='var(--gold)';" onmouseout="this.style.background='rgba(255,255,255,0.02)';this.style.borderColor='rgba(255,255,255,0.08)';" style="text-align:left; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); padding:12px 16px; border-radius:10px; color:#e8e4df; cursor:pointer; font-size:0.8rem; font-family:'Inter',sans-serif; transition:all 0.2s ease;">💰 Prices are above my target budget</button>
        <button onclick="submitExitFeedback(2)" onmouseover="this.style.background='rgba(201,169,110,0.1)';this.style.borderColor='var(--gold)';" onmouseout="this.style.background='rgba(255,255,255,0.02)';this.style.borderColor='rgba(255,255,255,0.08)';" style="text-align:left; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); padding:12px 16px; border-radius:10px; color:#e8e4df; cursor:pointer; font-size:0.8rem; font-family:'Inter',sans-serif; transition:all 0.2s ease;">📅 My wedding date is not finalized yet</button>
        <button onclick="submitExitFeedback(3)" onmouseover="this.style.background='rgba(201,169,110,0.1)';this.style.borderColor='var(--gold)';" onmouseout="this.style.background='rgba(255,255,255,0.02)';this.style.borderColor='rgba(255,255,255,0.08)';" style="text-align:left; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); padding:12px 16px; border-radius:10px; color:#e8e4df; cursor:pointer; font-size:0.8rem; font-family:'Inter',sans-serif; transition:all 0.2s ease;">❌ I couldn't find the package details I needed</button>
        <button onclick="submitExitFeedback(4)" onmouseover="this.style.background='rgba(201,169,110,0.1)';this.style.borderColor='var(--gold)';" onmouseout="this.style.background='rgba(255,255,255,0.02)';this.style.borderColor='rgba(255,255,255,0.08)';" style="text-align:left; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); padding:12px 16px; border-radius:10px; color:#e8e4df; cursor:pointer; font-size:0.8rem; font-family:'Inter',sans-serif; transition:all 0.2s ease;">🔍 Just browsing / Surveying</button>
      </div>
      <div style="text-align:center;">
        <button onclick="closeAiAdvisorDirectly()" style="background:transparent; border:none; color:var(--muted); font-size:0.75rem; text-decoration:underline; cursor:pointer; font-family:'Inter',sans-serif;">Just Close</button>
      </div>
    `;
  }
}

function submitExitFeedback(option) {
  const reasonsEn = {
    1: "Prices are above target budget",
    2: "Wedding date is not finalized yet",
    3: "Couldn't find the package details needed",
    4: "Just browsing / surveying"
  };
  const reasonsMs = {
    1: "Harga terlalu tinggi untuk bajet saya",
    2: "Tarikh majlis belum tetap / muktamad",
    3: "Tiada pakej yang sesuai dengan kehendak saya",
    4: "Saja tengok-tengok / Survey sahaja"
  };
  
  const chosenReason = aiLang === 'ms' ? reasonsMs[option] : reasonsEn[option];
  sendAiAdvisorSessionSummary(chosenReason);

  const content = document.getElementById('aiAdvisorContent');
  let replyHtml = '';

  if (option === 1) {
    replyHtml = aiLang === 'ms' 
      ? `
        <div style="text-align:center; padding:10px 0;">
          <span style="font-size:2rem; display:block; margin-bottom:12px;">💡</span>
          <strong style="color:var(--gold); display:block; margin-bottom:8px; font-size:1.1rem; font-family:'Inter',sans-serif;">Hubungi Kami untuk Bajet Khas!</strong>
          <p style="font-size:0.8rem; color:var(--text); line-height:1.6; margin-bottom:20px; font-family:'Inter',sans-serif;">
            Kami faham setiap perkahwinan mempunyai bajet yang berbeza. Kami boleh reka (customize) pakej khas mengikut kemampuan anda!
          </p>
          <button onclick="window.open('https://wa.me/601187381984?text=Hai Nizar! Saya berminat untuk dapatkan sebut harga custom mengikut bajet saya.', '_blank')" style="background:#25d366; border:none; color:#fff; font-weight:700; font-family:'Inter',sans-serif; font-size:0.8rem; text-transform:uppercase; letter-spacing:1px; padding:12px 20px; border-radius:10px; cursor:pointer; display:inline-flex; align-items:center; gap:8px;">
            💬 Runding di WhatsApp
          </button>
        </div>
      `
      : `
        <div style="text-align:center; padding:10px 0;">
          <span style="font-size:2rem; display:block; margin-bottom:12px;">💡</span>
          <strong style="color:var(--gold); display:block; margin-bottom:8px; font-size:1.1rem; font-family:'Inter',sans-serif;">Custom Budget Pricing!</strong>
          <p style="font-size:0.8rem; color:var(--text); line-height:1.6; margin-bottom:20px; font-family:'Inter',sans-serif;">
            We understand budgets differ! Feel free to chat with us. We can build a bespoke custom package matching your exact limit.
          </p>
          <button onclick="window.open('https://wa.me/601187381984?text=Hi Nizar! I would love to request a custom photography package based on my budget.', '_blank')" style="background:#25d366; border:none; color:#fff; font-weight:700; font-family:'Inter',sans-serif; font-size:0.8rem; text-transform:uppercase; letter-spacing:1px; padding:12px 20px; border-radius:10px; cursor:pointer; display:inline-flex; align-items:center; gap:8px;">
            💬 Custom Quote via WhatsApp
          </button>
        </div>
      `;
  } else if (option === 2) {
    replyHtml = aiLang === 'ms'
      ? `
        <div style="text-align:center; padding:10px 0;">
          <span style="font-size:2rem; display:block; margin-bottom:12px;">📅</span>
          <strong style="color:var(--gold); display:block; margin-bottom:8px; font-size:1.1rem; font-family:'Inter',sans-serif;">Kami Sentiasa Bersedia!</strong>
          <p style="font-size:0.8rem; color:var(--text); line-height:1.6; margin-bottom:20px; font-family:'Inter',sans-serif;">
            Tiada masalah! Anda boleh tanda (bookmark) halaman ini dan kembali apabila tarikh perkahwinan anda telah ditetapkan.
          </p>
        </div>
      `
      : `
        <div style="text-align:center; padding:10px 0;">
          <span style="font-size:2rem; display:block; margin-bottom:12px;">📅</span>
          <strong style="color:var(--gold); display:block; margin-bottom:8px; font-size:1.1rem; font-family:'Inter',sans-serif;">We Will Be Ready!</strong>
          <p style="font-size:0.8rem; color:var(--text); line-height:1.6; margin-bottom:20px; font-family:'Inter',sans-serif;">
            No worries at all! Bookmark this website and come back when you have finalized your event date. We look forward to capturing your wedding!
          </p>
        </div>
      `;
  } else if (option === 3) {
    replyHtml = aiLang === 'ms'
      ? `
        <div style="text-align:center; padding:10px 0;">
          <span style="font-size:2rem; display:block; margin-bottom:12px;">🛠️</span>
          <strong style="color:var(--gold); display:block; margin-bottom:8px; font-size:1.1rem; font-family:'Inter',sans-serif;">Dapatkan Pakej Custom!</strong>
          <p style="font-size:0.8rem; color:var(--text); line-height:1.6; margin-bottom:20px; font-family:'Inter',sans-serif;">
            Kami menawarkan khidmat custom sepenuhnya. Hubungi kami di WhatsApp dan nyatakan senarai acara anda untuk kami sediakan sebut harga khas!
          </p>
          <button onclick="window.open('https://wa.me/601187381984?text=Hai Nizar! Saya berminat untuk dapatkan sebut harga custom mengikut senarai acara saya.', '_blank')" style="background:#25d366; border:none; color:#fff; font-weight:700; font-family:'Inter',sans-serif; font-size:0.8rem; text-transform:uppercase; letter-spacing:1px; padding:12px 20px; border-radius:10px; cursor:pointer; display:inline-flex; align-items:center; gap:8px;">
            💬 WhatsApp Pakej Custom
          </button>
        </div>
      `
      : `
        <div style="text-align:center; padding:10px 0;">
          <span style="font-size:2rem; display:block; margin-bottom:12px;">🛠️</span>
          <strong style="color:var(--gold); display:block; margin-bottom:8px; font-size:1.1rem; font-family:'Inter',sans-serif;">Let's Build a Custom Package!</strong>
          <p style="font-size:0.8rem; color:var(--text); line-height:1.6; margin-bottom:20px; font-family:'Inter',sans-serif;">
            We offer fully custom event photography/videography lists. Message us on WhatsApp with your exact requirements for a direct quote.
          </p>
          <button onclick="window.open('https://wa.me/601187381984?text=Hi Nizar! I would love to discuss custom event requirements for my wedding.', '_blank')" style="background:#25d366; border:none; color:#fff; font-weight:700; font-family:'Inter',sans-serif; font-size:0.8rem; text-transform:uppercase; letter-spacing:1px; padding:12px 20px; border-radius:10px; cursor:pointer; display:inline-flex; align-items:center; gap:8px;">
            💬 WhatsApp Custom Requirements
          </button>
        </div>
      `;
  } else {
    replyHtml = aiLang === 'ms'
      ? `
        <div style="text-align:center; padding:10px 0;">
          <span style="font-size:2rem; display:block; margin-bottom:12px;">🌸</span>
          <strong style="color:var(--gold); display:block; margin-bottom:8px; font-size:1.1rem; font-family:'Inter',sans-serif;">Terima Kasih Melawat Kami!</strong>
          <p style="font-size:0.8rem; color:var(--text); line-height:1.6; margin-bottom:20px; font-family:'Inter',sans-serif;">
            Selamat melayari galeri portfolio kami. Jangan ragu-ragu untuk menghubungi kami jika ada sebarang pertanyaan!
          </p>
        </div>
      `
      : `
        <div style="text-align:center; padding:10px 0;">
          <span style="font-size:2rem; display:block; margin-bottom:12px;">🌸</span>
          <strong style="color:var(--gold); display:block; margin-bottom:8px; font-size:1.1rem; font-family:'Inter',sans-serif;">Thank You for Visiting!</strong>
          <p style="font-size:0.8rem; color:var(--text); line-height:1.6; margin-bottom:20px; font-family:'Inter',sans-serif;">
            Enjoy browsing through our wedding and event photography galleries! Let us know if you need any help.
          </p>
        </div>
      `;
  }

  replyHtml += `
    <div style="margin-top:28px; border-top:1px solid rgba(255,255,255,0.08); padding-top:20px; text-align:center;">
      <button onclick="closeAiAdvisorDirectly()" class="btn btn-solid" style="padding:10px 28px; font-family:'Inter',sans-serif;">
        ${aiLang === 'ms' ? 'Tutup Penasihat' : 'Close Advisor'}
      </button>
    </div>
  `;

  content.innerHTML = replyHtml;
}

let aiLeadSent = false;

async function sendAiAdvisorSessionSummary(exitReason = null) {
  if (aiLeadSent) return;
  if (!aiName) return;

  const key = (window.STUDIO_CONFIG || {}).web3forms_key || '6be870cf-b9ec-42bd-a26f-8d5f09067bf3';
  if (!key) return;

  const eventList = aiSelEvents.map(e => e.toUpperCase()).join(', ') || 'None selected';
  
  // Get recommended package details if they reached recommendation step
  let pkgName = 'None (Exited early)';
  let estPrice = 'N/A';
  if (aiCurrentStep >= 7) {
    const photoRec = getPhotoRecommendation();
    const videoRec = getVideoRecommendation();
    let names = [];
    if (photoRec) names.push(photoRec.title);
    if (videoRec) names.push(videoRec.title);
    pkgName = names.join(' + ') || 'Custom List';
    
    let price = 0;
    if (photoRec) price += photoRec.base;
    if (videoRec) price += videoRec.base;
    if (photoRec && videoRec) {
      const comboDisc = parseInt(localStorage.getItem('combo_bundle_discount') || '150');
      price -= comboDisc;
    }
    estPrice = 'RM ' + price;
  }

  const subject = exitReason 
    ? `⚠️ [AI Exit] ${aiName} — ${exitReason}`
    : `✨ [AI Lead] ${aiName} — ${pkgName}`;

  const summaryNotes = `Service: ${aiSelService.toUpperCase()} | Budget: ${aiSelBudget.toUpperCase()}\nEvents: ${eventList}\nRecommended: ${pkgName} (${estPrice})\nStatus: ${exitReason ? 'Exited early: ' + exitReason : 'Converted / Booked'}`;

  // 1. Submit email via Web3Forms (single unified email)
  try {
    await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        access_key: key,
        subject: subject,
        from_name: 'WeddingClicks AI Advisor',
        name: aiName,
        phone: aiPhone || 'Not provided',
        email: 'Not provided (AI Advisor)',
        date: aiDate || 'N/A',
        venue: aiVenue || 'N/A',
        events: eventList,
        service: aiSelService.toUpperCase(),
        budget_tier: aiSelBudget.toUpperCase(),
        recommended_package: pkgName,
        estimated_price: estPrice,
        exit_reason: exitReason || 'None (Completed)',
        language_selected: aiLang.toUpperCase()
      })
    });
    console.log('AI Session summary email sent.');
  } catch (err) {
    console.error('Failed to send AI session summary email:', err);
  }

  // 2. Submit to Netlify Form to display in Admin Dashboard
  const aiRef = 'AI-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  fetch('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      'form-name':   'booking-enquiry',
      'ref':         aiRef,
      'client_name': aiName,
      'phone':       aiPhone || 'Not provided',
      'email':       'Not provided (AI Chat)',
      'package':     `AI Advisor: ${pkgName}`,
      'price':       estPrice,
      'date':        aiDate || 'N/A',
      'notes':       summaryNotes,
    })
  }).catch(() => {});

  aiLeadSent = true;
}

function aiAdvisorBook(pkgId, price) {
  aiConverted = true;
  sendAiAdvisorSessionSummary(null);
  closeAiAdvisorDirectly();
  
  let pkgName = '';
  if (pkgId === 'pkg1') {
    const ev = aiSelEvents[0] || 'nikah';
    const select = document.getElementById('tnsSelect');
    if (select) {
      const val = ev === 'nikah' ? 'Nikah|700' : (ev === 'tunang' ? 'Tunang|600' : 'Sanding|900');
      select.value = val;
      updateTNS();
    }
    pkgName = 'Single Event Photography';
    price = ev === 'nikah' ? 700 : (ev === 'tunang' ? 600 : 900);
  } else if (pkgId) {
    const photos = packagesDataCache.photography || [];
    const videos = packagesDataCache.videography || [];
    const pkg = photos.find(p => p.id === pkgId) || videos.find(v => v.id === pkgId);
    if (pkg) {
      pkgName = pkg.name || pkg.variants?.[0]?.name;
    }
  }

  if(!pkgName) pkgName = 'Custom AI Package';

  openBookingModal(pkgName, 'RM ' + price);
  
  if (aiDate) {
    selectedDates = [aiDate];
    selectedDate = aiDate;
  }

  const nameParts = aiName.trim().split(/\s+/);
  document.getElementById('bFirstName').value = nameParts[0] || '';
  document.getElementById('bLastName').value = nameParts.slice(1).join(' ') || '';
  document.getElementById('bPhone').value = aiPhone || '';
  document.getElementById('bLocation').value = aiVenue || '';
  
  onLocationInput();

  const eventList = aiSelEvents.map(e => e.toUpperCase()).join(', ');
  document.getElementById('bNotes').value = aiLang === 'ms' 
    ? `[Penasihat AI - Butiran Klien]\nAcara: ${eventList}\nTarikh Pilihan: ${aiDate}\nLokasi: ${aiVenue}\nBajet Pilihan: ${aiSelBudget.toUpperCase()}`
    : `[AI Advisor Lead Detail]\nEvents: ${eventList}\nPreferred Date: ${aiDate}\nVenue/Location: ${aiVenue}\nBudget Tier: ${aiSelBudget.toUpperCase()}`;

  goToStep2(false);
}

function sendAiWhatsApp(pkgName, price) {
  aiConverted = true;
  sendAiAdvisorSessionSummary(null);
  const targetPhone = '601187381984'; // WeddingClicks official WhatsApp number
  const eventList = aiSelEvents.map(e => e.toUpperCase()).join(', ');
  
  let msg = '';
  if (aiLang === 'ms') {
    msg = `Hai Nizar Naseer Studio! Saya baru menggunakan Penasihat Pakej AI di laman web anda. Berikut adalah butiran perancangan saya:

👤 Nama: ${aiName}
📞 WhatsApp: ${aiPhone}
📅 Tarikh Acara: ${aiDate}
📍 Lokasi/Dewan: ${aiVenue}
🎉 Acara: ${eventList}
🛠️ Perkhidmatan: ${aiSelService.toUpperCase()}
💰 Bajet: ${aiSelBudget.toUpperCase()}

✨ CADANGAN PAKEJ AI:
Pakej: ${pkgName}
Jumlah Harga: RM ${price}

Boleh kita berbincang lebih lanjut untuk pengesahan slot saya? Terima kasih!`;
  } else {
    msg = `Hi Nizar Naseer Studio! I just used your AI Package Advisor. Here are my event details:

👤 Name: ${aiName}
📞 Phone: ${aiPhone}
📅 Event Date: ${aiDate}
📍 Location/Venue: ${aiVenue}
🎉 Events: ${eventList}
🛠️ Service: ${aiSelService.toUpperCase()}
💰 Budget Level: ${aiSelBudget.toUpperCase()}

✨ RECOMMENDED AI PACKAGE:
Package: ${pkgName}
Estimated Price: RM ${price}

Would love to discuss further and secure my date slot! Thank you!`;
  }

  const encoded = encodeURIComponent(msg);
  window.open(`https://wa.me/${targetPhone}?text=${encoded}`, '_blank');
}


