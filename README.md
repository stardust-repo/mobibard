# 모비바드 v5.2

마지막 갱신: 2026-08-30 KST


모비바드는 브라우저에서 실행되는 음악 파일 변환·MML 생성·피아노롤 편집·리듬게임 도구 모음입니다. 이 문서는 저장소 전체에 공통 적용된 구조와 이번 갱신에서 영향을 받은 프로젝트만 요약합니다. 각 제품의 현재 구현 상태는 해당 폴더의 `README.md`를 기준으로 확인합니다.

## 공통 적용 사항

- 루트 `plugins/`에는 여러 제품이 공유하는 코드만 남겼습니다. 제품 전용 연결부는 각 제품의 `js/` 폴더로 이동했습니다.
- 공용 기능은 `common`, 파일·음원 규격 처리는 `formats`, Google·Firebase 연동은 `google`로 구분했습니다.
- `.mid`, `.midi`, `.kar`는 하나의 공용 MIDI 포맷으로 처리하며 KAR의 가사·텍스트 메타 이벤트도 공용 MIDI 파서 결과에 보존합니다.
- PlayStation 계열은 PS1 `.seq`·`.sep`, PS2 `.sq`·`.bq`와 PSF1/PSF2 xSF 컨테이너를 공용 MIDI로 정규화합니다. Sony SEQ/SQ의 전용 Bank Select는 별도 VAB/HD/BD 음색 파일 없이도 GM SoundFont에서 재생되도록 Bank 0으로 정규화하고, 채널 10의 비표준 타악기 Key는 GM 타악기 영역으로 재배치합니다. PSF 컨테이너는 내부의 표준 MIDI·Sony SEQ·PS2 SQ·SquareSoft AKAO v1.0/v2를 탐색하며, AKAO v1.0/v2의 12개 드럼 슬롯도 GM 타악기로 변환합니다. 이미 표준 MIDI로 내장된 데이터는 원래 Bank/Program을 보존합니다. MiniPSF의 외부 라이브러리나 게임 고유 드라이버가 필요한 경우에는 단독 파일만으로 변환이 제한될 수 있습니다. PSFLIB/PSF1LIB/PSF2LIB 및 NCSFLIB/2SFLIB 같은 의존 라이브러리는 사용자 연주파일 선택 목록에는 표시하지 않습니다.
- Nintendo 계열은 DS `.sseq`·`.ssar`·`.sdat`, Wii `.brseq`·`.rseq`·`.brsar`, 3DS `.bcseq`·`.cseq`·`.bcsar`, Wii U/Switch `.bfseq`·`.fseq`·`.bfsar`와 DS xSF `.2sf`·`.ncsf` 계열을 처리합니다. SDAT은 INFO의 SSEQ↔SBNK 연결을 따라가 Drumset을 GM 타악기로, PSG Wave를 GM Square Lead로, PSG Noise를 GM 타악기로 정규화합니다. 별도 악기 Bank를 얻을 수 없는 독립 SSEQ/NintendoWare 시퀀스는 원본 Program 번호를 GM Bank 0의 안정적인 대체 음색으로 사용하며 의미를 임의 추측하지 않습니다. NCSF/2SF도 복원 가능한 SDAT/SSEQ에 같은 규칙을 적용합니다.
- Classic Mac의 MacBinary 컨테이너 처리를 공용 유틸리티로 통합했습니다. 옛 바이너리 연주 파일과 SF2·SF3·DLS에서 Data Fork·Resource Fork 및 MacBinary II 보조 헤더를 공통으로 판별합니다.
- 공용 변환 진입점뿐 아니라 MIDI/KAR, Finale MUS, Guitar Pro 3/5, VSQ, SF2/SF3/DLS의 직접 파서 API도 동일한 Classic Mac 전처리를 사용합니다.
- `.bin`·`.macbin` 선택을 허용하며, 확장자가 없는 Classic Mac 파일은 MacBinary 내부 파일명과 MIDI·Finale MUS·Guitar Pro 바이너리 시그니처를 사용해 실제 형식을 찾습니다.
- MIDI 바이트 해석, Program·Bank 정규화와 기본 멜로디 채널 계산을 공용 MIDI 계층으로 통합했습니다.
- 포맷 정규화 정책은 `plugins/formats/NORMALIZATION_RULES.md`에 기록합니다. 원본에서 확실히 얻을 수 있는 Tempo·Velocity·Volume·Expression·Pan·Program/Bank·Drum 정보는 해당 포맷의 단위와 의미에 맞춰 MIDI로 변환하며, 값과 의미를 모두 유추할 수 없는 경우에만 Tempo는 120 BPM, 강약은 MIDI Velocity 96(약 75%)을 사용합니다. Velocity·CC7·CC11은 MIDI 단계에서는 분리해 보존하고 단일 강약값이 필요한 MML/Editor 단계에서만 한 번 합성합니다.
- Simple·Player·Editor는 같은 공용 1/64 겹침 판정 규칙을 사용합니다. 서로 다른 시작점의 순차 노트가 64분음표 1개 이하만 겹치고, 선행 노트를 경계에서 잘라도 최소 1/64 길이가 남을 때만 비겹침으로 취급합니다. 같은 시작점의 화음이나 선행 노트가 1/64보다 짧아질 상황은 예외 처리하지 않습니다. Simple과 Player는 항상 적용하고 Editor는 파일 불러오기 체크박스로 같은 규칙의 ON/OFF만 선택하며 기본값은 체크 상태입니다.
- 음가·음높이·조표·박자 등 악보 포맷 사이에서 반복되던 계산을 공용 기보 유틸리티로 통합했습니다.
- 압축 해제, XML 해석, 바이트 변환 등 포맷별로 중복되던 기반 기능은 공용 유틸리티를 사용합니다.
- Finale·Guitar Pro·보컬 포맷의 확장자별 중복 등록 스크립트를 포맷군별 단일 등록 파일로 정리했습니다.
- SF2·SF3·DLS 해석과 샘플 준비는 공용 SoundBank 계층을 사용합니다. 네 제품의 `assets/default_sf3.js`에는 `FluidR3Mono_GM_compact.sf3`가 내장되며 저작권·MIT 라이선스는 `assets/licenses/FluidR3Mono_GM_LICENSE.md`에 보존합니다. Compact 음원은 사용자 제공 FluidR3Mono_GM.sf3의 샘플 구조를 유지하고 Ogg Vorbis VBR q=0으로 재인코딩한 경량 기본 음원입니다.
- MUSX, MNX, MSCZ, MSCX 입력을 추가했습니다. 각 형식은 표준 MIDI로 정규화된 뒤 동일한 공용 MIDI 파서를 사용합니다.
- 배포에 사용되지 않는 Guitar Pro 개발 소스와 테스트 전용 코드·샘플은 최종 패키지에서 제외했습니다.
- 지원 파일 팝업의 제목을 버튼과 같은 `지원 파일`로 통일하고, 글꼴의 × 문자를 사용하던 닫기 버튼을 중앙 정렬된 SVG 아이콘으로 교체했습니다.
- 로컬 파일 선택은 공용 그룹형 파일 선택기를 사용합니다. 지원 환경에서는 `지원 파일` 전체 필터와 MIDI·KAR, XMI·HMP·HMI, Tracker(MOD/S3M/XM/IT), MusicXML, MNX, Finale, MuseScore, Guitar Pro, PlayStation, Nintendo, Sega, VOCALOID, UTAU, OpenUtau, Synthesizer V, CeVIO, 프로젝트·MML, SoundFont·DLS 등의 필터를 빠르게 전환할 수 있습니다. Classic Mac은 별도 카테고리로 표시하지 않고 전체 또는 관련 옛 포맷군에서 `.bin`·`.macbin`을 선택한 뒤 내부 데이터를 자동 판별합니다.
- 그룹형 파일 선택 API가 없는 환경에서는 기존 `accept` 기반 파일 입력으로 자동 대체됩니다.
- 지원 파일 팝업은 성격별로 `표준 음악 · 악보`, `음악 편집기`, `콘솔`, `보컬 편집기`, `프로젝트 · MML`, `오디오`로 구분합니다. MIDI·XMI/HMP/HMI·Tracker·MusicXML·MNX는 표준 음악·악보에, Finale·MuseScore·Guitar Pro는 음악 편집기에, PlayStation·Nintendo·Sega는 콘솔에 배치합니다. 보컬 편집기는 VOCALOID, UTAU, OpenUtau, Synthesizer V, CeVIO를 제품군별로 분리하고 같은 제품의 확장자만 한 카드에 묶습니다. Finale와 Guitar Pro의 묶음 카드에도 실제 MIDI 변환 범위와 단순화되는 정보를 표시합니다.
- 공용 Guest 아이콘은 자체 배경이 없는 사람 실루엣만 포함하며, 각 제품의 계정 버튼이 배경과 hover 상태를 담당합니다.
- 공용 재생 컨트롤 아이콘은 `assets/icons/play.svg`, `assets/icons/stop.svg`, `assets/icons/first.svg`, `assets/icons/last.svg`를 사용하며 Simple·Player·Editor가 동일한 SVG 자산을 공유합니다.
- Player는 별도 스킨 계층 없이 `player/styles.css`와 `player/js/app.js`만 사용하며 현재 출시 UI와 기능 코드가 이 두 파일에 통합되어 있습니다.
- 공용 MML 최적화기에 템포 정리를 추가했습니다. 사용자 안내는 `선행 템포와의 편차가 5 미만인 템포들을 삭제합니다.`로 단순화했습니다. Simple과 Player는 동일한 판정 규칙을 사용하며, Player의 자동 선행 무음용 T120은 템포 정리의 음악적 최저·최고/선행 템포 판정에서 제외합니다.
- Simple과 Player의 화면 제목은 제품명과 버전 표시를 분리하고, 버전 글씨를 제목 글씨의 정확히 절반 크기로 표시합니다. Player 계정 버튼은 모든 화면 폭과 상호작용 상태에서 38×38 정사각형으로 통일하고, 테마 변경 버튼에는 Simple과 같은 `◐` 표식을 사용합니다.

