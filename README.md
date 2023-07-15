- Nodejs 설치
node-v16.8.0-x64 파일로 설치하기 

- 실행방법
run.bat 파일 실행
* node_modules 폴더가 없을 시 첫번째 실행 시 패키지를 설치하기 때문에  다시 한번 실행해 주어야 합니다.

- 종료방법
Ctrl + c

│>> Progress : 0.59%  // 설정한 분(min) 데이터 수집 완료 진행률입니다 (60분 설정시, 60분동안 수집합니다)

- release note 

v1.0 : 최초배포
v1.1 : 업비트 BTC 마켓 거래대금 계산 식 오류 수정, 전일대비 변동률 추가
v1.2 : BTC 마켓 현재가격 버그 수정
v1.3 : 마켓 명 추가 및 스크롤 기능 추가(방향키 위/아래)
v1.4 : 시작시간, 현재시간 표시 추가
v1.5 : 이전 1초, 다음 1초에 거래대금이 1억 증가하면 Volume Up 표시, 절대값 변동률이 1.0 상승하면 ChgRate Up 표시
v1.6 : 랭크업 이벤트 추가 (3위 이상 올라가면 발생) , 이벤트 값 표시 (거래대금 : 1억 1천만원 -> 1.1B) , 변동률 표시
v1.7 : UI 최적화, 시장 전체 거래량 추가
v1.8 : 마켓 필터 기능 추가 1. 전체 , 2. KRW, 3. BTC
v1.9 : UI 갱신 주기 1초->50ms 변경 , 거래량 이벤트 조건 설정기능 추가 , (ex) 설정값:2 인경우 1초만에 2000만원의 거래대금이 발생되었을 때 Event 컬럼에 거래대금 값이 표시됩니다. 15초이내에 추가적으로 2000만원이 체결된경우 이벤트 표시값에 누적되어 표시됩니다. 
v2.0 : 가격변동 시 초록색으로 깜짝 표시됩니다.
v2.1 : Event 발생은 설정한 거래대금이상이 1초 이내 체결되었을 때 이며 이벤트 로그 이력창에는 이벤트 발생당시 순수 매수, 매도 값이 표시됩니다. 우측의 이벤트 로그 창은 설정한 거래대금 이상의 거래대금이 아니더라도 표시됩니다. 
예를들어 3000 설정시 매수 100만원 매도 2900만원인경우 매수, 매도 값이 각각 표시됩니다.
v2.2 : 이벤트 발생 시 우측 로그 창에도 심볼이 색상 표시됩니다. 코인리스트 숫자 설정 제거
v2.3 : 당일 고가, 저가 추가 , 당일 신고가, 저가 갱신시 1초간 배경이 각각 빨강, 파랑으로 으로 표시됩니다

v2.4 : 프로그램 시작 시 입력할 수 있는 조건설정이 사라지고 config.js 파일에서 설정을 변경하도록 하였습니다 (입력을 받으면 테이블 이동이 2칸식 이동하는 버그가 발생), 이벤트 알림 이력을 설정한 시간 만큼 쌓도록 변경하였습니다 (config.js 파일에서 event_log_save_timeout 옵션 변경을 통해 이벤트 로그 이력 유지 시간을 설정할 수 있습니다, 해당 설정 시간에 따라 Label에 표시되는 매도/매수 1~2등 심볼 통계를 냅니다), BTC 실시간 변동률을 표시하였습니다.
v2.5 : 빗썸 거래소 추가 , run_bithumb.bat 파일로 실행 , config.js 파일에서 각 거래소별로 설정값을 설정가능


git fetch --all
git reset --hard origin/master
git pull origin master