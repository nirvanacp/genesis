import type {ReactNode} from 'react';
import type {AppletContext} from '@genesis/sdk';
import {HnLink} from './navigation-link';

/** Shared story identity and typography for feeds, discussions and Saved. */
export function StoryHeading({context,title,url,articleUrl,rank,children}:{context:AppletContext;title:string;url:string;articleUrl:string|null;rank?:string;children?:ReactNode}){
  const domain=articleUrl?new URL(articleUrl).hostname.replace(/^www\./,''):null;
  return <div className="story-heading">
    {rank&&<span className="story-rank" aria-label={'Rank '+rank.replace('.','')}>{rank}</span>}
    <div className="story-copy"><h2><HnLink context={context} className="story-title-link" url={articleUrl??url}>{title}</HnLink>{' '}{domain&&<HnLink context={context} className="story-domain" url={`https://news.ycombinator.com/from?site=${encodeURIComponent(new URL(articleUrl!).hostname)}`} label={'More from '+domain}>({domain})</HnLink>}</h2>
      {children}
    </div>
  </div>;
}
