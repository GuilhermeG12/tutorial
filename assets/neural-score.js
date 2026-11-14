/* Pure timeline-to-score assembly. Both words and chords carry model timestamps. */
(function(root){
  'use strict';
  const NOTE={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
  const SHARP=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  function notation(chord){
    return String(chord).replace(/min/g,'m').replace(/M13/g,'7M(9/11/13)').replace(/M11/g,'7M(9/11)').replace(/M9/g,'7M(9)').replace(/M7/g,'7M').replace(/-5/g,'(b5)')
      .replace(/^([A-G][#b]?m?)(9|11|13)(.*)$/,(_,r,e,rest)=>r+'7('+(e==='9'?'9':e==='11'?'9/11':'9/13')+')'+rest);
  }
  function normalized(data){
    const duration=Math.max(0,Number(data.duration)||0);
    const chords=(Array.isArray(data.chords)?data.chords:[]).filter(x=>x&&/^[A-G][#b]?/.test(String(x.chord||''))&&Number.isFinite(x.t0)&&Number.isFinite(x.t1)&&x.t1>x.t0&&x.t1>0&&x.t0<duration)
      .map(x=>({...x,chord:notation(x.chord),t0:Math.max(0,x.t0),t1:Math.min(duration,x.t1)})).sort((a,b)=>a.t0-b.t0);
    const words=(Array.isArray(data.words)?data.words:[]).filter(x=>x&&typeof x.w==='string'&&x.w.trim()&&Number.isFinite(x.t0)&&Number.isFinite(x.t1)&&x.t1>=x.t0&&x.t1>0&&x.t0<duration)
      .map(x=>({...x,w:x.w.trim(),t0:Math.max(0,x.t0),t1:Math.min(duration,x.t1)})).sort((a,b)=>a.t0-b.t0);
    // A new model segment supersedes the preceding segment at its start.
    // Keep one ordered timeline for both the rendered score and playback.
    for(let i=0;i+1<chords.length;i++)chords[i].t1=Math.min(chords[i].t1,chords[i+1].t0);
    const merged=[];
    for(const c of chords){if(c.t1<=c.t0)continue;const last=merged[merged.length-1];if(last&&last.chord===c.chord&&c.t0-last.t1<0.02)last.t1=Math.max(last.t1,c.t1);else merged.push({...c});}
    return {duration,chords:merged,words};
  }
  function changesOnly(items,previousChord=null){
    let previous=previousChord==null?null:notation(previousChord);
    return items.filter(item=>{const name=notation(item.chord);if(name===previous)return false;previous=name;return true;});
  }
  function key(chords){
    const counts=Array(12).fill(0),profiles=[[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88],[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]];
    for(const c of chords){const m=/^([A-G][#b]?)(.*)$/.exec(c.chord);if(!m)continue;const r=NOTE[m[1]],d=c.t1-c.t0;counts[r]+=2*d;counts[(r+(/^m(?!aj)/.test(m[2])?3:4))%12]+=d;counts[(r+7)%12]+=d;}
    let best=-Infinity,name='C';for(let r=0;r<12;r++)for(let minor=0;minor<2;minor++){let v=0;for(let i=0;i<12;i++)v+=counts[(r+i)%12]*profiles[minor][i];if(v>best){best=v;name=SHARP[r]+(minor?'m':'');}}
    return name;
  }
  function assemble(input){
    const {duration,chords,words}=normalized(input),lines=[],times=[],sections=[];
    const changes=(start,end)=>{
      const list=[];let active=null;
      for(const c of chords){if(c.t0<=start&&c.t1>start)active=c;else if(c.t0>start)break;}
      if(active)list.push({...active,t0:start});
      for(const c of chords)if(c.t0>start&&c.t0<end)list.push(c);
      return list;
    };
    function instrumental(label,start,end){
      if(end<=start)return;const items=changesOnly(changes(start,end));if(!items.length)return;
      lines.push('['+label+']');sections.push({type:'instrumental',label,t0:start,t1:end});
      for(let i=0;i<items.length;i+=4){const row=items.slice(i,i+4);lines.push(row.map(x=>x.chord).join('   '));times.push(...row.map(x=>x.t0));}lines.push('');
    }
    if(!words.length){instrumental('Instrumental',0,duration);return {text:lines.join('\n').trim(),tempos:times,key:key(chords),sections,words,chords,duration};}
    const groups=[];let group=[];
    for(const word of words){
      const prev=group[group.length-1];
      if(prev&&word.t0-prev.t1>3){groups.push(group);group=[];}
      group.push(word);
    }
    if(group.length)groups.push(group);
    const stanzaTexts=groups.map(g=>g.map(w=>w.w.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')).join(' '));
    let previousEnd=0,part=0;
    groups.forEach((g,gi)=>{
      const start=g[0].t0,last=g[g.length-1];
      const end=Math.min(duration,Math.max(...g.map(w=>w.t1)));
      if(start-previousEnd>=1.5)instrumental(gi===0?'Intro':'Instrumental',previousEnd,start);
      const repeated=stanzaTexts[gi].length>20&&stanzaTexts.filter(x=>x===stanzaTexts[gi]).length>1;
      const label=repeated?'Refrão':'Parte '+(++part);lines.push('['+label+']');sections.push({type:'vocal',label,t0:start,t1:end});
      const rows=[];let row=[],len=0;
      for(const w of g){const prev=row[row.length-1];if(row.length&&(len+w.w.length>46||w.t0-prev.t1>0.8)){rows.push(row);row=[];len=0;}row.push(w);len+=w.w.length+1;}if(row.length)rows.push(row);
      let previousChord=null;
      rows.forEach((ws,ri)=>{
        const a=ws[0].t0,b=ri+1<rows.length?rows[ri+1][0].t0:end+0.001;
        const ac=changesOnly(changes(a,b),previousChord),assigned=ws.map(()=>[]);
        if(ac.length)previousChord=ac[ac.length-1].chord;
        for(const c of ac){let at=0;for(let i=1;i<ws.length;i++)if(ws[i].t0<=c.t0+0.06)at=i;assigned[at].push(c);}
        let lyric='',harmony='';
        ws.forEach((w,i)=>{
          const notes=assigned[i].map(x=>x.chord).join(' '),column=Math.max(lyric.length,harmony.length)+(i?1:0);
          lyric+=' '.repeat(column-lyric.length)+w.w;
          if(notes){harmony+=' '.repeat(column-harmony.length)+notes;times.push(...assigned[i].map(x=>x.t0));}
        });
        if(harmony)lines.push(harmony);lines.push(lyric);
      });lines.push('');previousEnd=Math.max(previousEnd,end);
    });
    if(duration-previousEnd>=1.5)instrumental('Final',previousEnd,duration);
    return {text:lines.join('\n').replace(/\n{3,}/g,'\n\n').trim(),tempos:times,key:key(chords),sections,words,chords,duration};
  }
  function captionFragments(segments){
    const decode=text=>String(text||'').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(all,key)=>{
      const names={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '},lower=key.toLowerCase();
      if(lower[0]!=='#')return names[lower];
      const code=lower[1]==='x'?parseInt(lower.slice(2),16):parseInt(lower.slice(1),10);
      return code>=0&&code<=0x10ffff?String.fromCodePoint(code):all;
    });
    const raw=segments.map(s=>decode(s.utf8)),combined=raw.join(''),masked=combined.split('');
    const annotation=text=>{
      const label=text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/\s+/g,' ').trim();
      return /^(?:musica|music|canto|cantando|cancao|singing|sings|instrumental|aplausos?|applause|risos?|rindo|laugh(?:ter|ing|s)?|ruidos?|barulho|noise|silencio|silence|inaudivel|ininteligivel|unintelligible|sons?|sound|assobios?|whistling|tosse|cough(?:ing)?|respiracao|breathing|suspiros?|sighs?|vocalizacao|vocalizando)(?:\b|$)/.test(label)
        || /^(?:intro|introducao|interludio|solo|refrao|verso|verse|chorus|bridge|ponte|outro|cantor|cantora|singer)$/.test(label)
        || /^vozes?(?: (?:masculin[ao]s?|feminin[ao]s?|ao fundo|de fundo|em off))?$/.test(label);
    };
    for(const match of combined.matchAll(/\[[^\[\]]{1,240}\]|\([^()]{1,240}\)|\{[^{}]{1,240}\}/gu)){
      if(annotation(match[0].slice(1,-1)))for(let i=match.index;i<match.index+match[0].length;i++)masked[i]=' ';
    }
    const clean=text=>text.replace(/<\/?(?:i|b|u|font|c|v|lang|ruby|rt)(?:[.\s][^>]*|)>/gi,' ')
      .replace(/(?:-+|=+)>|<(?:-+|=+)|[<>»«›‹\u2190-\u21ff\u27f0-\u27ff\u2900-\u297f\u27a1\u2b05-\u2b07\ufe0e\ufe0f\u2669-\u266c]|[\u{1d100}-\u{1d1ff}]/gu,' ')
      .replace(/\[\s*\]|\(\s*\)|\{\s*\}/g,' ')
      .replace(/(^|\n)\s*[-–—]+(?:\s+|$)/g,' ')
      .replace(/\s+/g,' ').trim();
    let offset=0;
    return segments.map((segment,i)=>{const text=clean(masked.slice(offset,offset+raw[i].length).join(''));offset+=raw[i].length;return {...segment,text};});
  }
  function parseYouTubeCaptions(packet){
    const p=String(packet).indexOf('|'),q=String(packet).indexOf('|',p+1);
    if(p<0||q<0)throw Error('A legenda recebida está incompleta. Tente a transcrição do áudio.');
    const automatic=packet.slice(0,p)==='1',language=packet.slice(p+1,q);
    let data;try{data=JSON.parse(packet.slice(q+1));}catch(e){throw Error('O YouTube não forneceu uma legenda válida. Tente a transcrição do áudio.');}
    const events=data.events||[],words=[];let approximate=false;
    for(let ei=0;ei<events.length;ei++){
      const ev=events[ei],base=Number(ev.tStartMs)/1000;if(!Number.isFinite(base)||base<0||!Array.isArray(ev.segs))continue;
      const duration=Number(ev.dDurationMs)/1000;
      const next=duration>0?null:events.slice(ei+1).find(x=>Number(x.tStartMs)>Number(ev.tStartMs));
      let end=duration>0?base+duration:next?Number(next.tStartMs)/1000:base+2;
      if(!(duration>0))approximate=true;
      let segments=captionFragments(ev.segs);
      if(segments.length>1&&segments.every(s=>s.tOffsetMs==null))segments=[{text:segments.map(s=>s.text).filter(Boolean).join(' ')}];
      segments.forEach((s,si)=>{
        if(!s.text)return;
        const parts=s.text.split(/\s+/).filter(Boolean),offset=Number(s.tOffsetMs);
        const a=base+(Number.isFinite(offset)?offset/1000:0);
        const following=segments[si+1],nextOffset=following&&Number(following.tOffsetMs);
        const b=Math.max(a+0.02,following&&Number.isFinite(nextOffset)&&nextOffset>(Number.isFinite(offset)?offset:0)?base+nextOffset/1000:end);
        if(parts.length>1||s.tOffsetMs==null)approximate=true;
        const weight=parts.reduce((sum,w)=>sum+w.length,0);let consumed=0;
        parts.forEach(w=>{const t0=a+(b-a)*consumed/weight;consumed+=w.length;words.push({w,t0,t1:a+(b-a)*consumed/weight});});
      });
    }
    words.sort((a,b)=>a.t0-b.t0);const unique=[],seen=new Set();
    for(const word of words){const key=word.w+'|'+Math.round(word.t0*1000);if(!seen.has(key)){seen.add(key);unique.push(word);}}
    if(!unique.length)throw Error('Esta legenda não contém palavras. Escolha transcrição do áudio.');
    const metadata=data._teclaCaption||{},translated=metadata.translated===true;
    if(translated&&String(metadata.targetLanguage||'').toLowerCase().split('-')[0]!==language.toLowerCase().split('-')[0])throw Error('A tradução recebida está em outro idioma. Tente novamente.');
    return {words:unique,automatic,language,timingApproximate:approximate,translated,sourceLanguage:metadata.sourceLanguage||language};
  }
  const api={assemble,normalized,notation,parseYouTubeCaptions,changesOnly};root.NeuralScore=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
