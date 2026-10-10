# 아쿠아픽

순수 정적 HTML/JavaScript 가격 조회 화면입니다. main은 운영용, preview는 검토용입니다. 운영 사이트 https://aqua-price.onrender.com 은 main, 미리보기 https://aqua-price-preview.onrender.com 은 preview를 각각 Render에서 배포합니다. 별도 Sites 사이트 https://aqua-price-jk.frostycorgi.chatgpt.site 는 두 GitHub 브랜치의 자동 배포와 연결되지 않았습니다.

## 로컬 실행

Node.js 24 권장. 의존성 설치가 필요 없습니다.
`npm start` 후 http://127.0.0.1:8080 를 열고, `npm test`로 구문·데이터 계약·필터·화면·수집 실패 보존·관리자 상태 검사를 실행합니다.

이 preview 검토본은 확인된 실제 상품의 시점별 공개 가격을 보여 줍니다. 실제 상품 등록일·배송비·선택 기간 판매량은 확인되지 않았습니다. 기본 기간은 전체이며, 1주·1개월·3개월은 확인된 실제 등록일 기준입니다. 등록일 미확인 항목을 포함해도 해당 기간의 신상품으로 주장하지 않습니다. 판매순은 미연동이며 순위를 만들지 않습니다.

## 현재 수집 범위

이 패치의 기준은 preview `e44719334b3423c7cc1d3781097211f087a2249d`입니다. 기준 카탈로그는 2026-10-09T13:34:37.411Z 관찰본의 1,900개 상품(생물 1,846개·용품 54개), 42개 판매처 도메인입니다. 이 패치를 준비하면서 상품을 새로 수집하거나 가격·사진·등록일·판매량을 바꾸지 않았습니다. 판매처 설정은 51개 항목 중 38개 활성화 상태이며 설정 켜짐은 전체 수집 성공을 뜻하지 않습니다. 차단된 판매처를 다른 경로로 우회하지 않습니다.

가격 갱신은 검증된 상품 URL을 사용하며, 별도 대표 카테고리 발견 기능을 아래 범위에서 수행합니다. 전체 판매처 카테고리 지도와 완전 수집은 미확인입니다. coverageComplete=false이며 실제 삭제는 비활성입니다. 404·품절·파싱 실패·요청 실패를 구분하고, 실패한 상품은 마지막 정상 확인본을 보존합니다. ProductGroup 옵션은 SKU별로 구분하며 묶음 수량이 명시된 경우만 단가를 계산합니다. 할인 메타데이터는 기본 Offer 가격과 따로 보존합니다. 재고 표시는 결제 단계에서 확인한 재고가 아닙니다.

사진은 사용자 허용에 따라 판매처의 원본 HTTPS URL만 표시하고 다운로드·재호스팅하지 않습니다. 사진이 없거나 실패하면 판매처 링크와 안내를 표시합니다. Greenfish/Aquapet만 확인된 공개 HTTP 상품 주소를 허용하며, 인증·결제·비밀정보 전송에 사용하지 않습니다.

## 대표 카테고리 발견과 이어 읽기

관찰한 카테고리 지도는 sources/discovery-seeds.json에 보존합니다. 현재 지도는 38곳·1,739개 카테고리이며 용품 탐색 힌트는 1,263개입니다. 이 가운데 이미 관찰된 동일 판매처 메뉴 링크 1,212개를 용품 범위로 추가했으며, 지원되는 목록 파서와 용품 링크가 있는 판매처는 34곳입니다. 전체 카테고리 지도나 판매처 전체 완전 수집을 뜻하지 않습니다. Seijin·싸다군의 목록 파서는 아직 미지원입니다. Animallo·MedakaGallery에는 검증된 용품 시작 링크가 없으며 이후 제한된 캐시 메뉴 탐색에서 실제 링크가 발견되는 경우에만 추가할 수 있습니다.

