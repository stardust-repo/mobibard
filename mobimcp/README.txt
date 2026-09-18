마비노기 모바일 악보 웹 테스트 v2

기존 버전의 HTTPS GitHub Pages -> localhost fetch가 브라우저에서 실패하는 경우를 위해
두 가지 방식을 제공합니다.

[필수]
1. 마비노기 모바일 실행
2. 캐릭터 접속
3. 게임 설정에서 MM AI Agent Activation ON
4. start_bridge_v2.cmd 실행
5. GitHub Pages의 index.html을 이 버전으로 교체

[방식 1]
"브라우저 권한 방식 테스트"
- Chrome Local Network Access를 통해
  https://stardust-repo.github.io -> http://127.0.0.1:17891 로 fetch
- 브라우저 환경에 따라 권한창이 뜰 수 있음

[방식 2 - 권장 fallback]
"팝업 방식으로 악보 불러오기"
- 사용자의 버튼 클릭으로 localhost 브리지 페이지를 새 창으로 직접 염
- 로컬 브리지가 MabinogiMobile_CLI.exe get_music_scores 실행
- 결과를 window.postMessage로 GitHub Pages에 전달
- cross-origin fetch / CORS / LNA 직접 요청에 의존하지 않음

브리지는 127.0.0.1에만 바인딩됩니다.
relay 결과는 https://stardust-repo.github.io 로만 보낼 수 있게 제한했습니다.
