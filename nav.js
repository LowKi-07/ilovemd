/* ============================================================== site nav
   One nav for every page. Include with:

     <link rel="stylesheet" href="/nav.css">
     <div id="site-nav"></div>
     <script src="/nav.js"></script>

   The bar is fixed in every state; pages offset their own chrome by --navh. */
(function () {
  var MARKUP = `<nav class="nav">
  <div class="wrap nav__in">
    <a href="/" class="brand-logo" aria-label="ilovemd home">
      <svg width="73" height="36" viewBox="0 0 121 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M9.32 15.92V44H2.48V15.92H9.32Z" fill="white"/>
        <path class="logo-heart" fill-rule="evenodd" clip-rule="evenodd" d="M41.4423 15C41.0385 15 40.5 15 39.9615 15.1364C37.2692 15.5455 34.8462 17.0455 33.5 19.2273C32.0192 17.0455 29.7308 15.5455 27.0385 15.1364C26.5 15 25.9615 15 25.5577 15C20.3077 15 16 19.2273 16 24.4091C16 24.8182 16 25.2273 16.1346 25.7727C16.4038 27.8182 17.3462 29.5909 18.8269 31.0909L33.5 45L48.1731 31.0909C49.6538 29.7273 50.5962 27.8182 50.8654 25.7727C51 25.2273 51 24.8182 51 24.4091C51 19.2273 46.6923 15 41.4423 15Z" fill="#D64022"/>
        <path d="M89.28 15.92V44H82.44V27.16L76.16 44H70.64L64.32 27.12V44H57.48V15.92H65.56L73.44 35.36L81.24 15.92H89.28ZM104.719 15.92C107.679 15.92 110.265 16.5067 112.479 17.68C114.692 18.8533 116.399 20.5067 117.599 22.64C118.825 24.7467 119.439 27.1867 119.439 29.96C119.439 32.7067 118.825 35.1467 117.599 37.28C116.399 39.4133 114.679 41.0667 112.439 42.24C110.225 43.4133 107.652 44 104.719 44H94.1988V15.92H104.279ZM104.279 38.08C106.865 38.08 108.879 37.3733 110.319 35.96C111.759 34.5467 112.479 32.5467 112.479 29.96C112.479 27.3733 111.759 25.36 110.319 23.92C108.879 22.48 106.865 21.76 104.279 21.76H101.039V38.08H104.279Z" fill="white"/>
      </svg>
    </a>
    <div class="nav__links">
      <a href="/">Home</a>
      <div class="navdrop">
        <button class="navdrop__btn" id="nd-btn-convert" aria-haspopup="true" aria-expanded="false" aria-controls="nd-convert">
          Convert MD
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div class="navdrop__panel" id="nd-convert" role="menu" aria-labelledby="nd-btn-convert">
          <a class="navitem" role="menuitem" href="/convert?type=pdf">
            <span class="navitem__ic" style="--tb:rgba(251,113,133,.1);--tl:rgba(251,113,133,.28)"><svg viewBox="0 0 24 24" fill="none" stroke="#fb7185" stroke-width="1.7" stroke-linejoin="round"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><text x="12" y="17.5" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-size="6" font-weight="700" fill="#fb7185" stroke="none">PDF</text></svg></span>
            <span class="navitem__tx"><b>PDF</b><span>Native PDF files, headers and footers stripped</span></span>
          </a>
          <a class="navitem" role="menuitem" href="/convert?type=word">
            <span class="navitem__ic" style="--tb:rgba(79,143,247,.1);--tl:rgba(79,143,247,.28)"><svg viewBox="0 0 24 24" fill="none" stroke="#4f8ff7" stroke-width="1.7" stroke-linejoin="round"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><text x="12" y="17.5" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-size="8" font-weight="700" fill="#4f8ff7" stroke="none">W</text></svg></span>
            <span class="navitem__tx"><b>Word</b><span>DOCX documents with structure intact</span></span>
          </a>
          <a class="navitem" role="menuitem" href="/convert?type=ppt">
            <span class="navitem__ic" style="--tb:rgba(237,108,71,.1);--tl:rgba(237,108,71,.28)"><svg viewBox="0 0 24 24" fill="none" stroke="#ed6c47" stroke-width="1.7" stroke-linejoin="round"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><text x="12" y="17.5" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-size="8" font-weight="700" fill="#ed6c47" stroke="none">P</text></svg></span>
            <span class="navitem__tx"><b>PowerPoint</b><span>Slide decks turned into readable sections</span></span>
          </a>
          <a class="navitem" role="menuitem" href="/convert?type=excel">
            <span class="navitem__ic" style="--tb:rgba(33,163,102,.1);--tl:rgba(33,163,102,.28)"><svg viewBox="0 0 24 24" fill="none" stroke="#21A366" stroke-width="1.7" stroke-linejoin="round"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><text x="12" y="17.5" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-size="8" font-weight="700" fill="#21A366" stroke="none">X</text></svg></span>
            <span class="navitem__tx"><b>Excel</b><span>Spreadsheets as Markdown tables</span></span>
          </a>
          <span class="navitem navitem--soon"><span class="navitem__ic" style="--tb:rgba(255,255,255,.07);--tl:rgba(255,255,255,.2)"><svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5" fill="#fff"/><text x="12" y="17" text-anchor="middle" font-family="Georgia,serif" font-size="13" font-weight="700" fill="#0a0a11">N</text></svg></span>
            <span class="navitem__tx"><b>Notion</b><span>Pages and databases, nesting preserved</span></span>
          </span>
          <span class="navitem navitem--soon"><span class="navitem__ic" style="--tb:rgba(38,132,255,.1);--tl:rgba(38,132,255,.3)"><svg viewBox="0 0 24 24" fill="none" stroke-linecap="round"><path d="M4.5 17.5c2.7-4.4 4.8-5.2 8.8-3.1l6.2 3.1" stroke="#2684FF" stroke-width="3"/><path d="M19.5 6.5c-2.7 4.4-4.8 5.2-8.8 3.1L4.5 6.5" stroke="#5EA4FF" stroke-width="3"/></svg></span>
            <span class="navitem__tx"><b>Confluence</b><span>Spaces exported without the wiki markup</span></span>
          </span>
        </div>
      </div>

      <div class="navdrop">
        <button class="navdrop__btn" id="nd-btn-generate" aria-haspopup="true" aria-expanded="false" aria-controls="nd-generate">
          Generate MD
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div class="navdrop__panel" id="nd-generate" role="menu" aria-labelledby="nd-btn-generate">
          <a class="navitem" role="menuitem" href="/text">
            <span class="navitem__ic" style="--tb:rgba(139,124,255,.12);--tl:rgba(139,124,255,.3)"><svg viewBox="0 0 24 24" fill="none" stroke="#8b7cff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><path d="M9 12h6M9 16h6M9 8h2"/></svg></span>
            <span class="navitem__tx"><b>Text</b><span>Describe it in plain English, AI writes it</span></span>
          </a>
          <a class="navitem" role="menuitem" href="/ui">
            <span class="navitem__ic" style="--tb:rgba(228,77,38,.12);--tl:rgba(228,77,38,.32)"><svg viewBox="0 0 24 24"><path fill="#E44D26" d="M3.5 2h17l-1.55 17.5L12 21.8l-6.95-2.3L3.5 2z"/><path fill="#F16529" d="M12 3.6v16.55l5.62-1.86L18.9 3.6H12z"/><polyline points="10,8.7 7,11.7 10,14.7" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><polyline points="14,8.7 17,11.7 14,14.7" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            <span class="navitem__tx"><b>HTML / CSS</b><span>Document a design system from its source</span></span>
          </a>
          <a class="navitem" role="menuitem" href="/figma">
            <span class="navitem__ic"><svg viewBox="0 0 24 24"><path fill="#F24E1E" d="M12 2H8.5a3.5 3.5 0 0 0 0 7H12V2z"/><path fill="#FF7262" d="M12 2h3.5a3.5 3.5 0 0 1 0 7H12V2z"/><path fill="#A259FF" d="M12 9H8.5a3.5 3.5 0 0 0 0 7H12V9z"/><path fill="#0ACF83" d="M8.5 16a3.5 3.5 0 1 0 3.5 3.5V16H8.5z"/><circle fill="#1ABCFE" cx="15.5" cy="12.5" r="3.5"/></svg></span>
            <span class="navitem__tx"><b>Figma</b><span>Frame links, with properties and variants</span></span>
          </a>
          <a class="navitem" role="menuitem" href="/ui">
            <span class="navitem__ic" style="--tb:rgba(97,218,251,.08);--tl:rgba(97,218,251,.25)"><svg viewBox="0 0 24 24" fill="none" stroke="#61DAFB" stroke-width="1"><circle cx="12" cy="12" r="2" fill="#61DAFB" stroke="none"/><ellipse cx="12" cy="12" rx="10" ry="4.2"/><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(120 12 12)"/></svg></span>
            <span class="navitem__tx"><b>React</b><span>Components read straight from the code</span></span>
          </a>
        </div>
      </div>

      <a href="/templates">Templates</a>
    </div>
    <span class="sp"></span>
    <!-- Profile dropdown -->
    <div class="hdrop">
      <button class="hdrop__btn" id="btn-profile" aria-label="My profile" aria-haspopup="true" aria-expanded="false">
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#cp-p1)"><path d="M1 16C1 7.16344 8.16344 0 17 0C25.8366 0 33 7.16344 33 16C33 24.8366 25.8366 32 17 32C8.16344 32 1 24.8366 1 16Z" fill="none"/><path d="M0.997559 16C0.997559 13.9375 1.39339 11.9896 2.18506 10.1562C2.95589 8.34375 4.01839 6.76042 5.37256 5.40625C6.74756 4.03125 8.34131 2.95833 10.1538 2.1875C11.9871 1.39583 13.9351 1 15.9976 1C18.0809 1 20.0288 1.39583 21.8413 2.1875C23.6538 2.95833 25.2371 4.03125 26.5913 5.40625C27.9663 6.76042 29.0496 8.34375 29.8413 10.1562C30.6121 11.9896 30.9976 13.9375 30.9976 16C30.9976 18.0833 30.6121 20.0312 29.8413 21.8438C29.0496 23.6562 27.9663 25.25 26.5913 26.625C25.2371 27.9792 23.6538 29.0521 21.8413 29.8438C20.0288 30.6146 18.0809 31 15.9976 31C13.9351 31 11.9871 30.6146 10.1538 29.8438C8.34131 29.0521 6.74756 27.9792 5.37256 26.625C4.01839 25.25 2.95589 23.6562 2.18506 21.8438C1.39339 20.0312 0.997559 18.0833 0.997559 16ZM15.9976 3C12.3726 3 9.24756 4.46875 7.02881 6.8125C5.61214 7.97917 4.69548 9.35417 4.02881 10.9375C3.34131 12.5208 2.99756 14.2083 2.99756 16C2.99756 17.7917 3.34131 19.4792 4.02881 21.0625C4.69548 22.6458 5.61214 24.0312 6.77881 25.2188C7.96631 26.3854 9.35173 27.3125 10.9351 28C12.5184 28.6667 14.2059 29 15.9976 29C17.7892 29 19.4767 28.6667 21.0601 28C22.6434 27.3125 24.0184 26.3854 25.1851 25.2188C26.3726 24.0312 27.3101 22.6458 27.9976 21.0625C28.6642 19.4792 28.9976 17.7917 28.9976 16C28.9976 14.2083 28.6642 12.5208 27.9976 10.9375C27.3101 9.35417 26.3726 7.97917 25.1851 6.8125C24.0184 5.625 22.6434 4.69792 21.0601 4.03125C19.4767 3.34375 17.7892 3 15.9976 3ZM16 10C17.3807 10 18.5 11.1193 18.5 12.5C18.5 13.8807 17.3807 15 16 15C14.6193 15 13.5 13.8807 13.5 12.5C13.5 11.1193 14.6193 10 16 10ZM10.34 19.28C10.34 17.34 12.93 16 16 16C19.07 16 21.66 17.34 21.66 19.28V21.5C21.66 21.78 21.44 22 21.16 22H10.84C10.56 22 10.34 21.78 10.34 21.5V19.28Z" fill="currentColor"/></g><defs><clipPath id="cp-p1"><rect width="32" height="32" fill="white"/></clipPath></defs></svg>
      </button>
      <div class="hdrop__menu" id="menu-profile" role="menu">
        <a href="#" class="hdrop__item" role="menuitem">My Profile</a>
        <hr class="hdrop__sep">
        <a href="#" class="hdrop__item" id="menu-logout" role="menuitem">Log Out</a>
      </div>
    </div>
    <!-- Menu dropdown -->
    <div class="hdrop">
      <button class="hdrop__btn" id="btn-hamb" aria-label="Main menu" aria-haspopup="true" aria-expanded="false">
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.6 4.8C7.6 6.3464 6.3464 7.6 4.8 7.6C3.2536 7.6 2 6.3464 2 4.8C2 3.2536 3.2536 2 4.8 2C6.3464 2 7.6 3.2536 7.6 4.8Z" fill="currentColor"/><path d="M18.8 4.8C18.8 6.3464 17.5464 7.6 16 7.6C14.4536 7.6 13.2 6.3464 13.2 4.8C13.2 3.2536 14.4536 2 16 2C17.5464 2 18.8 3.2536 18.8 4.8Z" fill="currentColor"/><path d="M30 4.8C30 6.3464 28.7464 7.6 27.2 7.6C25.6536 7.6 24.4 6.3464 24.4 4.8C24.4 3.2536 25.6536 2 27.2 2C28.7464 2 30 3.2536 30 4.8Z" fill="currentColor"/><path d="M7.6 16C7.6 17.5464 6.3464 18.8 4.8 18.8C3.2536 18.8 2 17.5464 2 16C2 14.4536 3.2536 13.2 4.8 13.2C6.3464 13.2 7.6 14.4536 7.6 16Z" fill="currentColor"/><path d="M18.8 16C18.8 17.5464 17.5464 18.8 16 18.8C14.4536 18.8 13.2 17.5464 13.2 16C13.2 14.4536 14.4536 13.2 16 13.2C17.5464 13.2 18.8 14.4536 18.8 16Z" fill="currentColor"/><path d="M30 16C30 17.5464 28.7464 18.8 27.2 18.8C25.6536 18.8 24.4 17.5464 24.4 16C24.4 14.4536 25.6536 13.2 27.2 13.2C28.7464 13.2 30 14.4536 30 16Z" fill="currentColor"/><path d="M7.6 27.2C7.6 28.7464 6.3464 30 4.8 30C3.2536 30 2 28.7464 2 27.2C2 25.6536 3.2536 24.4 4.8 24.4C6.3464 24.4 7.6 25.6536 7.6 27.2Z" fill="currentColor"/><path d="M18.8 27.2C18.8 28.7464 17.5464 30 16 30C14.4536 30 13.2 28.7464 13.2 27.2C13.2 25.6536 14.4536 24.4 16 24.4C17.5464 24.4 18.8 25.6536 18.8 27.2Z" fill="currentColor"/><path d="M30 27.2C30 28.7464 28.7464 30 27.2 30C25.6536 30 24.4 28.7464 24.4 27.2C24.4 25.6536 25.6536 24.4 27.2 24.4C28.7464 24.4 30 25.6536 30 27.2Z" fill="currentColor"/></svg>
      </button>
      <div class="hdrop__menu" id="menu-main" role="menu">
        <a href="#" class="hdrop__item" role="menuitem">About Us</a>
        <a href="#" class="hdrop__item" role="menuitem">Pricing</a>
        <a href="#" class="hdrop__item" role="menuitem">Contact Us</a>
        <a href="#" class="hdrop__item" role="menuitem">Help &amp; Support</a>
        <hr class="hdrop__sep">
        <a href="#" class="hdrop__item" role="menuitem">Language</a>
      </div>
    </div>
  </div>
</nav>`;

  var mount = document.getElementById('site-nav');
  if (!mount) return;
  mount.innerHTML = MARKUP;

  /* ---- the logo heart beats twice as the page loads (nav.css) ----
     The class comes off when that ends, so leaving a hover never replays it. */
  var heart = mount.querySelector('.logo-heart');
  if (heart) {
    heart.classList.add('is-intro');
    heart.addEventListener('animationend', function () { heart.classList.remove('is-intro'); });
  }

  /* ---- tool dropdowns: click-driven, so touch and keyboard both work ---- */
  var drops = [['nd-btn-convert', 'nd-convert'], ['nd-btn-generate', 'nd-generate']]
    .map(function (p) {
      return { btn: document.getElementById(p[0]), panel: document.getElementById(p[1]) };
    })
    .filter(function (d) { return d.btn && d.panel; });

  function closeDrops(except) {
    drops.forEach(function (d) {
      if (d === except) return;
      d.panel.classList.remove('open');
      d.btn.setAttribute('aria-expanded', 'false');
    });
  }

  drops.forEach(function (d) {
    d.btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = !d.panel.classList.contains('open');
      closeDrops(d);
      d.panel.classList.toggle('open', willOpen);
      d.btn.setAttribute('aria-expanded', String(willOpen));
    });
    // A click inside the panel that misses a link should not dismiss it.
    d.panel.addEventListener('click', function (e) { e.stopPropagation(); });
  });

  /* ---- profile / main menus ---- */
  var menus = [['btn-profile', 'menu-profile'], ['btn-hamb', 'menu-main']]
    .map(function (p) {
      return { btn: document.getElementById(p[0]), menu: document.getElementById(p[1]) };
    })
    .filter(function (m) { return m.btn && m.menu; });

  function closeMenus() {
    menus.forEach(function (m) {
      m.menu.classList.remove('open');
      m.btn.setAttribute('aria-expanded', 'false');
    });
  }

  menus.forEach(function (m) {
    m.btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = m.menu.classList.contains('open');
      closeMenus();
      if (!open) { m.menu.classList.add('open'); m.btn.setAttribute('aria-expanded', 'true'); }
    });
  });

  document.addEventListener('click', function () { closeDrops(); closeMenus(); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = drops.filter(function (d) { return d.panel.classList.contains('open'); })[0];
    closeDrops(); closeMenus();
    if (open) open.btn.focus();
  });

})();
