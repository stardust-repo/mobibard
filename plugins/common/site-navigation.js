(function () {
  'use strict';

  const RECOMMENDED_SITES = Object.freeze([
    ['BitMidi', 'https://bitmidi.com/'],
    ['ClassicalArchives', 'https://www.classicalarchives.com/midi.html'],
    ["Ichigo's", 'https://ichigos.com/'],
    ["Josh's Anime", 'https://josh.agarrado.net/music/anime/index.php'],
    ['MIDIEX', 'http://www.midiex.net/'],
    ['Midisite', 'http://www.midisite.co.uk/'],
    ['MuseScore', 'https://musescore.com/'],
    ['MuScriptor', 'https://muscriptor.kyutai.org/'],
    ['VGMusic', 'https://www.vgmusic.com/'],
    ["Zophar's Domain", 'https://www.zophar.net/']
  ].map(([label, url]) => Object.freeze({ label, url })));

  const SITE_MAP = Object.freeze([
    { id: 'simple', href: '../simple/index.html', labels: { ko: '간편 모드', ja: '簡単モード', en: 'Simple mode', 'zh-CN': '简易模式', 'zh-TW': '簡易模式' } },
    { id: 'player', href: '../player/index.html', labels: { ko: '상세 모드', ja: '詳細モード', en: 'Detailed mode', 'zh-CN': '详细模式', 'zh-TW': '詳細模式' } },
    { id: 'rollscriptor', href: '../rollscriptor/index.html', labels: { ko: '롤 스크립터', ja: 'ロールスクリプター', en: 'RollScriptor', 'zh-CN': 'RollScriptor', 'zh-TW': 'RollScriptor' } },
    { id: 'veloscriptor', href: '../veloscriptor/index.html', labels: { ko: '벨로 스크립터', ja: 'ヴェロスクリプター', en: 'VeloScriptor', 'zh-CN': 'VeloScriptor', 'zh-TW': 'VeloScriptor' } },
    { id: 'editor', href: '../editor/index.html', labels: { ko: '에디터 (alpha)', ja: 'エディター (alpha)', en: 'Editor (alpha)', 'zh-CN': '编辑器 (alpha)', 'zh-TW': '編輯器 (alpha)' } },
    { id: 'mobibeats', href: '../mobibeats/index.html', labels: { ko: '모비비츠', ja: 'モビビーツ', en: 'MobiBeats', 'zh-CN': 'MobiBeats', 'zh-TW': 'MobiBeats' } }
  ].map(item => Object.freeze({ ...item, labels: Object.freeze(item.labels) })));

  const SITE_MAP_LABELS = Object.freeze({
    ko: '사이트 맵', ja: 'サイトマップ', en: 'Site map', 'zh-CN': '站点地图', 'zh-TW': '網站地圖'
  });

  function normalizeLanguage(value) {
    const raw = String(value || '').trim();
    if (/^zh[-_]cn/i.test(raw) || /^zh[-_]hans/i.test(raw)) return 'zh-CN';
    if (/^zh[-_]tw/i.test(raw) || /^zh[-_]hant/i.test(raw)) return 'zh-TW';
    if (/^ja/i.test(raw)) return 'ja';
    if (/^en/i.test(raw)) return 'en';
    return 'ko';
  }

  function getLanguage() {
    return normalizeLanguage(document.documentElement.lang || new URLSearchParams(location.search).get('lang') || 'ko');
  }

  function withLanguage(href, lang) {
    try {
      const url = new URL(href, document.baseURI);
      url.searchParams.set('lang', lang);
      return `${url.pathname}${url.search}${url.hash}`;
    } catch (_) {
      return href;
    }
  }

  function renderRecommended() {
    document.querySelectorAll('[data-common-recommended], #midiSiteLinks').forEach(select => {
      if (!(select instanceof HTMLSelectElement)) return;
      const first = select.options[0] || new Option('추천 사이트', '');
      select.replaceChildren(first);
      RECOMMENDED_SITES.forEach(site => select.add(new Option(site.label, site.url)));
    });
  }

  function renderSiteMaps() {
    const lang = getLanguage();
    const label = SITE_MAP_LABELS[lang] || SITE_MAP_LABELS.ko;
    document.querySelectorAll('[data-common-site-map]').forEach(nav => {
      const current = nav.closest('[data-current-site]')?.getAttribute('data-current-site') || '';
      nav.setAttribute('aria-label', label);
      nav.replaceChildren();
      SITE_MAP.forEach(site => {
        const a = document.createElement('a');
        a.className = 'common-site-map-link site-map-link';
        a.dataset.siteId = site.id;
        a.href = withLanguage(site.href, lang);
        a.textContent = site.labels[lang] || site.labels.en;
        if (site.id === current) a.setAttribute('aria-current', 'page');
        // Compatibility with Simple's existing language/update code.
        const legacyId = {
          simple: 'siteMapSimpleLink', player: 'siteMapPlayerLink',
          rollscriptor: 'siteMapRollscriptorLink', veloscriptor: 'siteMapVeloscriptorLink', editor: 'siteMapEditorLink'
        }[site.id];
        if (legacyId && !document.getElementById(legacyId)) a.id = legacyId;
        nav.appendChild(a);
      });
    });
    document.querySelectorAll('.brand-site-map-trigger').forEach(summary => {
      summary.setAttribute('aria-label', label);
      summary.title = label;
    });
    document.querySelectorAll('[data-common-site-map-label]').forEach(node => { node.textContent = label; });
  }

  function closeOtherMenus(event) {
    const opened = event.target;
    if (!(opened instanceof HTMLDetailsElement) || !opened.open || !opened.classList.contains('brand-site-map')) return;
    document.querySelectorAll('details.brand-site-map[open]').forEach(details => {
      if (details !== opened) details.removeAttribute('open');
    });
  }

  function closeMenusFromOutside(event) {
    const target = event.target;
    document.querySelectorAll('details.brand-site-map[open]').forEach(details => {
      if (!(target instanceof Node) || !details.contains(target)) details.removeAttribute('open');
    });
  }

  function closeMenusOnEscape(event) {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('details.brand-site-map[open]').forEach(details => details.removeAttribute('open'));
  }

  function refresh() {
    renderRecommended();
    renderSiteMaps();
  }

  window.MobibardSiteNavigation = Object.freeze({ recommendedSites: RECOMMENDED_SITES, siteMap: SITE_MAP, refresh });

  refresh();
  document.addEventListener('toggle', closeOtherMenus, true);
  document.addEventListener('pointerdown', closeMenusFromOutside, true);
  document.addEventListener('keydown', closeMenusOnEscape, true);

  const langObserver = new MutationObserver(records => {
    if (records.some(record => record.attributeName === 'lang')) renderSiteMaps();
  });
  langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
})();
