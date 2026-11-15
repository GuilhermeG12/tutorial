const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('./runtime/node_modules/jsdom');
const assets=path.resolve(__dirname,'../assets');
const read=name=>fs.readFileSync(path.join(assets,name),'utf8');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const checks=[];
function check(name,fn){checks.push([name,fn]);}
function dom(html='<body></body>',url='https://www.cifras.com.br/cifra/artista/musica'){
 const d=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
 d.window.scrollTo=()=>{};d.window.HTMLElement.prototype.scrollIntoView=()=>{};
 return d;
}
function app(initialPrefs){
 const html=read('index.html'),d=dom(html,'https://teclacifra.test/#/');
 const w=d.window;w.Android={keepScreenOn(){},playerStop(){},httpGet(){},fetchPage(){},neuralCancel(){},captureStop(){},neuralBegin(){return '';},neuralAppend(){return '';},neuralFinish(){return '';}};
 w.alert=()=>{};w.confirm=()=>true;if(initialPrefs)w.localStorage.setItem('tc_prefs',JSON.stringify(initialPrefs));
 const ctx=d.getInternalVMContext();vm.runInContext(read('neural-score.js'),ctx);vm.runInContext(read('score-layout.js'),ctx);vm.runInContext(read('request-bridge.js'),ctx);
 const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function route()'))[1];
 vm.runInContext(inline+'\nwindow.__test={get songs(){return songs},get prefs(){return prefs},get srch(){return srch},get cur(){return cur},get inflight(){return inflight},store,setSongs:v=>songs=v,saveSongs,fetchPage,httpGet,quickSearch,runSearch,viewSong,route,viewBackup,importData,exportData,chooseVersion,openImported,renderSong,parseChord,renderCifra,viewSearch,shiftKey,toggleTheme,applyTheme,viewBuild};',ctx);vm.runInContext(read('neural-build.js'),ctx);return d;
}
function extraction(d,mode){const f=d.window.eval(read('extract.js'));let x=f(mode);if(x===null)x=f(mode);return x?JSON.parse(x):null;}
check('Cifras.com.br real HTML: complete score, BRs and chord attributes',()=>{
 const d=dom(fs.readFileSync(path.join(__dirname,'cifras-page.html'),'utf8'));
 const x=extraction(d,'song');assert.ok(x&&x.text.length>3000);assert.ok(x.text.includes('[Refrão]\n'));assert.ok(x.chords.includes('D/F#'));assert.ok(!x.text.includes('D/f#'));assert.ok(x.text.includes('Você é bem-vindo aqui'));d.window.close();
});
check('Cifra Club multi-block score: preserves spaces and hidden ending',()=>{
 const d=dom('<title>Música - Artista - Cifra Club</title><h1>Música</h1><main class="cifra_cnt"><pre>  <b>C</b>        <b>G</b>\nUma letra de exemplo\n</pre><aside>PUBLICIDADE</aside><pre style="display:none"><b>Am</b>      <b>F</b>\nUm final que não pode sumir</pre></main>','https://www.cifraclub.com.br/artista/musica/');
 const x=extraction(d,'song');assert.ok(x.text.startsWith('  C        G\n'));assert.ok(x.text.endsWith('Um final que não pode sumir'));assert.ok(!x.text.includes('PUBLICIDADE'));assert.equal(x.chords.length,4);d.window.close();
});
check('Banana real page: recovers the deferred JSON score without dropping lines',async()=>{
 const d=dom(fs.readFileSync(path.join(__dirname,'banana-song.html'),'utf8'),'https://www.bananacifras.com/cifra/c/casa-worship/a-casa-e-sua');
 const payload=JSON.parse(fs.readFileSync(path.join(__dirname,'banana-tab.json'),'utf8'));let requested='';
 d.window.fetch=async url=>{requested=url;return {ok:true,json:async()=>payload};};
 const f=d.window.eval(read('extract.js'));assert.equal(f('song'),null);await pause(0);f('song');const result=JSON.parse(f('song'));
 assert.ok(requested.includes('/json/tab.json?id='));assert.equal(result.text,payload.content);assert.equal(result.key,'G');d.window.close();
});
check('Generic source: explicit BRs are not flattened',()=>{
 const d=dom('<h1>Teste</h1><main><pre><b>C</b>        <b>G</b><br>Primeira linha da música<br><b>Am</b>       <b>F</b><br>Última linha da música</pre></main>','https://www.bananacifras.com/cifra/a/teste/musica');
 const x=extraction(d,'song');assert.equal(x.text.split('\n').length,4);d.window.close();
});
check('General search parses mobile links without an H3',()=>{
 const d=dom('<a href="https://www.cifras.com.br/cifra/artista/musica">Música - Artista - CIFRAS</a><a href="https://www.bananacifras.com/cifra/a/artista/musica"><h3>Outra - Artista - Banana</h3></a><a href="https://evil.example/cifraclub.com.br/a/b"><h3>Errada</h3></a>','https://www.google.com/search?q=musica+cifra');
 const x=extraction(d,'web');assert.equal(x.results.length,2);assert.equal(x.results[0].title,'Música');d.window.close();
});
check('Source layout preserves the original character columns',()=>{
 const d=dom('<pre id="score"></pre>');d.window.eval(read('score-layout.js'));
 const p=d.window.document.getElementById('score');d.window.CifraLayout.render(p,'  <span class="c">C</span>        <span class="c">G</span>\n      Palavra        seguinte',{source:true});
 assert.equal(p.children[0].textContent,'  C        G');assert.equal(p.children[1].textContent,'      Palavra        seguinte');assert.equal(p.querySelectorAll('.c').length,2);d.window.close();
});
check('Request timeout settles and ignores a late callback',async()=>{
 const d=dom();d.window.eval(read('request-bridge.js'));let id;
 const value=await d.window.TeclaRequests.request({httpGet(x){id=x;}},'httpGet','https://test',null,10);assert.equal(value,null);d.window.TeclaRequests.receive(id,'{"late":true}');d.window.close();
});
check('Bridge exceptions resolve without a stuck promise',async()=>{
 const d=dom();d.window.eval(read('request-bridge.js'));const x=await d.window.TeclaRequests.request({fetchPage(){throw Error('bridge');}},'fetchPage','url','song',20);assert.equal(x,null);d.window.close();
});
check('Queued hidden pages run serially and prioritize selected songs',async()=>{
 const d=dom();d.window.eval(read('request-bridge.js'));const calls=[],r=d.window.TeclaRequests;
 const bridge={fetchPage(id,url){calls.push([id,url]);}};
 const a=r.page(bridge,'a','web'),b=r.page(bridge,'b','web'),c=r.page(bridge,'song','song');
 assert.equal(calls.length,1);r.receive(calls[0][0],'{"results":[]}');await pause(0);assert.equal(calls[1][1],'song');r.receive(calls[1][0],'{"text":"score"}');await pause(0);assert.equal(calls[2][1],'b');r.receive(calls[2][0],null);await Promise.all([a,b,c]);d.window.close();
});
check('Full app: failed sources stop the spinner',async()=>{
 const d=app(),w=d.window,t=w.__test;w.location.hash='#/busca';await pause(0);
 w.Android.httpGet=id=>setTimeout(()=>w.onFetched(id,null),0);w.Android.fetchPage=id=>setTimeout(()=>w.onFetched(id,null),0);
 await t.runSearch('teste',false);assert.equal(t.srch.loading,false);assert.ok(w.document.querySelector('#sres').textContent.includes('navegador'));d.window.close();
});
check('Full app: selecting a result cannot be replaced by stale search',async()=>{
 const d=app(),w=d.window,t=w.__test;w.location.hash='#/busca';await pause(0);let reply;
 w.Android.httpGet=id=>{reply=()=>w.onFetched(id,JSON.stringify({response:{docs:[{dns:'artista',url:'outra',txt:'Outra'}]}}));};
 const search=t.runSearch('antiga',true);w.location.hash='#/';await pause(0);reply();await search;assert.equal(t.srch.results.length,0);assert.ok(w.document.querySelector('#list'));d.window.close();
});
check('Backup round-trip preserves sync, AI metadata, variants and corrections',()=>{
 const d=app(),w=d.window,t=w.__test;const song={id:'s1',title:'Teste',text:'C    G\nUma letra',sync:{t:[0,2]},auto:true,analysis:{words:[{w:'Uma',t0:0,t1:1}]},marcas:{0:{ok:true}},versions:[{name:'Original',url:'https://example.com/song'}],variants:{original:{text:'C\nUma letra'}},transpose:2};
 t.setSongs([song]);t.store.set('tc_correcoes',{v:1,itens:[{id:'c1',acorde_ia:'C'}]});let backup;w.Android.shareText=(_,x)=>backup=x;t.exportData();t.setSongs([]);t.viewBackup();w.document.getElementById('imp').value=backup;t.importData();assert.equal(t.songs[0].sync.t.length,2);assert.equal(t.songs[0].analysis.words[0].w,'Uma');assert.equal(t.songs[0].versions.length,1);assert.equal(t.songs[0].marcas[0].ok,true);assert.equal(t.store.get('tc_correcoes').itens.length,1);d.window.close();
});
check('Full app: source song opens, transposes and renders all chord tokens',()=>{
 const d=app(),w=d.window,t=w.__test;const song={id:'s1',title:'Alinhamento',text:'C            G\nUma letra inteira\n\nAm       F\nOutra linha',transpose:0};
 t.viewSong(song);assert.equal(w.document.querySelectorAll('#cifra .c').length,4);assert.ok(w.document.querySelector('#cifra.score-source'));assert.equal(w.document.querySelector('#cifra').children[0].textContent,'C            G');t.shiftKey(2);assert.equal(w.document.querySelector('#cifra .c').textContent,'D');d.window.close();
});
check('Neural output: invalid timestamps and no-chord labels do not break sync',()=>{
 const score=require(path.join(assets,'neural-score.js'));const out=score.assemble({duration:10,chords:[{chord:'C',t0:0,t1:4},{chord:'G',t0:3,t1:6},{chord:'N',t0:6,t1:7},{chord:'Am',t0:7,t1:10},{chord:'F',t0:-3,t1:-1}],words:[{w:'Primeira',t0:1,t1:2},{w:'segunda',t0:4,t1:5},{w:'última',t0:8,t1:9}]});assert.ok(out.chords.every(c=>c.t0>=0&&c.t1<=10&&c.chord!=='N'));assert.ok(out.tempos.every((t,i)=>i===0||t>=out.tempos[i-1]));assert.ok(out.text.includes('Primeira'));
});
check('Neural events after leaving the build screen cannot change the page',async()=>{
 const d=app(),w=d.window;w.TeclaNeuralState.id='current';w.TeclaNeuralState.mode='run';w.onNeural('current',{type:'complete',duration:10,chords:[],words:[]});assert.ok(w.document.querySelector('#list'));assert.notEqual(w.TeclaNeuralState.mode,'ready');d.window.close();
});
check('Dark theme button persists and updates system bars',()=>{
 const d=app(),w=d.window,t=w.__test;let nativeTheme='';w.Android.setAppTheme=x=>nativeTheme=x;
 assert.ok(w.document.getElementById('theme-toggle'));t.toggleTheme();
 assert.equal(w.document.documentElement.dataset.theme,'dark');assert.equal(t.store.get('tc_prefs').theme,'dark');assert.equal(nativeTheme,'dark');assert.equal(w.document.getElementById('theme-toggle').getAttribute('aria-pressed'),'true');
 t.toggleTheme();assert.equal(w.document.documentElement.dataset.theme,'light');d.window.close();
});
check('Saved dark theme restores on launch and remains during navigation',async()=>{
 const d=app({theme:'dark'}),w=d.window;assert.equal(w.document.documentElement.dataset.theme,'dark');w.location.hash='#/backup';await pause(0);assert.equal(w.document.documentElement.dataset.theme,'dark');d.window.close();
});
check('Transcription quality reaches native bridge and is saved',async()=>{
 const d=app(),w=d.window;let quality='';w.Android.setSpeechQuality=x=>quality=x;w.Android.captureStart=()=>{};
 w.location.hash='#/montar';await pause(0);assert.equal(w.document.getElementById('nquality').value,'precise');w.document.getElementById('nquality').value='balanced';w.startNeuralMic();
 assert.equal(quality,'balanced');assert.equal(w.__test.store.get('tc_prefs').speechQuality,'balanced');w.cancelBuild();d.window.close();
});
check('Word review changes spelling without shifting the audio timestamps',()=>{
 const d=app(),w=d.window,state=w.TeclaNeuralState;state.mode='ready';state.words=[{w:'Coracao',t0:2.4,t1:3.1}];state.result={words:state.words,duration:4,chords:[]};
 w.openSpeechReview();w.document.querySelector('#review-words input').value='Coração';w.saveSpeechReview();assert.equal(state.result.words[0].w,'Coração');assert.equal(state.result.words[0].t0,2.4);assert.equal(state.result.words[0].t1,3.1);assert.equal(state.result.words[0].edited,true);d.window.close();
});
check('Chords-only option persists and hides speech controls',async()=>{
 const d=app(),w=d.window;w.location.hash='#/montar';await pause(0);assert.equal(w.document.getElementById('noutput').value,'lyrics');w.setBuildOutput('chords');
 assert.equal(w.__test.store.get('tc_prefs').buildOutput,'chords');assert.equal(w.document.getElementById('speech-settings').hidden,true);assert.equal(w.document.getElementById('youtube-lyrics').hidden,true);w.setBuildOutput('lyrics');assert.equal(w.document.getElementById('speech-settings').hidden,false);d.window.close();
});
check('Chords-only microphone explicitly disables the native speech worker',async()=>{
 const d=app(),w=d.window;let profile='';w.Android.setSpeechQuality=x=>profile=x;w.Android.captureStart=()=>{};w.location.hash='#/montar';await pause(0);w.document.getElementById('noutput').value='chords';w.setBuildOutput('chords');w.startNeuralMic();assert.equal(profile,'chords-only');assert.equal(w.TeclaNeuralState.activeSource,'chords');w.cancelBuild();d.window.close();
});
check('Chords-only YouTube does not request captions',async()=>{
 const d=app(),w=d.window;let wantsCaptions=true;w.Android.setSpeechQuality=()=>{};w.Android.httpGet=id=>setTimeout(()=>w.onFetched(id,JSON.stringify({title:'Música teste',author_name:'Artista'})),0);w.Android.extrairAudioNeural=(video,id,language,captions)=>{wantsCaptions=captions;};
 w.location.hash='#/montar';await pause(0);w.document.getElementById('noutput').value='chords';w.setBuildOutput('chords');w.document.getElementById('blink').value='https://www.youtube.com/watch?v=abcdefghijk';await w.startBuildLink();assert.equal(wantsCaptions,false);assert.equal(w.TeclaNeuralState.activeSource,'chords');w.cancelBuild();d.window.close();
});
check('Chords-only completion stays lyric-free despite native source metadata',async()=>{
 const d=app(),w=d.window,state=w.TeclaNeuralState;w.location.hash='#/montar';await pause(0);state.id='only';state.activeSource='chords';state.mode='run';w.onNeural('only',{type:'complete',wordSource:'audio',duration:20,chords:[{chord:'C',t0:0,t1:20}],words:[{w:'ignored',t0:1,t1:2}]});
 assert.equal(state.activeSource,'chords');assert.equal(state.result.chordsOnly,true);assert.equal(state.result.words.length,0);assert.equal(w.document.querySelector('[onclick="openSpeechReview()"]'),null);d.window.close();
});
check('Chords-only score covers the full track with approximate Intro, parts and Final',()=>{
 const score=require(path.join(assets,'neural-score.js'));const chords=Array.from({length:24},(_,i)=>({chord:['C','G','Am','F'][i%4],t0:i*4,t1:(i+1)*4}));const out=score.assemble({chordsOnly:true,duration:96,chords,words:[{w:'MustNotAppear',t0:2,t1:3}]});
 assert.ok(out.text.includes('[Intro]'));assert.ok(out.text.includes('[Parte 1]'));assert.ok(out.text.includes('[Final]'));assert.ok(!out.text.includes('MustNotAppear'));assert.equal(out.words.length,0);assert.ok(out.tempos.includes(92));assert.ok(out.tempos.every((t,i)=>i===0||t>=out.tempos[i-1]));assert.ok(out.sections.every(s=>s.approximate));
});
check('Repeated chord after a silent gap remains in the chord-only score',()=>{
 const score=require(path.join(assets,'neural-score.js'));const out=score.assemble({chordsOnly:true,duration:30,chords:[{chord:'C',t0:0,t1:2},{chord:'C',t0:15,t1:17},{chord:'G',t0:28,t1:30}]});assert.ok(out.tempos.includes(15));assert.ok(out.tempos.includes(28));
});
check('Chords-only save records no transcription and keeps synchronized chord timestamps',async()=>{
 const d=app(),w=d.window,state=w.TeclaNeuralState;state.activeSource='chords';state.name='Somente acordes';state.result={chordsOnly:true,duration:40,chords:[{chord:'C',t0:0,t1:10},{chord:'G',t0:10,t1:20},{chord:'F',t0:20,t1:40}],words:[]};w.viewNeuralScore();const pending=w.__test.store.get('tc_pending');assert.equal(pending.chordsOnly,true);assert.equal(pending.transcription,false);assert.equal(pending.analysis.wordSource,'none');assert.equal(pending.analysis.words.length,0);assert.ok(pending.sync.t.length>0);d.window.close();
});
(async()=>{let failures=0;for(const [name,fn]of checks){try{await fn();console.log('PASS',name);}catch(e){failures++;console.error('FAIL',name,e.stack);}}console.log(`${checks.length-failures}/${checks.length} checks passed`);process.exitCode=failures?1:0;})();

