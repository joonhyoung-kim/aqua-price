'use strict';
const $=s=>document.querySelector(s),escapeText=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const labels={success:'접근 확인 · 부분 수집',partial_failure:'부분 수집·오류',failed:'수집 실패',access_stopped:'접근 거부로 중지',quarantined:'접근 거부 검토 필요',backoff:'재시도 대기',disabled:'수집 비활성',robots_unverified:'robots 확인 실패',no_confirmed_products:'확인 상품 없음',not_run:'수집 실행 미검증'};
Object.assign(labels,{draining_pending:'저장된 후보 상세 확인 중',budget_limited:'한도 도달 · 다음 실행 재개',partial_discovery:'부분 발견 · 확인 필요',adapter_not_implemented:'목록 파서 미지원',representative_categories_configured:'대표 카테고리 설정',request_budget_reached:'요청 한도 도달',backlog_limited:'후보 검증 대기',needs_review:'상품별 검토 필요'});
function scheduleText(automation={}){
 const entries=Object.entries({live:'생물',gear:'용품',reconcile:'목록 대조'}).map(([key,label])=>{
  const cron=automation.scheduleUTC?.[key];if(typeof cron!=='string'||!cron.trim())return null;
  const every=cron.match(/^(\d{1,2}) \*\/(\d{1,2}) \* \* \*$/),daily=cron.match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/);
  return label+' '+(every?Number(every[2])+'시간마다':daily?'매일 '+daily[2].padStart(2,'0')+':'+daily[1].padStart(2,'0'):'cron '+cron);
 });
 return entries.filter(Boolean).length?entries.filter(Boolean).join(' / ')+' (UTC · 설정 기준)':'예약 주기 미확인';
}
let data;
const savedEnabled=s=>s.control?.requestedEnabled??s.enabled;
function treeCell(t){if(!t)return '';return `<strong>메뉴 트리: 발견 ${t.discoveredCategoryCount} · 허용 ${t.allowedCategoryCount} · 범위 제외 ${t.excludedCategoryCount} · 검토 ${t.reviewCategoryCount}</strong><small>페이지 방문 ${t.pagesVisited} · 미완료 카테고리 ${t.pendingCategoryCount}<br>상품 검증 ${t.verifiedProductCount} · 상세 대기 ${t.pendingProductCount} · 분류 검토 ${t.reviewProductCount}<br>마지막 페이지 확인 ${t.terminalCategoryCount}/${t.allowedCategoryCount} · 전체 메뉴 범위 ${escapeText(t.menuCoverage)}<br>순회 상태 ${escapeText(t.terminalCoverage)} · 전체 판매처 완료 아님</small>`;}
function completedCategoryCell(g){return g ? `<strong>구피 목록 ${g.observedUniqueLinks}/${g.displayedCount} · 상세 ${g.verifiedProducts}/${g.observedUniqueLinks}</strong><small>구피 상위 카테고리 상세 검증: ${g.detailCoverageComplete ? '완료' : '부분'} · 판매처 전체 탐색: 미완료</small>` : '';}
function discoveryDetails(s){const d=s.discovery||{};return `<details class="discovery-details"><summary>발견 현황</summary>${completedCategoryCell(d.guppyCoverage)}${treeCell(d.categoryTree)}<small>등록 시작 링크 ${d.mappedSeedCount||d.representativeSeedCount||0}개<br>발견 상태: ${escapeText(labels[d.status]||d.status||'미실행')}<br>최근 방문 ${d.pagesVisited||0}/${d.pageBudget||0}페이지 · 후보 ${d.newCandidates||0}개 · 상세 검증 ${d.verifiedItems||0}개<br>검증 대기 ${d.pendingCandidates||0}개 · 최근 분류 검토 ${d.reviewRequired||0}개<br>이어 읽기: ${d.cursorResume?'사용':'미지원'} · 전체 판매처 완전 수집 아님 · 삭제 보류<br>다음 카테고리: ${d.nextCategoryIndex??'미실행'}<br>${Object.entries(d.reviewReasons||{}).map(([reason,count])=>escapeText(reason)+' '+count+'건').join('<br>')}</small></details>`;}
function discoveryNames(d){
 if(d.productNames&&Array.isArray(d.productNames.names))return d.productNames;
 // Older deployed status files only expose review candidate names.
 const entries=new Map();for(const r of d.reviewQueue||[]){const title=typeof r.title==='string'?r.title.trim():typeof r.candidate?.title==='string'?r.candidate.title.trim():'';const key=r.key||r.url||r.candidate?.url||title;if(key&&(!entries.has(key)||!entries.get(key)&&title))entries.set(key,title);}
 return {names:[...new Set([...entries.values()].filter(Boolean))],unnamedCount:[...entries.values()].filter(t=>!t).length};
}
function discoveryCell(s){const {names,unnamedCount}=discoveryNames(s.discovery||{}),list=values=>'<ul class="product-names">'+values.map(name=>'<li>'+escapeText(name)+'</li>').join('')+'</ul>';return `<td class="discovery-products">${names.length?list(names.slice(0,5)):'<small>아직 확인된 후보 상품명 없음</small>'}${names.length>5?'<details><summary>상품명 '+(names.length-5)+'개 더 보기</summary>'+list(names.slice(5))+'</details>':''}${unnamedCount?'<small>상품명 확인 대기 '+Number(unnamedCount)+'개</small>':''}</td>`;}
function render(){if(!data)return;const q=$('#query').value.trim().toLowerCase(),filter=$('#statusFilter').value;
 const rows=data.sources.filter(s=>(s.name+' '+s.domain).toLowerCase().includes(q)&&(filter==='all'||filter==='enabled'&&savedEnabled(s)||filter==='disabled'&&!savedEnabled(s)||filter==='success'&&s.collectorStatus==='success'||filter==='blocked'&&(['access_stopped','quarantined'].includes(s.collectorStatus)||s.technicalReadiness==='blocked')));
 $('#rows').innerHTML=rows.map(s=>`<tr><td><a href="${escapeText(s.officialUrl)}" target="_blank" rel="noopener noreferrer">${escapeText(s.name)}</a><small>${escapeText(s.domain)}</small></td><td class="status">${escapeText(labels[s.collectorStatus]||s.collectorStatus)}<small>기술 샘플: ${escapeText(s.technicalReadiness)}<br>전체 탐색 완료: ${s.fullCatalogCoverage?'확인':'미검증'}</small>${discoveryDetails(s)}</td><td>화면 ${s.snapshotProductCount}개<small>수집 확인 ${s.collectorProductCount}개</small></td><td>${escapeText(s.collectorLastSuccess||'성공 실행 미검증')}<small>마지막 시도: ${escapeText(s.collectorLastAttempt||'미실행')}</small></td><td class="error">${escapeText(s.collectorLastError||'최근 수집 오류 없음')}<small>${(s.blockers||[]).map(escapeText).join('<br>')}</small></td><td>${typeof AquaAdminControls!=='undefined'?AquaAdminControls.toggleMarkup(s):''}배포 설정: ${(s.control?.requestedEnabled??s.enabled)?'켜짐':'꺼짐'}<br>자동 갱신: ${s.autoRefreshVerified?'실행 검증됨':'미검증'}<small>${escapeText(s.schedule||(s.enabled?scheduleText(data.automation):'예약 대상 아님'))}</small></td>${discoveryCell(s)}</tr>`).join('');
}
fetch('status.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(value=>{
 if(value.schemaVersion!==1||!Array.isArray(value.sources))throw Error();data=value;
 $('#summary').innerHTML=[`최초 판매처 ${data.sources.length}곳`,`배포 설정 켜짐 ${data.sources.filter(savedEnabled).length}곳`,`접근 확인·부분 수집 ${data.sources.filter(s=>s.collectorStatus==='success').length}곳`,`자동 실행 검증 ${data.sources.filter(s=>s.autoRefreshVerified).length}곳`].map(escapeText).map(t=>'<span>'+t+'</span>').join('');
 $('#automation').textContent=data.automation.dataPipelineVerified?'수동 GitHub Actions 수집 결과의 데이터 저장·미리보기 배포를 확인했습니다. 일부 판매처 오류로 마지막 작업 결론은 실패입니다. 시간 예산에 따른 부분 수집이며, 예약 cron 실행은 아직 검증하지 않았습니다.':data.automation.verifiedRun?'예약 자동 갱신의 실행을 확인했습니다. 전체 상품 실시간 수집은 아닙니다.':data.automation.configured?'예약 설정은 등록되어 있지만 첫 자동 실행·배포 반영 검증은 아직 완료되지 않았습니다.':'자동 갱신은 아직 배포·실행 검증되지 않았습니다.';
 $('#scope').textContent='관찰 지도 '+(data.discoveryScope?.mappedSources||0)+'곳 · 등록 시작 링크 '+(data.discoveryScope?.observedSeeds||0)+'개 · 목록 파서 대상 '+(data.discoveryScope?.adapterEnabledSources||0)+'곳. 실제 메뉴·하위 카테고리·다음 페이지를 한도 내에서 이어 읽습니다. 상품명은 관찰된 발견 후보 기준이며 실제 등록일 기준 신상품 목록이나 전체 상품 목록이 아닙니다. 판매처별 방문·검증 수는 연결·수집 상태의 발견 현황에서 볼 수 있습니다.';
 $('#updated').textContent='상태 생성 시각: '+data.generatedAt+' · 최초 45곳 외 확인본 도메인 '+data.additionalSnapshotDomains.length+'곳은 위 목록 분모에 포함하지 않습니다.';
 if(typeof AquaAdminControls!=='undefined')AquaAdminControls.init(data,{render});
 render();
}).catch(()=>{$('#automation').textContent='판매처 상태를 불러오지 못했습니다. 연동 완료로 표시하지 않습니다.';if(typeof AquaAdminControls!=='undefined')AquaAdminControls.init({sources:[],controls:null,controlsError:'상태를 불러오지 못해 수집 설정을 확인할 수 없습니다. 새로고침 후 다시 시도하세요.'});});
$('#query').addEventListener('input',render);$('#statusFilter').addEventListener('change',render);
