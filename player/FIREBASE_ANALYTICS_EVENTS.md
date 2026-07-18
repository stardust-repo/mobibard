# 모비바드 Firebase Analytics 이벤트

이 문서는 `js/app.js`에서 `trackAnalytics()`로 전송하는 사용자 정의 이벤트를 정리합니다.

- Analytics 초기화: `js/firebase-analytics.js`
- Firebase 설정: `js/firebase-config.js`
- 이벤트는 Firebase 초기화 전에도 최대 100개까지 대기열에 보관됩니다.
- 적용·저장·복사 이벤트는 작업이 성공한 뒤에만 전송합니다.
- 파일명, MML 본문, Google Drive 파일 ID, 접근 토큰, 원본 음원 내용은 전송하지 않습니다.
- 아래 목록은 앱이 직접 호출하는 사용자 정의 이벤트 28개입니다. Firebase의 자동 수집 이벤트인 `page_view`, `session_start`, `first_visit` 등은 별도입니다.

## 핵심 도구·편집 이벤트

| 이벤트명 | 발생 시점 | 주요 매개변수 | 설명 |
|---|---|---|---|
| `rest_trim_apply` | 쉼표 삭제가 실제 적용된 뒤 | `limit`, `selected_channel_count` | 삭제 기준과 적용 채널 수를 기록합니다. |
| `bulk_volume_adjust` | 볼륨 조절이 실제 적용된 뒤 | `delta`, `selected_channel_count` | 볼륨 증감값과 적용 채널 수를 기록합니다. |
| `bulk_pitch_adjust` | 음정 조절이 실제 적용된 뒤 | `octaves`, `selected_channel_count` | 옥타브 증감값과 적용 채널 수를 기록합니다. |
| `tempo_edit` | 슬라이더 또는 피아노롤에서 템포 수정이 성공한 뒤 | `before_bpm`, `after_bpm` | 수정 전후 BPM을 기록합니다. |
| `leading_silence_apply` | 시작 공백이 실제 적용된 뒤 | `seconds`, `removed_seconds` | 설정한 시작 공백과 제거된 기존 공백을 기록합니다. |
| `dynamics_generate_apply` | 강약 생성이 완료된 뒤 | `genre`, `strength`, `selected_channel_count`, `processed_channel_count`, `generated_v_count`, `overwrite_existing`, `overwritten_channel_count` | 선택한 장르·강도와 처리 채널 수, 생성한 V 명령 수, 기존 강약 교체 여부를 기록합니다. |
| `genre_arrange_apply` | 장르 편곡이 완료된 뒤 | `genre`, `strength`, `melody_part`, `chord_count` | 장르, 강도, 멜로디 채널, 생성 코드 구간 수를 기록합니다. |
| `copy_all_mml` | 전부복사가 성공한 뒤 | `channel_count` | 전체 복사 사용과 복사 채널 수를 기록합니다. |
| `split_copy_open` | 나눠복사 창을 열 때 | 없음 | 나눠복사 기능 진입을 기록합니다. |
| `preview_split_page` | 나눠진 악보 미리듣기를 시작할 때 | 없음 | 나눠복사 결과를 실제로 확인했는지 기록합니다. |
| `copy_split_page` | 나눠진 악보 한 페이지 복사가 성공한 뒤 | 없음 | 나눠복사 결과를 실제로 가져갔는지 기록합니다. |
| `playback_start` | 메인 MML 재생을 시작할 때 | `channel_count` | 실제 재생 실행과 현재 악보 채널 수를 기록합니다. |

`paste_mml`, 재생 시작 위치, 나눠복사 페이지 번호처럼 기능 성과와 직접 관계가 적은 정보는 기록하지 않습니다.

## MIDI 추출 기능·패키지 이벤트

| 이벤트명 | 발생 시점 | 주요 매개변수 | 설명 |
|---|---|---|---|
| `open_midi_extract_dialog` | MIDI 추출 팝업을 열 때 | 없음 | MIDI 추출 기능을 확인한 횟수를 기록합니다. |
| `download_muscriptor_package` | Windows 또는 macOS 패키지 링크를 누를 때 | `platform` | 어떤 운영체제 패키지를 다운로드했는지 기록합니다. |

샘플 영상, 입력 오디오, 출력 MIDI 미리듣기 재생은 실제 기능 사용과 구분하기 어려워 기록하지 않습니다.

## 로컬 파일 불러오기·저장 이벤트

| 이벤트명 | 발생 시점 | 주요 매개변수 | 설명 |
|---|---|---|---|
| `local_import_midi` | 로컬 MIDI 분석이 성공한 뒤 | `file_type`, `file_size`, `instrument_groups`, `note_count` | MIDI 파일의 형식·크기 구간·악기 그룹·음표 수를 기록합니다. |
| `local_import_musicxml` | 로컬 MusicXML 분석이 성공한 뒤 | `file_type`, `file_size`, `instrument_groups`, `note_count` | MusicXML/MXL 분석 정보를 기록합니다. |
| `local_import_mml` | 로컬 MML·TXT·MMI·3MLE 불러오기가 성공한 뒤 | `file_type`, `file_size`, `channel_count` | 텍스트 악보 형식·크기 구간·채널 수를 기록합니다. |
| `local_save_mml` | 로컬 파일 저장 또는 다운로드가 시작된 뒤 | `channel_count` | 로컬 저장 기능 사용과 저장 채널 수를 기록합니다. |

