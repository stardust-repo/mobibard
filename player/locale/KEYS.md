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
| `audio` | 12 |
| `auth` | 2 |
| `cfg` | 9 |
| `confirm` | 2 |
| `drive` | 51 |
| `edit` | 5 |
| `err` | 23 |
| `file` | 19 |
| `game` | 15 |
| `google` | 24 |
| `lang` | 2 |
| `midi` | 13 |
| `mml` | 58 |
| `msg` | 121 |
| `part` | 6 |
| `pitch` | 16 |
| `play` | 3 |
| `player` | 2 |
| `roll` | 4 |
| `snd` | 88 |
| `st` | 26 |
| `tempo` | 10 |
| `theme` | 3 |
| `tpl` | 20 |
| `ui` | 191 |
| `vol` | 36 |
| `xml` | 6 |

Total: **767** keys.