live/gear/all/reconcile 모두 명시된 범위에서 발견을 수행합니다. `--mode gear`는 용품, live는 생물, all/reconcile은 두 경로를 순환합니다. `--discovery-scope live|gear|all`로 범위를 지정할 수 있습니다. `--refresh-known`은 발견을 끄고 알려진 URL만 갱신하며, `--discover`를 함께 명시하면 발견을 다시 켭니다.

용품 발견은 판매처당 최대 4개 관찰 목록 페이지·신규 URL 60개·상세 검증 8개이며, 확인된 가격 URL 최대 3개를 함께 순환 갱신합니다. 가격 조회·목록 탐색·상세 확인은 판매처당 전체 요청 20회와 18분 실행 한도를 공유합니다. 더 엄격한 판매처별 maxRequests 및 robots 대기가 우선합니다. `--refresh-known`만 실행하면 알려진 URL 최대 15개를 선택합니다. 따라서 각 상품의 모든 가격을 매 실행마다 확인하지 않으며 관찰 시각을 개별 표시합니다. raw HTML 캐시는 판매처당 24시간·60개·12MB 안으로 정리합니다.

카테고리별 실제 다음 링크와 방문한 상품 번호, 검증 대기 URL을 .collector/state.json에 저장해 한도 도달 후 이어 읽습니다. 카테고리도 순환하며 진행 중인 카테고리 첫 페이지를 점검합니다. mixed 목록은 상세 breadcrumb·분류와 충돌 검사를 통과해야 게시하고 사료/생먹이·인조수초·육상동물은 관상생물로 넣지 않습니다. 불명확한 항목은 검토 기록으로 남깁니다.

대표 카테고리의 표시 총 상품 수를 알아도 판매처 전체의 완전성은 미확인입니다. 실제 삭제는 계속 비활성입니다. 품절은 상품으로 보존하고 404/410·오류·목록 누락으로 삭제하지 않습니다. /admin/에 실제 방문·한도·검증 대기·이어 읽기 위치·미지원 파서를 표시합니다.

## 수집 실행과 예약

`npm run collect -- --mode all`은 로컬 상태만 수집합니다. `--publish`를 추가하면 검증된 정적 JSON을 갱신합니다. mode는 all/live/gear/reconcile입니다. 수집 후 `node scripts/build-admin-status.cjs`와 `npm test`를 실행합니다. .collector 원문 캐시·lastgood는 gitignore로 제외합니다. 등록 호스트, robots, 요청 간격, 요청 수, 타임아웃, 응답 크기를 제한하며 403/429는 즉시 중단합니다.

예약 워크플로 원본은 sources/catalog-refresh.workflow.yml 입니다. main에는 .github/workflows/catalog-refresh.yml만 추가하고, 실행 시 preview를 체크아웃합니다. UTC 생물 매 6시간 17분(하루 4회), 용품 매 12시간 29분(하루 2회), 누락 검토 매일 02:43(하루 1회)로 하루 7개 예약 슬롯입니다. GitHub Actions는 지연될 수 있으며, 수동 실행과 재시도는 이 예약 횟수에 포함되지 않습니다. 실행이 지연되어 날짜를 넘길 수 있으므로 실제 시작 횟수의 엄격한 일일 상한은 아닙니다. 누락 검토도 전체 수집 증거가 없어 상품 삭제를 수행하지 않습니다. GITHUB_TOKEN contents:write는 이 저장소의 preview 데이터 커밋에만 사용하며 외부 토큰을 저장하지 않습니다. 자동 커밋 허용 경로는 dist/catalog.json, dist/source-snapshot.json, dist/collector-status.json, dist/admin/status.json입니다. main 사이트 콘텐츠는 변경하지 않습니다.

워크플로 등록 여부와 실제 실행·데이터 커밋·Render 반영 검증은 별개입니다. sources/automation-status.json과 /admin/에 확인 여부를 표시합니다. 첫 실제 실행의 최종 배포 검증 전에는 자동 갱신 성공으로 표시하지 않습니다. 직접 실행은 https://github.com/joonhyoung-kim/aqua-price/actions/workflows/catalog-refresh.yml 에서 Run workflow, main, mode=all 을 선택합니다.