`file_size`는 원본 크기가 아니라 `lt_10kb`, `lt_100kb`, `lt_1mb`, `lt_10mb`, `gte_10mb`, `unknown` 중 하나로 기록합니다.

## Google Drive 이벤트

| 이벤트명 | 발생 시점 | 주요 매개변수 | 설명 |
|---|---|---|---|
| `google_drive_login` | Google 로그인과 설정 적용이 성공한 뒤 | `settings_source` | 설정을 `drive` 또는 `local` 중 어디에서 적용했는지 기록합니다. |
| `google_drive_picker_open` | Google 파일 선택창이 열린 뒤 | 없음 | Drive Picker 사용을 기록합니다. |
| `drive_import_midi` | Drive MIDI 분석이 성공한 뒤 | `file_type`, `instrument_groups`, `note_count` | Drive MIDI 분석 정보를 기록합니다. |
| `drive_import_musicxml` | Drive MusicXML 분석이 성공한 뒤 | `file_type`, `instrument_groups`, `note_count` | Drive MusicXML 분석 정보를 기록합니다. |
| `drive_import_mml` | Drive MML·TXT·MMI·3MLE·Google Docs 불러오기가 성공한 뒤 | `file_type`, `channel_count` | Drive 텍스트 악보 불러오기 사용을 기록합니다. |
| `drive_save_mml` | Drive 저장이 성공한 뒤 | `create_new`, `channel_count` | 새 파일 생성 여부와 저장 채널 수를 기록합니다. |

로그아웃 동작은 기능 이용 성과와 직접 관련이 없어 기록하지 않습니다.

## MIDI·MML 미리듣기와 변환 이벤트

| 이벤트명 | 발생 시점 | 주요 매개변수 | 설명 |
|---|---|---|---|
| `preview_mml_start` | MMI/3MLE 가져오기 창에서 MML 미리듣기를 시작할 때 | `scope`, `channel_count` | `selected`, `all`, `channel` 중 어떤 범위로 들었는지 기록합니다. |
| `preview_midi_start` | MIDI/MusicXML 변환 창에서 미리듣기를 시작할 때 | `scope`, `source_type`, `export_channels` | `selected`, `export_channel`, `source_file`, `instrument` 중 어떤 미리듣기인지 기록합니다. 적용되지 않는 매개변수는 생략합니다. |
| `midi_convert_complete` | MIDI/MusicXML→MML 변환이 성공한 뒤 | `source_type`, `export_channels`, `instrument_groups`, `optimized_chars` | 원본 종류, 출력 채널 수, 악기 그룹 수, 최적화 절약 문자를 기록합니다. |

여러 미리듣기 동작은 이벤트명을 나누지 않고 `scope` 매개변수로 구분해 Firebase 보고서에서 한 번에 비교할 수 있게 했습니다.

## 외부 링크 이벤트

| 이벤트명 | 발생 시점 | 주요 매개변수 | 설명 |
|---|---|---|---|
| `shortcut_link_open` | 상단 바로가기 링크를 열 때 | `link` | 개발자 MML 공유 또는 MIDI 자료 사이트 식별자를 기록합니다. |

같은 클릭을 중복 집계하던 `midi_resource_link_open`은 제거하고 `shortcut_link_open.link` 값으로만 구분합니다.

## 주요 매개변수

- `scope`: 같은 기능 안에서 사용한 범위 또는 미리듣기 종류
- `channel_count`: 비어 있지 않은 MML 채널 수
- `selected_channel_count`: 도구를 적용한 채널 수
- `octaves`: 음정 조절에 적용한 옥타브 증감값
- `genre`, `strength`: 장르 편곡 또는 강약 생성에 사용한 장르와 변형 강도
- `generated_v_count`: 강약 생성으로 추가한 V 명령 수
- `overwrite_existing`, `overwritten_channel_count`: 기존 강약을 확인 후 교체했는지와 교체한 채널 수
- `before_bpm`, `after_bpm`: 템포 수정 전후의 BPM
- `source_type`: `midi`, `musicxml` 등 현재 원본 종류
- `file_type`: 확장자 또는 `google_docs`
- `create_new`: 새 Drive 파일 생성 여부
- `optimized_chars`: 변환 최적화로 줄어든 문자 수
- `platform`: `windows` 또는 `macos`

## 이벤트 추가 원칙

새 이벤트는 팝업 내부의 단순 UI 조작보다 다음 단계 중 하나를 확인할 때 우선 추가합니다.

1. 사용자가 실제 기능을 열었는가
2. 실행·재생·미리듣기를 했는가
3. 적용·변환·저장이 성공했는가
4. 결과를 복사하거나 다운로드했는가

```js
trackAnalytics("event_name", {
  parameter_name: value
});
```
