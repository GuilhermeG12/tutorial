/* Bounded requests shared by search, imports and metadata lookups. */
(function(root){
  'use strict';
  let serial=0,active=false;
  const pending=new Map(),queue=[];
  function decode(value){
    for(let i=0;i<2&&typeof value==='string';i++){
      try{value=JSON.parse(value);}catch(e){break;}
    }
    return value;
  }
  function request(native,method,url,mode,timeout){
    return new Promise(resolve=>{
      if(!native||typeof native[method]!=='function'){resolve(null);return;}
      const id='tc'+(++serial);
      const finish=value=>{
        const item=pending.get(id);if(!item)return;
        clearTimeout(item.timer);pending.delete(id);resolve(decode(value));
      };
      pending.set(id,{finish,timer:setTimeout(()=>finish(null),timeout||25000)});
      try{if(method==='fetchPage')native.fetchPage(id,url,mode);else native.httpGet(id,url);}
      catch(e){finish(null);}
    });
  }
  async function pump(){
    if(active)return;active=true;
    try{
      while(queue.length){const task=queue.shift();try{task.resolve(await task.run());}catch(e){task.resolve(null);}}
    }finally{active=false;}
  }
  function page(native,url,mode){
    return new Promise(resolve=>{
      if(queue.length>=12){resolve(null);return;}
      const task={resolve,run:()=>request(native,'fetchPage',url,mode,25000)};
      // Opening a selected song takes precedence over queued discovery work.
      if(mode==='song')queue.unshift(task);else queue.push(task);
      pump();
    });
  }
  root.TeclaRequests={request,page,cancelQueued(){while(queue.length)queue.shift().resolve(null);},receive(id,raw){const item=pending.get(id);if(item)item.finish(raw);},decode};
})(window);
