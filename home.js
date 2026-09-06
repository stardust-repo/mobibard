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
      subtitle: '연주 파일 변환, MML 제작, 편집, 분석과 리듬 플레이를 브라우저 한 곳에서 이용할 수 있는 음악 도구 모음입니다.',
      language: '언어', open: '열기 →', footer: '모든 도구는 브라우저에서 실행됩니다.',
      soundfont: { kicker: '공개 음색 파일', title: 'MobiBard Instruments SF3 / DLS', description: '모비바드의 기본 음색을 원본 SF3와 호환용 DLS 파일로 제공합니다. 두 파일의 URL을 그대로 공유하거나 다른 프로젝트에서 직접 사용할 수 있습니다.', license: '개인·상업적 이용, 복사, 수정, 변환, 재배포, 미러링 및 직접 링크를 모두 자유롭게 허용합니다. 출처 표기나 별도 허가는 필요하지 않습니다.', downloadSf3: 'SF3 다운로드', downloadDls: 'DLS 다운로드', licenseLink: '자유 이용 안내' },
      products: [
        ['simple', '간편 모드', 'MML 생성', '♪', '연주 파일을 복잡한 설정 없이 빠르게 최대 3채널 MML로 변환합니다.'],
        ['player', '상세 모드', 'MML 생성', '≋', '6채널 배정, 세부 옵션, 피아노롤과 미리듣기를 갖춘 상세 MML 생성기입니다.'],
        ['editor', '에디터', 'MML / MIDI 편집', '✎', 'MML·MIDI를 피아노롤에서 편집하고 채널, 템포, 참조 오디오를 프로젝트로 관리합니다.'],
        ['rollscriptor', '롤 스크립터', '영상 → MIDI', '▥', '피아노 롤 영상을 분석해 건반의 Note On/Off를 MIDI로 복원합니다.'],
        ['veloscriptor', '벨로 스크립터', '오디오 → Velocity', '↟', 'MIDI와 동일 연주의 오디오를 비교해 각 노트의 Velocity를 다시 계산합니다.'],
        ['mobibeats', '모비비츠', '리듬 게임', '◆', 'MML 또는 MIDI에서 4·5·6키 리듬 차트를 만들고 바로 플레이합니다.']
      ]
    },
    ja: {
      subtitle: '演奏ファイルの変換、MML作成、編集、解析、リズムプレイをブラウザーで利用できる音楽ツール集です。',
      language: '言語', open: '開く →', footer: 'すべてのツールはブラウザー上で動作します。',
      soundfont: { kicker: '公開音色ファイル', title: 'MobiBard Instruments SF3 / DLS', description: 'MobiBardの標準音色をオリジナルSF3と互換用DLSファイルで提供します。どちらのファイルURLもそのまま共有したり、他のプロジェクトから直接利用できます。', license: '個人・商用利用、複製、改変、変換、再配布、ミラーリング、直接リンクをすべて自由に許可します。クレジット表記や個別の許可は不要です。', downloadSf3: 'SF3をダウンロード', downloadDls: 'DLSをダウンロード', licenseLink: '自由利用について' },
      products: [
        ['simple', '簡単モード', 'MML作成', '♪', '複雑な設定なしで演奏ファイルを最大3チャンネルのMMLへ素早く変換します。'],
        ['player', '詳細モード', 'MML作成', '≋', '6チャンネル割り当て、詳細設定、ピアノロールとプレビューを備えたMML作成ツールです。'],
        ['editor', 'エディター', 'MML / MIDI編集', '✎', 'MML・MIDIをピアノロールで編集し、チャンネル、テンポ、参照音源をプロジェクトとして管理します。'],
        ['rollscriptor', 'ロールスクリプター', '動画 → MIDI', '▥', 'ピアノロール動画を解析し、鍵盤のNote On/OffをMIDIとして復元します。'],
        ['veloscriptor', 'ヴェロスクリプター', '音源 → Velocity', '↟', 'MIDIと同じ演奏の音源を比較し、各ノートのVelocityを再計算します。'],
        ['mobibeats', 'モビビーツ', 'リズムゲーム', '◆', 'MMLまたはMIDIから4・5・6キーのリズム譜面を作成してすぐにプレイできます。']
      ]
    },
    en: {
      subtitle: 'A browser-based music toolkit for converting performance files, creating and editing MML, analysis, and rhythm play.',
      language: 'Language', open: 'Open →', footer: 'All tools run in your browser.',
      soundfont: { kicker: 'Public sound files', title: 'MobiBard Instruments SF3 / DLS', description: 'MobiBard’s default sound set is provided as the original SF3 and a compatible DLS version. You may share either file URL as-is or use it directly in other projects.', license: 'Personal and commercial use, copying, modification, conversion, redistribution, mirroring, and direct linking are all freely permitted. No attribution or separate permission is required.', downloadSf3: 'Download SF3', downloadDls: 'Download DLS', licenseLink: 'Free-use notice' },
      products: [
        ['simple', 'Simple mode', 'MML creator', '♪', 'Quickly convert performance files into up to three MML channels with minimal setup.'],
        ['player', 'Detailed mode', 'MML creator', '≋', 'A detailed six-channel MML creator with assignment controls, options, piano roll, and preview.'],
        ['editor', 'Editor', 'MML / MIDI editor', '✎', 'Edit MML and MIDI on a piano roll and manage channels, tempo, and reference audio as a project.'],
        ['rollscriptor', 'RollScriptor', 'Video → MIDI', '▥', 'Analyze piano-roll videos and reconstruct keyboard Note On/Off events as MIDI.'],
        ['veloscriptor', 'VeloScriptor', 'Audio → Velocity', '↟', 'Compare MIDI with matching audio and recalculate the velocity of each note.'],
        ['mobibeats', 'MobiBeats', 'Rhythm game', '◆', 'Create 4-, 5-, or 6-key rhythm charts from MML or MIDI and play them instantly.']
      ]
    },
    'zh-CN': {
      subtitle: '在浏览器中完成演奏文件转换、MML制作与编辑、分析以及节奏游戏的一组音乐工具。',
      language: '语言', open: '打开 →', footer: '所有工具均在浏览器中运行。',
      soundfont: { kicker: '公开音色文件', title: 'MobiBard Instruments SF3 / DLS', description: 'MobiBard默认音色提供原始SF3与兼容DLS两个版本。可以直接分享任一文件链接，也可以在其他项目中直接使用。', license: '允许自由用于个人或商业用途，也允许复制、修改、转换、再发布、镜像及直接链接。无需署名或另行取得许可。', downloadSf3: '下载SF3', downloadDls: '下载DLS', licenseLink: '自由使用说明' },
      products: [
        ['simple', '简易模式', 'MML制作', '♪', '无需复杂设置，即可快速将演奏文件转换为最多3个MML声道。'],
        ['player', '详细模式', 'MML制作', '≋', '提供6声道分配、详细选项、钢琴卷帘和预览的MML制作工具。'],
        ['editor', '编辑器', 'MML / MIDI编辑', '✎', '在钢琴卷帘中编辑MML与MIDI，并以项目方式管理声道、速度和参考音频。'],
        ['rollscriptor', 'RollScriptor', '视频 → MIDI', '▥', '分析钢琴卷帘视频，并将琴键的Note On/Off还原为MIDI。'],
        ['veloscriptor', 'VeloScriptor', '音频 → Velocity', '↟', '比较MIDI与相同演奏的音频，重新计算每个音符的Velocity。'],
        ['mobibeats', 'MobiBeats', '节奏游戏', '◆', '从MML或MIDI生成4、5、6键节奏谱面并立即游玩。']
      ]
    },
    'zh-TW': {
      subtitle: '可在瀏覽器中完成演奏檔轉換、MML製作與編輯、分析及節奏遊戲的一組音樂工具。',
      language: '語言', open: '開啟 →', footer: '所有工具皆在瀏覽器中執行。',
      soundfont: { kicker: '公開音色檔案', title: 'MobiBard Instruments SF3 / DLS', description: 'MobiBard預設音色提供原始SF3與相容DLS兩個版本。可以直接分享任一檔案連結，也可以在其他專案中直接使用。', license: '允許自由用於個人或商業用途，也允許複製、修改、轉換、再散布、鏡像及直接連結。無需標示出處或另行取得許可。', downloadSf3: '下載SF3', downloadDls: '下載DLS', licenseLink: '自由使用說明' },
      products: [
        ['simple', '簡易模式', 'MML製作', '♪', '不需複雜設定，即可快速將演奏檔轉換為最多3個MML頻道。'],
        ['player', '詳細模式', 'MML製作', '≋', '提供6頻道配置、詳細選項、鋼琴捲軸與預覽的MML製作工具。'],
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
  const subtitle = document.getElementById('homeSubtitle');
  const languageLabel = document.getElementById('languageLabel');
  const footerText = document.getElementById('footerText');
  const soundfontKicker = document.getElementById('soundfontKicker');
  const soundfontTitle = document.getElementById('soundfontTitle');
  const soundfontDescription = document.getElementById('soundfontDescription');
  const soundfontLicense = document.getElementById('soundfontLicense');
  const soundfontDownloadSf3 = document.getElementById('soundfontDownloadSf3');
  const soundfontDownloadDls = document.getElementById('soundfontDownloadDls');
  const soundfontLicenseLink = document.getElementById('soundfontLicenseLink');

  function initialLanguage() {
    const query = normalizeLanguage(new URLSearchParams(location.search).get('lang'));
    if (new URLSearchParams(location.search).has('lang')) return query;
    try {
      const saved = localStorage.getItem(LANGUAGE_KEY);
      if (saved) return normalizeLanguage(saved);
    } catch (_) {}
    return normalizeLanguage(navigator.language);
  }

  function render(lang) {
    const safe = supported.has(lang) ? lang : 'ko';
    const text = copy[safe];
    document.documentElement.lang = safe;
    select.value = safe;
    subtitle.textContent = text.subtitle;
    languageLabel.textContent = text.language;
    select.setAttribute('aria-label', text.language);
    footerText.textContent = text.footer;
    soundfontKicker.textContent = text.soundfont.kicker;
    soundfontTitle.textContent = text.soundfont.title;
    soundfontDescription.textContent = text.soundfont.description;
    soundfontLicense.textContent = text.soundfont.license;
    soundfontDownloadSf3.textContent = text.soundfont.downloadSf3;
    soundfontDownloadDls.textContent = text.soundfont.downloadDls;
    soundfontLicenseLink.textContent = text.soundfont.licenseLink;
    grid.replaceChildren();

    text.products.forEach(([id, name, kind, icon, description]) => {
      const link = document.createElement('a');
      link.className = 'product-card';
      link.href = `${pathById[id]}?lang=${encodeURIComponent(safe)}`;
      link.innerHTML = `
        <div class="product-top">
          <span class="product-icon" aria-hidden="true">${icon}</span>
          <span class="product-kind">${kind}</span>
        </div>
        <h2 class="product-name">${name}${id === 'editor' ? '<span class="alpha-badge">alpha</span>' : ''}</h2>
        <p class="product-description">${description}</p>
        <span class="product-open">${text.open}</span>`;
      grid.append(link);
    });
  }

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
