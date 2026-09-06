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
      products: [
        ['simple', '간편 모드', 'MML 생성', '♪', '연주 파일을 복잡한 설정 없이 빠르게 최대 3채널 MML로 변환합니다.'],
        ['player', '상세 모드', 'MML 생성', '≋', '6채널 배정, 세부 옵션, 피아노롤과 미리듣기를 갖춘 상세 MML 생성기입니다.'],
        ['rollscriptor', '롤 스크립터', '영상 → MIDI', '▥', '피아노 롤 영상을 분석해 건반의 Note On/Off를 MIDI로 복원합니다.'],
        ['veloscriptor', '벨로 스크립터', '오디오 → Velocity', '↟', 'MIDI와 동일 연주의 오디오를 비교해 각 노트의 Velocity를 다시 계산합니다.'],
        ['editor', '에디터', 'MML / MIDI 편집', '✎', 'MML·MIDI를 피아노롤에서 편집하고 채널, 템포, 참조 오디오를 프로젝트로 관리합니다.'],
        ['mobibeats', '모비비츠', '리듬 게임', '◆', 'MML 또는 MIDI에서 4·5·6키 리듬 차트를 만들고 바로 플레이합니다.']
      ]
    },
    ja: {
      subtitle: '演奏ファイルの変換、MML作成、編集、解析、リズムプレイをブラウザーで利用できる音楽ツール集です。',
      language: '言語', open: '開く →', footer: 'すべてのツールはブラウザー上で動作します。',
      products: [
        ['simple', '簡単モード', 'MML作成', '♪', '複雑な設定なしで演奏ファイルを最大3チャンネルのMMLへ素早く変換します。'],
        ['player', '詳細モード', 'MML作成', '≋', '6チャンネル割り当て、詳細設定、ピアノロールとプレビューを備えたMML作成ツールです。'],
        ['rollscriptor', 'ロールスクリプター', '動画 → MIDI', '▥', 'ピアノロール動画を解析し、鍵盤のNote On/OffをMIDIとして復元します。'],
        ['veloscriptor', 'ヴェロスクリプター', '音源 → Velocity', '↟', 'MIDIと同じ演奏の音源を比較し、各ノートのVelocityを再計算します。'],
        ['editor', 'エディター', 'MML / MIDI編集', '✎', 'MML・MIDIをピアノロールで編集し、チャンネル、テンポ、参照音源をプロジェクトとして管理します。'],
        ['mobibeats', 'モビビーツ', 'リズムゲーム', '◆', 'MMLまたはMIDIから4・5・6キーのリズム譜面を作成してすぐにプレイできます。']
      ]
    },
    en: {
      subtitle: 'A browser-based music toolkit for converting performance files, creating and editing MML, analysis, and rhythm play.',
      language: 'Language', open: 'Open →', footer: 'All tools run in your browser.',
      products: [
        ['simple', 'Simple mode', 'MML creator', '♪', 'Quickly convert performance files into up to three MML channels with minimal setup.'],
        ['player', 'Detailed mode', 'MML creator', '≋', 'A detailed six-channel MML creator with assignment controls, options, piano roll, and preview.'],
        ['rollscriptor', 'RollScriptor', 'Video → MIDI', '▥', 'Analyze piano-roll videos and reconstruct keyboard Note On/Off events as MIDI.'],
        ['veloscriptor', 'VeloScriptor', 'Audio → Velocity', '↟', 'Compare MIDI with matching audio and recalculate the velocity of each note.'],
        ['editor', 'Editor', 'MML / MIDI editor', '✎', 'Edit MML and MIDI on a piano roll and manage channels, tempo, and reference audio as a project.'],
        ['mobibeats', 'MobiBeats', 'Rhythm game', '◆', 'Create 4-, 5-, or 6-key rhythm charts from MML or MIDI and play them instantly.']
      ]
    },
    'zh-CN': {
      subtitle: '在浏览器中完成演奏文件转换、MML制作与编辑、分析以及节奏游戏的一组音乐工具。',
      language: '语言', open: '打开 →', footer: '所有工具均在浏览器中运行。',
      products: [
        ['simple', '简易模式', 'MML制作', '♪', '无需复杂设置，即可快速将演奏文件转换为最多3个MML声道。'],
        ['player', '详细模式', 'MML制作', '≋', '提供6声道分配、详细选项、钢琴卷帘和预览的MML制作工具。'],
        ['rollscriptor', 'RollScriptor', '视频 → MIDI', '▥', '分析钢琴卷帘视频，并将琴键的Note On/Off还原为MIDI。'],
        ['veloscriptor', 'VeloScriptor', '音频 → Velocity', '↟', '比较MIDI与相同演奏的音频，重新计算每个音符的Velocity。'],
        ['editor', '编辑器', 'MML / MIDI编辑', '✎', '在钢琴卷帘中编辑MML与MIDI，并以项目方式管理声道、速度和参考音频。'],
        ['mobibeats', 'MobiBeats', '节奏游戏', '◆', '从MML或MIDI生成4、5、6键节奏谱面并立即游玩。']
      ]
    },
    'zh-TW': {
      subtitle: '可在瀏覽器中完成演奏檔轉換、MML製作與編輯、分析及節奏遊戲的一組音樂工具。',
      language: '語言', open: '開啟 →', footer: '所有工具皆在瀏覽器中執行。',
      products: [
        ['simple', '簡易模式', 'MML製作', '♪', '不需複雜設定，即可快速將演奏檔轉換為最多3個MML頻道。'],
        ['player', '詳細模式', 'MML製作', '≋', '提供6頻道配置、詳細選項、鋼琴捲軸與預覽的MML製作工具。'],
        ['rollscriptor', 'RollScriptor', '影片 → MIDI', '▥', '分析鋼琴捲軸影片，並將琴鍵的Note On/Off還原為MIDI。'],
        ['veloscriptor', 'VeloScriptor', '音訊 → Velocity', '↟', '比較MIDI與相同演奏的音訊，重新計算每個音符的Velocity。'],
        ['editor', '編輯器', 'MML / MIDI編輯', '✎', '在鋼琴捲軸中編輯MML與MIDI，並以專案管理頻道、速度與參考音訊。'],
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
