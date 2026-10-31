import type {AppletContext} from "@genesis/sdk";
import {isObject,validLibrary,validCategory,validMembership,validBookmark,validReceipt,isNumber,validId,type Library,type Category,type Membership,type BookmarkPage,type Receipt} from "./domain";
export class LibraryError extends Error {
  constructor(readonly code:string,message:string,readonly uncertain=false){super(message);}
}
export function errorMessage(error:unknown):string{
  if(error instanceof LibraryError)return error.message;
  return "Your Categories library is temporarily unavailable. X bookmarks still work.";
}
export class Backend {
  constructor(readonly context:AppletContext){}
  private async call(path:string,method:"GET"|"POST"="GET",body?:unknown):Promise<unknown>{
    let response:{status:number;body:unknown};
    try{response=await this.context.services.request("bookmarks",{path,method,...(body===undefined?{}:{body})});}
    catch{throw new LibraryError("UNAVAILABLE","Your Categories library is temporarily unavailable. Check the saved state before retrying.",true);}
    if(!isObject(response)||!isNumber(response.status)||!isObject(response.body))throw new LibraryError("INVALID_RESPONSE","The library returned an unreadable response. Refresh to check the saved state.",true);
    if(response.status<200||response.status>=300){
      const e=isObject(response.body.error)?response.body.error:{};
      const code=typeof e.code==="string"?e.code:"UNAVAILABLE";
      const messages:Record<string,string>={CONFLICT:"This item changed. Refresh before saving again.",CATEGORY_NAME_EXISTS:"A category with this name already exists.",CATEGORY_NOT_EMPTY:"Move or remove its saved posts before deleting this category.",CATEGORY_MISSING:"A selected category no longer exists. Refresh the list.",CURSOR_STALE:"Saved posts changed. Refresh the list.",LIMIT_REACHED:"The library limit has been reached.",INVALID_ARGUMENT:"Check the selected categories and try again.",OPERATION_REUSED:"This change no longer matches its original request. Refresh to check its saved state.",OPERATION_NOT_FOUND:"This change has not been confirmed yet."};
      throw new LibraryError(code,messages[code]??"The library could not complete this request.",response.status>=500);
    }
    return response.body.result;
  }
  async library():Promise<Library>{const v=await this.call("/v1/library");if(!validLibrary(v))throw new LibraryError("INVALID_RESPONSE","Library account could not be verified.");return v;}
  async categories():Promise<Category[]>{const v=await this.call("/v1/categories");if(!isObject(v)||!isNumber(v.libraryRevision)||!Array.isArray(v.categories)||v.categories.length>50||!v.categories.every(validCategory))throw new LibraryError("INVALID_RESPONSE","Categories could not be read.");return v.categories;}
  async lookup(postIds:string[]):Promise<{records:Membership[];missingIds:string[]}>{
    const v=await this.call("/v1/bookmarks/lookup","POST",{postIds});
    if(!isObject(v)||!Array.isArray(v.records)||!v.records.every(validMembership)||!Array.isArray(v.missingIds)||!v.missingIds.every(validId))throw new LibraryError("INVALID_RESPONSE","Saved state could not be read.");
    const seen=[...v.records.map(r=>r.postId),...v.missingIds];if(seen.length!==postIds.length||new Set(seen).size!==seen.length||seen.some(id=>!postIds.includes(id)))throw new LibraryError("INVALID_RESPONSE","Saved state does not match these posts.");
    return {records:v.records,missingIds:v.missingIds};
  }
  async query(categoryId:string|null,query:string,cursor:string|null):Promise<BookmarkPage>{
    const v=await this.call("/v1/bookmarks/query","POST",{categoryId,query,cursor,limit:20});
    if(!isObject(v)||!Array.isArray(v.entries)||v.entries.length>20||!v.entries.every(validBookmark)||!isNumber(v.libraryRevision)||!(v.nextCursor===null||typeof v.nextCursor==="string"&&v.nextCursor.length<=2048)||!isObject(v.filter)||v.filter.categoryId!==categoryId||typeof v.filter.query!=="string")throw new LibraryError("INVALID_RESPONSE","Saved posts could not be read.");
    return v as unknown as BookmarkPage;
  }
  async operation(operationId:string):Promise<Receipt>{const v=await this.call(`/v1/operations/${operationId}`);if(!validReceipt(v)||v.operationId!==operationId)throw new LibraryError("INVALID_RESPONSE","Saved state is still unconfirmed.",true);return v;}
  async mutate(operationId:string,kind:string,payload:unknown):Promise<Receipt>{const v=await this.call("/v1/operations","POST",{operationId,kind,payload});if(!validReceipt(v)||v.operationId!==operationId||v.kind!==kind)throw new LibraryError("INVALID_RESPONSE","Saved state is still unconfirmed.",true);return v;}
}