## 변경된 프로젝트

| 프로젝트 | v5.2 UI 기준 |
|---|---|
| Simple | 최대 3채널 간편 변환, Player와 동일한 전체 화면 MobiBeats 연동, 명확한 처음 이동 아이콘, 본문 `지원 음악 파일 → MML` 문구 제거 |
| Player | 새 입력 시 하부 작업 초기화, MIDI 최초 채널 자동 적용, draft 재생 미리보기, 저장/복사 미적용 경고, 실제 편집 후에만 마지막 상태 기록/복원, 악기/채널 옵션 UI 및 모바일 정렬 최종 정비 |
| Editor | 기존 피아노롤 편집/공용 포맷 입력/1/64 겹침 옵션 유지. 최종 UI 패스 기능 변경 없음 |
| MobiBeats | Player와 Simple 모두 동일한 iframe postMessage 프로토콜로 현재 MML을 전달 |
| RollScriptor | 피아노 롤 영상의 흰·검 건반 색상 변화를 브라우저에서 프레임 단위로 분석해 MIDI로 변환 |
| VeloScriptor | MIDI와 동일 연주 음원의 음계별 Attack 세기를 비교해 Note On Velocity만 다시 계산 |

## 공용 플러그인 구조

```text
plugins/
  common/       여러 제품이 공유하는 일반 기능
  formats/      MIDI, PlayStation·Nintendo 게임 시퀀스, 악보 파일, Guitar Pro, 보컬, SF2·SF3·DLS 처리
  google/       Google Drive, 로그인, Firebase 설정·분석
```