## 관리자

/admin/은 공개 조회 화면입니다. 발견 후보 상품명을 짧게 나열하며 이름을 확인하지 못한 후보는 개수만 표시합니다. 방문·검증 수와 탐색 범위는 판매처별 발견 현황에서 볼 수 있습니다. 주기와 판매처별 ON/OFF는 화면에서 초안을 만든 뒤, GitHub에 로그인하고 저장소 쓰기 권한으로 preview/sources/collector-controls.json을 최종 저장해야 적용됩니다. 비밀번호나 PIN을 흉내 내는 프런트엔드 잠금은 사용하지 않습니다.

## 주요 파일

- dist/index.html, app.js, data-model.js, gear-taxonomy.js: 화면과 필터
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

Manual workflow run 37767325227, attempt 2, published bot data commit 2d4967239b82952965efb8ace08cb2f08a45845a. Its data validation, commit, push and Render preview file hashes were verified. The overall job remains failed because source errors are reported explicitly. 71 products were added and 9 existing records updated; no existing prices changed and no products were removed. PRFish is held after public fetch failure. Two Aquavillage product identities are held for review; verified products remain visible. The 18-minute budget deferred remaining sources, so this is partial representative discovery. A later scheduled run 37828093605 completed successfully and published preview data commit 15e120b; its event, job steps and result are recorded in dist/automation-run-evidence.json.


### 생물 후보 확인과 어종 필터
생물·용품 발견과 알려진 가격 갱신은 명시된 요청 배분 안에서 함께 순환합니다. 생물의 dailyDiscovery와 용품의 gearDailyDiscovery는 목록 커서·상세 대기열을 각각 보존하며, 두 범위 실행 시 라운드로빈으로 기회를 나눕니다. 공개 체크포인트로 두 경로를 모두 복구할 수 있습니다. 요청 상한, robots 대기, 18분 실행 한도와 차단 정책은 유지합니다. 확인된 생물·물고기 상품만 어종을 구분하며 플레티 검색은 플래티와 함께 검색합니다. 품종 구분이 모호한 물고기는 기타로 표시합니다. 카테고리 마지막 페이지 확인은 전체 상품 상세 확인 완료를 뜻하지 않습니다.


### Bounded coverage batches

Livestock browsing starts at all livestock. Each subtype has a hierarchy of navigation collections and existing subgroup buttons, with counts for the current query and registration window. These collections help browsing; they are not biological ranks and do not change product classification. One collection expands at a time, with accessible buttons, visible selection paths, collection-wide selection and subtype-wide selection. Only nonempty leaves are shown, except an explicitly selected empty leaf or collection remains available. Existing `fishGroup` and `liveGroup` URLs continue to work and reopen the selected leaf's collection; `browseGroup` selects a whole navigation collection. UI selections update the URL and survive reloads. Uncertain or conflicting names remain in 기타·미분류.

Subgroups use explicit product names first, then observed retailer category evidence. `publish.cjs` preserves menu labels only when the same retailer's saved category cursor contains that exact product key; `build-catalog.cjs` exposes this as `observedCategoryLabels`. This evidence supports numeric category URLs without guessing from IDs. Original prices, offer identities, photos and registration/sales unknowns remain intact.

Resuming rejects a prior recorded process that is still running or whose status cannot be verified.

Run `node scripts/collect-coverage-batch.cjs --rounds 3 --minutes 32` to alternate observed category discovery and pending-detail draining across merchants. The batch has at most three 60-request rounds, five merchants per round, and at most 12 requests per merchant slot; stricter registered limits, robots delays, denial quarantine and candidate retry holds remain active. Merchant selection rotates untouched merchants and considers observed coverage and last attempt. Category totals remain separate and do not establish whole-retailer totals.

