import {defineSourceAdapter,type AppletContext} from '@genesis/sdk';
import {extractItem,type StorySnapshot} from './extract-item';
import {richText,safeUrl,type HnModel,type Story} from './view-model';
const feeds=['/','/news','/newest','/front','/newcomments','/ask','/show','/shownew','/asknew','/jobs','/best','/active','/leaders','/from','/submitted','/threads','/favorites','/hidden','/upvoted'];
export default defineSourceAdapter({adapters:['feed','discussion','profile','information'],activate(context){
  const publish=()=>{
    const url=new URL(location.href),path=url.pathname;
    if(document.querySelector('input[type="password"]')||/please log in|you have to be logged in/i.test(document.body.textContent?.trim().slice(0,300)??'')){void context.source.publish({state:'auth-required'});return;}
    if(!document.querySelector('#hnmain')&&!['/formatdoc','/newsfaq.html','/newsguidelines.html'].includes(path)){void context.source.publish({state:'unsupported'});return;}
    const account=document.querySelector('.pagetop a[href^="user?id="]')?.textContent?.trim()??null;
    const model:HnModel={kind:'feed',title:'Hacker News',account,logoutUrl:null,stories:[],comments:[],parts:[],nextUrl:null,partial:false};
    if(context.sourceId==='me'&&['/','/news'].includes(path)){model.kind='account';model.title='Me';}
    else if(path==='/item'){
      if(!/^\d{1,20}$/.test(url.searchParams.get('id')??'')){void context.source.publish({state:'unsupported'});return;}
      model.kind='discussion';model.title='Discussion';model.parts=richText(document.querySelector('.toptext'),location.href);
    }else if(path==='/user'){
      const name=url.searchParams.get('id');if(!name||!/^[A-Za-z0-9_-]{1,64}$/.test(name)){void context.source.publish({state:'unsupported'});return;}
      model.kind='profile';model.title=name;
      const fields=[...document.querySelectorAll('#bigbox table tr')].flatMap(row=>{
        const cells=row.children;if(cells.length!==2)return[];const label=cells[0].textContent?.trim().replace(/:$/,'');
        return label&&['user','created','karma','about'].includes(label)?[{label,parts:richText(cells[1],location.href)}]:[];
      });
      if(!fields.length){void context.source.publish({state:'unsupported'});return;}
      model.profile={name,fields,links:['submitted','threads','favorites'].map(route=>({label:route==='submitted'?'Submissions':route==='threads'?'Comments':'HN favorites',url:`https://news.ycombinator.com/${route}?id=${encodeURIComponent(name)}`}))};
    }else if(['/lists','/leaders','/formatdoc','/newsfaq.html','/newsguidelines.html'].includes(path)){
      model.kind='information';model.title=path==='/lists'?'Lists':document.title||'Hacker News';model.parts=richText(document.querySelector('#bigbox')??document.querySelector('body center table')??document.body,location.href,16000);
    }else if(!feeds.includes(path)){void context.source.publish({state:'unsupported'});return;}
    if(model.kind==='feed'||model.kind==='discussion'){
      for(const row of document.querySelectorAll('tr.athing.submission[id]')){
        let snapshot=extractItem(row);
        const title=row.querySelector<HTMLAnchorElement>('.titleline>a:first-child');
        if(!snapshot&&path==='/jobs'&&/^\d+$/.test(row.id)&&title){snapshot={itemId:row.id,title:(title.textContent??'').slice(0,2048),discussionUrl:`https://news.ycombinator.com/item?id=${row.id}`,articleUrl:safeUrl(title.href,location.href),submitter:null,truncated:false,capturedAtMs:Date.now()} satisfies StorySnapshot;}
        if(!snapshot)continue;
        const meta=row.nextElementSibling;
        const story:Story={snapshot,score:meta?.querySelector('.score')?.textContent??'',age:meta?.querySelector('.age')?.textContent??'',comments:[...meta?.querySelectorAll('a')??[]].find(a=>/comment|discuss/.test(a.textContent??''))?.textContent??'Discussion',rank:row.querySelector('.rank')?.textContent??''};
        model.stories.push(story);
      }
      for(const row of document.querySelectorAll('tr.comtr[id],tr.athing[id]')){
        if(!/^\d+$/.test(row.id))continue;
        const reply=row.querySelector<HTMLAnchorElement>('.reply a[href]');
        const text=row.querySelector('.commtext');if(!text)continue;
        model.comments.push({id:row.id,author:row.querySelector('.hnuser')?.textContent??'Unknown',age:row.querySelector('.age')?.textContent??'',depth:Math.min(12,Number(row.querySelector('.ind')?.getAttribute('indent')??0)),parts:richText(text,location.href,6000),replyUrl:reply?`https://news.ycombinator.com/reply?id=${row.id}`:null,contextUrl:`https://news.ycombinator.com/item?id=${row.id}`,links:[...row.querySelectorAll<HTMLAnchorElement>('.navs a[href]')].flatMap(a=>{const safe=safeUrl(a.href,location.href);if(!safe)return[];const url=new URL(safe);return url.origin==='https://news.ycombinator.com'&&url.pathname==='/item'&&/^\d+$/.test(url.searchParams.get('id')??'')?[{label:(a.textContent??'').trim().slice(0,160),url:`${url.origin}/item?id=${url.searchParams.get('id')}${url.hash}`}]:[];}).slice(0,4)});
        if(model.comments.length>=100||new TextEncoder().encode(JSON.stringify(model)).length>145000){model.partial=true;break;}
      }
      if(model.kind==='discussion'&&!model.stories.length&&!model.parts.length&&!model.comments.length){
        model.parts=richText(document.querySelector('table.fatitem .commtext'),location.href);
        const author=document.querySelector('table.fatitem .hnuser')?.textContent?.trim();
        if(author)model.title=`Comment by ${author}`;
      }
      model.nextUrl=safeUrl(document.querySelector<HTMLAnchorElement>('a.morelink')?.getAttribute('href')??'',location.href);
      if(!document.querySelector('a.morelink'))model.nextUrl=null;
      if(!model.stories.length&&!model.comments.length&&model.kind==='discussion'&&!model.parts.length){
        const top=document.querySelector('tr.athing[id]');if(!top){void context.source.publish({state:'unsupported'});return;}
      }
    }
    if(model.kind==='feed'&&!model.stories.length&&!model.comments.length&&!document.querySelector('table.itemlist')){void context.source.publish({state:'unsupported'});return;}
    if(model.kind==='feed')model.title=document.title.replace(/\s*\|\s*Hacker News$/,'')||'Hacker News';
    void context.source.publish({state:model.stories.length||model.comments.length||!['feed','discussion'].includes(model.kind)?'ready':'empty',data:model});
  };
  publish();
  context.watchElements('hn-content',{selector:'#hnmain,.comment-tree,.toptext',attributes:['id'],text:true,limit:3,contentKey:()=>location.href},{enter:publish,update:publish});
  context.navigation.onChange(publish);
}});
