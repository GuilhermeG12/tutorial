/* Responsive chord/lyric cells. Original score text and chord order stay intact. */
(function(root){
  'use strict';
  function render(target,html,options={}){
    // Website scores use character columns. Reflowing individual words changes
    // where a chord lands, especially after a line wraps on a small screen.
    target.classList.toggle('score-source',!!options.source);
    if(options.source){
      const doc=target.ownerDocument,fragment=doc.createDocumentFragment();
      for(const line of String(html).split('\n')){
        const row=doc.createElement('div');row.className='score-source-line';
        row.innerHTML=line||'\u200b';fragment.appendChild(row);
      }
      target.replaceChildren(fragment);target.scrollLeft=0;return;
    }
    const doc=target.ownerDocument,output=doc.createDocumentFragment();let phrase=null,footer=null;
    const make=(name,cls)=>{const el=doc.createElement(name);el.className=cls;return el;};
    const parsed=String(html).split('\n').map(line=>{const el=doc.createElement('div');el.innerHTML=line;const end=el.querySelector('.fim');if(end){footer=end;end.remove();}return el;});
    const flush=()=>{phrase=null;};
    const blank=()=>{flush();output.appendChild(make('div','score-gap'));};
    function sliceText(container,start,end){
      const walker=doc.createTreeWalker(container,4),range=doc.createRange();let node,at=0,begun=false;
      while((node=walker.nextNode())){const next=at+node.textContent.length;if(!begun&&start<next){range.setStart(node,Math.max(0,start-at));begun=true;}if(begun&&end<=next){range.setEnd(node,Math.max(0,end-at));return range.cloneContents();}at=next;}
      return doc.createTextNode(container.textContent.slice(start,end));
    }
    function chordPositions(container){
      const notes=[];let column=0;
      for(const node of container.childNodes){if(node.nodeType===1&&node.matches('.c'))notes.push({column,node});column+=node.textContent.length;}
      return notes;
    }
    function lyrics(container,chordLine){
      const text=container.textContent,tokens=Array.from(text.matchAll(/\S+/gu));
      if(!tokens.length)return;
      const assigned=tokens.map(()=>[]),notes=chordLine?chordPositions(chordLine):[];
      for(const note of notes){let at=0;for(let i=1;i<tokens.length;i++)if(tokens[i].index<=note.column)at=i;assigned[at].push(note);}
      if(!phrase||!options.flow){phrase=make('div','score-phrase');output.appendChild(phrase);}
      if(notes.length)phrase.classList.add('has-chords');
      tokens.forEach((token,i)=>{
        const cell=make('span','score-word'),harmony=make('span','score-harmony'),lyric=make('span','score-lyric');let column=0;
        for(const note of assigned[i]){const pos=Math.min(Math.max(0,note.column-token.index),Math.max(0,token[0].length-1)),gap=Math.max(column?1:0,pos-column);harmony.appendChild(doc.createTextNode(' '.repeat(gap)));harmony.appendChild(note.node.cloneNode(true));column+=gap+note.node.textContent.length;}
        lyric.appendChild(sliceText(container,token.index,token.index+token[0].length));cell.append(harmony,lyric);if(phrase.childNodes.length)phrase.appendChild(doc.createTextNode(' '));phrase.appendChild(cell);
      });
    }
    for(let i=0;i<parsed.length;i++){
      const line=parsed[i];
      const hadSection=!!line.querySelector('.sec');
      for(const section of Array.from(line.querySelectorAll('.sec'))){flush();const heading=make('div','score-heading');heading.appendChild(section);output.appendChild(heading);}
      if(!line.textContent.trim()){if(!hadSection&&i<parsed.length-1)blank();continue;}
      if(line.querySelector('.misstag')){flush();const block=make('div','score-heading');block.append(...Array.from(line.childNodes));output.appendChild(block);continue;}
      const hasChords=!!line.querySelector('.c');
      if(hasChords){
        const next=parsed[i+1];
        if(next&&next.textContent.trim()&&!next.querySelector('.c,.sec,.misstag,.fim')){lyrics(next,line);i++;}
        else{flush();const block=make('div','score-instrumental');for(const node of line.childNodes){if(node.nodeType===1)block.appendChild(node.cloneNode(true));else for(const token of node.textContent.trim().split(/\s+/).filter(Boolean)){const mark=make('span','score-mark');mark.textContent=token;block.appendChild(mark);}}output.appendChild(block);}
      }else lyrics(line,null);
    }
    if(footer)output.appendChild(footer);
    target.replaceChildren(output);target.scrollLeft=0;
  }
  root.CifraLayout={render};
})(typeof globalThis!=='undefined'?globalThis:this);
