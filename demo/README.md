# MGU 데모

이 저장소(akakingj/myapp-id7)와 akakingj/myapp-cluster의 **모든 앱**을 PC에서 차처럼 돌려 보는 데모입니다.
브라우저 창 하나에 다음이 함께 나옵니다.

- **계기판** (1920×720): AK Cluster Layouts · Centre · Info가 그리는 것. 앱의 GLSL을 WebGL로, KOMBI처럼 그립니다.
- **중앙 디스플레이 (MGU)**: HMI의 "설치된 앱" 목록. 아이콘을 누르면 그 앱이 열립니다. 차의 그리기 엔진
  (`kit/emu/web/gfx`, WebAssembly)으로 그리고, 마우스는 터치, 휠과 키보드는 iDrive 다이얼입니다.
- **패널**: 차량 값(자동 주행 또는 직접 조절), HUD, 열린 앱의 설정, 시동과 함께 켜지는 앱의 상태, 로그.

## 실행 (Windows)

1. `mgu_demo_<버전>.zip`을 풀고 (예: `C:\BMW\mgu-demo`) `mgu_demo.bat`을 실행합니다.
2. 실행할 때마다 두 저장소의 **최신 코드**를 GitHub에서 받아 `src\`에 둡니다 (이미 최신이면 그대로).
3. 브라우저가 열립니다 (`http://127.0.0.1:8077/`). 창을 닫으면 데모가 꺼집니다.

필요한 것: Node.js (LTS), Python 3 (설치할 때 "Add python.exe to PATH"). Python이 없으면 이 저장소의 앱은 빌드되지 않고
계기판 앱만 돕니다. 보는 브랜치는 `mgu_demo.bat` 위쪽의 `APPS_BRANCH` / `CLUSTER_BRANCH` (기본: 테스트 브랜치).

직접 실행: `node demo/server.js --cluster ../idrive7-cluster-info [--data 폴더] [--port 8077] [--no-open]`

## 업데이트 방식: 앱 코드만 고치면 된다

데모는 앱을 복사하거나 따로 고치지 않습니다. 매번 `apps/<id>`를 MGU Store와 같은 방법으로 빌드해서
(`kit/tools/build.py --preview-only --language ko`, 계기판 저장소는 그 저장소의 `tools/mgu/stage.js`) 그 앱의 kit
(`kit/tools/hu-stub.js`)으로 실행합니다. 그래서

- 앱을 고쳐 브랜치에 올리면, 다음 데모 실행에서 그대로 보입니다. **데모 쪽은 손댈 것이 없습니다.**
- 데모가 켜진 채 `apps/` 파일이 바뀌면 그 앱만 다시 빌드·재시작합니다.
- 데모 자체(화면, 패널, 차량 값)를 바꿀 때만 이 `demo/` 폴더를 고칩니다.

## 차처럼 도는 것

- **시동과 함께 켜지는 앱** (app.json `autostart` / `startType: autostart`: 차량 프로필, AK Cluster 3종, 엔진 예열,
  앰비언트 설정)은 처음부터 백그라운드에서 계속 돕니다. 그래서 중앙 화면에 어떤 앱을 열어도 계기판은 그대로입니다.
  이런 앱의 아이콘을 누르면 그 앱이 앞으로 나옵니다 (한 번 재시작).
- **차량 값 하나를 모든 앱이 받습니다**: rpm, 속도, 기어, 온도, G, 토크는 차의 신호(SOME/IP)로 들어가서 앱은
  데모가 아닌 실제 차 데이터로 받습니다. 부스트는 스포츠 디스플레이 신호로, 흡기온·미션오일·주행 모드 등
  계기판 앱이 엔진 ECU에서 읽는 값은 패널 값으로 들어갑니다.
- **방향지시등**(끔 / 왼쪽 / 오른쪽 / 비상등)과 **낮 / 밤**도 차의 신호(Light, 조도 센서)로 들어갑니다:
  Cluster Info · 레드라인의 HUD 화살표, 앰비언트 설정, 밤의 HUD 밝기가 이것을 따릅니다.
- **차량 프로필**이 쓰는 공통 설정(`/dev/shm/car-profile.json`)을 다른 앱이 그대로 따라갑니다.
- 앱 설정은 PC에 남습니다 (`data\apps\<앱>\settings.json`). 처음에는 AK Cluster Layouts만 "계기판에 표시"가 켜져 있습니다.

## 한계

- UDS(진단)로 읽는 값 중 계기판 앱 외의 것(레드라인의 흡기·부스트 로그, 실시간 정보, 고장 진단 등)은 각 앱의
  응답 없음 상태나 자체 데모 값입니다.
- 측후방 경고(BDC 진단으로 읽음)와 계기판 바늘 스윕 애니메이션은 없습니다. Waze 지도와 순정 계기판(방향지시등 화살표 포함)은 모형입니다.
- HMI가 직접 그리는 메뉴 화면은 그려지지 않습니다 (패널의 "고급: HMI 버튼"으로 누름).

## 파일

| 파일 | 하는 일 |
|---|---|
| `server.js` | 데모 서버: 앱 빌드·실행 (앞 화면 1개 + 백그라운드), 렌더러 소켓, 차량 값, 계기판 레이어 중계. `kit/tools/emu.js` 기반 |
| `preload.js` | 앱 프로세스마다 먼저 로드: 계기판 렌더러 대역, 차량 값, `/dev/shm`·`/run` 경로, Windows 파이프 |
| `web/` | 페이지 (`kit/emu/web/emu-app.js`·`emu.css` 기반 + 계기판·HUD·패널) |
| `launcher/` | 배포용 `mgu_demo.bat`, `mgu_demo_update.js` (최신 코드 받기) |
