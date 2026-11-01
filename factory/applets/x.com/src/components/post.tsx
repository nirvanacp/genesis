import {PostActions,MutationButton} from './post-actions';
import type {Interactions} from '../use-interactions';
import {openShareSheet} from './share-sheet';
import {useEffect,useRef,useState,type MouseEvent,type ReactNode} from 'react';
import type {AppletContext,NavigationDecision} from '@genesis/sdk';
import {websiteDestination} from '@genesis/sdk';
import type {XPost} from '../view-model';
import {Icon, type IconName} from './icon';

export type OpenX = ((url: string, website?: boolean) => void)&{context:AppletContext};

export function XLink({url,open,website=false,className='',label,children,tab=false,selected=false}:{url:string;open:OpenX;website?:boolean;className?:string;label?:string;children:ReactNode;tab?:boolean;selected?:boolean}){
  const [decision,setDecision]=useState<NavigationDecision|null>(null),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true,serial=0;const resolve=()=>{const current=++serial;setDecision(null);void(async()=>{
    let [value]=await open.context.navigation.resolve([{kind:'url',url}]);
    if(website&&value.kind==='custom')[value]=await open.context.navigation.resolve([{kind:'url',url,websiteActionId:'original-x'}]);
    if(active&&current===serial)setDecision(value);
  })().catch(()=>{});};const dispose=open.context.navigation.subscribe(resolve);resolve();return()=>{active=false;dispose();};},[url,website,open.context,attempt]);
  const opensWebsite=!!decision&&websiteDestination(decision);
  return <a href={url} className={className} role={tab?'tab':undefined} aria-selected={tab?selected:undefined} aria-label={label?label+(opensWebsite?', opens website':''):undefined} aria-busy={!decision} onClick={event=>{
    event.preventDefault();if(!decision)return;void open.context.navigation.activate({decision,intent:decision.kind==='website'||decision.kind==='external'?'open-website':'navigate'}).catch(()=>{setDecision(null);setAttempt(value=>value+1);});
  }}>{children}{opensWebsite&&<><span className="website-cue" aria-hidden="true">↗</span>{!label&&<span className="visually-hidden"> opens website</span>}</>}</a>;
}

function PostText({post, open}: {post: XPost; open: OpenX}) {
  const text = post.snapshot.text;
  if (!text) return null;
  // Rebuild only known links as text and anchors. Never copy source HTML.
  const links = post.snapshot.links.filter(link => link.text && text.includes(link.text));
  const content: ReactNode[] = [];
  let offset = 0;
  while (offset < text.length) {
    const match = links.map(link => ({link, index: text.indexOf(link.text, offset)}))
      .filter(item => item.index >= offset).sort((a, b) => a.index - b.index || b.link.text.length - a.link.text.length)[0];
    if (!match) { content.push(text.slice(offset)); break; }
    content.push(text.slice(offset, match.index));
    content.push(<XLink key={match.index} url={match.link.href} open={open}>{match.link.text}</XLink>);
    offset = match.index + match.link.text.length;
  }
  return <p className="post-text">{content}</p>;
}

