import type {Interactions} from '../use-interactions';
import type {ActionName} from '../interactions';
import {Icon} from './icon';
import {XLink,type OpenX} from './post';
export function MutationButton({entity,name,actions,count=''}:{entity:string;name:ActionName;actions:Interactions;count?:string}){
  const ref=actions.find(entity,name),label=name==='like'?(ref?.state?'Unlike':'Like'):name==='bookmark'?(ref?.state?'Remove bookmark':'Bookmark'):name==='follow'?(ref?.state?'Unfollow':'Follow'):(ref?.state?'Undo repost':'Repost');
  return <button type="button" className={`post-action action-${name}${ref?.state?' active':''}`} aria-label={label} aria-pressed={ref?.state} title={!ref?.available?'Open the live post to check action availability':label} disabled={!ref?.available||actions.busy} onClick={()=>{if(ref)actions.perform(ref);}}><Icon name={name==='follow'?'more':name}/>{count&&<span>{count}</span>}</button>;
}
export function PostActions({url,id,open,actions,share,count=()=>''}:{url:string;id:string;open:OpenX;actions:Interactions;share:()=>void;count?:(name:string)=>string}){
  return <div className="post-actions" aria-label="Post actions">
    <XLink className="post-action" url={`https://x.com/compose/post?in_reply_to=${id}`} open={open} label="Reply on X website"><Icon name="reply"/>{count('reply')}</XLink>
    <details className="post-menu"><summary className="post-action" aria-label="Repost options"><Icon name="repost"/>{count('retweet')}</summary><div className="post-menu-items"><MutationButton entity={'post:'+id} name="repost" actions={actions}/><XLink url={`https://x.com/compose/post?attachment_url=${encodeURIComponent(url)}`} open={open}>Quote on X website</XLink></div></details>
    <MutationButton entity={'post:'+id} name="like" actions={actions} count={count('like')}/>
    <XLink className="post-action" url={url+'/analytics'} open={open} label="View post activity"><Icon name="views"/>{count('views')}</XLink>
    <button type="button" className="post-action" aria-label="Share post" onClick={share}><Icon name="share"/></button>
    {!actions.find('post:'+id,'like')&&<XLink className="read-more" url={url} open={open}>Open live post to interact</XLink>}
  </div>;
}
