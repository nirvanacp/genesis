//! API 3 lifecycle. Source adapters and owned pages have separate document authority.
use genesis_contracts::*;
use serde_json::{Value, json};
use std::collections::HashMap;

#[derive(Clone)]
struct Document {
    id: String,
    channel: u64,
    nonce: String,
    challenge: String,
    bound: bool,
}
#[derive(Default)]
pub struct IsolatedHost {
    index: Option<PackageIndex>,
    generation: u64,
    serial: u64,
    package: Option<Package>,
    selection: Value,
    url: String,
    page: String,
    epoch: u64,
    documents: HashMap<String, Document>,
    snapshot: Value,
    history: Vec<(Value, String, String)>,
    sections: HashMap<String, (String, String)>,
    source_live_url: String,
    navigation_version: u64,
    recovery: Option<(u64, NavigationDecision)>,
    website: bool,
    source_exposed: bool,
    website_session: Option<String>,
    modal: bool,
    back_handler: bool,
    pending_back: Option<u64>,
    last_publish: Option<std::time::Instant>,
    deadline: Option<std::time::Instant>,
    deadline_token: u64,
    paused_remaining: Option<std::time::Duration>,
    transitions: std::collections::VecDeque<Value>,
    diagnostic_start: Option<std::time::Instant>,

}
impl IsolatedHost {
    fn explicit_navigation(&self) -> bool { self.package.as_ref().is_some_and(|p|p.manifest.schema_version==3) }
    fn decision(&self, target: NavigationTarget) -> Value {
        use std::hash::{Hash, Hasher};
        let Some(package)=self.package.as_ref() else {return Value::Null;};
        let mut value=serde_json::to_value(crate::navigation::decide(&package.manifest,self.selection["sourceId"].as_str(),target)).unwrap();
        value["binding"]=json!({"revision":package.revision,"generation":self.generation,"navigationVersion":self.navigation_version});
        let mut hash=std::collections::hash_map::DefaultHasher::new();value.to_string().hash(&mut hash);
        value["decisionKey"]=json!(format!("{:016x}",hash.finish()));value
    }
    fn navigation_snapshot(&self,out:&mut Vec<Value>) {
        if !self.explicit_navigation(){return;}
        let target=if self.page.is_empty(){NavigationTarget::Url{url:self.url.clone(),source_id:self.selection["sourceId"].as_str().map(str::to_owned),website_action_id:None}}else{NavigationTarget::Page{page_id:self.page.clone()}};
        self.notify("foreground","navigation.snapshot",json!({"decision":self.decision(target),"navigationVersion":self.navigation_version,"mode":if self.website{"website"}else if self.recovery.is_some(){"recovery"}else{"applet"}}),out);
    }
    fn show_recovery(&mut self, decision: NavigationDecision, out:&mut Vec<Value>) {
        self.navigation_version+=1;self.serial+=1;
        self.recovery=Some((self.serial,decision.clone()));
        out.push(json!({"type":"isolatedNavigationRecovery","generation":self.generation,"recoveryId":self.serial,"decision":decision,"retireSource":matches!(&decision.target,NavigationTarget::Url{url,..} if *url==self.source_live_url && *url!=self.url)}));
        self.navigation_snapshot(out);
    }
    fn enter_website(&mut self,url:String,out:&mut Vec<Value>) {
        let adopt=url==self.source_live_url;self.begin_website();self.source_exposed=adopt;
        if adopt{self.cancel_deadline();self.notify("source","context.retired",Value::Null,out);self.documents.remove("source");}
        out.push(json!({"type":"isolatedWebsite","sessionId":self.website_session,"generation":self.generation,"url":url,"adopt":adopt}));
        self.navigation_snapshot(out);
    }
    fn activate_navigation(&mut self,target:NavigationTarget,website:bool,out:&mut Vec<Value>)->Result<&'static str,String>{
        let decision:NavigationDecision=serde_json::from_value(self.decision(target.clone())).map_err(|e|e.to_string())?;
        match (&decision.kind,target){
            (DestinationKind::Custom,NavigationTarget::Url{url,..}) if !website=>{
                let mut input=self.selection.clone();input["sourceId"]=json!(decision.source_id);input["url"]=json!(url);input["pageId"]=Value::Null;self.open(&input,true,out)?;
            }
            (DestinationKind::Page,NavigationTarget::Page{page_id}) if !website=>{
                let mut input=self.selection.clone();input["url"]=json!(self.url);input["pageId"]=json!(page_id);self.open(&input,true,out)?;
            }
            (DestinationKind::Website|DestinationKind::External,NavigationTarget::Url{url,..}) if website=>{self.recovery=None;self.enter_website(url,out);}
            _ if website=>return Err("Navigation does not permit website entry".into()),
            _=>{self.show_recovery(decision,out);return Ok("recovery");}
        }
        Ok("dispatched")
    }
    fn start_deadline(&mut self, duration: std::time::Duration, out: &mut Vec<Value>) {
        if self.deadline.is_some() || self.paused_remaining.is_some() || self.source_exposed { return; }
        self.deadline_token += 1;
        self.deadline = Some(std::time::Instant::now() + duration);
        out.push(json!({"type":"isolatedSourceDeadline","generation":self.generation,"epoch":self.epoch,
            "token":self.deadline_token,"delayMs":duration.as_millis() as u64}));
    }
    fn cancel_deadline(&mut self) {
        self.deadline = None;
        self.paused_remaining = None;
        self.deadline_token += 1;
    }
    fn publish_snapshot(&mut self, out: &mut Vec<Value>) {
        if self.transitions.len() == 64 { self.transitions.pop_front(); }
        let elapsed=self.diagnostic_start.get_or_insert_with(std::time::Instant::now).elapsed().as_millis() as u64;
        let previous=self.transitions.back().map(|v|v["state"].clone()).unwrap_or(Value::Null);
        self.transitions.push_back(json!({"elapsedMs":elapsed,"role":"source","previous":previous,"epoch":self.epoch,"generation":self.generation,
            "state":self.snapshot["state"],"routeId":self.snapshot["route"]["routeId"],
            "code":self.snapshot["error"]["code"],"origin":self.snapshot["error"]["origin"]}));
        self.notify("foreground", "source.snapshot", self.snapshot.clone(), out);
    }
    fn source_failure(&mut self, code: &str, message: &str, out: &mut Vec<Value>) {
        self.cancel_deadline();
        self.snapshot["state"] = json!("error");
        self.snapshot["error"] = json!({"message":message,"code":code,"origin":"host","retryable":true});
        self.publish_snapshot(out);
    }
    fn command(&self, kind: &str) -> Value {
        json!({"type":kind,"generation":self.generation})
    }
    fn notify(&self, role: &str, kind: &str, data: Value, out: &mut Vec<Value>) {
        if let Some(doc) = self.documents.get(role).filter(|d| d.bound) {
            out.push(json!({"type":"isolatedReply","generation":self.generation,"role":role,"channel":doc.channel,
                "message":{"type":kind,"documentId":doc.id,"data":data}}));
        }
    }
    fn reply(&self, role: &str, request: &str, result: Result<Value, &str>, out: &mut Vec<Value>) {
        if let Some(doc) = self.documents.get(role).filter(|d| d.bound) {
            let message = match result {
                Ok(value) => {
                    json!({"v":1,"documentId":doc.id,"requestId":request,"ok":true,"result":value})
                }
                Err(reason) => json!({"v":1,"documentId":doc.id,"requestId":request,"ok":false,
                    "error":{"code":if matches!(reason,"STALE_NAVIGATION"|"USE_DECLARED_NAVIGATION"){reason}else{"INVALID_ARGUMENT"},"message":reason,"retryable":false}}),
            };
            out.push(json!({"type":"isolatedReply","generation":self.generation,"role":role,"channel":doc.channel,"message":message}));
        }
    }
    fn source(&self) -> Option<&Source> {
        self.package
            .as_ref()?
            .manifest
            .sources
            .iter()
            .find(|s| Some(s.id.as_str()) == self.selection["sourceId"].as_str())
    }
    fn resolution(&self, url: &str) -> RouteResolution {
        let Some(source) = self.source() else {
            return RouteResolution::Blocked;
        };
        let Some(contract) = self.package.as_ref().and_then(|p| {
            p.manifest
                .route_contracts
                .iter()
                .find(|c| Some(&c.id) == source.route_contract_id.as_ref())
        }) else {
            return RouteResolution::External;
        };
        crate::routes::resolve(contract, url)
    }
    fn route_state(&mut self, out: &mut Vec<Value>) {
        let result = self.resolution(&self.url);
        let state = match result {
            RouteResolution::Matched {
                result: RouteResult::Custom { .. },
                ..
            } => "loading",
            RouteResolution::Matched {
                result: RouteResult::Website { .. },
                ..
            } => "website",
            RouteResolution::Blocked | RouteResolution::Matched { result: RouteResult::Blocked { .. }, .. } => "blocked",
            _ => "unsupported",
        };
        self.snapshot = json!({"state":state,"url":self.url,"sourceId":self.selection["sourceId"],"pageId":self.page,
            "sectionId":self.selection["sectionId"],"route":self.resolution(&self.url),"epoch":self.epoch});
        if state == "loading" { self.start_deadline(std::time::Duration::from_secs(15), out); }
        else { self.cancel_deadline(); }
        if state == "unsupported" { self.snapshot["error"] = json!({"code":"UNSUPPORTED_ROUTE","origin":"host","retryable":false,"message":"This page needs the website."}); }
        self.publish_snapshot(out);
    }
    fn launcher(&mut self, out: &mut Vec<Value>) {
        if self.package.is_some() {
            out.push(self.command("isolatedDestroy"));
        }
        self.cancel_deadline();
        self.recovery=None;self.navigation_version+=1;
        self.transitions.clear();
        self.diagnostic_start=None;
        self.package = None;
        self.documents.clear();
        self.history.clear();
        self.website = false;
        self.website_session = None;
        self.source_exposed = false;
        let entries: Vec<Value> = self.index.as_ref().into_iter().flat_map(|i| i.packages.iter().filter(|p| !i.hidden_applet_ids.contains(&p.manifest.id))).map(|p|
            json!({"appletId":p.manifest.id,"sourceId":p.manifest.sources[0].id,"label":p.manifest.name})).collect();
        out.push(json!({"type":"showLauncher","entries":entries,"status":"Your customized apps"}));
    }
    fn open(&mut self, input: &Value, remember: bool, out: &mut Vec<Value>) -> Result<(), String> {
        let applet = input["appletId"]
            .as_str()
            .or_else(|| self.package.as_ref().map(|p| p.manifest.id.as_str()))
            .ok_or("Missing applet")?
            .to_owned();
        let package = self
            .index
            .as_ref()
            .and_then(|i| i.packages.iter().find(|p| p.manifest.id == applet))
            .cloned()
            .ok_or("Unknown applet")?;
        let source_id = input["sourceId"]
            .as_str()
            .or_else(|| package.manifest.sources.first().map(|s| s.id.as_str()))
            .ok_or("Missing source")?;
        let source = package
            .manifest
            .sources
            .iter()
            .find(|s| s.id == source_id)
            .ok_or("Unknown source")?
            .clone();
        let section = input["sectionId"].as_str().unwrap_or("");
        let saved = self.sections.get(&format!("{applet}/{section}")).cloned();
        let url = input["url"]
            .as_str()
            .map(str::to_owned)
            .or_else(|| saved.as_ref().map(|s| s.0.clone()))
            .unwrap_or(source.start_url.clone());
        let page = input["pageId"]
            .as_str()
            .map(str::to_owned)
            .or_else(|| saved.map(|s| s.1))
            .unwrap_or_default();
        if !page.is_empty() && !package.manifest.pages.iter().any(|p| p.id == page) {
            return Err("Unknown owned page".into());
        }
        let origin = url::Url::parse(&url)
            .map_err(|e| e.to_string())?
            .origin()
            .ascii_serialization();
        let permitted = package
            .manifest
            .route_contracts
            .iter()
            .find(|c| Some(&c.id) == source.route_contract_id.as_ref())
            .map(|c| c.origins.contains(&origin))
            .unwrap_or_else(|| source.origins.contains(&origin));
        if !permitted {
            return Err("Destination outside selected source origins".into());
        }
        let same_app = self
            .package
            .as_ref()
            .is_some_and(|p| p.manifest.id == applet);
        if same_app
            && remember
            && !self.url.is_empty()
            && (self.url != url
                || self.page != page
                || self.selection["sourceId"] != source.id
                || self.selection["sectionId"] != section)
        {
            if self.history.len() >= 64 {
                self.history.remove(0);
            }
            self.history
                .push((self.selection.clone(), self.url.clone(), self.page.clone()));
        }
        if !same_app {
            self.history.clear();
            self.sections.clear();
        }
        if !self.selection["sectionId"]
            .as_str()
            .unwrap_or("")
            .is_empty()
        {
            self.sections.insert(
                format!(
                    "{}/{}",
                    self.selection["appletId"].as_str().unwrap_or(""),
                    self.selection["sectionId"].as_str().unwrap_or("")
                ),
                (self.url.clone(), self.page.clone()),
            );
        }
        self.selection = json!({"appletId":applet,"sourceId":source.id,"pageId":if page.is_empty(){Value::Null}else{json!(page)},"sectionId":section});
        self.url = url;
        self.source_live_url=if package.manifest.schema_version>1 && matches!(crate::routes::resolve(package.manifest.route_contracts.iter().find(|c|Some(&c.id)==source.route_contract_id.as_ref()).unwrap_or_else(||package.manifest.route_contracts.first().unwrap()),&self.url),RouteResolution::Matched{result:RouteResult::Custom{..},..}){self.url.clone()}else{String::new()};
        self.page = page;
        self.cancel_deadline();
        self.epoch += 1;
        self.navigation_version+=1;self.recovery=None;
        self.website = false;
        self.website_session = None;
        self.source_exposed = false;
        self.modal = false;
        self.back_handler = false;
        self.pending_back = None;
        let recreate = !same_app
            || input["resetForeground"] == true
            || !self.documents.contains_key("foreground");
        self.package = Some(package.clone());
        if package.manifest.schema_version == 1 {
            if self.generation > 0 {
                out.push(self.command("isolatedDestroy"));
            }
            self.generation += 1;
            self.documents.clear();
            self.begin_website();
            out.push(json!({"type":"isolatedLegacy","sessionId":self.website_session,"generation":self.generation,"package":package,"selection":self.selection,"url":self.url}));
            return Ok(());
        }

        if recreate {
            if same_app || self.generation > 0 {
                out.push(self.command("isolatedDestroy"));
            }
            self.generation += 1;
            self.documents.clear();
            out.push(json!({"type":"isolatedCreate","generation":self.generation,"package":package,"selection":self.selection,"source":source}));
        } else {
            self.notify("foreground", "route.changed", json!({"url":self.url}), out);
        }
        self.documents.remove("source");
        self.last_publish = None;
        let home = url::Url::parse(&self.url)
            .is_ok_and(|url| source.home_paths.iter().any(|path| path == url.path()));
        let detail = !self.page.is_empty() || (!self.history.is_empty() && !home);
        out.push(json!({"type":"isolatedNavigate","generation":self.generation,"epoch":self.epoch,"url":self.url,"pageId":self.page,"selection":self.selection,"source":source,"detail":detail,"loadSource":!self.explicit_navigation()||!self.source_live_url.is_empty()}));
        self.route_state(out);
        self.navigation_snapshot(out);
        if self.explicit_navigation() && self.page.is_empty() {
            let decision=crate::navigation::decide(&package.manifest,Some(&source.id),NavigationTarget::Url{url:self.url.clone(),source_id:Some(source.id.clone()),website_action_id:None});
            if decision.kind!=DestinationKind::Custom {self.show_recovery(decision,out);}
        }
        Ok(())
    }
    fn begin_website(&mut self) {
        self.serial += 1;
        self.website_session = Some(format!("website-{}-{}", self.generation, self.serial));
        self.website = true;
        self.navigation_version+=1;
        self.pending_back = None;
    }
    fn back(&mut self, out: &mut Vec<Value>) -> Result<(), String> {
        if self.website {
            out.push(self.command("isolatedWebsiteBack"));
            return Ok(());
        }
        if self.recovery.take().is_some(){self.navigation_version+=1;out.push(self.command("isolatedNavigationDismiss"));self.navigation_snapshot(out);return Ok(());}
        if self.modal {
            self.modal = false;
            self.notify("foreground", "ui.dismissModal", Value::Null, out);
            out.push(json!({"type":"modalState","open":false}));
            return Ok(());
        }
        if self.back_handler {
            self.serial += 1;
            self.pending_back = Some(self.serial);
            self.notify(
                "foreground",
                "navigation.back",
                json!({"token":self.serial}),
                out,
            );
            out.push(json!({"type":"isolatedBackDeadline","generation":self.generation,"token":self.serial}));
            return Ok(());
        }
        self.back_default(out)
    }
    fn back_default(&mut self, out: &mut Vec<Value>) -> Result<(), String> {
        if let Some((mut selection, url, page)) = self.history.pop() {
            selection["url"] = json!(url);
            selection["pageId"] = json!(page);
            self.open(&selection, false, out)
        } else {
            self.launcher(out);
            Ok(())
        }
    }
    pub fn dispatch(&mut self, event: Value) -> Result<Vec<Value>, String> {
        let mut out = Vec::new();
        let kind = event["type"].as_str().unwrap_or("");
        if kind == "attach" {
            let index: PackageIndex =
                serde_json::from_value(event["index"].clone()).map_err(|e| e.to_string())?;
            crate::packages::validate(&index)?;
            self.index = Some(index);
            self.launcher(&mut out);
            // Restore only declared custom GET destinations. Website form/POST state is
            // not serializable and must never be reconstructed or replayed.
            let restore = &event["restore"];
            if restore["selection"].is_object() {
                let mut selection = restore["selection"].clone();
                if let Some(url) = restore["currentUrl"].as_str() {
                    selection["url"] = json!(url);
                }
                let id = selection["appletId"].as_str().unwrap_or("");
                let source_id = selection["sourceId"].as_str().unwrap_or("");
                let custom = self
                    .index
                    .as_ref()
                    .and_then(|i| i.packages.iter().find(|p| p.manifest.id == id))
                    .is_some_and(|p| {
                        let source = p.manifest.sources.iter().find(|s| s.id == source_id);
                        p.manifest
                            .route_contracts
                            .iter()
                            .find(|c| {
                                Some(&c.id) == source.and_then(|s| s.route_contract_id.as_ref())
                            })
                            .is_some_and(|c| {
                                matches!(
                                    crate::routes::resolve(
                                        c,
                                        selection["url"].as_str().unwrap_or("")
                                    ),
                                    RouteResolution::Matched {
                                        result: RouteResult::Custom { .. },
                                        ..
                                    }
                                )
                            })
                    });
                if custom {
                    self.open(&selection, false, &mut out)?;
                }
            }
            return Ok(out);
        }
        if kind == "home" {
            self.launcher(&mut out);
            return Ok(out);
        }
        if kind == "open" || kind == "openPage" {
            let mut input = event.clone();
            if kind == "openPage" {
                input["sourceId"] = self.selection["sourceId"].clone();
            }
            self.open(&input, true, &mut out)?;
            return Ok(out);
        }
        if self.package.is_none() {
            return Ok(out);
        }
        if event.get("generation").is_some()
            && event["generation"].as_u64() != Some(self.generation)
        {
            return Ok(out);
        }
        match kind {
            "back" => self.back(&mut out)?,
            "isolatedBackDeadline" => if self.pending_back.is_some() && event["token"].as_u64() == self.pending_back { self.pending_back=None; self.back_default(&mut out)?; },
            "isolatedForegroundFailed" => {self.documents.remove("foreground");self.modal=false;self.back_handler=false;self.pending_back=None;out.push(json!({"type":"modalState","open":false}));},
            "isolatedForegroundRetry" => {self.documents.remove("foreground");let mut input=self.selection.clone();input["url"]=json!(self.url);input["pageId"]=json!(self.page);self.open(&input,false,&mut out)?;},
            "isolatedRecoveryContinue" => {
                if !self.website && let Some((id,decision))=self.recovery.clone() && event["recoveryId"].as_u64()==Some(id) && decision.website_allowed && let NavigationTarget::Url{url,..}=decision.target {self.enter_website(url,&mut out);}
            },
            "isolatedWebsiteCheck" => {
                if self.website && self.explicit_navigation() && event["sessionId"].as_str()==self.website_session.as_deref() {
                    let d=crate::navigation::decide(&self.package.as_ref().unwrap().manifest,None,NavigationTarget::Url{url:event["url"].as_str().unwrap_or("").into(),source_id:None,website_action_id:None});
                    if d.kind==DestinationKind::Blocked || d.kind==DestinationKind::Uncovered&&!d.website_allowed {out.push(self.command("isolatedWebsiteBlocked"));}
                }
            },
            "isolatedLink" => {
                if self.website { return Ok(out); }
                let url=event["url"].as_str().unwrap_or("");
                if self.explicit_navigation(){self.activate_navigation(NavigationTarget::Url{url:url.into(),source_id:None,website_action_id:None},false,&mut out)?;return Ok(out);}
                if matches!(self.resolution(url),RouteResolution::Matched{result:RouteResult::Custom{..},..}) {
                    let mut input=self.selection.clone();input["url"]=json!(url);input["pageId"]=Value::Null;self.open(&input,true,&mut out)?;
                } else if url::Url::parse(url).is_ok_and(|u|["http","https"].contains(&u.scheme())&&u.username().is_empty()&&u.password().is_none()) {
                    self.begin_website();let adopt=url==self.url;self.source_exposed=adopt;if adopt{self.cancel_deadline();self.notify("source","context.retired",Value::Null,&mut out);self.documents.remove("source");}
                    out.push(json!({"type":"isolatedWebsite","sessionId":self.website_session,"generation":self.generation,"url":url,"adopt":adopt}));
                }
            },
            "ordinary" => { if self.explicit_navigation(){return Ok(out);} self.begin_website(); self.source_exposed=true; self.cancel_deadline(); self.notify("source","context.retired",Value::Null,&mut out); self.documents.remove("source"); out.push(json!({"type":"isolatedWebsite","sessionId":self.website_session,"generation":self.generation,"url":self.url,"adopt":true})); },
            "retry" | "reload" => if self.website { out.push(self.command("isolatedWebsiteReload")); } else {
                let mut input=self.selection.clone();input["url"]=json!(self.url);input["pageId"]=json!(self.page);self.open(&input,false,&mut out)?;
            },
            "forward" => out.push(self.command("isolatedWebsiteForward")),
            "readerClose" => {out.push(self.command("isolatedWebsiteClose"));},
            "isolatedWebsiteClosed" => {
                if !self.website || self.website_session.as_deref()!=event["sessionId"].as_str() { return Ok(out); }
                self.website=false;self.source_exposed=false;self.website_session=None;self.navigation_version+=1;
                let recovery=self.recovery.clone();
                if self.package.as_ref().is_some_and(|p|p.manifest.schema_version==1){self.launcher(&mut out);return Ok(out);}
                if event["adopted"] == true || event["revalidate"] == true || !self.documents.contains_key("foreground") || !self.documents.get("source").is_some_and(|d|d.bound) || self.snapshot["state"]=="loading" {
                    let mut input=self.selection.clone();input["url"]=json!(self.url);input["pageId"]=json!(self.page);self.open(&input,false,&mut out)?;
                }
                if let Some((id,d))=recovery{self.recovery=Some((id,d.clone()));out.push(json!({"type":"isolatedNavigationRecovery","generation":self.generation,"recoveryId":id,"decision":d}));}
                self.navigation_snapshot(&mut out);
                self.notify("foreground","host.focused",Value::Null,&mut out);
            },
            "isolatedSourceNavigation" => {
                if event["epoch"].as_u64()!=Some(self.epoch) { return Ok(out); }
                let url=event["url"].as_str().unwrap_or("");
                self.source_live_url=url.into();
                if url != self.url {
                    if self.explicit_navigation(){
                        let d=crate::navigation::decide(&self.package.as_ref().unwrap().manifest,self.selection["sourceId"].as_str(),NavigationTarget::Url{url:url.into(),source_id:None,website_action_id:None});
                        if d.kind!=DestinationKind::Custom {self.documents.remove("source");self.cancel_deadline();self.show_recovery(d,&mut out);return Ok(out);}
                    }
                    if event["sameDocument"]==true && matches!(self.resolution(url),RouteResolution::Matched{result:RouteResult::Custom{..},..}) {
                        let mut input=self.selection.clone();input["url"]=json!(url);input["pageId"]=Value::Null;self.open(&input,true,&mut out)?;
                    }else{self.url=url.into();self.documents.remove("source");self.route_state(&mut out);}
                }
            },
            "isolatedSourceTimeout" => {
                if event["epoch"].as_u64()==Some(self.epoch) && event["token"].as_u64()==Some(self.deadline_token) && self.deadline.is_some() && self.snapshot["state"]=="loading" {
                    self.source_failure("SOURCE_TIMEOUT", "This page is taking too long. Try again or open the website.", &mut out);
                }
            },
            "configureServices" => out.push(json!({"type":"configureServices","appletId":self.package.as_ref().unwrap().manifest.id,"services":self.package.as_ref().unwrap().manifest.services})),
            "isolatedSourceError" => {
                if event["epoch"].as_u64()!=Some(self.epoch) { return Ok(out); }
                let code = match event["code"].as_str() { Some("HTTP") => "HTTP", Some("SOURCE_RENDERER_FAILED") => "SOURCE_RENDERER_FAILED", _ => "NETWORK" };
                self.source_failure(code, "The website could not load. Check your connection and try again.", &mut out);
            },
            "isolatedMessage" => self.message(&event,&mut out)?,
            "storageCompleted" | "serviceCompleted" => {
                let c=&event["completion"];
                if c["generation"].as_u64()==Some(self.generation) && self.documents.get("foreground").is_some_and(|d|d.id==c["documentId"].as_str().unwrap_or("")&&Some(d.channel)==c["channel"].as_u64()) {
                    out.push(json!({"type":"isolatedReply","generation":self.generation,"role":"foreground","channel":c["channel"],"message":c["response"]}));
                    if kind=="storageCompleted" && c["changed"].as_array().is_some_and(|v|!v.is_empty()) {
                        self.notify("foreground","storage.changed",json!({"changes":c["changed"]}),&mut out);
                    }
                }
            },
            "isolatedInspect" => out.push(json!({"type":"isolatedDiagnostics","generation":self.generation,"transitions":self.transitions})),
            "suspended" => {
                let remaining=self.deadline.map(|d|d.saturating_duration_since(std::time::Instant::now()));
                self.cancel_deadline();self.paused_remaining=remaining;
                out.push(self.command("isolatedPause"));
            },
            "resumed" => {if let Some(remaining)=self.paused_remaining.take(){self.start_deadline(remaining,&mut out);}out.push(self.command("isolatedResume"));self.notify("foreground","host.focused",Value::Null,&mut out);},
            "detach" => {out.push(self.command("isolatedDestroy"));self.documents.clear();self.package=None;},
            "saveSession" => out.push(json!({"type":"retainSession","snapshot":{"selection":self.selection,"currentUrl":self.url}})),
            _ => {},
        }
        Ok(out)
    }
    fn message(&mut self, event: &Value, out: &mut Vec<Value>) -> Result<(), String> {
        let role = event["role"].as_str().unwrap_or("");
        if !["foreground", "source"].contains(&role)
            || (role == "source"
                && (self.source_exposed || event["epoch"].as_u64() != Some(self.epoch)))
        {
            return Ok(());
        }
        let expected = if role == "foreground" {
            event["origin"] == "https://appassets.androidplatform.net"
        } else {
            matches!(
                self.resolution(&self.url),
                RouteResolution::Matched {
                    result: RouteResult::Custom { .. },
                    ..
                }
            ) && url::Url::parse(&self.url)
                .is_ok_and(|u| event["origin"] == u.origin().ascii_serialization())
        };
        if !expected {
            return Ok(());
        }
        let raw = event["message"].as_str().unwrap_or("");
        if raw.len() > 262144 {
            return Ok(());
        }
        let Ok(m) = serde_json::from_str::<Value>(raw) else {
            return Ok(());
        };
        let channel = event["channel"].as_u64().ok_or("Missing channel")?;
        if m["type"] == "hello" {
            if m["revision"] != self.package.as_ref().unwrap().revision
                || m["nonce"].as_str().is_none_or(|n| n.len() != 36)
            {
                return Ok(());
            }
            self.serial += 1;
            let doc = Document {
                id: format!(
                    "isolated-{}-{}-{}",
                    self.generation,
                    self.serial,
                    m["nonce"].as_str().unwrap()
                ),
                channel,
                nonce: m["nonce"].as_str().unwrap().into(),
                challenge: format!("challenge-{}", self.serial),
                bound: false,
            };
            out.push(json!({"type":"isolatedChallenge","generation":self.generation,"role":role,"channel":channel,"nonce":doc.nonce,"challenge":doc.challenge}));
            self.documents.insert(role.into(), doc);
            return Ok(());
        }
        let Some(doc) = self
            .documents
            .get(role)
            .filter(|d| d.channel == channel)
            .cloned()
        else {
            return Ok(());
        };
        if m["type"] == "challengeAck" {
            if m["nonce"] == doc.nonce && m["challenge"] == doc.challenge {
                self.documents.get_mut(role).unwrap().bound = true;
                let source_id = self.selection["sourceId"].as_str().unwrap_or("");
                let binding = if role == "foreground" {
                    json!({"kind":"page","pageId":self.package.as_ref().unwrap().manifest.foreground.as_ref().unwrap().page_id})
                } else {
                    json!({"kind":"source","sourceId":source_id})
                };
                out.push(json!({"type":"isolatedReply","generation":self.generation,"role":role,"channel":channel,"message":{"type":"bound","nonce":doc.nonce,"documentId":doc.id,
                    "context":{"runtimeApiVersion":self.package.as_ref().unwrap().runtime_api_version,"role":role,"instanceId":self.package.as_ref().unwrap().manifest.id,"appletId":self.package.as_ref().unwrap().manifest.id,"viewId":doc.id,"generation":self.generation,"binding":binding}}}));
            }
            return Ok(());
        }
        if !doc.bound || m["documentId"] != doc.id || m["v"] != 1 {
            return Ok(());
        }
        let request = m["requestId"]
            .as_str()
            .filter(|s| s.len() <= 128)
            .ok_or("Invalid request")?;
        let method = m["method"].as_str().unwrap_or("");
        let params = &m["params"];
        if method == "runtime.register" {
            let mut expected: Vec<String> = if role == "foreground" {
                self.package
                    .as_ref()
                    .unwrap()
                    .manifest
                    .foreground
                    .as_ref()
                    .unwrap()
                    .screens
                    .clone()
            } else {
                self.package
                    .as_ref()
                    .unwrap()
                    .manifest
                    .route_contracts
                    .iter()
                    .find(|c| Some(&c.id) == self.source().unwrap().route_contract_id.as_ref())
                    .unwrap()
                    .routes
                    .iter()
                    .filter_map(|r| match &r.result {
                        RouteResult::Custom { adapter, .. } => Some(adapter.clone()),
                        _ => None,
                    })
                    .collect()
            };
            expected.sort();
            expected.dedup();
            let key = if role == "foreground" {
                "screens"
            } else {
                "adapters"
            };
            let mut actual: Vec<String> = params[key]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|s| s.as_str().map(str::to_owned))
                .collect();
            actual.sort();
            actual.dedup();
            self.reply(
                role,
                request,
                if expected == actual {
                    Ok(Value::Null)
                } else {
                    Err("Registered screens/adapters do not match the route contract")
                },
                out,
            );
            return Ok(());
        }
        if role == "source" {
            match method {
                "source.publish" => {
                    if self
                        .last_publish
                        .is_some_and(|last| last.elapsed() < std::time::Duration::from_millis(200))
                    {
                        self.reply(role, request, Ok(Value::Null), out);
                        return Ok(());
                    }
                    self.last_publish = Some(std::time::Instant::now());
                    if serde_json::to_vec(params).map_err(|e| e.to_string())?.len() > 196608 {
                        self.reply(role, request, Err("Snapshot exceeds 192 KiB"), out);
                        return Ok(());
                    }
                    if ![
                        "loading",
                        "ready",
                        "empty",
                        "auth-required",
                        "challenge",
                        "unsupported",
                        "error",
                    ]
                    .contains(&params["state"].as_str().unwrap_or(""))
                    {
                        self.reply(role, request, Err("Invalid snapshot state"), out);
                        return Ok(());
                    }
                    let mut problem = Value::Null;
                    if !params["error"].is_null() {
                        let e=&params["error"];
                        let codes=["NETWORK","HTTP","SOURCE_TIMEOUT","ADAPTER_FAILED","SOURCE_RENDERER_FAILED","UNSUPPORTED_ROUTE","CONTENT_UNRECOGNIZED","UPSTREAM_FAILURE","ADAPTER_NOT_IMPLEMENTED"];
                        if !["error","unsupported","auth-required","challenge"].contains(&params["state"].as_str().unwrap_or(""))
                            || e["message"].as_str().is_none_or(|m|m.chars().count()>1024)
                            || (!e["code"].is_null() && !codes.contains(&e["code"].as_str().unwrap_or("")))
                            || (!e["retryable"].is_null() && !e["retryable"].is_boolean()) {
                            self.reply(role,request,Err("Invalid source problem"),out);return Ok(());
                        }
                        problem=json!({"message":e["message"],"origin":"adapter"});
                        if !e["code"].is_null(){problem["code"]=e["code"].clone();}
                        if !e["retryable"].is_null(){problem["retryable"]=e["retryable"].clone();}
                    }
                    if params["state"]=="loading" {
                        if self.snapshot["state"]=="error" {self.reply(role,request,Ok(Value::Null),out);return Ok(());}
                        self.start_deadline(std::time::Duration::from_secs(15),out);
                    } else {self.cancel_deadline();}
                    let mut snapshot = self.snapshot.clone();
                    snapshot["state"] = params["state"].clone();
                    snapshot["data"] = params["data"].clone();
                    snapshot["error"] = problem;
                    self.snapshot = snapshot;
                    self.publish_snapshot(out);
                    self.reply(role, request, Ok(Value::Null), out);
                }
                "source.route" => {
                    if self.website {
                        self.reply(
                            role,
                            request,
                            Err("Source navigation is deferred while a website is visible"),
                            out,
                        );
                        return Ok(());
                    }
                    let url = params["url"].as_str().unwrap_or("");
                    if matches!(
                        self.resolution(url),
                        RouteResolution::Matched {
                            result: RouteResult::Custom { .. },
                            ..
                        }
                    ) {
                        let mut input = self.selection.clone();
                        input["url"] = json!(url);
                        input["pageId"] = Value::Null;
                        self.reply(role, request, Ok(Value::Null), out);
                        self.open(&input, true, out)?;
                    } else {
                        self.reply(role, request, Err("Route is not customized"), out);
                    }
                }
                "runtime.ready" | "runtime.phase" => {
                    self.reply(role, request, Ok(Value::Null), out)
                }
                "runtime.error" => {
                    self.source_failure("ADAPTER_FAILED", "This page could not be prepared. Try again or open the website.", out);
                    self.documents.remove("source");
                }
                _ => self.reply(
                    role,
                    request,
                    Err("Source adapters cannot use foreground capabilities"),
                    out,
                ),
            }
            return Ok(());
        }
        // A late owned-page callback cannot replace the user's visible website.
        if self.website && matches!(method, "sources.open" | "pages.open" | "webViews.open" | "navigation.activate") {
            self.reply(
                role,
                request,
                Err("Close the current website before navigating"),
                out,
            );
            return Ok(());
        }
        if self.explicit_navigation(){
            match method {
                "navigation.resolve"=>{
                    let targets=params["targets"].as_array();
                    if targets.is_none_or(|t|t.len()>64)||params.to_string().len()>65536{self.reply(role,request,Err("Navigation batch exceeds bounds"),out);return Ok(());}
                    let parsed:Result<Vec<NavigationTarget>,_>=targets.unwrap().iter().map(|v|serde_json::from_value(v.clone())).collect();
                    match parsed{Ok(targets)=>self.reply(role,request,Ok(json!(targets.into_iter().map(|t|self.decision(t)).collect::<Vec<_>>())),out),Err(_)=>self.reply(role,request,Err("Invalid navigation target"),out)};return Ok(());
                }
                "navigation.subscribe"=>{self.navigation_snapshot(out);self.reply(role,request,Ok(Value::Null),out);return Ok(());}
                "navigation.activate"=>{
                    let target=serde_json::from_value::<NavigationTarget>(params["decision"]["target"].clone());
                    if let Ok(target)=target {
                        let expected=self.decision(target.clone());
                        if params["decision"]["decisionKey"]!=expected["decisionKey"] || params["decision"]["binding"]!=expected["binding"] {self.reply(role,request,Err("STALE_NAVIGATION"),out);return Ok(());}
                        if !matches!(params["intent"].as_str(),Some("navigate"|"open-website")){self.reply(role,request,Err("Invalid navigation intent"),out);return Ok(());}
                        match self.activate_navigation(target,params["intent"]=="open-website",out){Ok(status)=>self.reply(role,request,Ok(json!({"status":status,"navigationVersion":self.navigation_version})),out),Err(_)=>self.reply(role,request,Err("Navigation intent is not permitted"),out)}
                    }else{self.reply(role,request,Err("Invalid navigation target"),out);}return Ok(());
                }
                "webViews.open"=>{self.reply(role,request,Err("USE_DECLARED_NAVIGATION"),out);return Ok(());}
                "sources.open"|"pages.open"=>{
                    let target=if method=="pages.open"{NavigationTarget::Page{page_id:params["pageId"].as_str().unwrap_or("").into()}}else{
                        let id=params["sourceId"].as_str().unwrap_or("");let url=params["url"].as_str().map(str::to_owned).or_else(||self.package.as_ref().unwrap().manifest.sources.iter().find(|s|s.id==id).map(|s|s.start_url.clone())).unwrap_or_default();
                        NavigationTarget::Url{url,source_id:Some(id.into()),website_action_id:None}};
                    match self.activate_navigation(target,false,out){Ok(_)=>self.reply(role,request,Ok(Value::Null),out),Err(_)=>self.reply(role,request,Err("Navigation failed"),out)}return Ok(());
                }
                _=>{}
            }
        }
        match method {
            "runtime.ready"=>{self.navigation_snapshot(out);out.push(self.command("isolatedForegroundReady"));self.notify(role,"source.snapshot",self.snapshot.clone(),out);},
            "runtime.phase"=>{},
            "runtime.error"=>out.push(json!({"type":"isolatedFailure","generation":self.generation,"message":"The applet could not prepare its interface. Retry or return to Apps."})),
            "source.subscribe"=>{self.notify(role,"source.snapshot",self.snapshot.clone(),out);self.reply(role,request,Ok(Value::Null),out);},
            "source.command"=>{
                if params["epoch"].as_u64()!=Some(self.epoch)||!self.documents.get("source").is_some_and(|d|d.bound)||params["name"].as_str().is_none_or(|n|n.is_empty()||n.len()>64) {
                    self.reply(role,request,Err("Source is not ready for this command"),out);return Ok(());
                }
                self.notify("source","source.command",params.clone(),out);self.reply(role,request,Ok(Value::Null),out);
            },
            "sources.open"|"pages.open"=>{
                self.reply(role,request,Ok(Value::Null),out);
                let mut input=self.selection.clone();input["pageId"]=Value::Null;
                if method=="pages.open" {input["pageId"]=params["pageId"].clone();input["url"]=json!(self.url);}
                else {input["sourceId"]=params["sourceId"].clone();input["url"]=params["url"].clone();}
                self.open(&input,true,out)?;
            },
            "webViews.open"=>{
                let url=params["url"].as_str().unwrap_or("");
                let valid=url::Url::parse(url).is_ok_and(|u|["http","https"].contains(&u.scheme())&&u.username().is_empty()&&u.password().is_none()&&u.host_str()!=Some("appassets.androidplatform.net"));
                if !valid {self.reply(role,request,Err("Invalid website URL"),out);return Ok(());}
                let url=url.to_owned();let adopt=url==self.url;self.begin_website();self.source_exposed=adopt;if adopt{self.cancel_deadline();self.notify("source","context.retired",Value::Null,out);self.documents.remove("source");}
                out.push(json!({"type":"isolatedWebsite","sessionId":self.website_session,"generation":self.generation,"url":url,"adopt":adopt}));self.reply(role,request,Ok(json!({"sessionId":self.website_session})),out);
            },
            "webViews.close"=>{if let Some(session)=params["sessionId"].as_str() && self.website_session.as_deref()!=Some(session){self.reply(role,request,Err("Website session is no longer current"),out);return Ok(());}out.push(self.command("isolatedWebsiteClose"));self.reply(role,request,Ok(Value::Null),out);},
            "navigation.backHandler"=>{self.back_handler=params["enabled"]==true;self.reply(role,request,Ok(Value::Null),out);},
            "navigation.backResult"=>{if self.pending_back.is_some() && params["token"].as_u64()==self.pending_back{self.pending_back=None;if params["consumed"]!=true{self.back_default(out)?;}}self.reply(role,request,Ok(Value::Null),out);},
            "navigation.leaveGuard"=>{out.push(json!({"type":"isolatedLeaveGuard","generation":self.generation,"message":params["message"]}));self.reply(role,request,Ok(Value::Null),out);},
            "ui.modalState"=>{self.modal=params["open"]==true;out.push(json!({"type":"modalState","open":self.modal}));self.reply(role,request,Ok(Value::Null),out);},
            "storage.get"|"storage.list"|"storage.commit"=>{
                let package=self.package.as_ref().unwrap();
                let operation=serde_json::from_value::<StorageOperation>(json!({"method":method,"params":params})).map_err(|e|e.to_string())?;
                if !package.manifest.capabilities.iter().any(|c|c=="storage")||crate::storage::validate(&operation).is_err(){self.reply(role,request,Err("Invalid storage operation"),out);return Ok(());}
                out.push(json!({"type":"storageJob","job":StorageJob{generation:self.generation,document_id:DocumentId(doc.id),channel,request_id:request.into(),applet_id:package.manifest.id.clone(),data_schema_version:1,operation}}));
            },
            "services.request"=>{
                let package=self.package.as_ref().unwrap();let service=params["serviceId"].as_str().unwrap_or("");let path=params["path"].as_str().unwrap_or("");let verb=params["method"].as_str().unwrap_or("");
                if !package.manifest.services.iter().any(|s|s==service)||!package.manifest.capabilities.iter().any(|c|c=="services")||!path.starts_with('/')||path.starts_with("//")||path.len()>2048||path.contains(['\\','#','\r','\n'])||!["GET","POST","PUT","PATCH","DELETE"].contains(&verb)||(verb=="GET"&&!params["body"].is_null()){self.reply(role,request,Err("Invalid service request"),out);return Ok(());}
                out.push(json!({"type":"serviceRequest","job":ServiceJob{generation:self.generation,document_id:DocumentId(doc.id),channel,request_id:request.into(),applet_id:package.manifest.id.clone(),service_id:service.into(),path:path.into(),method:verb.into(),body:params.get("body").filter(|v|!v.is_null()).cloned()}}));
            },
            _=>self.reply(role,request,Err("Unsupported capability"),out),
        }
        Ok(())
    }
}
