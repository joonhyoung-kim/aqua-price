(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.AquaGear=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  // Shopping navigation, derived from the item title and observed menu evidence.
  // Seller identity, price, brand alone and numeric category IDs are not evidence.
  const navigation=[
    {key:'filtration',label:'여과기·여과재',children:{filter_sponge:'스펀지 여과기',filter_hangon:'걸이식 여과기',filter_external:'외부 여과기',filter_internal:'측면·내부 여과기',filter_top:'상면 여과기',filter_bottom:'저면 여과기',filter_other:'기타·복합 여과기',media_sponge:'교체 스펀지·매트',media_bio:'생물학적 여과재',media_chemical:'흡착·화학 여과재',media_other:'기타 여과재·리필',filter_parts:'여과기 부품'}},
    {key:'water_flow',label:'산소·수류·배관',children:{air_pump:'기포기·브로워',air_parts:'에어스톤·에어 부속',water_pump:'수중·수류 모터',plumbing:'호스·배관·밸브'}},
    {key:'lighting',label:'조명',children:{light_led:'LED 조명',light_other:'기타 조명',light_parts:'조명 거치대·부품'}},
    {key:'temperature',label:'온도 관리',children:{heater:'히터',cooling_fan:'냉각팬',chiller:'냉각기',thermometer:'온도계',temperature_controller:'온도 조절기'}},
    {key:'tank',label:'어항·받침',children:{tank_set:'어항 세트·일체형',tank_only:'어항·수반',tank_stand:'어항 받침·축양장',tank_parts:'뚜껑·매트·어항 부속'}},
    {key:'landscape',label:'바닥재·장식',children:{substrate_soil:'소일',substrate_sand:'모래·자갈·바닥재',hardscape_stone:'돌·수석',hardscape_wood:'유목',ornament:'장식·인조 수초',hide:'은신처'}},
    {key:'plant_co2',label:'수초·CO₂ 용품',children:{co2_set:'CO₂ 세트·봄베',co2_parts:'CO₂ 확산기·부속',plant_fertilizer:'수초 영양제·비료',plant_tools:'수초 가위·핀셋',plant_holder:'수초 활착판·모스 선반'}},
    {key:'feeding',label:'먹이·급여',children:{feed_dry:'건조·배합 사료',feed_frozen:'냉동 먹이',feed_live:'생먹이·부화용 알',feeding_equipment:'급여기·먹이통'}},
    {key:'water_care',label:'수질·측정·치료',children:{conditioner:'물갈이·염소 제거',bacteria:'박테리아제',water_adjuster:'수질 조절·첨가제',water_test:'수질 테스트·측정',medication:'치료·기생충 관리',sterilizer:'UV 살균기·교체 램프'}},
    {key:'maintenance',label:'청소·관리',children:{water_change:'환수·보충수 용품',cleaning:'스크래퍼·청소 도구',fish_net:'뜰채',maintenance_other:'접착·관리 도구'}},
    {key:'breeding',label:'번식·격리',children:{breeding_box:'부화통·산란통',isolation:'격리통·칸막이'}},
    {key:'marine',label:'해수 전용',children:{marine_salt:'해수염',marine_skimmer:'스키머',marine_reactor:'리액터·도징 장비'}},
  ];
  const categories={all:'전체',...Object.fromEntries(navigation.map(g=>[g.key,g.label])),other:'기타·미분류'};
  const groups={all:'전체',...Object.assign({},...navigation.map(g=>g.children)),other:'기타·미분류'};
  const parent=key=>navigation.find(g=>Object.hasOwn(g.children,key))||null;
  const rules=[
    // Accessory/consumable phrases must win over the equipment mentioned in them.
    ['sterilizer',/자외선|\bUV\b|살균\s*(?:램프|등|기)/i],
    ['tank_set',/(?:일체형.{0,15}(?:어항|수조|수족관)|(?:어항|수조|수족관).{0,15}일체형|(?:어항|수조)\s*세트(?!용))|(?:수족관|어항|수조).{0,40}(?:조명|필터).{0,25}(?:포함|있는)/i],
    ['filter_parts',/(?:임펠라|임펠러|여과기.{0,15}(?:부품|연결구|흡착고무|출수구|입수구|흡입구|입수관|출수관|흡수관|호스)|여과기용.{0,12}(?:모터|헤드)|오링|O[-\s]?링)/i],
    ['media_sponge',/(?:교체|(?<!프)리필|보충|여과)\s*(?:용\s*)?(?:스펀지|스폰지|매트|솜)|(?:스펀지|스폰지|매트|솜).{0,8}(?:교체|(?<!프)리필)|폴리나젤|필터\s*매트/i],
    ['media_other',/(?:교체용\s*여과재|여과기.{0,10}(?:(?<!프)리필|카트리지)|(?<!프)리필\s*필터|여과재\s*망)/i],
    ['media_bio',/생물(?:학적)?\s*여과재|세라믹\s*링|바이오\s*(?:볼|링|여과재)|섭스트라트|시포락스|생물학적\s*여과재/i],
    ['media_chemical',/활성탄|제올라이트|퓨리젠|흡착\s*여과재/i],
    ['feeding_equipment',/(?:알테미아|브라인).{0,12}부화기|자동\s*(?:급식|급여|먹이)|급여기|급식기|먹이\s*(?:통|그릇|접시|링)|사료\s*(?:통|보관)|피딩\s*(?:컵|링|스테이션)/i],
    ['water_change',/바닥재\s*청소기|환수\s*(?:통|호스|펌프|세트)|보충\s*수통|물\s*보충|드립\s*배럴|사이펀|싸이펀/i],
    ['plant_holder',/모스\s*(?:선반|판|볼망)|활착\s*(?:판|망|용품)|수초\s*(?:컵|포트|홀더)/i],
    ['plant_tools',/(?:수초|수조).{0,10}(?:가위|핀셋)|트리밍\s*가위/i],
    ['plant_fertilizer',/수초.{0,10}(?:영양|비료)|액체\s*비료|저면\s*비료|루트\s*탭/i],
    ['co2_parts',/(?:CO\s*2|CO₂|이산화탄소).{0,15}(?:확산|디퓨저|카운터|체커|레귤레이터|솔레노이드|밸브|호스)|버블\s*카운터|드롭\s*체커/i],
    ['co2_set',/CO\s*2|CO₂|이산화탄소|고압\s*봄베/i],
    ['light_parts',/등커버\s*다리|(?:조명|LED|등커버).{0,12}(?:거치|브라켓|다리|부품|어댑터)/i],
    ['tank_parts',/뚜껑\s*받침|(?:어항|수조).{0,10}(?:뚜껑|매트|실리콘)|어항\s*부속/i],
    ['temperature_controller',/온도\s*(?:조절기|컨트롤러)|써모\s*스탯|서모\s*스탯/i],
    ['medication',/치료제|구충제|백점병|메틸렌\s*블루|멜라픽스|피마픽스|약품|질병\s*치료/i],
    ['water_test',/테스트\s*(?:킷|키트)|테스터|시약|(?:PH|TDS|EC|NO2|NO3|GH|KH)\s*(?:측정|미터|시험)|수질\s*(?:측정|검사)/i],
    ['conditioner',/물갈이제|염소\s*제거|워터\s*컨디셔너|중화제/i],
    ['bacteria',/박테리아\s*(?:제|활성)|여과\s*박테리아|\b(?:stability|nitrifying bacteria)\b/i],
    ['water_adjuster',/알몬드\s*잎|알몬드\s*리프|미네랄|수질\s*(?:조절|안정)|PH\s*(?:업|다운)|블랙\s*워터|비타민/i],
    ['marine_salt',/해수염|인공\s*해수|리프\s*솔트/i],
    ['marine_skimmer',/스키머/i],
    ['marine_reactor',/리액터|도징\s*(?:펌프|장비)/i],
    ['breeding_box',/부화\s*통|산란\s*(?:통|상)|인큐베이터/i],
    ['isolation',/격리\s*(?:통|박스)|칸막이/i],
    ['hide',/은신처/i],
    ['hardscape_stone',/황호석|청룡석|용암석|화산석|수석|조경석|어항\s*돌/i],
    ['hardscape_wood',/유목/i],
    ['ornament',/인조\s*(?:수초|수생)|모형|장식품|석상|수조\s*장식/i],
    ['substrate_soil',/소일|\bsoil\b/i],
    ['substrate_sand',/바닥재|흑사|백사|규사|금사|모래|자갈/i],
    ['feed_frozen',/냉동|냉짱/i],
    ['feed_live',/알테미아|브라인\s*(?:쉬림프|슈림프).{0,10}(?:에그|알)|부화용\s*알|생먹이/i],
    ['feed_dry',/사료|먹이|구피밥|코리밥|\b(?:food|feed|pellet|flake)\b/i],
    ['filter_sponge',/(?:스펀지|스폰지)\s*여과기|슈퍼\s*쌍기/i],
    ['filter_hangon',/걸이식\s*여과기/i],
    ['filter_external',/외부\s*여과기/i],
    ['filter_internal',/(?:측면|내부|수중)\s*여과기/i],
    ['filter_top',/상면\s*여과기/i],
    ['filter_bottom',/저면\s*여과기/i],
    ['filter_other',/여과기|프리\s*필터/i],
    ['media_other',/여과재/i],
    ['air_pump',/기포기|브로워|에어\s*펌프/i],
    ['air_parts',/에어\s*(?:스톤|분배|호스)|콩돌|기포\s*분산|역류\s*방지/i],
    ['water_pump',/(?:수중|수류)\s*(?:모터|펌프)|순환\s*펌프|웨이브\s*메이커/i],
    ['plumbing',/PVC|호스|배관|밸브|엘보|유니온|수도\s*연결/i],
    ['light_led',/\bLED\b/i],
    ['light_other',/조명|등커버|메탈\s*할라이드/i],
    ['heater',/히터|히타|\bheater\b/i],
    ['cooling_fan',/냉각\s*팬|쿨링\s*팬/i],
    ['chiller',/냉각기|칠러/i],
    ['thermometer',/온도계/i],
    ['tank_stand',/축양장|수조\s*받침|어항\s*받침|어항\s*다이/i],
    ['cleaning',/스크래퍼|스크래퍼|이끼\s*(?:제거기|청소)|자석\s*청소|청소\s*(?:솔|도구)/i],
    ['fish_net',/뜰채/i],
    ['maintenance_other',/실리콘\s*건|접착제|수초\s*본드/i],
    ['tank_only',/어항|수조|수반|물고기\s*그릇/i],
  ];
  function classification(product){
    if(product?.verified!==true||product.type!=='gear')return null;
    const rawTitle=[...new Set([product.name||'',product.originalTitle||''])].join(' ').normalize('NFKC');
    // A clearly marked gift is ancillary; it cannot replace the primary product.
    const title=rawTitle.replace(/(?:\+|[([])[^+()[\]]*(?:증정|사은품)[^()[\]]*[)\]]?/g,' ').replace(/(?:전용\s*)?(?:사료|활성탄|여과재|스펀지|먹이|박테리아제|온도계)\s*(?:무료\s*)?증정/g,' ').trim();
    const result=(key,basis)=>({key,category:parent(key)?.key||'other',basis});
    // Catalog type errors are not repaired by inferring from a gift or packing note.
    if(/생물\s*포장비|(?:새우|물벼룩)\s*\d+\s*(?:~\s*\d+\s*)?마리|\bBetta\s+simplex\b/i.test(rawTitle))return result('other','possible_livestock_needs_review');
    // Numeric URLs supply no category meaning. Never infer from retailer identity.
    const labels=Array.isArray(product.observedCategoryLabels)?product.observedCategoryLabels.map(e=>[...(Array.isArray(e.ancestorLabels)?e.ancestorLabels:[]),e.label].join(' › ')):[];
    try{const pathname=decodeURIComponent(new URL(product.discoveryCategoryUrl).pathname);if(/[가-힣a-z]/i.test(pathname.replace(/\/category\//gi,'')))labels.push(pathname);}catch{}
    const categoryText=labels.join(' › ').normalize('NFKC');
    const match=rules.find(([,pattern])=>pattern.test(title));
    const genericFilter=match&&/^filter_/.test(match[0])&&match[0]!=='filter_parts';
    if(match&&!genericFilter)return result(match[0],'explicit_title');
    // Full paths distinguish replacement media / parts from identically named filters.
    if(/교체용\s*여과재|(?<!프)리필|카트리지/.test(categoryText)){
      return result(/스펀지|스폰지|매트|솜/.test(categoryText)?'media_sponge':'media_other','observed_retailer_category');
    }
    if(/여과기\s*부품/.test(categoryText))return result('filter_parts','observed_retailer_category');
    if(/여과기/.test(title)&&/겸용/.test(title))return result('filter_other','explicit_title');
    if(match)return result(match[0],'explicit_title');
    // Broad or conflicting menus remain unknown; they cannot safely identify a leaf.
    const matches=new Set(rules.filter(([,pattern])=>pattern.test(categoryText)).map(([key])=>key));
    for(const [generic,specific] of [['filter_other',['filter_sponge','filter_hangon','filter_external','filter_internal','filter_top','filter_bottom']],['media_other',['media_sponge','media_bio','media_chemical']],['light_other',['light_led','light_parts']],['tank_only',['tank_set','tank_stand','tank_parts']]]){
      if(specific.some(key=>matches.has(key)))matches.delete(generic);
    }
    return matches.size===1?result([...matches][0],'observed_retailer_category'):result('other','insufficient_or_conflicting_evidence');
  }
  return {navigation,categories,groups,parent,classification};
});
