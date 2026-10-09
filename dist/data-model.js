(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AquaCatalog = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DAY = 86400000;
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
  function httpsUrl(value) {
    try { const url = new URL(value); return typeof value === 'string' && url.protocol === 'https:' && !url.username && !url.password; }
    catch { return false; }
  }
  function sourceUrl(value) {
    if(httpsUrl(value))return true;
    try {const url=new URL(value);return url.protocol==='http:'&&!url.username&&!url.password&&['greenfish.co.kr','aquapet.co.kr'].includes(url.hostname.replace(/^www\./,''));}catch{return false;}
  }
  function requireValue(condition, message) { if (!condition) throw Error(message); }
  function validateCatalog(catalog) {
    requireValue(catalog && catalog.schemaVersion === 1, '지원하지 않는 데이터 형식');
    requireValue(['pending', 'ready', 'error'].includes(catalog.status), '데이터 상태 오류');
    requireValue(typeof catalog.reason === 'string', '데이터 상태 이유 필요');
    requireValue(catalog.asOf === null || validDate(catalog.asOf), '기준 시각 오류');
    requireValue(catalog.status !== 'ready' || validDate(catalog.asOf), '준비된 데이터의 기준 시각 필요');
    requireValue(Array.isArray(catalog.sellers) && Array.isArray(catalog.products), '판매처·상품 목록 필요');
    requireValue(catalog.status === 'ready' || catalog.products.length === 0, '미검증 상태에 상품을 표시할 수 없음');
    const sellers = new Set();
    for (const seller of catalog.sellers) {
      requireValue(seller && typeof seller.id === 'string' && seller.id && !sellers.has(seller.id), '판매처 ID 오류');
      requireValue(typeof seller.name === 'string' && seller.name.trim() && sourceUrl(seller.officialUrl), '판매처 이름·공식 링크 필요');
      sellers.add(seller.id);
    }
    const ids = new Set();
    for (const product of catalog.products) {
      requireValue(product && typeof product.id === 'string' && product.id && !ids.has(product.id), '상품 ID 오류');
      ids.add(product.id);
      requireValue(product.verified === true && sellers.has(product.sellerId) && sourceUrl(product.sourceUrl), '검증된 판매처·출처 필요');
      requireValue(typeof product.name === 'string' && product.name.trim() && typeof product.spec === 'string', '상품 이름·규격 오류');
      requireValue(['live', 'gear'].includes(product.type), '상품 종류 오류');
      requireValue(validDate(product.observedAt) && Date.parse(product.observedAt) <= Date.parse(catalog.asOf), '관찰 시각 오류');
      requireValue(product.registeredAt === null || (validDate(product.registeredAt) && Date.parse(product.registeredAt) <= Date.parse(product.observedAt)), '실제 등록일 오류');
      requireValue(product.price === null || (product.price && product.price.currency === 'KRW' && Number.isFinite(product.price.amount) && product.price.amount >= 0), '상품 가격 오류');
      requireValue(product.shipping === null || (product.shipping && product.shipping.currency === 'KRW' && Number.isFinite(product.shipping.amount) && product.shipping.amount >= 0), '배송비 오류');
      requireValue(product.cumulativeSales === null || (Number.isSafeInteger(product.cumulativeSales) && product.cumulativeSales >= 0), '누적 판매량 오류');
      requireValue(product.available === undefined || product.available === null || typeof product.available === 'boolean', '카탈로그 판매 가능 상태 오류');
      requireValue(product.originalTitle === undefined || typeof product.originalTitle === 'string', '원래 상품명 오류');
      requireValue(product.periodSales === null || (product.periodSales && Number.isSafeInteger(product.periodSales.count) && product.periodSales.count >= 0 && validDate(product.periodSales.startAt) && validDate(product.periodSales.endAt) && Date.parse(product.periodSales.startAt) < Date.parse(product.periodSales.endAt) && Date.parse(product.periodSales.endAt) <= Date.parse(product.observedAt)), '기간 판매량 오류');
      const photo = product.photo;
      requireValue(product.observedCategoryLabels===undefined||Array.isArray(product.observedCategoryLabels)&&product.observedCategoryLabels.every(e=>e&&typeof e.label==='string'&&sourceUrl(e.url)&&sourceUrl(e.evidencePage)&&new URL(e.url).hostname.replace(/^www\./,'')===new URL(product.sourceUrl).hostname.replace(/^www\./,'')&&new URL(e.evidencePage).hostname.replace(/^www\./,'')===new URL(product.sourceUrl).hostname.replace(/^www\./,'')&&(e.observedAt===null||validDate(e.observedAt))), '판매처 카테고리 근거 오류');
      requireValue(photo && ['allowed', 'not_allowed', 'unknown'].includes(photo.usePermission), '사진 사용 가능 여부 필요');
      requireValue(photo.url === null || httpsUrl(photo.url), '사진 URL 오류');
      requireValue(photo.permissionEvidenceUrl === null || sourceUrl(photo.permissionEvidenceUrl), '사진 사용 근거 URL 오류');
      requireValue(photo.usePermission !== 'allowed' || (httpsUrl(photo.url) && sourceUrl(photo.permissionEvidenceUrl)), '사진 사용 허용 근거 필요');
    }
    return catalog;
  }
  const fishGroups = {all:'전체',guppy:'구피',platy:'플래티',molly:'몰리',cory:'코리도라스',tetra:'테트라',medaka:'메다카',betta:'베타',cichlid:'시클리드',rasbora:'라스보라',danio:'다니오',barb:'바브',goldfish:'금붕어·비단잉어',pleco:'안시·플레코·오토싱',loach:'로치·미꾸리',gourami:'구라미',rainbow:'레인보우',killifish:'킬리피쉬',other:'기타·미분류'};
  const livestockGroups = {
    fish:fishGroups,
    shrimp:{all:'전체',shrimp_red:'체리·레드·블러드메리',shrimp_yellow:'노랭이·골든백',shrimp_blue:'블루벨벳·블루드림',shrimp_orange:'오렌지·썬키스트',shrimp_rili:'릴리',shrimp_bee:'CRS·CBS·비쉬림프',shrimp_yamato:'야마토',shrimp_snow:'스노우볼',shrimp_mix:'믹스·혼합 세트',shrimp_wild:'생이',other:'기타·미분류'},
    aquatic_plant:{all:'전체',plant_moss:'모스·리시아',plant_anubias:'나나·아누비아스',plant_buce:'부세파란드라',plant_fern:'미크로소리움·볼비티스',plant_rotala:'로탈라',plant_ludwigia:'루드위지아',plant_hygro:'하이그로필라',plant_crypto:'크립토코리네',plant_small:'펄·글로소·헤어글라스',plant_float:'부상·수생식물',plant_set:'모듬·세트',other:'기타·미분류'},
    snail:{all:'전체',snail_apple:'애플스네일',snail_trumpet:'트럼펫·뾰족달팽이',snail_nerite:'네리트',snail_ramshorn:'램즈혼',snail_pond:'우렁이',other:'기타·미분류'},
  };
  const groupRules = {
    fish:{guppy:/구피|\bguppy\b/i,platy:/플래티(?!넘|늄)|플레티(?!넘|늄)|\bplaty\b/i,molly:/몰리|\bmolly\b/i,cory:/코리(?!안)|\bcorydoras\b/i,tetra:/테트라|\btetra\b/i,medaka:/메다카|\bmedaka\b/i,betta:/베타|\bbetta\b/i,cichlid:/시클리드|씨클리드|아피스토|디스커스|엔젤피쉬|엔젤피시|프론토사|탕어|\bcichlid\b|\bapistogramma\b|\bdiscus\b/i,rasbora:/라스보라|\brasbora\b/i,danio:/다니오|\bdanio\b/i,barb:/바브|\bbarb\b/i,goldfish:/금붕어|난주|오란다|수포안|비단잉어|\bgoldfish\b/i,pleco:/안시|플레코|비파|오토싱|\bpleco\b|\botocinclus\b/i,loach:/로치|미꾸리|미꾸라지|\bloach\b/i,gourami:/구라미|\bgourami\b/i,rainbow:/레인보우|\brainbowfish\b/i,killifish:/킬리피쉬|킬리피시|\bkillifish\b/i},
    shrimp:{shrimp_red:/체리|사쿠라|블러드메리|빨간|\bcherry\b/i,shrimp_yellow:/노랭이|골든백|노랑|옐로우|\byellow\b/i,shrimp_blue:/블루벨벳|블루드림|블루새우|\bblue\b/i,shrimp_orange:/오렌지|썬키스트|\borange\b/i,shrimp_rili:/릴리|\brili\b/i,shrimp_bee:/\bCRS\b|\bCBS\b|레드비|블랙비|비쉬림프/i,shrimp_yamato:/야마토|아마노|\bamano\b/i,shrimp_snow:/스노우볼|\bsnowball\b/i,shrimp_wild:/생이/},
    aquatic_plant:{plant_moss:/모스|리시아|\bmoss\b/i,plant_anubias:/나나(?!스말)|아누비아스|\banubias\b/i,plant_buce:/부세\s*파란드라|\bbucephalandra\b/i,plant_fern:/미크로소리움|볼비티스|자바펀|\bmicrosorum\b|\bbolbitis\b/i,plant_rotala:/로탈라|\brotala\b/i,plant_ludwigia:/루드위지아|\bludwigia\b/i,plant_hygro:/하이그로필라|\bhygrophila\b/i,plant_crypto:/크립토코리네|\bcryptocoryne\b/i,plant_small:/쿠바펄|진주펄|몬테카를로|글로소|헤어글라스/i,plant_float:/부상|부레옥잠|개구리밥|물배추|살비니아|가가부타|연꽃|수련/i},
    snail:{snail_apple:/애플\s*(?:스네일|달팽이)|\bapple\s+snail\b/i,snail_trumpet:/트럼펫|뾰족달팽이|\btrumpet\b/i,snail_nerite:/네리트|네리티나|\bnerite\b/i,snail_ramshorn:/램즈혼|램스혼|\bramshorn\b/i,snail_pond:/우렁이/},
  };
  const searchText = value => String(value).toLowerCase().replace(/플레티/g, '플래티');
  Object.assign(fishGroups,{swordtail:'소드테일',puffer:'복어',goby:'고비',catfish:'캣피쉬·메기',channa:'찬나',arowana:'아로와나',native:'강준치·갈겨니·납자루'});
  fishGroups.killifish='킬리피쉬·램프아이';
  Object.assign(livestockGroups.aquatic_plant,{plant_ambulia:'암브리아·림노필라',plant_bacopa:'바코바·쿠페아',plant_myrio:'미리오필름·밀리오필룸',plant_val:'발리스네리아',plant_didiplis:'디디플리스',plant_echino:'에키노도루스',plant_marimo:'마리모',plant_lobelia:'로베리아·카디날리스',plant_pogostemon:'포고스테몬',plant_alternanthera:'알테란테라',plant_anacharis:'아나카리스·검정말',plant_bamboo:'개운죽',plant_attached:'활착·부착 수초',plant_pot:'포트·조직배양 수초'});
  Object.assign(groupRules.fish,{swordtail:/소드테일|스워드|\bswordtail\b/i,puffer:/복어|\bpufferfish\b/i,goby:/고비|\bgoby\b/i,catfish:/캣피쉬|캣피시|메기|캣(?:\s|$)|\bcatfish\b/i,channa:/찬나|\bchanna\b/i,arowana:/아로와나|\barowana\b/i,native:/강준치|갈겨니|납자루|모래무지|버들치|피라미/});
  groupRules.fish.killifish=/킬리피쉬|킬리피시|램프아이|\bkillifish\b/i;
  groupRules.fish.cory=/코리(?:도라스|(?=$|[\s()[\]0-9]))|\bcorydoras\b/i;
  groupRules.fish.loach=/(?<!브)로치|미꾸리|미꾸라지|\bloach\b/i;
  groupRules.fish.cichlid=/시클리드|씨클리드|아피스토|디스커스|엔젤피쉬|엔젤피시|프론토사|탕어|라미네지|라미레지|세베럼|아카라|오스카|\bcichlid\b|\bapistogramma\b|\bdiscus\b/i;
  Object.assign(groupRules.aquatic_plant,{plant_ambulia:/암브리아|림노필라/i,plant_bacopa:/바코바|바코파|쿠페아/i,plant_myrio:/미리오필름|밀리오필룸|미디오\s*필름/i,plant_val:/발리스네리아/i,plant_didiplis:/디디플리스/i,plant_echino:/에키노도루스/i,plant_marimo:/마리모/i,plant_lobelia:/로베리아|카디날리스|카디널리스/i,plant_pogostemon:/포고스테몬/i,plant_alternanthera:/알테란테라/i,plant_anacharis:/아나카리스|검정말/i,plant_bamboo:/개운죽/i});
  groupRules.aquatic_plant.plant_rotala=/로탈라|로타라|\brotala\b/i;
  groupRules.aquatic_plant.plant_ludwigia=/루드위지아|루드지아|\bludwigia\b/i;
  groupRules.aquatic_plant.plant_hygro=/하이그로필라|하이글로빌라|하이그로|위스테리아|\bhygrophila\b/i;
  groupRules.aquatic_plant.plant_small=/쿠바펄|진주펄|펄그라스|몬테카를로|글로소|글롯소|헤어글라스/i;
  function livestockClassification(product) {
    if (product.verified !== true || product.type !== 'live' || !groupRules[product.subtype]) return null;
    const title = [product.name, product.originalTitle || ''].join(' ');
    const classified=(key,basis)=>({key,basis});
    if (/사료|먹이|모형|인조|장식|치료제|제거제|약품|캣피쉬밥|구피밥|코리밥/.test(title)) return classified('other','ambiguous_or_non_livestock_title');
    if(product.subtype==='aquatic_plant'&&/모듬|모둠|수초\s*세트|[2-9]\d?\s*종\s*세트/.test(title))return classified('plant_set','explicit_title');
    if(product.subtype==='shrimp'){
      if(groupRules.shrimp.shrimp_yamato.test(title))return classified('shrimp_yamato','explicit_title');
      if(groupRules.shrimp.shrimp_rili.test(title))return classified('shrimp_rili','explicit_title');
      if(/믹스|[2-9]\s*종\s*세트/.test(title))return classified('shrimp_mix','explicit_title');
    }
    if(product.subtype==='snail'&&groupRules.snail.snail_apple.test(title))return classified('snail_apple','explicit_title');
    const rules=groupRules[product.subtype];
    const titleMatches = Object.keys(rules).filter(key => rules[key].test(title));
    const matches=product.subtype==='shrimp'&&titleMatches.length>1?titleMatches.filter(k=>k!=='shrimp_wild'):titleMatches;
    if(matches.length)return classified(matches.length===1?matches[0]:'other',matches.length===1?'explicit_title':'conflicting_title_groups');
    if(product.subtype==='aquatic_plant'){
      if(/활착|부착형/.test(title))return classified('plant_attached','explicit_title_form');
      if(/포트|조직\s*배양|화분/.test(title))return classified('plant_pot','explicit_title_form');
    }
    let category = product.discoveryCategoryUrl || '';
    try { category = decodeURIComponent(new URL(category).pathname); } catch { category = ''; }
    if(Array.isArray(product.observedCategoryLabels))category+=' '+product.observedCategoryLabels.map(e=>e.label).join(' ');
    const categoryMatches=Object.keys(rules).filter(key=>rules[key].test(category));
    return classified(categoryMatches.length===1?categoryMatches[0]:'other',categoryMatches.length===1?'observed_retailer_category':'insufficient_or_conflicting_evidence');
  }
  // Navigation collections, not biological ranks. Every existing leaf stays in one collection.
  const livestockNavigation = {
    fish: [
      {key:'popular',label:'구피·메다카·베타',children:['guppy','platy','molly','swordtail','medaka','betta']},
      {key:'schooling',label:'테트라·라스보라 등',children:['tetra','rasbora','danio','barb','rainbow','killifish']},
      {key:'bottom',label:'코리·플레코·로치',children:['cory','pleco','loach','catfish']},
      {key:'cichlid_gourami',label:'시클리드·구라미',children:['cichlid','gourami']},
      {key:'large_native',label:'아로와나·찬나·토종어',children:['arowana','channa','native']},
      {key:'other_named',label:'금붕어·복어·고비',children:['goldfish','puffer','goby']},
    ],
    shrimp: [
      {key:'color',label:'색상으로 찾기',children:['shrimp_red','shrimp_yellow','shrimp_blue','shrimp_orange','shrimp_snow']},
      {key:'pattern_set',label:'릴리·비쉬림프·혼합',children:['shrimp_rili','shrimp_bee','shrimp_mix']},
      {key:'yamato_wild',label:'야마토·생이',children:['shrimp_yamato','shrimp_wild']},
    ],
    aquatic_plant: [
      {key:'rotala_ludwigia',label:'로탈라·루드위지아 등',children:['plant_rotala','plant_ludwigia','plant_hygro','plant_ambulia','plant_myrio','plant_didiplis']},
      {key:'anubias_buce_fern',label:'나나·부세·양치류',children:['plant_anubias','plant_buce','plant_fern']},
      {key:'moss_small_float',label:'모스·작은수초·부상',children:['plant_moss','plant_small','plant_float']},
      {key:'other_plant_names',label:'그밖의 수초 이름',children:['plant_bacopa','plant_crypto','plant_val','plant_echino','plant_marimo','plant_lobelia','plant_pogostemon','plant_alternanthera','plant_anacharis','plant_bamboo']},
      {key:'form_set',label:'형태·세트로 찾기',children:['plant_set','plant_attached','plant_pot']},
    ],
    snail: [{key:'snail_names',label:'달팽이 이름으로 찾기',children:['snail_apple','snail_trumpet','snail_nerite','snail_ramshorn','snail_pond']}],
  };
  function navigationParent(subtype,leaf){return livestockNavigation[subtype]?.find(group=>group.children.includes(leaf))||null;}
  function livestockGroup(product){return livestockClassification(product)?.key??null;}
  function fishGroup(product){return product.subtype==='fish'?livestockGroup(product):null;}
  function validateSelectionFilters(filters) {
    requireValue(filters && ['live', 'gear'].includes(filters.type) && ['low', 'high', 'new', 'sales', 'observed'].includes(filters.sort) && [7, 30, 90, 'all'].includes(filters.days) && typeof filters.query === 'string' && (filters.includeUnknownRegistration === undefined || typeof filters.includeUnknownRegistration === 'boolean') && (filters.subtype === undefined || ['all', 'fish', 'shrimp', 'aquatic_plant', 'snail'].includes(filters.subtype)), '잘못된 조회 조건');
    requireValue(filters.fishGroup === undefined || Object.hasOwn(fishGroups, filters.fishGroup), '잘못된 어종 조건');
    requireValue(filters.liveGroup === undefined || filters.liveGroup === 'all' || livestockGroups[filters.subtype] && Object.hasOwn(livestockGroups[filters.subtype], filters.liveGroup), '잘못된 생물 세부 분류');
    requireValue(filters.browseGroup === undefined || filters.browseGroup === 'all' || livestockNavigation[filters.subtype]?.some(group=>group.key===filters.browseGroup), '잘못된 탐색 그룹');
  }
  function selectionCandidates(catalog, filters, index) {
    const needle = searchText(filters.query.trim());
    const effectiveFishGroup=filters.fishGroup&&filters.fishGroup!=='all'?filters.fishGroup:filters.liveGroup||'all';
    let rows = catalog.products.filter(p => p.type === filters.type && (filters.type !== 'live' || filters.subtype === undefined || filters.subtype === 'all' || p.subtype === filters.subtype) && (filters.type !== 'live' || filters.subtype !== 'fish' || effectiveFishGroup === 'all' || (index ? index.get(p).group : fishGroup(p)) === effectiveFishGroup) && (index ? index.get(p).search.some(value => value.includes(needle)) : [p.name, p.originalTitle || '', p.spec].some(value => searchText(value).includes(needle))));
    if(filters.type==='live'&&filters.subtype!=='fish'&&filters.subtype!=='all'&&filters.liveGroup&&filters.liveGroup!=='all')rows=rows.filter(p=>(index ? index.get(p).group : livestockGroup(p))===filters.liveGroup);
    const leaf=filters.subtype==='fish'?effectiveFishGroup:filters.liveGroup||'all';
    if(filters.type==='live'&&leaf==='all'&&filters.browseGroup&&filters.browseGroup!=='all'){
      const navigation=livestockNavigation[filters.subtype].find(group=>group.key===filters.browseGroup);
      rows=rows.filter(p=>navigation.children.includes((index ? index.get(p).group : livestockGroup(p))));
    }
    return rows;
  }
  function selectProducts(catalog, filters) {
    validateCatalog(catalog);
    return selectValidated(catalog, filters);
  }
  function selectValidated(catalog, filters, index, candidates) {
    validateSelectionFilters(filters);
    if (catalog.status !== 'ready') return { rows: [], reason: catalog.reason, excludedRegistration: 0, excludedPrice: 0, excludedSales: 0, startAt: null, endAt: null };
    const end = Date.parse(catalog.asOf), start = filters.days === 'all' ? null : end - filters.days * DAY;
    const startAt = start === null ? null : new Date(start).toISOString(), endAt = new Date(end).toISOString();
    let rows = candidates ?? selectionCandidates(catalog, filters, index);
    const unknownCount = rows.filter(p => p.registeredAt === null).length;
    const includeUnknown = (filters.days === 'all' || filters.includeUnknownRegistration === true) && filters.sort !== 'new';
    const excludedRegistration = includeUnknown ? 0 : unknownCount;
    const includedUnknownRegistration = includeUnknown ? unknownCount : 0;
    rows = rows.filter(p => p.registeredAt === null ? includeUnknown : filters.days === 'all' || Date.parse(p.registeredAt) >= start && Date.parse(p.registeredAt) <= end);
    const excludedPrice = rows.filter(p => p.price === null).length;
    if (filters.sort === 'low' || filters.sort === 'high') rows = rows.filter(p => p.price !== null);
    let excludedSales = 0;
    if (filters.sort === 'sales') {
      const matches = p => start === null ? p.cumulativeSales !== null : p.periodSales !== null && Date.parse(p.periodSales.startAt) === start && Date.parse(p.periodSales.endAt) === end;
      excludedSales = rows.filter(p => !matches(p)).length;
      rows = rows.filter(matches).sort((a, b) => start === null ? b.cumulativeSales - a.cumulativeSales : b.periodSales.count - a.periodSales.count);
    } else if (filters.sort === 'new') rows.sort((a, b) => Date.parse(b.registeredAt) - Date.parse(a.registeredAt));
    else if (filters.sort === 'observed') rows.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
    else rows.sort((a, b) => filters.sort === 'high' ? b.price.amount - a.price.amount : a.price.amount - b.price.amount);
    const missingSubtype = filters.type === 'live' && filters.subtype !== undefined && filters.subtype !== 'all' && !catalog.products.some(p => p.type === 'live' && p.subtype === filters.subtype);
    const reason = missingSubtype ? '현재 연결된 상품정보에 해당 생물이 없습니다. 모든 판매처의 품절·미판매를 뜻하지 않습니다.' : !catalog.products.some(p => p.type === filters.type) && filters.type === 'live' ? catalog.livestockNotice || '이번 연동에서 확인된 생물 상품이 없습니다.' : filters.sort === 'sales' && !rows.length ? '선택한 기간과 정확히 일치하는 실제 판매량이 없습니다. 누적 판매수로 기간 순위를 만들지 않습니다.' : filters.sort === 'new' && !rows.length && unknownCount ? '실제 상품 등록일이 확인되지 않아 신상품순으로 정렬할 수 없습니다. 관찰 시각으로 임의 정렬하지 않습니다.' : !rows.length ? '등록일·검색어·정렬 조건을 충족하는 확인 상품이 없습니다.' : '';
    const outputReason = filters.sort === 'sales' && !rows.length && start === null ? '판매처에서 확인된 실제 판매량이 없습니다. 클릭수·조회수로 판매순을 대신하지 않습니다.' : reason;
    return { rows, reason: outputReason, excludedRegistration, includedUnknownRegistration, excludedPrice, excludedSales, startAt, endAt };
  }

  function createCatalogQuery(input) {
    // Own a private immutable snapshot. Validation is never cached on input.
    const snapshot=structuredClone(input);
    validateCatalog(snapshot);
    const seen=new WeakSet();
    function freeze(value){
      if(value&&typeof value==='object'&&!seen.has(value)){
        seen.add(value);
        for(const child of Object.values(value))freeze(child);
        Object.freeze(value);
      }
      return value;
    }
    freeze(snapshot);
    const index=new Map(snapshot.products.map(p=>[p,{
      search:[p.name,p.originalTitle||'',p.spec].map(searchText),
      group:livestockGroup(p)
    }]));
    const sellers=new Map(snapshot.sellers.map(s=>[s.id,s]));
    const views=new Map();

    function view(filters){
      validateSelectionFilters(filters);
      // Key only the values actually read by selection, including inherited ones.
      // Unrelated properties must not change or break a valid query.
      filters={
        type:filters.type,subtype:filters.subtype,fishGroup:filters.fishGroup,
        liveGroup:filters.liveGroup,browseGroup:filters.browseGroup,
        sort:filters.sort,days:filters.days,query:filters.query,
        includeUnknownRegistration:filters.includeUnknownRegistration
      };
      const key=JSON.stringify(Object.values(filters));
      if(views.has(key))return views.get(key);

      const candidates=selectionCandidates(snapshot,filters,index);
      const result=selectValidated(snapshot,filters,index,candidates);
      const availability=Object.fromEntries(['sales','new'].map(sort=>{
        const selected=selectValidated(snapshot,{...filters,sort},index,candidates);
        return [sort,{
          available:snapshot.status==='ready'&&selected.rows.length>0,
          count:selected.rows.length,reason:selected.reason
        }];
      }));
      const baseFilters={
        ...filters,fishGroup:'all',liveGroup:'all',browseGroup:'all',
        sort:['sales','new'].includes(filters.sort)?'low':filters.sort
      };
      const sameScope=[filters.fishGroup,filters.liveGroup,filters.browseGroup]
        .every(value=>value===undefined||value==='all');
      const baseCandidates=sameScope?candidates:
        selectionCandidates(snapshot,baseFilters,index);
      const base=sameScope&&baseFilters.sort===filters.sort?result:
        selectValidated(snapshot,baseFilters,index,baseCandidates);
      const groups=livestockGroups[filters.subtype]||{all:'전체'};
      const groupCounts=Object.fromEntries(Object.keys(groups).map(k=>[k,0]));
      for(const p of base.rows){
        groupCounts.all++;
        const group=index.get(p).group;
        if(Object.hasOwn(groupCounts,group))groupCounts[group]++;
      }
      const value=freeze({result,availability,base,groupCounts});
      if(views.size>=32)views.delete(views.keys().next().value);
      views.set(key,value);
      return value;
    }
    return Object.freeze({
      catalog:snapshot,
      view,
      select:filters=>selectValidated(snapshot,filters,index),
      group:product=>index.get(product)?.group??null,
      seller:id=>sellers.get(id)
    });
  }

  function usablePhoto(product) { return product.photo.usePermission === 'allowed' ? product.photo.url : null; }
  const defaultFilters = Object.freeze({ type: 'live', subtype: 'all', fishGroup: 'all', liveGroup:'all', browseGroup:'all', sort: 'low', days: 'all', query: '', includeUnknownRegistration: true });
  function filtersFromSearch(search = '') {
    const params = new URLSearchParams(search), filters = { ...defaultFilters };
    for (const [key, allowed] of Object.entries({ type: ['live','gear'], subtype: ['all','fish','shrimp','aquatic_plant','snail'], fishGroup: Object.keys(fishGroups), sort: ['low','high','sales','new','observed'] })) if (allowed.includes(params.get(key))) filters[key] = params.get(key);
    const days = params.get('days'); if (days === 'all') filters.days = 'all'; else if (['7','30','90'].includes(days)) filters.days = Number(days);
    const group=params.get('liveGroup');if(group&&livestockGroups[filters.subtype]&&Object.hasOwn(livestockGroups[filters.subtype],group))filters.liveGroup=group;
    if(!params.has('subtype')&&params.has('fishGroup')&&filters.fishGroup!=='all')filters.subtype='fish';
    if(filters.subtype==='fish'&&filters.liveGroup!=='all'){if(!params.has('fishGroup'))filters.fishGroup=filters.liveGroup;filters.liveGroup='all';}
    const browse=params.get('browseGroup');if(livestockNavigation[filters.subtype]?.some(group=>group.key===browse))filters.browseGroup=browse;
    const leaf=filters.subtype==='fish'?filters.fishGroup:filters.liveGroup;if(leaf!=='all')filters.browseGroup='all';
    filters.query = params.get('query') ?? params.get('q') ?? '';
    const unknown = params.get('includeUnknownRegistration') ?? params.get('includeUnknown'); if (unknown === 'true' || unknown === 'false') filters.includeUnknownRegistration = unknown === 'true';
    return filters;
  }
  function sortAvailability(catalog, filters) {
    return Object.fromEntries(['sales','new'].map(sort => { const result = selectProducts(catalog, { ...filters, sort }); return [sort, { available: catalog.status === 'ready' && result.rows.length > 0, count: result.rows.length, reason: result.reason }]; }));
  }
  function filtersToSearch(filters,search=''){
    const params=new URLSearchParams(search);for(const key of ['type','subtype','fishGroup','liveGroup','browseGroup','sort','days','query','q','includeUnknownRegistration','includeUnknown'])params.delete(key);
    for(const [key,value]of Object.entries(filters))if(Object.hasOwn(defaultFilters,key)&&value!==defaultFilters[key])params.set(key,String(value));
    const text=params.toString();return text?'?'+text:'';
  }
  return { validateCatalog, createCatalogQuery, selectProducts, usablePhoto, httpsUrl, sourceUrl, fishGroup, fishGroups, livestockGroup, livestockClassification, livestockGroups, livestockNavigation, navigationParent, defaultFilters, filtersFromSearch, filtersToSearch, sortAvailability };
});
