package app.nirvana.genesis;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.*;
import android.widget.FrameLayout;
import androidx.webkit.*;
import java.util.*;
import org.json.*;

/** Executes API 3 host commands. Website documents never occupy the applet foreground. */
final class IsolatedBrowser {
    private final MainActivity activity;
    private final HostViews views;
    private final HostViews.Events events;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<String, Map<Long, JavaScriptReplyProxy>> channels = new HashMap<>();
    private long serial, generation, epoch, foregroundEpoch;
    private JSONObject pack, selection, sourceDefinition;
    private PackageAssets assets;
    private AppletPresentation presentation;
    private WebView foreground, source, external;
    private ScriptHandler sourceScript;
    private boolean website, adopted, destroyed, foregroundCommitted, foregroundReady, foregroundFailed, providerPrompt, providerSourceVisited;
    private String currentUrl = "", sourceId = "", leaveGuard;
    private View fullscreen;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private long providerEpoch;

    IsolatedBrowser(MainActivity activity, HostViews views, HostViews.Events events) {
        this.activity=activity; this.views=views; this.events=events;
    }
    String appletId() { return pack==null?"":pack.optJSONObject("manifest").optString("id"); }
    String leaveGuard() { return leaveGuard; }
    boolean isWebsite() { return website; }
    private JSONObject event(String type) throws JSONException { return HostViews.event(type).put("generation",generation); }
    private void emit(String type, String key, Object value) { try {events.send(event(type).put("epoch",epoch).put(key,value));}catch(JSONException e){views.error("Could not report website state");} }
    private void failure(String message) {
        foregroundFailed=true;
        if(presentation!=null) presentation.foregroundFailed();
        try {views.presentation(new JSONObject().put("state","failed").put("message",message).put("actions",new JSONArray()));}catch(JSONException ignored){}
    }
    @SuppressLint("SetJavaScriptEnabled")
    private WebView webView() { return webView(false); }
    @SuppressLint("SetJavaScriptEnabled")
    private WebView webView(boolean hiddenSource) {
        WebView view=hiddenSource?new AppletPresentation.SourceView(activity):new WebView(activity);
        view.getSettings().setJavaScriptEnabled(true); view.getSettings().setDomStorageEnabled(true);
        view.getSettings().setAllowFileAccess(false); view.getSettings().setAllowContentAccess(false);
        view.getSettings().setMediaPlaybackRequiresUserGesture(true); view.getSettings().setSupportMultipleWindows(true);
        view.setBackgroundColor(Color.WHITE);
        view.setLayerType(AppletRendering.layerType(activity,appletId(),false),null);
        CookieManager.getInstance().setAcceptCookie(true);
        view.setWebChromeClient(new WebChromeClient(){
            @Override public void onPermissionRequest(PermissionRequest request){request.deny();}
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params){
                if(!website || (v!=source && v!=external)){callback.onReceiveValue(null);return true;}
                long token=providerEpoch;activity.chooseFiles(params,callback,()->!destroyed&&website&&token==providerEpoch);return true;
            }
            @Override public void onShowCustomView(View v, CustomViewCallback callback){
                if(!website||fullscreen!=null){callback.onCustomViewHidden();return;}
                fullscreen=v;fullscreenCallback=callback;views.fullscreen(v);
            }
            @Override public void onHideCustomView(){exitFullscreen();}
            @Override public boolean onCreateWindow(WebView v, boolean dialog, boolean gesture, android.os.Message message){
                if(!website||!gesture)return false;
                WebView popup=webView();
                popup.setWebViewClient(new WebViewClient(){
                    private boolean routed;
                    private void route(String url){if(routed||!safeWebsite(url))return;routed=true;reader().loadUrl(url);popup.destroy();}
                    @Override public boolean shouldOverrideUrlLoading(WebView ignored,WebResourceRequest r){route(r.getUrl().toString());return true;}
                    @Override public void onPageStarted(WebView ignored,String url,android.graphics.Bitmap icon){route(url);}
                });
                ((WebView.WebViewTransport)message.obj).setWebView(popup);message.sendToTarget();return true;
            }
        });
        return view;
    }
    void create(JSONObject command) throws Exception {
        generation=command.getLong("generation");pack=command.getJSONObject("package");selection=command.getJSONObject("selection");
        if(!AppletPresentation.supported()||!WebViewFeature.isFeatureSupported(WebViewFeature.JS_INJECTION_IN_FRAME_AND_WORLD)
                ||!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))throw new IllegalStateException("Update the WebView provider to use isolated applets");
        JSONObject manifest=pack.getJSONObject("manifest");
        JSONObject foregroundDeclaration=manifest.optJSONObject("foreground");
        if(foregroundDeclaration==null)throw new IllegalStateException("Legacy applet needs migration before customization");
        String pageId=foregroundDeclaration.getString("pageId"),pageEntry=null;
        JSONArray pages=manifest.getJSONArray("pages"),mappings=new JSONArray();
        for(int i=0;i<pages.length();i++){
            JSONObject page=pages.getJSONObject(i);if(pageId.equals(page.getString("id")))pageEntry=page.getString("entry");
        }
        if(pageEntry==null)throw new IllegalStateException("Missing foreground entry");
        String html="pages/"+pageId+"/index.html",urlPath="/genesis/"+appletId()+"/"+pack.getString("revision")+"/"+pageId+"/index.html";
        JSONArray declared=pack.getJSONArray("assets");String hash=null;
        for(int i=0;i<declared.length();i++)if(html.equals(declared.getJSONObject(i).getString("path")))hash=declared.getJSONObject(i).getString("sha256");
        if(hash==null)throw new IllegalStateException("Missing foreground HTML");
        mappings.put(new JSONObject().put("urlPath",urlPath).put("assetPath","packages/"+appletId()+"/"+pack.getString("revision")+"/"+html).put("sha256",hash));
        JSONObject creation=new JSONObject(command.toString()).put("localAssets",mappings);
        assets=new PackageAssets(activity.packageStore,creation);views.configureShell(creation,assets);
        presentation=new AppletPresentation(activity);views.browserSlot.removeAllViews();views.browserSlot.addView(presentation,new FrameLayout.LayoutParams(-1,-1));
        foreground=webView();presentation.setForeground(foreground);foregroundEpoch=presentation.beginForegroundTransition();
        final String foregroundPath=urlPath;
        foreground.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){
                if("appassets.androidplatform.net".equals(r.getUrl().getHost()))return assets.loader.shouldInterceptRequest(r.getUrl());
                return null;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){
                String destination=r.getUrl().toString();
                if(foregroundPath.equals(r.getUrl().getPath())&&"https://appassets.androidplatform.net".equals(origin(destination)))return false;
                if(r.isForMainFrame()&&r.hasGesture()&&safeWebsite(destination))emit("isolatedLink","url",destination);
                return true;
            }
            @Override public void onPageCommitVisible(WebView v,String url){foregroundCommitted=true;reveal();}
            @Override public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError error){if(r.isForMainFrame())failure("The applet interface could not load");}
            @Override public boolean onRenderProcessGone(WebView v,RenderProcessGoneDetail detail){failure("The applet renderer stopped. Retry or return to Apps.");return true;}
        });
        inject(foreground,"foreground",Set.of("https://appassets.androidplatform.net"),pageEntry);
        views.pageStarting();foreground.loadUrl("https://appassets.androidplatform.net"+urlPath);
    }
    void createLegacy(JSONObject command) throws Exception {
        generation=command.getLong("generation");pack=command.getJSONObject("package");selection=command.getJSONObject("selection");currentUrl=command.getString("url");
        assets=new PackageAssets(activity.packageStore,new JSONObject(command.toString()).put("localAssets",new JSONArray()));
        views.configureShell(command,assets);presentation=new AppletPresentation(activity);views.browserSlot.removeAllViews();views.browserSlot.addView(presentation,new FrameLayout.LayoutParams(-1,-1));
        openWebsite(new JSONObject().put("url",currentUrl).put("adopt",false));
    }
    private void reveal(){if(foregroundReady&&foregroundCommitted&&!destroyed){presentation.revealForeground(foregroundEpoch);views.reveal();}}
    private ScriptHandler inject(WebView view,String role,Set<String> origins,String entry) throws Exception {
        JavaScriptExecutionWorld world=WebViewCompat.getExecutionWorld(view,"genesis.v3");
        Map<Long,JavaScriptReplyProxy> replies=new HashMap<>();channels.put(role,replies);
        IdentityHashMap<JavaScriptReplyProxy,Long> ids=new IdentityHashMap<>();
        WebViewCompat.addWebMessageListener(view,"genesisHost",origins,world,(v,message,origin,mainFrame,reply)->{
            if(destroyed||("source".equals(role)&&view!=source)||("foreground".equals(role)&&view!=foreground)||!mainFrame||message.getType()!=WebMessageCompat.TYPE_STRING||("source".equals(role)&&website))return;
            String raw=message.getData();if(raw==null||raw.length()>262144)return;
            Long channel=ids.get(reply);if(channel==null){channel=++serial;ids.put(reply,channel);replies.put(channel,reply);}
            if(replies.size()>32){Long oldest=Collections.min(replies.keySet());JavaScriptReplyProxy retired=replies.remove(oldest);ids.remove(retired);}
            try{events.send(event("isolatedMessage").put("epoch",epoch).put("role",role).put("channel",channel).put("origin",origin.toString()).put("message",raw));}catch(JSONException e){failure("Invalid applet message");}
        });
        JSONObject config=new JSONObject().put("revision",pack.getString("revision"));
        return WebViewCompat.addJavaScriptOnEvent(view,"const __GENESIS_BINDING__="+config+";\n"+assets.script(entry),WebViewCompat.INJECTION_EVENT_DOCUMENT_START,origins,world);
    }
    private Set<String> origins(JSONObject definition) throws Exception {
        JSONArray contracts=pack.getJSONObject("manifest").getJSONArray("routeContracts");
        for(int i=0;i<contracts.length();i++)if(contracts.getJSONObject(i).getString("id").equals(definition.getString("routeContractId"))){
            Set<String> result=new HashSet<>();JSONArray list=contracts.getJSONObject(i).getJSONArray("origins");for(int j=0;j<list.length();j++)result.add(list.getString(j));return result;
        }throw new IllegalStateException("Unknown source contract");
    }
    void navigate(JSONObject command) throws Exception {
        if(website)closeWebsite(false);
        epoch=command.getLong("epoch");selection=command.getJSONObject("selection");sourceDefinition=command.getJSONObject("source");currentUrl=command.getString("url");leaveGuard=null;
        views.modal(false);views.configureShell(new JSONObject().put("package",pack).put("selection",selection),assets);
        views.route(true,command.getBoolean("detail"));views.navigation(currentUrl,false,command.getBoolean("detail"),false);
        if(source!=null){if(sourceScript!=null)sourceScript.remove();presentation.removeSource(sourceId);source.destroy();source=null;channels.remove("source");}
        sourceId=sourceDefinition.getString("id");source=webView(true);final WebView current=source;final long navigation=epoch;
        source.setWebViewClient(new WebViewClient(){
            private String reported="";
            private void report(String url, boolean sameDocument){
                if(destroyed||source!=current||navigation!=epoch||website||url.equals(reported))return;
                reported=url;currentUrl=url;try{events.send(event("isolatedSourceNavigation").put("epoch",epoch).put("url",url).put("sameDocument",sameDocument));}catch(JSONException ignored){}
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){
                if(!r.isForMainFrame())return false;
                if(website)return !safeWebsite(r.getUrl().toString());
                if(!safeWebsite(r.getUrl().toString()))return true;
                return false;
            }
            @Override public void onPageStarted(WebView v,String url,android.graphics.Bitmap icon){report(url,false);if(website)providerStarting(url);}
            @Override public void doUpdateVisitedHistory(WebView v,String url,boolean reload){report(url,true);if(website)providerNavigation(url);}
            @Override public void onPageCommitVisible(WebView v,String url){report(url,false);if(website)providerRevealed(v,url);}
            @Override public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError e){if(!destroyed&&source==current&&navigation==epoch&&r.isForMainFrame()){if(website)views.websiteFailure("This website could not load");else emit("isolatedSourceError","message","Website unavailable");}}
            @Override public void onReceivedHttpError(WebView v,WebResourceRequest r,WebResourceResponse response){if(!destroyed&&source==current&&navigation==epoch&&r.isForMainFrame()&&response.getStatusCode()>=400){if(website)views.websiteFailure("Website returned HTTP "+response.getStatusCode());else emit("isolatedSourceError","message","Website unavailable");}}
            @Override public boolean onRenderProcessGone(WebView v,RenderProcessGoneDetail detail){if(!destroyed&&source==current&&navigation==epoch){if(website)closeWebsite(true);else emit("isolatedSourceError","message","Website renderer stopped");}return true;}
        });
        presentation.addSource(sourceId,source);
        sourceScript=inject(source,"source",origins(sourceDefinition),sourceDefinition.getString("entry"));
        source.loadUrl(currentUrl);
        main.postDelayed(()->{if(!destroyed&&source==current&&navigation==epoch&&!website)emit("isolatedSourceTimeout","url",currentUrl);},15000);
    }
    private boolean safeWebsite(String url){try{Uri u=Uri.parse(url);return ("https".equals(u.getScheme())||"http".equals(u.getScheme()))&&u.getHost()!=null&&u.getUserInfo()==null&&!"appassets.androidplatform.net".equals(u.getHost());}catch(Exception e){return false;}}
    private String origin(String url){Uri u=Uri.parse(url);return u.getScheme()+"://"+u.getAuthority();}
    private WebView reader(){return adopted?source:external;}
    private void providerNavigation(String url){if(sourceDefinition!=null&&origin(url).equals(origin(sourceDefinition.optString("startUrl"))))providerSourceVisited=true;WebView view=reader();if(view!=null)views.navigation(url,true,view.canGoBack(),view.canGoForward());}
    private void providerStarting(String url){providerEpoch++;activity.cancelInvalidFiles();views.pageStarting();providerNavigation(url);}
    private void providerRevealed(WebView view,String url){long token=providerEpoch;providerNavigation(url);view.postVisualStateCallback(token,new WebView.VisualStateCallback(){@Override public void onComplete(long id){if(!destroyed&&website&&reader()==view&&token==providerEpoch)views.reveal();}});}
    private void openWebsite(JSONObject command) throws Exception {
        if(website)closeWebsite(false);website=true;adopted=command.getBoolean("adopt");providerSourceVisited=adopted;providerEpoch++;
        if(adopted){if(sourceScript!=null){sourceScript.remove();sourceScript=null;}channels.remove("source");presentation.adoptSource(sourceId);providerNavigation(currentUrl);views.reveal();}
        else{
            external=webView();external.setLayerType(View.LAYER_TYPE_NONE,null);
            external.setWebViewClient(new WebViewClient(){
                @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return !safeWebsite(r.getUrl().toString());}
                @Override public void onPageStarted(WebView v,String url,android.graphics.Bitmap icon){providerStarting(url);}
                @Override public void onPageCommitVisible(WebView v,String url){providerRevealed(v,url);}
                @Override public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError error){if(!destroyed&&website&&reader()==v&&r.isForMainFrame()){views.reveal();views.websiteFailure("Website could not load");}}
                @Override public boolean onRenderProcessGone(WebView v,RenderProcessGoneDetail detail){if(!destroyed&&website&&reader()==v)closeWebsite(true);return true;}
            });presentation.openExternal(external);providerStarting(command.getString("url"));external.loadUrl(command.getString("url"));
        }
    }
    private void exitFullscreen(){if(fullscreen!=null){views.exitFullscreen(fullscreen);fullscreen=null;if(fullscreenCallback!=null)fullscreenCallback.onCustomViewHidden();fullscreenCallback=null;}}
    private void closeWebsite(boolean notify){
        if(!website)return;exitFullscreen();providerEpoch++;activity.cancelInvalidFiles();boolean wasAdopted=adopted;
        presentation.closeWebsite();if(external!=null){external.destroy();external=null;}
        website=false;adopted=false;views.route(true,false);views.navigation(currentUrl,false,true,false);views.reveal();
        if(notify)try{events.send(event("isolatedWebsiteClosed").put("epoch",epoch).put("adopted",wasAdopted).put("revalidate",providerSourceVisited));}catch(JSONException ignored){}
    }
    /** Only a boolean leaves the website. Form text, credentials and file paths stay in it. */
    private void requestWebsiteAction(Runnable action){
        if(!website){action.run();return;}
        if(providerPrompt)return;
        final WebView view=reader();final long token=providerEpoch;providerPrompt=true;
        view.evaluateJavascript("(()=>{try{return [...document.querySelectorAll('input,textarea,select,[contenteditable=true]')].some(e=>{if(!e.getClientRects().length||e.disabled)return false;if(e.isContentEditable)return !!e.textContent.trim();if(e.tagName==='SELECT')return [...e.options].some(o=>o.selected!==o.defaultSelected);if(e.type==='checkbox'||e.type==='radio')return e.checked!==e.defaultChecked;if(['hidden','submit','button','reset'].includes(e.type))return false;return e.value!==e.defaultValue;});}catch{return true;}})()",result->{
            if(destroyed||!website||reader()!=view||providerEpoch!=token){providerPrompt=false;return;}
            if("false".equals(result)){providerPrompt=false;action.run();return;}
            new android.app.AlertDialog.Builder(activity).setTitle("Leave this website?")
                .setMessage("Changes on this page may be lost.").setNegativeButton("Stay",null)
                .setPositiveButton("Leave",(dialog,which)->{if(!destroyed&&website&&reader()==view&&providerEpoch==token)action.run();})
                .setOnDismissListener(dialog->providerPrompt=false).show();
        });
    }
    boolean handleUserEvent(JSONObject event) throws Exception {
        String type=event.getString("type");
        if((activity.getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0){
            if("inspect".equals(type)){WebView.setWebContentsDebuggingEnabled(true);views.diagnostics("Local WebView inspection enabled for this applet visit.\n"+"Isolated applet: "+appletId()+"\nGeneration: "+generation+"; source epoch: "+epoch+"\nForeground ready: "+foregroundReady+"; website view: "+website+"\nSource hidden: "+(!website||!adopted)+"; source channel count: "+channels.getOrDefault("source",Collections.emptyMap()).size());return true;}
            if("debugFailure".equals(type)){failure("Simulated applet failure. Retry to recreate its interface.");return true;}
            if("debugTerminate".equals(type)){
                if(foreground!=null&&WebViewFeature.isFeatureSupported(WebViewFeature.GET_WEB_VIEW_RENDERER)){
                    androidx.webkit.WebViewRenderProcess renderer=WebViewCompat.getWebViewRenderProcess(foreground);if(renderer!=null)renderer.terminate();
                }else views.error("This WebView provider cannot terminate a renderer for diagnosis");return true;
            }
        }
        if("renderingSettings".equals(type)){
            new android.app.AlertDialog.Builder(activity).setTitle("Applet rendering").setSingleChoiceItems(AppletRendering.LABELS,AppletRendering.selection(activity,appletId()),(d,which)->{AppletRendering.save(activity,appletId(),which);if(source!=null)source.setLayerType(AppletRendering.layerType(activity,appletId(),false),null);if(foreground!=null)foreground.setLayerType(AppletRendering.layerType(activity,appletId(),false),null);d.dismiss();}).show();return true;
        }
        if(foregroundFailed&&Arrays.asList("retry","reload").contains(type)){emit("isolatedForegroundRetry","retry",true);return true;}
        if(website && ("readerClose".equals(type)||"back".equals(type))){if(fullscreen!=null){exitFullscreen();return true;}requestWebsiteAction(()->{if("back".equals(type)&&reader().canGoBack())reader().goBack();else closeWebsite(true);});return true;}
        if(website&&"forward".equals(type)){requestWebsiteAction(()->reader().goForward());return true;}
        if(website&&Arrays.asList("reload","retry").contains(type)){requestWebsiteAction(()->reader().reload());return true;}
        if(website&&Arrays.asList("open","openPage","home","activateDestination").contains(type)){requestWebsiteAction(()->{closeWebsite(false);events.send(event);});return true;}
        if(website&&Arrays.asList("copyLink","shareLink","openBrowser").contains(type)){
            String url=reader().getUrl();if(!safeWebsite(url))return true;
            if("copyLink".equals(type))((android.content.ClipboardManager)activity.getSystemService(android.content.Context.CLIPBOARD_SERVICE)).setPrimaryClip(android.content.ClipData.newPlainText("Link",url));
            else if("openBrowser".equals(type))activity.startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW,Uri.parse(url)));
            else activity.startActivity(android.content.Intent.createChooser(new android.content.Intent(android.content.Intent.ACTION_SEND).setType("text/plain").putExtra(android.content.Intent.EXTRA_TEXT,url),"Share link"));return true;
        }
        if(leaveGuard!=null&&Arrays.asList("open","openPage","home","back","retry","reload","ordinary","activateDestination").contains(type)){
            String message=leaveGuard;new android.app.AlertDialog.Builder(activity).setTitle("Leave this page?").setMessage(message).setNegativeButton("Stay",null).setPositiveButton("Leave",(d,w)->{leaveGuard=null;events.send(event);}).show();return true;
        }
        return false;
    }
    void execute(JSONObject command) throws Exception {
        if(command.getLong("generation")!=generation||destroyed)return;
        switch(command.getString("type")){
            case "isolatedNavigate":navigate(command);break;
            case "isolatedChallenge":{
                String role=command.getString("role");JavaScriptReplyProxy reply=channels.getOrDefault(role,Collections.emptyMap()).get(command.getLong("channel"));
                if(reply!=null)reply.executeJavaScript("globalThis.__genesisChallenge?.("+JSONObject.quote(command.getString("nonce"))+","+JSONObject.quote(command.getString("challenge"))+")",r->{});break;
            }
            case "isolatedReply":{JavaScriptReplyProxy reply=channels.getOrDefault(command.getString("role"),Collections.emptyMap()).get(command.getLong("channel"));if(reply!=null)reply.postMessage(command.getJSONObject("message").toString());break;}
            case "isolatedForegroundReady":foregroundReady=true;reveal();break;
            case "isolatedWebsite":openWebsite(command);break;
            case "isolatedWebsiteClose":requestWebsiteAction(()->closeWebsite(true));break;
            case "isolatedWebsiteBack":if(website)requestWebsiteAction(()->{if(reader().canGoBack())reader().goBack();else closeWebsite(true);});break;
            case "isolatedWebsiteForward":if(website)reader().goForward();break;
            case "isolatedWebsiteReload":if(website)reader().reload();break;
            case "isolatedFailure":failure(command.getString("message"));break;
            case "isolatedLeaveGuard":leaveGuard=command.isNull("message")?null:command.getString("message");break;
            case "isolatedBackDeadline":{long token=command.getLong("token");main.postDelayed(()->emit("isolatedBackDeadline","token",token),300);break;}
            case "isolatedPause":if(source!=null)source.onPause();if(foreground!=null)foreground.onPause();if(external!=null)external.onPause();break;
            case "isolatedResume":if(source!=null)source.onResume();if(foreground!=null)foreground.onResume();if(external!=null)external.onResume();break;
            case "isolatedDestroy":destroy();break;
            default:throw new IllegalArgumentException("Unknown isolated host command");
        }
    }
    void destroy(){if(destroyed)return;destroyed=true;WebView.setWebContentsDebuggingEnabled(false);main.removeCallbacksAndMessages(null);exitFullscreen();if(sourceScript!=null)sourceScript.remove();if(presentation!=null){presentation.dispose();views.browserSlot.removeView(presentation);}if(source!=null)source.destroy();if(foreground!=null)foreground.destroy();if(external!=null)external.destroy();channels.clear();}
}
