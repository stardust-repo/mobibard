마비노기 모바일 악보 웹 테스트

1. 마비노기 모바일 실행 + 캐릭터 접속
2. 게임 설정에서 MM AI Agent Activation ON
3. start_bridge.cmd 실행
4. index.html을 HTTPS 사이트에 업로드
5. 웹에서 '앱 접근 승인 및 연결 확인' 클릭
6. 브라우저가 localhost/loopback 접근 권한을 물으면 허용
7. '악보 목록 불러오기' 클릭

웹페이지는 EXE를 직접 실행하지 않습니다.
브라우저 승인으로 허용되는 것은 HTTPS 사이트 -> 127.0.0.1 브리지 통신입니다.
브리지는 127.0.0.1:17891 에만 열리며 읽기 전용 API 2개만 노출합니다:
- /api/status
- /api/music-scores

악보 API는 MabinogiMobile_CLI.exe get_music_scores 를 호출합니다.
