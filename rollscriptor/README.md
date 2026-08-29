# RollScriptor

모비바드의 피아노 롤 영상 → MIDI 변환 제품입니다.

## 흐름

1. 로컬 동영상 파일을 선택하거나 드롭합니다.
2. 영상 위 흰 건반/검은 건반 검출선을 드래그해 실제 건반 위치에 맞춥니다.
3. 분석 시작/종료 시간, 왼쪽 끝 흰 건반, BPM, Velocity를 설정합니다.
4. 영상을 분석하고 결과를 재생 위치와 함께 확인합니다.
5. MIDI 파일을 다운로드합니다.

## 구조

- `index.html` — 제품 페이지
- `styles.css` — RollScriptor UI 스타일
- `js/` — 영상 디코딩, 건반 검출, 분석, MIDI 생성, UI/언어 관리
- `locale/` — `ko`, `ja`, `en`, `zh-CN`, `zh-TW` 다국어 리소스

언어 선택은 다른 모비바드 제품과 동일한 `mobibard.player.language` 설정을 공유합니다. `?lang=ko`, `?lang=ja`, `?lang=en`, `?lang=zh-CN`, `?lang=zh-TW` 쿼리도 지원합니다.

영상 프레임 디코딩, 건반 색상 분석, 노트 생성, MIDI 생성은 브라우저 클라이언트에서 처리합니다. WebCodecs가 필요하므로 HTTPS 또는 localhost 환경과 최신 Chromium 계열 브라우저를 권장합니다.

Mediabunny 1.55.3은 현재 CDN에서 런타임 로드합니다. 영상 파일 자체는 Mediabunny CDN이나 별도 분석 서버로 업로드하지 않습니다.


## Settings menu

The RollScriptor settings panel is initialized independently from the video/WebCodecs application. Language and theme controls therefore remain available even if media initialization fails. Language changes are applied immediately through the locale modules and persisted with the shared Mobibard language key; theme changes use the shared Mobibard theme key.
## 분석 최적화

분석 프레임 전체를 CPU로 읽지 않고 흰/검 건반 검출선 주변의 얇은 두 영역만 읽으며, 디코딩 즉시 Note On/Off를 생성합니다. 2026-08-29 조정에서는 RGB 벡터 방향을 이용한 밝기 불변 중심색 판정을 추가했습니다. 같은 색이 단순히 밝아지거나 어두워진 경우는 눌림으로 보지 않으며, 강한 bloom 아래의 검은 건반은 가까운 검은 건반들의 밝기 변화와 비교해 실제 키만 국소적인 변화인지 한 번 더 확인합니다. 프레임 건너뛰기나 시간축 보정은 사용하지 않습니다.



## UI additions (2026-08-29)
- Localized product name (KO/JA; English name retained for EN/ZH).
- Recommended video requirements shown at upload: 720p+, 30fps+, 88 keys, minimal key-covering effects/noise.
- Warning for videos below 720p or nominal 30fps.
- Compact four-step tutorial dialog.
