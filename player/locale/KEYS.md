# Locale key convention

언어 파일의 `strings` 키는 짧은 `영역.이름` 형식을 사용합니다. 문장 전체를 키로 만들지 않습니다.

```text
player.play
drive.save_done
drive.save_fail
google.login_fail
snd.preset_saved
mml.opt_fail
```

- 키는 보통 1~3개의 짧은 단어로 작성합니다.
- 상태는 `done`, `fail`, `wait`, `missing`, `unsupported`처럼 짧게 표현합니다.
- 같은 의미의 변형만 `_2`, `_3`으로 구분합니다.
- 번역 원문과 전체 키 목록은 각 언어 파일을 직접 확인합니다.
- 이 문서는 실행 중 다운로드되지 않습니다.

## Namespaces

| Namespace | Keys |
|---|---:|
| `accomp` | 19 |
| `account` | 3 |
| `aria` | 7 |
| `audio` | 1 |
| `auth` | 2 |
| `cfg` | 7 |
| `dls` | 4 |
| `drive` | 48 |
| `edit` | 2 |
| `err` | 19 |
| `file` | 11 |
| `game` | 15 |
| `gen` | 2 |
| `google` | 27 |
| `lang` | 7 |
| `lead` | 3 |
| `midi` | 63 |
| `mml` | 112 |
| `msg` | 75 |
| `part` | 6 |
| `pitch` | 20 |
| `play` | 3 |
| `player` | 2 |
| `rest` | 6 |
| `roll` | 5 |
| `sf2` | 5 |
| `simple` | 2 |
| `snd` | 52 |
| `sound` | 4 |
| `split` | 11 |
| `st` | 13 |
| `tempo` | 13 |
| `theme` | 3 |
| `tpl` | 3 |
| `ui` | 134 |
| `vol` | 42 |
| `xml` | 17 |

Total: **768** keys.
