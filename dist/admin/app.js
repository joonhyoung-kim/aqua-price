'use strict';
const $=s=>document.querySelector(s),escapeText=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const labels={success:'수집 성공',partial_failure:'부분 수집·오류',failed:'수집 실패',access_stopped:'접근 거부로 중지',quarantined:'접근 거부 검토 필요',backoff:'재시도 대기',disabled:'수집 비활성',robots_unverified:'robots 확인 실패',no_confirmed_products:'확인 상품 없음',not_run:'수집 실행 미검증'};
let data;
function render(){if(!data)return;const q=$('#query').value.trim().toLowerCase(),filter=$('#statusFilter').value;
 const rows=data.sources.filter(s=>(s.name+' '+s.domain).toLowerCase().includes(q)&&(filter==='all'||filter==='enabled'&&s.enabled||filter==='disabled'&&!s.enabled||filter==='success'&&s.collectorStatus==='success'||filter==='blocked'&&(['access_stopped','quarantined'].includes(s.collectorStatus)||s.technicalReadiness==='blocked')));
 $('#rows').innerHTML=rows.map(s=>`<tr><td><a href="${escapeText(s.officialUrl)}" target="_blank" rel="noopener noreferrer">${escapeText(s.name)}</a><small>${escapeText(s.domain)}</small></td><td class="status">${escapeText(labels[s.collectorStatus]||s.collectorStatus)}<small>기술 샘플: ${escapeText(s.technicalReadiness)}<br>전체 목록 완전성: ${s.fullCatalogCoverage?'확인':'미검증'}</small></td><td>화면 ${s.snapshotProductCount}개<small>수집 확인 ${s.collectorProductCount}개</small></td><td>${escapeText(s.collectorLastSuccess||'성공 실행 미검증')}<small>마지막 시도: ${escapeText(s.collectorLastAttempt||'미실행')}</small></td><td class="error">${escapeText(s.collectorLastError||'최근 수집 오류 없음')}<small>${(s.blockers||[]).map(escapeText).join('<br>')}</small></td><td>수집 설정: ${s.enabled?'켜짐':'꺼짐'}<br>자동 갱신: ${s.autoRefreshVerified?'실행 검증됨':'미검증'}<small>${escapeText(s.schedule||'예약 대상 아님')}</small></td></tr>`).join('');
}
fetch('status.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(value=>{
 if(value.schemaVersion!==1||!Array.isArray(value.sources))throw Error();data=value;
 $('#summary').innerHTML=[`최초 판매처 ${data.sources.length}곳`,`수집 설정 켜짐 ${data.sources.filter(s=>s.enabled).length}곳`,`수집 성공 ${data.sources.filter(s=>s.collectorStatus==='success').length}곳`,`자동 실행 검증 ${data.sources.filter(s=>s.autoRefreshVerified).length}곳`].map(escapeText).map(t=>'<span>'+t+'</span>').join('');
 $('#automation').textContent=data.automation.verifiedRun?'예약 자동 갱신의 실행을 확인했습니다. 전체 상품 실시간 수집은 아닙니다.':data.automation.configured?'예약 설정은 등록되어 있지만 첫 자동 실행·배포 반영 검증은 아직 완료되지 않았습니다.':'자동 갱신은 아직 배포·실행 검증되지 않았습니다.';
 $('#updated').textContent='상태 생성 시각: '+data.generatedAt+' · 최초 45곳 외 확인본 도메인 '+data.additionalSnapshotDomains.length+'곳은 위 목록 분모에 포함하지 않습니다.';
 render();
}).catch(()=>{$('#automation').textContent='판매처 상태를 불러오지 못했습니다. 연동 완료로 표시하지 않습니다.';});
$('#query').addEventListener('input',render);$('#statusFilter').addEventListener('change',render);
