# RollScriptor

모비바드의 피아노 롤 영상 → MIDI 변환 제품입니다.

## 흐름

1. 로컬 동영상 파일을 선택하거나 드롭합니다.
2. 건반 방향을 수평/수직으로 선택하고 흰 건반/검은 건반 검출선을 실제 건반 위치에 맞춥니다.
3. 건반이 눌리지 않은 프레임에서 건반을 검출해 기준색을 확정합니다.
4. 첫 건반 검출 때 88건반이 보이는 시작/종료 시간을 한 번 자동 탐색하며, 이후 분석 시간의 `자동 탐색` 버튼으로 다시 찾을 수 있습니다. 노트 확장 프레임, BPM, Velocity를 설정하고 영상을 분석합니다.
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

분석 프레임 전체를 CPU로 읽지 않고 흰/검 건반 검출선 주변의 얇은 두 영역만 읽으며, 디코딩 즉시 Note On/Off를 생성합니다. 2026-08-30 조정에서는 건반 검출 시점의 각 건반 3개 샘플 색상을 고정 기준으로 저장하고, 이후 모든 프레임의 같은 샘플을 OKLab 색 벡터로 변환해 기준색과의 유클리드 거리를 비교합니다. Hue/무채색/밝기 규칙은 별도로 사용하지 않습니다. 검정↔흰색에 가까운 OKLab 전체 거리를 100%로 환산하고, 흰 건반과 검은 건반의 변화 임계값은 UI에서 각각 설정하며 기본값은 흰 건반 30%, 검은 건반 50%입니다. 3개 샘플 중 하나라도 해당 건반 타입의 임계값 이상 변하면 건반 상태가 바뀐 것으로 판정합니다. 프레임 건너뛰기나 자동 시간축 보정은 사용하지 않습니다. 단, 노트 확장 옵션을 1프레임 이상으로 설정하면 같은 건반의 실제 검출 구간 앞뒤에 있는 미검출 프레임만 지정 수만큼 확장합니다. 확장끼리 겹치면 후행 노트의 선행 확장을 우선하고, 원래 분리 검출된 두 노트는 절대 하나로 합치지 않습니다.



## UI additions (2026-08-29)
- Localized product name (KO/JA; English name retained for EN/ZH).
- Recommended video requirements shown at upload: 720p+, 30fps+, 88 keys, minimal key-covering effects/noise.
- Warning for videos below 720p or nominal 30fps.
- Four-page tutorial dialog with Previous/Next navigation and page indicators.

## 마지막 작업 복원

- 마지막으로 연 RollScriptor 영상 파일을 브라우저 IndexedDB에 보관하고, 다음 방문 시 영상 선택 영역에 `파일명 복원` 버튼을 표시합니다.
- 복원 시 건반 인식선, 흰/검 건반 변화량, 분석 범위, BPM/Velocity, 건반 검출 상태와 완료된 분석 노트를 함께 되살립니다.
- 건반 검출 상태는 저장된 기준 프레임에서 다시 검출하여 현재 디코더/프레임과 일치하는 기준색을 재구성합니다.
- 영상과 복원 데이터는 브라우저 로컬 저장소에만 저장됩니다. 브라우저 저장 공간이 부족하거나 IndexedDB를 사용할 수 없는 환경에서는 복원 데이터가 남지 않을 수 있습니다.


## 검출선 모드

- **2선 모드(기본)**: 흰 건반과 검은 건반에 각각 별도 검출선을 둡니다.
- **1선 모드**: 흰/검 건반이 같은 평면의 스트립으로 그려진 영상용입니다. 한 검출선에서 88건반(A0~C8)을 연속으로 검출하고 같은 선에서 모든 건반의 색상을 샘플링합니다.

- In 1-line mode, if key boundaries cannot be found reliably, the selected guide span is divided into 88 equal estimated regions and the UI marks the result as estimated. Vertical orientation now starts with the guide spanning the full video height.


## 노트 확장

- 기본값은 `0프레임`(사용 안 함)입니다.
- 같은 건반에서 실제로 검출된 노트의 앞/뒤에 연속된 미검출 프레임만 설정한 수만큼 확장합니다.
- 선행 노트의 후행 확장과 후행 노트의 선행 확장이 만나거나 겹치면 후행 노트가 해당 구간을 우선 사용합니다.
- 확장으로 빈 구간이 모두 채워져도 원래 따로 검출된 두 노트는 MIDI에서도 별개의 Note On/Off로 유지합니다.


## 영상 정보 표시
- 영상 선택 영역에서 파일명과 함께 해상도, FPS, 주사 방식(p/i)을 표시합니다.
- AVC/H.264는 SPS의 frame_mbs_only_flag를 사용해 p/i를 판별하며, VP8/VP9/AV1은 progressive로 표시합니다. 판별할 수 없는 코덱은 p/i 확인 불가로 표시합니다.


## 분석 시간 자동 탐색

- `건반 검출`이 완료된 뒤에만 `자동 탐색` 버튼이 활성화됩니다.
- 영상 앞쪽에서는 88건반이 안정적으로 확인되는 첫 프레임을, 뒤쪽에서는 마지막 프레임을 찾아 분석 시작/종료 시간에 설정합니다.
- 2선 모드는 52개 흰 건반 경계와 88건반 매핑을 확인하고, 1선 모드는 실제 88경계 또는 흰/검 스트립 대비를 함께 확인합니다. 1선의 단순 88등분 fallback만으로 영상 전체를 건반 구간으로 오인하지 않습니다.
- 새 영상을 연 뒤 첫 번째 성공한 건반 검출에서만 자동 탐색을 한 번 실행합니다. 이후 재검출에서는 사용자가 정한 분석 시간을 유지하며 필요하면 `자동 탐색` 버튼을 직접 누릅니다.

## 새 영상 선택 시 설정 초기화

복원 기능이 아닌 일반 파일 선택으로 새 영상을 열면 이전 영상의 설정을 가져가지 않습니다. 검출 모드/방향, 흰·검 건반 변화량, 분석 시간, 노트 확장, BPM, Velocity, 검출 결과와 MIDI 결과를 새 영상 기준 기본값으로 초기화합니다. 마지막 작업 `복원`을 선택한 경우에만 저장된 설정을 되살립니다.


### 2026-08-30 auto range refinement
- 재생 중 현재 검출 표시가 중간 placeholder로 되돌아가며 깜빡이던 현상을 제거했습니다.
- 분석 시간 자동 탐색은 88건반 존재 여부뿐 아니라 건반 검출 기준 프레임과의 OKLab 외형 유사도를 함께 사용하며, 페이드 인/아웃 구간에서는 더 안정적인 내부 지점으로 보정합니다.