export function Post({item, expanded, open, save, openQuote, actions}: {
  actions:Interactions; item: XPost; expanded: boolean; open: OpenX; save: () => void; openQuote: (key:string) => void;
}) {
  const menu=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    const dismiss=(event:PointerEvent)=>{
      if(menu.current?.open&&!event.composedPath().includes(menu.current))menu.current.open=false;
    };
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&menu.current?.open){menu.current.open=false;menu.current.querySelector('summary')?.focus();}
    };
    document.addEventListener('pointerdown',dismiss);
    document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);};
  },[]);
  const metric = (name: string) => item.metrics.find(m => m.label.toLowerCase() === name);
  const count = (name: string) => {
    const value = metric(name)?.value ?? '';
    // Older accepted models contain complete ARIA sentences, newer ones contain visible counts.
    const number=value.match(/[\d][\d,.]*(?:\s?[KMB])?/i)?.[0] ?? '';
    return number==='0'?'':number;
  };
  const quotedContent=item.quote&&<>{item.quote.authorName?<span className="quote-heading">{item.quote.avatar&&<img src={item.quote.avatar} alt=""/>}<strong>{item.quote.authorName}</strong>{item.quote.verified&&<Icon name="verified"/>}<span>{item.quote.authorHandle&&'@'+item.quote.authorHandle}{item.quote.time&&' · '+item.quote.time}</span></span>:<span className="quoted-label">Quoted post</span>}<p>{item.quote.text}</p></>;
  const profile = `https://x.com/${item.snapshot.authorHandle}`;
  return <article className={`post${expanded ? ' expanded' : ''}`} id={`post-${item.postId}`}>
    {item.context && <div className="post-context"><Icon name="repost"/><XLink url={item.context.url} open={open}>{item.context.text}</XLink></div>}
    <XLink className="post-avatar" url={profile} open={open} label={`View @${item.snapshot.authorHandle}`}>
      {item.avatar ? <img className="avatar" src={item.avatar} alt="" loading="lazy"/> : <span className="avatar fallback">{item.snapshot.authorName.slice(0, 1)}</span>}
    </XLink>
    <header className="post-heading">
      <div className="author"><XLink url={profile} open={open} className="author-name">{item.snapshot.authorName}</XLink>{item.verified && <Icon name="verified"/>}<span className="author-handle">@{item.snapshot.authorHandle}</span>{!expanded&&<XLink className="post-time" url={item.url} open={open} label={`Open post and discussion, ${item.time}`}>· {item.time}</XLink>}</div>
      <details className="post-menu" ref={menu}><summary role="button" aria-label={`More options for post by @${item.snapshot.authorHandle}`}><Icon name="more"/></summary><div className="post-menu-items">
        <button onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); save(); }}><Icon name="folder"/>Save to category</button>
        <MutationButton entity={'post:'+item.postId} name="bookmark" actions={actions}/>
        <XLink url={item.url} open={open} website><Icon name="more"/>More on X</XLink>
      </div></details>
    </header>
    <div className="post-body" onClick={event => {
      if (expanded || event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.nativeEvent.composedPath().some(node=>node instanceof Element&&node.matches('a,button,input,summary,[role=button]')) || window.getSelection()?.toString()) return;
      open(item.url);
    }}>
      <PostText post={item} open={open}/>
      {expanded&&item.snapshot.textState==='excerpt'&&<XLink url={item.url} open={open} website className="read-more">Read full post on X website</XLink>}
      {item.snapshot.textState === 'excerpt' && !expanded && <XLink url={item.url} open={open} className="read-more">Show more</XLink>}
      {item.photos.length > 0 && <div className={`photos count-${item.photos.length}`}>{item.photos.map((url, index) => <XLink key={url} url={`${item.url}/photo/${index + 1}`} open={open}><img src={url} alt={`Photo ${index + 1} in post by @${item.snapshot.authorHandle}`} loading="lazy"/></XLink>)}</div>}
      {['video', 'mixed'].includes(item.snapshot.media.kind) && <XLink url={`${item.url}/video/1`} open={open} website className="media-action"><Icon name="play"/>Play video on X</XLink>}
      {item.quote && (item.quote.key?<button className="quoted-post" onClick={()=>openQuote(item.quote!.key!)}>{quotedContent}</button>:<XLink url={item.quote.url ?? item.url} open={open} className="quoted-post">{quotedContent}</XLink>)}
      {item.snapshot.links.filter(link => !item.snapshot.text.includes(link.text)).map((link, index) => <XLink key={index} url={link.href} open={open} className="post-link"><Icon name="link"/>{link.text}</XLink>)}
      {!item.snapshot.text && !item.photos.length && item.snapshot.media.kind === 'none' && <XLink url={item.url} open={open} website>View post on X</XLink>}
      {expanded && item.dateTime && <p className="post-date">{new Date(item.dateTime).toLocaleString(undefined, {hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric', year: 'numeric'})}</p>}
    </div>
    <PostActions url={item.url} id={item.postId} open={open} actions={actions} count={count} share={()=>openShareSheet(open.context,item.url)}/>
  </article>;
}
