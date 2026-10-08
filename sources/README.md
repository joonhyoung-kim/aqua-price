# 수집기 실행과 현재 상태

현재 registry는 최초 45개 판매처의 전달된 기술 감사자료를 반영한다. 가격 샘플 확인 31곳은 알려진 상품 URL 부분 수집을 준비했으며 실제 collector 성공 상태는 실행 보고서로 별도 검증한다. 명시 차단 7곳과 그 외 가격·상품·요청 실패 사유를 구분한다. snapshot 상품이 있는 최초 목록 판매처 9곳과 목록 밖 추가 도메인 4곳을 분리한다. 플랫폼이나 샘플 확인만으로 자동 연동 완료라고 표시하지 않는다. 상품 URL을 추가 탐색하거나 차단 판매처를 요청하지 않는다.

`npm run collect -- --mode live`는 등록된 허용 상품 URL만 순회하고 `.collector/state.json`에 마지막 정상 결과·캐시·실패·시각을 저장한다. 기본 실행은 공개 dist를 바꾸지 않는다. `--publish`를 명시하면 검증된 상품 갱신과 `dist/collector-status.json`을 반영한다. 실행 결과를 GitHub에 올리는 workflow와 수동 첫 실행은 별도 검증 단계다.

상품 JSON-LD의 식별자와 표시 가격을 대조하며 KRW Offer 가격이 없으면 script 변수나 AggregateOffer 최저가격을 실제 판매가로 사용하지 않는다. ProductGroup은 hasVariant만 처리하고 SKU별 묶음 가격을 보존한다. 명시 수량만 마리당 가격으로 환산하고 상품명으로 종류나 수량을 추정하지 않는다.

robots.txt를 먼저 확인하며 없거나 확인 실패하면 상품 요청을 하지 않는다. 공식 등록 HTTPS 호스트만 허용하고 리다이렉트는 별도 검토 없이 따라가지 않는다. 403·429는 즉시 중지하고 24시간 backoff한다. 요청 한도·지연·캐시·응답 크기·타임아웃을 제한한다. HTTP 실패·부분 파싱·404는 상품 삭제로 처리하지 않는다. 품절은 availability false로 보존한다.

현재 adapter는 known_product_urls 부분 확인만 지원하므로 전체 상품 완전 수집이나 삭제 대조가 활성화되지 않는다. 삭제는 별도 full_catalog 완전성(모든 페이지 방문, 끝 페이지 확인, expected count, 오류 없음)이 증명된 경우만 허용하는 함수로 분리했다. 수집기 마지막 성공 시각과 상품 관찰 시각·등록일을 구분하고 캐시만 읽은 실행은 새 관찰로 표시하지 않는다.

GitHub 예약 실행 초안은 `catalog-refresh.workflow.yml`에 있다. main에는 workflow 파일만 추가하고 preview 코드로 실행한다. UTC 기준 생물 매 3시간 17분, 용품 매 6시간 29분, 완전 목록 대조 작업은 매일 02:43이다. 현재 완전 순회 adapter가 없어 daily 작업도 알려진 URL 확인만 수행하며 실제 삭제는 금지된다. 기본 GITHUB_TOKEN의 contents:write만 사용하고 preview의 세 데이터 경로만 커밋한다. 새 credential, 로그인, 유료 서비스는 만들지 않는다. workflow_dispatch 실행과 Render 반영을 검증하기 전 자동 갱신 완료라고 표시하지 않는다.

원격 HTML·JSON-LD는 데이터로만 해석하며 eval이나 원격 코드를 실행하지 않는다. 상품 설명 전체를 복제하지 않고 사실정보·원본 사진 URL만 정규화한다. 상태·캐시는 `.collector/`에 두며 토큰·쿠키를 저장하지 않는다.