Each completed merchant saves catalog data, state and queue/page tails. The request journal is saved before each network attempt. An interrupted batch can use `--resume` with its original remaining request budget and deadline; completed batches cannot be resumed into a fresh budget. Public progress is in `dist/coverage-batch-report.json`. Stop reasons distinguish finite round limits, elapsed collection time, no eligible sources and no collection progress. The operator reviews and validates output before publishing preview data.

## Product-content classification and offline audit

Category menus are discovery hints. Classification version 7 evaluates the primary product title, its own breadcrumb, matching Product description, variant options and sales specification. Navigation/recommended-product descriptions cannot supply identity. Explicit feed and supply contexts remain guarded; mixed parents do not exclude supported leaves.

The discovery ledger records actual same-retailer listing, detail, related-product and sitemap hrefs with included/pending/review/excluded decisions, reasons, observation times, evidence hashes and decision history. Content changes and classifier versions can reopen an old exclusion; access, robots and identity holds remain enforced. Cached recovery candidates require a fresh detail request before publication.

Run `node scripts/audit-cached-products.cjs` for a read-only offline projection. It does not request pages, change state/catalog or add products; historical offer observations are not promoted to current prices. An explicitly requested `--output <path>` saves the detailed audit separately.

### Scheduled runtime and cadence

The seven-slot schedule reduces the former 13 scheduled slots per UTC day by about 46%. It deliberately reduces revisit opportunities: live runs change from every 3 hours to every 6 hours, and gear runs from every 6 hours to every 12 hours. It does not claim that every product is refreshed at that interval. Known-price refresh and live/gear discovery now share the explicit per-source allocation described above; `--refresh-known` disables discovery unless `--discover` is also requested.

The 18-minute collector deadline, 25-minute job timeout, source request limits, robots crawl delays, refusal quarantine, lastgood preservation and resume cursors are unchanged. Long live runs are dominated by source pacing; this change reduces daily scheduled work rather than claiming a faster equivalent crawl. `--quiet` avoids writing the full checkpoint ledger into Actions logs; complete reports still remain in `.collector/report.json` and `dist/collector-status.json`. Both pre-collection and post-collection tests remain mandatory.

Apply the matching schedule to `sources/catalog-refresh.workflow.yml` on preview and the active `.github/workflows/catalog-refresh.yml` on main. A preview-only template edit does not alter GitHub scheduling. The active workflow continues to check out preview and to push only the four existing preview data paths; it does not publish catalog updates to main. Historical execution evidence in automation-status.json remains historical and does not verify the new cadence.


## Detailed gear navigation

The gear tab uses the same compact accordion as livestock: major category → detailed product type. `dist/gear-taxonomy.js` defines 12 major groups and 58 named types plus an explicit unknown group. Only categories present in the current query/date scope are shown; a selected zero-result category remains visible so the user can reset it. Selecting a parent resets the child. Counts represent observed catalog rows, not stock or a whole-market total.

Classification is computed without changing catalog rows. Product names and verified retailer menu ancestry provide evidence; seller identity and numeric category IDs do not. Replacement media, refills, filter parts, food containers, medication and complete filters have separate rules. Identical category leaf names are disambiguated by `observedCategoryLabels[].ancestorLabels`. Unclear and conflicting evidence stays in 기타·미분류. Potential livestock rows already incorrectly typed as gear are flagged as unknown in this derived view; this UI layer does not silently retype them.

`gearCategory` and `gearGroup` persist in the URL. Search input is still a draft until 조회 or Enter submits it; category, period and sort changes use only the last submitted query. Missing dates/sales remain unknown. The compact cards and livestock grouping are unchanged.

Administrator schedule labels are derived from `automation.scheduleUTC`, including the existing 6-hour livestock / 12-hour gear / daily reconciliation metadata. The display never treats a configured cadence as verified execution. Run timestamps and scheduled-run verification are not advanced by the UI patch.

