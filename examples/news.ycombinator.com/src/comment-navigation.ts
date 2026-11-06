/** Reveal a linked comment before scrolling, including any collapsed reply branch. */
export function revealComment(target:Element):void {
  for(let element:Element|null=target;element;element=element.parentElement){
    if(element instanceof HTMLDetailsElement)element.open=true;
  }
  target.scrollIntoView();
}
