import {useState} from "react";
import type {Category,Library} from "../domain";
import type {Repository} from "../repository";
import {errorMessage} from "../backend";
import {validateName} from "../categories";
export function CategoryManager({categories,library,repo,refresh,openCategory}:{categories:Category[];library:Library;repo:Repository;refresh:()=>Promise<void>;openCategory:(id:string)=>void}){
  const[name,setName]=useState(""),[editing,setEditing]=useState<string|null>(null),[editName,setEditName]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[deleting,setDeleting]=useState<string|null>(null);
  const change=async(kind:string,payload:Record<string,unknown>)=>{
    if(kind!=="category.delete"){const invalid=validateName(String(payload.name));if(invalid){setError(invalid);return;}}
    setBusy(true);setError("");try{await repo.submit(library,kind,payload);setName("");setEditing(null);setDeleting(null);await refresh();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  };
  return <div className="manager enter"><h2>Your categories</h2><p className="muted">{categories.length} of 50 categories. Move or remove saved posts before deleting a category.</p>
    <form className="field" onSubmit={e=>{e.preventDefault();void change("category.create",{id:crypto.randomUUID(),name});}}><label htmlFor="category-name">New category</label><input id="category-name" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Development" maxLength={160}/><button className="primary" disabled={busy||!name.trim()||categories.length>=50}>Create category</button></form>
    {error&&<p className="error" role="alert">{error}</p>}
    {categories.map(category=><section key={category.id} className="category-entry"><div className="row"><strong>{category.name}</strong><span className="muted">{category.count} saved</span></div>
      {editing===category.id?<form onSubmit={e=>{e.preventDefault();void change("category.rename",{id:category.id,name:editName,expectedRevision:category.revision});}}><input aria-label={`New name for ${category.name}`} value={editName} onChange={e=>setEditName(e.target.value)} maxLength={160}/><div className="row"><button className="secondary" disabled={busy}>Save name</button><button type="button" onClick={()=>setEditing(null)}>Cancel</button></div></form>:<div className="row"><button onClick={()=>openCategory(category.id)}>Open category</button><button onClick={()=>{setEditing(category.id);setEditName(category.name);}}>Rename</button>{category.count===0&&<button className="danger" onClick={()=>setDeleting(category.id)} disabled={busy}>Delete</button>}</div>}
      {deleting===category.id&&<div><p>Delete the empty category “{category.name}”?</p><div className="row"><button className="danger" disabled={busy} onClick={()=>void change("category.delete",{id:category.id,expectedRevision:category.revision})}>Delete category</button><button onClick={()=>setDeleting(null)}>Cancel</button></div></div>}
    </section>)}
  </div>;
}
