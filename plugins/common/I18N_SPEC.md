# MobiBard 공용 i18n 스펙

이 문서는 MobiBard 전 제품의 locale key, 초기 언어 결정, 화면 적용 순서를 정의합니다. 새 제품과 기존 제품 수정 모두 이 규칙을 우선 적용합니다.

## 1. Locale key 규칙

- **key는 영어 ASCII 식별자만 사용합니다.** 한국어·일본어·중국어 등 실제 표시 문장을 key로 사용하지 않습니다.
- 기본 형식은 `area.concept` 또는 `area.concept_detail`입니다. 필요할 때만 3단계 정도로 확장합니다.
- 예: `file.open`, `channel.merge`, `note.volume`, `mml.export`, `soundbank.default`, `editor.drive.save_fail`.
- key는 기능 설명 문장을 그대로 옮기지 않습니다. 짧고 구분 가능한 명사/동작 중심으로 작성합니다.
- 새 key는 소문자 영문, 숫자, `_`, `.`만 사용합니다. 정규식 기준은 `^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$`입니다.
- 같은 의미의 공용 문구는 기존 key를 재사용합니다. 단지 번역 문장이 조금 다르다는 이유만으로 긴 새 key를 만들지 않습니다.
- 각 언어 locale은 **동일한 key 집합**을 가져야 합니다. 특정 언어에만 key를 추가하지 않습니다.
- `ko` locale도 반드시 유지합니다. 한국어는 key가 아니라 하나의 정상적인 locale 값이며, Editor처럼 한국어 fallback 본문을 semantic key와 연결하는 기준 catalog로도 사용할 수 있습니다.

금지 예:

```text
"MML 내보내기": "Export MML"
"저장되지 않은 변경사항이 있습니다. 정말 새 파일을 만들까요?": "..."
```

권장 예:

```text
"mml.export": "Export MML"
"project.confirm_new": "..."
```

## 2. 페이지 초기 언어 적용 우선순위

언어 결정은 일반 앱 초기화보다 먼저 실행합니다. 목적은 번역 깜빡임뿐 아니라 페이지/분석 수집기가 locale 적용 전의 key 또는 잘못된 언어 본문을 먼저 수집하는 시간을 최소화하는 것입니다.

초기 우선순위는 다음과 같습니다.

1. URL의 `lang`, `language`, `locale` 고정 지시
2. 공용 저장 설정 `mobibard.player.language`
3. 마이그레이션 대상 legacy 저장값
4. `navigator.languages` / `navigator.language`
5. 기본값 `ko`

가능한 제품에서는 `<head>`의 첫 초기화 스크립트가 위 값을 결정하고 `document.documentElement.lang`을 즉시 설정합니다. 선택 locale은 Firebase Analytics, 앱 본문, 기타 일반 기능 스크립트보다 먼저 준비합니다.

## 3. 초기 렌더링과 수집기 대응

- HTML의 실제 본문에는 `menu.file` 같은 key 문자열을 표시용 텍스트로 넣지 않습니다.
- 정적 UI는 `data-i18n="file.open"`처럼 semantic key를 속성에 두고, 태그 본문에는 기본 locale의 읽을 수 있는 fallback 문구를 둡니다.
- 선택 locale 적용이 끝나기 전에는 필요 시 `data-i18n-pending` 상태로 본문 표시를 지연합니다.
- Firebase Analytics 등 자동 페이지 정보를 수집할 수 있는 기능은 `MobibardI18n.ready` 이후 초기화하는 것을 원칙으로 합니다.
- 브라우저 제목처럼 통계 차원을 만들 수 있는 값은 제품/곡명처럼 자주 변하는 값이 아니라 프로젝트에서 정한 고정 브랜드 규칙을 사용합니다.

## 4. 동적 UI 문구

새 동적 UI는 표시 문장을 직접 번역 key로 넘기지 않습니다.

```js
MobibardI18n.t("channel.merge")
MobibardI18n.t("mml_export.page_label", [page])
```

Editor의 기존 한국어 fallback 문구를 위한 값→key 역매핑은 과거 코드 호환용입니다. **새 기능은 반드시 `t(semanticKey)`를 사용**합니다. 역매핑을 이유로 한국어 문장 key를 locale에 다시 추가해서는 안 됩니다.

## 5. 검증 규칙

- locale 로더는 key 정규식을 검사하고 잘못된 key가 있으면 locale 오류로 처리합니다.
- 배포 전 모든 언어의 `strings` / `patterns` key 집합이 같은지 확인합니다.
- locale key에 한글·일본어·중국어·공백·문장부호가 들어간 항목이 0개인지 확인합니다.
- `data-i18n*` 및 `MobibardI18n.t()`에서 참조하는 key가 모든 locale에 존재하는지 확인합니다.
