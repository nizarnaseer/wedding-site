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


/* ─── PER-PACKAGE DATE CONFIG ─── */
// maxDates: how many separate days the client can pick for this package
const PKG_DATE_CONFIG = {
  'Nikah / Sanding / Tandang':   { maxDates: 1 },
  'Nikah + Sanding / Tandang':   { maxDates: 2 },
  'Nikah + Sanding + Tandang':   { maxDates: 3 },
  'Birthday Event':              { maxDates: 1 },
  'Portrait Session':            { maxDates: 1 },
};

/* ─── DATE SLOT LABELS (used in multi-date display) ─── */
const DATE_LABELS = ['1st Day (e.g. Nikah)', '2nd Day (e.g. Sanding)', '3rd Day (e.g. Tandang)'];

/* Helper: max dates allowed for current package */
function maxDatesForPkg() {
  return (PKG_DATE_CONFIG[activePackage.name] || { maxDates: 1 }).maxDates;
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

/* ══════════════════════════════════════
   GALLERY ALBUMS
   DROP YOUR REAL PHOTOS into images/<album-id>/ named 01.jpg, 02.jpg...
   The gallery auto-detects them. If a photo is missing, Unsplash shows.
 ══════════════════════════════════════ */
// Unsplash fallbacks shown when local photo not uploaded yet
const W1 = 'https://images.unsplash.com/photo-1519741497674-611481863552?w=900&auto=format&fit=crop';
const W2 = 'https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=900&auto=format&fit=crop';
const W3 = 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?w=900&auto=format&fit=crop';
const W4 = 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=900&auto=format&fit=crop';
const P1 = 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=900&auto=format&fit=crop';
const P2 = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=900&auto=format&fit=crop';
const P3 = 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=900&auto=format&fit=crop';
const E1 = 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=900&auto=format&fit=crop';
const E2 = 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=900&auto=format&fit=crop';

const ALBUMS = [
  {
    id: 'zarif-anis',
    title: 'Zarif Weds Anis',
    date: '14 December 2024 · Dewan Sri Penang',
    category: 'Wedding',
    layout: 'span2',
    coverGradient: 'linear-gradient(135deg,#1a1208,#2a1e0a)',
    teasers: [
      { src: 'images/zarif-anis/01.jpg', fallback: W1, g: 'linear-gradient(135deg,#1a1208,#2a1e0a)' },
      { src: 'images/zarif-anis/02.jpg', fallback: W2, g: 'linear-gradient(135deg,#1a1210,#2a1e12)' },
      { src: 'images/zarif-anis/03.jpg', fallback: W3, g: 'linear-gradient(135deg,#120a1a,#1e1228)' },
      { src: 'images/zarif-anis/04.jpg', fallback: W4, g: 'linear-gradient(135deg,#1a0e0a,#2a180e)' },
      { src: 'images/zarif-anis/05.jpg', fallback: W2, g: 'linear-gradient(135deg,#0a1a10,#0e2416)' },
    ],
  },
  {
    id: 'portrait-farah',
    title: 'Farah · Studio Portrait',
    date: 'March 2025 · Kuala Lumpur',
    category: 'Portrait',
    layout: 'tall',
    coverGradient: 'linear-gradient(135deg,#0a0f1a,#0f1a2a)',
    teasers: [
      { src: 'images/portrait-farah/01.jpg', fallback: P1, g: 'linear-gradient(135deg,#0a0f1a,#0f1a2a)' },
      { src: 'images/portrait-farah/02.jpg', fallback: P3, g: 'linear-gradient(135deg,#0a150f,#0f2018)' },
      { src: 'images/portrait-farah/03.jpg', fallback: P2, g: 'linear-gradient(135deg,#0a0a1a,#10102a)' },
    ],
  },
  {
    id: 'editorial-vogue',
    title: 'Avant-Garde Editorial',
    date: 'January 2025 · Galeri Petronas',
    category: 'Editorial',
    layout: '',
    coverGradient: 'linear-gradient(135deg,#0f0a1a,#1a0f2a)',
    teasers: [
      { src: 'images/editorial-vogue/01.jpg', fallback: E1, g: 'linear-gradient(135deg,#0f0a1a,#1a0f2a)' },
      { src: 'images/editorial-vogue/02.jpg', fallback: E2, g: 'linear-gradient(135deg,#1a0a10,#280f18)' },
      { src: 'images/editorial-vogue/03.jpg', fallback: P3, g: 'linear-gradient(135deg,#0a0f1a,#0a1528)' },
      { src: 'images/editorial-vogue/04.jpg', fallback: E1, g: 'linear-gradient(135deg,#1a1a0a,#282810)' },
    ],
  },
  {
    id: 'haziq-hana',
    title: 'Haziq & Hana · Nikah',
    date: '5 April 2025 · Masjid Wilayah, KL',
    category: 'Wedding',
    layout: '',
    coverGradient: 'linear-gradient(135deg,#1a1208,#120e06)',
    teasers: [
      { src: 'images/haziq-hana/01.jpg', fallback: W3, g: 'linear-gradient(135deg,#1a1208,#120e06)' },
      { src: 'images/haziq-hana/02.jpg', fallback: W4, g: 'linear-gradient(135deg,#1a1210,#201412)' },
      { src: 'images/haziq-hana/03.jpg', fallback: W1, g: 'linear-gradient(135deg,#1a0a0a,#281010)' },
      { src: 'images/haziq-hana/04.jpg', fallback: W2, g: 'linear-gradient(135deg,#0a1a14,#0e2818)' },
    ],
  },
  {
    id: 'portrait-khairul',
    title: 'Khairul · Executive Portrait',
    date: 'February 2025 · KLCC Gardens',
    category: 'Portrait',
    layout: '',
    coverGradient: 'linear-gradient(135deg,#0a151a,#0a1a15)',
    teasers: [
      { src: 'images/portrait-khairul/01.jpg', fallback: P2, g: 'linear-gradient(135deg,#0a151a,#0a1a15)' },
      { src: 'images/portrait-khairul/02.jpg', fallback: P1, g: 'linear-gradient(135deg,#0a0f18,#0f1820)' },
      { src: 'images/portrait-khairul/03.jpg', fallback: P3, g: 'linear-gradient(135deg,#101a0a,#162410)' },
    ],
  },
  {
    id: 'editorial-urban',
    title: 'Urban Stories · KL',
    date: 'October 2024 · Chow Kit, Kuala Lumpur',
    category: 'Editorial',
    layout: 'span2',
    coverGradient: 'linear-gradient(135deg,#1a0a0f,#2a0f1a)',
    teasers: [
      { src: 'images/editorial-urban/01.jpg', fallback: E2, g: 'linear-gradient(135deg,#1a0a0f,#2a0f1a)' },
      { src: 'images/editorial-urban/02.jpg', fallback: E1, g: 'linear-gradient(135deg,#1a100a,#2a1810)' },
      { src: 'images/editorial-urban/03.jpg', fallback: P3, g: 'linear-gradient(135deg,#0f0f1a,#18182a)' },
    ],
  },
  {
    id: 'izzatul-azim',
    title: 'Izzatul & Azim · Sanding',
    date: '22 November 2024 · Nilai Springs',
    category: 'Wedding',
    layout: '',
    coverGradient: 'linear-gradient(135deg,#121a08,#1a2408)',
    teasers: [
      { src: 'images/izzatul-azim/01.jpg', fallback: W4, g: 'linear-gradient(135deg,#121a08,#1a2408)' },
      { src: 'images/izzatul-azim/02.jpg', fallback: W2, g: 'linear-gradient(135deg,#1a1808,#28200a)' },
      { src: 'images/izzatul-azim/03.jpg', fallback: W3, g: 'linear-gradient(135deg,#0a1810,#0e2418)' },
    ],
  },
  {
    id: 'portrait-liyana',
    title: 'Liyana · Natural Light',
    date: 'April 2025 · Bukit Nanas Forest',
    category: 'Portrait',
    layout: '',
    coverGradient: 'linear-gradient(135deg,#0f1a1a,#0a1515)',
    teasers: [
      { src: 'images/portrait-liyana/01.jpg', fallback: P3, g: 'linear-gradient(135deg,#0f1a1a,#0a1515)' },
      { src: 'images/portrait-liyana/02.jpg', fallback: P1, g: 'linear-gradient(135deg,#0a1a12,#0e2018)' },
      { src: 'images/portrait-liyana/03.jpg', fallback: P2, g: 'linear-gradient(135deg,#1a1a0a,#24240e)' },
    ],
  },
];



/* ─── GALLERY BUILD ─── */
/* Set background with auto-fallback: tries local path → Unsplash → gradient */
function setElBg(el, localSrc, fallbackSrc, gradient) {
  const darkColor = gradient.match(/#[0-9a-f]+/i)?.[0] || '#111';
  el.style.backgroundColor = darkColor;
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
  ALBUMS
    .filter(a => filter === 'all' || a.category.toLowerCase() === filter)
    .forEach(album => {
      const cover   = album.teasers[0];
      const div     = document.createElement('div');
      div.className = `gallery-item${album.layout ? ' ' + album.layout : ''}`;
      div.innerHTML = `
        <div class="gallery-placeholder">${album.title}</div>
        <div class="gallery-overlay">
          <div>
            <span style="display:block;font-size:0.6rem;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">${album.category}</span>
            <span style="font-size:0.9rem;color:var(--text);font-family:'Cormorant Garamond',serif;">${album.title}</span>
          </div>
        </div>`;
      setElBg(div, cover.src, cover.fallback, cover.g);
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
      const start = (event.start.date  || event.start.dateTime  || '').split('T')[0];
      const end   = (event.end.date    || event.end.dateTime    || '').split('T')[0];
      if (!start) return;
      let d = new Date(start + 'T00:00:00');
      const e = new Date((end || start) + 'T00:00:00');
      while (d <= e) {
        busyDates.add(toYMD(new Date(d)));
        d.setDate(d.getDate() + 1);
      }
    });

    gcalConnected = true;
    showConnectedBanner('📅 Google Calendar synced — busy dates greyed out');
    renderCalendar();
  } catch (err) {
    console.warn('Calendar API error:', err.message);
    gcalConnected = true;
    renderCalendar(); // show all available
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

  // Package discount
  const discounts   = JSON.parse(localStorage.getItem('pkg_discounts') || '{}');
  let discountAmt   = discounts[activePackage.name] || 0;
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
    const promoCodes = JSON.parse(localStorage.getItem('promo_codes') || '[]');
    const match      = promoCodes.find(p => p.code === code);
    if (match) {
      promoAmt  = match.discount;
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
  activePackage = {
    name,
    price,
    baseAmount:   parseInt(price.replace(/[^0-9]/g, '')),
    totalAmount:  parseInt(price.replace(/[^0-9]/g, '')),
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

  evtList.innerHTML = selectedDates.map((d, i) => {
    const fmt   = fmtDate(d);
    const label = DATE_LABELS[i] || `Day ${i+1}`;
    return `
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:14px;margin-bottom:10px;">
        <p style="font-size:0.72rem;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:10px;">${label} — ${fmt}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group">
            <label>Function / Event</label>
            <select id="evtFunc_${i}" required style="${selectStyle}">${funcOptions}</select>
          </div>
          <div class="form-group">
            <label>Start Time</label>
            <select id="evtTime_${i}" required style="${selectStyle}">${timeOptions}</select>
          </div>
        </div>
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
  const email    = document.getElementById('bEmail').value.trim();
  const phone    = document.getElementById('bPhone').value.trim();
  const notes    = document.getElementById('bNotes').value.trim();
  const location = document.getElementById('bLocation').value.trim();
  const name     = `${first} ${last}`;
  const ref      = genRef();

  // Collect per-date event details
  const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-MY', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const eventDetails = selectedDates.map((d, i) => {
    const fn    = document.getElementById(`evtFunc_${i}`)?.value.trim() || '—';
    const tm    = document.getElementById(`evtTime_${i}`)?.value || '—';
    const label = selectedDates.length > 1 ? `${DATE_LABELS[i]}: ` : '';
    return `${label}${fmtDate(d)} | ${fn} @ ${tm}`;
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
  for (let i = 0; i < selectedDates.length; i++) {
    const fn = document.getElementById(`evtFunc_${i}`)?.value || '';
    const tm = document.getElementById(`evtTime_${i}`)?.value || '';
    if (!fn || !tm) {
      alert(`Please select the function and time for Day ${i + 1}.`);
      return;
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

    const waMsg =
      `🔔 *New Booking Enquiry*\n` +
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
          subject:     `📋 [ENQUIRY] ${ref} — ${name} — ${activePackage.name}`,
          name, email, replyto: email,
          // ── CLIENT ──
          '📍 REF':          ref,
          '👤 Client Name':   name,
          '📱 WhatsApp':      displayPhone,
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
          message:         `ENQUIRY ${ref} | ${name} | ${displayPhone}\n${activePackage.name} | RM ${totalAmt.toLocaleString()}\nDate: ${datesBlock}\nApprove: ${approveLink}`,
        }),
      }).catch(() => {});
    }

    /* 2️⃣ WhatsApp via wa.me */
    const waUrl = `https://wa.me/${PHOTOGRAPHER}?text=${encodeURIComponent(waMsg)}`;
    window.open(waUrl, '_blank');

    const how = w3fKey
      ? 'Email + WhatsApp notification sent. You\'ll hear back within 24 hours.'
      : 'WhatsApp has opened — tap Send to notify the photographer.';

    document.getElementById('confirmMsg').textContent =
      `Thank you, ${first}! Your enquiry (${ref}) for ${activePackage.name} is submitted. ${how}`;

  } else {
    /* ── DIRECT BOOKING: notify owner + mark dates busy ── */
    selectedDates.forEach(d => busyDates.add(d));

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
          '📱 WhatsApp':       displayPhone2,
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
  const s = document.getElementById('formSuccess');
  s.classList.add('show');
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
