'use strict';
(function(root){
 const EDIT_URL='https://github.com/joonhyoung-kim/aqua-price/edit/preview/sources/collector-controls.json';
 const API_URL='https://api.github.com/repos/joonhyoung-kim/aqua-price/contents/sources/collector-controls.json?ref=preview';
 const OPTIONS={live:[6,12,24,48,72],gear:[12,24,48,72],reconcile:[24,48,72]};
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
 function normalize(raw,sourceIds){
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  if(!object(raw)||raw.schemaVersion!==1||!object(raw.intervalsHours)||!object(raw.sources))throw Error('설정 형식이 올바르지 않습니다.');
  if(!Array.isArray(sourceIds)||sourceIds.some(id=>typeof id!=='string'||!id||['__proto__','prototype','constructor'].includes(id))||new Set(sourceIds).size!==sourceIds.length)throw Error('판매처 목록이 올바르지 않습니다.');
  if(Object.keys(raw).some(k=>!['schemaVersion','intervalsHours','sources'].includes(k)))throw Error('지원하지 않는 설정 항목입니다.');
  if(Object.keys(raw.intervalsHours).some(k=>!Object.hasOwn(OPTIONS,k)))throw Error('지원하지 않는 수집 주기입니다.');
  const intervalsHours={};for(const mode of Object.keys(OPTIONS)){const n=raw.intervalsHours[mode];if(!OPTIONS[mode].includes(n))throw Error('허용된 주기만 선택할 수 있습니다.');intervalsHours[mode]=n;}
  if(Object.keys(raw.sources).some(id=>!sourceIds.includes(id)))throw Error('등록되지 않은 판매처가 있습니다.');
  const sources={};for(const id of [...sourceIds].sort()){const value=raw.sources[id];if(value!==undefined&&(!object(value)||typeof value.enabled!=='boolean'||Object.keys(value).some(k=>k!=='enabled')))throw Error('판매처 ON/OFF 값이 올바르지 않습니다.');sources[id]={enabled:value?.enabled===true};}
  return {schemaVersion:1,intervalsHours,sources};
 }
 const canonical=config=>JSON.stringify(config);
 function stateLabel(draft,saved){return canonical(draft)===canonical(saved)?'GitHub에서 확인한 저장본과 같습니다.':'초안 변경됨 · 아직 GitHub에 저장하지 않았습니다.';}
 let state=null;
 const node=id=>document.getElementById(id);
 function message(text){const n=node('controlsMessage');if(n)n.textContent=text;}
 function draw(){if(!state)return;const focusedSource=document.activeElement?.dataset?.controlSource;for(const mode of Object.keys(OPTIONS)){const select=node('interval-'+mode);select.value=String(state.draft.intervalsHours[mode]);select.disabled=state.busy;}
  const draft=node('controlsDraft');draft.value=JSON.stringify(state.draft,null,2)+'\n';
  node('copyControls').disabled=state.busy||!state.baseSha||state.conflict;
  node('verifyControls').disabled=state.busy;
  node('reloadControls').disabled=state.busy;
  node('draftState').textContent=state.saved?stateLabel(state.draft,state.saved):'배포본을 바탕으로 작성 중 · GitHub 최신 저장본 확인 필요';
  node('githubRevision').textContent=state.baseSha?'GitHub에서 확인한 파일 버전: '+state.baseSha.slice(0,12):'GitHub 최신 저장본 미확인';
  const applied=state.data.controls?.collectorRevision;
  node('collectorRevision').textContent=applied?'마지막 수집에서 사용한 설정: '+applied.slice(0,12)+' · 이후 변경은 다음 해당 수집에서 반영':'이 설정 기능을 사용한 수집 실행은 아직 확인되지 않았습니다.';
  state.render?.();
  if(focusedSource){const inputs=node('rows').querySelectorAll?.('[data-control-source]')||[];const target=[...inputs].find(input=>input.dataset.controlSource===focusedSource);if(target&&!target.disabled)target.focus();}
 }
 function toggleMarkup(source){
  if(!state)return '';
  const blocked=source.control?.registryEligible===false||source.enabled===false&&source.control?.registryEligible!==true;
  const checked=state.draft.sources[source.id]?.enabled===true;
  return `<label class="source-toggle"><input type="checkbox" data-control-source="${esc(source.id)}" ${checked?'checked':''} ${blocked&&!checked||state.busy?'disabled':''} aria-label="${esc(source.name)} 수집 초안 ON/OFF"> ${checked?'ON':'OFF'}</label><small>초안 설정${blocked?' · 원래 수집 불가':''}</small>`;
 }
 async function remote(){
  const response=await fetch(API_URL,{cache:'no-store',headers:{Accept:'application/vnd.github+json'}});if(!response.ok)throw Error('GitHub 설정을 확인하지 못했습니다 ('+response.status+').');
  const payload=await response.json();if(payload.type!=='file'||payload.encoding!=='base64'||typeof payload.sha!=='string'||!payload.content)throw Error('GitHub 설정 응답이 올바르지 않습니다.');
  const bytes=Uint8Array.from(atob(payload.content.replace(/\s/g,'')),c=>c.charCodeAt(0));
  return {sha:payload.sha,config:normalize(JSON.parse(new TextDecoder().decode(bytes)),state.ids)};
 }
 async function reload(){if(!state)return;state.busy=true;draw();message('GitHub의 최신 저장본을 확인하는 중입니다.');try{const latest=await remote();state.baseSha=latest.sha;state.saved=latest.config;state.draft=structuredClone(latest.config);state.conflict=false;message('GitHub 저장본을 불러왔습니다. 변경 후 JSON을 복사하고 GitHub에서 최종 저장하세요.');}catch(error){message(error.message+' 서버에 저장된 것으로 표시하지 않습니다.');}finally{state.busy=false;draw();}}
 async function copy(){state.busy=true;draw();try{const latest=await remote();if(latest.sha!==state.baseSha){state.conflict=true;message('다른 설정이 먼저 저장되었습니다. 초안은 유지했습니다. 최신 저장본을 불러온 뒤 변경 사항을 다시 선택하세요.');return;}
  const text=JSON.stringify(state.draft,null,2)+'\n';try{await navigator.clipboard.writeText(text);message('JSON을 복사했습니다. 아래 GitHub 편집 화면에서 파일 전체를 붙여넣고 변경 내역을 검토한 뒤 Commit changes로 최종 저장하세요.');}catch{if(node('controlsDraft').parentElement)node('controlsDraft').parentElement.open=true;node('controlsDraft').focus();node('controlsDraft').select();message('자동 복사를 사용할 수 없습니다. 선택된 JSON을 직접 복사한 뒤 GitHub에서 최종 저장하세요.');}
 }catch(error){message(error.message+' 아직 저장되지 않았습니다.');}finally{state.busy=false;draw();}}
 async function verify(){state.busy=true;draw();try{const latest=await remote();if(canonical(latest.config)===canonical(state.draft)){state.baseSha=latest.sha;state.saved=latest.config;state.conflict=false;message('GitHub 저장을 확인했습니다. 현재 실행 중인 수집에는 소급 적용되지 않으며, 다음 해당 수집이 이 설정을 읽습니다.');}else{state.conflict=true;message('GitHub 저장본과 현재 초안이 다릅니다. 저장 완료로 표시하지 않습니다. 최신 저장본을 불러와 확인하세요.');}}catch(error){message(error.message+' 저장 여부는 미확인입니다.');}finally{state.busy=false;draw();}}
 function init(data,{render}={}){
  if(!node('controlsPanel'))return;
  if(!data.controls?.config){message(data.controlsError||'실제 수집 설정 파일이 아직 연결되지 않았습니다. 변경 기능은 사용할 수 없습니다.');for(const id of ['copyControls','verifyControls','reloadControls'])node(id).disabled=true;return;}
  const ids=data.sources.map(s=>s.id),config=normalize(data.controls.config,ids);state={data,ids,draft:structuredClone(config),saved:null,baseSha:null,conflict:false,busy:false,render};
  node('githubSettings').href=EDIT_URL;
  for(const [mode,options]of Object.entries(OPTIONS)){const select=node('interval-'+mode);select.innerHTML=options.map(h=>`<option value="${h}">${h<24?h+'시간':h/24+'일'}</option>`).join('');select.addEventListener('change',()=>{state.draft.intervalsHours[mode]=Number(select.value);message('초안을 변경했습니다. GitHub에 저장하기 전에는 적용되지 않습니다.');draw();});}
  node('rows').addEventListener('change',event=>{const id=event.target?.dataset?.controlSource;if(!id||!state.draft.sources[id])return;const source=data.sources.find(s=>s.id===id);if(source?.control?.registryEligible===false&&event.target.checked)return;state.draft.sources[id].enabled=event.target.checked===true;message('초안을 변경했습니다. GitHub에 저장하기 전에는 적용되지 않습니다.');draw();});
  node('copyControls').addEventListener('click',copy);node('verifyControls').addEventListener('click',verify);node('reloadControls').addEventListener('click',reload);
  draw();reload();
 }
 const api={init,toggleMarkup,normalize,canonical,stateLabel,OPTIONS,EDIT_URL,API_URL};root.AquaAdminControls=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
