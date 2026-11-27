(() => {
  "use strict";

  // 공간 사운드 룸 화면 (에디터·플레이어 공유). 캔버스에 직접 그린 의사 3D 뷰.
  //   - 캐릭터: W/A/S/D·방향키, 바닥 클릭 이동, 모바일 가상 조이스틱(왼쪽 반 화면 어디를 잡든 그 지점이 중심)
  //   - 스피커: 드래그로 이동(0.5m 칸 스냅), 마우스를 올리면 테두리, 클릭하면 채널 설정 메뉴
  //   - 카메라: 빈 곳 드래그로 회전, 휠/핀치 대신 휠·버튼으로 확대/축소 (캐릭터를 따라다니며 청자는 카메라가 아니라 캐릭터)
  const SA = window.MobibardSpatialAudio;
  if (!SA) { console.warn("MobibardSpatialRoom: spatial-audio.js 가 먼저 로드되어야 합니다."); return; }

  const TEXT = {
    ko: {
      autoArrange: "자동 배치", layoutSquare: "사각 배치", layoutCircle: "원형 배치", layoutFront: "전면 배치",
      resetConfirm: "공간 사운드 배치(캐릭터·스피커 위치)를 처음 상태로 되돌릴까요?", cancel: "취소", moveHere: "여기로 이동", addHere: "여기에 스피커 추가", mini: "작은 화면", expand: "크게 보기", hintMini: "작은 화면: 안을 클릭한 뒤 W/A/S/D로 이동 · 위쪽 막대를 끌어 옮기기 · 오른쪽 아래 모서리로 크기 조절",
      speakers: "🔊 ({n}/{max})", on: "활성", off: "비활성", selectAll: "전체 선택", selectNone: "전체 해제", noGroup: "그룹 없음",
      toStart: "처음으로", play: "재생", stop: "정지", toEnd: "끝으로", loop: "반복 재생", volume: "볼륨", speed: "배속",
      title: "공간 사운드", enable: "공간 사운드로 듣기", envNone: "벽 없음", envDome: "원형 돔", envRoom: "사각 방",
      size: "크기", add: "스피커 추가", full: "스피커는 최대 {n}개", reset: "리셋", resetAsk: "한 번 더 누르면 초기화",
      close: "닫기", speaker: "스피커 {n}", all: "모든 채널", none: "연결된 채널 없음 (소리가 나지 않음)", remove: "삭제",
      noChannels: "채널이 없습니다", zoomIn: "확대", zoomOut: "축소",
      hint: "W/A/S/D·방향키 이동 · 바닥 클릭 이동 · 빈 곳 드래그 회전 · 스피커 드래그 이동 · 스피커 클릭 채널 설정 · 바닥 우클릭 메뉴",
      hintTouch: "왼쪽 화면을 누르고 밀면 이동 · 오른쪽 화면 드래그 회전 · 스피커 드래그 이동 · 스피커 탭 채널 설정 · 길게 누르면 메뉴",
      meter: "m", open: "공간 사운드 설정",
    },
    en: {
      autoArrange: "Auto layout", layoutSquare: "Square", layoutCircle: "Circle", layoutFront: "Front",
      resetConfirm: "Reset the spatial sound layout (character and speaker positions)?", cancel: "Cancel", moveHere: "Move here", addHere: "Add speaker here", mini: "Mini view", expand: "Full view", hintMini: "Mini view: click inside, then W/A/S/D to move · drag the top bar to move · resize from the corner",
      speakers: "🔊 ({n}/{max})", on: "On", off: "Off", selectAll: "Select all", selectNone: "Clear all", noGroup: "No group",
      toStart: "To start", play: "Play", stop: "Stop", toEnd: "To end", loop: "Loop", volume: "Volume", speed: "Speed",
      title: "Spatial sound", enable: "Listen in spatial sound", envNone: "No walls", envDome: "Round dome", envRoom: "Square room",
      size: "Size", add: "Add speaker", full: "Up to {n} speakers", reset: "Reset", resetAsk: "Press again to reset",
      close: "Close", speaker: "Speaker {n}", all: "All channels", none: "No channel linked (silent)", remove: "Delete",
      noChannels: "No channels", zoomIn: "Zoom in", zoomOut: "Zoom out",
      hint: "W/A/S/D or arrows to move · click floor to walk · drag empty space to rotate · drag speakers · click a speaker for channels · right-click floor for menu",
      hintTouch: "Hold left side and slide to move · drag right side to rotate · drag speakers · tap a speaker for channels · long-press for menu",
      meter: "m", open: "Spatial sound settings",
    },
    ja: {
      autoArrange: "自動配置", layoutSquare: "四角配置", layoutCircle: "円形配置", layoutFront: "前面配置",
      resetConfirm: "空間サウンドの配置（キャラクター・スピーカー位置）を初期状態に戻しますか？", cancel: "キャンセル", moveHere: "ここへ移動", addHere: "ここにスピーカー追加", mini: "小さい画面", expand: "大きく表示", hintMini: "小さい画面：中をクリックして W/A/S/D で移動 · 上のバーをドラッグで移動 · 右下の角でサイズ変更",
      speakers: "🔊 ({n}/{max})", on: "オン", off: "オフ", selectAll: "すべて選択", selectNone: "すべて解除", noGroup: "グループなし",
      toStart: "最初へ", play: "再生", stop: "停止", toEnd: "最後へ", loop: "リピート再生", volume: "音量", speed: "再生速度",
      title: "空間サウンド", enable: "空間サウンドで聴く", envNone: "壁なし", envDome: "円形ドーム", envRoom: "四角い部屋",
      size: "サイズ", add: "スピーカー追加", full: "スピーカーは最大{n}個", reset: "リセット", resetAsk: "もう一度押すと初期化",
      close: "閉じる", speaker: "スピーカー {n}", all: "すべてのチャンネル", none: "チャンネル未接続（音が出ません）", remove: "削除",
      noChannels: "チャンネルがありません", zoomIn: "拡大", zoomOut: "縮小",
      hint: "W/A/S/D・矢印キーで移動 · 床クリックで移動 · 空き地ドラッグで回転 · スピーカーをドラッグ · クリックでチャンネル設定 · 床を右クリックでメニュー",
      hintTouch: "画面左を押してスライドで移動 · 画面右ドラッグで回転 · スピーカーをドラッグ · タップでチャンネル設定 · 長押しでメニュー",
      meter: "m", open: "空間サウンド設定",
    },
    "zh-CN": {
      autoArrange: "自动布置", layoutSquare: "方形布置", layoutCircle: "圆形布置", layoutFront: "前方布置",
      resetConfirm: "要将空间音效布局（角色和音箱位置）恢复为初始状态吗？", cancel: "取消", moveHere: "移动到这里", addHere: "在这里添加音箱", mini: "小窗口", expand: "放大显示", hintMini: "小窗口：点击内部后用 W/A/S/D 移动 · 拖动顶部栏移动窗口 · 拖动右下角调整大小",
      speakers: "🔊 ({n}/{max})", on: "启用", off: "停用", selectAll: "全选", selectNone: "全部取消", noGroup: "无分组",
      toStart: "回到开头", play: "播放", stop: "停止", toEnd: "跳到结尾", loop: "循环播放", volume: "音量", speed: "倍速",
      title: "空间音效", enable: "使用空间音效收听", envNone: "无墙壁", envDome: "圆形穹顶", envRoom: "方形房间",
      size: "大小", add: "添加音箱", full: "音箱最多 {n} 个", reset: "重置", resetAsk: "再点一次即重置",
      close: "关闭", speaker: "音箱 {n}", all: "所有声道", none: "未连接声道（不会发声）", remove: "删除",
      noChannels: "没有声道", zoomIn: "放大", zoomOut: "缩小",
      hint: "W/A/S/D 或方向键移动 · 点击地面行走 · 拖动空白处旋转 · 拖动音箱 · 点击音箱设置声道 · 右键地面打开菜单",
      hintTouch: "按住左半屏滑动移动 · 拖动右半屏旋转 · 拖动音箱 · 轻点音箱设置声道 · 长按打开菜单",
      meter: "m", open: "空间音效设置",
    },
    "zh-TW": {
      autoArrange: "自動配置", layoutSquare: "方形配置", layoutCircle: "圓形配置", layoutFront: "前方配置",
      resetConfirm: "要將空間音效配置（角色和音箱位置）恢復為初始狀態嗎？", cancel: "取消", moveHere: "移動到這裡", addHere: "在這裡新增音箱", mini: "小視窗", expand: "放大顯示", hintMini: "小視窗：點擊內部後用 W/A/S/D 移動 · 拖曳頂部列移動視窗 · 拖曳右下角調整大小",
      speakers: "🔊 ({n}/{max})", on: "啟用", off: "停用", selectAll: "全選", selectNone: "全部取消", noGroup: "無分組",
      toStart: "回到開頭", play: "播放", stop: "停止", toEnd: "跳到結尾", loop: "循環播放", volume: "音量", speed: "倍速",
      title: "空間音效", enable: "使用空間音效收聽", envNone: "無牆壁", envDome: "圓形穹頂", envRoom: "方形房間",
      size: "大小", add: "新增音箱", full: "音箱最多 {n} 個", reset: "重置", resetAsk: "再按一次即重置",
      close: "關閉", speaker: "音箱 {n}", all: "所有聲道", none: "未連接聲道（不會發聲）", remove: "刪除",
      noChannels: "沒有聲道", zoomIn: "放大", zoomOut: "縮小",
      hint: "W/A/S/D 或方向鍵移動 · 點擊地面行走 · 拖曳空白處旋轉 · 拖曳音箱 · 點擊音箱設定聲道 · 右鍵地面開啟選單",
      hintTouch: "按住左半螢幕滑動移動 · 拖曳右半螢幕旋轉 · 拖曳音箱 · 輕點音箱設定聲道 · 長按開啟選單",
      meter: "m", open: "空間音效設定",
    },
  };

  const STYLE_ID = "mobibard-spatial-room-style";
  // 에디터·플레이어 재생 버튼과 같은 아이콘(assets/icons/*.svg)을 쓴다. 경로는 이 스크립트 위치 기준.
  const ICON_BASE = (() => {
    try { return new URL("../../assets/icons/", document.currentScript?.src || location.href).href; }
    catch (_) { return "../assets/icons/"; }
  })();
  const CSS = `
.sr-root{--sr-bg:#10141d;--sr-panel:#171c28;--sr-line:#2a3144;--sr-border:#39435c;--sr-btn:#232a3b;--sr-btn-hover:#2c3550;--sr-text:#e8ecf5;--sr-text2:#c9d2e8;--sr-muted:#9aa6c4;--sr-danger:#ffb4bd;--sr-danger-border:#7a3340;--sr-warn:#ffb86b;--sr-shadow-text:0 1px 2px #000;--sr-icon-filter:invert(1)}
:root[data-theme="light"] .sr-root{--sr-bg:#eef2f8;--sr-panel:#ffffff;--sr-line:#dde3ee;--sr-border:#c5cedf;--sr-btn:#f3f6fb;--sr-btn-hover:#e3e9f4;--sr-text:#1d2433;--sr-text2:#3a4560;--sr-muted:#66728f;--sr-danger:#c0392b;--sr-danger-border:#e3a9a2;--sr-warn:#b86a00;--sr-shadow-text:0 1px 2px #fff;--sr-icon-filter:none}
.sr-root{position:fixed;inset:0;z-index:2600;display:flex;flex-direction:column;background:var(--sr-bg);color:var(--sr-text);font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;touch-action:none;user-select:none;-webkit-user-select:none}
.sr-root[hidden]{display:none}
.sr-root button{color:var(--sr-text)!important;font-family:inherit;text-shadow:none;letter-spacing:normal;text-transform:none}
.sr-root .sr-seg button[aria-pressed=true],.sr-root .sr-tbtn.sr-main{color:#fff!important}
.sr-root .sr-btn.danger{color:var(--sr-danger)!important}
.sr-root input[type=range]{accent-color:#3b6cff}
.sr-bar{display:flex;flex-wrap:nowrap;gap:7px;align-items:center;padding:4px 6px;background:var(--sr-panel);border-bottom:1px solid var(--sr-line)}
.sr-title{font-weight:700;font-size:15px}
.sr-switch b{font-weight:600;font-size:13px;min-width:3em;color:var(--sr-muted)}
.sr-switch input:checked+b{color:#2fbf71}
.sr-seg{display:inline-flex;border:1px solid var(--sr-border);border-radius:8px;overflow:hidden}
.sr-seg button{background:transparent;color:inherit;border:0;padding:4px 7px;font:inherit;cursor:pointer}
.sr-seg button[aria-pressed=true]{background:#3b6cff;color:#fff}
.sr-size{display:inline-flex;align-items:center;gap:4px}
.sr-size input{width:90px}
.sr-btn{background:var(--sr-btn);color:inherit;border:1px solid var(--sr-border);border-radius:8px;padding:4px 7px;font:inherit;cursor:pointer}
.sr-btn:hover:not(:disabled){background:var(--sr-btn-hover)}
.sr-btn:disabled{opacity:.45;cursor:default}
.sr-root [data-r=close]{min-width:30px;font-size:15px;line-height:1;padding:4px 7px}
.sr-btn.danger{border-color:var(--sr-danger-border);color:var(--sr-danger)}
.sr-switch{display:inline-flex;align-items:center;gap:4px;cursor:pointer}
.sr-switch input{width:38px;height:22px;appearance:none;-webkit-appearance:none;background:var(--sr-border);border-radius:11px;position:relative;cursor:pointer;transition:background .15s;margin:0}
.sr-switch input::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .15s}
.sr-switch input:checked{background:#2fbf71}
.sr-switch input:checked::after{transform:translateX(16px)}
.sr-bar-main{flex:1 1 auto;min-width:0;display:flex;flex-wrap:nowrap;gap:7px;align-items:center;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;white-space:nowrap}
.sr-bar-main::-webkit-scrollbar{display:none}
.sr-bar-main>*{flex:none}
.sr-bar-side{flex:none;display:flex;gap:4px;align-items:center;margin-left:auto}
.sr-stage{position:relative;flex:1;min-height:0}
.sr-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.sr-hint{position:absolute;left:5px;bottom:3px;right:46px;font-size:12px;color:#9aa6c4;pointer-events:none;text-shadow:0 1px 2px #000}
.sr-zoom{position:absolute;right:5px;bottom:24px;display:flex;flex-direction:column;gap:3px}
.sr-zoom button{width:36px;height:36px;border-radius:50%;border:1px solid var(--sr-border);background:var(--sr-btn);color:var(--sr-text);font-size:18px;cursor:pointer}
.sr-menu{position:absolute;top:5px;right:5px;width:280px;max-height:calc(100% - 20px);display:flex;flex-direction:column;overflow:hidden;background:var(--sr-panel);border:1px solid var(--sr-border);border-radius:12px;box-shadow:0 8px 28px #0008}
.sr-mbody{flex:1 1 auto;min-height:0;overflow:auto;padding:2px 6px 4px}
.sr-mfoot{flex:none;display:flex;gap:3px;align-items:center;padding:4px 6px;border-top:1px solid var(--sr-line)}
.sr-mfoot .sr-btn{padding:5px 9px;font-size:13px}
.sr-mfoot .sr-grow{flex:1}
.sr-menu label.sr-grp{display:flex;align-items:center;gap:6px;padding:4px 2px 2px;cursor:pointer;font-weight:700;color:var(--sr-text2);border-top:1px solid var(--sr-line);margin-top:4px}
.sr-menu label.sr-grp input{width:16px;height:16px;margin:0}
.sr-menu label.sr-grp small{font-weight:400;color:var(--sr-muted)}
.sr-menu .sr-indent{padding-left:18px!important}
.sr-menu[hidden]{display:none}
.sr-menu h3{flex:none;margin:0;padding:5px 6px 4px;font-size:14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--sr-line)}
.sr-menu label.sr-ch{display:flex;align-items:center;gap:6px;padding:3px 2px;cursor:pointer}
.sr-menu label.sr-ch input{width:16px;height:16px;margin:0}
.sr-dot{width:10px;height:10px;border-radius:50%;flex:none}
.sr-menu .sr-note{color:var(--sr-warn);font-size:12px;margin:6px 0}
.sr-menu .sr-sep{border:0;border-top:1px solid var(--sr-line);margin:8px 0}
.sr-transport{display:flex;flex-wrap:wrap;align-items:center;gap:3px 5px;padding:4px 6px;background:var(--sr-panel);border-top:1px solid var(--sr-line)}
.sr-transport[hidden]{display:none}
.sr-tbtn{min-width:36px;height:34px;border-radius:8px;border:1px solid var(--sr-border);background:var(--sr-btn);color:var(--sr-text);font:15px/1 system-ui,sans-serif;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0 8px}
.sr-tbtn:hover{background:var(--sr-btn-hover)}
.sr-tbtn[aria-pressed=true]{background:#3b6cff;border-color:#3b6cff}
.sr-tbtn.sr-main{min-width:46px;background:#3b6cff;border-color:#3b6cff}
.sr-time{font-variant-numeric:tabular-nums;font-size:12.5px;color:var(--sr-text2);min-width:96px;text-align:center}
.sr-seek{flex:1 1 180px;min-width:120px}
.sr-mini{display:inline-flex;align-items:center;gap:3px;font-size:12px;color:var(--sr-text2)}
.sr-mini input{width:90px}
.sr-mini b{min-width:40px;font-variant-numeric:tabular-nums;text-align:right}
/* 작은 화면(떠 있는 창) */
.sr-root.sr-mini-mode{inset:auto;width:400px;height:320px;min-width:260px;min-height:220px;max-width:calc(100vw - 8px);max-height:calc(100vh - 8px);border:1px solid var(--sr-border);border-radius:12px;overflow:hidden;resize:both;box-shadow:0 14px 40px #000a;z-index:2500}
.sr-mini-mode .sr-bar{cursor:move;padding:3px 4px;gap:3px}
.sr-mini-mode .sr-bar-main{flex-wrap:nowrap;overflow:hidden;gap:3px}
.sr-mini-mode .sr-bar .sr-full-only,.sr-mini-mode .sr-transport,.sr-mini-mode .sr-hint{display:none!important}
.sr-mini-mode .sr-title{font-size:13px}
.sr-mini-mode .sr-btn{padding:4px 8px;font-size:12px}
.sr-mini-mode .sr-zoom{bottom:8px;top:auto}
.sr-mini-mode .sr-zoom button{width:30px;height:30px;font-size:15px}
.sr-mini-mode .sr-menu{top:6px;right:6px;bottom:6px;left:auto;width:min(240px,calc(100% - 12px));max-height:none;border-radius:10px}
.sr-full-mode .sr-mini-only{display:none!important}
.sr-mini-mode.sr-focus{border-color:#3b6cff}
/* 우클릭 메뉴·확인 대화상자 */
.sr-ctx{position:absolute;z-index:5;min-width:160px;background:var(--sr-panel);border:1px solid var(--sr-border);border-radius:10px;padding:3px;box-shadow:0 8px 24px #0009;display:flex;flex-direction:column}
.sr-ctx[hidden]{display:none}
.sr-ctx button{background:transparent;border:0;text-align:left;padding:5px 8px;border-radius:7px;font:inherit;cursor:pointer}
.sr-ctx button:hover:not(:disabled){background:var(--sr-btn-hover)}
.sr-ctx button:disabled{opacity:.45;cursor:default}
.sr-root .sr-ctx button.sr-ctx-danger{color:var(--sr-danger)!important}
.sr-ctx button[hidden],.sr-ctx .sr-ctx-label[hidden],.sr-ctx hr[hidden]{display:none}
.sr-ctx .sr-ctx-label{font-size:11.5px;color:var(--sr-muted);padding:4px 8px 1px}
.sr-ctx hr{border:0;border-top:1px solid var(--sr-line);margin:3px 2px}
.sr-ctx button.sr-sub{padding-left:16px}
.sr-dd{position:fixed;z-index:2700;min-width:120px;background:var(--sr-panel);border:1px solid var(--sr-border);border-radius:9px;padding:3px;box-shadow:0 8px 24px #0006;display:flex;flex-direction:column}
.sr-dd[hidden]{display:none}
.sr-dd button{background:transparent;border:0;text-align:left;padding:5px 8px;border-radius:6px;font:inherit;cursor:pointer}
.sr-dd button:hover{background:var(--sr-btn-hover)}
.sr-dialog{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:#0008}
.sr-dialog[hidden]{display:none}
.sr-dialog .sr-dbox{width:min(360px,calc(100% - 32px));background:var(--sr-panel);border:1px solid var(--sr-border);border-radius:12px;padding:18px 18px 14px;box-shadow:0 16px 40px #000c}
.sr-dialog p{margin:0 0 16px;line-height:1.5}
.sr-dialog .sr-dbtns{display:flex;justify-content:flex-end;gap:8px}
.sr-icon{display:inline-block;width:18px;height:18px;background:no-repeat center/contain;filter:var(--sr-icon-filter);vertical-align:middle;pointer-events:none}
.sr-tbtn.sr-main .sr-icon{filter:invert(1)}
.sr-loop-glyph{font-size:18px;line-height:1}
@media (max-width:700px){
 .sr-seek{order:9;flex-basis:100%}
 .sr-mini input{width:70px}
 .sr-menu{top:auto;bottom:0;right:0;left:0;width:auto;max-height:46%;border-radius:12px 12px 0 0}
 .sr-zoom{bottom:auto;top:10px}
 .sr-size input{width:70px}
}
`;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // 3D 화면 색상(테마에 따라 바뀜)
  const PALETTE = {
    dark: { bg0: "#0d1118", bg1: "#171d2b", floor: "#1c2333", edge: "#4a5a82", edgeNone: "#3a4666", gridMajor: "#ffffff1c", gridMinor: "#ffffff0b", dome: "#7ea2ff", wallBack: "#5f7bd414", wallBackLine: "#7ea2ff55", wallFront: "#5f7bd40d", wallFrontLine: "#7ea2ff44", foot: "#ffffff30", badge: "#232a3be6", badgeLine: "#5b6786", joyFill: "#ffffff10", joyLine: "#ffffff55" },
    light: { bg0: "#e9eef7", bg1: "#d9e1ee", floor: "#f8fafd", edge: "#7d8fb8", edgeNone: "#a5b2cf", gridMajor: "#1d243326", gridMinor: "#1d243312", dome: "#4a6fd0", wallBack: "#5f7bd41f", wallBackLine: "#4a6fd099", wallFront: "#5f7bd412", wallFrontLine: "#4a6fd077", foot: "#1d243333", badge: "#ffffffe6", badgeLine: "#8a96b3", joyFill: "#1d243314", joyLine: "#1d243366" },
  };
  // 3D 월드는 눈부심을 막기 위해 테마와 상관없이 항상 어두운 색으로 그린다(UI만 테마를 따름).
  const currentPalette = () => PALETTE.dark;
  let PAL = PALETTE.dark;
  // 캐릭터 지휘 동작 상태(재생 중일 때만 움직임)
  let isPlayingNow = false;
  let currentBpm = 120;   // 지휘 속도: 120 BPM 에서 한 마디(4박) 2초, 템포에 비례
  const conductState = { amp: 0, phase: 0, time: 0 };
  const TAU = Math.PI * 2;
  const MARGIN_NEAR = 0.15;
  const SPEED = 3.2;
  const FOV = 52 * Math.PI / 180;

  function hashHue(text) {
    let h = 0;
    for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % 360;
  }
  const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

  function hull(points) {
    const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length < 3) return pts;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const p of pts) { while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    upper.pop(); lower.pop();
    return lower.concat(upper);
  }
  function pointInPoly(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function create(options = {}) {
    const storageKey = options.storageKey || "mobibard.spatialRoom.v1";
    const getChannels = typeof options.getChannels === "function" ? options.getChannels : () => [];
    const onChange = typeof options.onChange === "function" ? options.onChange : () => {};
    const onListener = typeof options.onListener === "function" ? options.onListener : () => {};
    const onVisibility = typeof options.onVisibility === "function" ? options.onVisibility : () => {};
    const getSongKey = typeof options.getSongKey === "function" ? options.getSongKey : null;
    const getSpeakerLevels = typeof options.getSpeakerLevels === "function" ? options.getSpeakerLevels : null;
    const speakerPulse = new Map();   // 스피커 id -> 0..1 (부드럽게 따라감)
    const getLang = typeof options.getLang === "function" ? options.getLang : () => document.documentElement.lang || "ko";

    function tr(key, vars) {
      const raw = String(getLang() || "ko");
      const lang = TEXT[raw] ? raw : (TEXT[raw.split("-").slice(0, 2).join("-")] ? raw.split("-").slice(0, 2).join("-") : (TEXT[raw.slice(0, 2)] ? raw.slice(0, 2) : "ko"));
      let text = (TEXT[lang] && TEXT[lang][key]) || TEXT.ko[key] || key;
      for (const [k, v] of Object.entries(vars || {})) text = text.replace(`{${k}}`, v);
      return text;
    }

    // ---- 설정 저장/불러오기 ----
    // 채널 선택은 곡(프로젝트)마다 달라서 저장하지 않는다. 다시 열면 스피커는 모든 채널로 시작한다.
    let config, savedCamera = null;
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.speakers)) parsed.speakers = parsed.speakers.map(sp => ({ ...sp, all: true, channels: [] }));
      config = SA.normalizeConfig(parsed);
      savedCamera = parsed && parsed.camera && typeof parsed.camera === "object" ? parsed.camera : null;
    } catch (_) { config = SA.normalizeConfig(null); }
    let saveTimer = 0;
    function save(immediate) {
      clearTimeout(saveTimer);
      const run = () => {
        try {
          const data = {
            ...config,
            speakers: config.speakers.map(sp => ({ id: sp.id, x: sp.x, z: sp.z })),
            camera: typeof cam === "object" ? { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist } : savedCamera,
          };
          localStorage.setItem(storageKey, JSON.stringify(data));
        } catch (_) {}
      };
      if (immediate) run(); else saveTimer = setTimeout(run, 300);
    }
    const clone = () => JSON.parse(JSON.stringify(config));

    // 같은 곡이면 스피커별 채널 선택도 기억한다(최근 30곡). 곡이 바뀌면 그 곡의 선택을, 처음 곡이면 전체 채널로.
    const songsKey = `${storageKey}:songs`;
    let songMem = { order: [], map: {} };
    try { const v = JSON.parse(localStorage.getItem(songsKey) || "null"); if (v && v.map && Array.isArray(v.order)) songMem = v; } catch (_) {}
    const hashText = text => { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return `${text.length.toString(36)}-${h.toString(36)}`; };
    let currentSongKey = null;
    function readSongKey() {
      if (!getSongKey) return null;
      try { const raw = getSongKey(); return raw == null || raw === "" ? null : hashText(String(raw)); } catch (_) { return null; }
    }
    function captureSongChannels() {
      if (!currentSongKey) return;
      const entry = {};
      for (const sp of config.speakers) entry[sp.id] = { all: sp.all === true, channels: sp.all ? [] : sp.channels.slice() };
      songMem.map[currentSongKey] = entry;
      songMem.order = [currentSongKey, ...songMem.order.filter(k => k !== currentSongKey)].slice(0, 30);
      for (const k of Object.keys(songMem.map)) if (!songMem.order.includes(k)) delete songMem.map[k];
      try { localStorage.setItem(songsKey, JSON.stringify(songMem)); } catch (_) {}
    }
    function applySongChannels() {
      const entry = currentSongKey ? songMem.map[currentSongKey] : null;
      let ids = null;
      try { ids = new Set((getChannels() || []).map(c => String(c.id))); } catch (_) {}
      for (const sp of config.speakers) {
        const mem = entry && entry[sp.id];
        if (mem && (mem.all || !ids || !mem.channels.length || mem.channels.some(id => ids.has(id)))) { sp.all = mem.all === true; sp.channels = mem.all ? [] : mem.channels.slice(); }
        else { sp.all = true; sp.channels = []; }
      }
    }
    function checkSong() {
      const key = readSongKey();
      if (key === currentSongKey) return;
      currentSongKey = key;
      applySongChannels();
      if (typeof renderMenu === "function" && !root.hidden) renderMenu();
      onChange(clone(), "song");
    }
    if (getSongKey) setInterval(checkSong, 1000);

    function emit(kind) {
      if (kind === "speakers") captureSongChannels();
      save(kind !== "listener");
      if (kind === "listener") onListener({ ...config.listener });
      else onChange(clone(), kind);
    }

    // ---- 배치 보조 ----
    const hitsBody = (x, z, other) => Math.abs(x - other.x) < SA.BODY - 1e-6 && Math.abs(z - other.z) < SA.BODY - 1e-6;
    function isFree(x, z, ignoreId) {
      if (hitsBody(x, z, config.listener)) return false;
      return !config.speakers.some(s => s.id !== ignoreId && hitsBody(x, z, s));
    }
    function nearestFree(x, z, ignoreId) {
      const start = SA.snapSpeaker(x, z, config.env, config.size);
      if (isFree(start.x, start.z, ignoreId)) return start;
      for (let ring = 1; ring <= 80; ring++) {
        let best = null, bestD = Infinity;
        for (let i = -ring; i <= ring; i++) {
          for (const [dx, dz] of [[i, -ring], [i, ring], [-ring, i], [ring, i]]) {
            const p = SA.snapSpeaker(start.x + dx * SA.SNAP, start.z + dz * SA.SNAP, config.env, config.size);
            if (!isFree(p.x, p.z, ignoreId)) continue;
            const d = Math.hypot(p.x - x, p.z - z);
            if (d < bestD) { bestD = d; best = p; }
          }
        }
        if (best) return best;
      }
      return start;
    }
    function reflow() {
      const lp = SA.clampToMap(config.listener.x, config.listener.z, config.env, config.size);
      config.listener.x = lp.x; config.listener.z = lp.z;
      for (const s of config.speakers) {
        const p = SA.snapSpeaker(s.x, s.z, config.env, config.size);
        s.x = p.x; s.z = p.z;
      }
      for (const s of config.speakers) {
        if (!isFree(s.x, s.z, s.id)) { const p = nearestFree(s.x, s.z, s.id); s.x = p.x; s.z = p.z; }
      }
    }
    function newId() {
      for (let i = 1; i < 100; i++) if (!config.speakers.some(s => s.id === `s${i}`)) return `s${i}`;
      return `s${Date.now()}`;
    }

    // ---- DOM ----
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS + ["play", "stop", "first", "last"].map(name => `.sr-icon-${name}{background-image:url("${ICON_BASE}${name}.svg")}`).join("\n");
      document.head.appendChild(style);
    }
    const root = document.createElement("div");
    root.className = "sr-root";
    root.setAttribute("data-i18n-skip", "");
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.innerHTML = `
      <div class="sr-bar">
        <div class="sr-bar-main">
        <span class="sr-title"></span>
        <label class="sr-switch"><input type="checkbox" data-r="enable"><b data-r="enableText"></b></label>
        <span class="sr-seg sr-full-only" data-r="env"></span>
        <span class="sr-size sr-full-only"><span data-r="sizeText"></span><input type="range" data-r="size" min="${SA.SIZE_MIN}" max="${SA.SIZE_MAX}" step="1"><b data-r="sizeValue"></b></span>
        <button type="button" class="sr-btn sr-full-only" data-r="add"></button>
        <button type="button" class="sr-btn sr-full-only" data-r="auto" aria-haspopup="menu"></button>
        <button type="button" class="sr-btn sr-full-only" data-r="reset"></button>
        </div>
        <div class="sr-bar-side">
        <button type="button" class="sr-btn" data-r="viewMode"></button>
        <button type="button" class="sr-btn" data-r="close"></button>
        </div>
      </div>
      <div class="sr-stage" data-r="stage">
        <canvas data-r="canvas"></canvas>
        <div class="sr-zoom"><button type="button" data-r="zin">+</button><button type="button" data-r="zout">−</button></div>
        <div class="sr-hint" data-r="hint"></div>
        <div class="sr-menu" data-r="menu" hidden></div>
        <div class="sr-ctx" data-r="ctx" hidden><button type="button" data-r="ctxMove"></button><button type="button" data-r="ctxAdd"></button><hr data-r="ctxSep1"><div class="sr-ctx-label" data-r="ctxAutoLabel"></div><button type="button" class="sr-sub" data-r="ctxSquare"></button><button type="button" class="sr-sub" data-r="ctxCircle"></button><button type="button" class="sr-sub" data-r="ctxFront"></button><hr data-r="ctxSep2"><button type="button" data-r="ctxReset" class="sr-ctx-danger"></button><button type="button" data-r="ctxDelete" class="sr-ctx-danger"></button></div>
      </div>
      <div class="sr-dd" data-r="dd" role="menu" hidden><button type="button" data-r="ddSquare"></button><button type="button" data-r="ddCircle"></button><button type="button" data-r="ddFront"></button></div>
      <div class="sr-dialog" data-r="dialog" hidden><div class="sr-dbox" role="alertdialog" aria-modal="true"><p data-r="dialogText"></p><div class="sr-dbtns"><button type="button" class="sr-btn" data-r="dialogCancel"></button><button type="button" class="sr-btn danger" data-r="dialogOk"></button></div></div></div>
      <div class="sr-transport" data-r="transport" hidden>
        <button type="button" class="sr-tbtn" data-r="tStart"><span class="sr-icon sr-icon-first" aria-hidden="true"></span></button>
        <button type="button" class="sr-tbtn sr-main" data-r="tPlay"><span class="sr-icon sr-icon-play" aria-hidden="true"></span></button>
        <button type="button" class="sr-tbtn" data-r="tEnd"><span class="sr-icon sr-icon-last" aria-hidden="true"></span></button>
        <button type="button" class="sr-tbtn" data-r="tLoop" aria-pressed="false"><span class="sr-loop-glyph" aria-hidden="true">↻</span></button>
        <span class="sr-time" data-r="tTime">0:00.0 / 0:00.0</span>
        <input type="range" class="sr-seek" data-r="tSeek" min="0" max="0" step="0.01" value="0">
        <label class="sr-mini"><span aria-hidden="true">🔊</span><input type="range" data-r="tVol" min="0" max="150" step="5" value="100"><b data-r="tVolText">100%</b></label>
        <label class="sr-mini"><span aria-hidden="true">⏱</span><input type="range" data-r="tSpeed" min="0.75" max="1.5" step="0.05" value="1"><b data-r="tSpeedText">1.00×</b></label>
      </div>`;
    document.body.appendChild(root);
    const $ = name => root.querySelector(`[data-r="${name}"]`);
    const canvas = $("canvas"), ctx = canvas.getContext("2d"), stage = $("stage"), menu = $("menu");
    const envBox = $("env"), sizeInput = $("size");
    const envButtons = {};
    for (const [key, label] of [["none", "envNone"], ["dome", "envDome"], ["room", "envRoom"]]) {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.env = key; b.dataset.label = label;
      b.addEventListener("click", () => { if (config.env === key) return; config.env = key; reflow(); refreshBar(); renderMenu(); emit("env"); });
      envBox.appendChild(b);
      envButtons[key] = b;
    }
    const isTouch = () => (window.matchMedia && matchMedia("(pointer:coarse)").matches) || "ontouchstart" in window;

    function refreshBar() {
      root.querySelector(".sr-title").textContent = tr("title");
      $("enable").checked = config.enabled;
      $("enableText").textContent = tr(config.enabled ? "on" : "off");
      $("enable").title = tr("enable"); $("enable").setAttribute("aria-label", tr("enable"));
      for (const b of Object.values(envButtons)) { b.textContent = tr(b.dataset.label); b.setAttribute("aria-pressed", String(config.env === b.dataset.env)); }
      $("sizeText").textContent = tr("size");
      sizeInput.value = String(config.size);
      $("sizeValue").textContent = `${config.size}${tr("meter")}`;
      const full = config.speakers.length >= SA.MAX_SPEAKERS;
      $("add").textContent = tr("speakers", { n: config.speakers.length, max: SA.MAX_SPEAKERS });
      $("add").disabled = full;
      $("add").title = full ? tr("full", { n: SA.MAX_SPEAKERS }) : tr("add");
      $("reset").textContent = tr("reset");
      $("auto").textContent = `${tr("autoArrange")} ▾`;
      for (const [k, key] of [["Square", "layoutSquare"], ["Circle", "layoutCircle"], ["Front", "layoutFront"]]) { $(`dd${k}`).textContent = tr(key); $(`ctx${k}`).textContent = tr(key); }
      $("ctxAutoLabel").textContent = tr("autoArrange");
      $("ctxReset").textContent = tr("reset");
      $("viewMode").textContent = miniMode ? "⤢" : "▭";
      $("viewMode").title = tr(miniMode ? "expand" : "mini"); $("viewMode").setAttribute("aria-label", tr(miniMode ? "expand" : "mini"));
      root.classList.toggle("sr-mini-mode", miniMode); root.classList.toggle("sr-full-mode", !miniMode);
      $("ctxMove").textContent = tr("moveHere");
      $("ctxAdd").textContent = `${tr("addHere")} (${config.speakers.length}/${SA.MAX_SPEAKERS})`;
      $("ctxAdd").disabled = full;
      $("close").textContent = "✕"; $("close").title = tr("close"); $("close").setAttribute("aria-label", tr("close"));
      $("zin").title = tr("zoomIn"); $("zout").title = tr("zoomOut");
      $("hint").textContent = isTouch() ? tr("hintTouch") : tr("hint");
      root.title = miniMode ? tr("hintMini") : "";
      if (typeof refreshTransportLabels === "function") refreshTransportLabels();
    }

    // 작은 화면 상태(위치·크기 포함)는 따로 저장한다.
    const viewKey = `${storageKey}:view`;
    let miniMode = false, miniRect = null;
    try { const v = JSON.parse(localStorage.getItem(viewKey) || "null"); miniMode = v?.mini === true; miniRect = v?.rect || null; } catch (_) {}
    const saveView = () => { try { localStorage.setItem(viewKey, JSON.stringify({ mini: miniMode, rect: miniRect })); } catch (_) {} };
    function askConfirm(text, okText, onOk) {
      const dialog = $("dialog");
      $("dialogText").textContent = text;
      $("dialogCancel").textContent = tr("cancel");
      $("dialogOk").textContent = okText;
      dialog.hidden = false;
      const done = ok => { dialog.hidden = true; $("dialogOk").onclick = $("dialogCancel").onclick = dialog.onclick = null; if (ok) onOk(); };
      $("dialogOk").onclick = () => done(true);
      $("dialogCancel").onclick = () => done(false);
      dialog.onclick = e => { if (e.target === dialog) done(false); };
      setTimeout(() => $("dialogCancel").focus(), 0);
    }
    $("enable").addEventListener("change", e => { config.enabled = e.target.checked; $("enableText").textContent = tr(config.enabled ? "on" : "off"); emit("enabled"); });
    sizeInput.addEventListener("input", () => {
      config.size = SA.normalizeSize(sizeInput.value);
      $("sizeValue").textContent = `${config.size}${tr("meter")}`;
      reflow(); emit("size");
    });
    sizeInput.addEventListener("change", () => sizeInput.blur());
    $("add").addEventListener("click", () => {
      if (config.speakers.length >= SA.MAX_SPEAKERS) return;
      const fx = Math.sin(config.listener.yaw), fz = -Math.cos(config.listener.yaw);
      const p = nearestFree(config.listener.x + fx * 2, config.listener.z + fz * 2, null);
      const speaker = { id: newId(), x: p.x, z: p.z, all: true, channels: [] };
      config.speakers.push(speaker);
      selectedId = speaker.id;
      refreshBar(); renderMenu(); emit("speakers");
    });
    function askReset() {
      askConfirm(tr("resetConfirm"), tr("reset"), () => {
        const enabled = config.enabled, env = config.env, size = config.size;
        config = SA.normalizeConfig({ ...SA.defaultConfig(), enabled, env, size });
        selectedId = null; cam.tx = 0; cam.tz = 0; targetPoint = null;
        refreshBar(); renderMenu(); emit("speakers"); emit("listener");
      });
    }
    $("reset").addEventListener("click", askReset);
    $("close").addEventListener("click", () => api.close());
    // 채널 자동 배치: 채널(많으면 그룹·순서로 묶음)마다 스피커 하나를 캐릭터 기준으로 놓는다.
    //   front = 앞쪽 반원, circle = 중심을 둘러싼 원, square = 중심을 둘러싼 사각형 둘레 (맵 중심 0,0 기준)
    function autoArrange(shape = "front") {
      const channels = channelList();
      if (!channels.length) return;
      const max = SA.MAX_SPEAKERS;
      let units;
      if (channels.length <= max) units = channels.map(c => [c.id]);
      else {
        units = [];
        const seen = new Set();
        for (const c of channels) {
          if (!c.group) { units.push([c.id]); continue; }
          if (seen.has(c.group.id)) continue;
          seen.add(c.group.id);
          units.push(channels.filter(m => m.group && m.group.id === c.group.id).map(m => m.id));
        }
        if (units.length > max) {
          const flat = channels.map(c => c.id), size = Math.ceil(flat.length / max);
          units = [];
          for (let i = 0; i < flat.length; i += size) units.push(flat.slice(i, i + size));
        }
      }
      // 기준은 캐릭터가 아니라 맵 중심(0,0), 앞쪽은 -z 방향.
      const n = units.length, L = { x: 0, z: 0, yaw: 0 };
      const limit = Math.max(1.5, config.size / 2 - 1);
      const fx = Math.sin(L.yaw), fz = -Math.cos(L.yaw), rx = Math.cos(L.yaw), rz = Math.sin(L.yaw);
      // local: (오른쪽, 앞) -> 월드
      const place = (right, fwd) => [L.x + rx * right + fx * fwd, L.z + rz * right + fz * fwd];
      const spots = [];
      if (shape === "circle") {
        const radius = clamp(1.2 + n * 0.3, 2, limit);
        for (let i = 0; i < n; i++) { const a = i / n * TAU; spots.push(place(Math.sin(a) * radius, Math.cos(a) * radius)); }
      } else if (shape === "square") {
        const half = clamp(1.5 + n * 0.25, 2, limit), per = 8 * half;
        for (let i = 0; i < n; i++) {
          // 앞쪽 가운데에서 시작해 시계 방향으로 둘레를 고르게 나눈다.
          let t = (i / n * per + half) % per, x, y;
          if (t < 2 * half) { x = -half + t; y = half; }
          else if ((t -= 2 * half) < 2 * half) { x = half; y = half - t; }
          else if ((t -= 2 * half) < 2 * half) { x = half - t; y = -half; }
          else { t -= 2 * half; x = -half; y = -half + t; }
          spots.push(place(x, y));
        }
      } else {
        // 6개까지는 한 줄, 넘으면 남는 스피커를 뒷줄(더 먼 반원)에 놓는다.
        const rows = n > 6 ? [6, n - 6] : [n];
        const frontRadius = clamp(1.5 + rows[0] * 0.35, 2.5, limit);
        rows.forEach((count, row) => {
          const radius = row === 0 ? frontRadius : Math.min(limit, frontRadius + 1.5);
          const spread = count === 1 ? 0 : Math.min(Math.PI * 0.85, count * 0.42 * (row === 0 ? 1 : frontRadius / radius));
          for (let i = 0; i < count; i++) { const a = count === 1 ? 0 : -spread / 2 + spread * i / (count - 1); spots.push(place(Math.sin(a) * radius, Math.cos(a) * radius)); }
        });
      }
      config.speakers = [];
      units.forEach((ids, i) => {
        const p = nearestFree(spots[i][0], spots[i][1], null);
        config.speakers.push({ id: `s${i + 1}`, x: p.x, z: p.z, all: false, channels: ids.slice() });
      });
      selectedId = null; closeContextMenu();
      refreshBar(); renderMenu(); emit("speakers");
    }
    const dd = $("dd");
    const closeDropdown = () => { dd.hidden = true; $("auto").setAttribute("aria-expanded", "false"); };
    $("auto").addEventListener("click", e => {
      e.stopPropagation();
      if (!dd.hidden) { closeDropdown(); return; }
      const b = $("auto").getBoundingClientRect();
      dd.hidden = false;
      dd.style.left = `${Math.min(b.left, window.innerWidth - dd.offsetWidth - 4)}px`;
      dd.style.top = `${b.bottom + 3}px`;
      $("auto").setAttribute("aria-expanded", "true");
    });
    for (const [k, shape] of [["Square", "square"], ["Circle", "circle"], ["Front", "front"]]) {
      $(`dd${k}`).addEventListener("click", () => { closeDropdown(); autoArrange(shape); });
    }
    document.addEventListener("pointerdown", e => { if (!dd.hidden && !dd.contains(e.target) && e.target !== $("auto")) closeDropdown(); }, true);
    $("zin").addEventListener("click", () => { cam.dist = clamp(cam.dist * 0.85, 4, 45); save(); });
    $("zout").addEventListener("click", () => { cam.dist = clamp(cam.dist / 0.85, 4, 45); save(); });

    // ---- 재생 컨트롤(앱이 transport 를 넘겨주면 표시) ----
    const transport = options.transport && typeof options.transport.getState === "function" ? options.transport : null;
    const tEl = name => $(name);
    const fmtTime = sec => { const v = Math.max(0, Number(sec) || 0); const m = Math.floor(v / 60); return `${m}:${(v - m * 60).toFixed(1).padStart(4, "0")}`; };
    let scrubbing = false, lastT = {};
    function refreshTransportLabels() {
      if (!transport) return;
      tEl("tStart").title = tr("toStart"); tEl("tEnd").title = tr("toEnd"); tEl("tLoop").title = tr("loop");
      tEl("tVol").title = tr("volume"); tEl("tSpeed").title = tr("speed");
      lastT = {};
    }
    function updateTransport() {
      if (!transport) return;
      let st;
      try { st = transport.getState() || {}; } catch (_) { return; }
      isPlayingNow = !!st.playing;
      currentBpm = clamp(Number(st.bpm) || 120, 20, 600);
      const playing = !!st.playing, duration = Math.max(0, Number(st.duration) || 0), position = clamp(Number(st.position) || 0, 0, duration || Infinity);
      if (lastT.playing !== playing) { tEl("tPlay").innerHTML = `<span class="sr-icon sr-icon-${playing ? "stop" : "play"}" aria-hidden="true"></span>`; tEl("tPlay").title = tr(playing ? "stop" : "play"); lastT.playing = playing; }
      if (lastT.loop !== !!st.loop) { tEl("tLoop").setAttribute("aria-pressed", String(!!st.loop)); lastT.loop = !!st.loop; }
      const seek = tEl("tSeek");
      if (lastT.duration !== duration) { seek.max = String(duration); lastT.duration = duration; }
      if (!scrubbing) {
        if (Math.abs((lastT.position ?? -1) - position) > 0.005) { seek.value = String(position); lastT.position = position; }
        const text = `${fmtTime(position)} / ${fmtTime(duration)}`;
        if (lastT.text !== text) { tEl("tTime").textContent = text; lastT.text = text; }
      }
      const vol = Math.round(Number(st.volume ?? 100));
      if (lastT.vol !== vol && document.activeElement !== tEl("tVol")) { tEl("tVol").value = String(vol); tEl("tVolText").textContent = `${vol}%`; lastT.vol = vol; }
      const speed = Number(st.speed ?? 1);
      if (lastT.speed !== speed && document.activeElement !== tEl("tSpeed")) { tEl("tSpeed").value = String(speed); tEl("tSpeedText").textContent = `${speed.toFixed(2)}×`; lastT.speed = speed; }
    }
    if (transport) {
      tEl("transport").hidden = false;
      const call = (fn, ...args) => { try { fn?.(...args); } catch (error) { console.warn("spatial room transport", error); } lastT = {}; };
      tEl("tStart").addEventListener("click", () => call(transport.toStart));
      tEl("tPlay").addEventListener("click", () => call(transport.togglePlay));
      tEl("tEnd").addEventListener("click", () => call(transport.toEnd));
      tEl("tLoop").addEventListener("click", () => call(transport.setLoop, tEl("tLoop").getAttribute("aria-pressed") !== "true"));
      const seek = tEl("tSeek");
      seek.addEventListener("pointerdown", () => { scrubbing = true; });
      seek.addEventListener("input", () => { scrubbing = true; tEl("tTime").textContent = `${fmtTime(seek.value)} / ${fmtTime(seek.max)}`; });
      seek.addEventListener("change", () => { call(transport.seek, Number(seek.value)); scrubbing = false; seek.blur(); });
      seek.addEventListener("pointerup", () => { setTimeout(() => { scrubbing = false; }, 0); });
      tEl("tVol").addEventListener("input", () => { const v = Number(tEl("tVol").value); tEl("tVolText").textContent = `${v}%`; call(transport.setVolume, v); });
      tEl("tVol").addEventListener("change", () => tEl("tVol").blur());
      tEl("tSpeed").addEventListener("input", () => { tEl("tSpeedText").textContent = `${Number(tEl("tSpeed").value).toFixed(2)}×`; });
      tEl("tSpeed").addEventListener("change", () => { call(transport.setSpeed, Number(tEl("tSpeed").value)); tEl("tSpeed").blur(); });
    }

    // ---- 스피커 채널 메뉴 ----
    let selectedId = null, hoverId = null;
    function channelList() {
      const list = (getChannels() || []).map(c => ({ id: String(c.id), name: String(c.name ?? c.id), color: c.color || `hsl(${hashHue(c.id)} 70% 60%)`, group: c.group && c.group.id != null ? { id: String(c.group.id), name: String(c.group.name ?? c.group.id) } : null }));
      return list;
    }
    function renderMenu() {
      const speaker = config.speakers.find(s => s.id === selectedId);
      if (!speaker) { menu.hidden = true; menu.dataset.speaker = ""; return; }
      const channels = channelList();
      const ids = channels.map(c => c.id);
      const index = config.speakers.indexOf(speaker) + 1;
      const prevBody = menu.querySelector(".sr-mbody");
      const keepScroll = prevBody && menu.dataset.speaker === speaker.id ? prevBody.scrollTop : 0;
      menu.hidden = false;
      menu.dataset.speaker = speaker.id;
      menu.textContent = "";
      const isOn = id => speaker.all || speaker.channels.includes(id);
      const setMany = (list, on) => {
        let set = new Set(speaker.all ? ids : speaker.channels);
        for (const id of list) { if (on) set.add(id); else set.delete(id); }
        if (ids.length && ids.every(id => set.has(id))) { speaker.all = true; speaker.channels = []; }
        else { speaker.all = false; speaker.channels = [...set]; }
        renderMenu(); emit("speakers");
      };
      // 머리(고정)
      const head = document.createElement("h3");
      const title = document.createElement("span");
      title.textContent = tr("speaker", { n: index });
      const x = document.createElement("button");
      x.type = "button"; x.className = "sr-btn"; x.textContent = "×"; x.style.padding = "2px 9px";
      x.addEventListener("click", () => { selectedId = null; renderMenu(); });
      head.append(title, x);
      // 본문(스크롤): 그룹은 묶어서 한 번에 선택
      const body = document.createElement("div");
      body.className = "sr-mbody";
      const mk = (label, checked, color, onToggle, cls, extra) => {
        const lab = document.createElement("label");
        lab.className = cls || "sr-ch";
        const input = document.createElement("input");
        input.type = "checkbox"; input.checked = checked === true; input.indeterminate = checked === "mixed";
        input.addEventListener("change", () => onToggle(input.checked));
        lab.appendChild(input);
        if (color) { const dot = document.createElement("span"); dot.className = "sr-dot"; dot.style.background = color; lab.appendChild(dot); }
        const span = document.createElement("span"); span.textContent = label; lab.appendChild(span);
        if (extra) { const small = document.createElement("small"); small.textContent = extra; lab.appendChild(small); }
        return lab;
      };
      if (!channels.length) {
        const empty = document.createElement("div"); empty.className = "sr-note"; empty.textContent = tr("noChannels"); body.appendChild(empty);
      }
      const doneGroups = new Set();
      for (const channel of channels) {
        if (!channel.group) {
          body.appendChild(mk(channel.name, isOn(channel.id), channel.color, on => setMany([channel.id], on)));
          continue;
        }
        if (doneGroups.has(channel.group.id)) continue;
        doneGroups.add(channel.group.id);
        const members = channels.filter(c => c.group && c.group.id === channel.group.id);
        const onCount = members.filter(c => isOn(c.id)).length;
        const state = onCount === members.length ? true : (onCount ? "mixed" : false);
        body.appendChild(mk(channel.group.name, state, null, on => setMany(members.map(c => c.id), on), "sr-grp", `${onCount}/${members.length}`));
        for (const member of members) {
          const row = mk(member.name, isOn(member.id), member.color, on => setMany([member.id], on));
          row.classList.add("sr-indent");
          body.appendChild(row);
        }
      }
      if (channels.length && !ids.some(isOn)) {
        const note = document.createElement("div"); note.className = "sr-note"; note.textContent = tr("none"); body.appendChild(note);
      }
      // 바닥(고정): 왼쪽 전체 선택/해제, 오른쪽 삭제
      const foot = document.createElement("div");
      foot.className = "sr-mfoot";
      const btn = (text, cls, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = text; b.addEventListener("click", fn); return b; };
      const grow = document.createElement("span"); grow.className = "sr-grow";
      foot.append(
        btn(tr("selectAll"), "sr-btn", () => { speaker.all = true; speaker.channels = []; renderMenu(); emit("speakers"); }),
        btn(tr("selectNone"), "sr-btn", () => { speaker.all = false; speaker.channels = []; renderMenu(); emit("speakers"); }),
        grow,
        btn(tr("remove"), "sr-btn danger", () => {
          config.speakers = config.speakers.filter(s => s.id !== speaker.id);
          selectedId = null; refreshBar(); renderMenu(); emit("speakers");
        }),
      );
      menu.append(head, body, foot);
      body.scrollTop = keepScroll;
    }

    // ---- 카메라/투영 ----
    const cam = {
      yaw: Number.isFinite(Number(savedCamera?.yaw)) ? Number(savedCamera.yaw) : 0,
      pitch: clamp(Number.isFinite(Number(savedCamera?.pitch)) ? Number(savedCamera.pitch) : 0.62, 0.22, 1.4),
      dist: clamp(Number.isFinite(Number(savedCamera?.dist)) ? Number(savedCamera.dist) : 11, 4, 45),
      tx: config.listener.x, tz: config.listener.z,
    };
    let W = 0, H = 0, DPR = 1, focal = 1, eye = [0, 0, 0], R = [1, 0, 0], U = [0, 1, 0], F = [0, 0, -1];
    function setupCamera() {
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), ty = 0.8;
      eye = [cam.tx + cam.dist * Math.sin(cam.yaw) * cp, ty + cam.dist * sp, cam.tz + cam.dist * Math.cos(cam.yaw) * cp];
      F = norm3([cam.tx - eye[0], ty - eye[1], cam.tz - eye[2]]);
      R = norm3([-F[2], 0, F[0]]);
      U = cross3(R, F);
      focal = (H / 2) / Math.tan(FOV / 2);
    }
    const toCam = p => { const v = sub3(p, eye); return [dot3(v, R), dot3(v, U), dot3(v, F)]; };
    const proj = c => { const s = focal / c[2]; return [W / 2 + c[0] * s, H / 2 - c[1] * s, c[2], s]; };
    function clipNear(poly) {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const ain = a[2] >= MARGIN_NEAR, bin = b[2] >= MARGIN_NEAR;
        if (ain) out.push(a);
        if (ain !== bin) {
          const t = (MARGIN_NEAR - a[2]) / (b[2] - a[2]);
          out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, MARGIN_NEAR]);
        }
      }
      return out;
    }
    function polyPath(points3) {
      const clipped = clipNear(points3.map(toCam));
      if (clipped.length < 3) return false;
      ctx.beginPath();
      clipped.forEach((c, i) => { const p = proj(c); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.closePath();
      return true;
    }
    function drawPoly(points3, fill, stroke, width) {
      if (!polyPath(points3)) return false;
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width || 1; ctx.stroke(); }
      return true;
    }
    function drawLine(a, b, stroke, width) {
      let ca = toCam(a), cb = toCam(b);
      if (ca[2] < MARGIN_NEAR && cb[2] < MARGIN_NEAR) return;
      if (ca[2] < MARGIN_NEAR) { const t = (MARGIN_NEAR - ca[2]) / (cb[2] - ca[2]); ca = [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, MARGIN_NEAR]; }
      else if (cb[2] < MARGIN_NEAR) { const t = (MARGIN_NEAR - cb[2]) / (ca[2] - cb[2]); cb = [cb[0] + (ca[0] - cb[0]) * t, cb[1] + (ca[1] - cb[1]) * t, MARGIN_NEAR]; }
      const pa = proj(ca), pb = proj(cb);
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]);
      ctx.strokeStyle = stroke; ctx.lineWidth = width || 1; ctx.stroke();
    }
    function groundPoint(px, py) {
      const nx = (px - W / 2) / focal, ny = (H / 2 - py) / focal;
      const dir = [F[0] + R[0] * nx + U[0] * ny, F[1] + R[1] * nx + U[1] * ny, F[2] + R[2] * nx + U[2] * ny];
      if (dir[1] > -1e-4) return null;
      const t = -eye[1] / dir[1];
      return { x: eye[0] + dir[0] * t, z: eye[2] + dir[2] * t };
    }

    // ---- 그리기 ----
    const ring = (cx, cz, radius, y, n = 72) => Array.from({ length: n }, (_, i) => [cx + Math.cos(i / n * TAU) * radius, y, cz + Math.sin(i / n * TAU) * radius]);
    function drawFloorAndWalls() {
      const half = config.size / 2, env = config.env;
      const floorFill = PAL.floor;
      if (env === "dome") {
        drawPoly(ring(0, 0, half, 0, 96), floorFill, PAL.edge, 2);
        if (polyPath(ring(0, 0, half, 0, 96))) {
          ctx.save(); ctx.clip();
          for (let v = -half; v <= half + 1e-6; v += SA.SNAP) drawLine([v, 0, -half], [v, 0, half], Math.abs(v % 1) < 1e-6 ? PAL.gridMajor : PAL.gridMinor, 1);
          for (let v = -half; v <= half + 1e-6; v += SA.SNAP) drawLine([-half, 0, v], [half, 0, v], Math.abs(v % 1) < 1e-6 ? PAL.gridMajor : PAL.gridMinor, 1);
          ctx.restore();
        }
      } else {
        drawPoly([[-half, 0, -half], [half, 0, -half], [half, 0, half], [-half, 0, half]], floorFill, env === "room" ? PAL.edge : PAL.edgeNone, 2);
        for (let v = -half; v <= half + 1e-6; v += SA.SNAP) {
          const major = Math.abs(v % 1) < 1e-6;
          drawLine([v, 0, -half], [v, 0, half], major ? PAL.gridMajor : PAL.gridMinor, 1);
          drawLine([-half, 0, v], [half, 0, v], major ? PAL.gridMajor : PAL.gridMinor, 1);
        }
      }
    }
    function wallsList() {
      const half = config.size / 2, h = 3;
      return [
        { c: [0, 0, -half], q: [[-half, 0, -half], [half, 0, -half], [half, h, -half], [-half, h, -half]] },
        { c: [0, 0, half], q: [[-half, 0, half], [half, 0, half], [half, h, half], [-half, h, half]] },
        { c: [-half, 0, 0], q: [[-half, 0, -half], [-half, 0, half], [-half, h, half], [-half, h, -half]] },
        { c: [half, 0, 0], q: [[half, 0, -half], [half, 0, half], [half, h, half], [half, h, -half]] },
      ].map(w => ({ ...w, d: Math.hypot(w.c[0] - eye[0], w.c[2] - eye[2]) })).sort((a, b) => b.d - a.d);
    }
    function drawDome(alpha) {
      const r = config.size / 2;
      ctx.save();
      ctx.globalAlpha = alpha;
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI;
        const pts = [];
        for (let i = 0; i <= 24; i++) { const t = i / 24 * Math.PI; pts.push([Math.cos(a) * Math.cos(t) * r, Math.sin(t) * r, Math.sin(a) * Math.cos(t) * r]); }
        for (let i = 0; i < pts.length - 1; i++) drawLine(pts[i], pts[i + 1], PAL.dome, 1);
      }
      for (const lat of [0.35, 0.7, 1.0]) {
        const y = Math.sin(lat * Math.PI / 2 * 0.98) * r, rr = Math.cos(lat * Math.PI / 2 * 0.98) * r;
        const pts = ring(0, 0, rr, y, 48);
        for (let i = 0; i < pts.length; i++) drawLine(pts[i], pts[(i + 1) % pts.length], PAL.dome, 1);
      }
      ctx.restore();
    }
    function speakerGeometry(s) {
      // 스피커 소리는 전방향이지만, 보기 좋게 맵 중심(0,0)을 바라보게 놓는다.
      let fx = -s.x, fz = -s.z;
      const l = Math.hypot(fx, fz);
      if (l < 1e-6) { fx = 0; fz = 1; } else { fx /= l; fz /= l; }
      const rx = -fz, rz = fx;
      // 소리가 날 때 아주 살짝 커졌다 작아진다(울림).
      const k = 1 + 0.12 * (speakerPulse.get(s.id) || 0);
      const w = 0.45 * k, d = 0.3 * k, h = 1.1 * k;
      const P = (a, b, y) => [s.x + fx * a * d + rx * b * w, y, s.z + fz * a * d + rz * b * w];
      const corners = [];
      for (const a of [-1, 1]) for (const b of [-1, 1]) for (const y of [0, h]) corners.push(P(a, b, y));
      return { fx, fz, rx, rz, w, d, h, P, corners };
    }
    function speakerScreen(s) {
      const g = speakerGeometry(s);
      const pts = [];
      for (const c of g.corners) { const cc = toCam(c); if (cc[2] < MARGIN_NEAR) return null; const p = proj(cc); pts.push([p[0], p[1]]); }
      return hull(pts);
    }
    function drawSpeaker(s, index) {
      const g = speakerGeometry(s), { P, h } = g;
      const faces = [
        { q: [P(1, -1, 0), P(1, 1, 0), P(1, 1, h), P(1, -1, h)], n: [g.fx, 0, g.fz], front: true },
        { q: [P(-1, 1, 0), P(-1, -1, 0), P(-1, -1, h), P(-1, 1, h)], n: [-g.fx, 0, -g.fz] },
        { q: [P(-1, -1, 0), P(1, -1, 0), P(1, -1, h), P(-1, -1, h)], n: [-g.rx, 0, -g.rz] },
        { q: [P(1, 1, 0), P(-1, 1, 0), P(-1, 1, h), P(1, 1, h)], n: [g.rx, 0, g.rz] },
        { q: [P(-1, -1, h), P(1, -1, h), P(1, 1, h), P(-1, 1, h)], n: [0, 1, 0] },
      ];
      const light = norm3([0.4, 0.9, 0.5]);
      const faceCenter = f => [f.q.reduce((a, p) => a + p[0], 0) / 4, f.q.reduce((a, p) => a + p[1], 0) / 4, f.q.reduce((a, p) => a + p[2], 0) / 4];
      const visible = faces.filter(f => dot3(f.n, sub3(eye, faceCenter(f))) > 0)
        .sort((a, b) => Math.hypot(...sub3(faceCenter(b), eye)) - Math.hypot(...sub3(faceCenter(a), eye)));
      for (const f of visible) {
        const shade = 0.42 + 0.58 * clamp(dot3(f.n, light), 0, 1);
        const base = f.front ? 46 : 58;
        const v = Math.round(base * (0.6 + shade * 0.9));
        drawPoly(f.q, `rgb(${v},${v + 4},${v + 16})`, "#0008", 1);
        if (f.front) {
          const circle = (b, y, rad, fill, stroke) => drawPoly(Array.from({ length: 20 }, (_, i) => { const t = i / 20 * TAU; return P(1.02, b + Math.cos(t) * rad / g.w, y + Math.sin(t) * rad); }), fill, stroke, 1.5);
          const pulse = speakerPulse.get(s.id) || 0;
          circle(0, 0.42, 0.28 * (1 + 0.1 * pulse), "#12151c", pulse > 0.02 ? `rgba(126,162,255,${0.35 + 0.65 * pulse})` : "#5b6786");
          circle(0, 0.42, 0.11 * (1 + 0.35 * pulse), "#2a3040", null);
          circle(0, 0.92, 0.1, "#12151c", "#5b6786");
        }
      }
      // 번호 배지
      const top = toCam([s.x, h + 0.35, s.z]);
      if (top[2] >= MARGIN_NEAR) {
        const p = proj(top);
        const selected = s.id === selectedId;
        const r = Math.max(8, Math.min(14, 0.22 * p[3]));
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU);
        const bp = speakerPulse.get(s.id) || 0;
        // 소리가 날수록 번호 배지가 초록으로 밝아진다(선택 중이면 파랑 유지).
        ctx.fillStyle = selected ? "#3b6cff" : (bp > 0.02 ? `rgb(${Math.round(35 + (47 - 35) * bp)},${Math.round(42 + (191 - 42) * bp)},${Math.round(59 + (113 - 59) * bp)})` : PAL.badge); ctx.fill();
        ctx.strokeStyle = selected ? "#fff" : PAL.badgeLine; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = selected || PAL === PALETTE.dark ? "#fff" : "#1d2433"; ctx.font = `bold ${Math.round(r * 1.1)}px system-ui,sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(index), p[0], p[1] + 0.5);
      }
    }
    function outlineSpeaker(s, color, width) {
      const poly = speakerScreen(s);
      if (!poly || poly.length < 3) return;
      ctx.save();
      ctx.beginPath();
      poly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.shadowColor = color; ctx.shadowBlur = 10;
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.stroke();
      ctx.restore();
    }
    function footprint(x, z, stroke, fill) {
      const hs = SA.BODY / 2;
      drawPoly([[x - hs, 0.01, z - hs], [x + hs, 0.01, z - hs], [x + hs, 0.01, z + hs], [x - hs, 0.01, z + hs]], fill, stroke, 1.5);
    }
    // 가벼운 도형 조합(다각형 약 40개)으로 그린 아이콘 속 음유시인.
    const disc3 = (c, u, v, ru, rv, n = 16) => Array.from({ length: n }, (_, i) => { const t = i / n * TAU; return [c[0] + u[0] * Math.cos(t) * ru + v[0] * Math.sin(t) * rv, c[1] + u[1] * Math.cos(t) * ru + v[1] * Math.sin(t) * rv, c[2] + u[2] * Math.cos(t) * ru + v[2] * Math.sin(t) * rv]; });
    const add3 = (...vs) => vs.reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0]);
    const mul3 = (v, k) => [v[0] * k, v[1] * k, v[2] * k];
    const shadeRgb = (rgb, k) => `rgb(${rgb.map(c => Math.round(clamp(c * k, 0, 255))).join(",")})`;
    function prism(cx, cz, y0, y1, r0, r1, n, rgb, stroke) {
      const sides = [];
      const light = norm3([0.4, 0.5, 0.6]);
      for (let i = 0; i < n; i++) {
        const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, am = (a0 + a1) / 2;
        const nrm = [Math.cos(am), 0, Math.sin(am)];
        const c = [cx + nrm[0] * (r0 + r1) / 2, (y0 + y1) / 2, cz + nrm[2] * (r0 + r1) / 2];
        if (dot3(nrm, sub3(eye, c)) <= 0) continue;
        sides.push({ q: [[cx + Math.cos(a0) * r0, y0, cz + Math.sin(a0) * r0], [cx + Math.cos(a1) * r0, y0, cz + Math.sin(a1) * r0], [cx + Math.cos(a1) * r1, y1, cz + Math.sin(a1) * r1], [cx + Math.cos(a0) * r1, y1, cz + Math.sin(a0) * r1]], k: 0.55 + 0.5 * clamp(dot3(nrm, light), 0, 1), d: Math.hypot(...sub3(c, eye)) });
      }
      sides.sort((p, q) => q.d - p.d);
      for (const side of sides) drawPoly(side.q, shadeRgb(rgb, side.k), stroke || shadeRgb(rgb, side.k * 0.92), 1);
    }
    function sphere(c, r, fill, stroke) {
      const cc = toCam(c);
      if (cc[2] < MARGIN_NEAR) return;
      const p = proj(cc);
      ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(1, r * p[3]), 0, TAU);
      ctx.fillStyle = fill; ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke(); }
    }
    function drawCharacter() {
      const L = config.listener;
      const Fw = [Math.sin(L.yaw), 0, -Math.cos(L.yaw)], Rt = [Math.cos(L.yaw), 0, Math.sin(L.yaw)], UP = [0, 1, 0];
      const at = (f, r, y) => [L.x + Fw[0] * f + Rt[0] * r, y, L.z + Fw[2] * f + Rt[2] * r];
      const headC = at(0, 0, 0.98);
      const front = dot3(Fw, norm3(sub3(eye, headC))) > 0;
      const faceVisible = dot3(Fw, norm3(sub3(eye, headC))) > 0.08;

      // 청취 방향 부채꼴 + 그림자
      const wedge = [[L.x, 0.02, L.z]];
      for (let i = -6; i <= 6; i++) { const a = L.yaw + i / 6 * 0.9; wedge.push([L.x + Math.sin(a) * 1.9, 0.02, L.z - Math.cos(a) * 1.9]); }
      drawPoly(wedge, "#3b6cff2e", "#7ea2ff66", 1);
      drawPoly(disc3([L.x, 0.015, L.z], [1, 0, 0], [0, 0, 1], 0.38, 0.38, 14), "#00000055", null);

      // 지휘봉: 오른손에 들고, 재생 중일 때만 4박 도형(아래→왼쪽→오른쪽→위)으로 휘젓는다.
      const now = performance.now() / 1000;
      const dtAmp = Math.min(0.1, Math.max(0, now - (conductState.time || now)));
      conductState.time = now;
      conductState.amp += ((isPlayingNow ? 1 : 0) - conductState.amp) * Math.min(1, dtAmp * 4);
      const amp = conductState.amp;
      if (amp > 0.001) conductState.phase += dtAmp * 0.5 * amp * (currentBpm / 120);   // 120 BPM 기준 한 마디 2초
      const beatPts = [[0, -0.11], [-0.13, -0.02], [0.14, -0.01], [0.02, 0.13]];   // (오른쪽, 위) 상대 위치
      const ph = ((conductState.phase % 1) + 1) % 1 * 4, bi = Math.floor(ph), bf = ph - bi;
      const ease = bf * bf * (3 - 2 * bf);
      const p0 = beatPts[bi], p1 = beatPts[(bi + 1) % 4];
      const swing = [(p0[0] + (p1[0] - p0[0]) * ease) * amp, (p0[1] + (p1[1] - p0[1]) * ease) * amp];
      const restHand = [0.2, 0.25, 0.46], playHand = [0.28, 0.24, 0.66];
      const handF = restHand[0] + (playHand[0] - restHand[0]) * amp;
      const handR = restHand[1] + (playHand[1] - restHand[1]) * amp + swing[0];
      const handY = restHand[2] + (playHand[2] - restHand[2]) * amp + swing[1];
      const handPos = at(handF, handR, handY);
      // 지휘봉 방향: 쉴 때는 앞쪽 아래, 지휘할 때는 앞쪽 위 + 움직임 쪽으로 살짝 기운다.
      const tipDir = norm3(add3(mul3(Fw, 0.75), mul3(UP, -0.35 + 1.25 * amp + swing[1] * 2), mul3(Rt, swing[0] * 2.5 - 0.1)));
      const thickLine = (p, q, radius, color) => {
        let ca = toCam(p), cb = toCam(q);
        if (ca[2] < MARGIN_NEAR || cb[2] < MARGIN_NEAR) return;
        const pa = proj(ca), pb = proj(cb);
        ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]);
        ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.2, radius * (pa[3] + pb[3])); ctx.lineCap = "round"; ctx.stroke();
        ctx.lineCap = "butt";
      };
      const drawArms = () => {
        // 왼팔은 옆에 편하게, 오른팔은 지휘봉을 든 손까지
        const leftHand = at(0.08 + 0.06 * amp, -0.27, 0.42 + 0.08 * amp);
        thickLine(at(0, -0.19, 0.62), leftHand, 0.055, "#2f8a4c");
        sphere(leftHand, 0.055, "#f6d3b0", "#b58a66");
        thickLine(at(0, 0.19, 0.62), handPos, 0.055, "#2f8a4c");
        thickLine(add3(handPos, mul3(tipDir, -0.03)), add3(handPos, mul3(tipDir, 0.07)), 0.02, "#3a2412");   // 손잡이
        thickLine(add3(handPos, mul3(tipDir, 0.07)), add3(handPos, mul3(tipDir, 0.42)), 0.007, "#f7f4ea");   // 봉
        sphere(handPos, 0.06, "#5a3a22", "#2e1d10");   // 장갑 낀 오른손
      };

      // 부츠
      for (const side of [-1, 1]) drawPoly(disc3(at(0.1, side * 0.11, 0.02), Fw, Rt, 0.11, 0.07, 10), "#4a2e1a", "#2a190d", 1);
      if (!front) drawArms();
      // 몸통(초록 옷) + 흰 칼라
      prism(L.x, L.z, 0, 0.68, 0.27, 0.17, 8, [52, 150, 82]);
      drawPoly(disc3([L.x, 0.69, L.z], [1, 0, 0], [0, 0, 1], 0.19, 0.19, 10), "#f4f1e6", "#c9c3ad", 1);
      // 머리(금발) + 얼굴
      sphere(headC, 0.3, "#f1d590", "#b8954a");
      if (faceVisible) {
        const faceC = add3(headC, mul3(Fw, 0.2), [0, -0.05, 0]);
        drawPoly(disc3(faceC, Rt, UP, 0.205, 0.19, 16), "#f6d3b0", null);
        // 앞머리
        const fringe = [];
        for (let i = 0; i <= 8; i++) { const t = Math.PI * (i / 8); fringe.push(add3(faceC, mul3(Fw, 0.012), mul3(Rt, Math.cos(t) * 0.215), mul3(UP, Math.sin(t) * 0.2))); }
        for (let i = 0; i <= 6; i++) { const x = -0.18 + i * 0.06; fringe.push(add3(faceC, mul3(Fw, 0.014), mul3(Rt, x), mul3(UP, i % 2 ? 0.05 : 0.1))); }
        drawPoly(fringe, "#f1d590", null);
        const fc = add3(faceC, mul3(Fw, 0.02));
        for (const side of [-1, 1]) {
          drawPoly(disc3(add3(fc, mul3(Rt, side * 0.085), [0, -0.005, 0]), Rt, UP, 0.042, 0.05, 10), "#2e9e5a", "#1d5e37", 1);
          drawPoly(disc3(add3(fc, mul3(Rt, side * 0.085 - 0.012), [0, 0.012, 0], mul3(Fw, 0.002)), Rt, UP, 0.013, 0.013, 6), "#ffffff", null);
          drawPoly(disc3(add3(fc, mul3(Rt, side * 0.14), [0, -0.06, 0]), Rt, UP, 0.03, 0.018, 8), "#f4a0a0aa", null);
        }
        const mouth = [];
        for (let i = 0; i <= 8; i++) { const t = Math.PI + Math.PI * (i / 8); mouth.push(add3(fc, mul3(Rt, Math.cos(t) * 0.05), mul3(UP, -0.085 + Math.sin(t) * 0.045))); }
        drawPoly(mouth, "#c94a4a", "#7a2a2a", 1);
      }
      if (front) drawArms();
      // 모자: 비스듬한 넓은 챙 + 크라운 + 갈색 띠
      const brimC = add3(headC, [0, 0.21, 0], mul3(Fw, -0.02));
      const Ft = norm3(add3(Fw, [0, -0.18, 0]));
      drawPoly(disc3(brimC, Rt, Ft, 0.43, 0.39, 18), "#2c7a45", "#174a29", 1.5);
      prism(brimC[0], brimC[2], brimC[1], brimC[1] + 0.05, 0.205, 0.2, 8, [107, 74, 34]);
      prism(brimC[0], brimC[2], brimC[1] + 0.05, brimC[1] + 0.22, 0.2, 0.14, 8, [38, 112, 64]);
      drawPoly(disc3([brimC[0], brimC[1] + 0.22, brimC[2]], [1, 0, 0], [0, 0, 1], 0.14, 0.14, 8), "#2f8550", "#1d5534", 1);
      // 클로버 장식 + 흰 깃털 (모자 오른쪽)
      const deco = add3(brimC, mul3(Rt, 0.19), mul3(Fw, 0.06), [0, 0.1, 0]);
      const featherDir = norm3(add3(mul3(UP, 0.8), mul3(Fw, -0.45), mul3(Rt, 0.35)));
      const featherSide = norm3(cross3(featherDir, Fw));
      drawPoly([deco, add3(deco, mul3(featherDir, 0.2), mul3(featherSide, 0.07)), add3(deco, mul3(featherDir, 0.42)), add3(deco, mul3(featherDir, 0.2), mul3(featherSide, -0.035))], "#f7f4ea", "#bdb6a0", 1);
      const decoN = norm3(add3(mul3(Rt, 0.7), mul3(Fw, 0.7)));
      const du = norm3(cross3(UP, decoN));
      for (let k = 0; k < 3; k++) {
        const t = k / 3 * TAU + Math.PI / 2;
        drawPoly(disc3(add3(deco, mul3(du, Math.cos(t) * 0.045), mul3(UP, Math.sin(t) * 0.045), mul3(decoN, 0.01)), du, UP, 0.042, 0.042, 8), "#4cc46a", "#23753a", 1);
      }
    }

    let dragGhost = null, targetPoint = null;
    const pointers = new Map();
    let joy = null; // {id, cx, cy, x, y}
    function render() {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      PAL = currentPalette();
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, PAL.bg0); g.addColorStop(1, PAL.bg1);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      setupCamera();
      drawFloorAndWalls();
      const env = config.env;
      const walls = env === "room" ? wallsList() : [];
      for (const w of walls.slice(0, 2)) drawPoly(w.q, PAL.wallBack, PAL.wallBackLine, 1.5);
      if (env === "dome") drawDome(0.22);
      if (targetPoint) footprint(targetPoint.x, targetPoint.z, "#2fbf7188", "#2fbf7122");
      if (ctxPoint) {
        footprint(ctxPoint.cell.x, ctxPoint.cell.z, "#ffd166", "#ffd16633");
        drawPoly(disc3([ctxPoint.x, 0.02, ctxPoint.z], [1, 0, 0], [0, 0, 1], 0.12, 0.12, 12), "#ffd166", "#000a", 1);
      }
      // 재생 중 스피커 울림: 각 스피커의 소리 크기를 받아 바닥에 퍼지는 약한 원과 우퍼 떨림으로 보여 준다.
      let levels = null;
      try { levels = getSpeakerLevels ? getSpeakerLevels() : null; } catch (_) { levels = null; }
      for (const s of config.speakers) {
        const target = levels && isPlayingNow ? clamp((levels[s.id] || 0) * 7, 0, 1) : 0;
        const prev = speakerPulse.get(s.id) || 0;
        const next = target > prev ? prev + (target - prev) * 0.6 : prev + (target - prev) * 0.12;
        speakerPulse.set(s.id, next < 0.005 ? 0 : next);
        if (next > 0.02) {
          const ringR = 0.62 + 0.35 * next + 0.08 * Math.sin(performance.now() / 90);
          drawPoly(disc3([s.x, 0.012, s.z], [1, 0, 0], [0, 0, 1], ringR, ringR, 24), `rgba(126,162,255,${0.10 * next})`, `rgba(126,162,255,${0.45 * next})`, 1.5);
        }
      }
      for (const s of config.speakers) footprint(s.x, s.z, s.id === selectedId ? "#7ea2ffcc" : PAL.foot, null);
      if (dragGhost) footprint(dragGhost.x, dragGhost.z, dragGhost.ok ? "#2fbf71" : "#ff5a6a", dragGhost.ok ? "#2fbf7133" : "#ff5a6a33");
      const items = config.speakers.map((s, i) => ({ d: Math.hypot(s.x - eye[0], s.z - eye[2]), draw: () => drawSpeaker(s, i + 1) }));
      items.push({ d: Math.hypot(config.listener.x - eye[0], config.listener.z - eye[2]), draw: drawCharacter });
      items.sort((a, b) => b.d - a.d).forEach(it => it.draw());
      for (const s of config.speakers) {
        if (s.id === selectedId) outlineSpeaker(s, "#7ea2ff", 3);
        else if (s.id === hoverId) outlineSpeaker(s, "#ffd166", 3);
      }
      for (const w of walls.slice(2)) drawPoly(w.q, PAL.wallFront, PAL.wallFrontLine, 1.5);
      if (joy) {
        ctx.beginPath(); ctx.arc(joy.cx, joy.cy, 52, 0, TAU); ctx.fillStyle = PAL.joyFill; ctx.fill(); ctx.strokeStyle = PAL.joyLine; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(joy.cx + joy.x * 52, joy.cy + joy.y * 52, 22, 0, TAU); ctx.fillStyle = "#7ea2ffcc"; ctx.fill();
      }
    }

    // ---- 입력 ----
    const keys = new Set();
    const MOVE_KEYS = { w: "up", arrowup: "up", s: "down", arrowdown: "down", a: "left", arrowleft: "left", d: "right", arrowright: "right" };
    function editableTarget(el) {
      if (!el || !el.tagName) return false;
      const tag = el.tagName;
      return tag === "SELECT" || tag === "TEXTAREA" || (tag === "INPUT" && !["checkbox", "button", "radio"].includes(el.type));
    }
    let focused = false;
    document.addEventListener("pointerdown", e => {
      if (root.hidden) return;
      focused = root.contains(e.target);
      root.classList.toggle("sr-focus", focused && miniMode);
      if (!focused) keys.clear();
    }, true);
    const keyActive = () => !root.hidden && (!miniMode || focused);
    function onKeyDown(e) {
      if (!keyActive()) return;
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        if (!$("dialog").hidden) { $("dialogCancel").click(); return; }
        if (!ctxBox.hidden) { closeContextMenu(); return; }
        if (!dd.hidden) { closeDropdown(); return; }
        if (selectedId) { selectedId = null; renderMenu(); } else if (!miniMode) api.close();
        return;
      }
      if (!$("dialog").hidden) return;
      if ((e.key === " " || e.code === "Space") && transport && !editableTarget(e.target) && !e.repeat) {
        e.preventDefault();
        try { transport.togglePlay(); } catch (_) {}
        return;
      }
      const dir = MOVE_KEYS[String(e.key).toLowerCase()];
      if (!dir || e.ctrlKey || e.metaKey || e.altKey || editableTarget(e.target)) return;
      keys.add(dir); targetPoint = null;
      e.preventDefault();
    }
    function onKeyUp(e) {
      if (keyActive()) e.stopPropagation();
      const dir = MOVE_KEYS[String(e.key).toLowerCase()]; if (dir) keys.delete(dir);
    }
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", () => keys.clear());

    const canvasPoint = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    function hitSpeaker(pt) {
      let best = null, bestD = Infinity;
      for (const s of config.speakers) {
        const poly = speakerScreen(s);
        if (!poly || poly.length < 3 || !pointInPoly(pt, poly)) continue;
        const d = Math.hypot(s.x - eye[0], s.z - eye[2]);
        if (d < bestD) { bestD = d; best = s; }
      }
      return best;
    }
    canvas.addEventListener("pointerdown", e => {
      if (e.button > 2) return;
      canvas.setPointerCapture?.(e.pointerId);
      const pt = canvasPoint(e);
      const hit = hitSpeaker(pt);
      // 우클릭 메뉴가 떠 있을 때의 클릭은 메뉴만 닫는다(이동·선택 등은 하지 않음).
      if (!ctxBox.hidden) { closeContextMenu(); if (e.button !== 2) { e.preventDefault(); return; } }
      const info = { id: e.pointerId, type: e.pointerType, button: e.button, start: pt, last: pt, moved: false, mode: "orbit", speaker: null, offset: [0, 0], timer: 0, longPressed: false };
      if (hit && e.button === 0) {
        info.mode = "speaker"; info.speaker = hit;
        const g = groundPoint(pt[0], pt[1]);
        if (g) info.offset = [hit.x - g.x, hit.z - g.z];
      } else if (e.pointerType === "touch" && pt[0] < W * 0.5 && !joy) {
        info.mode = "joystick"; joy = { id: e.pointerId, cx: pt[0], cy: pt[1], x: 0, y: 0 };
      }
      if (e.pointerType === "touch") {
        info.timer = setTimeout(() => {
          if (!info.moved && pointers.get(info.id) === info) {
            info.longPressed = true;
            if (info.mode === "joystick") joy = null;
            if (info.mode === "speaker") { dragGhost = null; openSpeakerContextMenu(info.last, info.speaker); }
            else openContextMenu(info.last);
          }
        }, 550);
      }
      pointers.set(e.pointerId, info);
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", e => {
      const pt = canvasPoint(e);
      const info = pointers.get(e.pointerId);
      if (!info) { if (e.pointerType === "mouse") { const h = hitSpeaker(pt); hoverId = h ? h.id : null; canvas.style.cursor = h ? "grab" : "default"; } return; }
      const dx = pt[0] - info.last[0], dy = pt[1] - info.last[1];
      if (!info.moved && Math.hypot(pt[0] - info.start[0], pt[1] - info.start[1]) > 5) { info.moved = true; clearTimeout(info.timer); }
      if (info.longPressed) return;
      info.last = pt;
      if (info.mode === "orbit" && info.moved) {
        cam.yaw -= dx * 0.008;
        cam.pitch = clamp(cam.pitch + dy * 0.006, 0.22, 1.4);
      } else if (info.mode === "speaker" && info.moved) {
        const g = groundPoint(pt[0], pt[1]);
        if (!g) return;
        const p = SA.snapSpeaker(g.x + info.offset[0], g.z + info.offset[1], config.env, config.size);
        const ok = isFree(p.x, p.z, info.speaker.id);
        dragGhost = { x: p.x, z: p.z, ok };
        canvas.style.cursor = "grabbing";
        if (ok && (p.x !== info.speaker.x || p.z !== info.speaker.z)) { info.speaker.x = p.x; info.speaker.z = p.z; emit("speakers"); }
        if (selectedId !== info.speaker.id) { selectedId = info.speaker.id; renderMenu(); }
      } else if (info.mode === "joystick" && joy && joy.id === e.pointerId) {
        const vx = pt[0] - joy.cx, vy = pt[1] - joy.cy, len = Math.hypot(vx, vy);
        const k = len > 52 ? 52 / len : 1;
        joy.x = vx * k / 52; joy.y = vy * k / 52;
        if (len > 52) { joy.cx = pt[0] - vx / len * 52; joy.cy = pt[1] - vy / len * 52; joy.x = vx / len; joy.y = vy / len; }
        if (Math.hypot(joy.x, joy.y) > 0.15) targetPoint = null;
      }
    });
    function endPointer(e) {
      const info = pointers.get(e.pointerId);
      if (!info) return;
      pointers.delete(e.pointerId);
      clearTimeout(info.timer);
      if (info.mode === "joystick") { joy = null; }
      if (info.longPressed) { if (!pointers.size) canvas.style.cursor = "default"; return; }
      if (info.button === 2 && !info.moved && e.type === "pointerup" && info.mode === "orbit") {
        const hitSp = hitSpeaker(info.last);
        if (hitSp) openSpeakerContextMenu(info.last, hitSp); else openContextMenu(info.last);
        return;
      }
      if (info.mode === "orbit" && info.moved) save();
      if (info.mode === "speaker") {
        dragGhost = null;
        if (!info.moved) { selectedId = info.speaker.id; renderMenu(); }
        else save(true);
      } else if (!info.moved && e.type === "pointerup") {
        // 빈 곳 클릭/탭: 바닥이면 그 위치로 이동, 메뉴는 닫는다.
        const g = groundPoint(info.last[0], info.last[1]);
        if (selectedId) { selectedId = null; renderMenu(); }
        if (g) {
          const c = SA.clampToMap(g.x, g.z, config.env, config.size);
          const dx = g.x - c.x, dz = g.z - c.z;
          if (Math.hypot(dx, dz) < 1.5) targetPoint = c;
        }
      }
      if (!pointers.size) canvas.style.cursor = "default";
    }
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("pointerleave", e => { if (e.pointerType === "mouse" && !pointers.size) hoverId = null; });
    canvas.addEventListener("wheel", e => { cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.001), 4, 45); save(); e.preventDefault(); }, { passive: false });
    canvas.addEventListener("contextmenu", e => e.preventDefault());

    // ---- 바닥 우클릭(터치는 길게 누르기) 메뉴 ----
    let ctxPoint = null;
    const ctxBox = $("ctx");
    function openContextMenu(pt) {
      const g = groundPoint(pt[0], pt[1]);
      if (!g) return;
      const c = SA.clampToMap(g.x, g.z, config.env, config.size);
      if (Math.hypot(g.x - c.x, g.z - c.z) > 1.5) return;
      if (selectedId) { selectedId = null; renderMenu(); }
      ctxSpeakerId = null;
      ctxPoint = { x: c.x, z: c.z, cell: SA.snapSpeaker(c.x, c.z, config.env, config.size) };
      refreshBar();
      showContextBox(pt, "floor");
    }
    let ctxSpeakerId = null;
    function showContextBox(pt, mode) {
      for (const name of ["ctxMove", "ctxAdd", "ctxSep1", "ctxAutoLabel", "ctxSquare", "ctxCircle", "ctxFront", "ctxSep2", "ctxReset"]) $(name).hidden = mode !== "floor";
      $("ctxDelete").hidden = mode !== "speaker";
      $("ctxDelete").textContent = tr("remove");
      ctxBox.hidden = false;
      const bw = ctxBox.offsetWidth || 180, bh = ctxBox.offsetHeight || 80;
      ctxBox.style.left = `${clamp(pt[0] + 6, 4, W - bw - 4)}px`;
      ctxBox.style.top = `${clamp(pt[1] + 6, 4, H - bh - 4)}px`;
    }
    function openSpeakerContextMenu(pt, speaker) {
      ctxPoint = null; ctxSpeakerId = speaker.id;
      selectedId = speaker.id; renderMenu();
      showContextBox(pt, "speaker");
    }
    function closeContextMenu() { ctxBox.hidden = true; ctxPoint = null; ctxSpeakerId = null; }
    for (const [k, shape] of [["Square", "square"], ["Circle", "circle"], ["Front", "front"]]) {
      $(`ctx${k}`).addEventListener("click", () => { closeContextMenu(); autoArrange(shape); });
    }
    $("ctxReset").addEventListener("click", () => { closeContextMenu(); askReset(); });
    $("ctxDelete").addEventListener("click", () => {
      const id = ctxSpeakerId;
      closeContextMenu();
      if (!id) return;
      config.speakers = config.speakers.filter(sp => sp.id !== id);
      if (selectedId === id) selectedId = null;
      refreshBar(); renderMenu(); emit("speakers");
    });
    $("ctxMove").addEventListener("click", () => { if (ctxPoint) targetPoint = { x: ctxPoint.x, z: ctxPoint.z }; closeContextMenu(); });
    $("ctxAdd").addEventListener("click", () => {
      if (!ctxPoint || config.speakers.length >= SA.MAX_SPEAKERS) { closeContextMenu(); return; }
      const p = nearestFree(ctxPoint.cell.x, ctxPoint.cell.z, null);
      const speaker = { id: newId(), x: p.x, z: p.z, all: true, channels: [] };
      config.speakers.push(speaker);
      selectedId = speaker.id;
      closeContextMenu(); refreshBar(); renderMenu(); emit("speakers");
    });
    ctxBox.addEventListener("pointerdown", e => e.stopPropagation());

    // ---- 이동 루프 ----
    let raf = 0, last = 0, moving = false;
    function tryMove(dx, dz) {
      const L = config.listener;
      let nx = L.x + dx, nz = L.z;
      let c = SA.clampToMap(nx, nz, config.env, config.size); nx = c.x;
      if (config.speakers.some(s => hitsBody(nx, L.z, s)) && !config.speakers.some(s => hitsBody(L.x, L.z, s))) nx = L.x;
      let tz = L.z + dz;
      c = SA.clampToMap(nx, tz, config.env, config.size); tz = c.z; nx = c.x;
      if (config.speakers.some(s => hitsBody(nx, tz, s)) && !config.speakers.some(s => hitsBody(nx, L.z, s))) tz = L.z;
      const moved = Math.hypot(nx - L.x, tz - L.z);
      L.x = nx; L.z = tz;
      return moved;
    }
    function step(now) {
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
      let ix = 0, iy = 0; // iy: 앞(+)
      if (keys.has("up")) iy += 1; if (keys.has("down")) iy -= 1;
      if (keys.has("right")) ix += 1; if (keys.has("left")) ix -= 1;
      if (joy && Math.hypot(joy.x, joy.y) > 0.15) { ix += joy.x; iy -= joy.y; }
      let dirx = 0, dirz = 0, speedScale = 1;
      if (ix || iy) {
        const len = Math.hypot(ix, iy); speedScale = Math.min(1, len); ix /= len; iy /= len;
        const fwd = [-Math.sin(cam.yaw), -Math.cos(cam.yaw)], right = [Math.cos(cam.yaw), -Math.sin(cam.yaw)];
        dirx = fwd[0] * iy + right[0] * ix; dirz = fwd[1] * iy + right[1] * ix;
      } else if (targetPoint) {
        const vx = targetPoint.x - config.listener.x, vz = targetPoint.z - config.listener.z, len = Math.hypot(vx, vz);
        if (len < 0.06) targetPoint = null; else { dirx = vx / len; dirz = vz / len; speedScale = Math.min(1, len / (SPEED * dt)); }
      }
      const L = config.listener;
      if (dirx || dirz) {
        const want = Math.atan2(dirx, -dirz);
        let diff = ((want - L.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
        L.yaw += clamp(diff, -dt * 10, dt * 10);
        const moved = tryMove(dirx * SPEED * speedScale * dt, dirz * SPEED * speedScale * dt);
        if (targetPoint && moved < 1e-4) targetPoint = null;
        moving = true; emit("listener");
      } else if (moving) { moving = false; save(true); }
      // 카메라가 캐릭터를 부드럽게 따라간다.
      const k = 1 - Math.exp(-dt * 10);
      cam.tx += (L.x - cam.tx) * k; cam.tz += (L.z - cam.tz) * k;
      render();
      updateTransport();
    }

    // 페이지가 가로로 넘치는 모바일에서도 화면에 보이는 영역(visualViewport)에 맞춘다.
    function applyMiniRect() {
      const vw = window.innerWidth, vh = window.innerHeight;
      const r = miniRect || {};
      const w = clamp(Number(r.w) || 400, 260, Math.max(260, vw - 8)), h = clamp(Number(r.h) || 320, 220, Math.max(220, vh - 8));
      const left = clamp(Number.isFinite(Number(r.x)) ? Number(r.x) : vw - w - 16, 0, Math.max(0, vw - w));
      const top = clamp(Number.isFinite(Number(r.y)) ? Number(r.y) : vh - h - 16, 0, Math.max(0, vh - h));
      root.style.inset = "auto"; root.style.right = root.style.bottom = "auto";
      root.style.left = `${left}px`; root.style.top = `${top}px`; root.style.width = `${w}px`; root.style.height = `${h}px`;
    }
    // 크기 조절·창 크기 변경 뒤에도 창 전체가 화면 안에 있도록 맞춘다.
    function keepMiniInside() {
      if (!miniMode || root.hidden) return;
      const vw = window.innerWidth, vh = window.innerHeight;
      let b = root.getBoundingClientRect();
      if (b.width > vw) root.style.width = `${vw}px`;
      if (b.height > vh) root.style.height = `${vh}px`;
      b = root.getBoundingClientRect();
      root.style.left = `${clamp(b.left, 0, Math.max(0, vw - b.width))}px`;
      root.style.top = `${clamp(b.top, 0, Math.max(0, vh - b.height))}px`;
    }
    function rememberMiniRect() {
      if (!miniMode || root.hidden) return;
      keepMiniInside();
      const b = root.getBoundingClientRect();
      if (b.width < 50) return;
      miniRect = { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) };
      saveView();
    }
    function setMiniMode(next) {
      if (miniMode && !next) rememberMiniRect();
      miniMode = !!next;
      root.classList.toggle("sr-focus", false);
      if (!miniMode) { root.style.right = root.style.bottom = ""; root.style.inset = ""; root.style.left = root.style.top = root.style.width = root.style.height = root.style.maxWidth = root.style.maxHeight = ""; }
      else applyMiniRect();
      closeContextMenu();
      refreshBar(); resize(); saveView();
    }
    $("viewMode").addEventListener("click", () => setMiniMode(!miniMode));
    // 좁은 화면에서 상단 메뉴는 한 줄을 유지하고, 넘치는 부분은 휠(세로 휠도 가로로)로 넘겨 본다.
    const barMain = root.querySelector(".sr-bar-main");
    barMain.addEventListener("wheel", e => {
      if (barMain.scrollWidth <= barMain.clientWidth) return;
      barMain.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      e.preventDefault();
    }, { passive: false });
    const bar = root.querySelector(".sr-bar");
    bar.addEventListener("pointerdown", e => {
      if (!miniMode || e.button !== 0 || e.target.closest("button,input,label,select")) return;
      const b = root.getBoundingClientRect();
      const ox = e.clientX - b.left, oy = e.clientY - b.top;
      bar.setPointerCapture?.(e.pointerId);
      const move = ev => {
        const rb = root.getBoundingClientRect();
        root.style.left = `${clamp(ev.clientX - ox, 0, Math.max(0, window.innerWidth - rb.width))}px`;
        root.style.top = `${clamp(ev.clientY - oy, 0, Math.max(0, window.innerHeight - rb.height))}px`;
      };
      const up = () => { bar.removeEventListener("pointermove", move); bar.removeEventListener("pointerup", up); bar.removeEventListener("pointercancel", up); rememberMiniRect(); };
      bar.addEventListener("pointermove", move); bar.addEventListener("pointerup", up); bar.addEventListener("pointercancel", up);
      e.preventDefault();
    });
    // 모서리로 크기를 키울 때도 화면 오른쪽·아래 밖으로 나가지 않게 최대 크기를 현재 위치 기준으로 묶는다.
    root.addEventListener("pointerdown", () => {
      if (!miniMode) return;
      const b = root.getBoundingClientRect();
      root.style.maxWidth = `${Math.max(260, window.innerWidth - b.left)}px`;
      root.style.maxHeight = `${Math.max(220, window.innerHeight - b.top)}px`;
    }, true);
    // CSS resize(오른쪽 아래 모서리)로 바뀐 크기도 기억한다.
    root.addEventListener("pointerup", () => { if (miniMode) setTimeout(rememberMiniRect, 0); });
    function fitViewport() {
      if (miniMode) {
        const b = root.getBoundingClientRect();
        if (!root.style.left || b.width < 50) applyMiniRect();
        else keepMiniInside();
        return;
      }
      const vv = window.visualViewport;
      if (vv && vv.width > 0 && Math.abs(vv.width - window.innerWidth) > 1) {
        root.style.inset = "auto";
        root.style.left = `${vv.offsetLeft}px`; root.style.top = `${vv.offsetTop}px`;
        root.style.width = `${vv.width}px`; root.style.height = `${vv.height}px`;
      } else {
        root.style.inset = ""; root.style.left = root.style.top = root.style.width = root.style.height = "";
      }
    }
    function resize() {
      fitViewport();
      const r = stage.getBoundingClientRect();
      DPR = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    }
    let resizeObserver = null;
    if (typeof ResizeObserver === "function") { resizeObserver = new ResizeObserver(resize); resizeObserver.observe(stage); }
    window.addEventListener("resize", resize);
    window.addEventListener("pagehide", () => save(true));
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);

    // 앱의 언어 전환(html lang 변경)을 따라 글자를 다시 쓴다.
    try {
      new MutationObserver(() => { refreshBar(); renderMenu(); lastT = {}; onVisibility(!root.hidden); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    } catch (_) {}

    const api = {
      open() {
        if (!root.hidden) return;
        root.hidden = false;
        if (miniMode) applyMiniRect();
        refreshBar(); renderMenu(); resize();
        cam.tx = config.listener.x; cam.tz = config.listener.z;
        last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(step);
        onVisibility(true);
      },
      close() {
        if (root.hidden) return;
        rememberMiniRect(); closeContextMenu(); $("dialog").hidden = true;
        root.hidden = true; keys.clear(); joy = null; pointers.clear(); targetPoint = null; dragGhost = null;
        cancelAnimationFrame(raf); raf = 0; save(true);
        onVisibility(false);
      },
      toggle() { root.hidden ? api.open() : api.close(); },
      isOpen: () => !root.hidden,
      isMini: () => miniMode,
      setMini: value => setMiniMode(value),
      isEnabled: () => config.enabled === true,
      setEnabled(value) { config.enabled = !!value; refreshBar(); emit("enabled"); },
      getConfig: clone,
      getListener: () => ({ ...config.listener }),
      refresh() { refreshBar(); renderMenu(); },
      text: tr,
      // 시작 시 한 번 호출해서 저장된 설정을 오디오 엔진에 반영한다.
      emitAll() { onChange(clone(), "init"); onListener({ ...config.listener }); },
    };
    refreshBar();
    return api;
  }

  window.MobibardSpatialRoom = Object.freeze({ version: "1.0.0", create, text: TEXT });
})();
