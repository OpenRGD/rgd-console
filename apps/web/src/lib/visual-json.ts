/** Bounded local-only JSON, no duplicate decoded keys, no raw parser errors. */
export function validPreviewRobot(value: unknown): value is string {
  return typeof value==='string' && /^[a-z0-9][a-z0-9_-]{0,79}$(?![\s\S])/.test(value);
}
export function parseVisualJson(raw:string,maxBytes:number):unknown {
  if(!raw.length||new TextEncoder().encode(raw).length>maxBytes)throw new Error('File vuoto o oltre il limite.');
  try {
    const value:unknown=JSON.parse(raw);
    // Parse tokens after JSON.parse has checked syntax; track keys in each
    // object independently, including escaped aliases, with a bounded depth.
    const stack:(Set<string>|null)[]=[];
    const tokens=raw.matchAll(/"(?:[^"\\]|\\.)*"|[{}\[\]]/gs);
    for(const token of tokens){
      const t=token[0];
      if(t==='{')stack.push(new Set());
      else if(t==='[')stack.push(null);
      else if(t==='}'||t===']')stack.pop();
      else if(t[0]==='"'&&/^\s*:/.test(raw.slice((token.index??0)+t.length))){
        const key:string=JSON.parse(t),current=stack[stack.length-1];
        if(!current||current.has(key)||['__proto__','constructor','prototype'].includes(key))throw new Error('key');
        current.add(key);
      }
      if(stack.length>48)throw new Error('depth');
    }
    const pending=[value];let nodes=0;
    while(pending.length){
      const x=pending.pop();
      if(++nodes>250000)throw new Error('nodes');
      if(typeof x==='number'&&(!Number.isFinite(x)||(Number.isInteger(x)&&!Number.isSafeInteger(x))))throw new Error('number');
      if(x&&typeof x==='object')for(const v of Object.values(x))pending.push(v);
    }
    return value;
  }catch{throw new Error('JSON non valido, ambiguo o oltre i limiti.');}
}
