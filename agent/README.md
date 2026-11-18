# agent/
코드를 실행할 수 있는 AI가 MobiBard 변환 기능을 쓰는 꾸러미(Node 18+, 설치·네트워크 불필요). 사용법은 `AGENT_GUIDE.md`, 기능 목록은 `capabilities.json`.
- `run.mjs` CLI / `api.js` 요청 처리 / `lib/` 사이트와 같은 모듈 복사본(`lib/manifest.json` 순서대로 로드)
- 모듈을 고치면 `lib/`에 같은 파일을 다시 복사해야 합니다. 검증: `node run.mjs midi-to-mml 샘플.mid --print`
