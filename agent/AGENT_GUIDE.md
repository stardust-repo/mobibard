# MobiBard agent 가이드 (AI용)

MobiBard(https://stardust-repo.github.io/mobibard/)는 마비노기 MML(악보) 제작 도구입니다. 이 `agent/` 폴더는 **코드를 실행할 수 있는 AI**가 사용자 대신 파일을 변환하고 결과물(MML, MMI, MIDI)을 돌려주기 위한 꾸러미입니다.
Node 18 이상만 있으면 되고 설치와 네트워크는 필요 없습니다. 서버나 브라우저를 쓰지 않습니다.

## 0. 이 방법을 쓸 수 있는지 먼저 확인 (AI가 스스로 판단)

아래 순서로 확인하세요. 하나라도 "아니오"면 이 방법은 쓸 수 없으니 "사용할 수 없을 때"로 가세요.

1. 나는 셸 명령이나 코드를 실행할 수 있는가? (아니오 → 사용할 수 없음)
2. `node -v` 가 18 이상으로 나오는가?
3. 꾸러미를 가져올 수 있는가? 우선 `git clone https://github.com/stardust-repo/mobibard` 시도. 안 되면 사용자가 zip을 첨부했는지 확인하고, 없으면 사용자에게 `mobibard-agent.zip` 첨부를 요청한다.
4. `node agent/run.mjs selftest` 가 `"ok": true` 로 끝나는가?

모두 통과하면 사용자에게 "변환해 드릴 수 있어요"라고 말하고 시작하세요.

### 사용할 수 없을 때
사용자에게 이유를 한 줄로 알리고(예: "저는 코드를 실행할 수 없어요" / "저장소를 받을 수 없어요") 아래 중 하나를 안내하세요. 결과를 지어내지 마세요.
- 코드 실행이 가능한 AI 환경에서 이 안내(URL)를 다시 주고 요청하기
- 직접 쓰기: https://stardust-repo.github.io/mobibard/simple/ (쉬운 변환), https://stardust-repo.github.io/mobibard/player/ (변환·재생·정리)
- 환경에서 파일 다운로드만 막힌 경우: 사용자가 `mobibard-agent.zip`(저장소 `agent/` 폴더를 압축한 파일)을 첨부

## 1. 받기

- `git clone https://github.com/stardust-repo/mobibard` 후 `agent/` 폴더 사용 (`git clone --depth 1 --filter=blob:none --sparse ... && git sparse-checkout set agent` 도 가능)
- 또는 사용자가 `mobibard-agent.zip`을 첨부하면 압축을 풀어 사용
- 확인: `node agent/run.mjs help`

## 2. 사용자와의 흐름

1. 사용자가 파일을 주고 "mid나 mml로 바꿔줘"라고 한다. **우선 기본값으로 바로 실행해서 결과를 준다.**
   - MIDI → MML 기본: `node agent/run.mjs midi-to-mml 곡.mid --out out --print`
2. 결과를 보여 주고 요약한다(채널별 악기·노트 수·글자 수, 경고). 사용자가 묻는 대로 **옵션을 바꿔 다시 실행**한다. 사용자가 "뭘 할 수 있어?" 또는 "지원 확장자는?"이라고 하면 아래 3, 4번과 `node agent/run.mjs capabilities` / `formats` 결과로 답한다.
3. 결과물은 파일(`--out` 폴더)로 전달하고, MML이 짧으면 본문에도 붙인다. 긴 곡은 채널당 2400자를 넘기 쉬우므로 `edit-mml --op split-pages`를 제안한다.
4. **AI는 소리를 들을 수 없다.** 음악적 평가는 사용자가 하게 하고, 숫자와 경고만 사실대로 전한다.

## 3. 지원하는 입력 / 출력

| 구분 | 확장자 |
|---|---|
| 입력 MIDI | .mid .midi .kar |
| 입력 MML | .mml .txt (`MML@...;`) |
| 입력 MMI | .mmi (MabiIcco) |
| 입력 에디터 프로젝트 | .mmlproj.json (MIDI로 바뀐 뒤 midi-to-mml에 사용) |
| 출력 | MML(.mml), MMI(.mmi, `--mmi`), MIDI(.mid, mml-to-midi) |

**지원하지 않음**: 오디오(mp3, wav) → MIDI 전사는 모델 실행이 필요해서 안 됩니다. 사용자가 사이트(simple/player)에서 MIDI로 전사한 뒤 MIDI를 주도록 안내하세요. MusicXML, MuseScore, Guitar Pro, 게임 시퀀스도 이 꾸러미에서는 제외입니다(`unsupported-format` 오류).

## 4. 명령과 옵션

| 명령 | 하는 일 | 주요 옵션 |
|---|---|---|
| `inspect <파일>` | 내용 보기. MIDI는 악기 그룹 id 목록 포함 | |
| `midi-to-mml <mid>` | MIDI → 최대 6채널 MML | `--channels 1~6`(기본 3) `--main 1~3` `--trust instrument\|balance\|context` `--main-inst auto\|piano\|harp\|lute\|folkGuitar\|mandolin\|violin\|flute\|chalumeau\|harmonica\|catHarmonica\|xylophone\|musicBox` `--rows auto,cymbal,bigdrum,...` `--groups <inspect의 id,...>` `--quantize 64\|32` `--volume pop\|jazz\|ballad\|bossa\|rock\|funk\|classical` `--strength light\|normal\|strong` `--optimize` |
| `optimize-mml <mml\|mmi>` | 글자 수 줄이기 | |
| `generate-volume <mml\|mmi>` | 볼륨 새로 생성 | `--volume <장르>` `--strength` `--overwrite` |
| `edit-mml <mml\|mmi> --op ...` | 다듬기 | `--args '{...}'` (아래) |
| `analyze-mml <mml\|mmi>` | 채널별 노트·글자 수·길이·문제 점검 | |
| `mml-to-midi <mml\|mmi>` | MML → MIDI | `--instruments piano,flute,...`(채널별) |

`edit-mml` 작업(`--op`)과 `--args`:
`transpose {"delta":1}` · `set-volume {"volume":10}` · `adjust-volume {"delta":-1}` · `simplify-volume {"maxDelta":1}` · `fade {"fadeInSeconds":2,"fadeOutSeconds":4}` · `simplify-tempo {"bpmThreshold":5}` · `trim-short-rests {"denom":32}` · `add-leading-silence {"beats":4}` · `split-pages {"maxChars":2400}`(채널당 글자 수 한도, 결과는 페이지별 파일).

공통: `--out <폴더>`(기본 `./out`), `--mmi`(MMI도 출력), `--print`(MML을 stdout에 출력), `--mmi-track <번호>`(MMI 입력에서 쓸 트랙), `--json 요청.json`(여러 단계 `steps`를 한 번에, `capabilities.json`의 conventions.request 참고).
stdout에는 `{ok, report, files, error}` JSON 하나가 나옵니다.

## 5. 선택지를 안내할 때

사용자가 취향을 말하면 옵션으로 옮기세요.
- "베이스를 더 또렷하게" → `--rows` 와 `--main-inst`, `--channels` 조정
- "악기를 기록대로" → `--trust instrument`, "음 흐름으로 판단" → `--trust context`
- "글자 수 줄여줘" → `--optimize` 또는 `optimize-mml`, 32분음표 단위로 거칠게 → `--quantize 32`
- "강약 자연스럽게" → `--volume <장르> --strength <세기>`
- "특정 악기만" → `inspect`로 악기 그룹 id를 확인하고 `--groups`

## 6. 오류

`{ok:false, error:{code,message}}` — `no-file`, `unsupported-format`, `wrong-input`(예: MIDI에 optimize-mml), `no-mml`, `unknown-capability`, `crash`. 메시지를 사용자에게 그대로 전하지 말고 원인과 다음 행동으로 풀어 주세요.

## 7. 한계

- 마비노기 MML: 최대 6채널, 볼륨 V0~V15, N 코드는 o4 c = N48.
- 오디오 전사, 악보 형식 변환은 지원하지 않습니다(3번 참고).
- 결과의 소리 품질은 확인할 수 없습니다.
