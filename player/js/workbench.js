(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const el = (tag, className = "", attrs = {}) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null) continue;
      if (key === "text") node.textContent = String(value);
      else if (key === "hidden") node.hidden = Boolean(value);
      else if (key === "checked") node.checked = Boolean(value);
      else node.setAttribute(key, String(value));
    }
    return node;
  };

  const STRINGS = {
    ko: {
      loadFile: "로컬 파일",
      driveLoad: "구글 파일",
      dropHint: "또는 파일을 여기에 드롭하세요",
      noFile: "파일을 불러오세요",
      supported: "지원 파일",
      sourceReady: "불러옴",
      mmlFold: "재생해볼 MML 코드",
      mmlFoldHint: "필요할 때만 펼쳐 확인하거나 직접 수정합니다.",
      channelWaiting: "MIDI 계열 파일을 불러오면 이 채널에 배정할 악기와 역할이 표시됩니다.",
      rest: "쉼표 제거",
      keep: "그대로",
      rest64: "64박",
      rest32: "32박",
      rest16: "16박",
      rest8: "8박",
      rest4: "4박",
      all: "모두",
      volume: "볼륨",
      octave: "옥타브",
      dynamics: "볼륨 생성",
      overwrite: "기존 볼륨 덮어쓰기",
      style: "스타일",
      strength: "강도",
      accompanimentRole: "반주 채널 역할",
      useForAnalysis: "분석에 사용",
      useForGeneration: "이 채널에 반주 생성",
      leading: "시작 공백",
      quarterNotes: "4분음표",
      use: "사용",
      seconds: "초",
      tempoScale: "템포 배율",
      tempoClean: "템포 정리",
      tempoMarkerHelp: "타임라인의 T 숫자를 누르면 해당 위치의 템포를 팝업에서 수정할 수 있습니다.",
      accompaniment: "반주 생성",
      pop: "팝",
      jazz: "재즈",
      ballad: "발라드",
      bossa: "보사노바",
      rock: "록",
      funk: "펑크",
      classical: "클래식",
      light: "약하게",
      normal: "보통",
      strong: "강하게",
      copyAll: "전체 악보",
      copy: "복사",
      copied: "복사됨",
      splitCopy: "분할 악보",
      splitLimit: "글자 수",
      splitSearch: "분할 탐색지점",
      splitPage: "악보 {0}",
      splitPages: "{0}개 악보",
      splitNoNeed: "현재 글자 수에서는 분할할 필요가 없습니다.",
      saveFile: "로컬 저장",
      saveDrive: "Google 저장",
      error: "옵션 적용 중 오류",
      external: "외부 기능",
      mobibeat: "모비비트",
      sourceBasedNotice: "원본과 현재 옵션을 기준으로 MML이 다시 생성되었습니다.",
      manualEdited: "직접 수정됨",
      close: "닫기",
      confirm: "확인",
      cancel: "취소",
      promptValue: "입력값",
      tempoLane: "TEMPO",
      assignment: "악기 · 역할 배정",
      codeEdit: "코드 편집",
      codeClose: "코드 닫기",
      codeHelp: "코드 도움말",
      pasteMml: "붙여넣기",
      pasteHint: "MML 코드를 붙여넣으면 새 원본으로 불러옵니다.",
      pasteApply: "불러오기",
      chars: "자",
      quantize: "양자화",
      quantize64: "64박",
      quantize32: "32박",
      allChannels: "전체 채널",
      mixedValues: "채널별 값이 다릅니다",
      applyAll: "일괄 적용",
      restRemoved: "{0}개",
      restRemovedNone: "0개",
      volumeDistribution: "{0}",
      noVolumeNotes: "0개",
      role: "역할",
      overlap: "겹침",
      accompanimentChannel: "반주",
      melShort: "멜",
      genreSelect: "장르 선택",
      tempoCleanEnabled: "적용",
      tempoCleanEnabledCount: "적용 · {0}개 삭제",
      tempoCleanDisabled: "미적용",
      apply: "적용",
      instrumentPending: "악기 설정 변경 사항을 적용해 주세요.",
      channelPending: "채널 옵션 변경 사항을 적용해 주세요.",
      channelApplied: "채널 옵션을 적용했습니다.",
      channelCancelled: "채널 옵션 변경을 취소했습니다.",
      instrumentCancelled: "악기 설정 변경을 취소했습니다.",
      pendingExportTitle: "적용되지 않은 변경 사항",
      pendingExportCopy: "아직 적용하지 않은 설정 변경이 있습니다. 이 변경 내용은 복사 결과에 포함되지 않습니다. 현재 적용된 악보를 그대로 복사할까요?",
      pendingExportSave: "아직 적용하지 않은 설정 변경이 있습니다. 이 변경 내용은 저장 결과에 포함되지 않습니다. 현재 적용된 악보를 그대로 저장할까요?",
      pendingExportCopyConfirm: "현재 상태로 복사",
      pendingExportSaveConfirm: "현재 상태로 저장",
      pendingExportBack: "돌아가기",
      execute: "실행",
      restoreSuffix: "복원",
      previewPending: "미적용 설정으로 미리 재생합니다.",
      octaveRange: "옥타브 범위",
      noNotes: "음표 없음",
      copyToast: "MML 코드를 복사했습니다.",
      itemCount: "{0}개",
      channelApply: "적용 채널",
      volumeSummary: "볼륨 정보",
      codeChars: "글자 수",
      codeRests: "쉼표",
      codeVolumes: "볼륨"
    ,
      playbackPosition: "재생 위치",
      increaseQuarterSecond: "0.25초 증가",
      decreaseQuarterSecond: "0.25초 감소",
      increaseValue: "{0} 증가",
      decreaseValue: "{0} 감소",
      playbackChannels: "재생 채널",
      selectChannel: "채널 선택"
    },
    en: {
      loadFile: "Local file",
      driveLoad: "Google file",
      dropHint: "or drop a file here",
      noFile: "Load a music file",
      supported: "Supported files",
      sourceReady: "Loaded",
      mmlFold: "MML to preview",
      mmlFoldHint: "Expand only when you need to inspect or manually edit it.",
      channelWaiting: "Load a MIDI-family file to assign instruments and a role to this channel.",
      rest: "Remove rests",
      keep: "Keep",
      rest64: "64th",
      rest32: "32nd",
      rest16: "16th",
      rest8: "8th",
      rest4: "Quarter",
      all: "All",
      volume: "Volume",
      octave: "Octave",
      dynamics: "Generate volume",
      overwrite: "Overwrite existing volume",
      style: "Style",
      strength: "Strength",
      accompanimentRole: "Accompaniment role",
      useForAnalysis: "Use for analysis",
      useForGeneration: "Generate accompaniment here",
      leading: "Start gap",
      quarterNotes: "quarter notes",
      use: "Enable",
      seconds: "sec",
      tempoScale: "Tempo multiplier",
      tempoClean: "Clean tempos",
      tempoMarkerHelp: "Select a T marker on the timeline to edit that tempo in a popup.",
      accompaniment: "Generate accompaniment",
      pop: "Pop",
      jazz: "Jazz",
      ballad: "Ballad",
      bossa: "Bossa nova",
      rock: "Rock",
      funk: "Funk",
      classical: "Classical",
      light: "Light",
      normal: "Normal",
      strong: "Strong",
      copyAll: "Full score",
      copy: "Copy",
      copied: "Copied",
      splitCopy: "Split score",
      splitLimit: "Character limit",
      splitSearch: "Split search point",
      splitPage: "Score {0}",
      splitPages: "{0} scores",
      splitNoNeed: "No split is needed at the current character limit.",
      saveFile: "Local save",
      saveDrive: "Google save",
      error: "Option error",
      external: "External tools",
      mobibeat: "MobiBeats",
      sourceBasedNotice: "MML regenerated from the source and current options.",
      manualEdited: "Manual edit",
      close: "Close",
      confirm: "Confirm",
      cancel: "Cancel",
      promptValue: "Value",
      tempoLane: "TEMPO",
      assignment: "Instrument · role assignment",
      codeEdit: "Edit code",
      codeClose: "Close code",
      codeHelp: "Code help",
      pasteMml: "Paste",
      pasteHint: "Paste MML code to load it as a new source.",
      pasteApply: "Load",
      chars: "chars",
      quantize: "Quantize",
      quantize64: "64th",
      quantize32: "32nd",
      allChannels: "All channels",
      mixedValues: "Channels have different values",
      applyAll: "Apply all",
      restRemoved: "{0}",
      restRemovedNone: "0",
      volumeDistribution: "{0}",
      noVolumeNotes: "0",
      role: "Role",
      overlap: "Overlap",
      accompanimentChannel: "Accompaniment",
      melShort: "M",
      genreSelect: "Select genre",
      tempoCleanEnabled: "Applied",
      tempoCleanEnabledCount: "Applied · {0} removed",
      tempoCleanDisabled: "Not applied",
      apply: "Apply",
      instrumentPending: "Apply the pending instrument settings.",
      channelPending: "Apply the pending channel options.",
      channelApplied: "Channel options were applied.",
      channelCancelled: "Channel option changes were cancelled.",
      copyToast: "MML copied.",
      itemCount: "{0}",
      channelApply: "Target channels",
      volumeSummary: "Volume information",
      codeChars: "Characters",
      codeRests: "Rests",
      codeVolumes: "Volumes"
    ,
      instrumentCancelled: "Instrument setting changes were cancelled.",
      pendingExportTitle: "Unapplied changes",
      pendingExportCopy: "You have unapplied setting changes. They will not be included in the copied result. Copy the currently applied score instead?",
      pendingExportSave: "You have unapplied setting changes. They will not be included in the saved result. Save the currently applied score instead?",
      pendingExportCopyConfirm: "Copy current score",
      pendingExportSaveConfirm: "Save current score",
      pendingExportBack: "Go back",
      execute: "Continue",
      restoreSuffix: "Restore",
      previewPending: "Previewing with unapplied settings.",
      octaveRange: "Octave range",
      noNotes: "No notes",
      playbackPosition: "Playback position",
      increaseQuarterSecond: "Add 0.25 seconds",
      decreaseQuarterSecond: "Remove 0.25 seconds",
      increaseValue: "Increase {0}",
      decreaseValue: "Decrease {0}",
      playbackChannels: "Playback channels",
      selectChannel: "Select channel"
    },
    ja: {
      loadFile: "ローカルファイル",
      driveLoad: "Googleファイル",
      dropHint: "またはファイルをここにドロップ",
      noFile: "音楽ファイルを読み込んでください",
      supported: "対応ファイル",
      sourceReady: "読み込み済み",
      mmlFold: "試聴するMMLコード",
      mmlFoldHint: "必要なときだけ開いて確認または直接編集します。",
      channelWaiting: "MIDI系ファイルを読み込むと、このチャンネルに割り当てる楽器と役割が表示されます。",
      rest: "休符削除",
      keep: "そのまま",
      rest64: "64分音符",
      rest32: "32分音符",
      rest16: "16分音符",
      rest8: "8分音符",
      rest4: "4分音符",
      all: "すべて",
      volume: "音量",
      octave: "オクターブ",
      dynamics: "音量生成",
      overwrite: "既存の音量を上書き",
      style: "スタイル",
      strength: "強さ",
      accompanimentRole: "伴奏チャンネルの役割",
      useForAnalysis: "分析に使用",
      useForGeneration: "このチャンネルに伴奏を生成",
      leading: "開始空白",
      quarterNotes: "4分音符",
      use: "使用",
      seconds: "秒",
      tempoScale: "テンポ倍率",
      tempoClean: "テンポ整理",
      tempoMarkerHelp: "タイムラインのT番号を選ぶと、その位置のテンポをポップアップで編集できます。",
      accompaniment: "伴奏生成",
      pop: "ポップ",
      jazz: "ジャズ",
      ballad: "バラード",
      bossa: "ボサノバ",
      rock: "ロック",
      funk: "ファンク",
      classical: "クラシック",
      light: "弱め",
      normal: "標準",
      strong: "強め",
      copyAll: "全体楽譜",
      copy: "コピー",
      copied: "コピー済み",
      splitCopy: "分割楽譜",
      splitLimit: "文字数",
      splitSearch: "分割検索位置",
      splitPage: "楽譜 {0}",
      splitPages: "楽譜 {0}個",
      splitNoNeed: "現在の文字数では分割する必要はありません。",
      saveFile: "ローカル保存",
      saveDrive: "Google保存",
      error: "オプション適用エラー",
      external: "外部機能",
      mobibeat: "モビビーツ",
      sourceBasedNotice: "元データと現在のオプションを基にMMLを再生成しました。",
      manualEdited: "手動編集済み",
      close: "閉じる",
      confirm: "確認",
      cancel: "キャンセル",
      promptValue: "入力値",
      tempoLane: "テンポ",
      assignment: "楽器・役割の割り当て",
      codeEdit: "コード編集",
      codeClose: "コードを閉じる",
      codeHelp: "コードヘルプ",
      pasteMml: "貼り付け",
      pasteHint: "MMLコードを貼り付けると新しい元データとして読み込みます。",
      pasteApply: "読み込む",
      chars: "文字",
      quantize: "クオンタイズ",
      quantize64: "64分音符",
      quantize32: "32分音符",
      allChannels: "全チャンネル",
      mixedValues: "チャンネルごとに値が異なります",
      applyAll: "一括適用",
      restRemoved: "{0}個",
      restRemovedNone: "0個",
      volumeDistribution: "{0}",
      noVolumeNotes: "0個",
      role: "役割",
      overlap: "重なり",
      accompanimentChannel: "伴奏",
      melShort: "メロ",
      genreSelect: "ジャンルを選択",
      tempoCleanEnabled: "適用",
      tempoCleanEnabledCount: "適用・{0}個削除",
      tempoCleanDisabled: "未適用",
      apply: "適用",
      instrumentPending: "楽器設定の変更を適用してください。",
      channelPending: "チャンネルオプションの変更を適用してください。",
      channelApplied: "チャンネルオプションを適用しました。",
      channelCancelled: "チャンネルオプションの変更を取り消しました。",
      instrumentCancelled: "楽器設定の変更を取り消しました。",
      pendingExportTitle: "未適用の変更があります",
      pendingExportCopy: "まだ適用していない設定変更があります。この変更はコピー結果には含まれません。現在適用済みの楽譜をそのままコピーしますか？",
      pendingExportSave: "まだ適用していない設定変更があります。この変更は保存結果には含まれません。現在適用済みの楽譜をそのまま保存しますか？",
      pendingExportCopyConfirm: "現在の楽譜をコピー",
      pendingExportSaveConfirm: "現在の楽譜を保存",
      pendingExportBack: "戻る",
      execute: "実行",
      restoreSuffix: "復元",
      previewPending: "未適用の設定で一時的に再生します。",
      octaveRange: "オクターブ範囲",
      noNotes: "音符なし",
      copyToast: "MMLコードをコピーしました。",
      itemCount: "{0}個",
      channelApply: "対象チャンネル",
      volumeSummary: "音量情報",
      codeChars: "文字数",
      codeRests: "休符",
      codeVolumes: "音量",
      playbackPosition: "再生位置",
      increaseQuarterSecond: "0.25秒増やす",
      decreaseQuarterSecond: "0.25秒減らす",
      increaseValue: "{0}を増やす",
      decreaseValue: "{0}を減らす",
      playbackChannels: "再生チャンネル",
      selectChannel: "チャンネル選択"
    },
    "zh-CN": {
      loadFile: "本地文件",
      driveLoad: "Google 文件",
      dropHint: "或将文件拖到这里",
      noFile: "请载入音乐文件",
      supported: "支持的文件",
      sourceReady: "已载入",
      mmlFold: "用于试听的 MML 代码",
      mmlFoldHint: "仅在需要查看或手动编辑时展开。",
      channelWaiting: "载入 MIDI 类文件后，此处会显示分配给该声道的乐器和角色。",
      rest: "删除休止符",
      keep: "保持原样",
      rest64: "64分音符",
      rest32: "32分音符",
      rest16: "16分音符",
      rest8: "8分音符",
      rest4: "4分音符",
      all: "全部",
      volume: "音量",
      octave: "八度",
      dynamics: "生成音量",
      overwrite: "覆盖现有音量",
      style: "风格",
      strength: "强度",
      accompanimentRole: "伴奏声道角色",
      useForAnalysis: "用于分析",
      useForGeneration: "在此声道生成伴奏",
      leading: "起始空白",
      quarterNotes: "四分音符",
      use: "启用",
      seconds: "秒",
      tempoScale: "速度倍数",
      tempoClean: "整理速度",
      tempoMarkerHelp: "点击时间轴上的 T 数字，可在弹窗中编辑该位置的速度。",
      accompaniment: "生成伴奏",
      pop: "流行",
      jazz: "爵士",
      ballad: "抒情",
      bossa: "波萨诺瓦",
      rock: "摇滚",
      funk: "放克",
      classical: "古典",
      light: "较弱",
      normal: "标准",
      strong: "较强",
      copyAll: "完整乐谱",
      copy: "复制",
      copied: "已复制",
      splitCopy: "分割乐谱",
      splitLimit: "字符数",
      splitSearch: "分割搜索位置",
      splitPage: "乐谱 {0}",
      splitPages: "{0} 个乐谱",
      splitNoNeed: "当前字符数无需分割。",
      saveFile: "本地保存",
      saveDrive: "Google 保存",
      error: "应用选项时出错",
      external: "外部功能",
      mobibeat: "MobiBeats",
      sourceBasedNotice: "已根据原始数据和当前选项重新生成 MML。",
      manualEdited: "已手动编辑",
      close: "关闭",
      confirm: "确认",
      cancel: "取消",
      promptValue: "输入值",
      tempoLane: "速度",
      assignment: "乐器・角色分配",
      codeEdit: "编辑代码",
      codeClose: "关闭代码",
      codeHelp: "代码帮助",
      pasteMml: "粘贴",
      pasteHint: "粘贴 MML 代码后将作为新的源数据载入。",
      pasteApply: "载入",
      chars: "字符",
      quantize: "量化",
      quantize64: "64分音符",
      quantize32: "32分音符",
      allChannels: "所有声道",
      mixedValues: "各声道的值不同",
      applyAll: "全部应用",
      restRemoved: "{0} 个",
      restRemovedNone: "0 个",
      volumeDistribution: "{0}",
      noVolumeNotes: "0 个",
      role: "角色",
      overlap: "重叠",
      accompanimentChannel: "伴奏",
      melShort: "旋",
      genreSelect: "选择流派",
      tempoCleanEnabled: "已应用",
      tempoCleanEnabledCount: "已应用・删除 {0} 个",
      tempoCleanDisabled: "未应用",
      apply: "应用",
      instrumentPending: "请应用尚未确认的乐器设置。",
      channelPending: "请应用尚未确认的声道选项。",
      channelApplied: "已应用声道选项。",
      channelCancelled: "已取消声道选项的更改。",
      instrumentCancelled: "已取消乐器设置的更改。",
      pendingExportTitle: "存在未应用的更改",
      pendingExportCopy: "还有尚未应用的设置更改。这些更改不会包含在复制结果中。是否改为复制当前已应用的乐谱？",
      pendingExportSave: "还有尚未应用的设置更改。这些更改不会包含在保存结果中。是否改为保存当前已应用的乐谱？",
      pendingExportCopyConfirm: "复制当前乐谱",
      pendingExportSaveConfirm: "保存当前乐谱",
      pendingExportBack: "返回",
      execute: "执行",
      restoreSuffix: "恢复",
      previewPending: "将使用未应用的设置临时试听。",
      octaveRange: "八度范围",
      noNotes: "无音符",
      copyToast: "已复制 MML 代码。",
      itemCount: "{0} 个",
      channelApply: "目标声道",
      volumeSummary: "音量信息",
      codeChars: "字符数",
      codeRests: "休止符",
      codeVolumes: "音量",
      playbackPosition: "播放位置",
      increaseQuarterSecond: "增加 0.25 秒",
      decreaseQuarterSecond: "减少 0.25 秒",
      increaseValue: "增加{0}",
      decreaseValue: "减少{0}",
      playbackChannels: "播放声道",
      selectChannel: "选择声道"
    },
    "zh-TW": {
      loadFile: "本機檔案",
      driveLoad: "Google 檔案",
      dropHint: "或將檔案拖到這裡",
      noFile: "請載入音樂檔案",
      supported: "支援檔案",
      sourceReady: "已載入",
      mmlFold: "用於試聽的 MML 程式碼",
      mmlFoldHint: "僅在需要查看或手動編輯時展開。",
      channelWaiting: "載入 MIDI 類型檔案後，此處會顯示分配給該聲道的樂器與角色。",
      rest: "刪除休止符",
      keep: "保持原樣",
      rest64: "64分音符",
      rest32: "32分音符",
      rest16: "16分音符",
      rest8: "8分音符",
      rest4: "4分音符",
      all: "全部",
      volume: "音量",
      octave: "八度",
      dynamics: "產生音量",
      overwrite: "覆寫現有音量",
      style: "風格",
      strength: "強度",
      accompanimentRole: "伴奏聲道角色",
      useForAnalysis: "用於分析",
      useForGeneration: "在此聲道產生伴奏",
      leading: "起始空白",
      quarterNotes: "四分音符",
      use: "啟用",
      seconds: "秒",
      tempoScale: "速度倍數",
      tempoClean: "整理速度",
      tempoMarkerHelp: "點選時間軸上的 T 數字，即可在彈出視窗中編輯該位置的速度。",
      accompaniment: "產生伴奏",
      pop: "流行",
      jazz: "爵士",
      ballad: "抒情",
      bossa: "巴薩諾瓦",
      rock: "搖滾",
      funk: "放克",
      classical: "古典",
      light: "較弱",
      normal: "標準",
      strong: "較強",
      copyAll: "完整樂譜",
      copy: "複製",
      copied: "已複製",
      splitCopy: "分割樂譜",
      splitLimit: "字元數",
      splitSearch: "分割搜尋位置",
      splitPage: "樂譜 {0}",
      splitPages: "{0} 個樂譜",
      splitNoNeed: "目前字元數不需要分割。",
      saveFile: "本機儲存",
      saveDrive: "Google 儲存",
      error: "套用選項時發生錯誤",
      external: "外部功能",
      mobibeat: "MobiBeats",
      sourceBasedNotice: "已依原始資料與目前選項重新產生 MML。",
      manualEdited: "已手動編輯",
      close: "關閉",
      confirm: "確認",
      cancel: "取消",
      promptValue: "輸入值",
      tempoLane: "速度",
      assignment: "樂器・角色分配",
      codeEdit: "編輯程式碼",
      codeClose: "關閉程式碼",
      codeHelp: "程式碼說明",
      pasteMml: "貼上",
      pasteHint: "貼上 MML 程式碼後會作為新的來源資料載入。",
      pasteApply: "載入",
      chars: "字元",
      quantize: "量化",
      quantize64: "64分音符",
      quantize32: "32分音符",
      allChannels: "所有聲道",
      mixedValues: "各聲道的值不同",
      applyAll: "全部套用",
      restRemoved: "{0} 個",
      restRemovedNone: "0 個",
      volumeDistribution: "{0}",
      noVolumeNotes: "0 個",
      role: "角色",
      overlap: "重疊",
      accompanimentChannel: "伴奏",
      melShort: "旋",
      genreSelect: "選擇曲風",
      tempoCleanEnabled: "已套用",
      tempoCleanEnabledCount: "已套用・刪除 {0} 個",
      tempoCleanDisabled: "未套用",
      apply: "套用",
      instrumentPending: "請套用尚未確認的樂器設定。",
      channelPending: "請套用尚未確認的聲道選項。",
      channelApplied: "已套用聲道選項。",
      channelCancelled: "已取消聲道選項的變更。",
      instrumentCancelled: "已取消樂器設定的變更。",
      pendingExportTitle: "有尚未套用的變更",
      pendingExportCopy: "還有尚未套用的設定變更。這些變更不會包含在複製結果中。是否改為複製目前已套用的樂譜？",
      pendingExportSave: "還有尚未套用的設定變更。這些變更不會包含在儲存結果中。是否改為儲存目前已套用的樂譜？",
      pendingExportCopyConfirm: "複製目前樂譜",
      pendingExportSaveConfirm: "儲存目前樂譜",
      pendingExportBack: "返回",
      execute: "執行",
      restoreSuffix: "復原",
      previewPending: "將使用未套用的設定暫時試聽。",
      octaveRange: "八度範圍",
      noNotes: "無音符",
      copyToast: "已複製 MML 程式碼。",
      itemCount: "{0} 個",
      channelApply: "目標聲道",
      volumeSummary: "音量資訊",
      codeChars: "字元數",
      codeRests: "休止符",
      codeVolumes: "音量",
      playbackPosition: "播放位置",
      increaseQuarterSecond: "增加 0.25 秒",
      decreaseQuarterSecond: "減少 0.25 秒",
      increaseValue: "增加{0}",
      decreaseValue: "減少{0}",
      playbackChannels: "播放聲道",
      selectChannel: "選擇聲道"
    }
  };

  function lang() {
    const raw = String(window.MobibardI18n?.language || document.documentElement.lang || "en").replace(/_/g, "-").toLowerCase();
    if (raw.startsWith("ko")) return "ko";
    if (raw.startsWith("ja")) return "ja";
    if (raw === "zh-tw" || raw === "zh-hk" || raw === "zh-mo" || raw.includes("hant")) return "zh-TW";
    if (raw.startsWith("zh") || raw.includes("hans")) return "zh-CN";
    return "en";
  }

  const t = (key, values = []) => {
    let value = STRINGS[lang()]?.[key] ?? STRINGS.en[key] ?? key;
    values.forEach((item, index) => { value = value.replaceAll(`{${index}}`, String(item)); });
    return value;
  };
  const appText = (key, fallback = "") => window.MobibardI18n?.t?.(key) || fallback || key;
  const channelKey = index => index === 0 ? "part.melody" : `part.harmony${index}`;
  const channelFallback = index => {
    const labels = {
      ko: ["멜로디", "화음 1", "화음 2", "화음 3", "화음 4", "화음 5"],
      en: ["Melody", "Harmony 1", "Harmony 2", "Harmony 3", "Harmony 4", "Harmony 5"],
      ja: ["メロディ", "ハーモニー1", "ハーモニー2", "ハーモニー3", "ハーモニー4", "ハーモニー5"],
      "zh-CN": ["旋律", "和声1", "和声2", "和声3", "和声4", "和声5"],
      "zh-TW": ["旋律", "和聲1", "和聲2", "和聲3", "和聲4", "和聲5"]
    };
    return labels[lang()]?.[index] || labels.en[index] || `Channel ${index + 1}`;
  };
  const channelLabel = index => appText(channelKey(index), channelFallback(index));

  const makeChannelOptions = index => ({
    restMode: "32",
    volumeDelta: 0,
    octaveDelta: 0,
    accompaniment: { analysis: index === 0, generation: index > 0 }
  });

  const state = {
    sourceMml: "",
    sourceMeta: {},
    applying: false,
    manualEdited: false,
    midiAutoTimer: 0,
    applyFrame: 0,
    applyTimer: 0,
    sourceVersion: 0,
    lastApplySignature: "",
    lastResultMml: "",
    metricsFrame: 0,
    metricsIdleHandle: 0,
    metricsCache: { sourceVersion: -1, restInput: "", rest: new Map(), volumeSource: "", volume: [], tempoInput: "", tempoResult: null },
    pipelineCache: { sourceVersion: -1, stages: [] },
    tempoCleanCount: 0,
    channelDraft: null,
    channelOptionsDirty: false,
    instrumentDirty: false,
    playbackChannelMedia: null,
    toastTimer: 0,
    sessionSaveTimer: 0,
    sessionLoadedSnapshot: null,
    restoringSession: false,
    sessionHasUserEdit: false,
    activeOptionFeature: "rest",
    panelState: new WeakMap(),
    openPanels: [],
    activeChannel: 0,
    activeChannelView: 0,
    originalPreviewAvailable: false,
    midiQuantizeAvailable: false,
    midiQuantizeDivision: 64,
    ui: {},
    options: {
      channels: Array.from({ length: 6 }, (_, index) => makeChannelOptions(index)),
      leading: { beats: 4 },
      tempo: { scale: 100, simplify: true },
      dynamics: { genre: "", strength: "normal", targetChannels: [true, true, true, true, true, true] },
      accompaniment: { genre: "", strength: "normal" },
      split: { maxChars: 2400, searchPercent: 50 }
    }
  };

  function cloneChannelOptions(channels = state.options.channels) {
    return Array.from({ length: 6 }, (_, index) => {
      const source = channels?.[index] || makeChannelOptions(index);
      return {
        restMode: String(source.restMode || "keep"),
        volumeDelta: Math.max(-15, Math.min(15, Math.round(Number(source.volumeDelta) || 0))),
        octaveDelta: Math.max(-7, Math.min(7, Math.round(Number(source.octaveDelta) || 0))),
        accompaniment: {
          analysis: Boolean(source.accompaniment?.analysis),
          generation: Boolean(source.accompaniment?.generation)
        }
      };
    });
  }

  function cloneAccompanimentOption(value = state.options.accompaniment) {
    return {
      genre: String(value?.genre || ""),
      strength: String(value?.strength || "normal")
    };
  }

  function ensureChannelDraft() {
    if (!state.channelDraft) {
      state.channelDraft = {
        channels: cloneChannelOptions(),
        accompaniment: cloneAccompanimentOption()
      };
    }
    return state.channelDraft;
  }

  function workspaceTab(name) {
    return state.ui.workspaceTabs?.find?.(button => button.dataset.workspaceTab === name) || null;
  }

  function setWorkspacePending(name, pending) {
    const tab = workspaceTab(name);
    if (!tab) return;
    tab.classList.toggle("has-pending", Boolean(pending));
    tab.setAttribute("data-pending", pending ? "true" : "false");
  }

  function setInstrumentDirty(dirty = true) {
    state.instrumentDirty = Boolean(dirty);
    if (state.ui.instrumentApplyBar) state.ui.instrumentApplyBar.hidden = !state.instrumentDirty;
    setWorkspacePending("instrument", state.instrumentDirty);
  }

  function refreshInstrumentDirtyState({ markEdit = true } = {}) {
    const api = window.MobibardMidiWorkbench;
    const dirty = Boolean(api?.hasSource?.() && api?.isDirty?.());
    setInstrumentDirty(dirty);
    if (dirty && markEdit) {
      markWorkbenchEdited();
    } else if (!dirty) {
      clearPendingPlaybackPreview();
      scheduleSessionPersist();
    }
    return dirty;
  }

  function setChannelOptionsDirty(dirty = true) {
    state.channelOptionsDirty = Boolean(dirty);
    if (state.ui.channelApplyBar) state.ui.channelApplyBar.hidden = !state.channelOptionsDirty;
    setWorkspacePending("channel", state.channelOptionsDirty);
  }

  function normalizedChannelOptionSnapshot(channels, accompaniment) {
    return {
      channels: cloneChannelOptions(channels).map(channel => ({
        restMode: String(channel.restMode || "keep"),
        volumeDelta: Number(channel.volumeDelta) || 0,
        octaveDelta: Number(channel.octaveDelta) || 0,
        accompaniment: {
          analysis: Boolean(channel.accompaniment?.analysis),
          generation: Boolean(channel.accompaniment?.generation)
        }
      })),
      accompaniment: cloneAccompanimentOption(accompaniment)
    };
  }

  function channelDraftMatchesApplied() {
    const draft = ensureChannelDraft();
    const pending = normalizedChannelOptionSnapshot(draft.channels, draft.accompaniment);
    const applied = normalizedChannelOptionSnapshot(state.options.channels, state.options.accompaniment);
    return JSON.stringify(pending) === JSON.stringify(applied);
  }

  function markChannelOptionsDirty() {
    setChannelOptionsDirty(!channelDraftMatchesApplied());
    markWorkbenchEdited();
    if (state.activeOptionFeature === "volume" || state.activeOptionFeature === "octave") scheduleOptionMetricsUpdate();
  }

  function syncChannelDraftControls() {
    const draft = ensureChannelDraft();
    ["rest", "volume", "octave"].forEach(feature => {
      const refs = state.ui.featureControls?.[feature];
      if (!refs) return;
      refs.channels?.forEach((control, index) => {
        const channel = draft.channels[index];
        const value = feature === "rest"
          ? channel?.restMode
          : feature === "volume"
            ? channel?.volumeDelta
            : channel?.octaveDelta;
        control?.setValue?.(value);
      });
      syncFeatureBatchState(feature);
    });
    syncAccompanimentFeatureControls();
    scheduleOptionMetricsUpdate();
  }

  function cancelChannelOptionsDraft() {
    syncChannelDraftFromApplied({ force: true });
    syncChannelDraftControls();
    setChannelOptionsDirty(false);
    clearPendingPlaybackPreview();
    scheduleSessionPersist();
    showToast(t("channelCancelled"), "info");
  }

  function applyChannelOptionsDraft() {
    const draft = ensureChannelDraft();
    if (channelDraftMatchesApplied()) {
      setChannelOptionsDirty(false);
      return;
    }
    state.options.channels = cloneChannelOptions(draft.channels);
    state.options.accompaniment = cloneAccompanimentOption(draft.accompaniment);
    setChannelOptionsDirty(false);
    state.lastApplySignature = "";
    applyFromSource({ force: true });
    clearPendingPlaybackPreview();
    scheduleOptionMetricsUpdate();
    scheduleSessionPersist();
    showToast(t("channelApplied"), "success");
  }

  function syncChannelDraftFromApplied({ force = false } = {}) {
    if (state.channelOptionsDirty && !force) return;
    const channels = cloneChannelOptions(state.options.channels);
    const accompaniment = cloneAccompanimentOption(state.options.accompaniment);
    if (!state.channelDraft) {
      state.channelDraft = { channels, accompaniment };
      return;
    }
    for (let index = 0; index < 6; index += 1) {
      const source = channels[index];
      const target = state.channelDraft.channels[index] || makeChannelOptions(index);
      target.restMode = source.restMode;
      target.volumeDelta = source.volumeDelta;
      target.octaveDelta = source.octaveDelta;
      target.accompaniment ||= {};
      target.accompaniment.analysis = source.accompaniment.analysis;
      target.accompaniment.generation = source.accompaniment.generation;
      state.channelDraft.channels[index] = target;
    }
    state.channelDraft.accompaniment.genre = accompaniment.genre;
    state.channelDraft.accompaniment.strength = accompaniment.strength;
  }

  function resetSubmenuStateForNewSource() {
    // A file/paste/Drive load is a new editing job. Keep the global "전체 설정"
    // controls, but reset every lower workspace to its clean defaults.
    state.options.channels = Array.from({ length: 6 }, (_, index) => makeChannelOptions(index));
    state.options.accompaniment = { genre: "", strength: "normal" };
    state.options.split = { maxChars: 2400, searchPercent: 50 };
    state.manualEdited = false;
    state.activeWorkspaceTab = "copy";
    state.activeOptionFeature = "rest";
    state.activeChannel = 0;
    state.activeChannelView = 0;
    state.copyDirty = true;
    syncChannelDraftFromApplied({ force: true });
    setChannelOptionsDirty(false);
    setInstrumentDirty(false);
    clearPendingPlaybackPreview();
    if (state.ui.manualBadge) state.ui.manualBadge.hidden = true;
    if (state.ui.featureControls) syncChannelDraftControls();
  }

  document.documentElement.dataset.playerLayout = "source-workbench";
  document.body.classList.add("player-source-workbench", "player-source-workbench-v4", "player-source-workbench-v5", "player-source-workbench-v6", "player-source-workbench-v7", "player-source-workbench-v8", "player-source-workbench-v9");

  const main = document.querySelector("main");
  const menuCard = main?.querySelector(".menu-card");
  const editorCard = main?.querySelector(".card:not(.menu-card)");
  const fileToolbar = menuCard?.querySelector(".player-file-toolbar");
  const playLayout = menuCard?.querySelector(".play-layout");
  const retained = {
    copy: $("copyBtn"),
    save: $("saveBtn"),
    driveSave: $("googleDriveSaveBtn")
  };
  if (!main || !menuCard || !editorCard || !fileToolbar || !playLayout) return;

  function keyedText(key, className = "", tag = "span") {
    return el(tag, className, { "data-wb4-text": key, text: t(key) });
  }

  function buildHeaderActions() {
    const topActions = document.querySelector(".player-top-actions");
    if (!topActions) return;
    const midiExtract = $("midiExtractBtn");
    if (!midiExtract) return;
    midiExtract.classList.add("wb4-midi-extract-button");
    midiExtract.querySelector(".midi-extract-toolbar-icon")?.remove();
    const group = el("div", "wb4-top-external", { "aria-label": t("external") });
    group.append(midiExtract);
    topActions.prepend(group);
  }

  function buildTitle(canvas) {
    const row = el("div", "wb4-title-row");
    const title = el("h1", "wb4-title");
    state.ui.titleName = el("span", "wb4-title-name", { text: appText("mml.generator_title", "MML 생성기") });
    title.append(state.ui.titleName, el("span", "wb4-title-version", { text: "v5.1" }));

    const actions = el("div", "wb4-title-actions");
    const mobibeat = $("rhythmGameBtn");
    const simple = $("simpleVersionBtn");
    if (mobibeat) {
      mobibeat.querySelector(".rhythm-game-toolbar-icon")?.remove();
      const label = mobibeat.querySelector("span:last-child");
      if (label) { label.removeAttribute("data-i18n"); label.textContent = t("mobibeat"); }
      mobibeat.removeAttribute("data-i18n-title");
      mobibeat.title = t("mobibeat");
      actions.append(mobibeat);
    }
    if (simple) actions.append(simple);
    row.append(title, actions);
    canvas.append(row);
  }

  function ensurePasteDialog() {
    let dialog = $("pasteMmlDialog");
    if (dialog) return dialog;
    dialog = el("dialog", "mml-dialog wb4-native-popup wb4-paste-dialog", { id: "pasteMmlDialog" });
    const form = el("form", "dialog-card wb4-paste-card", { id: "pasteMmlForm", method: "dialog" });
    form.append(keyedText("pasteMml", "", "h3"), keyedText("pasteHint", "wb4-paste-hint", "p"));
    const textarea = el("textarea", "wb4-paste-textarea", { id: "pasteMmlText", spellcheck: "false", rows: "10" });
    const status = el("div", "dialog-small wb4-paste-status", { id: "pasteMmlStatus", role: "status", "aria-live": "polite" });
    const actions = el("div", "dialog-actions");
    actions.append(
      el("button", "", { id: "pasteMmlCancel", type: "button", "data-wb4-text": "cancel", text: t("cancel") }),
      el("button", "primary", { id: "pasteMmlApply", type: "submit", "data-wb4-text": "pasteApply", text: t("pasteApply") })
    );
    form.append(textarea, status, actions);
    dialog.append(form);
    document.body.append(dialog);
    return dialog;
  }

  function buildSourceBlock(canvas) {
    ensurePasteDialog();
    const block = el("section", "wb4-block wb4-source-block");
    const drop = el("div", "wb4-drop-zone", { id: "workbenchDropZone", role: "button", tabindex: "0", "aria-controls": "midiFile" });
    const supported = fileToolbar.querySelector("[data-supported-files-button]");
    const load = $("midiLoadBtn");
    const drive = $("googleDriveLoadBtn");
    const paste = $("pasteBtn");
    const input = $("midiFile");

    if (supported) {
      supported.className = "mabi-supported-files-button wb12-supported-button";
      supported.textContent = t("supported");
    }
    if (load) {
      load.removeAttribute("data-i18n");
      load.removeAttribute("data-i18n-title");
      load.textContent = t("loadFile");
      load.className = "wb4-load-primary";
    }
    if (drive) {
      drive.removeAttribute("data-i18n");
      drive.removeAttribute("data-i18n-title");
      drive.textContent = t("driveLoad");
      drive.className = "wb4-load-secondary";
    }
    if (paste) {
      paste.removeAttribute("data-i18n");
      paste.textContent = t("pasteMml");
      paste.className = "wb4-load-secondary wb4-paste-source-button";
    }

    const actions = el("div", "wb4-load-actions");
    if (load) actions.append(load);
    if (drive) actions.append(drive);
    if (paste) actions.append(paste);
    state.ui.fileName = el("strong", "wb4-file-name", { "data-wb4-text": "noFile" });
    state.ui.fileState = el("span", "wb4-file-state", { hidden: true });
    state.ui.restoreButton = el("button", "wb13-restore-button", { type: "button", hidden: true });
    state.ui.restoreButton.addEventListener("click", () => void restoreLastWorkbenchSession());
    const meta = el("div", "wb4-file-meta");
    meta.append(state.ui.fileName, state.ui.restoreButton);

    if (supported) drop.append(supported);
    drop.append(actions, keyedText("dropHint", "wb4-drop-hint"), meta);
    if (input) drop.append(input);
    block.append(drop);
    state.ui.sourceInlineHost = el("div", "wb4-inline-host");
    block.append(state.ui.sourceInlineHost);
    canvas.append(block);

    const openPicker = () => load?.click();
    drop.addEventListener("click", event => {
      if (!event.target.closest("button,a,input,select,label")) openPicker();
    });
    drop.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPicker();
      }
    });
    ["dragenter", "dragover"].forEach(type => drop.addEventListener(type, event => {
      event.preventDefault();
      drop.classList.add("dragover");
    }));
    ["dragleave", "drop"].forEach(type => drop.addEventListener(type, event => {
      event.preventDefault();
      drop.classList.remove("dragover");
    }));
    drop.addEventListener("drop", event => {
      const file = event.dataTransfer?.files?.[0];
      if (!file || !input) return;
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (_) {}
    });
    input?.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) {
        state.sessionHasUserEdit = false;
        clearTimeout(state.sessionSaveTimer);
        state.sessionSaveTimer = 0;
        setSourceName(file.name);
      }
    });
  }

  function formatClock(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(total / 60);
    const secs = Math.floor(total % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function prepareTimeline(seekRow) {
    const progressWrap = seekRow?.querySelector(".progress-wrap");
    const progressSlider = $("progressSlider");
    const tempoLayer = $("tempoMarkerLayer");
    if (!progressWrap || !progressSlider || !tempoLayer) return;

    progressWrap.classList.add("wb4-tempo-timeline");
    seekRow.classList.add("wb4-seek-row");
    progressSlider.setAttribute("aria-label", t("playbackPosition"));

    const grid = el("div", "wb4-timeline-grid", { "aria-hidden": "true" });
    for (let index = 0; index <= 16; index += 1) {
      grid.append(el("i", index % 4 === 0 ? "major" : "minor", { style: `left:${index / 16 * 100}%` }));
    }
    const tickLabels = el("div", "wb4-timeline-tick-labels", { "aria-hidden": "true" });
    state.ui.timelineTicks = [0, .25, .5, .75, 1].map((ratio, index) => {
      const tick = el("span", "", { style: `left:${ratio * 100}%`, text: index === 0 ? "00:00" : "" });
      tickLabels.append(tick);
      return tick;
    });
    state.ui.playhead = el("div", "wb4-timeline-playhead", { "aria-hidden": "true" });
    state.ui.playheadLabel = el("span", "wb4-playhead-label", { text: "00:00" });
    state.ui.playhead.append(state.ui.playheadLabel);
    state.ui.playheadTrack = el("div", "wb4-timeline-playhead-track", { "aria-hidden": "true" });
    state.ui.playheadTrack.append(state.ui.playhead);
    progressWrap.prepend(grid, tickLabels);
    progressWrap.append(state.ui.playheadTrack);
    state.ui.progressSlider = progressSlider;

    let wheelCommitTimer = 0;
    progressWrap.addEventListener("wheel", event => {
      const max = Math.max(0, Number(progressSlider.max) || 0);
      if (progressSlider.disabled || max <= 0) return;
      const horizontalDelta = Math.abs(event.deltaX) >= Math.abs(event.deltaY)
        ? event.deltaX
        : (event.shiftKey ? event.deltaY : 0);
      if (!horizontalDelta) return;
      event.preventDefault();
      const width = Math.max(240, progressWrap.clientWidth || 0);
      const next = Math.max(0, Math.min(max, Number(progressSlider.value || 0) + max * horizontalDelta / width));
      progressSlider.value = String(next);
      progressSlider.dispatchEvent(new Event("input", { bubbles: true }));
      clearTimeout(wheelCommitTimer);
      wheelCommitTimer = window.setTimeout(() => {
        progressSlider.dispatchEvent(new Event("change", { bubbles: true }));
      }, 120);
    }, { passive: false });

    const sync = () => {
      const max = Math.max(0, Number(progressSlider.max) || 0);
      const value = Math.max(0, Math.min(max || 0, Number(progressSlider.value) || 0));
      const percent = max > 0 ? value / max * 100 : 0;
      progressWrap.style.setProperty("--wb4-playback-progress", `${percent}%`);
      progressWrap.classList.toggle("disabled", progressSlider.disabled || max <= 0);
      if (state.ui.playheadLabel) state.ui.playheadLabel.textContent = formatClock(value);
      state.ui.timelineTicks?.forEach((node, index) => { node.textContent = formatClock(max * (index / 4)); });
      window.requestAnimationFrame(sync);
    };
    window.requestAnimationFrame(sync);
  }

  function segmented(defs, current, onChange, className = "") {
    const wrap = el("div", `wb4-segmented ${className}`.trim());
    const buttons = new Map();
    const setValue = (next, { silent = true, mixed = false } = {}) => {
      wrap.dataset.mixed = mixed ? "true" : "false";
      for (const [value, button] of buttons.entries()) {
        const active = !mixed && String(value) === String(next);
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      }
      if (!silent && !mixed) onChange(next);
    };
    defs.forEach(([value, label]) => {
      const button = el("button", "wb4-segment", { type: "button", text: label, "aria-pressed": value === current ? "true" : "false" });
      button.dataset.value = String(value);
      button.classList.toggle("active", value === current);
      button.addEventListener("click", () => setValue(value, { silent: false }));
      buttons.set(String(value), button);
      wrap.append(button);
    });
    wrap.setValue = setValue;
    return wrap;
  }

  function selectControl(values, current, onChange, className = "") {
    const select = el("select", `wb4-select ${className}`.trim());
    values.forEach(([value, label]) => {
      const option = el("option", "", { value, text: label });
      if (String(value) === String(current)) option.selected = true;
      select.append(option);
    });
    select.addEventListener("change", () => onChange(select.value));
    return select;
  }

  function sliderNumber({ min, max, step, value, suffix = "", onChange }) {
    const wrap = el("div", "wb4-slider-number");
    const range = el("input", "wb4-range", { type: "range", min, max, step, value });
    const number = el("input", "wb4-number", { type: "number", min, max, step, value });
    const suffixNode = suffix ? el("span", "wb4-number-suffix", { text: suffix }) : null;
    const normalize = raw => {
      let next = Number(raw);
      if (!Number.isFinite(next)) next = Number(value);
      next = Math.max(Number(min), Math.min(Number(max), next));
      if (Number(step) >= 1) next = Math.round(next / Number(step)) * Number(step);
      return next;
    };
    const setValue = (raw, { silent = true, mixed = false } = {}) => {
      const next = normalize(raw);
      // 채널 값이 서로 다른 상태에서는 일괄 슬라이더의 thumb를 특정 채널 값으로 끌고 가지 않는다.
      // 숫자 칸만 mixed 상태로 비우고, 사용자가 일괄 슬라이더를 직접 움직였을 때만 새 값이 된다.
      if (!mixed) {
        range.value = String(next);
        number.value = String(next);
      } else {
        number.value = "";
      }
      wrap.dataset.mixed = mixed ? "true" : "false";
      number.placeholder = mixed ? t("mixedValues") : "";
      if (!silent) onChange(next);
    };
    range.addEventListener("input", () => setValue(range.value, { silent: false }));
    number.addEventListener("change", () => setValue(number.value, { silent: false }));
    wrap.setValue = setValue;
    wrap._range = range;
    wrap._number = number;
    wrap.append(range, number);
    if (suffixNode) wrap.append(suffixNode);
    return wrap;
  }

  function toggleControl(labelText, checked, onChange, className = "") {
    const label = el("label", `wb4-toggle-row ${className}`.trim());
    const input = el("input", "", { type: "checkbox", checked });
    label.append(input, el("span", "", { text: labelText }));
    input.addEventListener("change", () => onChange(input.checked));
    label._input = input;
    return label;
  }

  function optionRow(labelKey, control, hintKey = "", className = "") {
    const row = el("div", `wb4-option-row ${className}`.trim());
    const label = el("div", "wb4-option-name");
    label.append(keyedText(labelKey, "", "strong"));
    if (hintKey) label.append(keyedText(hintKey, "", "small"));
    const body = el("div", "wb4-option-control");
    if (control) body.append(control);
    row.append(label, body);
    return row;
  }

  function getApplySignature() {
    const transformOptions = {
      channels: state.options.channels,
      leading: state.options.leading,
      tempo: state.options.tempo,
      dynamics: state.options.dynamics,
      accompaniment: state.options.accompaniment
    };
    return `${state.sourceVersion}|${JSON.stringify(transformOptions)}`;
  }

  function queueApply({ immediate = false, userEdit = true } = {}) {
    if (userEdit) markWorkbenchEdited();
    if (state.applyFrame) cancelAnimationFrame(state.applyFrame);
    if (state.applyTimer) clearTimeout(state.applyTimer);
    const run = () => {
      state.applyTimer = 0;
      state.applyFrame = requestAnimationFrame(() => {
        state.applyFrame = 0;
        applyFromSource();
      });
    };
    if (immediate) run();
    else state.applyTimer = window.setTimeout(run, 72);
  }

  function genreValues() {
    return [["pop", t("pop")], ["jazz", t("jazz")], ["ballad", t("ballad")], ["bossa", t("bossa")], ["rock", t("rock")], ["funk", t("funk")], ["classical", t("classical")]];
  }

  function genreValuesWithPlaceholder() {
    return [["", t("genreSelect")], ...genreValues()];
  }

  function updateMidiChannelFilter() {
    const dialog = $("midiConvertDialog");
    if (!dialog) return;
    dialog.removeAttribute("data-active-channel");
    dialog.querySelectorAll(".midi-role-row,[data-midi-group-channel]").forEach(node => { node.hidden = false; });
    dialog.querySelectorAll("details.midi-instrument-section").forEach(section => { section.open = true; });
  }

  function setSourceName(name) {
    if (!state.ui.fileName || !name) return;
    state.ui.fileName.hidden = false;
    state.ui.fileName.textContent = String(name);
    state.ui.fileName.dataset.hasFile = "true";
    if (state.ui.fileState) state.ui.fileState.hidden = true;
    if (state.ui.restoreButton) state.ui.restoreButton.hidden = true;
  }


  const WORKBENCH_SESSION_DB = "mobibard-player-workbench-v1";
  const WORKBENCH_SESSION_STORE = "sessions";
  const WORKBENCH_SESSION_KEY = "last";

  function openWorkbenchSessionDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error("IndexedDB unavailable")); return; }
      const request = indexedDB.open(WORKBENCH_SESSION_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(WORKBENCH_SESSION_STORE)) db.createObjectStore(WORKBENCH_SESSION_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    });
  }

  async function readWorkbenchSession() {
    let db;
    try {
      db = await openWorkbenchSessionDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(WORKBENCH_SESSION_STORE, "readonly");
        const request = tx.objectStore(WORKBENCH_SESSION_STORE).get(WORKBENCH_SESSION_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error("Session read failed"));
      });
    } catch (_) {
      return null;
    } finally {
      try { db?.close(); } catch (_) {}
    }
  }

  async function writeWorkbenchSession(snapshot) {
    let db;
    try {
      db = await openWorkbenchSessionDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(WORKBENCH_SESSION_STORE, "readwrite");
        tx.objectStore(WORKBENCH_SESSION_STORE).put(snapshot, WORKBENCH_SESSION_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("Session write failed"));
        tx.onabort = () => reject(tx.error || new Error("Session write aborted"));
      });
      return true;
    } catch (_) {
      return false;
    } finally {
      try { db?.close(); } catch (_) {}
    }
  }

  function normalizeSessionOptions(saved = {}) {
    const channels = cloneChannelOptions(saved.channels || state.options.channels);
    const targetChannels = Array.from({ length: 6 }, (_, index) => saved.dynamics?.targetChannels?.[index] !== false);
    return {
      channels,
      leading: { beats: Math.max(0, Math.min(600, Math.round((Number(saved.leading?.beats) || 0) * 2) / 2)) },
      tempo: {
        scale: Math.max(50, Math.min(200, Math.round(Number(saved.tempo?.scale) || 100))),
        simplify: saved.tempo?.simplify !== false
      },
      dynamics: {
        genre: String(saved.dynamics?.genre || ""),
        strength: String(saved.dynamics?.strength || "normal"),
        targetChannels
      },
      accompaniment: cloneAccompanimentOption(saved.accompaniment),
      split: {
        maxChars: Math.max(200, Math.min(5000, Math.round(Number(saved.split?.maxChars) || 2400))),
        searchPercent: [50, 60, 70, 80, 90].includes(Number(saved.split?.searchPercent)) ? Number(saved.split.searchPercent) : 50
      }
    };
  }

  function syncCommonOptionControls() {
    state.ui.tempoScaleControl?.setValue?.(state.options.tempo.scale);
    state.ui.leadingControl?.setValue?.(state.options.leading.beats * 0.5);
    updateTempoCleanButton();
    syncVolumeGenerationControls();
    state.ui.quantizeControl?.setValue?.(String(Number(state.midiQuantizeDivision) === 32 ? 32 : 64));
  }

  function markWorkbenchEdited() {
    if (state.restoringSession || !state.sourceMml) return;
    state.sessionHasUserEdit = true;
    scheduleSessionPersist();
  }

  async function persistLastWorkbenchSession() {
    if (state.restoringSession || !state.sessionHasUserEdit || !state.sourceMml) return;
    const name = String(state.sourceMeta?.name || state.ui.fileName?.textContent || "").trim();
    if (!name || name === t("noFile")) return;
    if (name === "Sample MML" && state.sourceMeta?.sourceType === "mml") return;
    let midiState = null;
    try {
      const exported = window.MobibardMidiWorkbench?.exportSessionState?.() || null;
      if (exported?.pendingMidiImport?.name === name) midiState = exported;
    } catch (_) {}
    const snapshot = {
      version: 3,
      userEdited: true,
      savedAt: Date.now(),
      name,
      sourceMml: String(state.sourceMml || ""),
      sourceMeta: { ...state.sourceMeta, name },
      resultMml: String($("mainMml")?.value || ""),
      options: JSON.parse(JSON.stringify(state.options)),
      channelDraft: state.channelDraft ? normalizedChannelOptionSnapshot(state.channelDraft.channels, state.channelDraft.accompaniment) : null,
      channelOptionsDirty: Boolean(state.channelOptionsDirty),
      instrumentDirty: Boolean(state.instrumentDirty),
      manualEdited: Boolean(state.manualEdited),
      activeWorkspaceTab: state.activeWorkspaceTab || "copy",
      activeOptionFeature: state.activeOptionFeature || "rest",
      activeChannelView: Number(state.activeChannelView),
      midiQuantizeDivision: Number(state.midiQuantizeDivision) === 32 ? 32 : 64,
      midiState
    };
    await writeWorkbenchSession(snapshot);
  }

  function scheduleSessionPersist(delay = 160) {
    if (state.restoringSession || !state.sessionHasUserEdit || !state.sourceMml) return;
    clearTimeout(state.sessionSaveTimer);
    state.sessionSaveTimer = window.setTimeout(() => {
      state.sessionSaveTimer = 0;
      void persistLastWorkbenchSession();
    }, Math.max(60, Number(delay) || 160));
  }

  async function loadSessionRestorePrompt() {
    const snapshot = await readWorkbenchSession();
    if (!snapshot?.sourceMml || !snapshot?.name || snapshot.version < 3 || snapshot.userEdited !== true || state.sourceMml) return;
    state.sessionLoadedSnapshot = snapshot;
    if (state.ui.restoreButton && state.ui.fileName) {
      state.ui.fileName.hidden = true;
      state.ui.restoreButton.textContent = `${snapshot.name} ${t("restoreSuffix")}`;
      state.ui.restoreButton.title = snapshot.name;
      state.ui.restoreButton.hidden = false;
    }
  }

  function restoreChannelDraftInPlace(savedDraft = null) {
    const target = ensureChannelDraft();
    const sourceChannels = cloneChannelOptions(savedDraft?.channels || state.options.channels);
    const sourceAccompaniment = cloneAccompanimentOption(savedDraft?.accompaniment || state.options.accompaniment);
    for (let index = 0; index < 6; index += 1) {
      const source = sourceChannels[index];
      const channel = target.channels[index] || makeChannelOptions(index);
      channel.restMode = source.restMode;
      channel.volumeDelta = source.volumeDelta;
      channel.octaveDelta = source.octaveDelta;
      channel.accompaniment ||= {};
      channel.accompaniment.analysis = Boolean(source.accompaniment?.analysis);
      channel.accompaniment.generation = Boolean(source.accompaniment?.generation);
      target.channels[index] = channel;
    }
    target.accompaniment.genre = sourceAccompaniment.genre;
    target.accompaniment.strength = sourceAccompaniment.strength;
    return target;
  }

  async function restoreLastWorkbenchSession() {
    const snapshot = state.sessionLoadedSnapshot || await readWorkbenchSession();
    if (!snapshot?.sourceMml || snapshot.version < 3 || snapshot.userEdited !== true) return;
    state.restoringSession = true;
    clearTimeout(state.sessionSaveTimer);
    try {
      state.options = normalizeSessionOptions(snapshot.options || {});
      state.sourceMml = String(snapshot.sourceMml || "");
      state.sourceMeta = { ...(snapshot.sourceMeta || {}), name: String(snapshot.name || snapshot.sourceMeta?.name || "") };
      state.sourceVersion += 1;
      state.lastApplySignature = "";
      state.lastResultMml = String(snapshot.resultMml || "");
      state.manualEdited = Boolean(snapshot.manualEdited);
      state.midiQuantizeDivision = Number(snapshot.midiQuantizeDivision) === 32 ? 32 : 64;
      resetPipelineCache();
      state.metricsCache = { sourceVersion: -1, restInput: "", rest: new Map(), volumeSource: "", volume: [], tempoInput: "", tempoResult: null };

      restoreChannelDraftInPlace(snapshot.channelDraft || null);

      const mainMml = $("mainMml");
      if (mainMml) {
        state.applying = true;
        mainMml.dataset.workbenchApply = "1";
        mainMml.value = String(snapshot.resultMml || state.sourceMml);
        mainMml.dispatchEvent(new Event("input", { bubbles: true }));
        delete mainMml.dataset.workbenchApply;
        state.applying = false;
      }

      if (snapshot.midiState) {
        try { window.MobibardMidiWorkbench?.restoreSessionState?.(snapshot.midiState); } catch (_) {}
      }
      setSourceName(state.sourceMeta.name || snapshot.name);
      syncCommonOptionControls();
      syncChannelDraftControls();
      setChannelOptionsDirty(Boolean(snapshot.channelOptionsDirty));
      setInstrumentDirty(Boolean(snapshot.instrumentDirty));
      state.activeOptionFeature = ["rest", "volume", "octave", "accompaniment"].includes(snapshot.activeOptionFeature) ? snapshot.activeOptionFeature : "rest";
      activateChannelView(Number.isFinite(Number(snapshot.activeChannelView)) ? Number(snapshot.activeChannelView) : 0);
      activateWorkspaceTab(["copy", "instrument", "channel", "code"].includes(snapshot.activeWorkspaceTab) ? snapshot.activeWorkspaceTab : "copy");
      if (state.activeWorkspaceTab === "channel") activateOptionFeature(state.activeOptionFeature);
      if (state.ui.manualBadge) state.ui.manualBadge.hidden = !state.manualEdited;
      clearPendingPlaybackPreview();
      scheduleChannelCountsUpdate();
      scheduleCopyRowsRender();
      scheduleOptionMetricsUpdate();
      state.sessionLoadedSnapshot = null;
      state.sessionHasUserEdit = true;
    } finally {
      state.restoringSession = false;
    }
    scheduleSessionPersist(120);
  }

  function scaleTempoCommands(mml, percent) {
    const factor = Number(percent) / 100;
    if (!Number.isFinite(factor) || Math.abs(factor - 1) < .0001) return String(mml || "");
    return String(mml || "").replace(/([tT])(\d{1,3})/g, (_, command, raw) => `${command}${Math.max(32, Math.min(255, Math.round(Number(raw) * factor)))}`);
  }

  function resultMml(result, fallback) {
    if (typeof result === "string") return result;
    return typeof result?.mml === "string" ? result.mml : fallback;
  }

  function showOptionStatus(message, tone = "info") {
    const node = state.ui.optionStatus;
    if (node) {
      node.hidden = true;
      node.textContent = "";
      delete node.dataset.tone;
    }
    if (message) showToast(String(message), tone === "error" ? "error" : "info");
  }

  function groupChannelIndexes(keyFactory, predicate = () => true) {
    const groups = new Map();
    state.options.channels.forEach((channel, index) => {
      if (!predicate(channel, index)) return;
      const key = String(keyFactory(channel, index));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(index);
    });
    return groups;
  }

  function resetPipelineCache() {
    state.pipelineCache = { sourceVersion: state.sourceVersion, stages: [] };
  }

  function pipelineStage(index, previousKey, name, optionKey, input, runner, diagnostics) {
    if (state.pipelineCache.sourceVersion !== state.sourceVersion) resetPipelineCache();
    const key = `${previousKey}|${name}:${JSON.stringify(optionKey)}`;
    const cached = state.pipelineCache.stages[index];
    if (cached?.key === key) {
      diagnostics.cacheHits += 1;
      return { output: cached.output, key };
    }
    const started = performance.now();
    const output = String(runner(input) ?? input);
    diagnostics.stageDurations[name] = Math.round((performance.now() - started) * 10) / 10;
    state.pipelineCache.stages[index] = { key, output };
    state.pipelineCache.stages.length = index + 1;
    return { output, key };
  }

  function getTempoCleanupAnalysis(input) {
    const source = String(input || "");
    if (state.metricsCache.tempoInput === source && state.metricsCache.tempoResult) return state.metricsCache.tempoResult;
    let result = { mml: source, removedCount: 0 };
    try {
      result = window.MabiOptimizer?.simplifyTemposMml?.(source, {
        partCount: 6,
        maxBpmDeltaExclusive: 5,
        preserveExtrema: true
      }) || result;
    } catch (_) {}
    state.metricsCache.tempoInput = source;
    state.metricsCache.tempoResult = result;
    return result;
  }


  function previewChannelGroups(channels, keyFactory, predicate = () => true) {
    const groups = new Map();
    channels.forEach((channel, index) => {
      if (!predicate(channel, index)) return;
      const key = String(keyFactory(channel, index));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(index);
    });
    return [...groups.entries()];
  }

  function transformPreviewSource(sourceMml, channelOptions, accompanimentOption) {
    const optimizer = window.MabiOptimizer;
    let out = String(sourceMml || "");
    if (!optimizer || !out) return out;
    const channels = cloneChannelOptions(channelOptions);
    const accompaniment = cloneAccompanimentOption(accompanimentOption);

    const analysisPartIndexes = [];
    const generationPartIndexes = [];
    channels.forEach((channel, index) => {
      if (channel.accompaniment.analysis) analysisPartIndexes.push(index);
      if (channel.accompaniment.generation) generationPartIndexes.push(index);
    });
    if (accompaniment.genre && optimizer.generateAccompanimentMml && analysisPartIndexes.length && generationPartIndexes.length) {
      out = resultMml(optimizer.generateAccompanimentMml(out, {
        genre: accompaniment.genre,
        strength: accompaniment.strength,
        analysisPartIndexes,
        generationPartIndexes
      }), out);
    }

    const dynamicsTargets = state.options.dynamics.targetChannels
      .map((enabled, index) => enabled ? index : -1)
      .filter(index => index >= 0);
    if (state.options.dynamics.genre && optimizer.generateDynamicsMml && dynamicsTargets.length) {
      out = resultMml(optimizer.generateDynamicsMml(out, {
        partCount: 6,
        genre: state.options.dynamics.genre,
        strength: state.options.dynamics.strength,
        targetPartIndexes: dynamicsTargets,
        overwriteExisting: true
      }), out);
    }

    if (optimizer.trimShortRestsMml) {
      for (const [mode, targetPartIndexes] of previewChannelGroups(channels, channel => channel.restMode, channel => channel.restMode !== "keep")) {
        const all = mode === "all";
        out = resultMml(optimizer.trimShortRestsMml(out, {
          partCount: 6,
          targetPartIndexes,
          all,
          denom: all ? 64 : Number(mode)
        }), out);
      }
    }
    if (optimizer.adjustVolumesMml) {
      for (const [delta, targetPartIndexes] of previewChannelGroups(channels, channel => channel.volumeDelta, channel => Number(channel.volumeDelta) !== 0)) {
        out = resultMml(optimizer.adjustVolumesMml(out, {
          partCount: 6,
          targetPartIndexes,
          delta: Number(delta)
        }), out);
      }
    }
    if (optimizer.transposeOctavesMml) {
      for (const [octaves, targetPartIndexes] of previewChannelGroups(channels, channel => channel.octaveDelta, channel => Number(channel.octaveDelta) !== 0)) {
        out = resultMml(optimizer.transposeOctavesMml(out, {
          partCount: 6,
          targetPartIndexes,
          octaves: Number(octaves)
        }), out);
      }
    }

    const leadingBeats = Math.max(0, Math.round((Number(state.options.leading.beats) || 0) * 2) / 2);
    if (leadingBeats > 0 && optimizer.addLeadingSilenceMml) {
      out = resultMml(optimizer.addLeadingSilenceMml(out, { partCount: 6, beats: leadingBeats }), out);
    }
    if (state.options.tempo.simplify && optimizer.simplifyTemposMml) {
      out = resultMml(optimizer.simplifyTemposMml(out, {
        partCount: 6,
        maxBpmDeltaExclusive: 5,
        preserveExtrema: true
      }), out);
    }
    if (Number(state.options.tempo.scale) !== 100) out = scaleTempoCommands(out, state.options.tempo.scale);
    return out;
  }

  function clearPendingPlaybackPreview() {
    try {
      window.dispatchEvent(new CustomEvent("mobibard:preview-source", { detail: { active: false } }));
    } catch (_) {}
  }

  async function preparePendingPlaybackPreview() {
    const hasPending = Boolean(state.instrumentDirty || state.channelOptionsDirty);
    if (!hasPending) {
      clearPendingPlaybackPreview();
      return true;
    }
    try {
      let source = String(state.sourceMml || "");
      if (state.instrumentDirty && window.MobibardMidiWorkbench?.buildPendingPreviewMml) {
        const pendingMidiMml = await window.MobibardMidiWorkbench.buildPendingPreviewMml();
        if (pendingMidiMml) source = String(pendingMidiMml);
      }
      if (!source) return false;
      const channelState = state.channelOptionsDirty
        ? ensureChannelDraft()
        : { channels: state.options.channels, accompaniment: state.options.accompaniment };
      const previewMml = transformPreviewSource(source, channelState.channels, channelState.accompaniment);
      try {
        window.dispatchEvent(new CustomEvent("mobibard:preview-source", {
          detail: { active: true, mml: previewMml, label: t("previewPending") }
        }));
      } catch (_) {}
      showToast(t("previewPending"), "info");
      return true;
    } catch (error) {
      showToast(error?.message || String(error), "error");
      return false;
    }
  }

  let pendingExportDialogOpen = false;

  async function confirmPendingExport(action = "copy") {
    if (!state.instrumentDirty && !state.channelOptionsDirty) return true;
    if (pendingExportDialogOpen) return false;

    const isSave = action === "save";
    const message = t(isSave ? "pendingExportSave" : "pendingExportCopy");
    const confirmUi = window.MobibardInlineUi?.confirm;
    pendingExportDialogOpen = true;
    try {
      if (typeof confirmUi !== "function") return window.confirm(message);
      return await confirmUi(message, {
        title: t("pendingExportTitle"),
        confirmText: t(isSave ? "pendingExportSaveConfirm" : "pendingExportCopyConfirm"),
        cancelText: t("pendingExportBack"),
        modal: true
      });
    } finally {
      pendingExportDialogOpen = false;
    }
  }

  window.MobibardBeforePlay = preparePendingPlaybackPreview;
  window.MobibardBeforeExport = confirmPendingExport;

  function applyFromSource({ force = false } = {}) {
    if (!state.sourceMml) {
      scheduleCopyRowsRender();
      scheduleOptionMetricsUpdate();
      return;
    }
    const optimizer = window.MabiOptimizer;
    if (!optimizer) return;
    const signature = getApplySignature();
    if (!force && signature === state.lastApplySignature) return;

    const startedAt = performance.now();
    const transformCalls = { dynamics: 0, rest: 0, volume: 0, octave: 0, accompaniment: 0, leading: 0, tempoClean: 0, tempoScale: 0 };
    const diagnostics = { cacheHits: 0, stageDurations: {} };
    let out = String(state.sourceMml);
    let previousKey = `source:${state.sourceVersion}`;
    let stageIndex = 0;
    try {
      showOptionStatus("");

      const accompaniment = state.options.accompaniment;
      const analysisPartIndexes = [];
      const generationPartIndexes = [];
      state.options.channels.forEach((channel, index) => {
        if (channel.accompaniment.analysis) analysisPartIndexes.push(index);
        if (channel.accompaniment.generation) generationPartIndexes.push(index);
      });
      let stage = pipelineStage(stageIndex++, previousKey, "accompaniment", {
        genre: accompaniment.genre,
        strength: accompaniment.strength,
        analysisPartIndexes,
        generationPartIndexes
      }, out, input => {
        if (!accompaniment.genre || !optimizer.generateAccompanimentMml || !analysisPartIndexes.length || !generationPartIndexes.length) return input;
        transformCalls.accompaniment += 1;
        return resultMml(optimizer.generateAccompanimentMml(input, {
          genre: accompaniment.genre,
          strength: accompaniment.strength,
          analysisPartIndexes,
          generationPartIndexes
        }), input);
      }, diagnostics);
      out = stage.output;
      previousKey = stage.key;

      const dynamics = state.options.dynamics;
      const dynamicsTargets = dynamics.targetChannels
        .map((enabled, index) => enabled ? index : -1)
        .filter(index => index >= 0);
      stage = pipelineStage(stageIndex++, previousKey, "dynamics", {
        genre: dynamics.genre,
        strength: dynamics.strength,
        targetPartIndexes: dynamicsTargets
      }, out, input => {
        if (!dynamics.genre || !optimizer.generateDynamicsMml || !dynamicsTargets.length) return input;
        transformCalls.dynamics += 1;
        return resultMml(optimizer.generateDynamicsMml(input, {
          partCount: 6,
          genre: dynamics.genre,
          strength: dynamics.strength,
          targetPartIndexes: dynamicsTargets,
          overwriteExisting: true
        }), input);
      }, diagnostics);
      out = stage.output;
      previousKey = stage.key;

      const restMetricInput = String(out || "");
      if (state.metricsCache.restInput !== restMetricInput) {
        state.metricsCache.restInput = restMetricInput;
        state.metricsCache.rest = new Map();
      }
      const restGroups = [...groupChannelIndexes(channel => channel.restMode, channel => channel.restMode !== "keep")];
      stage = pipelineStage(stageIndex++, previousKey, "rest", restGroups, out, input => {
        if (!optimizer.trimShortRestsMml) return input;
        let next = input;
        for (const [mode, targetPartIndexes] of restGroups) {
          const all = mode === "all";
          transformCalls.rest += 1;
          next = resultMml(optimizer.trimShortRestsMml(next, {
            partCount: 6,
            targetPartIndexes,
            all,
            denom: all ? 64 : Number(mode)
          }), next);
        }
        return next;
      }, diagnostics);
      out = stage.output;
      previousKey = stage.key;

      const volumeGroups = [...groupChannelIndexes(channel => channel.volumeDelta, channel => Number(channel.volumeDelta) !== 0)];
      stage = pipelineStage(stageIndex++, previousKey, "volume", volumeGroups, out, input => {
        if (!optimizer.adjustVolumesMml) return input;
        let next = input;
        for (const [delta, targetPartIndexes] of volumeGroups) {
          transformCalls.volume += 1;
          next = resultMml(optimizer.adjustVolumesMml(next, {
            partCount: 6,
            targetPartIndexes,
            delta: Number(delta)
          }), next);
        }
        return next;
      }, diagnostics);
      out = stage.output;
      previousKey = stage.key;

      const octaveGroups = [...groupChannelIndexes(channel => channel.octaveDelta, channel => Number(channel.octaveDelta) !== 0)];
      stage = pipelineStage(stageIndex++, previousKey, "octave", octaveGroups, out, input => {
        if (!optimizer.transposeOctavesMml) return input;
        let next = input;
        for (const [octaves, targetPartIndexes] of octaveGroups) {
          transformCalls.octave += 1;
          next = resultMml(optimizer.transposeOctavesMml(next, {
            partCount: 6,
            targetPartIndexes,
            octaves: Number(octaves)
          }), next);
        }
        return next;
      }, diagnostics);
      out = stage.output;
      previousKey = stage.key;

      const leadingBeats = Math.max(0, Math.round((Number(state.options.leading.beats) || 0) * 2) / 2);
      stage = pipelineStage(stageIndex++, previousKey, "leading", leadingBeats, out, input => {
        if (leadingBeats <= 0 || !optimizer.addLeadingSilenceMml) return input;
        transformCalls.leading += 1;
        return resultMml(optimizer.addLeadingSilenceMml(input, { partCount: 6, beats: leadingBeats }), input);
      }, diagnostics);
      out = stage.output;
      previousKey = stage.key;

      const cleanupAnalysis = getTempoCleanupAnalysis(out);
      state.tempoCleanCount = Math.max(0, Number(cleanupAnalysis?.removedCount) || 0);
      updateTempoCleanButton();
      stage = pipelineStage(stageIndex++, previousKey, "tempoClean", state.options.tempo.simplify, out, input => {
        if (!state.options.tempo.simplify) return input;
        transformCalls.tempoClean += 1;
        return resultMml(cleanupAnalysis, input);
      }, diagnostics);
      out = stage.output;
      previousKey = stage.key;

      stage = pipelineStage(stageIndex++, previousKey, "tempoScale", state.options.tempo.scale, out, input => {
        if (Number(state.options.tempo.scale) === 100) return input;
        transformCalls.tempoScale += 1;
        return scaleTempoCommands(input, state.options.tempo.scale);
      }, diagnostics);
      out = stage.output;

      state.lastApplySignature = signature;
      const changed = writeResultMml(out);
      try {
        window.dispatchEvent(new CustomEvent("mobibard:options-applied", {
          detail: {
            durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
            sourceVersion: state.sourceVersion,
            changed,
            transformCalls,
            cacheHits: diagnostics.cacheHits,
            stageDurations: diagnostics.stageDurations
          }
        }));
      } catch (_) {}
    } catch (error) {
      showOptionStatus(error?.message || String(error), "error");
    }
  }

  function normalizeMainToParts(text) {
    let source = String(text || "").trim();
    const match = source.match(/^\s*MML\s*@([\s\S]*?)\s*;?\s*$/i);
    if (match) source = match[1];
    const parts = source.split(",").slice(0, 6).map(item => String(item || "").trim());
    while (parts.length < 6) parts.push("");
    return parts;
  }

  function partDetail(parts) {
    return parts.map((part, index) => ({ part, index })).filter(item => item.part).map(item => `${channelLabel(item.index)} ${item.part.length.toLocaleString()}`).join(" · ") || "0";
  }

  function showToast(message, tone = "success") {
    let toast = state.ui.toast;
    if (!toast) {
      toast = el("div", "wb9-toast", { role: "status", "aria-live": "polite", hidden: true });
      state.ui.toast = toast;
      document.body.append(toast);
    }
    clearTimeout(state.toastTimer);
    toast.textContent = String(message || "");
    toast.dataset.tone = tone;
    toast.hidden = false;
    toast.classList.remove("is-visible");
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    state.toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
      window.setTimeout(() => { toast.hidden = true; }, 180);
    }, 1500);
  }

  function trackScoreCopy() {
    const event = { name: "score_copy", params: { page: "player", copy_scope: "split" } };
    try {
      const analytics = window.MobibardAnalytics;
      if (analytics && typeof analytics.logEvent === "function") {
        analytics.logEvent(event.name, event.params);
      } else {
        const queueKey = "__MOBIBARD_ANALYTICS_QUEUE__";
        const queue = Array.isArray(window[queueKey]) ? window[queueKey] : (window[queueKey] = []);
        queue.push(event);
        if (queue.length > 100) queue.splice(0, queue.length - 100);
      }
    } catch (_) {}
  }

  async function copyText(text) {
    const value = String(text || "").trim();
    if (!value) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch (_) {
      const textarea = el("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.append(textarea);
      textarea.select();
      try { copied = document.execCommand("copy") === true; } catch (_) { copied = false; }
      textarea.remove();
    }
    if (!copied) return;
    trackScoreCopy();
    showToast(t("copyToast"));
  }

  function splitPagesForCopy(mml) {
    const maxChars = Math.max(200, Math.min(5000, Math.round(Number(state.options.split.maxChars) || 2400)));
    const searchPercent = [50, 60, 70, 80, 90].includes(Number(state.options.split.searchPercent)) ? Number(state.options.split.searchPercent) : 50;
    state.options.split.maxChars = maxChars;
    state.options.split.searchPercent = searchPercent;
    if (!window.MabiOptimizer?.splitMmlPages) {
      return [{ index: 1, mml, parts: normalizeMainToParts(mml) }];
    }
    const result = window.MabiOptimizer.splitMmlPages(mml, {
      partCount: 6,
      maxChars,
      searchSlackChars: Math.round(maxChars * searchPercent / 100),
      minCommonSilenceBeats: 2
    });
    return Array.isArray(result?.pages) && result.pages.length ? result.pages : [{ index: 1, mml, parts: normalizeMainToParts(mml) }];
  }

  function renderCopyItem(title, detail, button) {
    const row = el("div", "copy-item wb4-copy-item");
    const meta = el("div", "copy-meta");
    meta.append(el("strong", "copy-title", { text: title }), el("span", "copy-detail", { text: detail }));
    row.append(meta, button);
    return row;
  }

  function createQuestionPanel({ title = "", message = "", defaultValue = "", mode = "prompt", multiline = false, confirmText = "", cancelText = "", host = null } = {}) {
    const panel = el("section", "wb4-inline-panel wb4-question-panel");
    const form = el("form", "dialog-card wb4-question-card");
    const titleNode = el("h3", "", { text: title || t(mode === "confirm" ? "confirm" : "promptValue") });
    const messageNode = el("p", "", { text: message });
    const uid = `wb-question-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    titleNode.id = `${uid}-title`;
    messageNode.id = `${uid}-message`;
    form.append(titleNode, messageNode);
    let input = null;
    if (mode === "prompt") {
      input = el(multiline ? "textarea" : "input", "wb4-question-input");
      if (!multiline) input.type = "text";
      input.value = String(defaultValue ?? "");
      form.append(input);
    }
    const actions = el("div", "dialog-actions");
    const cancel = el("button", "", { type: "button", text: cancelText || t("cancel") });
    const confirm = el("button", "primary", { type: "submit", text: confirmText || t("confirm") });
    actions.append(cancel, confirm);
    form.append(actions);
    panel.append(form);
    panel.setAttribute("role", mode === "confirm" ? "dialog" : "region");
    panel.setAttribute("aria-labelledby", titleNode.id);
    panel.setAttribute("aria-describedby", messageNode.id);
    (host || state.ui.sourceInlineHost || state.ui.copyInlineHost || state.ui.legacyHost)?.append(panel);
    panel.open = false;
    panel.showModal = () => { panel.open = true; panel.hidden = false; };
    panel.close = () => { panel.open = false; panel.hidden = true; panel.dispatchEvent(new Event("close")); };
    panel.hidden = true;
    return { panel, form, input, cancel, confirm };
  }

  function notify(title, message, options = {}) {
    const region = state.ui.noticeRegion;
    if (!region || (!title && !message)) return null;
    const notice = el("article", `wb4-notice tone-${options.tone || "info"}`);
    const content = el("div", "wb4-notice-content");
    if (title) content.append(el("strong", "", { text: title }));
    if (message) content.append(el("span", "", { text: message }));
    const close = el("button", "wb4-notice-close", { type: "button", text: "×", "aria-label": t("close") });
    close.addEventListener("click", () => notice.remove());
    notice.append(content, close);
    region.prepend(notice);
    while (region.children.length > 3) region.lastElementChild?.remove();
    return notice;
  }

  window.MobibardInlineUi = {
    notify,
    prompt(message, defaultValue = "", options = {}) {
      return new Promise(resolve => {
        const ui = createQuestionPanel({ title: options.title || "", message, defaultValue, mode: "prompt", multiline: Boolean(options.multiline) });
        let done = false;
        const finish = value => {
          if (done) return;
          done = true;
          ui.panel.close();
          ui.panel.remove();
          resolve(value);
        };
        ui.cancel.addEventListener("click", () => finish(null));
        ui.form.addEventListener("submit", event => {
          event.preventDefault();
          finish(ui.input?.value ?? "");
        });
        ui.panel.showModal();
        requestAnimationFrame(() => ui.input?.focus());
      });
    },
    confirm(message, options = {}) {
      return new Promise(resolve => {
        const modal = Boolean(options.modal);
        const ui = createQuestionPanel({
          title: options.title || t("confirm"),
          message,
          mode: "confirm",
          confirmText: options.confirmText || "",
          cancelText: options.cancelText || "",
          host: modal ? document.body : (options.host || null)
        });
        if (modal) {
          ui.panel.classList.add("wb13-modal-confirm");
          ui.panel.setAttribute("aria-modal", "true");
        }
        let done = false;
        const finish = value => {
          if (done) return;
          done = true;
          ui.panel.close();
          ui.panel.remove();
          resolve(Boolean(value));
        };
        ui.cancel.addEventListener("click", () => finish(false));
        ui.form.addEventListener("submit", event => {
          event.preventDefault();
          finish(true);
        });
        ui.panel.addEventListener("keydown", event => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          finish(false);
        });
        if (modal) {
          ui.panel.addEventListener("pointerdown", event => {
            if (event.target === ui.panel) finish(false);
          });
        }
        ui.panel.showModal();
        requestAnimationFrame(() => (modal ? ui.cancel : ui.confirm)?.focus());
      });
    }
  };

  /* Workbench v6: source preview, common overview, and task-oriented lower tabs. */
  const WB6_STRINGS = {
    ko: {
      original: "원본",
      play: "재생",
      stop: "정지",
      rewind: "처음으로",
      copyTab: "악보 복사",
      instrumentTab: "악기 선택",
      channelOptionTab: "채널 옵션",
      codeTab: "코드 편집",
      channelSettings: "채널 설정",
      instrumentSettings: "악기 설정",
      charsSummary: "채널별 글자 수",
      commonOptions: "공용 옵션",
      noInstrumentSource: "MIDI 계열 파일을 불러오면 6개 채널 설정과 전체 악기 목록이 표시됩니다.",
      allChannels: "전체 채널",
      originalUnavailable: "원본 음원을 지원하는 파일을 불러오면 사용할 수 있습니다."
    },
    en: {
      original: "Original",
      play: "Play",
      stop: "Stop",
      rewind: "Rewind",
      copyTab: "Copy score",
      instrumentTab: "Instruments",
      channelOptionTab: "Channel options",
      codeTab: "Edit code",
      channelSettings: "Channel settings",
      instrumentSettings: "Instrument settings",
      charsSummary: "Characters by channel",
      commonOptions: "Common options",
      noInstrumentSource: "Load a MIDI-family file to show all six channel settings and the full instrument list.",
      allChannels: "All channels",
      originalUnavailable: "Load a file with an original MIDI source to use this option."
    },
    ja: {
      original: "原音",
      play: "再生",
      stop: "停止",
      rewind: "先頭へ",
      copyTab: "楽譜コピー",
      instrumentTab: "楽器選択",
      channelOptionTab: "チャンネルオプション",
      codeTab: "コード編集",
      channelSettings: "チャンネル設定",
      instrumentSettings: "楽器チャンネル選択",
      charsSummary: "チャンネル別文字数",
      commonOptions: "共通オプション",
      noInstrumentSource: "MIDI系ファイルを読み込むと、6チャンネルの設定と楽器一覧が表示されます。",
      allChannels: "全チャンネル",
      originalUnavailable: "元のMIDI音源を含むファイルを読み込むと使用できます。"
    },
    "zh-CN": {
      original: "原始音源",
      play: "播放",
      stop: "停止",
      rewind: "返回开头",
      copyTab: "乐谱复制",
      instrumentTab: "乐器选择",
      channelOptionTab: "声道选项",
      codeTab: "代码编辑",
      channelSettings: "声道设置",
      instrumentSettings: "乐器声道选择",
      charsSummary: "各声道字符数",
      commonOptions: "通用选项",
      noInstrumentSource: "载入 MIDI 类文件后，将显示 6 个声道设置和完整乐器列表。",
      allChannels: "所有声道",
      originalUnavailable: "载入包含原始 MIDI 音源的文件后即可使用。"
    },
    "zh-TW": {
      original: "原始音源",
      play: "播放",
      stop: "停止",
      rewind: "回到開頭",
      copyTab: "樂譜複製",
      instrumentTab: "樂器選擇",
      channelOptionTab: "聲道選項",
      codeTab: "程式碼編輯",
      channelSettings: "聲道設定",
      instrumentSettings: "樂器聲道選擇",
      charsSummary: "各聲道字元數",
      commonOptions: "共用選項",
      noInstrumentSource: "載入 MIDI 類型檔案後，將顯示 6 個聲道設定與完整樂器清單。",
      allChannels: "所有聲道",
      originalUnavailable: "載入包含原始 MIDI 音源的檔案後即可使用。"
    }
  };

  function wb6t(key, values = []) {
    let value = WB6_STRINGS[lang()]?.[key] ?? WB6_STRINGS.en[key] ?? key;
    values.forEach((item, index) => { value = value.replaceAll(`{${index}}`, String(item)); });
    return value;
  }

  function wb6Text(key, className = "", tag = "span") {
    return el(tag, className, { "data-wb6-text": key, text: wb6t(key) });
  }

  function updateLocalText() {
    document.querySelectorAll("[data-wb4-text]").forEach(node => { node.textContent = t(node.dataset.wb4Text); });
    document.querySelectorAll("[data-wb4-aria]").forEach(node => node.setAttribute("aria-label", t(node.dataset.wb4Aria)));
    document.querySelectorAll("[data-wb6-text]").forEach(node => { node.textContent = wb6t(node.dataset.wb6Text); });
    document.querySelectorAll("[data-wb8-feature-key]").forEach(node => { node.textContent = t(node.dataset.wb8FeatureKey); });
    document.querySelectorAll("[data-wb8-channel-index]").forEach(node => {
      const index = Number(node.dataset.wb8ChannelIndex);
      node.textContent = index < 0 ? t("applyAll") : channelLabel(index);
    });
    if (state.ui.titleName) state.ui.titleName.textContent = appText("mml.generator_title", "MML 생성기");
    if (state.ui.fileName && !state.ui.fileName.dataset.hasFile) state.ui.fileName.textContent = t("noFile");
    state.ui.channelTabGroups?.forEach(group => group.forEach(button => {
      const index = Number(button.dataset.channelIndex);
      button.textContent = index < 0 ? wb6t("allChannels") : channelLabel(index);
    }));
    if (state.ui.codeHelpButton) state.ui.codeHelpButton.textContent = t("codeHelp");
    if ($("pasteBtn")) $("pasteBtn").textContent = t("pasteMml");
    const play = $("playToggleBtn");
    if (play) {
      const playing = play.classList.contains("danger");
      play.setAttribute("aria-label", wb6t(playing ? "stop" : "play"));
      play.title = wb6t(playing ? "stop" : "play");
    }
    const rewind = $("rewindBtn");
    if (rewind) {
      rewind.setAttribute("aria-label", wb6t("rewind"));
      rewind.title = wb6t("rewind");
    }
    const leftHead = $("midiRoleList")?.closest(".midi-left-panel")?.querySelector(".dialog-section-head strong");
    if (leftHead) {
      leftHead.removeAttribute("data-i18n");
      leftHead.textContent = wb6t("channelSettings");
    }
    const instrumentHead = $("midiInstrumentPanelTitle");
    if (instrumentHead) {
      instrumentHead.removeAttribute("data-i18n");
      instrumentHead.textContent = wb6t("instrumentSettings");
    }
    refreshWorkbenchV9Text();
    syncMidiQuantizeControl();
    updateTempoCleanButton();
    syncVolumeGenerationControls();
    syncAccompanimentFeatureControls();
    scheduleChannelCountsUpdate();
    scheduleCopyRowsRender();
  }


  function refreshWorkbenchV9Text() {
    const supported = document.querySelector("[data-supported-files-button]");
    if (supported) supported.textContent = t("supported");
    if ($("midiLoadBtn")) $("midiLoadBtn").textContent = t("loadFile");
    if ($("googleDriveLoadBtn")) $("googleDriveLoadBtn").textContent = t("driveLoad");
    if ($("pasteBtn")) $("pasteBtn").textContent = t("pasteMml");

    const restKeys = { keep: "keep", "64": "rest64", "32": "rest32", "16": "rest16", "8": "rest8", "4": "rest4", all: "all" };
    document.querySelectorAll(".wb9-rest-buttons .wb4-segment").forEach(button => {
      const key = restKeys[String(button.dataset.value || "")];
      if (key) button.textContent = t(key);
    });

    const quantizeKeys = { "64": "quantize64", "32": "quantize32" };
    document.querySelectorAll(".wb7-quantize-segments .wb4-segment").forEach(button => {
      const key = quantizeKeys[String(button.dataset.value || "")];
      if (key) button.textContent = t(key);
    });

    const genreKeys = { "": "genreSelect", pop: "pop", jazz: "jazz", ballad: "ballad", bossa: "bossa", rock: "rock", funk: "funk", classical: "classical" };
    document.querySelectorAll(".wb9-genre-select").forEach(select => {
      [...select.options].forEach(option => {
        const key = genreKeys[String(option.value || "")];
        if (key) option.textContent = t(key);
      });
    });

    const strengthKeys = { light: "light", normal: "normal", strong: "strong" };
    document.querySelectorAll(".wb9-strength-select").forEach(select => {
      [...select.options].forEach(option => {
        const key = strengthKeys[String(option.value || "")];
        if (key) option.textContent = t(key);
      });
    });

    const shortLabels = [t("melShort"), "1", "2", "3", "4", "5"];
    document.querySelectorAll(".wb9-playback-channel[data-playback-channel-index]").forEach(button => {
      const index = Math.max(0, Math.min(5, Number(button.dataset.playbackChannelIndex) || 0));
      button.textContent = shortLabels[index];
      button.title = channelLabel(index);
    });
    document.querySelectorAll(".wb9-target-channel").forEach((button, index) => {
      const normalized = Math.max(0, Math.min(5, index % 6));
      button.textContent = shortLabels[normalized];
      button.title = channelLabel(normalized);
    });

    document.querySelectorAll(".wb9-accompaniment-channel-control").forEach(control => {
      const labels = control.querySelectorAll(".wb4-toggle-row span");
      if (labels[0]) labels[0].textContent = t("useForAnalysis");
      if (labels[1]) labels[1].textContent = t("useForGeneration");
    });

    const mobibeat = $("rhythmGameBtn");
    const mobibeatLabel = mobibeat?.querySelector("span:last-child");
    if (mobibeatLabel) mobibeatLabel.textContent = t("mobibeat");
    if (mobibeat) {
      mobibeat.title = t("mobibeat");
      mobibeat.setAttribute("aria-label", t("mobibeat"));
    }
  }

  function syncOriginalPreviewSource() {
    const checkbox = state.ui.originalCheckbox;
    if (!checkbox) return;
    const available = Boolean(state.originalPreviewAvailable);
    checkbox.disabled = !available;
    checkbox.title = available ? "" : wb6t("originalUnavailable");
    if (!available && checkbox.checked) checkbox.checked = false;
    const requested = available && Boolean(checkbox.checked);
    state.originalPreview = requested;
    checkbox.setAttribute("aria-checked", requested ? "true" : "false");
    state.ui.previewBlock?.classList.toggle("is-original-preview", requested);
    try {
      window.dispatchEvent(new CustomEvent("mobibard:original-midi-preview", {
        detail: { active: requested }
      }));
    } catch (_) {}
  }

  function createChannelTabs(scope, includeAll = false) {
    const tabs = el("div", `wb6-channel-tabs wb6-${scope}-channel-tabs${includeAll ? " wb7-has-all-channel" : ""}`, {
      role: "tablist",
      "aria-label": appText("mml.select_part", t("selectChannel"))
    });
    const values = includeAll ? [-1, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5];
    const buttons = [];
    values.forEach(value => {
      const activeValue = includeAll ? state.activeChannelView : state.activeChannel;
      const active = value === activeValue;
      const button = el("button", `wb6-channel-tab ${value < 0 ? "wb7-all-channel-tab" : `wb6-channel-tab-${value}`}`, {
        type: "button",
        role: "tab",
        text: value < 0 ? wb6t("allChannels") : channelLabel(value),
        "aria-selected": active ? "true" : "false",
        tabindex: active ? "0" : "-1",
        style: value < 0 ? "--wb6-channel-color:var(--wb4-accent)" : `--wb6-channel-color:var(--part${value})`
      });
      button.dataset.channelIndex = String(value);
      button.dataset.channelScope = scope;
      button.addEventListener("click", () => activateChannelView(value));
      button.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const current = Math.max(0, values.indexOf(includeAll ? state.activeChannelView : state.activeChannel));
        let target = current;
        if (event.key === "ArrowLeft") target = (current + values.length - 1) % values.length;
        if (event.key === "ArrowRight") target = (current + 1) % values.length;
        if (event.key === "Home") target = 0;
        if (event.key === "End") target = values.length - 1;
        activateChannelView(values[target]);
        buttons[target]?.focus();
      });
      tabs.append(button);
      buttons.push(button);
    });
    state.ui.channelTabGroups ||= [];
    state.ui.channelTabGroups.push(buttons);
    return tabs;
  }

  function commonValue(getter) {
    const values = ensureChannelDraft().channels.map(getter);
    return { value: values[0], mixed: values.some(value => String(value) !== String(values[0])) };
  }

  function syncMidiQuantizeControl() {
    const control = state.ui.quantizeControl;
    if (!control) return;
    control.setValue(String(state.midiQuantizeDivision), { silent: true });
    control.querySelectorAll("button").forEach(button => {
      button.disabled = !state.midiQuantizeAvailable;
      button.title = state.midiQuantizeAvailable ? "" : wb6t("noInstrumentSource");
    });
    control.classList.toggle("is-disabled", !state.midiQuantizeAvailable);
  }

  function scheduleChannelCountsUpdate() {
    if (state.channelCountFrame) cancelAnimationFrame(state.channelCountFrame);
    state.channelCountFrame = requestAnimationFrame(() => {
      state.channelCountFrame = 0;
      updateChannelCodeCount();
    });
  }

  function updateChannelCodeCount(index = state.activeChannelView) {
    const mainText = String($("mainMml")?.value || "");
    const mainParts = normalizeMainToParts(mainText);
    const counts = [];
    for (let partIndex = 0; partIndex < 6; partIndex += 1) {
      const partText = String(mainParts[partIndex] || $(`part${partIndex}`)?.value || "");
      const count = partText.length;
      counts.push(count);
      const countNode = state.ui.channelCharCounts?.[partIndex];
      if (countNode) {
        const formatted = Number(count).toLocaleString(document.documentElement.lang || undefined);
        countNode.textContent = lang() === "en" ? `${formatted} ${t("chars")}` : `${formatted}${t("chars")}`;
      }
    }

    const allChannels = Number(index) < 0;
    const metricText = allChannels ? mainText : String(mainParts[index] || $(`part${index}`)?.value || "");
    const charValue = allChannels ? mainText.length : Number(counts[index] || 0);
    const restValue = (metricText.match(/r(?=\s*(?:\d|\.|&|[a-g<>ovtln#+,;@-]|$))/gi) || []).length;
    const volumeValue = (metricText.match(/v\s*\d+/gi) || []).length;
    const formatMetric = value => Number(value || 0).toLocaleString(document.documentElement.lang || undefined);

    if (state.ui.codeCount) {
      const count = formatMetric(charValue);
      state.ui.codeCount.textContent = lang() === "en" ? `${count} ${t("chars")}` : `${count}${t("chars")}`;
      state.ui.codeCount.className = allChannels
        ? "char-count wb4-channel-code-count wb6-code-count wb7-all-code-count wb10-code-metric-value"
        : `char-count wb4-channel-code-count wb6-code-count part-count-${index} wb10-code-metric-value`;
    }
    if (state.ui.codeRestCount) state.ui.codeRestCount.textContent = t("itemCount", [formatMetric(restValue)]);
    if (state.ui.codeVolumeCount) state.ui.codeVolumeCount.textContent = t("itemCount", [formatMetric(volumeValue)]);
  }

  function buildOverviewBlock(canvas) {
    const block = el("section", "wb4-block wb6-overview-block", {
      "data-active-channel": state.activeChannel
    });
    state.ui.overviewBlock = block;
    const countStrip = el("div", "wb6-channel-count-strip", {
      "aria-label": wb6t("charsSummary")
    });
    state.ui.channelCharCounts = [];
    for (let index = 0; index < 6; index += 1) {
      const item = el("div", `wb6-channel-count wb6-channel-count-${index}`, {
        style: `--wb6-channel-color:var(--part${index})`
      });
      const name = el("span", "wb6-channel-count-name", { text: channelLabel(index) });
      const value = el("strong", "wb6-channel-count-value", { text: lang() === "en" ? `0 ${t("chars")}` : `0${t("chars")}` });
      item.append(name, value);
      countStrip.append(item);
      state.ui.channelCharCounts.push(value);
    }
    const common = buildCommonOptions();
    state.ui.optionStatus = el("div", "wb4-option-status wb6-option-status", { role: "status", "aria-live": "polite", hidden: true });
    block.append(countStrip, common, state.ui.optionStatus);
    canvas.append(block);
  }

  function buildInstrumentWorkspacePanel() {
    const panel = el("section", "wb6-workspace-panel wb6-instrument-panel wb7-instrument-panel", {
      role: "tabpanel",
      "data-workspace-panel": "instrument",
      hidden: true
    });
    state.ui.instrumentApplyBar = el("div", "wb11-pending-apply wb11-instrument-apply", {
      role: "status",
      "aria-live": "polite",
      hidden: true
    });
    const pendingText = keyedText("instrumentPending", "wb11-pending-apply-text");
    state.ui.instrumentCancelButton = $("midiConvertCancel");
    state.ui.instrumentApplyButton = $("midiConvertApply");
    const pendingActions = el("div", "wb11-pending-actions wb13-instrument-pending-actions");
    if (state.ui.instrumentCancelButton) {
      state.ui.instrumentCancelButton.removeAttribute("data-i18n");
      state.ui.instrumentCancelButton.textContent = t("cancel");
      state.ui.instrumentCancelButton.className = "wb11-cancel-button wb13-instrument-cancel-button";
      pendingActions.append(state.ui.instrumentCancelButton);
    }
    if (state.ui.instrumentApplyButton) {
      state.ui.instrumentApplyButton.removeAttribute("data-i18n");
      state.ui.instrumentApplyButton.setAttribute("data-wb4-text", "apply");
      state.ui.instrumentApplyButton.textContent = t("apply");
      state.ui.instrumentApplyButton.className = "wb11-apply-button primary";
      pendingActions.append(state.ui.instrumentApplyButton);
    }
    state.ui.instrumentApplyBar.append(pendingText, pendingActions);
    state.ui.assignmentHost = el("div", "wb4-assignment-host wb6-assignment-host");
    state.ui.assignmentEmpty = wb6Text("noInstrumentSource", "wb4-assignment-empty wb6-assignment-empty");
    state.ui.assignmentHost.append(state.ui.assignmentEmpty);
    panel.append(state.ui.instrumentApplyBar, state.ui.assignmentHost);
    return panel;
  }

  function buildCodeWorkspacePanel() {
    const panel = el("section", "wb6-workspace-panel wb6-code-panel", {
      role: "tabpanel",
      "data-workspace-panel": "code",
      hidden: true,
      "data-active-channel": String(state.activeChannelView)
    });
    panel.append(createChannelTabs("code", true));
    const tools = el("div", "wb4-channel-code-tools wb6-code-tools wb10-code-tools");
    const metrics = el("div", "wb10-code-metrics", { role: "group", "aria-label": t("codeEdit") });
    const createMetric = (key, valueNode) => {
      const item = el("div", "wb10-code-metric");
      item.append(keyedText(key, "wb10-code-metric-label"), valueNode);
      return item;
    };

    state.ui.codeCount = $("charCount") || el("span", "char-count wb4-channel-code-count wb6-code-count");
    state.ui.codeCount.replaceChildren();
    state.ui.codeCount.className = "char-count wb4-channel-code-count wb6-code-count wb10-code-metric-value";
    state.ui.codeRestCount = el("strong", "wb10-code-metric-value", { text: t("itemCount", [0]) });
    state.ui.codeVolumeCount = el("strong", "wb10-code-metric-value", { text: t("itemCount", [0]) });
    metrics.append(
      createMetric("codeChars", state.ui.codeCount),
      createMetric("codeRests", state.ui.codeRestCount),
      createMetric("codeVolumes", state.ui.codeVolumeCount)
    );
    tools.append(metrics);

    state.ui.codeHelpButton = $("codeHelpBtn");
    if (state.ui.codeHelpButton) {
      state.ui.codeHelpButton.removeAttribute("data-i18n");
      state.ui.codeHelpButton.textContent = t("codeHelp");
      state.ui.codeHelpButton.className = "wb4-code-help-button wb6-code-help-button";
      tools.append(state.ui.codeHelpButton);
    }
    state.ui.codeEditorHost = el("div", "wb4-channel-code-editor wb6-channel-code-editor", { id: "wb4ChannelCodeEditor" });
    panel.append(tools, state.ui.codeEditorHost);
    return panel;
  }

  function buildCopyWorkspacePanel() {
    const panel = el("section", "wb6-workspace-panel wb6-copy-panel", {
      role: "tabpanel",
      "data-workspace-panel": "copy"
    });
    state.ui.copyRows = el("div", "wb4-copy-results");
    state.ui.copyInlineHost = el("div", "wb4-inline-host");
    panel.append(state.ui.copyRows, state.ui.copyInlineHost);
    return panel;
  }

  function buildWorkspaceBlock(canvas) {
    const block = el("section", "wb4-block wb6-workspace-block", {
      "data-active-channel": state.activeChannel
    });
    state.ui.workspaceBlock = block;
    const tabs = el("div", "wb6-workspace-tabs", { role: "tablist" });
    const definitions = [
      ["copy", "copyTab"],
      ["instrument", "instrumentTab"],
      ["channel", "channelOptionTab"],
      ["code", "codeTab"]
    ];
    state.ui.workspaceTabs = [];
    definitions.forEach(([name, key], index) => {
      const button = el("button", "wb6-workspace-tab", {
        type: "button",
        role: "tab",
        "data-workspace-tab": name,
        "data-wb6-text": key,
        text: wb6t(key),
        "aria-selected": index === 0 ? "true" : "false",
        tabindex: index === 0 ? "0" : "-1"
      });
      button.addEventListener("click", () => activateWorkspaceTab(name));
      button.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const current = definitions.findIndex(item => item[0] === state.activeWorkspaceTab);
        let target = current;
        if (event.key === "ArrowLeft") target = (current + definitions.length - 1) % definitions.length;
        if (event.key === "ArrowRight") target = (current + 1) % definitions.length;
        if (event.key === "Home") target = 0;
        if (event.key === "End") target = definitions.length - 1;
        activateWorkspaceTab(definitions[target][0]);
        state.ui.workspaceTabs[target]?.focus();
      });
      tabs.append(button);
      state.ui.workspaceTabs.push(button);
    });

    state.ui.workspacePanels = {
      copy: buildCopyWorkspacePanel(),
      instrument: buildInstrumentWorkspacePanel(),
      channel: buildChannelOptionsWorkspacePanel(),
      code: buildCodeWorkspacePanel()
    };
    block.append(tabs, ...Object.values(state.ui.workspacePanels));
    canvas.append(block);
    activateWorkspaceTab(state.activeWorkspaceTab || "copy");
  }

  function syncChannelCodeEditor() {
    const view = state.activeChannelView;
    const panelName = view < 0 ? "main" : `part${view}`;
    const panel = document.querySelector(`.mml-panel[data-panel="${panelName}"]`);
    if (panel && state.ui.codeEditorHost) {
      state.ui.codeEditorHost.querySelectorAll(".mml-panel").forEach(item => { item.hidden = true; });
      state.ui.codeEditorHost.append(panel);
      panel.hidden = false;
    }
    const hiddenTab = document.querySelector(`.tab-btn[data-tab="${panelName}"]`);
    if (hiddenTab) hiddenTab.click();
    updateChannelCodeCount(view);
  }

  function activateChannel(index) {
    activateChannelView(index);
  }

  function buildShell() {
    $("clearAllMmlBtn")?.remove();
    $("midiSelectedPreviewBtn")?.remove();
    $("midiFullPreviewBtn")?.remove();
    $("midiGuideBox")?.remove();
    const nativeQuantize = $("midiQuantizeToggle");
    if (nativeQuantize) {
      nativeQuantize.hidden = true;
      nativeQuantize.classList.add("wb7-native-quantize-toggle");
    }
    document.body.classList.add("player-source-workbench-v6", "player-source-workbench-v7", "player-source-workbench-v8", "player-source-workbench-v9");
    state.activeWorkspaceTab = "copy";
    state.activeChannelView = 0;
    state.originalPreview = false;
    state.ui.channelTabGroups = [];
    buildHeaderActions();
    const shell = el("section", "wb4-shell wb6-shell wb7-shell wb8-shell");
    const canvas = el("div", "wb4-canvas wb6-canvas wb7-canvas wb8-canvas");
    state.ui.canvas = canvas;
    state.ui.legacyHost = el("div", "wb4-legacy-host", { hidden: true });
    state.ui.noticeRegion = el("div", "wb4-notices", { "aria-live": "polite" });
    buildTitle(canvas);
    canvas.append(state.ui.noticeRegion);
    buildSourceBlock(canvas);
    buildPreviewBlock(canvas);
    buildOverviewBlock(canvas);
    buildWorkspaceBlock(canvas);
    // Move the retained copy/save controls before the legacy file toolbar is removed.
    // app.js binds these elements synchronously immediately after this script.
    renderCopyRows();
    state.ui.legacyHost.append(editorCard);
    canvas.append(state.ui.legacyHost);
    shell.append(canvas);
    main.replaceChildren(shell);
    fileToolbar.remove();
    menuCard.remove();
    activateChannelView(state.activeChannelView);
  }

  function targetForPanel(id) {
    if (id === "midiConvertDialog" || id === "midiBulkAssignDialog") return state.ui.assignmentHost;
    if (id === "mmiImportDialog") return state.ui.sourceInlineHost;
    if (id === "googleDriveSaveDialog") return state.ui.copyInlineHost;
    return state.ui.legacyHost;
  }

  function registerPanel(panel) {
    const target = targetForPanel(panel.id) || state.ui.legacyHost;
    const local = { open: false, returnValue: "" };
    state.panelState.set(panel, local);
    panel.classList.add("wb4-inline-panel");
    panel.hidden = true;
    panel.removeAttribute("aria-modal");
    panel.setAttribute("role", "region");
    Object.defineProperty(panel, "open", {
      configurable: true,
      enumerable: true,
      get: () => local.open,
      set: value => value ? panel.showModal() : panel.close()
    });
    Object.defineProperty(panel, "returnValue", {
      configurable: true,
      enumerable: true,
      get: () => local.returnValue,
      set: value => { local.returnValue = String(value ?? ""); }
    });
    panel.showModal = () => {
      local.open = true;
      panel.hidden = false;
      panel.setAttribute("aria-hidden", "false");
      if (panel.id === "midiConvertDialog") {
        activateWorkspaceTab("instrument");
        state.ui.assignmentEmpty.hidden = true;
        const leftHead = panel.querySelector(".midi-left-panel .dialog-section-head strong");
        if (leftHead) {
          leftHead.removeAttribute("data-i18n");
          leftHead.textContent = wb6t("channelSettings");
        }
        const rightHead = panel.querySelector("#midiInstrumentPanelTitle");
        if (rightHead) {
          rightHead.removeAttribute("data-i18n");
          rightHead.textContent = wb6t("instrumentSettings");
        }
        updateMidiChannelFilter();
        requestAnimationFrame(updateMidiChannelFilter);
      }
      state.openPanels.push(panel);
      if (target === state.ui.legacyHost) panel.hidden = true;
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    };
    panel.show = panel.showModal;
    panel.close = (value = "") => {
      if (!local.open) return;
      local.open = false;
      local.returnValue = String(value ?? "");
      panel.hidden = true;
      panel.setAttribute("aria-hidden", "true");
      const index = state.openPanels.lastIndexOf(panel);
      if (index >= 0) state.openPanels.splice(index, 1);
      panel.dispatchEvent(new Event("close"));
    };
    target?.append(panel);
  }

  function convertDialogs() {
    const nativePopupIds = new Set(["tempoEditDialog", "partSoundDialog", "codeHelpDialog", "pasteMmlDialog", "midiBulkAssignDialog"]);
    Array.from(document.querySelectorAll("dialog")).forEach(dialog => {
      if (nativePopupIds.has(dialog.id)) return;
      const panel = el("section", `${dialog.className} wb4-converted-dialog`);
      for (const attr of Array.from(dialog.attributes)) {
        if (["class", "open", "aria-modal"].includes(attr.name)) continue;
        panel.setAttribute(attr.name, attr.value);
      }
      while (dialog.firstChild) panel.append(dialog.firstChild);
      dialog.replaceWith(panel);
      registerPanel(panel);
    });
    state.ui.assignmentHost?.addEventListener("change", event => {
      if (event.target.closest("#midiConvertDialog")) scheduleMidiAutoApply();
    });
    state.ui.assignmentHost?.addEventListener("click", event => {
      const button = event.target.closest("button");
      if (!button || !button.closest("#midiConvertDialog")) return;
      if (["midiSelectedPreviewBtn", "midiFullPreviewBtn", "midiBulkAssignBtn", "midiConvertReloadFile", "midiConvertGoogleDriveLoad", "midiConvertApply", "midiConvertCancel"].includes(button.id)) return;
      if (button.closest("#midiBulkAssignDialog")) return;
      scheduleMidiAutoApply();
    });
  }

  function installGlobalHandling() {
    window.addEventListener("mobibard:source-baseline", event => receiveSourceBaseline(event.detail || {}));
    window.addEventListener("mobibard:midi-settings-dirty", () => {
      queueMicrotask(() => refreshInstrumentDirtyState());
    });
    window.addEventListener("mobibard:midi-settings-cancelled", () => {
      setInstrumentDirty(false);
      clearPendingPlaybackPreview();
      showToast(t("instrumentCancelled"), "info");
      scheduleSessionPersist();
    });
    window.addEventListener("mobibard:toast", event => showToast(event.detail?.message || "", event.detail?.tone || "info"));
    window.addEventListener("mobibard:midi-convert-complete", event => {
      if (event.detail?.name) setSourceName(event.detail.name);
      setInstrumentDirty(false);
      clearPendingPlaybackPreview();
      scheduleSessionPersist();
      const status = $("midiConvertStatus");
      if (status) { status.textContent = ""; status.hidden = true; }
      activateWorkspaceTab("instrument");
      scheduleChannelCountsUpdate();
      renderCopyRows();
    });
    window.addEventListener("mobibard:original-preview-availability", event => {
      state.originalPreviewAvailable = Boolean(event.detail?.available);
      if (!state.originalPreviewAvailable && state.ui.originalCheckbox) state.ui.originalCheckbox.checked = false;
      syncOriginalPreviewSource();
    });
    window.addEventListener("mobibard:original-preview-state", event => {
      const active = Boolean(event.detail?.active) && state.originalPreviewAvailable;
      state.originalPreview = active;
      if (state.ui.originalCheckbox) {
        state.ui.originalCheckbox.checked = active;
        state.ui.originalCheckbox.setAttribute("aria-checked", active ? "true" : "false");
      }
      state.ui.previewBlock?.classList.toggle("is-original-preview", active);
    });
    window.addEventListener("mobibard:midi-quantize-state", event => {
      state.midiQuantizeAvailable = Boolean(event.detail?.available);
      state.midiQuantizeDivision = Number(event.detail?.division) === 32 ? 32 : 64;
      syncMidiQuantizeControl();
    });
    window.addEventListener("mobibard:localechange", updateLocalText);
    $("mainMml")?.addEventListener("input", event => {
      if (!state.applying) {
        state.manualEdited = true;
        if (event.isTrusted) markWorkbenchEdited();
      }
      scheduleChannelCountsUpdate();
      scheduleCopyRowsRender();
      scheduleSessionPersist();
    });
    for (let index = 0; index < 6; index += 1) {
      $(`part${index}`)?.addEventListener("input", event => {
        if (!state.applying && event.isTrusted) markWorkbenchEdited();
        scheduleChannelCountsUpdate();
        scheduleCopyRowsRender();
        scheduleSessionPersist();
      });
    }
    window.addEventListener("resize", syncPlaybackChannelPlacement, { passive: true });
    window.addEventListener("pagehide", () => { if (state.sessionHasUserEdit && state.sourceMml) void persistLastWorkbenchSession(); });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && state.sessionHasUserEdit && state.sourceMml) void persistLastWorkbenchSession();
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if (document.querySelector(".wb13-modal-confirm:not([hidden])")) return;
      const panel = [...state.openPanels].reverse().find(item => item.open && !item.hidden);
      if (!panel) return;
      const cancel = new Event("cancel", { cancelable: true });
      if (panel.dispatchEvent(cancel)) panel.close("escape");
    }, true);
  }

  /* Workbench v9: immediate source-based options, compact metrics, and cached transforms. */
  function wb9NumberControl({ min, max, step = 1, value, suffix = "", label = "", onChange }) {
    const wrap = el("div", "wb9-number-control");
    const numericStep = Math.max(Number.EPSILON, Number(step) || 1);
    const decimals = String(numericStep).includes(".") ? String(numericStep).split(".")[1].length : 0;
    let current = Number(value) || 0;
    const input = el("input", "wb4-number wb9-number-input", {
      type: "number", min, max, step: numericStep, value: current,
      "aria-label": label || undefined
    });
    const buttonWrap = el("div", "wb9-number-step-buttons");
    const up = el("button", "wb9-number-step is-up", {
      type: "button", text: "▲",
      "aria-label": t("increaseValue", [label || t("promptValue")])
    });
    const down = el("button", "wb9-number-step is-down", {
      type: "button", text: "▼",
      "aria-label": t("decreaseValue", [label || t("promptValue")])
    });
    const suffixNode = suffix ? el("span", "wb4-number-suffix wb9-number-suffix", { text: suffix }) : null;
    const normalize = raw => {
      let next = Number(raw);
      if (!Number.isFinite(next)) next = current;
      next = Math.max(Number(min), Math.min(Number(max), next));
      next = Math.round(next / numericStep) * numericStep;
      return Number(next.toFixed(decimals));
    };
    const format = next => decimals > 0 ? Number(next).toFixed(decimals).replace(/\.0+$/, "") : String(Math.round(next));
    const syncButtons = () => {
      up.disabled = current >= Number(max);
      down.disabled = current <= Number(min);
    };
    const setValue = (raw, { silent = true, mixed = false } = {}) => {
      const next = normalize(raw);
      current = next;
      input.value = mixed ? "" : format(next);
      input.placeholder = mixed ? t("mixedValues") : "";
      wrap.dataset.mixed = mixed ? "true" : "false";
      syncButtons();
      if (!silent && !mixed) onChange(next);
    };
    const stepBy = direction => {
      const base = input.value === "" ? current : Number(input.value);
      setValue(base + numericStep * direction, { silent: false });
      input.focus();
    };
    up.addEventListener("click", () => stepBy(1));
    down.addEventListener("click", () => stepBy(-1));
    input.addEventListener("change", () => setValue(input.value, { silent: false }));
    input.addEventListener("blur", () => setValue(input.value, { silent: true }));
    wrap.setValue = setValue;
    wrap._input = input;
    buttonWrap.append(up, down);
    wrap.append(input, buttonWrap);
    if (suffixNode) wrap.append(suffixNode);
    setValue(current);
    return wrap;
  }

  function scheduleCopyRowsRender() {
    state.copyDirty = true;
    if (state.activeWorkspaceTab !== "copy") return;
    if (state.copyRenderFrame) cancelAnimationFrame(state.copyRenderFrame);
    state.copyRenderFrame = requestAnimationFrame(() => {
      state.copyRenderFrame = 0;
      if (!state.copyDirty) return;
      state.copyDirty = false;
      renderCopyRows();
    });
  }

  function getRestRemovalCounts(mode) {
    if (!state.sourceMml || mode === "keep") return Array.from({ length: 6 }, () => 0);
    if (state.metricsCache.sourceVersion !== state.sourceVersion) {
      state.metricsCache.sourceVersion = state.sourceVersion;
      state.metricsCache.restInput = "";
      state.metricsCache.rest = new Map();
    }
    if (state.metricsCache.rest.has(mode)) return state.metricsCache.rest.get(mode);
    const metricInput = state.metricsCache.restInput || state.sourceMml;
    let counts = Array.from({ length: 6 }, () => 0);
    try {
      const result = window.MabiOptimizer?.countShortRestsMml?.(metricInput, {
        partCount: 6,
        all: mode === "all",
        denom: mode === "all" ? 64 : Number(mode)
      });
      counts = Array.from({ length: 6 }, (_, index) => Math.max(0, Number(result?.counts?.[index]) || 0));
    } catch (_) {}
    state.metricsCache.rest.set(mode, counts);
    return counts;
  }

  function getVolumeDistributions() {
    const source = String($("mainMml")?.value || "");
    const draft = ensureChannelDraft().channels;
    const adjustments = draft.map((channel, index) => Number(channel.volumeDelta || 0) - Number(state.options.channels[index]?.volumeDelta || 0));
    const cacheKey = `${source}\n#draft-volume:${adjustments.join(",")}`;
    if (state.metricsCache.volumeSource === cacheKey && state.metricsCache.volume.length === 6) return state.metricsCache.volume;
    const parts = normalizeMainToParts(source);
    const rows = parts.map((part, index) => {
      if (!part) return { total: 0, items: [] };
      try {
        const notes = window.MabiMml?.parseMmlPart?.(part, index)?.notes || [];
        const counts = new Map();
        const delta = adjustments[index] || 0;
        for (const note of notes) {
          const volume = Math.max(0, Math.min(15, Math.round(Number(note?.volume ?? 8) + delta)));
          counts.set(volume, (counts.get(volume) || 0) + 1);
        }
        return {
          total: notes.length,
          items: [...counts.entries()].sort((a, b) => b[0] - a[0]).map(([volume, count]) => ({ volume, count }))
        };
      } catch (_) {
        return { total: 0, items: [] };
      }
    });
    state.metricsCache.volumeSource = cacheKey;
    state.metricsCache.volume = rows;
    return rows;
  }

  function getOctaveRanges() {
    const source = String($("mainMml")?.value || "");
    const parts = normalizeMainToParts(source);
    const draft = ensureChannelDraft().channels;
    return parts.map((part, index) => {
      if (!part) return null;
      try {
        const notes = window.MabiMml?.parseMmlPart?.(part, index)?.notes || [];
        if (!notes.length) return null;
        const delta = (Number(draft[index]?.octaveDelta) || 0) - (Number(state.options.channels[index]?.octaveDelta) || 0);
        let minOctave = Infinity;
        let maxOctave = -Infinity;
        for (const note of notes) {
          const midi = Math.max(0, Math.min(127, Math.round(Number(note?.midi) || 0) + delta * 12));
          const octave = Math.max(0, Math.min(9, Math.floor(midi / 12) - 1));
          minOctave = Math.min(minOctave, octave);
          maxOctave = Math.max(maxOctave, octave);
        }
        return Number.isFinite(minOctave) ? { min: minOctave, max: maxOctave, count: notes.length } : null;
      } catch (_) {
        return null;
      }
    });
  }

  function renderOctaveRange(node, range) {
    if (!node) return;
    node.textContent = range ? `O${range.min} – O${range.max}` : t("noNotes");
    node.classList.toggle("is-empty", !range);
  }

  function setCountBadge(node, count) {
    if (!node) return;
    node.textContent = t("itemCount", [Math.max(0, Number(count) || 0).toLocaleString(document.documentElement.lang || undefined)]);
  }

  function renderVolumeChips(node, items) {
    if (!node) return;
    node.replaceChildren();
    const values = Array.isArray(items) ? items : [];
    if (!values.length) {
      node.append(el("span", "wb9-volume-chip is-empty", { text: "V-" }));
      return;
    }
    values.forEach(({ volume, count }) => node.append(el("span", "wb9-volume-chip", {
      text: `V${volume} × ${Number(count).toLocaleString(document.documentElement.lang || undefined)}`
    })));
  }

  function updateOptionMetrics() {
    if (!state.ui.featurePanels || state.activeWorkspaceTab !== "channel") return;
    if (state.activeOptionFeature === "rest") {
      const channelCounts = ensureChannelDraft().channels.map((channel, index) => getRestRemovalCounts(channel.restMode)[index] || 0);
      setCountBadge(state.ui.restBatchMetric, channelCounts.reduce((sum, count) => sum + count, 0));
      (state.ui.restMetricNodes || []).forEach((node, index) => setCountBadge(node, channelCounts[index]));
      return;
    }
    if (state.activeOptionFeature === "volume") {
      const rows = getVolumeDistributions();
      rows.forEach((row, index) => {
        const metric = state.ui.volumeMetricNodes?.[index];
        renderVolumeChips(metric?.detail, row.items);
      });
      return;
    }
    if (state.activeOptionFeature === "octave") {
      const ranges = getOctaveRanges();
      (state.ui.octaveMetricNodes || []).forEach((node, index) => renderOctaveRange(node, ranges[index]));
      const valid = ranges.filter(Boolean);
      renderOctaveRange(state.ui.octaveBatchMetric, valid.length ? {
        min: Math.min(...valid.map(item => item.min)),
        max: Math.max(...valid.map(item => item.max))
      } : null);
    }
  }

  function scheduleOptionMetricsUpdate() {
    state.metricsDirty = true;
    if (state.activeWorkspaceTab !== "channel") return;
    if (state.metricsIdleHandle) {
      if (typeof cancelIdleCallback === "function") cancelIdleCallback(state.metricsIdleHandle);
      else clearTimeout(state.metricsIdleHandle);
    }
    const run = () => {
      state.metricsIdleHandle = 0;
      if (!state.metricsDirty || state.activeWorkspaceTab !== "channel") return;
      state.metricsDirty = false;
      updateOptionMetrics();
    };
    state.metricsIdleHandle = typeof requestIdleCallback === "function"
      ? requestIdleCallback(run, { timeout: 180 })
      : window.setTimeout(run, 50);
  }

  function syncFeatureBatchState(feature) {
    const refs = state.ui.featureControls?.[feature];
    if (!refs) return;
    const getter = feature === "rest"
      ? channel => channel.restMode
      : feature === "volume"
        ? channel => channel.volumeDelta
        : channel => channel.octaveDelta;
    const values = ensureChannelDraft().channels.map(getter);
    const value = { value: values[0], mixed: values.some(item => String(item) !== String(values[0])) };
    refs.batch?.setValue(value.value, { mixed: value.mixed });
  }

  function wb9OptionListRow({ index = -1, control, metric = null, extraClass = "", metricPlacement = "after" }) {
    const row = el("div", `wb8-option-list-row wb9-option-list-row ${index < 0 ? "wb8-option-list-all wb9-option-list-all" : `wb8-option-list-channel wb8-option-list-channel-${index}`} ${extraClass}`.trim(), {
      style: index < 0 ? "--wb8-channel-color:var(--wb4-accent)" : `--wb8-channel-color:var(--part${index})`
    });
    const label = el("div", "wb8-option-list-label wb9-option-list-label");
    const labelText = el("strong", "wb9-option-channel-name", {
      text: index < 0 ? t("applyAll") : channelLabel(index),
      "data-wb8-channel-index": index
    });
    label.append(labelText);
    const body = el("div", "wb8-option-list-control wb9-option-list-control");
    if (metricPlacement === "top") {
      const metricRow = el("div", "wb13-option-metric-top");
      if (metric?.badge) metricRow.append(metric.badge);
      if (metric?.detail) metricRow.append(metric.detail);
      if (metricRow.childNodes.length) row.append(metricRow);
      if (control) body.append(control);
      row.append(label, body);
      return row;
    }
    if (metricPlacement === "above") {
      const metricRow = el("div", "wb13-option-metric-above");
      if (metric?.badge) metricRow.append(metric.badge);
      if (metric?.detail) metricRow.append(metric.detail);
      if (metricRow.childNodes.length) body.append(metricRow);
      if (control) body.append(control);
      row.append(label, body);
      return row;
    }
    if (metric?.badge) label.append(metric.badge);
    if (control) body.append(control);
    row.append(label, body);
    if (metric?.detail) row.append(metric.detail);
    return row;
  }

  function restDefinitions() {
    return [["keep", t("keep")], ["64", t("rest64")], ["32", t("rest32")], ["16", t("rest16")], ["8", t("rest8")], ["4", t("rest4")], ["all", t("all")]];
  }

  function buildRestFeaturePanel() {
    const panel = el("section", "wb8-feature-panel wb9-feature-panel wb8-rest-feature wb9-rest-feature", { role: "tabpanel", "data-option-feature-panel": "rest" });
    const channels = ensureChannelDraft().channels;
    state.ui.restMetricNodes = [];
    state.ui.featureControls.rest = { channels: [] };
    const common = commonValue(channel => channel.restMode);
    const batch = segmented(restDefinitions(), common.value, value => {
      channels.forEach(channel => { channel.restMode = value; });
      state.ui.featureControls.rest.channels.forEach(control => control.setValue(value));
      syncFeatureBatchState("rest");
      markChannelOptionsDirty();
      scheduleOptionMetricsUpdate();
    }, "wb9-rest-buttons wb9-rest-buttons-batch");
    batch.setValue(common.value, { mixed: common.mixed });
    state.ui.featureControls.rest.batch = batch;
    state.ui.restBatchMetric = el("span", "wb9-option-count", { text: t("restRemovedNone") });
    panel.append(wb9OptionListRow({ index: -1, control: batch, metric: { badge: state.ui.restBatchMetric } }));
    channels.forEach((channel, index) => {
      const control = segmented(restDefinitions(), channel.restMode, value => {
        channel.restMode = value;
        syncFeatureBatchState("rest");
        markChannelOptionsDirty();
        scheduleOptionMetricsUpdate();
      }, "wb9-rest-buttons");
      const badge = el("span", "wb9-option-count wb9-rest-count", { text: t("restRemovedNone") });
      state.ui.featureControls.rest.channels.push(control);
      state.ui.restMetricNodes.push(badge);
      panel.append(wb9OptionListRow({ index, control, metric: { badge } }));
    });
    return panel;
  }

  function buildVolumeFeaturePanel() {
    const panel = el("section", "wb8-feature-panel wb9-feature-panel wb8-volume-feature wb9-volume-feature", { role: "tabpanel", hidden: true, "data-option-feature-panel": "volume" });
    const channels = ensureChannelDraft().channels;
    state.ui.volumeMetricNodes = [];
    state.ui.volumeBatchMetric = null;
    state.ui.featureControls.volume = { channels: [] };

    const common = commonValue(channel => channel.volumeDelta);
    const batch = sliderNumber({ min: -15, max: 15, step: 1, value: common.value, onChange: value => {
      channels.forEach(channel => { channel.volumeDelta = value; });
      state.ui.featureControls.volume.channels.forEach(control => control.setValue(value));
      syncFeatureBatchState("volume");
      markChannelOptionsDirty();
      scheduleOptionMetricsUpdate();
    }});
    batch.setValue(common.value, { mixed: common.mixed });
    state.ui.featureControls.volume.batch = batch;
    panel.append(wb9OptionListRow({ index: -1, control: batch }));

    channels.forEach((channel, index) => {
      const control = sliderNumber({ min: -15, max: 15, step: 1, value: channel.volumeDelta, onChange: value => {
        channel.volumeDelta = value;
        syncFeatureBatchState("volume");
        markChannelOptionsDirty();
        scheduleOptionMetricsUpdate();
      }});
      const metric = {
        detail: el("div", "wb9-volume-distribution wb13-volume-channel-distribution")
      };
      state.ui.featureControls.volume.channels.push(control);
      state.ui.volumeMetricNodes.push(metric);
      panel.append(wb9OptionListRow({ index, control, metric, extraClass: "wb13-volume-metric-row", metricPlacement: "top" }));
    });
    return panel;
  }

  function buildOctaveFeaturePanel() {
    const panel = el("section", "wb8-feature-panel wb9-feature-panel wb8-octave-feature wb9-octave-feature", { role: "tabpanel", hidden: true, "data-option-feature-panel": "octave" });
    const channels = ensureChannelDraft().channels;
    state.ui.octaveMetricNodes = [];
    state.ui.featureControls.octave = { channels: [] };
    state.ui.octaveBatchMetric = el("span", "wb13-octave-range wb13-octave-range-all", { text: t("noNotes") });
    const common = commonValue(channel => channel.octaveDelta);
    const batch = sliderNumber({ min: -7, max: 7, step: 1, value: common.value, onChange: value => {
      channels.forEach(channel => { channel.octaveDelta = value; });
      state.ui.featureControls.octave.channels.forEach(control => control.setValue(value));
      syncFeatureBatchState("octave");
      markChannelOptionsDirty();
      scheduleOptionMetricsUpdate();
    }});
    batch.setValue(common.value, { mixed: common.mixed });
    state.ui.featureControls.octave.batch = batch;
    panel.append(wb9OptionListRow({ index: -1, control: batch, metric: { badge: state.ui.octaveBatchMetric } }));
    channels.forEach((channel, index) => {
      const control = sliderNumber({ min: -7, max: 7, step: 1, value: channel.octaveDelta, onChange: value => {
        channel.octaveDelta = value;
        syncFeatureBatchState("octave");
        markChannelOptionsDirty();
        scheduleOptionMetricsUpdate();
      }});
      const range = el("span", "wb13-octave-range", { text: t("noNotes"), title: t("octaveRange") });
      state.ui.featureControls.octave.channels.push(control);
      state.ui.octaveMetricNodes.push(range);
      panel.append(wb9OptionListRow({ index, control, metric: { badge: range } }));
    });
    return panel;
  }

  function wb9SetMixedToggle(toggle, values) {
    const input = toggle?._input;
    if (!input) return;
    input.checked = values.every(Boolean);
    input.indeterminate = values.some(Boolean) && !values.every(Boolean);
  }

  function setToggleDisabled(toggle, disabled) {
    if (!toggle?._input) return;
    toggle._input.disabled = Boolean(disabled);
    toggle.classList.toggle("is-disabled", Boolean(disabled));
  }

  function syncAccompanimentFeatureControls() {
    const refs = state.ui.featureControls?.accompaniment;
    if (!refs) return;
    const draft = ensureChannelDraft();
    const channels = draft.channels;
    const accompanimentOption = draft.accompaniment;
    const disabled = !accompanimentOption.genre;
    if (refs.genre) refs.genre.value = accompanimentOption.genre;
    if (refs.strength) {
      refs.strength.value = accompanimentOption.strength;
      refs.strength.disabled = disabled;
    }
    wb9SetMixedToggle(refs.batch?.analysis, channels.map(item => item.accompaniment.analysis));
    wb9SetMixedToggle(refs.batch?.generation, channels.map(item => item.accompaniment.generation));
    setToggleDisabled(refs.batch?.analysis, disabled);
    setToggleDisabled(refs.batch?.generation, disabled);
    refs.channels?.forEach((control, index) => {
      const accompaniment = channels[index]?.accompaniment;
      if (!accompaniment) return;
      control.analysis._input.checked = Boolean(accompaniment.analysis);
      control.analysis._input.indeterminate = false;
      control.generation._input.checked = Boolean(accompaniment.generation);
      control.generation._input.indeterminate = false;
      setToggleDisabled(control.analysis, disabled);
      setToggleDisabled(control.generation, disabled);
    });
    refs.panel?.classList.toggle("is-genre-unselected", disabled);
  }

  function wb9AccompanimentChannelControl(channel, { batch = false } = {}) {
    const wrap = el("div", "wb8-accompaniment-channel-control wb9-accompaniment-channel-control");
    const channels = ensureChannelDraft().channels;
    const analysis = toggleControl(t("useForAnalysis"), batch ? channels.every(item => item.accompaniment.analysis) : channel.accompaniment.analysis, value => {
      if (batch) channels.forEach(item => { item.accompaniment.analysis = value; });
      else channel.accompaniment.analysis = value;
      syncAccompanimentFeatureControls();
      markChannelOptionsDirty();
    });
    const generation = toggleControl(t("useForGeneration"), batch ? channels.every(item => item.accompaniment.generation) : channel.accompaniment.generation, value => {
      if (batch) channels.forEach(item => { item.accompaniment.generation = value; });
      else channel.accompaniment.generation = value;
      syncAccompanimentFeatureControls();
      markChannelOptionsDirty();
    });
    wrap._controls = { analysis, generation };
    wrap.append(analysis, generation);
    return wrap;
  }

  function buildAccompanimentFeaturePanel() {
    const panel = el("section", "wb8-feature-panel wb9-feature-panel wb8-accompaniment-feature wb9-accompaniment-feature", { role: "tabpanel", hidden: true, "data-option-feature-panel": "accompaniment" });
    const draft = ensureChannelDraft();
    const global = el("div", "wb8-accompaniment-global wb9-accompaniment-global");
    const genre = selectControl(genreValuesWithPlaceholder(), draft.accompaniment.genre, value => {
      draft.accompaniment.genre = value;
      syncAccompanimentFeatureControls();
      markChannelOptionsDirty();
    }, "wb9-genre-select");
    const strength = selectControl([["light", t("light")], ["normal", t("normal")], ["strong", t("strong")]], draft.accompaniment.strength, value => {
      draft.accompaniment.strength = value;
      markChannelOptionsDirty();
    }, "wb9-strength-select");
    global.append(genre, strength);
    panel.append(global);
    const batchWrap = wb9AccompanimentChannelControl(draft.channels[0], { batch: true });
    state.ui.featureControls.accompaniment = { panel, genre, strength, batch: batchWrap._controls, channels: [] };
    panel.append(wb9OptionListRow({ index: -1, control: batchWrap, extraClass: "wb8-option-list-wide wb9-option-list-wide" }));
    draft.channels.forEach((channel, index) => {
      const control = wb9AccompanimentChannelControl(channel);
      state.ui.featureControls.accompaniment.channels.push(control._controls);
      panel.append(wb9OptionListRow({ index, control, extraClass: "wb8-option-list-wide wb9-option-list-wide" }));
    });
    requestAnimationFrame(syncAccompanimentFeatureControls);
    return panel;
  }

  function activateOptionFeature(name) {
    const next = ["rest", "volume", "octave", "accompaniment"].includes(name) ? name : "rest";
    state.activeOptionFeature = next;
    state.ui.featureTabs?.forEach(button => {
      const active = button.dataset.optionFeature === next;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    });
    state.ui.featurePanels?.forEach(panel => { panel.hidden = panel.dataset.optionFeaturePanel !== next; });
    if (next === "rest" || next === "volume" || next === "octave") scheduleOptionMetricsUpdate();
  }

  function buildChannelOptionsWorkspacePanel() {
    const panel = el("section", "wb6-workspace-panel wb6-channel-options-panel wb8-channel-options-panel wb9-channel-options-panel", {
      role: "tabpanel",
      "data-workspace-panel": "channel",
      hidden: true
    });
    const definitions = [["rest", "rest"], ["volume", "volume"], ["octave", "octave"], ["accompaniment", "accompaniment"]];
    const tabs = el("div", "wb8-feature-tabs wb9-feature-tabs", { role: "tablist" });
    state.ui.featureTabs = [];
    definitions.forEach(([name, key], index) => {
      const button = el("button", "wb8-feature-tab wb9-feature-tab", {
        type: "button",
        role: "tab",
        text: t(key),
        "data-option-feature": name,
        "data-wb8-feature-key": key,
        "aria-selected": index === 0 ? "true" : "false",
        tabindex: index === 0 ? "0" : "-1"
      });
      button.addEventListener("click", () => activateOptionFeature(name));
      tabs.append(button);
      state.ui.featureTabs.push(button);
    });
    state.ui.featureControls = {};
    state.ui.channelPanels = [];
    state.ui.featurePanels = [
      buildRestFeaturePanel(),
      buildVolumeFeaturePanel(),
      buildOctaveFeaturePanel(),
      buildAccompanimentFeaturePanel()
    ];
    state.ui.channelApplyBar = el("div", "wb11-pending-apply wb11-channel-apply", {
      role: "status",
      "aria-live": "polite",
      hidden: true
    });
    const channelCancelButton = el("button", "wb11-cancel-button", {
      type: "button",
      text: t("cancel"),
      "data-wb4-text": "cancel"
    });
    const channelApplyButton = el("button", "wb11-apply-button", {
      type: "button",
      text: t("apply"),
      "data-wb4-text": "apply"
    });
    channelCancelButton.addEventListener("click", cancelChannelOptionsDraft);
    channelApplyButton.addEventListener("click", applyChannelOptionsDraft);
    const channelPendingActions = el("div", "wb11-pending-actions");
    channelPendingActions.append(channelCancelButton, channelApplyButton);
    state.ui.channelCancelButton = channelCancelButton;
    state.ui.channelApplyButton = channelApplyButton;
    state.ui.channelApplyBar.append(keyedText("channelPending", "wb11-pending-apply-text"), channelPendingActions);
    panel.append(tabs, state.ui.channelApplyBar, ...state.ui.featurePanels);
    requestAnimationFrame(() => activateOptionFeature(state.activeOptionFeature));
    return panel;
  }

  function syncPlaybackChannelPlacement() {
    const channels = state.ui.playbackChannels;
    const quickControls = state.ui.playbackQuickControls;
    const transportActions = state.ui.playbackTransportActions;
    const speedWrap = state.ui.playbackSpeedWrap;
    if (!channels || !quickControls || !transportActions) return;
    const narrow = window.matchMedia?.("(max-width: 620px)")?.matches ?? window.innerWidth <= 620;
    if (narrow) {
      if (channels.parentElement !== transportActions) transportActions.append(channels);
    } else if (channels.parentElement !== quickControls) {
      if (speedWrap?.parentElement === quickControls) quickControls.insertBefore(channels, speedWrap);
      else quickControls.prepend(channels);
    }
    channels.classList.toggle("is-mobile-transport", narrow);
  }

  function buildPreviewBlock(canvas) {
    const block = el("section", "wb4-block wb4-preview-block wb6-preview-block wb8-preview-block wb9-preview-block");
    state.ui.previewBlock = block;
    const transport = playLayout.querySelector(".transport-row");
    const seek = playLayout.querySelector(".seek-row");
    const piano = $("pianoRoll");
    const play = $("playToggleBtn");
    const rewind = $("rewindBtn");
    const playInfo = $("playInfo");
    const loopInput = $("loopPlayback");
    const loopLabel = loopInput?.closest("label");
    const quickControls = transport?.querySelector(".quick-controls");
    const transportActions = transport?.querySelector(".transport-actions");
    const soundButton = $("partSoundBtn");
    const speedWrap = $("speedControlButton")?.closest(".compact-control-wrap");
    const volumeWrap = $("volumeControlButton")?.closest(".compact-control-wrap");
    $("muteControlButton")?.closest(".compact-control-wrap")?.remove();

    if (play) {
      play.removeAttribute("data-i18n");
      play.textContent = "▶";
      play.classList.add("wb6-transport-symbol", "wb6-play-symbol");
      play.setAttribute("aria-label", wb6t("play"));
      play.title = wb6t("play");
    }
    if (rewind) {
      rewind.removeAttribute("data-i18n");
      rewind.removeAttribute("data-i18n-title");
      rewind.textContent = "⏮";
      rewind.classList.add("wb6-transport-symbol", "wb6-rewind-symbol");
      rewind.setAttribute("aria-label", wb6t("rewind"));
      rewind.title = wb6t("rewind");
    }
    if (playInfo) {
      playInfo.hidden = true;
      playInfo.classList.add("wb6-hidden-play-info");
    }
    if (quickControls && speedWrap) {
      const channels = el("div", "wb8-playback-channels wb9-playback-channels", { role: "group", "aria-label": t("playbackChannels") });
      const labels = [t("melShort"), "1", "2", "3", "4", "5"];
      for (let index = 0; index < 6; index += 1) {
        const button = el("button", `wb8-playback-channel wb8-playback-channel-${index} wb9-playback-channel active`, {
          type: "button",
          text: labels[index],
          "data-playback-channel-index": index,
          "aria-pressed": "true",
          title: channelLabel(index),
          style: `--wb8-channel-color:var(--part${index})`
        });
        channels.append(button);
      }
      state.ui.playbackChannels = channels;
      state.ui.playbackQuickControls = quickControls;
      state.ui.playbackTransportActions = transportActions;
      state.ui.playbackSpeedWrap = speedWrap;
      quickControls.insertBefore(channels, speedWrap);
    }
    if (quickControls && soundButton) {
      soundButton.classList.add("wb9-sound-button");
      if (volumeWrap?.parentElement === quickControls) volumeWrap.after(soundButton);
      else quickControls.append(soundButton);
    }
    if (loopLabel) {
      state.ui.originalCheckbox = el("input", "", { id: "originalPlayback", type: "checkbox", disabled: true });
      const originalLabel = el("label", "loop-label wb6-original-label wb8-original-label wb9-original-label");
      originalLabel.append(state.ui.originalCheckbox, wb6Text("original"));
      loopLabel.after(originalLabel);
      state.ui.originalCheckbox.addEventListener("change", syncOriginalPreviewSource);
    }

    playLayout.replaceChildren();
    if (piano) playLayout.append(piano);
    if (seek) playLayout.append(seek);
    if (transport) playLayout.append(transport);
    syncPlaybackChannelPlacement();
    prepareTimeline(seek);
    block.append(playLayout);
    state.ui.playbackExtraHost = el("div", "wb4-inline-host");
    block.append(state.ui.playbackExtraHost);
    canvas.append(block);
  }

  function updateTempoCleanButton() {
    const button = state.ui.tempoCleanButton;
    if (!button) return;
    button.textContent = state.options.tempo.simplify
      ? t("tempoCleanEnabledCount", [Math.max(0, Number(state.tempoCleanCount) || 0).toLocaleString(document.documentElement.lang || undefined)])
      : t("tempoCleanDisabled");
    button.classList.toggle("active", Boolean(state.options.tempo.simplify));
    button.setAttribute("aria-pressed", state.options.tempo.simplify ? "true" : "false");
  }

  function createTargetChannelButtons(values, onChange, className = "") {
    const wrap = el("div", `wb9-target-channels ${className}`.trim(), { role: "group", "aria-label": t("channelApply") });
    const buttons = [];
    const labels = [t("melShort"), "1", "2", "3", "4", "5"];
    const sync = () => buttons.forEach((button, index) => {
      const active = Boolean(values[index]);
      button.classList.toggle("active", active);
      button.classList.toggle("is-inactive", !active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    for (let index = 0; index < 6; index += 1) {
      const button = el("button", `wb9-target-channel wb9-target-channel-${index}`, {
        type: "button",
        text: labels[index],
        "aria-pressed": values[index] ? "true" : "false",
        title: channelLabel(index),
        style: `--wb9-channel-color:var(--part${index})`
      });
      button.addEventListener("click", () => {
        if (button.disabled) return;
        values[index] = !values[index];
        sync();
        onChange(values.slice());
      });
      wrap.append(button);
      buttons.push(button);
    }
    wrap._buttons = buttons;
    wrap.sync = sync;
    wrap.setDisabled = disabled => {
      buttons.forEach(button => { button.disabled = Boolean(disabled); });
      wrap.classList.toggle("is-disabled", Boolean(disabled));
    };
    sync();
    return wrap;
  }

  function syncVolumeGenerationControls() {
    const refs = state.ui.volumeGeneration;
    if (!refs) return;
    const disabled = !state.options.dynamics.genre;
    refs.genre.value = state.options.dynamics.genre;
    refs.strength.value = state.options.dynamics.strength;
    refs.strength.disabled = disabled;
    refs.channels.sync();
    refs.channels.setDisabled(disabled);
    refs.wrap.classList.toggle("is-genre-unselected", disabled);
  }

  function buildCommonOptions() {
    const common = el("div", "wb4-common-options wb6-common-options wb7-common-options wb8-common-options wb9-common-options");
    state.ui.quantizeControl = segmented([
      ["64", t("quantize64")], ["32", t("quantize32")]
    ], String(state.midiQuantizeDivision), division => {
      const normalized = Number(division) === 32 ? 32 : 64;
      state.midiQuantizeDivision = normalized;
      try { window.dispatchEvent(new CustomEvent("mobibard:set-midi-quantize", { detail: { division: normalized } })); } catch (_) {}
      scheduleMidiAutoApply();
    }, "wb7-quantize-segments");
    common.append(optionRow("quantize", state.ui.quantizeControl, "", "wb7-common-quantize wb8-common-quantize wb9-common-quantize"));

    state.ui.tempoCleanButton = el("button", "wb9-tempo-clean-button", {
      type: "button",
      "aria-pressed": state.options.tempo.simplify ? "true" : "false"
    });
    state.ui.tempoCleanButton.addEventListener("click", () => {
      state.options.tempo.simplify = !state.options.tempo.simplify;
      updateTempoCleanButton();
      queueApply();
    });
    updateTempoCleanButton();
    common.append(optionRow("tempoClean", state.ui.tempoCleanButton, "", "wb8-common-tempo-clean wb9-common-tempo-clean"));

    const tempoScale = wb9NumberControl({ min: 50, max: 200, step: 1, value: state.options.tempo.scale, suffix: "%", label: t("tempoScale"), onChange: value => {
      state.options.tempo.scale = value;
      queueApply();
    }});
    state.ui.tempoScaleControl = tempoScale;
    common.append(optionRow("tempoScale", tempoScale, "", "wb6-common-tempo wb8-common-tempo-scale wb9-common-tempo-scale"));

    const leadingStepper = wb9NumberControl({ min: 0, max: 300, step: 0.25, value: state.options.leading.beats * 0.5, suffix: t("seconds"), label: t("leading"), onChange: value => {
      state.options.leading.beats = Math.round(value * 4) / 2;
      queueApply();
    }});
    state.ui.leadingControl = leadingStepper;
    common.append(optionRow("leading", leadingStepper, "", "wb6-common-leading wb8-common-leading wb9-common-leading"));

    const dynamicsWrap = el("div", "wb9-volume-generation-controls");
    const genre = selectControl(genreValuesWithPlaceholder(), state.options.dynamics.genre, value => {
      state.options.dynamics.genre = value;
      syncVolumeGenerationControls();
      queueApply();
    }, "wb9-genre-select");
    const strength = selectControl([["light", t("light")], ["normal", t("normal")], ["strong", t("strong")]], state.options.dynamics.strength, value => {
      state.options.dynamics.strength = value;
      if (state.options.dynamics.genre) queueApply();
    }, "wb9-strength-select");
    const channels = createTargetChannelButtons(state.options.dynamics.targetChannels, () => {
      if (state.options.dynamics.genre) queueApply();
    }, "wb9-volume-generation-channels");
    dynamicsWrap.append(genre, strength, channels);
    state.ui.volumeGeneration = { wrap: dynamicsWrap, genre, strength, channels };
    common.append(optionRow("dynamics", dynamicsWrap, "", "wb9-common-dynamics"));
    syncVolumeGenerationControls();
    syncMidiQuantizeControl();
    return common;
  }

  function renderCopyRows() {
    const host = state.ui.copyRows;
    if (!host) return;
    const mainMml = $("mainMml")?.value || "";
    const fullParts = normalizeMainToParts(mainMml);
    host.replaceChildren();

    const fullRow = el("div", "copy-item wb4-copy-item wb8-full-copy-item");
    const meta = el("div", "copy-meta");
    meta.append(el("strong", "copy-title", { text: t("copyAll") }), el("span", "copy-detail", { text: partDetail(fullParts) }));
    const actions = el("div", "wb8-full-copy-actions");
    const save = retained.save;
    const drive = retained.driveSave;
    const copyButton = retained.copy;
    if (save) {
      save.removeAttribute("data-i18n");
      save.textContent = t("saveFile");
      save.className = "copy-button wb4-copy-button wb9-save-copy-button";
      actions.append(save);
    }
    if (drive) {
      drive.removeAttribute("data-i18n");
      drive.removeAttribute("data-i18n-title");
      drive.textContent = t("saveDrive");
      drive.className = "copy-button wb4-copy-button wb9-save-copy-button";
      actions.append(drive);
    }
    if (copyButton) {
      copyButton.removeAttribute("data-i18n");
      copyButton.textContent = t("copy");
      copyButton.className = "copy-button wb4-copy-button";
      actions.append(copyButton);
    }
    fullRow.append(meta, actions);
    host.append(fullRow);

    const splitResults = el("div", "split-results wb4-split-results");
    const head = el("div", "results-head wb4-results-head");
    const titleWrap = el("div", "wb4-split-title-wrap");
    titleWrap.append(el("h2", "", { text: t("splitCopy") }));
    const controls = el("div", "wb4-split-controls");
    const limitLabel = el("label", "wb4-split-control");
    limitLabel.append(keyedText("splitLimit"));
    const limitInput = el("input", "wb4-split-limit", { type: "number", min: 200, max: 5000, step: 50, value: state.options.split.maxChars });
    limitInput.addEventListener("change", () => {
      state.options.split.maxChars = Math.max(200, Math.min(5000, Math.round(Number(limitInput.value) || 2400)));
      markWorkbenchEdited();
      scheduleCopyRowsRender();
    });
    limitLabel.append(limitInput);
    const searchLabel = el("label", "wb4-split-control");
    searchLabel.append(keyedText("splitSearch"));
    const searchSelect = selectControl([["50", "50%"], ["60", "60%"], ["70", "70%"], ["80", "80%"], ["90", "90%"]], String(state.options.split.searchPercent), value => {
      state.options.split.searchPercent = Number(value);
      markWorkbenchEdited();
      scheduleCopyRowsRender();
    }, "wb4-split-search");
    searchSelect.id = "splitSearchPercent";
    searchLabel.append(searchSelect);
    controls.append(limitLabel, searchLabel);
    const pages = splitPagesForCopy(mainMml);
    const summary = el("span", "results-summary", { text: pages.length > 1 ? t("splitPages", [pages.length]) : t("splitNoNeed") });
    titleWrap.append(summary);
    head.append(titleWrap, controls);
    splitResults.append(head);
    if (pages.length > 1) {
      const copyButtons = el("div", "copy-buttons wb4-copy-buttons");
      pages.forEach((page, pageIndex) => {
        const parts = Array.isArray(page.parts) && page.parts.length ? page.parts.slice(0, 6) : normalizeMainToParts(page.mml);
        while (parts.length < 6) parts.push("");
        const button = el("button", "copy-button wb4-copy-button", { type: "button", text: t("copy") });
        button.addEventListener("click", async () => {
          if (await confirmPendingExport("copy")) void copyText(page.mml);
        });
        copyButtons.append(renderCopyItem(t("splitPage", [page.index || pageIndex + 1]), partDetail(parts), button));
      });
      splitResults.append(copyButtons);
    }
    host.append(splitResults);
  }

  function scheduleMidiAutoApply() {
    clearTimeout(state.midiAutoTimer);
    state.midiAutoTimer = window.setTimeout(() => {
      state.midiAutoTimer = 0;
      refreshInstrumentDirtyState();
    }, 0);
  }

  function activateWorkspaceTab(name) {
    const next = ["copy", "instrument", "channel", "code"].includes(name) ? name : "copy";
    state.activeWorkspaceTab = next;
    state.ui.workspaceTabs?.forEach(button => {
      const active = button.dataset.workspaceTab === next;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    });
    Object.entries(state.ui.workspacePanels || {}).forEach(([key, panel]) => { panel.hidden = key !== next; });
    if (next === "code") syncChannelCodeEditor();
    if (next === "instrument") updateMidiChannelFilter();
    if (next === "channel") {
      activateOptionFeature(state.activeOptionFeature);
      scheduleOptionMetricsUpdate();
    }
    if (next === "copy") {
      state.copyDirty = true;
      scheduleCopyRowsRender();
    }
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    scheduleSessionPersist();
  }

  function activateChannelView(index) {
    const numeric = Number(index);
    const next = numeric < 0 ? -1 : Math.max(0, Math.min(5, Number.isFinite(numeric) ? numeric : 0));
    state.activeChannelView = next;
    if (next >= 0) state.activeChannel = next;
    [state.ui.workspaceBlock, state.ui.overviewBlock, state.ui.workspacePanels?.code]
      .filter(Boolean)
      .forEach(node => node.setAttribute("data-active-channel", String(next)));
    state.ui.channelTabGroups?.forEach(group => group.forEach(button => {
      const value = Number(button.dataset.channelIndex);
      const active = value === next;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    }));
    if (state.activeWorkspaceTab === "code") syncChannelCodeEditor();
    scheduleChannelCountsUpdate();
    window.dispatchEvent(new Event("resize"));
    scheduleSessionPersist();
  }

  function receiveSourceBaseline(detail = {}) {
    const nextSource = String(detail.mml || "");
    const startsNewSource = detail.newSource === true;
    const preserveEditedSession = !startsNewSource && Boolean(state.instrumentDirty && state.sessionHasUserEdit);
    if (!preserveEditedSession) {
      state.sessionHasUserEdit = false;
      clearTimeout(state.sessionSaveTimer);
      state.sessionSaveTimer = 0;
    }
    if (startsNewSource) resetSubmenuStateForNewSource();
    state.sourceMml = nextSource;
    state.sourceMeta = {
      name: detail.name || "",
      sourceType: detail.sourceType || "",
      sourceLabel: detail.sourceLabel || ""
    };
    if (detail.name) setSourceName(detail.name);
    state.manualEdited = false;
    state.sourceVersion += 1;
    state.lastApplySignature = "";
    state.tempoCleanCount = 0;
    syncChannelDraftFromApplied();
    state.metricsCache = { sourceVersion: -1, restInput: "", rest: new Map(), volumeSource: "", volume: [], tempoInput: "", tempoResult: null };
    resetPipelineCache();
    clearPendingPlaybackPreview();
    applyFromSource({ force: true });
    if (startsNewSource) {
      activateChannelView(0);
      activateOptionFeature("rest");
      activateWorkspaceTab("copy");
    }
    scheduleChannelCountsUpdate();
    scheduleOptionMetricsUpdate();
    if (preserveEditedSession) scheduleSessionPersist();
  }

  function writeResultMml(mml) {
    const mainMml = $("mainMml");
    if (!mainMml) return false;
    const next = String(mml || "");
    const changed = mainMml.value !== next;
    state.lastResultMml = next;
    state.manualEdited = false;
    if (state.ui.manualBadge) state.ui.manualBadge.hidden = true;
    if (changed) {
      state.applying = true;
      mainMml.dataset.workbenchApply = "1";
      mainMml.value = next;
      mainMml.dispatchEvent(new Event("input", { bubbles: true }));
      delete mainMml.dataset.workbenchApply;
      state.applying = false;
    }
    if (changed) {
      scheduleCopyRowsRender();
      scheduleChannelCountsUpdate();
    }
    scheduleOptionMetricsUpdate();
    return changed;
  }


  function installMidiStatusToastBridge() {
    const status = $("midiConvertStatus");
    if (!status || status.dataset.wbToastBridge === "1") return;
    status.dataset.wbToastBridge = "1";
    let scheduled = false;
    let lastMessage = "";
    const flush = () => {
      scheduled = false;
      const message = status.hidden ? "" : String(status.textContent || "").trim();
      if (!message || message === lastMessage) return;
      lastMessage = message;
      showToast(message, "info");
      window.setTimeout(() => { if (lastMessage === message) lastMessage = ""; }, 900);
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(flush);
    };
    new MutationObserver(schedule).observe(status, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden"]
    });
  }

  buildShell();
  convertDialogs();
  installGlobalHandling();
  installMidiStatusToastBridge();
  updateLocalText();
  window.setTimeout(() => syncChannelCodeEditor(), 0);

  Promise.resolve(window.MobibardI18n?.ready).then(async () => {
    updateLocalText();
    await loadSessionRestorePrompt();
    if (!state.sourceMml && !state.sessionLoadedSnapshot) {
      const initial = $("mainMml")?.value || "";
      if (initial.trim()) receiveSourceBaseline({ mml: initial, name: "Sample MML", sourceType: "mml", sourceLabel: "MML" });
    }
  });

  window.MobibardPlayerLayout = Object.freeze({
    get sourceMml() { return state.sourceMml; },
    get options() { return JSON.parse(JSON.stringify(state.options)); },
    get activeChannel() { return state.activeChannel; },
    applyFromSource,
    activateChannel,
    showToast
  });
  window.MobibardToast = Object.freeze({ show: showToast });
})();