제품 전용 코드는 다른 제품이 직접 참조하지 않습니다. 두 제품 이상에서 필요해지면 공용 계층으로 승격한 뒤 함께 사용합니다.

## 문서 운영 기준

- 제품 버전과 저장소 공통 변경 사실은 이 루트 문서에서만 관리합니다.
- `simple/`, `player/`, `editor/`, `mobibeats/`의 README는 해당 갱신 시점의 구현 스펙 스냅샷입니다.
- 제품 README에는 누적 변경 이력이나 제품 버전 번호를 남기지 않습니다.
- 매 수정마다 버전을 올리지 않으므로 각 README의 마지막 갱신 시각으로 수정 전후를 구분합니다.

- 콘솔 가져오기는 PlayStation SEQ/SEP·PS2 SQ/BQ와 PSF1/PSF2의 지원 가능한 내장 MIDI/SEQ/SQ/AKAO v1.0/v2, Nintendo SSEQ/SDAT·NintendoWare 시퀀스와 NCSF/2SF의 내장 SDAT/SSEQ, Sega Saturn SEQ 및 Mega Drive/Genesis XGM/XGM2, VGM/VGZ, GYM, S98 사운드칩 로그를 공용 MIDI로 정규화합니다. 전용 콘솔 Bank/드럼 번호는 가능한 범위에서 GM Bank 0 및 GM percussion으로 재배치하여 일반 SoundFont에서 바로 미리듣기 가능하게 하며, 포맷만으로 악기 의미를 알 수 없는 경우에는 거짓 악기 분류 대신 안정적인 GM Program proxy를 사용합니다. Mini xSF의 외부 라이브러리나 게임 고유 드라이버가 필요한 경우에는 단독 파일만으로 변환이 제한될 수 있습니다.
