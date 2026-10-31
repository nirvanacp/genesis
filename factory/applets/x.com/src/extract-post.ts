import {postUrl,safeLink,type Post} from "./domain";
const own=(element:Element,article:Element)=>element.closest('article[data-testid="tweet"]')===article&&!element.parentElement?.closest('[role="link"]');
export function extractPost(article:Element):Post|null{
  const links=[...article.querySelectorAll<HTMLAnchorElement>('a[href]')].filter(a=>a.querySelector("time")&&own(a,article));
  const identities=links.map(a=>postUrl(a.href)).filter(v=>v!==null);
  const identity=identities[0];if(!identity||identities.some(v=>v.postId!==identity.postId))return null;
  const textNode=[...article.querySelectorAll('[data-testid="tweetText"]')].find(e=>own(e,article));
  const full=textNode?.textContent??"";let text=[...full].slice(0,7000).join("");
  while(new TextEncoder().encode(text).length>24000)text=text.slice(0,-100);
  const nameNode=[...article.querySelectorAll('[data-testid="User-Name"]')].find(e=>own(e,article));
  const nameLink=nameNode?.querySelector('a');const authorName=[...(nameLink?.textContent?.trim()||identity.handle)].slice(0,200).join("");
  const photos=[...article.querySelectorAll('[data-testid="tweetPhoto"]')].filter(e=>own(e,article)).length;
  const videos=[...article.querySelectorAll('[data-testid="videoPlayer"]')].filter(e=>own(e,article)).length;
  const sourceLinks=[...textNode?.querySelectorAll<HTMLAnchorElement>('a[href]')??[]].map(a=>({text:[...(a.textContent??"")].slice(0,300).join(""),href:safeLink(a.href)})).filter((v):v is {text:string;href:string}=>!!v.href&&!!v.text).slice(0,8);
  const post:Post={postId:identity.postId,url:identity.url,snapshot:{authorHandle:identity.handle.toLowerCase(),authorName,text,textState:!text?"unavailable":text.length<full.length||!!article.querySelector('[data-testid="tweet-text-show-more-link"]')?"excerpt":"complete",capturedAtMs:Date.now(),media:{kind:photos&&videos?"mixed":videos?"video":photos?"photo":"none",count:Math.min(16,photos+videos)},links:sourceLinks}};
  while(new TextEncoder().encode(JSON.stringify(post.snapshot)).length>32768&&post.snapshot.links.length)post.snapshot.links.pop();
  return post;
}
