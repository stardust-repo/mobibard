# RollScriptor

모비바드의 피아노 롤 영상 → MIDI 변환 제품입니다.

## 흐름

1. 로컬 동영상 파일을 선택하거나 드롭합니다.
2. 건반 방향을 수평/수직으로 선택하고 흰 건반/검은 건반 검출선을 실제 건반 위치에 맞춥니다.
3. 건반이 눌리지 않은 프레임에서 건반을 검출해 기준색을 확정합니다.
4. 분석 시작/종료 시간, BPM, Velocity를 설정하고 영상을 분석합니다.
5. 재생 위치와 현재 검출 코드를 확인한 뒤 MIDI 파일을 다운로드합니다.

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

분석 프레임 전체를 CPU로 읽지 않고 흰/검 건반 검출선 주변의 얇은 두 영역만 읽으며, 디코딩 즉시 Note On/Off를 생성합니다. 2026-08-30 조정에서는 건반 검출 시점의 각 건반 3개 샘플 색상을 고정 기준으로 저장하고, 이후 모든 프레임의 같은 샘플을 OKLab 색 벡터로 변환해 기준색과의 유클리드 거리를 비교합니다. Hue/무채색/밝기 규칙은 별도로 사용하지 않습니다. 검정↔흰색에 가까운 OKLab 전체 거리를 100%로 환산하고, 흰 건반과 검은 건반의 변화 임계값은 UI에서 각각 설정하며 기본값은 흰 건반 30%, 검은 건반 50%입니다. 3개 샘플 중 하나라도 해당 건반 타입의 임계값 이상 변하면 건반 상태가 바뀐 것으로 판정합니다. 프레임 건너뛰기나 시간축 보정은 사용하지 않습니다.



## UI additions (2026-08-29)
- Localized product name (KO/JA; English name retained for EN/ZH).
- Recommended video requirements shown at upload: 720p+, 30fps+, 88 keys, minimal key-covering effects/noise.
- Warning for videos below 720p or nominal 30fps.
- Four-page tutorial dialog with Previous/Next navigation and page indicators.
