# MobiBeats 구현 스펙 스냅샷

마지막 갱신: 2026-08-19 11:58:00 KST

## 목적

MML 또는 MIDI 연주 정보를 받아 4키·5키·6키 리듬 차트를 자동 생성하고 브라우저에서 즉시 플레이하는 정적 웹 리듬게임입니다.

## 입력과 차트 생성

- MML 문자열 또는 최대 6개 MML 파트 배열을 받습니다.
- `midiBytes`, `midiBuffer`, `midiData`로 전달된 표준 MIDI·KAR 바이트를 받습니다.
- MIDI와 KAR는 공용 MIDI 파서에서 해석하며 가사·텍스트 메타 이벤트도 공용 결과에 보존합니다.
- MIDI 악기 그룹이 6개를 넘으면 음표 수가 많은 6개 그룹을 우선 유지하고 나머지는 부하가 가장 적은 파트에 병합합니다.
- 제목, 악기 목록, 키 수, 난이도와 노트 오프셋을 함께 전달할 수 있습니다.
- 4키 `D F J K`, 5키 `D F SPACE J K`, 6키 `S D F J K L` 구성을 지원합니다.
- EASY, NORMAL, HARD 난이도와 0.75×부터 2.00×까지의 노트 접근 배속을 지원합니다.

## 판정과 재생

- 판정은 Perfect, Great, Good, Miss이며 콤보·점수·진행률·곡 시간을 표시합니다.
- 장노트, 키보드, 포인터·터치 입력, 일시정지·재시작·전체 화면을 지원합니다.
- SF2·SF3·DLS와 `assets/default_sf3.js`에 내장된 `FluidR3Mono_GM_compact.sf3`를 공용 SoundBank 계층에서 사용합니다.
- `window.MobiBeats.loadSoundBank()`로 사용자 SoundBank를 교체할 수 있으며 Classic Mac MacBinary 컨테이너도 공용 계층에서 처리합니다.
- 음원 해석에 실패하면 Web Audio 간이 신시사이저로 전환합니다.
- 제품 전용 공용 모듈 연결부는 `mobibeats/js/runtime.js`입니다.

## 공용 에셋과 배포

- favicon과 HUD 브랜드 아이콘은 루트 `assets/`를 사용합니다.
- 저장소 루트의 공용 에셋과 플러그인을 상대 경로로 참조하므로 루트 구조를 함께 배포합니다.
- 필수 공용 의존성은 `assets/`, `assets/licenses/`, `plugins/common/`, `plugins/formats/midi/`, `plugins/formats/soundbank/`입니다.

## 부모 페이지 연동

수신 메시지: `MML_RHYTHM_LOAD`, `LOAD_RHYTHM_SCORE`, `MML_RHYTHM_SCORE`, `MML_RHYTHM_OPEN`

송신 메시지: `MML_RHYTHM_READY`, `MML_RHYTHM_LOADED`, `MML_RHYTHM_ERROR`, `MML_RHYTHM_RESULT`, `MML_RHYTHM_CLOSE`

직접 호출 API:

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

- MML 곡 정보와 악기·키·난이도 설정은 localStorage에 저장합니다.
- MIDI 원본 바이트는 중복 저장하지 않습니다.
- 노트 판정 오프셋은 기기 환경 설정으로 별도 저장합니다.
