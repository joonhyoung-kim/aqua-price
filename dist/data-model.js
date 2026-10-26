(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./gear-taxonomy.js') : root.AquaGear);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AquaCatalog = api;
})(typeof globalThis === 'object' ? globalThis : this, function (gearTaxonomy) {
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
      requireValue(product.observedCategoryLabels===undefined||Array.isArray(product.observedCategoryLabels)&&product.observedCategoryLabels.every(e=>e&&typeof e.label==='string'&&(e.ancestorLabels===undefined||Array.isArray(e.ancestorLabels)&&e.ancestorLabels.every(label=>typeof label==='string'))&&sourceUrl(e.url)&&sourceUrl(e.evidencePage)&&new URL(e.url).hostname.replace(/^www\./,'')===new URL(product.sourceUrl).hostname.replace(/^www\./,'')&&new URL(e.evidencePage).hostname.replace(/^www\./,'')===new URL(product.sourceUrl).hostname.replace(/^www\./,'')&&(e.observedAt===null||validDate(e.observedAt))), '판매처 카테고리 근거 오류');
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
  const searchText = value => canonical(value);
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
  const gearNavigation=gearTaxonomy.navigation,gearCategories=gearTaxonomy.categories,gearGroups=gearTaxonomy.groups;
  const gearClassification=gearTaxonomy.classification,gearParent=gearTaxonomy.parent;
  const gearKeyCache=new WeakMap();
  const gearGroup=product=>{if(gearKeyCache.has(product))return gearKeyCache.get(product);const key=gearClassification(product)?.key??null;if(Object.isFrozen(product))gearKeyCache.set(product,key);return key;};
  // Only explicit public price/offer facts are used. Zero is not proof of free.
  function comparisonStatus(p) {
    const text=[p.name,p.originalTitle||'',p.spec||''].join(' ');
    if(/매장\s*(?:판매\s*)?전용|방문\s*판매|가격\s*문의|견적\s*(?:문의|의뢰|요청)|전화\s*문의/.test(text))return {comparable:false,label:'매장·문의 상품'};
    if(p.price===null)return {comparable:false,label:'가격 미확인'};
    if(p.price.amount===0){
      const free=/(?:무료\s*나눔|무료\s*분양)/.test(text)&&!/(구매\s*시|이상\s*구매|사은|증정|조건부)/.test(text);
      return {comparable:free,label:free?'무료 나눔·분양 표시':'0원 표시 · 판매가격 확인 필요'};
    }
    return {comparable:true,label:'확인된 판매가격'};
  }
  // Reviewed exact aliases only; generic “pro”, model digits and species are never expanded.
  const aliases=[['섭스트라트 프로','섭스프로','substrat pro'],['시켐 프라임','seachem prime'],['에하임','eheim'],['시켐','seachem'],['플래티','플레티'],['판다','팬더']];
  const compact=v=>String(v).toLowerCase().replace(/[\s‐‑–-]+/g,'');
  const aliasPairs=aliases.flatMap(g=>g.slice(1).map(a=>[compact(a),compact(g[0])]));
  function canonical(value){let s=compact(value);for(const [a,b] of aliasPairs)if(s.includes(a))s=s.replaceAll(a,b);return s;}
  function queryTokens(value){let s=String(value).toLowerCase();for(const group of aliases)for(const alias of group)s=s.replaceAll(alias,group[0].replace(/\s/g,''));return s.trim().split(/\s+/).filter(Boolean).map(canonical);}
  const factsCache=new WeakMap();
  function purchaseFacts(p){
    if(factsCache.has(p))return factsCache.get(p);
    const title=p.originalTitle||p.name,spec=(p.spec||'').replace(/^판매단위\/옵션:\s*/,'');
    const counts=text=>[...text.matchAll(/(?<![\d.])(\d+)\s*(마리|쌍|개)(?!월)/g)].map(m=>({count:Number(m[1]),unit:m[2]}));
    const unsafe=text=>/\d\s*\+\s*\d|사은|증정|최소|이상\s*(?:구매|주문)|랜덤\s*수량|\d+\s*[-~～]\s*\d+\s*(?:마리|개|쌍)|\d\s*(?:마리|개|쌍)\s*[/,]/.test(text);
    const unique=values=>[...new Map(values.map(v=>[v.count+v.unit,v])).values()];
    const titleCounts=unique(counts(title)),specCounts=unique(counts(spec));
    const pairs=Number.isSafeInteger(p.pairsPerPack)&&p.pairsPerPack>0?p.pairsPerPack:null;
    const quantity=Number.isSafeInteger(p.quantityPerPack)&&p.quantityPerPack>0?p.quantityPerPack:null;
    let count=pairs||quantity,unit=pairs?'쌍':p.type==='live'&&['fish','shrimp','snail'].includes(p.subtype)?'마리':'개',basis=count?'저장된 수량 근거':'',reason='';
    const optionConfirmed=!!p.variantId&&specCounts.length===1&&!unsafe(spec)&&(!count||specCounts[0].count===count&&specCounts[0].unit===unit);
    if(optionConfirmed){({count,unit}=specCounts[0]);basis='확인된 선택 옵션';if(titleCounts.some(x=>x.count!==count||x.unit!==unit))reason='선택 옵션 수량 우선 · 원문 제목의 수량과 다름';}
    else if(specCounts.length>1||p.type==='gear'&&/포함|세트|[+×*]/.test(title)||unsafe(spec)||unsafe(title)||titleCounts.length>1||count&&titleCounts.length===1&&(titleCounts[0].count!==count||titleCounts[0].unit!==unit)||count&&specCounts.length===1&&(specCounts[0].count!==count||specCounts[0].unit!==unit)){count=null;reason='수량·옵션 충돌 또는 복합 구성 · 단가 계산 보류';}
    else if(!count){const candidates=specCounts.length?specCounts:!p.variantId?titleCounts:[];if(candidates.length===1){({count,unit}=candidates[0]);basis=specCounts.length?'규격에 명시된 수량':'상품명에 명시된 수량';}else if(p.variantId&&titleCounts.length)reason='옵션별 수량 근거 미확인 · 제목만으로 계산 보류';}
    if(count!==null&&(!Number.isSafeInteger(count)||count<=0)){count=null;reason='유효한 구매 수량 미확인';}
    let volume=null;
    const gearKey=/에하임.*섭스트라트프로/.test(canonical(title))&&!/세트|포함|외부|부품|플러스|plus|\+/.test(title)?'media_bio':gearGroup(p),volumeEligible=p.type==='gear'&&/^(media_|feed_|conditioner$|bacteria$|water_adjuster$|plant_fertilizer$|marine_salt$)/.test(gearKey||'');
    if(volumeEligible&&!unsafe(title)&&!unsafe(spec)&&!/[+×*]|세트|포함|리필용기|빈\s*용기/.test(title+' '+spec)){
      const units=text=>[...text.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)\s*(ml|mL|ML|L|l|리터|kg|KG|Kg|g|G)(?![a-zA-Z/])/g)].map(m=>({amount:Number(m[1])*(/^(?:l|리터|kg)$/i.test(m[2])?1000:1),dimension:/^(?:l|ml|리터)$/i.test(m[2])?'volume':'mass'}));
      const a=units(title),b=units(spec),values=[...new Map([...a,...b].map(x=>[x.dimension+x.amount,x])).values()];
      if(values.length===1&&values[0].amount>0&&Number.isFinite(values[0].amount)&&!reason&&(!p.variantId||b.length>0)){volume={...values[0],amount:values[0].amount*(count&&unit==='개'?count:1),basis:'상품명·규격에 명시된 내용량'};}
      else if(values.length>1)reason='용량·옵션 충돌 · 단가 계산 보류';
    }
    let baseName=p.name;
    if(count&&(!reason||optionConfirmed))baseName=baseName.replace(/\d+\s*(?:마리|쌍|개)(?:입|\s*묶음)?/g,'').replace(/\[\s*\]|\(\s*\)/g,'').replace(/\s+/g,' ').trim();
    const option=spec&&!/^(?:미확인|Retailer concrete offer|기본)$/i.test(spec)?spec:count?count+unit:volume?formatQuantity(volume):'옵션·수량 미확인';
    const result={count,unit,basis,reason,volume,baseName:baseName||p.name,option,optionConfirmed};
    if(Object.isFrozen(p))factsCache.set(p,result);return result;
  }
  function comparisonUnit(p){
    if(!comparisonStatus(p).comparable||!p.price)return null;
    const f=purchaseFacts(p);if(f.volume){const scale=f.volume.dimension==='volume'?1000:100,unit=f.volume.dimension==='volume'?'L':'100g',key=/에하임.*섭스트라트프로/.test(canonical(p.name))?'media_bio':gearGroup(p);return {amount:p.price.amount/f.volume.amount*scale,unit,count:f.volume.amount,scope:'gear:'+key+':'+unit,label:(gearGroups[key]||'용품')+' · '+unit,basis:f.volume.basis};}
    if(f.count&&p.type==='live'&&['마리','쌍'].includes(f.unit)){const key=livestockGroup(p)||p.subtype;return {count:f.count,unit:f.unit,amount:p.price.amount/f.count,scope:'live:'+key+':'+f.unit,label:(livestockGroups[p.subtype]?.[key]||subtypeLabel(p.subtype))+' · '+f.unit,basis:f.basis};}
    return null;
  }
  function subtypeLabel(type){return {fish:'물고기',shrimp:'새우',snail:'달팽이'}[type]||type;}
  function exactIdentity(p){
    const f=purchaseFacts(p),text=canonical(p.name+' '+p.spec);
    // Narrow reviewed family: exclude filters, sets, spare parts and Pro Plus.
    if(p.type==='gear'&&/에하임/.test(text)&&/섭스트라트프로/.test(text)&&!(/플러스|plus|세트|포함|외부|부품|교체|본체|221\d|\+/.test(text))&&f.volume?.dimension==='volume')return {key:'eheim:substrat-pro:'+f.volume.amount+':single-media',label:'에하임 섭스트라트 프로 '+f.volume.amount/1000+'L · 여과재 단품',basis:'확인된 브랜드·제품군·내용량·단품 구성'};
    const i=p.comparisonIdentity;
    if(i?.verified===true&&httpsUrl(i.evidenceUrl)){
      const fields=p.type==='gear'?['brand','model','specification','contents']:['species','size','sex','grade','quantity'];
      if(fields.every(k=>typeof i[k]==='string'&&i[k].trim()))return {key:p.type+':'+JSON.stringify(fields.map(k=>i[k])),label:fields.map(k=>i[k]).join(' · '),basis:'판매처 근거로 확인된 동일 조건'};
    }
    return null;
  }
  function compareSellers(rows){const map=new Map();for(const p of rows){const id=exactIdentity(p);if(!id)continue;if(!map.has(id.key))map.set(id.key,{...id,offers:[]});map.get(id.key).offers.push(p);}return [...map.values()].filter(g=>new Set(g.offers.map(p=>p.sellerId)).size>1).map(g=>({...g,offers:g.offers.slice().sort((a,b)=>(a.price?.amount??Infinity)-(b.price?.amount??Infinity))}));}
  function estimatePurchase(p,wanted=1,policy=null,now=Date.now()){
    if(!Number.isSafeInteger(wanted)||wanted<1||wanted>100000)return {reason:'희망 수량은 1~100000 정수로 입력하세요.',total:null};
    const f=purchaseFacts(p);if(!f.count||f.reason&&!f.optionConfirmed||!comparisonStatus(p).comparable)return {reason:f.reason||'묶음 수량 미확인 · 금액 계산 보류',total:null};
    const minimum=p.minimumOrderPacks??(policy?.verified===true&&policy.sellerId===p.sellerId?policy.minimumOrderPacks:undefined)??1;
    if(!Number.isSafeInteger(minimum)||minimum<1)return {reason:'최소 주문 조건 미확인',total:null};
    const packs=Math.max(minimum,Math.ceil(wanted/f.count)),actual=packs*f.count,subtotal=packs*p.price.amount;
    if(!Number.isSafeInteger(subtotal)||!Number.isSafeInteger(actual))return {reason:'계산 범위 초과',total:null};
    const r={wanted,packs,actual,unit:f.unit,subtotal,minimumConfirmed:p.minimumOrderPacks!==undefined||policy?.verified===true&&policy.sellerId===p.sellerId&&policy.minimumOrderPacks!==undefined,shipping:null,packaging:null,total:null,reason:'배송비·추가 비용 미확인 · 상품금액만 계산'};
    if(!policy||policy.verified!==true||policy.sellerId!==p.sellerId||!httpsUrl(policy.evidenceUrl)||!validDate(policy.observedAt)||Date.parse(policy.observedAt)>now||now-Date.parse(policy.observedAt)>7*DAY||policy.conditionsComplete!==true)return r;
    if(!r.minimumConfirmed)return {...r,reason:'최소 주문 조건 미확인 · 합계 보류'};
    const amount=policy.amount,threshold=policy.freeThreshold;
    if(!Number.isSafeInteger(amount)||amount<0||threshold!==null&&(!Number.isSafeInteger(threshold)||threshold<0)||!['order','pack'].includes(policy.chargeUnit))return r;
    r.shipping=threshold!==null&&subtotal>=threshold?0:amount*(policy.chargeUnit==='pack'?packs:1);
    const fee=policy.packaging;
    if(!fee||!Number.isSafeInteger(fee.amount)||fee.amount<0||!['order','box'].includes(fee.unit))return {...r,reason:'포장비 조건 미확인 · 합계 보류'};
    if(fee.unit==='box'&&(!Number.isSafeInteger(fee.packsPerBox)||fee.packsPerBox<1))return {...r,reason:'박스당 포장 수량 미확인 · 합계 보류'};
    r.packaging=fee.amount*(fee.unit==='box'?Math.ceil(packs/fee.packsPerBox):1);r.total=subtotal+r.shipping+r.packaging;r.reason='확인된 일반 배송 조건의 예상 합계';return r;
  }
  function relativeObservation(p,now=Date.now()){const age=observationAge(p,now);if(age.days===null)return '확인 시각 미확인';const hours=Math.floor((now-Date.parse(p.observedAt))/3600000);return (hours<1?'방금 확인':hours<24?hours+'시간 전 확인':age.days+'일 전 확인')+(age.stale?' · 재확인 필요':'');}
  function sellerDisplay(s){return ({'sonstory.co.kr':'손이야기','sulawesishrimpmart.com':'스테이아쿠아랩 (슬라웨시새우마트)'})[s.id]||s.name;}
  function createSuggestionIndex(products,normalize=canonical){
    const rows=[];for(const p of products){const label=p.name;for(const token of [label,...label.split(/\s+/).slice(0,8)]){const key=normalize(token);if(key.length>1)rows.push({key,label,type:p.type});}}
    for(const group of aliases)if(products.some(p=>canonical(p.name).includes(canonical(group[0]))))for(const label of group)rows.push({key:canonical(label),label,type:null});
    rows.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
    return (input,type)=>{const key=canonical(input);if(key.length<1)return [];let lo=0,hi=rows.length;while(lo<hi){const mid=(lo+hi)>>1;if(rows[mid].key<key)lo=mid+1;else hi=mid;}const out=new Set();for(let i=lo;i<rows.length&&rows[i].key.startsWith(key)&&out.size<8;i++)if(type==='all'||!rows[i].type||rows[i].type===type)out.add(rows[i].label);return [...out];};
  }
  function createLocalLibrary(storage){
    let value={recent:[],favorites:[],saved:[]},persistent=!!storage;
    try{const raw=storage?.getItem('aqua-library-v1');if(raw){const p=JSON.parse(raw);if(p&&typeof p==='object'){value.recent=Array.isArray(p.recent)?p.recent.filter(s=>typeof s==='string'&&s.length<=200).slice(0,10):[];value.favorites=Array.isArray(p.favorites)?p.favorites.filter(x=>x&&typeof x.id==='string'&&typeof x.name==='string').slice(0,100):[];value.saved=Array.isArray(p.saved)?p.saved.filter(x=>x&&typeof x.search==='string'&&x.search.length<3000&&typeof x.label==='string').slice(0,10):[];}}}catch{persistent=false;}
    const save=()=>{try{if(!storage)throw Error();storage.setItem('aqua-library-v1',JSON.stringify(value));}catch{persistent=false;}};
    return {read:()=>structuredClone(value),persistent:()=>persistent,search(q){if(q.trim()){value.recent=[q.trim(),...value.recent.filter(x=>x!==q.trim())].slice(0,10);save();}},favorite(p){const exists=value.favorites.some(x=>x.id===p.id);value.favorites=exists?value.favorites.filter(x=>x.id!==p.id):[...value.favorites,{id:p.id,name:p.name}].slice(-100);save();},saveCondition(label,search){value.saved=[{label,search},...value.saved.filter(x=>x.search!==search)].slice(0,10);save();},removeCondition(i){value.saved.splice(i,1);save();},clear(){value={recent:[],favorites:[],saved:[]};save();}};
  }

  function unitPrice(p){
    if(!comparisonStatus(p).comparable||!p.price)return null;
    const f=purchaseFacts(p);if(f.reason&&!f.optionConfirmed)return null;if(f.volume)return comparisonUnit(p);
    return f.count?{count:f.count,unit:f.unit,amount:p.price.amount/f.count}:null;
  }
  function observationAge(p,now=Date.now()){
    const stamp=Date.parse(p.observedAt);if(!Number.isFinite(stamp)||stamp>now)return {days:null,stale:false};
    const days=Math.floor((now-stamp)/DAY);return {days,stale:now-stamp>7*DAY};
  }
  function groupOffers(rows){
    const groups=[],known=new Map();
    for(const p of rows){
      let key=p.id;
      if(p.variantId){const u=new URL(p.sourceUrl);u.searchParams.delete('item_code');u.hash='';u.searchParams.sort();key=p.sellerId+'|'+u.href;}
      if(!known.has(key)){const group={key,offers:[]};known.set(key,group);groups.push(group);}
      known.get(key).offers.push(p);
    }
    return groups;
  }
  function offerSpec(p){const f=purchaseFacts(p);const models=p.type==='gear'?(p.name.match(/(?:[A-Z]{1,6}[ -]?\d{2,5}[A-Z]?|\b22\d{2}\b)/g)||[]):[];const extras=[...new Set(models)].filter(x=>!canonical(f.option).includes(canonical(x)));const raw=p.type==='gear'&&f.option.includes('미확인')?[...new Set(p.name.match(/\d+(?:\.\d+)?\s*(?:kg|mg|g|mL|ml|L|리터)(?![a-z])/gi)||[])]:[];return f.option+(raw.length?' · 상품명 표기 '+raw.join(' / ')+' (구성 확인 필요)':'')+(extras.length?' · 모델 표기 '+extras.join(' / '):'');}
  function formatQuantity(v){const large=v.amount>=1000;return (large?v.amount/1000:v.amount)+(v.dimension==='volume'?(large?'L':'mL'):(large?'kg':'g'));}
  const roleLabels={all:'모든 구성',body:'본체',part:'부품',consumable:'소모품',set:'세트',unknown:'구성 미확인'};
  function productRole(p){
    if(p.type!=='gear')return {key:'unknown',label:roleLabels.unknown,basis:'용품 외 항목'};
    const c=gearClassification(p),t=(p.name+' '+(p.originalTitle||'')).normalize('NFKC');let key='unknown';
    if(c?.key?.endsWith('_parts')||c?.key==='plumbing')key='part';
    else if(/(?:세트|패키지|여과재\s*포함|[+]\s*링여과재)/i.test(t)||c?.key?.endsWith('_set'))key='set';
    else if(/^(?:media_|feed_|plant_fertilizer|conditioner|bacteria|water_adjuster|medication|marine_salt)/.test(c?.key||''))key='consumable';
    else if(/^(?:filter_|air_pump|water_pump|light_led|light_other|heater|chiller|cooling_fan|sterilizer|tank_only|marine_skimmer|marine_reactor)/.test(c?.key||''))key='body';
    if(key==='body'&&c?.key==='tank_only'&&/(?:수조용|어항용|수조|큐브|슬림).{0,30}매트/.test(t))key='part';
    if(key==='body'&&/여과기용|보조\s*외부여과기/.test(t))key='unknown';
    if(key==='body'&&c?.key==='filter_external'){
      const model=/(?:\b[a-z]{1,6}[ -]?\d{2,5}[a-z]?\b|\b22\d{2}\b|클래식\s*\d{2,4})/i.test(t);
      const category=(p.observedCategoryLabels||[]).some(e=>/외부\s*여과기/.test(typeof e==='string'?e:e.label||''));
      if(!model&&!category)key='unknown';
    }
    return {key,label:roleLabels[key],basis:key==='unknown'?'본체·보조 장치 구성 근거 부족':('제품 유형 '+(gearGroups[c?.key]||'미확인')+' · '+c.basis)};
  }
  function relevance(p,query){const q=canonical(query),t=canonical(p.name),role=productRole(p).key;const part=/호스|고무링|패킹|입수관|출수관|부품|임펠라|임펠러/.test(q);let score=t===q?100:0;if(/여과기|filter/.test(q)&&p.type==='gear')score+=part?(role==='part'?50:0):(role==='body'?50:role==='set'?25:0);return score;}
  function resolveUnitScope(rows,filters){
    if(filters.sort!=="unit")return {filters:{unitScope:""},scopes:[],changed:!!filters.unitScope,needsSelection:false,noComparable:false};
    const scopes=new Map();for(const p of rows){const u=comparisonUnit(p);if(u)scopes.set(u.scope,{label:u.label,unit:u.unit});}
    const previous=filters.unitScope||'';let selected=filters.sort==='unit'&&scopes.has(previous)?previous:'';
    if(filters.sort==='unit'&&!selected&&scopes.size===1)selected=scopes.keys().next().value;
    return {filters:{unitScope:selected},scopes:[...scopes].map(([value,info])=>({value,...info})),changed:previous!==selected,needsSelection:filters.sort==='unit'&&!selected&&scopes.size>0,noComparable:filters.sort==='unit'&&scopes.size===0};
  }
  const guidance={
  "checkedAt":"2026-10-26",
  "species":[
    {"id":"Paracheirodon innesi","label":"네온테트라","sourceUrl":"https://www.seriouslyfish.com/species/paracheirodon-innesi","temperature":[21,25],"ph":[4,7.5],"adultCm":3,"sizeBasis":"SL: 꼬리지느러미 제외 표준체장","tankBaseCm":[60,30],"difficulty":"조건 관리","diet":"작은 건조 먹이와 냉동·생먹이를 다양하게 제공","reason":"안정된 수온과 수질, 8~10마리 이상 군영을 고려","compatibility":"대체로 온순하나 상대 크기·성향과 은신처를 확인. 합사·치새우 안전을 보장하지 않음","sourceScope":"종별 참고 자료, 개별 판매 생물의 동정 아님"},
    {"id":"Poecilia reticulata","label":"구피","sourceUrl":"https://www.seriouslyfish.com/species/poecilia-reticulata","temperature":[17,28],"ph":[7,8.5],"adultCm":6,"sizeBasis":"SL: 꼬리지느러미 제외 표준체장","tankBaseCm":[45,30],"difficulty":"조건 관리","diet":"사육 개체는 대부분의 먹이에 적응","reason":"중경수 이상과 약한 수류를 고려. 과번식·수컷의 추적 관리 필요","compatibility":"지느러미를 무는 어종을 피함. 치어·치새우 합사 안전 보장 없음","sourceScope":"종별 참고 자료, 엔들러·교잡종에 자동 적용하지 않음"},
    {"id":"Neocaridina davidi","label":"체리새우","sourceUrl":"https://www.aquariumcoop.com/blogs/aquarium/cherry-shrimp-care","temperature":[22,24],"ph":[6.5,8.5],"adultCm":4,"sizeBasis":"암컷 최대 약 4cm, 수컷 2.5~3cm","tankBaseCm":null,"tankNote":"번식 군집에 10 US gal 이상을 선호한다는 출처 권장, 보편적 최소치 아님","difficulty":"조건 관리","diet":"성숙한 수조의 미생물막과 새우 먹이, 과급여 주의","reason":"GH/KH와 안정된 성숙 수조, 탈피·흡입구 보호가 필요","compatibility":"어류의 치새우 포식 위험. 번식은 새우 전용 수조를 고려","sourceScope":"22~24°C 쾌적 범위. 생존 범위 16~28°C와 구분"}
  ],
  "equipment":[
    {"id":"eheim-2213","model":"2213","label":"EHEIM classic250 / 2213","sourceUrl":"https://eheim.com/de_DE/ersatzteil-shop/technik/aussenfilter/classic/classic-250","filterMethod":"external","tankLitres":[80,250],"flowLph":440,"watts":8,"hose":"12/16","region":"EUR","frequencyHz":50,"verificationStatus":"reference_only","measurementBasis":"50Hz 명목 펌프 유량","caveat":"국내 60Hz 판매 옵션 사양 미확인. 실제 여과 유량·사육 적합성 보장 아님"},
    {"id":"eheim-2215","model":"2215","label":"EHEIM classic350 / 2215","sourceUrl":"https://eheim.com/ersatzteil-shop/technik/aussenfilter/classic/classic-350","filterMethod":"external","tankLitres":[120,350],"flowLph":620,"watts":15,"hose":"12/16","region":"EUR","frequencyHz":50,"verificationStatus":"reference_only","measurementBasis":"50Hz 명목 펌프 유량","caveat":"국내 60Hz 판매 옵션 사양 미확인. 실제 여과 유량·사육 적합성 보장 아님"},
    {"id":"eheim-substrat-pro","label":"EHEIM SUBSTRATpro","sourceUrl":"https://eheim.com/en_GB/aquatics/filter-media/biological/substratpro/","mediaPurpose":"biological","mediaMaterial":"sintered_glass","form":"구형","verificationStatus":"manufacturer_product_family","caveat":"담수·해수용. 부드럽게 세척 후 재사용. 판매 옵션의 용량은 별도 확인"}
  ]
}
;
  function careProfile(p){const i=p.careIdentity;if(i?.verified!==true||!httpsUrl(i.evidenceUrl)||!validDate(i.checkedAt))return null;return guidance.species.find(g=>g.id===i.species)||null;}
  function equipmentFacts(p){
    if(p.type!=='gear')return {};const role=productRole(p),key=gearGroup(p),t=p.name+' '+p.spec,f=purchaseFacts(p);
    const v={sourceUrl:p.sourceUrl,checkedAt:p.observedAt,verificationStatus:'retailer_explicit',volumeMl:f.volume?.dimension==='volume'?f.volume.amount:null,massG:f.volume?.dimension==='mass'?f.volume.amount:null};
    const methods={filter_external:'external',filter_sponge:'sponge',filter_hangon:'hangon',filter_internal:'internal',filter_top:'top',filter_bottom:'bottom'};
    if(role.key==='body'&&methods[key])v.filterMethod=methods[key];
    if(/^feed_/.test(key)){if(/구피/.test(t))v.feedTarget='guppy';else if(/새우/.test(t))v.feedTarget='shrimp';else if(/베타/.test(t))v.feedTarget='betta';v.feedBuoyancy=/침강/.test(t)&&!/부상/.test(t)?'sinking':/부상/.test(t)&&!/침강/.test(t)?'floating':null;const size=t.match(/(?:입자|알갱이)\s*(\d+(?:\.\d+)?)\s*mm/i);v.particleMm=size?Number(size[1]):null;}
    const identity=exactIdentity(p);if(identity?.key.startsWith('eheim:substrat-pro:')){v.mediaPurpose='biological';v.mediaMaterial='sintered_glass';v.form='구형';v.reference=guidance.equipment.find(g=>g.id==='eheim-substrat-pro');}
    if(role.key==='body'&&/에하임|eheim/i.test(t)){const models=[...new Set(t.match(/\b221[35]\b/g)||[])];if(models.length===1)v.reference=guidance.equipment.find(g=>g.model===models[0]);}
    const exact=p.equipmentIdentity;if(exact?.verified===true&&httpsUrl(exact.evidenceUrl)&&validDate(exact.checkedAt)){for(const k of ['tankLitres','flowLph','watts','hose','feedTarget','feedBuoyancy','particleMm','mediaPurpose','mediaMaterial'])if(exact[k]!==undefined)v[k]=exact[k];}
    return v;
  }
  const specialDefaults={careTemp:null,carePH:null,adultMax:null,tankLength:null,careDifficulty:'all',filterMethod:'all',tankLitres:null,flowMin:null,wattMax:null,hose:'all',feedTarget:'all',feedBuoyancy:'all',particleMax:null,mediaPurpose:'all',mediaMaterial:'all',volumeMin:null,massMin:null,includeUnknownGuidance:true};
  const specialEnums={careDifficulty:['all','조건 관리'],filterMethod:['all','external','sponge','hangon','internal','top','bottom'],hose:['all','12/16','16/22'],feedTarget:['all','guppy','shrimp','betta'],feedBuoyancy:['all','floating','sinking'],mediaPurpose:['all','biological','chemical','mechanical'],mediaMaterial:['all','sintered_glass','ceramic','sponge']};
  function matchesGuidance(p,filters){
    const c=careProfile(p),e=equipmentFacts(p),unknown=filters.includeUnknownGuidance!==false;
    const check=(want,value,test)=>want==null||want==='all'||(value==null?unknown:test(value,want));
    const within=(range,w)=>Array.isArray(range)&&range.length===2&&range[0]<=w&&range[1]>=w;
    if(p.type==='live')return check(filters.careTemp,c?.temperature,within)&&check(filters.carePH,c?.ph,within)&&check(filters.adultMax,c?.adultCm,(v,w)=>v<=w)&&check(filters.tankLength,c?.tankBaseCm?.[0],(v,w)=>v<=w)&&check(filters.careDifficulty,c?.difficulty,(v,w)=>v===w);
    return ['filterMethod','hose','feedTarget','feedBuoyancy','mediaPurpose','mediaMaterial'].every(k=>check(filters[k],e[k],(v,w)=>v===w))&&check(filters.tankLitres,e.tankLitres,within)&&check(filters.flowMin,e.flowLph,(v,w)=>v>=w)&&check(filters.wattMax,e.watts,(v,w)=>v<=w)&&check(filters.particleMax,e.particleMm,(v,w)=>v<=w)&&check(filters.volumeMin,e.volumeMl,(v,w)=>v>=w)&&check(filters.massMin,e.massG,(v,w)=>v>=w);
  }
  function knownShipping(p,subtotal,now=Date.now()){
    const s=p.shippingPolicy;if(!s?.verified||s.sellerId!==p.sellerId||!httpsUrl(s.evidenceUrl)||!validDate(s.observedAt)||Date.parse(s.observedAt)>now||now-Date.parse(s.observedAt)>7*DAY||!Number.isSafeInteger(subtotal)||subtotal<0||!Number.isSafeInteger(s.amount)||s.amount<0||s.freeThreshold!==null&&(!Number.isSafeInteger(s.freeThreshold)||s.freeThreshold<0)||s.chargeUnit!=='order')return null;
    const shipping=s.freeThreshold!==null&&subtotal>=s.freeThreshold?0:s.amount;return {shipping,knownSubtotal:subtotal+shipping,complete:s.conditionsComplete===true,unknown:s.conditionsComplete===true?[]:['지역 추가금','포장비','합배송 조건']};
  }
  function sellerQuality(catalog,now=Date.now()){return catalog.sellers.map(s=>{const rows=catalog.products.filter(p=>p.sellerId===s.id),stale=rows.filter(p=>observationAge(p,now).stale).length,stockKnown=rows.filter(p=>validDate(p.stockObservedAt)).length;return {id:s.id,name:sellerDisplay(s),count:rows.length,stale,staleRatio:rows.length?stale/rows.length:null,stockKnown,stockUnknown:rows.length-stockKnown,priceStockMismatchRatio:null,latestPriceAt:rows.map(p=>p.observedAt).sort().at(-1)||null};});}

  function watchObservation(catalog,id,now=Date.now()){
    const p=catalog.products.find(p=>p.id===id),out=catalog.publicationExclusions?.find(p=>p.id===id&&p.code==='confirmed_out_of_stock');
    if(out)return {id,stock:false,stockAt:out.originalObservedAt,price:null,priceAt:null};
    if(!p)return {id,stock:null,price:null};
    const stockAt=p.stockObservedAt;const fresh=validDate(stockAt)&&Date.parse(stockAt)<=now&&now-Date.parse(stockAt)<=7*DAY;
    return {id,stock:fresh&&typeof p.available==='boolean'?p.available:null,stockAt:fresh?stockAt:null,price:comparisonStatus(p).comparable&&!observationAge(p,now).stale?p.price.amount:null,priceAt:p.observedAt};
  }
  function advanceWatch(w,observation){
    const next=structuredClone(w),events=[];if(!w.enabled||w.id!==observation.id)return {watch:next,events};
    const old=w.last||{},o=observation;
    const newer=(a,b)=>validDate(a)&&(!validDate(b)||Date.parse(a)>Date.parse(b));
    if(w.restock&&old.stock===false&&o.stock===true&&newer(o.stockAt,old.stockAt))events.push({kind:'restock',id:w.id,at:o.stockAt});
    if(Number.isSafeInteger(w.targetPrice)&&w.targetPrice>=0&&Number.isFinite(old.price)&&old.price>w.targetPrice&&Number.isFinite(o.price)&&o.price<=w.targetPrice&&newer(o.priceAt,old.priceAt))events.push({kind:'target_price',id:w.id,at:o.priceAt,price:o.price});
    next.last={...old};if(o.stock!==null&&o.stock!==undefined&&newer(o.stockAt,old.stockAt)){next.last.stock=o.stock;next.last.stockAt=o.stockAt;}if(o.price!==null&&o.price!==undefined&&newer(o.priceAt,old.priceAt)){next.last.price=o.price;next.last.priceAt=o.priceAt;}
    return {watch:next,events};
  }
  function createWatchStore(storage){
    let state={watches:[],events:[],reports:[]},persistent=!!storage;
    try{const raw=storage?.getItem('aqua-observations-v1');if(raw){const p=JSON.parse(raw);if(p&&Array.isArray(p.watches)&&Array.isArray(p.events)&&Array.isArray(p.reports))state={watches:p.watches.filter(w=>typeof w?.id==='string'&&typeof w.enabled==='boolean'&&(w.targetPrice===null||Number.isSafeInteger(w.targetPrice)&&w.targetPrice>=0)).slice(0,100),events:p.events.filter(e=>typeof e?.id==='string'&&['restock','target_price'].includes(e.kind)).slice(-100),reports:p.reports.filter(r=>typeof r?.id==='string'&&['price','stock','identity','link'].includes(r.kind)&&['draft','exported'].includes(r.status)).slice(-100)};}}catch{persistent=false;}
    const save=()=>{try{storage?.setItem('aqua-observations-v1',JSON.stringify(state));}catch{persistent=false;}};
    return {read:()=>structuredClone(state),persistent:()=>persistent,set(w){if(typeof w.id!=='string'||w.targetPrice!==null&&(!Number.isSafeInteger(w.targetPrice)||w.targetPrice<0))throw Error('잘못된 목표 가격');state.watches=state.watches.filter(x=>x.id!==w.id);state.watches.push(structuredClone(w));state.watches=state.watches.slice(-100);save();},remove(id){state.watches=state.watches.filter(x=>x.id!==id);save();},observe(catalog){state.watches=state.watches.map(w=>{const a=advanceWatch(w,watchObservation(catalog,w.id));for(const e of a.events)if(!state.events.some(x=>x.id===e.id&&x.kind===e.kind&&x.at===e.at))state.events.push(e);return a.watch;});state.events=state.events.slice(-100);save();},report(p,kind){if(!['price','stock','identity','link'].includes(kind))throw Error('잘못된 신고 유형');if(!state.reports.some(r=>r.id===p.id&&r.kind===kind&&r.status==='draft'))state.reports.push({id:p.id,name:p.name,url:p.sourceUrl,kind,status:'draft',createdAt:new Date().toISOString(),observedAt:p.observedAt});state.reports=state.reports.slice(-100);save();},exportReports(){state.reports=state.reports.map(r=>({...r,status:'exported'}));save();return JSON.stringify({schemaVersion:1,delivery:'not_submitted',reports:state.reports},null,2);},clearEvents(){state.events=[];save();}};
  }


  function guidanceContext(filters){
    if(filters.type==='live')return 'live';
    if(filters.type!=='gear')return 'none';
    const leaf=filters.gearGroup||'all',category=filters.gearCategory||'all';
    if(leaf!=='all')return /^feed_/.test(leaf)?'feed':/^media_/.test(leaf)?'media':/^filter_/.test(leaf)?'filter':'none';
    if(category==='feeding')return 'feed';
    if(category!=='all'&&category!=='filtration')return 'none';
    const query=canonical(filters.query||'');
    return /사료|먹이|feed/.test(query)?'feed':/여과재|섭스트라트|섭스프로/.test(query)?'media':/여과기|filter/.test(query)?'filter':'none';
  }
  const guidanceFields={live:['careTemp','carePH','adultMax','tankLength','careDifficulty'],feed:['feedTarget','feedBuoyancy','particleMax','volumeMin','massMin'],filter:['filterMethod','tankLitres','flowMin','wattMax','hose'],media:['mediaPurpose','mediaMaterial','volumeMin','massMin'],none:[]};
  function normalizeContextFilters(filters){
    const context=guidanceContext(filters),allowed=guidanceFields[context],changes={};
    for(const [key,value]of Object.entries(specialDefaults))if(key!=='includeUnknownGuidance'&&!allowed.includes(key)&&filters[key]!==undefined&&filters[key]!==value)changes[key]=value;
    if(filters.type!=='gear'&&filters.productRole&&filters.productRole!=='all')changes.productRole='all';
    return {filters:Object.assign(Object.create(filters),changes),changes,context,fields:allowed};
  }

  function validateSelectionFilters(filters) {
    for(const [k,v]of Object.entries(specialDefaults)){if(filters[k]===undefined)continue;if(k==='includeUnknownGuidance')requireValue(typeof filters[k]==='boolean','잘못된 미확인 정보 필터');else if(specialEnums[k])requireValue(specialEnums[k].includes(filters[k]),'잘못된 특화 필터');else requireValue(filters[k]===null||typeof filters[k]==='number'&&Number.isFinite(filters[k])&&filters[k]>0&&filters[k]<=1000000,'잘못된 수치 필터');}
    requireValue(filters && ['all', 'live', 'gear'].includes(filters.type) && ['low', 'high', 'new', 'sales', 'observed', 'unit', 'relevance', 'delivered'].includes(filters.sort) && [7, 30, 90, 'all'].includes(filters.days) && typeof filters.query === 'string' && (filters.includeUnknownRegistration === undefined || typeof filters.includeUnknownRegistration === 'boolean') && (filters.subtype === undefined || ['all', 'fish', 'shrimp', 'aquatic_plant', 'snail'].includes(filters.subtype)), '잘못된 조회 조건');
    requireValue(filters.productRole===undefined||Object.hasOwn(roleLabels,filters.productRole),'잘못된 구성 필터');
    requireValue(filters.comparison===undefined||['priced','all','unpriced'].includes(filters.comparison),'잘못된 가격 비교 범위');
    requireValue(filters.unitScope===undefined||typeof filters.unitScope==='string','잘못된 단가 비교 범위');
    requireValue(filters.wantedQty===undefined||filters.wantedQty===null||Number.isSafeInteger(filters.wantedQty)&&filters.wantedQty>=1&&filters.wantedQty<=100000,'잘못된 희망 수량');
    requireValue(filters.compareAcross===undefined||typeof filters.compareAcross==='boolean','잘못된 동일 상품 비교');
    requireValue(filters.seller===undefined||typeof filters.seller==='string','잘못된 판매처');
    requireValue(filters.observedDays===undefined||['all',1,7,14,30].includes(filters.observedDays),'잘못된 최근 확인 기간');
    requireValue(filters.groupOptions===undefined||typeof filters.groupOptions==='boolean','잘못된 옵션 묶기');
    for(const key of ['minPrice','maxPrice'])requireValue(filters[key]===undefined||filters[key]===null||Number.isSafeInteger(filters[key])&&filters[key]>=0,'잘못된 가격 범위');
    requireValue(filters.minPrice==null||filters.maxPrice==null||filters.minPrice<=filters.maxPrice,'최소 가격은 최대 가격 이하여야 합니다');
    requireValue(filters.fishGroup === undefined || Object.hasOwn(fishGroups, filters.fishGroup), '잘못된 어종 조건');
    requireValue(filters.liveGroup === undefined || filters.liveGroup === 'all' || livestockGroups[filters.subtype] && Object.hasOwn(livestockGroups[filters.subtype], filters.liveGroup), '잘못된 생물 세부 분류');
    requireValue(filters.browseGroup === undefined || filters.browseGroup === 'all' || livestockNavigation[filters.subtype]?.some(group=>group.key===filters.browseGroup), '잘못된 탐색 그룹');
    requireValue(filters.gearCategory === undefined || Object.hasOwn(gearCategories,filters.gearCategory), '잘못된 용품 대분류');
    requireValue(filters.gearGroup === undefined || Object.hasOwn(gearGroups,filters.gearGroup), '잘못된 용품 세부 분류');
    requireValue(!filters.gearGroup || filters.gearGroup==='all' || !filters.gearCategory || filters.gearCategory==='all' || (gearParent(filters.gearGroup)?.key||'other')===filters.gearCategory, '용품 상위·하위 분류 불일치');
  }
  function selectionCandidates(catalog, filters, index) {
    filters=normalizeContextFilters(filters).filters;
    const needles = queryTokens(filters.query);
    const effectiveFishGroup=filters.fishGroup&&filters.fishGroup!=='all'?filters.fishGroup:filters.liveGroup||'all';
    let rows = catalog.products.filter(p => (filters.type==='all'||p.type === filters.type) && (filters.type !== 'live' || filters.subtype === undefined || filters.subtype === 'all' || p.subtype === filters.subtype) && (filters.type !== 'live' || filters.subtype !== 'fish' || effectiveFishGroup === 'all' || (index ? index.get(p).group : fishGroup(p)) === effectiveFishGroup) && (index ? index.get(p).search.some(value => needles.every(needle=>value.includes(needle))) : [p.name, p.originalTitle || '', p.spec].some(value => needles.every(needle=>searchText(value).includes(needle)))));
    if(filters.type==='live'&&filters.subtype!=='fish'&&filters.subtype!=='all'&&filters.liveGroup&&filters.liveGroup!=='all')rows=rows.filter(p=>(index ? index.get(p).group : livestockGroup(p))===filters.liveGroup);
    const leaf=filters.subtype==='fish'?effectiveFishGroup:filters.liveGroup||'all';
    if(filters.type==='live'&&leaf==='all'&&filters.browseGroup&&filters.browseGroup!=='all'){
      const navigation=livestockNavigation[filters.subtype].find(group=>group.key===filters.browseGroup);
      rows=rows.filter(p=>navigation.children.includes((index ? index.get(p).group : livestockGroup(p))));
    }
    if(filters.type==='gear'){
      rows=rows.filter(p=>{
        const key=index?index.get(p).gearGroup:gearGroup(p),category=gearParent(key)?.key||'other';
        return (!filters.gearCategory||filters.gearCategory==='all'||category===filters.gearCategory)&&(!filters.gearGroup||filters.gearGroup==='all'||key===filters.gearGroup);
      });
    }
    if(filters.type==='gear'&&filters.productRole&&filters.productRole!=='all')rows=rows.filter(p=>productRole(p).key===filters.productRole);
    if(Object.keys(specialDefaults).some(k=>filters[k]!==undefined&&filters[k]!==specialDefaults[k]))rows=rows.filter(p=>matchesGuidance(p,filters));
    return rows;
  }
  function selectProducts(catalog, filters) {
    validateCatalog(catalog);
    return selectValidated(catalog, filters);
  }
  function selectValidated(catalog, filters, index, candidates, now=Date.now()) {
    validateSelectionFilters(filters);
    const contextState=normalizeContextFilters(filters);filters=contextState.filters;
    if (catalog.status !== 'ready') return { rows: [], reason: catalog.reason, excludedRegistration: 0, excludedPrice: 0, excludedSales: 0, startAt: null, endAt: null };
    const end = Date.parse(catalog.asOf), start = filters.days === 'all' ? null : end - filters.days * DAY;
    const startAt = start === null ? null : new Date(start).toISOString(), endAt = new Date(end).toISOString();
    let rows = candidates ?? selectionCandidates(catalog, filters, index);
    const comparison=filters.comparison??'priced';
    if(filters.seller)rows=rows.filter(p=>p.sellerId===filters.seller);
    if(filters.minPrice!=null)rows=rows.filter(p=>p.price!==null&&p.price.amount>=filters.minPrice);
    if(filters.maxPrice!=null)rows=rows.filter(p=>p.price!==null&&p.price.amount<=filters.maxPrice);
    if(filters.observedDays!==undefined&&filters.observedDays!=='all')rows=rows.filter(p=>Date.parse(p.observedAt)<=now&&Date.parse(p.observedAt)>=now-filters.observedDays*DAY);
    const excludedComparison=rows.filter(p=>!comparisonStatus(p).comparable).length;
    if(comparison!=='all')rows=rows.filter(p=>comparisonStatus(p).comparable===(comparison==='priced'));
    const unknownCount = rows.filter(p => p.registeredAt === null).length;
    const includeUnknown = (filters.days === 'all' || filters.includeUnknownRegistration === true) && filters.sort !== 'new';
    const excludedRegistration = includeUnknown ? 0 : unknownCount;
    const includedUnknownRegistration = includeUnknown ? unknownCount : 0;
    rows = rows.filter(p => p.registeredAt === null ? includeUnknown : filters.days === 'all' || Date.parse(p.registeredAt) >= start && Date.parse(p.registeredAt) <= end);
    const excludedPrice = rows.filter(p => p.price === null).length;
    if ((filters.sort === 'low' || filters.sort === 'high') && comparison==='priced') rows = rows.filter(p => p.price !== null);
    const unitState=resolveUnitScope(rows,filters);filters=Object.assign(Object.create(filters),unitState.filters);
    let excludedSales = 0;
    if (filters.sort === 'sales') {
      const matches = p => start === null ? p.cumulativeSales !== null : p.periodSales !== null && Date.parse(p.periodSales.startAt) === start && Date.parse(p.periodSales.endAt) === end;
      excludedSales = rows.filter(p => !matches(p)).length;
      rows = rows.filter(matches).sort((a, b) => start === null ? b.cumulativeSales - a.cumulativeSales : b.periodSales.count - a.periodSales.count);
    } else if (filters.sort === 'new') rows.sort((a, b) => Date.parse(b.registeredAt) - Date.parse(a.registeredAt));
    else if (filters.sort === 'observed') rows.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
    else if(filters.sort==='delivered'){const total=p=>estimatePurchase(p,filters.wantedQty||purchaseFacts(p).count||1,p.shippingPolicy,now).total;rows=rows.filter(p=>total(p)!==null).sort((a,b)=>total(a)-total(b));}
    else if(filters.sort==='relevance')rows.sort((a,b)=>relevance(b,filters.query)-relevance(a,filters.query)||(a.price?.amount??Infinity)-(b.price?.amount??Infinity));
    else if(filters.sort==='unit')rows=rows.filter(p=>comparisonUnit(p)?.scope===filters.unitScope).sort((a,b)=>comparisonUnit(a).amount-comparisonUnit(b).amount);
    else rows.sort((a, b) => Number(comparisonStatus(b).comparable)-Number(comparisonStatus(a).comparable) || (a.price===null&&b.price===null?0:a.price===null?1:b.price===null?-1:filters.sort==='high'?b.price.amount-a.price.amount:a.price.amount-b.price.amount));
    const missingSubtype = filters.type === 'live' && filters.subtype !== undefined && filters.subtype !== 'all' && !catalog.products.some(p => p.type === 'live' && p.subtype === filters.subtype);
    const reason = missingSubtype ? '현재 연결된 상품정보에 해당 생물이 없습니다. 모든 판매처의 품절·미판매를 뜻하지 않습니다.' : !catalog.products.some(p => p.type === filters.type) && filters.type === 'live' ? catalog.livestockNotice || '이번 연동에서 확인된 생물 상품이 없습니다.' : filters.sort === 'sales' && !rows.length ? '선택한 기간과 정확히 일치하는 실제 판매량이 없습니다. 누적 판매수로 기간 순위를 만들지 않습니다.' : filters.sort === 'new' && !rows.length && unknownCount ? '실제 상품 등록일이 확인되지 않아 신상품순으로 정렬할 수 없습니다. 관찰 시각으로 임의 정렬하지 않습니다.' : !rows.length ? '등록일·검색어·정렬 조건을 충족하는 확인 상품이 없습니다.' : '';
    const outputReason = filters.sort==='delivered'&&!rows.length?'수량·최소 주문·배송·포장 조건이 모두 확인된 예상 합계가 없습니다. 상품가격순으로 확인하세요.':unitState.needsSelection?'단가 비교 범위를 선택하세요. 검색 결과 없음과 다른 상태입니다.':unitState.noComparable?'현재 조건에는 수량·단위가 확인된 단가 비교 상품이 없습니다. 판매가격순으로 확인하세요.':filters.sort === 'sales' && !rows.length && start === null ? '판매처에서 확인된 실제 판매량이 없습니다. 클릭수·조회수로 판매순을 대신하지 않습니다.' : reason;
    return { rows, reason: outputReason, unitState, effectiveFilters:{...contextState.changes,unitScope:filters.unitScope}, excludedComparison, excludedRegistration, includedUnknownRegistration, excludedPrice, excludedSales, startAt, endAt };
  }

  function createCatalogQuery(input, options={}) {
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
    const normalization=new Map();const normalize=value=>{if(!normalization.has(value))normalization.set(value,canonical(value));return normalization.get(value);};
    const index=new Map(snapshot.products.map(p=>[p,{
      search:[p.name,p.originalTitle||'',p.spec].map(normalize),
      group:livestockGroup(p),gearGroup:gearGroup(p)
    }]));
    const suggest=createSuggestionIndex(snapshot.products,normalize);
    const sellers=new Map(snapshot.sellers.map(s=>[s.id,s]));
    const views=new Map();

    function view(filters){
      validateSelectionFilters(filters);
      // Key only the values actually read by selection, including inherited ones.
      // Unrelated properties must not change or break a valid query.
      filters={
        ...Object.fromEntries(Object.keys(specialDefaults).map(k=>[k,filters[k]])),type:filters.type,subtype:filters.subtype,fishGroup:filters.fishGroup,
        liveGroup:filters.liveGroup,browseGroup:filters.browseGroup,
        gearCategory:filters.gearCategory,gearGroup:filters.gearGroup,
        sort:filters.sort,days:filters.days,query:filters.query,
        productRole:filters.productRole,unitScope:filters.unitScope,wantedQty:filters.wantedQty,compareAcross:filters.compareAcross,comparison:filters.comparison,seller:filters.seller,minPrice:filters.minPrice,maxPrice:filters.maxPrice,observedDays:filters.observedDays,groupOptions:filters.groupOptions,
        includeUnknownRegistration:filters.includeUnknownRegistration
      };
      const now=options.now?options.now():Date.now();
      const key=JSON.stringify([...Object.values(filters),filters.observedDays&&filters.observedDays!=='all'?Math.floor(now/60000):null]);
      if(views.has(key))return views.get(key);

      const candidates=selectionCandidates(snapshot,filters,index);
      const result=selectValidated(snapshot,filters,index,candidates,now);
      const availability=Object.fromEntries(['sales','new'].map(sort=>{
        const selected=selectValidated(snapshot,{...filters,sort},index,candidates,now);
        return [sort,{
          available:snapshot.status==='ready'&&selected.rows.length>0,
          count:selected.rows.length,reason:selected.reason
        }];
      }));
      const baseFilters={
        ...filters,fishGroup:'all',liveGroup:'all',browseGroup:'all',gearCategory:'all',gearGroup:'all',
        sort:['sales','new'].includes(filters.sort)?'low':filters.sort
      };
      const sameScope=[filters.fishGroup,filters.liveGroup,filters.browseGroup,filters.gearCategory,filters.gearGroup]
        .every(value=>value===undefined||value==='all');
      const baseCandidates=sameScope?candidates:
        selectionCandidates(snapshot,baseFilters,index);
      const base=sameScope&&baseFilters.sort===filters.sort?result:
        selectValidated(snapshot,baseFilters,index,baseCandidates,now);
      const groups=livestockGroups[filters.subtype]||{all:'전체'};
      const groupCounts=Object.fromEntries(Object.keys(groups).map(k=>[k,0]));
      for(const p of base.rows){
        groupCounts.all++;
        const group=index.get(p).group;
        if(Object.hasOwn(groupCounts,group))groupCounts[group]++;
      }
      const gearCounts={all:0,categories:Object.fromEntries(Object.keys(gearCategories).filter(k=>k!=='all').map(k=>[k,0])),groups:Object.fromEntries(Object.keys(gearGroups).filter(k=>k!=='all').map(k=>[k,0]))};
      for(const p of base.rows){
        if(p.type!=='gear')continue;
        const key=index.get(p).gearGroup,category=gearParent(key)?.key||'other';
        gearCounts.all++;gearCounts.categories[category]++;gearCounts.groups[key]++;
      }
      const value=freeze({result,availability,base,groupCounts,gearCounts});
      if(views.size>=32)views.delete(views.keys().next().value);
      views.set(key,value);
      return value;
    }
    return Object.freeze({
      catalog:snapshot,suggest,
      view,
      select:filters=>selectValidated(snapshot,filters,index,undefined,options.now?options.now():Date.now()),
      group:product=>index.get(product)?.group??null,
      gearGroup:product=>index.get(product)?.gearGroup??null,
      seller:id=>sellers.get(id)
    });
  }

  function usablePhoto(product) { return product.photo.usePermission === 'allowed' ? product.photo.url : null; }
  const defaultFilters = Object.freeze({ ...specialDefaults,type: 'live', subtype: 'all', fishGroup: 'all', liveGroup:'all', browseGroup:'all', gearCategory:'all', gearGroup:'all', sort: 'low', days: 'all', query: '', includeUnknownRegistration: true, comparison:'priced', seller:'', minPrice:null, maxPrice:null, observedDays:'all', groupOptions:true,unitScope:'',wantedQty:null,compareAcross:false,productRole:'all' });
  function filtersFromSearch(search = '') {
    const params = new URLSearchParams(search), filters = { ...defaultFilters };
    for (const [key, allowed] of Object.entries({ type: ['all','live','gear'], subtype: ['all','fish','shrimp','aquatic_plant','snail'], fishGroup: Object.keys(fishGroups), productRole:Object.keys(roleLabels),sort: ['low','high','sales','new','observed','unit','relevance','delivered'] })) if (allowed.includes(params.get(key))) filters[key] = params.get(key);
    for(const [k,v]of Object.entries(specialDefaults)){const raw=params.get(k);if(raw===null)continue;if(k==='includeUnknownGuidance')filters[k]=raw!=='false';else if(specialEnums[k]){if(specialEnums[k].includes(raw))filters[k]=raw;}else if(/^(?:\d+)(?:\.\d+)?$/.test(raw)&&Number(raw)>0&&Number(raw)<=1000000)filters[k]=Number(raw);}
    const days = params.get('days'); if (days === 'all') filters.days = 'all'; else if (['7','30','90'].includes(days)) filters.days = Number(days);
    const group=params.get('liveGroup');if(group&&livestockGroups[filters.subtype]&&Object.hasOwn(livestockGroups[filters.subtype],group))filters.liveGroup=group;
    if(!params.has('subtype')&&params.has('fishGroup')&&filters.fishGroup!=='all')filters.subtype='fish';
    if(filters.subtype==='fish'&&filters.liveGroup!=='all'){if(!params.has('fishGroup'))filters.fishGroup=filters.liveGroup;filters.liveGroup='all';}
    const browse=params.get('browseGroup');if(livestockNavigation[filters.subtype]?.some(group=>group.key===browse))filters.browseGroup=browse;
    const leaf=filters.subtype==='fish'?filters.fishGroup:filters.liveGroup;if(leaf!=='all')filters.browseGroup='all';
    const category=params.get('gearCategory'),gear=params.get('gearGroup');
    if(Object.hasOwn(gearCategories,category))filters.gearCategory=category;
    if(Object.hasOwn(gearGroups,gear)){
      const parent=gearParent(gear)?.key||'other';
      if(gear==='all'||filters.gearCategory==='all'||filters.gearCategory===parent){filters.gearGroup=gear;if(gear!=='all')filters.gearCategory=parent;}
    }
    if(['priced','all','unpriced'].includes(params.get('comparison')))filters.comparison=params.get('comparison');
    filters.seller=params.get('seller')||'';filters.unitScope=params.get('unitScope')||'';filters.compareAcross=params.get('compareAcross')==='true';
    const wanted=params.get('wantedQty');if(wanted&&/^\d+$/.test(wanted)&&Number(wanted)>=1&&Number(wanted)<=100000)filters.wantedQty=Number(wanted);
    for(const key of ['minPrice','maxPrice']){const raw=params.get(key);if(raw!==null&&/^\d+$/.test(raw)&&Number.isSafeInteger(Number(raw)))filters[key]=Number(raw);}
    if(filters.minPrice!==null&&filters.maxPrice!==null&&filters.minPrice>filters.maxPrice){filters.minPrice=null;filters.maxPrice=null;}
    if(['1','7','14','30'].includes(params.get('observedDays')))filters.observedDays=Number(params.get('observedDays'));
    if(params.get('groupOptions')==='false')filters.groupOptions=false;
    filters.query = params.get('query') ?? params.get('q') ?? '';
    const unknown = params.get('includeUnknownRegistration') ?? params.get('includeUnknown'); if (unknown === 'true' || unknown === 'false') filters.includeUnknownRegistration = unknown === 'true';
    return filters;
  }
  function sortAvailability(catalog, filters) {
    return Object.fromEntries(['sales','new'].map(sort => { const result = selectProducts(catalog, { ...filters, sort }); return [sort, { available: catalog.status === 'ready' && result.rows.length > 0, count: result.rows.length, reason: result.reason }]; }));
  }
  function filtersToSearch(filters,search=''){
    const params=new URLSearchParams(search);for(const key of [...Object.keys(specialDefaults),'type','subtype','fishGroup','liveGroup','browseGroup','gearCategory','gearGroup','sort','days','query','q','includeUnknownRegistration','includeUnknown','comparison','seller','minPrice','maxPrice','observedDays','groupOptions','unitScope','wantedQty','compareAcross','productRole'])params.delete(key);
    for(const [key,value]of Object.entries(filters))if(Object.hasOwn(defaultFilters,key)&&value!==undefined&&value!==null&&value!==defaultFilters[key])params.set(key,String(value));
    const text=params.toString();return text?'?'+text:'';
  }
  return { offerSpec,guidanceContext,guidanceFields,normalizeContextFilters,watchObservation,advanceWatch,createWatchStore,guidance,careProfile,equipmentFacts,specialDefaults,specialEnums,matchesGuidance,knownShipping,sellerQuality,formatQuantity,roleLabels,productRole,relevance,resolveUnitScope,aliases, canonical, queryTokens, purchaseFacts, comparisonUnit, exactIdentity, compareSellers, estimatePurchase, relativeObservation, sellerDisplay, createSuggestionIndex, createLocalLibrary, comparisonStatus, unitPrice, observationAge, groupOffers, validateCatalog, createCatalogQuery, selectProducts, usablePhoto, httpsUrl, sourceUrl, fishGroup, fishGroups, livestockGroup, livestockClassification, livestockGroups, livestockNavigation, navigationParent, gearNavigation, gearCategories, gearGroups, gearClassification, gearParent, gearGroup, defaultFilters, filtersFromSearch, filtersToSearch, sortAvailability };
});