Regression checks: `test/gear-hierarchy.test.cjs`, the gear cases in `test/ui.test.cjs`, and `test/gear-discovery.test.cjs` are included in `npm test`. Live browser layout checks should be run on the resulting preview deployment before production promotion; cloud command execution cannot render Chromium in the restricted environment used to prepare this patch.


## Gear discovery review and remaining verification

The additional seed links come from already-observed same-retailer menu evidence; there was no live retailer collection during patch preparation. Full observed ancestor labels survive discovery and publication. Category labels remain discovery hints and cannot substitute for a fresh primary-product detail verification or authorize URL guessing. Access denial, robots decisions, refusal quarantine, request ceilings and the existing exact two standalone-service-fee exclusions remain enforced.

`sources/gear-discovery-review.json` records the observed-menu expansion and eight suspicious packaging/livestock offers. Those offers retain their IDs and option variants and require fresh primary-detail review with `autoPublish:false`; the patch does not silently correct their published type or treat archived prices as new observations. Current catalog, source snapshot and collector status remain unchanged. In the served admin snapshot, only the configured live/gear cron strings are corrected to match current schedule metadata; generation, collection, deployment and run timestamps and verification flags remain historical.

A bounded actual gear collection, its newly verified item count, a preview deployment and rendered desktop/mobile checks remain outstanding. Passing offline fixture tests does not demonstrate live retailer success or an increase in published catalog products.


## 관리자 설정 저장 및 실제 수집 반영

- 관리자 화면에서 주기와 사이트 ON/OFF를 바꾸면 아직 저장되지 않은 초안입니다. 브라우저를 새로고침하면 미저장 초안은 사라집니다.
- `1. 설정 JSON 복사`를 누른 뒤 `2. GitHub에서 최종 저장`을 엽니다. GitHub 편집기의 **파일 전체**를 복사한 JSON으로 교체하고 GitHub의 변경 내역을 검토한 뒤 `preview`에 Commit changes를 완료합니다. 복사 이후 다른 사람이 저장할 수 있으므로 마지막 변경 내역을 다시 확인하세요. 권한이 없으면 저장할 수 없습니다.
- `3. GitHub 저장 확인`은 GitHub에서 다시 읽은 파일이 초안과 정확히 일치할 때만 저장 확인을 표시합니다. 복사·링크 열기만으로 저장/적용 완료를 표시하지 않습니다. 다른 수정이 먼저 저장되면 기존 초안을 덮어쓰지 않고 새 저장본을 다시 불러오도록 안내합니다.
- GitHub 읽기가 차단되거나 요청 한도를 넘으면 저장 상태는 미확인으로 유지됩니다. 토큰 입력이나 공개 쓰기 API를 요구하지 않습니다.
- 실제 설정 파일은 `sources/collector-controls.json` 하나입니다. `schemaVersion: 1`, `intervalsHours: { live, gear, reconcile }`, `sources: { 판매처ID: { enabled: true/false } }`를 검증합니다. 빠진 판매처는 OFF이며 알 수 없는 키·판매처·허용되지 않은 주기는 수집 시작 전에 거부됩니다.
- 생물은 6·12·24·48·72시간, 용품은 12·24·48·72시간, 목록 대조는 24·48·72시간만 선택할 수 있습니다. 기존 UTC 예약 슬롯(생물 하루 4개, 용품 2개, 목록 대조 1개)은 바꾸지 않습니다. 주기는 고정 UTC 예약 구간을 기준으로 평가합니다. 실제 요청 시각과 사용한 예약 구간을 따로 기록하므로 보통의 시작 지연 때문에 다음 구간을 불필요하게 건너뛰지 않습니다. 같은 구간에서 이미 실제 요청을 보냈다면 중복 예약 재시도는 건너뜁니다. 시계가 뒤로 움직여도 지난 구간을 다시 수집하지 않습니다. GitHub가 이전 작업을 다음 구간까지 지연시킨 경우 두 실행의 실제 간격은 설정 시간보다 짧거나 길 수 있습니다. 정각·실시간 실행이나 엄격한 경과시간 간격은 보장하지 않습니다.
- 자동 실행의 모드별 마지막 실제 요청 시도·성공·실패 기록은 기존 공개 파일 `dist/collector-status.json`에 남습니다. 다른 모드 기록을 보존합니다. 현재 워크플로가 이 파일을 커밋해야 다음 실행에 남으며, 커밋 전에 실행기가 강제 종료되면 가장 최근 로컬 기록을 잃을 수 있습니다.
- 수동 실행은 자동 주기의 대기를 건너뛰며 다음 자동 예약을 늦추지 않습니다. 수동 수집도 사이트 OFF와 원래 접근 제한을 지킵니다. OFF·아직 주기가 안 됨·캐시만 사용한 실행은 새 실제 요청으로 기록하지 않습니다.
- OFF는 새 요청만 중지하고 기존 상품을 지우지 않습니다. ON은 원래 registry 비활성, 기술 차단, robots, 403 수동 검토, 재시도 대기를 해제하지 않습니다. 이미 실행 중인 작업은 시작 시 읽은 설정을 사용하므로 변경은 다음 해당 수집부터 반영됩니다.
- `collect-catalog`, 실험용 `discover-catalog`, `collect-coverage-batch` 모두 동일한 사이트 ON/OFF를 읽습니다. 자동 예약은 영속 상태를 발행하는 `collect-catalog --mode live|gear|reconcile --publish`만 사용합니다. 독립 fixture 테스트는 별도 controls 파일을 주입합니다.

