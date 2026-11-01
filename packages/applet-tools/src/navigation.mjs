import {resolveRoute, safeRouteUrl} from './routes.mjs';

export function safeNavigationUrl(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(https?):\/\/(.*)$/i);
  if (!match || !safeRouteUrl(`https://${match[2]}`)) return null;
  const url = new URL(value);
  return url.hostname === 'appassets.androidplatform.net' ? null : url;
}
export function validateNavigation(manifest) {
  const requireValue = (condition, message) => { if (!condition) throw Object.assign(new Error(message), {code:'INVALID_PACKAGE'}); };
  const shape = (value, keys) => requireValue(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k=>keys.includes(k)) && keys.every(k=>Object.hasOwn(value,k)), 'Invalid navigation object');
  const text = (value, limit) => typeof value === 'string' && value.trim().length > 0 && Buffer.byteLength(value) <= limit;
  if (manifest.schemaVersion !== 3) {
    requireValue(manifest.navigation === undefined && manifest.websiteActions === undefined && manifest.routeContracts.every(c=>c.defaultSourceId===undefined), 'Navigation policy requires schema 3');
    return;
  }
  const policy = manifest.navigation;
  shape(policy, ['external','uncoveredWebsiteRecovery']); shape(policy.external, ['default','origins']);
  requireValue(typeof policy.uncoveredWebsiteRecovery === 'boolean' && ['website','blocked'].includes(policy.external.default), 'Invalid navigation fallback');
  requireValue(Array.isArray(policy.external.origins) && policy.external.origins.length<=64 && Array.isArray(manifest.websiteActions) && manifest.websiteActions.length<=64 && Buffer.byteLength(JSON.stringify([policy,manifest.websiteActions]))<=65536, 'Navigation metadata exceeds bounds');
  const origins = new Set();
  for (const c of manifest.routeContracts) {
    requireValue(c.origins.every(o=>{if(origins.has(o))return false;origins.add(o);return true;}), 'Internal origin belongs to multiple contracts');
    requireValue(manifest.sources.some(s=>s.id===c.defaultSourceId&&s.routeContractId===c.id), 'Contract requires matching default source');
  }
  for (const o of policy.external.origins) {
    shape(o,['origin','result','reason']);
    requireValue(safeNavigationUrl(o.origin)?.origin===o.origin&&!origins.has(o.origin)&&['website','blocked'].includes(o.result)&&text(o.reason,1024), 'Invalid external origin policy'); origins.add(o.origin);
  }
  const actions = new Set();
  for (const a of manifest.websiteActions) {
    shape(a,['id','contractId','routeIds','label','reason']);
    const contract=manifest.routeContracts.find(c=>c.id===a.contractId);
    requireValue(/^[a-z][a-z0-9-]{0,63}$/.test(a.id)&&!actions.has(a.id)&&text(a.label,100)&&text(a.reason,1024)&&Array.isArray(a.routeIds)&&a.routeIds.length>0&&a.routeIds.length<=100&&new Set(a.routeIds).size===a.routeIds.length&&a.routeIds.every(id=>contract?.routes.some(r=>r.id===id&&r.result.kind==='custom')), 'Invalid website action'); actions.add(a.id);
  }
}

export function decideNavigation(manifest, activeSource, target) {
  const d={target,kind:'blocked',title:'Page unavailable',reason:'This destination is not permitted.',websiteAllowed:false};
  if(target.kind==='page') {if(manifest.pages.some(p=>p.id===target.pageId)){d.kind='page';d.title='Applet page';delete d.reason;}return d;}
  if(target.kind!=='url')return d;
  const url=safeNavigationUrl(target.url),policy=manifest.navigation;if(!url||!policy)return d;
  const contract=manifest.routeContracts.find(c=>c.origins.includes(url.origin));
  if(!contract){
    if(target.websiteActionId!==undefined||target.sourceId!==undefined)return d;
    const rule=policy.external.origins.find(o=>o.origin===url.origin);
    if((rule?.result??policy.external.default)==='website'){d.kind='external';d.title='External website';d.websiteAllowed=true;d.reason='Open this destination in its original website.';}else if(rule)d.reason=rule.reason;
    return d;
  }
  d.contractId=contract.id;
  const source=target.sourceId??(manifest.sources.some(s=>s.id===activeSource&&s.routeContractId===contract.id)?activeSource:contract.defaultSourceId);
  if(!manifest.sources.some(s=>s.id===source&&s.routeContractId===contract.id))return d;
  d.sourceId=source;
  const route=resolveRoute(contract,target.url);
  if(route.kind==='matched'){
    d.routeId=route.routeId;const result=route.result;
    if(result.kind==='blocked'){d.reason=result.reason;return d;}
    if(result.kind==='custom'){
      if(target.websiteActionId!==undefined){
        const action=manifest.websiteActions.find(a=>a.id===target.websiteActionId&&a.contractId===contract.id&&a.routeIds.includes(route.routeId));
        if(!action){d.reason='INVALID_WEBSITE_ACTION';return d;}
        d.kind='website';d.title=action.label;d.reason=action.reason;d.websiteActionId=action.id;d.websiteAllowed=true;
      }else{d.kind='custom';d.title=result.title??'Applet page';d.screen=result.screen;delete d.reason;}
    }else if(target.websiteActionId===undefined){d.kind='website';d.title='Continue on website';d.reason=result.reason;d.websiteAllowed=true;}else d.reason='INVALID_WEBSITE_ACTION';
  }else if(route.kind==='unsupported'&&target.websiteActionId===undefined){d.kind='uncovered';d.title='Not covered by this applet';d.reason='This page has no customized screen.';d.websiteAllowed=policy.uncoveredWebsiteRecovery;}
  return d;
}
