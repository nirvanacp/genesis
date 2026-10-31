import {normalized} from "./domain";
export function validateName(value:string):string|null{
  const name=value.normalize("NFKC").trim().replace(/\s+/gu," ");
  if(!name)return "Enter a category name.";
  if([...name].length>80||new TextEncoder().encode(name).length>320)return "Use 80 characters or fewer.";
  if(/[\u0000-\u001f\u007f]/u.test(name))return "Use a name without control characters.";
  return null;
}
export const categoryKey=normalized;
