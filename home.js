(() => {
  'use strict';

  const LANGUAGE_KEY = 'mobibard.player.language';
  const supported = new Set(['ko', 'ja', 'en', 'zh-CN', 'zh-TW']);
  const normalizeLanguage = value => {
    const raw = String(value || '').trim();
    if (/^zh[-_]cn/i.test(raw) || /^zh[-_]hans/i.test(raw)) return 'zh-CN';
    if (/^zh[-_]tw/i.test(raw) || /^zh[-_]hant/i.test(raw)) return 'zh-TW';
    if (/^ja/i.test(raw)) return 'ja';
    if (/^en/i.test(raw)) return 'en';
    return 'ko';
  };

  const copy = {
    ko: {
      brand: '모비바드',
      subtitle: '연주 파일 변환, MML 제작, 편집, 분석과 리듬 플레이를 브라우저 한 곳에서 이용할 수 있는 음악 도구 모음입니다.',
      language: '언어', open: '열기 →', footer: '모든 도구는 브라우저에서 실행됩니다.',
      theme: '테마', themeLight: '라이트', themeDark: '다크',
      event: { kicker: '이벤트 진행 중', title: '이용 설문 이벤트', description: '모비바드를 사용해 보신 경험을 설문으로 남겨 주세요. 이벤트 기간 동안만 진행됩니다.', deadline: '마감: 2026년 12월 23일(수) 23:59까지', link: '설문 참여하기 →' },
      soundfont: { kicker: '공개 음색 파일', title: 'MobiBard Instruments SF3 / DLS', description: '모비바드의 기본 음색을 원본 SF3와 호환용 DLS 파일로 제공합니다. 두 파일의 URL을 그대로 공유하거나 다른 프로젝트에서 직접 사용할 수 있습니다.', license: 'startdust-io가 제작했으며 MIT License로 배포합니다. 개인·상업적 이용, 복사, 수정, 변환, 재배포, 미러링 및 직접 링크를 허용하며, 파일을 재배포할 때는 저작권 고지와 라이선스 문구를 함께 포함해야 합니다.', downloadLabel: '다운로드', licenseLink: 'MIT 라이선스', guideLink: '호환 방법' },
      products: [
        ['simple', 'MML 간편 생성기', 'MML 생성', '♪', '연주 파일을 복잡한 설정 없이 빠르게 최대 3채널 MML로 변환합니다.'],
        ['player', 'MML 상세 생성기', 'MML 생성', '≋', '6채널 배정, 세부 옵션, 피아노롤과 미리듣기를 갖춘 상세 MML 생성기입니다.'],
        ['editor', '에디터', 'MML / MIDI 편집', '✎', 'MML·MIDI를 피아노롤에서 편집하고 채널, 템포, 참조 오디오를 프로젝트로 관리합니다.'],
        ['rollscriptor', '롤 스크립터', '영상 → MIDI', '▥', '피아노 롤 영상을 분석해 건반의 Note On/Off를 MIDI로 복원합니다.'],
        ['veloscriptor', '벨로 스크립터', '오디오 → Velocity', '↟', 'MIDI와 동일 연주의 오디오를 비교해 각 노트의 Velocity를 다시 계산합니다.'],
        ['mobibeats', '모비비츠', '리듬 게임', '◆', 'MML 또는 MIDI에서 4·5·6키 리듬 차트를 만들고 바로 플레이합니다.']
      ]
    },
    ja: {
      brand: 'モビバード',
      subtitle: '演奏ファイルの変換、MML作成、編集、解析、リズムプレイをブラウザーで利用できる音楽ツール集です。',
      language: '言語', open: '開く →', footer: 'すべてのツールはブラウザー上で動作します。',
      theme: 'テーマ', themeLight: 'ライト', themeDark: 'ダーク',
      event: { kicker: 'イベント開催中', title: '利用アンケートイベント', description: 'MobiBardをご利用いただいた感想をアンケートでお聞かせください。イベント期間中のみ実施します。', deadline: '締切:2026年12月23日(水)23:59まで', link: 'アンケートに参加 →' },
      soundfont: { kicker: '公開音色ファイル', title: 'MobiBard Instruments SF3 / DLS', description: 'MobiBardの標準音色をオリジナルSF3と互換用DLSファイルで提供します。どちらのファイルURLもそのまま共有したり、他のプロジェクトから直接利用できます。', license: 'startdust-io が制作し、MIT License で配布しています。個人・商用利用、複製、改変、変換、再配布、ミラーリング、直接リンクを許可します。ファイルを再配布する際は著作権表示とライセンス文を同梱してください。', downloadLabel: 'ダウンロード', licenseLink: 'MITライセンス', guideLink: '互換方法' },
      products: [
        ['simple', 'MML簡単ジェネレーター', 'MML作成', '♪', '複雑な設定なしで演奏ファイルを最大3チャンネルのMMLへ素早く変換します。'],
        ['player', 'MML詳細ジェネレーター', 'MML作成', '≋', '6チャンネル割り当て、詳細設定、ピアノロールとプレビューを備えたMML作成ツールです。'],
        ['editor', 'エディター', 'MML / MIDI編集', '✎', 'MML・MIDIをピアノロールで編集し、チャンネル、テンポ、参照音源をプロジェクトとして管理します。'],
        ['rollscriptor', 'ロールスクリプター', '動画 → MIDI', '▥', 'ピアノロール動画を解析し、鍵盤のNote On/OffをMIDIとして復元します。'],
        ['veloscriptor', 'ヴェロスクリプター', '音源 → Velocity', '↟', 'MIDIと同じ演奏の音源を比較し、各ノートのVelocityを再計算します。'],
        ['mobibeats', 'モビビーツ', 'リズムゲーム', '◆', 'MMLまたはMIDIから4・5・6キーのリズム譜面を作成してすぐにプレイできます。']
      ]
    },
    en: {
      brand: 'Mobibard',
      subtitle: 'A browser-based music toolkit for converting performance files, creating and editing MML, analysis, and rhythm play.',
      language: 'Language', open: 'Open →', footer: 'All tools run in your browser.',
      theme: 'Theme', themeLight: 'Light', themeDark: 'Dark',
      event: { kicker: 'Event in progress', title: 'Feedback survey event', description: 'Tell us about your experience with MobiBard in a short survey. Available only during the event period.', deadline: 'Deadline: until Wed, Dec 23, 2026, 23:59 (KST)', link: 'Take the survey →' },
      soundfont: { kicker: 'Public sound files', title: 'MobiBard Instruments SF3 / DLS', description: 'MobiBard’s default sound set is provided as the original SF3 and a compatible DLS version. You may share either file URL as-is or use it directly in other projects.', license: 'Made by startdust-io and released under the MIT License. Personal and commercial use, copying, modification, conversion, redistribution, mirroring, and direct linking are permitted; include the copyright notice and license text when you redistribute the files.', downloadLabel: 'Download', licenseLink: 'MIT License', guideLink: 'How to make compatible' },
      products: [
        ['simple', 'MML Simple Generator', 'MML creator', '♪', 'Quickly convert performance files into up to three MML channels with minimal setup.'],
        ['player', 'MML Detailed Generator', 'MML creator', '≋', 'A detailed six-channel MML creator with assignment controls, options, piano roll, and preview.'],
        ['editor', 'Editor', 'MML / MIDI editor', '✎', 'Edit MML and MIDI on a piano roll and manage channels, tempo, and reference audio as a project.'],
        ['rollscriptor', 'RollScriptor', 'Video → MIDI', '▥', 'Analyze piano-roll videos and reconstruct keyboard Note On/Off events as MIDI.'],
        ['veloscriptor', 'VeloScriptor', 'Audio → Velocity', '↟', 'Compare MIDI with matching audio and recalculate the velocity of each note.'],
        ['mobibeats', 'MobiBeats', 'Rhythm game', '◆', 'Create 4-, 5-, or 6-key rhythm charts from MML or MIDI and play them instantly.']
      ]
    },
    'zh-CN': {
      brand: 'Mobibard',
      subtitle: '在浏览器中完成演奏文件转换、MML制作与编辑、分析以及节奏游戏的一组音乐工具。',
      language: '语言', open: '打开 →', footer: '所有工具均在浏览器中运行。',
      theme: '主题', themeLight: '浅色', themeDark: '深色',
      event: { kicker: '活动进行中', title: '使用问卷活动', description: '欢迎通过问卷分享您使用MobiBard的体验。仅在活动期间开放。', deadline: '截止时间:2026年12月23日(周三)23:59(韩国时间)', link: '参与问卷 →' },
      soundfont: { kicker: '公开音色文件', title: 'MobiBard Instruments SF3 / DLS', description: 'MobiBard默认音色提供原始SF3与兼容DLS两个版本。可以直接分享任一文件链接，也可以在其他项目中直接使用。', license: '由 startdust-io 制作，以 MIT License 发布。允许个人或商业用途，以及复制、修改、转换、再发布、镜像及直接链接；再发布文件时须附上版权声明与许可文本。', downloadLabel: '下载', licenseLink: 'MIT 许可证', guideLink: '兼容方法' },
      products: [
        ['simple', 'MML 简易生成器', 'MML制作', '♪', '无需复杂设置，即可快速将演奏文件转换为最多3个MML声道。'],
        ['player', 'MML 详细生成器', 'MML制作', '≋', '提供6声道分配、详细选项、钢琴卷帘和预览的MML制作工具。'],
        ['editor', '编辑器', 'MML / MIDI编辑', '✎', '在钢琴卷帘中编辑MML与MIDI，并以项目方式管理声道、速度和参考音频。'],
        ['rollscriptor', 'RollScriptor', '视频 → MIDI', '▥', '分析钢琴卷帘视频，并将琴键的Note On/Off还原为MIDI。'],
        ['veloscriptor', 'VeloScriptor', '音频 → Velocity', '↟', '比较MIDI与相同演奏的音频，重新计算每个音符的Velocity。'],
        ['mobibeats', 'MobiBeats', '节奏游戏', '◆', '从MML或MIDI生成4、5、6键节奏谱面并立即游玩。']
      ]
    },
    'zh-TW': {
      brand: 'Mobibard',
      subtitle: '可在瀏覽器中完成演奏檔轉換、MML製作與編輯、分析及節奏遊戲的一組音樂工具。',
      language: '語言', open: '開啟 →', footer: '所有工具皆在瀏覽器中執行。',
      theme: '主題', themeLight: '淺色', themeDark: '深色',
      event: { kicker: '活動進行中', title: '使用問卷活動', description: '歡迎透過問卷分享您使用MobiBard的體驗。僅在活動期間開放。', deadline: '截止時間:2026年12月23日(週三)23:59(韓國時間)', link: '參加問卷 →' },
      soundfont: { kicker: '公開音色檔案', title: 'MobiBard Instruments SF3 / DLS', description: 'MobiBard預設音色提供原始SF3與相容DLS兩個版本。可以直接分享任一檔案連結，也可以在其他專案中直接使用。', license: '由 startdust-io 製作，以 MIT License 發布。允許個人或商業用途，以及複製、修改、轉換、再散布、鏡像及直接連結；再散布檔案時須附上著作權聲明與授權條款。', downloadLabel: '下載', licenseLink: 'MIT 授權', guideLink: '相容方法' },
      products: [
        ['simple', 'MML 簡易產生器', 'MML製作', '♪', '不需複雜設定，即可快速將演奏檔轉換為最多3個MML頻道。'],
        ['player', 'MML 詳細產生器', 'MML製作', '≋', '提供6頻道配置、詳細選項、鋼琴捲軸與預覽的MML製作工具。'],
        ['editor', '編輯器', 'MML / MIDI編輯', '✎', '在鋼琴捲軸中編輯MML與MIDI，並以專案管理頻道、速度與參考音訊。'],
        ['rollscriptor', 'RollScriptor', '影片 → MIDI', '▥', '分析鋼琴捲軸影片，並將琴鍵的Note On/Off還原為MIDI。'],
        ['veloscriptor', 'VeloScriptor', '音訊 → Velocity', '↟', '比較MIDI與相同演奏的音訊，重新計算每個音符的Velocity。'],
        ['mobibeats', 'MobiBeats', '節奏遊戲', '◆', '從MML或MIDI建立4、5、6鍵節奏譜面並立即遊玩。']
      ]
    }
  };

  const pathById = {
    simple: 'simple/index.html',
    player: 'player/index.html',
    rollscriptor: 'rollscriptor/index.html',
    veloscriptor: 'veloscriptor/index.html',
    editor: 'editor/index.html',
    mobibeats: 'mobibeats/index.html'
  };

  const select = document.getElementById('languageSelect');
  const grid = document.getElementById('productGrid');
  const homeTitle = document.getElementById('homeTitle');
  const subtitle = document.getElementById('homeSubtitle');
  const languageLabel = document.getElementById('languageLabel');
  const themeToggle = document.getElementById('themeToggle');
  const footerText = document.getElementById('footerText');
  const eventKicker = document.getElementById('eventKicker');
  const eventTitle = document.getElementById('eventTitle');
  const eventDescription = document.getElementById('eventDescription');
  const eventDeadline = document.getElementById('eventDeadline');
  const eventLink = document.getElementById('eventLink');
  const soundfontKicker = document.getElementById('soundfontKicker');
  const soundfontTitle = document.getElementById('soundfontTitle');
  const soundfontDescription = document.getElementById('soundfontDescription');
  const soundfontLicense = document.getElementById('soundfontLicense');
  const soundfontDownloadLabel = document.getElementById('soundfontDownloadLabel');
  const soundfontDownloadSf3 = document.getElementById('soundfontDownloadSf3');
  const soundfontDownloadDls = document.getElementById('soundfontDownloadDls');
  const soundfontLicenseLink = document.getElementById('soundfontLicenseLink');
  const soundfontGuideLink = document.getElementById('soundfontGuideLink');
  document.addEventListener('click', (event) => {
    document.querySelectorAll('.soundfont-dl[open]').forEach((d) => { if (!d.contains(event.target)) d.removeAttribute('open'); });
  });
  document.querySelectorAll('.soundfont-dl').forEach((d) => d.addEventListener('toggle', () => {
    if (d.open) document.querySelectorAll('.soundfont-dl[open]').forEach((o) => { if (o !== d) o.removeAttribute('open'); });
  }));

  function initialLanguage() {
    const query = normalizeLanguage(new URLSearchParams(location.search).get('lang'));
    if (new URLSearchParams(location.search).has('lang')) return query;
    try {
      const saved = localStorage.getItem(LANGUAGE_KEY);
      if (saved) return normalizeLanguage(saved);
    } catch (_) {}
    return normalizeLanguage(navigator.language);
  }

  const THEME_KEY = 'mobibard.player.theme';
  let currentLang = 'ko';

  function currentTheme() {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  }

  // 버튼은 ◐ 문자만 보여주고, 설명은 접근성 이름과 툴팁으로만 둡니다.
  function renderTheme() {
    const text = copy[supported.has(currentLang) ? currentLang : 'ko'];
    themeToggle.setAttribute('aria-label', text.theme);
    themeToggle.title = text.theme;
    themeToggle.setAttribute('aria-pressed', String(currentTheme() === 'dark'));
  }

  function render(lang) {
    const safe = supported.has(lang) ? lang : 'ko';
    const text = copy[safe];
    currentLang = safe;
    document.documentElement.lang = safe;
    document.title = `${text.brand} v6.0`;
    select.value = safe;
    homeTitle.textContent = text.brand;
    subtitle.textContent = text.subtitle;
    languageLabel.textContent = text.language;
    select.setAttribute('aria-label', text.language);
    footerText.textContent = text.footer;
    renderTheme();
    eventKicker.textContent = text.event.kicker;
    eventTitle.textContent = text.event.title;
    eventDescription.textContent = text.event.description;
    eventDeadline.textContent = text.event.deadline;
    eventLink.textContent = text.event.link;
    soundfontKicker.textContent = text.soundfont.kicker;
    soundfontTitle.textContent = text.soundfont.title;
    soundfontDescription.textContent = text.soundfont.description;
    soundfontLicense.textContent = text.soundfont.license;
    soundfontDownloadLabel.textContent = text.soundfont.downloadLabel;
    soundfontDownloadSf3.textContent = 'SF3';
    soundfontDownloadDls.textContent = 'DLS';
    soundfontLicenseLink.textContent = text.soundfont.licenseLink;
    soundfontGuideLink.textContent = text.soundfont.guideLink;
    soundfontGuideLink.href = 'soundfont-compat.html?lang=' + encodeURIComponent(currentLang || '');
    grid.replaceChildren();

    text.products.forEach(([id, name, kind, icon, description]) => {
      const link = document.createElement('a');
      link.className = 'product-card';
      link.href = `${pathById[id]}?lang=${encodeURIComponent(safe)}`;
      link.title = `${name} – ${description}`;
      link.innerHTML = `
        <div class="product-top">
          <span class="product-icon" aria-hidden="true">${icon}</span>
          <span class="product-kind">${kind}</span>
        </div>
        <h2 class="product-name">${name}${id === 'editor' ? '<span class="beta-badge">Gamma</span>' : ''}</h2>
        <p class="product-description">${description}</p>
        <span class="product-open">${text.open}</span>`;
      grid.append(link);
    });
  }

  themeToggle.addEventListener('click', () => {
    const next = currentTheme() === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
    renderTheme();
  });

  const lang = initialLanguage();
  render(lang);
  select.addEventListener('change', () => {
    const next = normalizeLanguage(select.value);
    try { localStorage.setItem(LANGUAGE_KEY, next); } catch (_) {}
    const url = new URL(location.href);
    url.searchParams.set('lang', next);
    history.replaceState(null, '', url);
    render(next);
  });
})();
