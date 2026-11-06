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
    { id: 'simple', href: '../simple/index.html', labels: { ko: '간편 생성기', ja: '簡単ジェネレーター', en: 'Simple Generator', 'zh-CN': '简易生成器', 'zh-TW': '簡易產生器' }, descriptions: { ko: '연주 파일을 복잡한 설정 없이 빠르게 최대 3채널 MML로 변환합니다.', ja: '複雑な設定なしで演奏ファイルを最大3チャンネルのMMLへ素早く変換します。', en: 'Quickly convert performance files into up to three MML channels with minimal setup.', 'zh-CN': '无需复杂设置，即可快速将演奏文件转换为最多3个MML声道。', 'zh-TW': '不需複雜設定，即可快速將演奏檔轉換為最多3個MML頻道。' } },
    { id: 'player', href: '../player/index.html', labels: { ko: '상세 생성기', ja: '詳細ジェネレーター', en: 'Detailed Generator', 'zh-CN': '详细生成器', 'zh-TW': '詳細產生器' }, descriptions: { ko: '6채널 배정, 세부 옵션, 피아노롤과 미리듣기를 갖춘 상세 MML 생성기입니다.', ja: '6チャンネル割り当て、詳細設定、ピアノロールとプレビューを備えたMML作成ツールです。', en: 'A detailed six-channel MML creator with assignment controls, options, piano roll, and preview.', 'zh-CN': '提供6声道分配、详细选项、钢琴卷帘和预览的MML制作工具。', 'zh-TW': '提供6頻道配置、詳細選項、鋼琴捲軸與預覽的MML製作工具。' } },
    { id: 'editor', href: '../editor/index.html', labels: { ko: '에디터 (Gamma)', ja: 'エディター (Gamma)', en: 'Editor (Gamma)', 'zh-CN': '编辑器 (Gamma)', 'zh-TW': '編輯器 (Gamma)' }, descriptions: { ko: 'MML·MIDI를 피아노롤에서 편집하고 채널, 템포, 참조 오디오를 프로젝트로 관리합니다.', ja: 'MML・MIDIをピアノロールで編集し、チャンネル、テンポ、参照音源をプロジェクトとして管理します。', en: 'Edit MML and MIDI on a piano roll and manage channels, tempo, and reference audio as a project.', 'zh-CN': '在钢琴卷帘中编辑MML与MIDI，并以项目方式管理声道、速度和参考音频。', 'zh-TW': '在鋼琴捲軸中編輯MML與MIDI，並以專案管理頻道、速度與參考音訊。' } },
    { id: 'rollscriptor', href: '../rollscriptor/index.html', labels: { ko: '롤 스크립터', ja: 'ロールスクリプター', en: 'RollScriptor', 'zh-CN': 'RollScriptor', 'zh-TW': 'RollScriptor' }, descriptions: { ko: '피아노 롤 영상을 분석해 건반의 Note On/Off를 MIDI로 복원합니다.', ja: 'ピアノロール動画を解析し、鍵盤のNote On/OffをMIDIとして復元します。', en: 'Analyze piano-roll videos and reconstruct keyboard Note On/Off events as MIDI.', 'zh-CN': '分析钢琴卷帘视频，并将琴键的Note On/Off还原为MIDI。', 'zh-TW': '分析鋼琴捲軸影片，並將琴鍵的Note On/Off還原為MIDI。' } },
    { id: 'veloscriptor', href: '../veloscriptor/index.html', labels: { ko: '벨로 스크립터', ja: 'ヴェロスクリプター', en: 'VeloScriptor', 'zh-CN': 'VeloScriptor', 'zh-TW': 'VeloScriptor' }, descriptions: { ko: 'MIDI와 동일 연주의 오디오를 비교해 각 노트의 Velocity를 다시 계산합니다.', ja: 'MIDIと同じ演奏の音源を比較し、各ノートのVelocityを再計算します。', en: 'Compare MIDI with matching audio and recalculate the velocity of each note.', 'zh-CN': '比较MIDI与相同演奏的音频，重新计算每个音符的Velocity。', 'zh-TW': '比較MIDI與相同演奏的音訊，重新計算每個音符的Velocity。' } },
    { id: 'mobibeats', href: '../mobibeats/index.html', labels: { ko: '모비비츠', ja: 'モビビーツ', en: 'MobiBeats', 'zh-CN': 'MobiBeats', 'zh-TW': 'MobiBeats' }, descriptions: { ko: 'MML 또는 MIDI에서 4·5·6키 리듬 차트를 만들고 바로 플레이합니다.', ja: 'MMLまたはMIDIから4・5・6キーのリズム譜面を作成してすぐにプレイできます。', en: 'Create 4-, 5-, or 6-key rhythm charts from MML or MIDI and play them instantly.', 'zh-CN': '从MML或MIDI生成4、5、6键节奏谱面并立即游玩。', 'zh-TW': '從MML或MIDI建立4、5、6鍵節奏譜面並立即遊玩。' } }
  ].map(item => Object.freeze({ ...item, labels: Object.freeze(item.labels), descriptions: Object.freeze(item.descriptions || {}) })));

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
        const tip = site.descriptions[lang] || site.descriptions.en || '';
        if (tip) { a.title = tip; a.setAttribute('aria-description', tip); }
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
