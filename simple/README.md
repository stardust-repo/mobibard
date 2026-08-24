# Simple 구현 스펙 스냅샷

마지막 갱신: 2026-08-23 KST  
출시 기준: 이 README와 현재 배포 소스

## 목적

연주 파일을 복잡한 설정 없이 최대 3개 MML 채널로 변환하고, 결과를 재생·복사·로컬/Google Drive에 저장하는 간편 생성기입니다.

## 입력과 변환

- MIDI/KAR, XMI/HMP/HMI, Tracker(MOD/S3M/XM/IT), PlayStation/Nintendo/Sega 시퀀스, MusicXML/MNX/Finale/MuseScore/Guitar Pro, VOCALOID/UTAU/OpenUtau/Synthesizer V/CeVIO 계열을 공용 포맷 계층으로 처리합니다.
- `.bin`·`.macbin` Classic Mac 컨테이너는 내부 형식을 공용 계층이 자동 판별합니다.
- 공용 MIDI→MML 변환기로 최대 3채널을 생성합니다.
- 공용 1/64 겹침 허용 규칙과 템포 정리를 사용합니다.
- 양자화, 쉼표 제거, MML 분할/복사, 기본 SoundFont 미리듣기를 제공합니다.

## 화면

- 제목은 `MML 간편 생성기 v5.1`입니다.
- 과거 `지원 음악 파일 → MML` 안내 문구는 표시하지 않습니다.
- 파일 영역은 `지원 파일 / 로컬 파일 / 구글 파일 / 붙여넣기`로 구성합니다.
- 제목 영역에는 `모비비트 / 상세 모드` 버튼을 둡니다.
- 620px 이하에서는 모드 버튼 행을 제목 위에 배치합니다.
- `처음으로`는 재생 위치를 곡 시작으로 되돌리는 의미가 명확한 아이콘 버튼입니다.
- 추천 링크는 Player와 같은 상단 구조를 사용하며 좁은 화면에서도 메뉴가 한 줄을 유지합니다.

## MobiBeats 연동

`모비비트` 버튼은 페이지 이동 링크가 아니라 Player와 같은 전체 화면 레이어를 엽니다.

- 현재 생성된 MML을 `MML_RHYTHM_LOAD`로 `../mobibeats/` iframe에 전달합니다.
- MML이 없으면 실행하지 않고 안내합니다.
- 레이어를 열 때 Simple 재생은 정지합니다.
- READY/LOADED/ERROR 메시지로 로딩 상태를 표시합니다.
- MobiBeats의 CLOSE 메시지 또는 `생성기로 돌아가기` 버튼으로 닫습니다.
- `모비비트` 버튼은 `상세 모드`와 동일한 기본 모드 버튼 스타일을 사용합니다.

## 저장과 설정

- 전체 MML 복사, 로컬 텍스트 저장, Google Drive `MML_Mobibard` 폴더 저장을 지원합니다.
- 한국어/일본어/영어/중국어 간체·번체를 지원합니다.
- 밝은/어두운 테마를 지원합니다.
- 계정/Google 상태와 작업 완료 메시지는 화면 하단 토스트를 사용합니다.

## 주요 의존성

```text
plugins/common/
plugins/formats/
plugins/google/
simple/js/playback.js
assets/default_sf3.js
../mobibeats/
```


## 추가 변환 설정
- 페이드 인 / 페이드 아웃: 각각 0 / 1 / 2 / 4초, 0이면 미적용
- 페이드 인은 첫 실제 발음 노트부터 시작하며, 페이드 아웃은 마지막 실제 발음 노트 시작이 V1이 되도록 적용
- 상단 지원 파일 옆 튜토리얼 버튼에서 불러오기 → 옵션 → 재생 → 복사 흐름을 확인할 수 있음
