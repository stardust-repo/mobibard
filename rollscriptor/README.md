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

검출 기준과 임계값은 유지하면서 분석 경로만 최적화했습니다. 분석 프레임 전체를 CPU로 읽지 않고 흰/검 건반 검출선 주변의 얇은 두 영역만 읽으며, 프레임 특징을 영상 전체 길이만큼 저장한 뒤 다시 처리하지 않고 디코딩 즉시 동일한 판정 로직으로 Note On/Off를 생성합니다. 프레임 건너뛰기, 시간축 보정, 검출 임계값 변경은 사용하지 않습니다.

