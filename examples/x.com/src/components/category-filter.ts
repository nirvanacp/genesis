import type {AppletContext} from "@genesis/sdk";
import type {Category} from "../domain";
import theme from "../theme.css";
export function openCategoryFilter(context:AppletContext,categories:Category[],selected:string|null,choose:(id:string|null)=>void):void{
  let close=()=>{};
  close=context.ui.openModal("Choose category",container=>{
    const style=document.createElement("style");style.textContent=theme+'section[role=dialog]{background:var(--paper)!important;color:var(--ink)!important}.filter-header{display:flex;align-items:center;gap:8px;margin-bottom:16px}.filter-options{display:grid;max-height:50dvh;overflow:auto;margin-top:12px}.filter-options button{text-align:start;display:flex;justify-content:space-between;border-radius:10px}.filter-options button[aria-pressed=true]{background:var(--accent-wash);color:var(--link)}';container.append(style);
    const header=document.createElement("div");header.className="filter-header";const title=document.createElement("h2");title.textContent="Choose category";const exit=document.createElement("button");exit.textContent="✕";exit.setAttribute("aria-label","Close category filter");exit.onclick=()=>close();header.append(exit,title);
    const search=document.createElement("input");search.type="search";search.placeholder="Find a category";search.setAttribute("aria-label","Find a category");search.style.width="100%";
    const list=document.createElement("div");list.className="filter-options";
    const render=()=>{
      list.replaceChildren();
      for(const category of [{id:null,name:"All saved",count:categories.reduce((sum,c)=>sum+c.count,0)},...categories].filter(c=>c.name.toLowerCase().includes(search.value.toLowerCase()))){
        const button=document.createElement("button");button.textContent=category.name;button.setAttribute("aria-pressed",String(selected===category.id));button.onclick=()=>{choose(category.id);close();};if(selected===category.id){const check=document.createElement("span");check.textContent="✓";button.append(check);}list.append(button);
      }
      if(!list.children.length){const empty=document.createElement("p");empty.className="muted";empty.textContent="No matching categories.";list.append(empty);}
    };
    search.oninput=render;render();container.append(header,search,list);queueMicrotask(()=>search.focus());
  });
}
