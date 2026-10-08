# 아쿠아픽

순수 정적 HTML/JavaScript 가격 조회 화면입니다. main은 운영용, preview는 검토용입니다. 운영 사이트 https://aqua-price.onrender.com 은 main, 미리보기 https://aqua-price-preview.onrender.com 은 preview를 각각 Render에서 배포합니다. 별도 Sites 사이트 https://aqua-price-jk.frostycorgi.chatgpt.site 는 두 GitHub 브랜치의 자동 배포와 연결되지 않았습니다.

## 로컬 실행

Node.js 24 권장. 의존성 설치가 필요 없습니다.
`npm start` 후 http://127.0.0.1:8080 를 열고, `npm test`로 구문·데이터 계약·필터·화면·수집 실패 보존·관리자 상태 검사를 실행합니다.

main의 초기 화면은 가상 상품·가격 샘플이며, 기간은 샘플 상품 등록일 기준입니다. preview는 확인된 실제 상품의 시점별 공개 가격을 보여 줍니다. 실제 상품 등록일·배송비·선택 기간 판매량은 확인되지 않았습니다. 기본 기간은 전체이며, 1주·1개월·3개월은 확인된 실제 등록일 기준입니다. 등록일 미확인 항목을 포함해도 해당 기간의 신상품으로 주장하지 않습니다. 판매순은 미연동이며 순위를 만들지 않습니다.

## 현재 수집 범위

2026-10-08 로컬 검증: 원래 45개 판매처 중 33곳 수집 활성화, 32곳 고정 상품 URL/옵션 58개 성공, PRFish 1곳 요청 실패. 나머지 12곳은 접근 중단·휴업·로그인 가격·유효 판매가 부재·503/502 등으로 비활성입니다. 차단된 판매처를 다른 경로로 우회하지 않습니다. 기존 확인본을 보존해 preview는 79개 상품, 37개 판매처 도메인입니다. 추가 4개 도메인은 원래 45곳 성공률 분모에 넣지 않습니다.

가격 갱신은 검증된 상품 URL을 사용하며, 별도 대표 카테고리 발견 기능을 아래 범위에서 수행합니다. 전체 판매처 카테고리 지도와 완전 수집은 미확인입니다. coverageComplete=false이며 실제 삭제는 비활성입니다. 404·품절·파싱 실패·요청 실패를 구분하고, 실패한 상품은 마지막 정상 확인본을 보존합니다. ProductGroup 옵션은 SKU별로 구분하며 묶음 수량이 명시된 경우만 단가를 계산합니다. 할인 메타데이터는 기본 Offer 가격과 따로 보존합니다. 재고 표시는 결제 단계에서 확인한 재고가 아닙니다.

사진은 사용자 허용에 따라 판매처의 원본 HTTPS URL만 표시하고 다운로드·재호스팅하지 않습니다. 사진이 없거나 실패하면 판매처 링크와 안내를 표시합니다. Greenfish/Aquapet만 확인된 공개 HTTP 상품 주소를 허용하며, 인증·결제·비밀정보 전송에 사용하지 않습니다.

## 대표 카테고리 발견과 이어 읽기

관찰한 32곳·139개 대표 링크를 sources/discovery-seeds.json에 보존합니다. Cafe24 26곳의 목록 파서가 구성되어 있고, MakeShop/Godo/Sixshop 6곳은 목록 파서 미지원으로 명시합니다. 전체 카테고리 지도나 전체 판매처 완전 수집을 뜻하지 않습니다. all 및 reconcile 실행에서 제한된 발견을 수행하고, live/gear는 확인된 상품 URL의 가격을 갱신합니다.

판매처당 발견 최대 2페이지·신규 URL 30개·상세 검증 3개이며 전체 요청은 기존 source.maxRequests 한도 안에서 공유합니다. 확인된 가격 URL도 실행당 live/gear 최대 15개, 발견과 함께 실행할 때 최대 10개를 순환 갱신해 발견 예산을 남깁니다. 따라서 각 상품의 모든 가격을 매 실행마다 확인하지 않으며 관측 시각을 개별 표시합니다. raw HTML 캐시는 판매처당 24시간·60개·12MB 안으로 정리합니다.

카테고리별 실제 다음 링크와 방문한 상품 번호, 검증 대기 URL을 .collector/state.json에 저장해 한도 도달 후 이어 읽습니다. 카테고리도 순환하며 진행 중인 카테고리 첫 페이지를 점검합니다. mixed 목록은 상세 breadcrumb·분류와 충돌 검사를 통과해야 게시하고 사료/생먹이·인조수초·육상동물은 관상생물로 넣지 않습니다. 불명확한 항목은 검토 기록으로 남깁니다.

대표 카테고리의 표시 총 상품 수를 알아도 판매처 전체의 완전성은 미확인입니다. 실제 삭제는 계속 비활성입니다. 품절은 상품으로 보존하고 404/410·오류·목록 누락으로 삭제하지 않습니다. /admin/에 실제 방문·한도·검증 대기·이어 읽기 위치·미지원 파서를 표시합니다.