이 변경은 관리자 비밀번호 보호나 비공개 상태 데이터 저장을 제공하지 않습니다. 현재 공개 GitHub 저장소 및 공개 상태 화면이라는 접근 범위를 유지합니다. 실제 비밀번호 보호가 필요해지면 별도 서버 인증과 저장소 공개 범위를 함께 설계해야 합니다.


### Existing gear classification revalidation

Gear discovery (and the gear lane of all/reconcile) now has a separate, durable reclassification queue for existing offers whose livestock name conflicts with packaging/free-gift wording. Known-product deduplication cannot discard this queue. It uses the existing per-source detail allocation, request ceiling and 18-minute execution deadline; it does not add a collection schedule or increase a budget. Live-only discovery does not consume the gear queue. Source OFF, identity holds, robots rules, 403 quarantine and 429 backoff remain authoritative.

Every correction requires a fresh primary-detail request, corroborated product/price evidence, exact collector/product/variant identity and a supported classification. Future-dated cache entries are rejected, and mandatory-fresh requests never use cached detail. Free packaging/gift text alone only creates a review candidate. Feed breadcrumbs retain feed as gear. Paid-packaging options require corroborated ProductGroup parent evidence; unresolved or missing variants retain their previous rows for review. No SKU is merged or deleted.

Every publication mode requires a freshly verified update receipt before an existing gear offer becomes live. Changed IDs, replacement markers and reused collector keys cannot bypass this gate. Gear mode additionally excludes unrelated or new live rows. Receipts are not serialized into collector state or public checkpoints. Normal known-price refresh preserves each existing variant's classification, preventing a URL's first option from relabeling its siblings. Standalone packaging-fee publication exclusions are unchanged.

The durable checkpoint retains per-offer queue status, identity, reason, attempts and evidence. Temporary request/parse/missing-detail failures wait at least 24 hours before another automatic revalidation attempt; ambiguous classifications, identity mismatches and robots denials remain explicit review records until the classifier changes or they are deliberately reviewed. Successful checks are not repeatedly queued solely because the name still contains packaging wording. Ordinary --refresh-known runs remain price-refresh only; use the normal discovery-enabled gear/all/reconcile run to process the queue.

This is an offline-tested code repair. Applying its overlay does not collect or reclassify the current published data; changes require a later authorized discovery-enabled run with fresh merchant evidence.
