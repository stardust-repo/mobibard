# MobiBeats 구현 스펙 스냅샷

마지막 갱신: 2026-08-23 KST  
출시 기준: 이 README와 현재 배포 소스

## 목적

MML 또는 MIDI 연주 정보를 받아 4키·5키·6키 리듬 차트를 자동 생성하고 브라우저에서 플레이하는 정적 웹 리듬게임입니다.

## 입력과 차트

- MML 문자열 또는 최대 6개 MML 파트 배열을 받습니다.
- `midiBytes`, `midiBuffer`, `midiData`로 전달된 MIDI/KAR 바이트를 받습니다.
- MIDI 악기 그룹이 6개를 넘으면 음표 수가 많은 그룹을 우선 유지하고 나머지는 부하가 적은 파트로 병합합니다.
- 제목, 악기 목록, 키 수, 난이도, 노트 오프셋을 함께 전달할 수 있습니다.
- 4키 `D F J K`, 5키 `D F SPACE J K`, 6키 `S D F J K L`을 지원합니다.
- EASY/NORMAL/HARD와 노트 접근 배속을 지원합니다.

## 판정과 재생

- Perfect/Great/Good/Miss, 콤보, 점수, 진행률, 곡 시간을 표시합니다.
- 장노트, 키보드, 포인터/터치, 일시정지/재시작/전체 화면을 지원합니다.
- 기본 SoundFont는 공용 `assets/default_sf3.js`를 사용하고 실패 시 Web Audio 간이 신시사이저로 대체할 수 있습니다.

## Player/Simple 부모 연동

Player와 Simple은 모두 페이지 이동 대신 전체 화면 iframe으로 MobiBeats를 열며 같은 메시지 프로토콜을 사용합니다.

수신:

```text
MML_RHYTHM_LOAD
LOAD_RHYTHM_SCORE
MML_RHYTHM_SCORE
MML_RHYTHM_OPEN
```

송신:

```text
MML_RHYTHM_READY
MML_RHYTHM_LOADED
MML_RHYTHM_ERROR
MML_RHYTHM_RESULT
MML_RHYTHM_CLOSE
```

Simple은 현재 3채널 MML을 기본 프리셋 배열과 함께 전달하고, Player는 현재 6채널 MML과 선택된 악기 프리셋을 전달합니다.

## 직접 호출 API

```text
window.MobiBeats.loadScore(data)
window.MobiBeats.loadMidi(bytes, options)
window.MobiBeats.parseMidi(bytes, options)
window.MobiBeats.loadSoundBank(source, options)
window.MobiBeats.start()
window.MobiBeats.pause()
window.MobiBeats.resume()
window.MobiBeats.getChartInfo()
window.MobiBeats.getScoreData()
```

## 저장

- MML 곡 정보와 악기/키/난이도 설정은 localStorage에 저장할 수 있습니다.
- MIDI 원본 바이트는 중복 저장하지 않습니다.
- 판정 오프셋은 별도 환경 설정으로 저장합니다.