## 수집 실행과 예약

`npm run collect -- --mode all`은 로컬 상태만 수집합니다. `--publish`를 추가하면 검증된 정적 JSON을 갱신합니다. mode는 all/live/gear/reconcile입니다. 수집 후 `node scripts/build-admin-status.cjs`와 `npm test`를 실행합니다. .collector 원문 캐시·lastgood는 gitignore로 제외합니다. 등록 호스트, robots, 요청 간격, 요청 수, 타임아웃, 응답 크기를 제한하며 403/429는 즉시 중단합니다.

예약 워크플로 원본은 sources/catalog-refresh.workflow.yml 입니다. main에는 .github/workflows/catalog-refresh.yml만 추가하고, 실행 시 preview를 체크아웃합니다. UTC 생물 매 3시간 17분, 용품 매 6시간 29분, 누락 검토 매일 02:43입니다. GitHub Actions는 지연될 수 있습니다. 누락 검토도 전체 수집 증거가 없어 상품 삭제를 수행하지 않습니다. GITHUB_TOKEN contents:write는 이 저장소의 preview 데이터 커밋에만 사용하며 외부 토큰을 저장하지 않습니다. 자동 커밋 허용 경로는 dist/catalog.json, dist/source-snapshot.json, dist/collector-status.json, dist/admin/status.json입니다. main 사이트 콘텐츠는 변경하지 않습니다.

워크플로 등록 여부와 실제 실행·데이터 커밋·Render 반영 검증은 별개입니다. sources/automation-status.json과 /admin/에 확인 여부를 표시합니다. 첫 실제 실행의 최종 배포 검증 전에는 자동 갱신 성공으로 표시하지 않습니다. 직접 실행은 https://github.com/joonhyoung-kim/aqua-price/actions/workflows/catalog-refresh.yml 에서 Run workflow, main, mode=all 을 선택합니다.

## 관리자

/admin/은 45개 판매처의 수집 상태·상품 수·마지막 성공·오류·스케줄·전체 카탈로그 미지원 여부를 보여 주는 읽기 전용 화면입니다. 웹에서 수집 설정을 쓰지 않습니다. 설정 변경 링크는 GitHub 인증과 저장소 쓰기 권한을 요구하는 preview/sources/registry.json 편집 화면으로 연결됩니다.

## 주요 파일

- dist/index.html, app.js, data-model.js: 화면과 필터
- dist/catalog.json, source-snapshot.json: 확인 상품과 출처
- dist/collector-status.json, dist/admin/: 수집 상태와 관리자 화면
- scripts/collector/, scripts/collect-catalog.cjs: 제한된 공개 수집
- scripts/build-catalog.cjs, build-admin-status.cjs: 데이터 변환
- sources/registry.json, automation-status.json, catalog-refresh.workflow.yml: 설정과 실행 증거
- test/: 합성 테스트는 게시 데이터에 넣지 않음

Sites .openai/hosting.json과 원본 저장소 토큰은 포함하지 않습니다. UCP 프로필은 읽기 전용이며 결제·배송 API를 제공하지 않습니다. 기존 Render 캐시 헤더는 UCP max-age 60초 요구와 별도 점검이 필요한 상태입니다.

### Execution deadline and resume

The collector stops starting network requests after an 18-minute wall-clock budget, before the 25-minute Actions job timeout. It preserves verified partial results, lastgood, refusal quarantine and actual category cursors. Unattempted sources are reported explicitly; a per-mode source cursor resumes them in the next run. Robots delays are respected rather than shortened. A successful partial run does not mean complete source coverage.

### Verified partial Actions run

Manual workflow run 37767325227, attempt 2, published bot data commit 2d4967239b82952965efb8ace08cb2f08a45845a. Its data validation, commit, push and Render preview file hashes were verified. The overall job remains failed because source errors are reported explicitly. 71 products were added and 9 existing records updated; no existing prices changed and no products were removed. PRFish is held after public fetch failure. Two Aquavillage product identities are held for review; verified products remain visible. The 18-minute budget deferred remaining sources, so this is partial representative discovery. Cron execution has not yet been observed.


### 생물 후보 확인과 어종 필터
전체/대조 수집은 알려진 가격 재조회보다 미확인 생물 후보 확인을 우선합니다. 가격 갱신은 기존 live/gear 실행에서 진행하며 `--refresh-known`으로 전체 알려진 URL 재조회도 가능합니다. 요청 상한(판매처당 20회), robots 대기, 18분 실행 한도와 차단 정책은 유지합니다. 확인된 생물·물고기 상품만 어종을 구분하며 플레티 검색은 플래티와 함께 검색합니다. 품종 구분이 모호한 물고기는 기타로 표시합니다. 판매처별 상세 후보와 검토 사유는 공개 읽기 전용 collector-status.json에 보존하며 카테고리 끝 페이지 확인은 전체 상품 상세 확인 완료를 뜻하지 않습니다.
