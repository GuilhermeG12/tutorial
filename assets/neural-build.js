/* Active Montar workflow: recovered chord network + local Whisper in parallel. */
(function(){
  'use strict';
  const bridge=window.Android;
  const state={mode:'idle',id:'',name:'',link:'',video:'',language:'pt',youtubeSource:'captions',activeSource:'audio',captionInfo:null,chords:[],words:[],cp:0,wp:0,upload:0,duration:0,result:null,error:'',serial:0};
  const originalPlayer=window.onPlayer;
  let stageTimer=null;
  function watchStage(ms,message){clearTimeout(stageTimer);stageTimer=setTimeout(()=>{if(state.mode!=='idle'&&state.mode!=='ready'&&state.mode!=='error')fail(message);},ms);}
  function stopWatch(){clearTimeout(stageTimer);stageTimer=null;}
  const languages=()=>'<option value="pt">Português</option><option value="en">Inglês</option><option value="es">Espanhol</option><option value="fr">Francês</option><option value="it">Italiano</option><option value="de">Alemão</option><option value="ro">Romeno</option><option value="auto">Detectar idioma (só transcrição)</option>';
  const languageBase=value=>String(value||'').toLowerCase().replace(/_/g,'-').split('-')[0];
  const languageNames={pt:'Português',en:'Inglês',es:'Espanhol',fr:'Francês',it:'Italiano',de:'Alemão',ro:'Romeno'};
  function readyBridge(){if(!bridge||!bridge.neuralBegin)throw Error('Abra esta versão atualizada no aplicativo Android.');}
  function panel(){
    if(state.mode==='idle'||state.mode==='error'){
      app.innerHTML=`<header class="top"><h1>Montar cifra</h1></header><main>
        ${state.error?`<div class="card"><h3>Não foi possível terminar</h3><p class="hint">${esc(state.error)}</p></div>`:''}
        <div class="card"><h3>Do áudio para a cifra</h3><p class="hint">Acordes e palavras são reconhecidos no próprio áudio. A cifra inclui a introdução, os intervalos instrumentais e o final.</p>
        <input class="in" id="nname" placeholder="Nome da música" value="${esc(state.name)}">
        <label class="hint" for="nlang" style="display:block;margin-top:12px">Idioma da letra</label><select class="in" style="margin-top:8px" id="nlang">${languages()}</select>
        <label class="btn" style="display:block;text-align:center;margin-top:12px">Escolher áudio ou vídeo<input type="file" accept="audio/*,video/*" style="display:none" onchange="startBuildFile(this.files[0])"></label></div>
        <div class="card"><h3>Pelo link do YouTube</h3><input class="in" id="blink" placeholder="https://youtube.com/watch?v=…" value="${esc(state.link)}">
        <label class="hint" for="nsource" style="display:block;margin-top:12px">Como obter a letra</label>
        <select class="in" id="nsource"><option value="captions">Legenda do YouTube (automática ou do canal)</option><option value="audio">Transcrição do áudio pelo app</option></select>
        <p class="hint">Português é o padrão. O app busca a legenda nesse idioma e, se necessário, a tradução automática do YouTube para português ou para o idioma que você escolher.</p>
        <button class="btn ghost" style="width:100%;margin-top:10px" onclick="startBuildLink()">Montar cifra do vídeo</button></div>
        <button class="btn ghost" style="width:100%" onclick="startNeuralMic()">Ouvir pelo microfone</button>
        <p class="hint">Você poderá revisar a transcrição e os acordes antes de salvar.</p></main>${nav('montar')}`;
      document.getElementById('nlang').value=state.language;document.getElementById('nsource').value=state.youtubeSource;return;
    }
    if(state.mode==='ready'){
      app.innerHTML=`<header class="top"><h1>Cifra montada</h1></header><main><div class="card"><h3>Análise concluída</h3>
        <p class="hint">${esc(state.name)} · ${fmtT(state.duration)}<br>${state.chords.length} trechos de acordes · ${state.words.length} palavras reconhecidas</p>
        <p class="hint">Letra: ${state.activeSource==='captions'?(state.captionInfo&&state.captionInfo.automatic?'legenda automática do YouTube':'legenda do canal no YouTube'):'transcrição do áudio pelo app'}.</p>
        ${state.captionInfo?`<p class="hint">Idioma da legenda: ${esc(languageNames[languageBase(state.captionInfo.language)]||state.captionInfo.language)}.</p>`:''}
        ${state.captionInfo&&state.captionInfo.translated?`<p class="hint">Traduzida automaticamente pelo YouTube a partir de ${esc(languageNames[languageBase(state.captionInfo.sourceLanguage)]||state.captionInfo.sourceLanguage)}. A tradução pode manter erros da legenda original.</p>`:''}
        ${state.captionInfo&&state.captionInfo.timingApproximate?'<p class="hint">Esta legenda não informa todos os tempos por palavra; parte do alinhamento é aproximada.</p>':''}
        ${!state.words.length?'<p class="hint">Nenhuma palavra foi reconhecida. O resultado contém os acordes instrumentais; confira se havia voz no áudio.</p>':''}
        <button class="btn" style="width:100%" onclick="viewNeuralScore()">Ver cifra montada</button>
        <button class="btn ghost" style="width:100%;margin-top:8px" onclick="cancelBuild()">Analisar outro áudio</button></div></main>${nav('montar')}`;return;
    }
    app.innerHTML=`<header class="top"><h1>Montar cifra</h1></header><main><div class="card">
      <h3>${esc(state.name||'Preparando áudio')}</h3><p class="hint" id="nmessage"></p>
      <div style="height:8px;background:var(--soft);border-radius:8px;overflow:hidden"><div id="nbar" style="height:100%;width:0;background:var(--orange)"></div></div>
      <p class="hint" id="nstages"></p><div class="bchips" id="nchords"></div>
      <p id="nwords" style="line-height:1.7;max-height:180px;overflow:auto"></p>
      ${state.mode==='recording'?'<button class="btn" style="width:100%;margin-bottom:8px" onclick="stopNeuralMic()">Parar e analisar</button>':''}
      <button class="btn ghost" style="width:100%;margin-top:8px" onclick="cancelBuild()">Cancelar</button></div></main>${nav('montar')}`;
    update();
  }
  function update(){
    const msg=document.getElementById('nmessage'),stages=document.getElementById('nstages'),bar=document.getElementById('nbar');if(!msg)return;
    const messages={download:'Baixando o áudio do vídeo…',decode:'Abrindo e preparando o áudio…',upload:'Preparando a análise…',run:'Reconhecendo acordes e transcrevendo o áudio…',recording:'Ouvindo pelo microfone…'};
    msg.textContent=state.activeSource==='captions'&&state.mode==='run'?'Reconhecendo os acordes e montando com a legenda…':messages[state.mode]||'Preparando…';
    if(stages)stages.textContent=state.mode==='run'?`Acordes: ${Math.round(state.cp*100)}% · ${state.activeSource==='captions'?'Legenda':'Transcrição'}: ${Math.round(state.wp*100)}%`:'';
    if(bar)bar.style.width=Math.round(state.mode==='run'?10+90*(state.cp+state.wp)/2:10*state.upload)+'%';
    const c=document.getElementById('nchords');if(c)c.innerHTML=NeuralScore.changesOnly(state.chords).slice(-30).map(x=>`<span class="bchip">${esc(NeuralScore.notation(x.chord))}</span>`).join(' ');
    const w=document.getElementById('nwords');if(w)w.textContent=state.words.slice(-90).map(x=>x.w).join(' ');
  }
  function fail(error){stopWatch();state.mode='error';state.error=String(error&&error.message||error);build.st='idle';try{bridge&&bridge.neuralCancel();bridge&&bridge.captureStop();}catch(e){}if(location.hash==='#/montar')panel();}
  function prepare(name,activeSource='audio'){
    stopWatch();readyBridge();try{bridge.neuralCancel();bridge.captureStop();bridge.playerStop();}catch(e){}const lang=document.getElementById('nlang');state.language=lang?lang.value:state.language;
    if(activeSource==='captions'&&state.language==='auto')state.language='pt';
    state.name=name||state.name||'Áudio';state.id='n'+Date.now()+'_'+(++state.serial);
    Object.assign(state,{activeSource,captionInfo:null,cp:0,wp:0,upload:0,chords:[],words:[],result:null,error:'',duration:0});
    build.token++;build.st='run';return state.id;
  }
  const pause=()=>new Promise(r=>setTimeout(r,0));
  function check(error){if(error)throw Error(error);}
  function encodePcm(x){const bytes=new Uint8Array(x.length*2);for(let i=0;i<x.length;i++){const v=Math.round(Math.max(-1,Math.min(1,x[i]))*32767);bytes[2*i]=v&255;bytes[2*i+1]=(v>>8)&255;}let str='';for(let i=0;i<bytes.length;i+=8192)str+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(str);}
  async function analyzeBuffer(buffer,id){
    if(id!==state.id)return;state.mode='decode';panel();
    const ctx=new(window.AudioContext||window.webkitAudioContext)();let decoded;
    try{decoded=await ctx.decodeAudioData(buffer);}finally{await ctx.close();}
    if(id!==state.id)return;
    if(decoded.duration<1)throw Error('Escolha um áudio com pelo menos um segundo.');
    if(decoded.duration>1200)throw Error('Este áudio tem mais de 20 minutos. Recorte a música antes de analisar para evitar falta de memória.');
    const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
    const pcm=(await offline.startRendering()).getChannelData(0);if(id!==state.id)return;
    state.mode='upload';panel();
    if(state.activeSource==='captions'){
      if(!state.captionInfo||!state.captionInfo.words.length)throw Error('Não recebi a legenda deste vídeo. Escolha transcrição do áudio.');
      check(bridge.neuralBeginCaptions(id,state.language,JSON.stringify(state.captionInfo.words)));
    }else check(bridge.neuralBegin(id,state.language));
    for(let i=0;i<pcm.length;i+=40000){if(id!==state.id)return;check(bridge.neuralAppend(id,encodePcm(pcm.subarray(i,i+40000))));state.upload=Math.min(1,(i+40000)/pcm.length);update();await pause();}
    if(id!==state.id)return;state.mode='run';panel();watchStage(600000,'A análise demorou demais sem responder. Tente um trecho menor.');check(bridge.neuralFinish(id));
  }
  window.viewBuild=panel;
  window.startBuildFile=async function(file){
    if(!file)return;let id;
    if(file.size>150*1024*1024){fail('O arquivo é muito grande. Use uma música com até 150 MB.');return;}
    try{const name=document.getElementById('nname');id=prepare(name&&name.value.trim()||file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' '));state.video='';state.mode='decode';panel();await analyzeBuffer(await file.arrayBuffer(),id);}
    catch(e){if(!id||id===state.id)fail(e);}
  };
  window.startBuildLink=async function(){
    let id;try{
      const input=document.getElementById('blink');state.link=(input&&input.value||state.link).trim();if(!isMusicLink(state.link))throw Error('Cole um link de música válido.');
      const choice=document.getElementById('nsource');state.youtubeSource=choice&&choice.value==='audio'?'audio':'captions';
      const name=document.getElementById('nname');id=prepare(name&&name.value.trim(),state.youtubeSource);state.mode='download';panel();watchStage(120000,'O download não respondeu. Tente novamente ou escolha um arquivo de áudio.');
      const title=await resolveLink(state.link);if(id!==state.id)return;if(title)state.name=title;
      let video=ytId(state.link);if(!video&&title){const result=await fetchPage('https://www.youtube.com/results?search_query='+encodeURIComponent(title),'yt');video=result&&result.id;}
      if(id!==state.id)return;if(!video)throw Error('Não encontrei o vídeo desta música.');state.video=video;panel();bridge.extrairAudioNeural(video,id,state.language,state.activeSource==='captions');
    }catch(e){if(id===state.id||!id)fail(e);}
  };
  window.onExtrai=function(type,value,requestId){
    if(state.mode!=='download'||(requestId&&requestId!==state.id))return;
    if(type==='legendaStatus'){const message=document.getElementById('nmessage');if(message)message.textContent=value;return;}
    if(type==='legenda'){
      if(state.activeSource!=='captions')return;
      try{const info=NeuralScore.parseYouTubeCaptions(value);if(languageBase(info.language)!==languageBase(state.language))throw Error('Recebi uma legenda de outro idioma. Confira o idioma escolhido ou selecione transcrição do áudio.');state.captionInfo=info;state.words=info.words;state.wp=1;update();}catch(e){fail(e);}return;
    }
    if(type==='progresso'){state.upload=Number(value)||0;update();}
    else if(type==='erro')fail(value);
    else if(type==='ok'){stopWatch();watchStage(120000,'Não consegui preparar o áudio. Escolha um arquivo menor.');const id=state.id;fetch('https://teclacifra.audio/a?'+Date.now()).then(r=>{if(!r.ok)throw Error('Não consegui abrir o áudio baixado.');return r.arrayBuffer();}).then(b=>analyzeBuffer(b,id)).catch(e=>{if(id===state.id)fail(e);});}
  };
  window.onNeural=function(id,event){
    if(id!==state.id||state.mode==='idle'||state.mode==='error'||state.mode==='ready'||location.hash!=='#/montar')return;
    if(state.mode==='run')watchStage(600000,'A análise parou de responder. Tente um trecho menor.');
    if(event.type==='started'){state.duration=event.duration;state.mode='run';panel();}
    else if(event.type==='chords'){state.cp=event.progress;state.chords=event.segments||[];update();}
    else if(event.type==='words'){state.wp=event.progress;state.words=event.words||[];update();}
    else if(event.type==='error')fail('Falha no reconhecimento de '+event.stage+': '+event.message);
    else if(event.type==='complete'){stopWatch();state.activeSource=event.wordSource==='youtube'?'captions':'audio';state.result=event;state.chords=event.chords;state.words=event.words;state.duration=event.duration;state.mode='ready';build.st='ready';panel();}
  };
  window.cancelBuild=function(){stopWatch();state.id='';state.serial++;state.mode='idle';state.error='';build.token++;build.st='idle';try{bridge&&bridge.neuralCancel();bridge&&bridge.captureStop();bridge&&bridge.playerStop();}catch(e){}panel();};
  window.viewNeuralScore=function(){
    if(!state.result)return;let score;try{score=NeuralScore.assemble(state.result);}catch(e){fail('Não consegui organizar os tempos desta música. Tente analisar novamente.');return;}
    if(!score.text){fail('Não encontrei acordes nem palavras neste áudio.');return;}
    const captions=state.activeSource==='captions',origin=captions?'Montada com legenda do YouTube':'Montada pelo áudio';
    const pending={id:null,title:state.name||'Cifra montada',artist:'',key:score.key,yt:state.video||'',text:score.text,chords:[],version:origin,versions:[],variants:{},auto:true,caps:captions,youtubeCaptions:captions,captionAutomatic:!!(state.captionInfo&&state.captionInfo.automatic),captionTranslated:!!(state.captionInfo&&state.captionInfo.translated),transcription:!captions,transpose:0,source:origin,url:'',updated:Date.now(),sync:{t:score.tempos.map(t=>Math.round(t*100)/100)},analysis:{engine:captions?'chordai-conformer-youtube-captions':'chordai-conformer-whisper',wordSource:captions?'youtube':'audio',captionLanguage:state.captionInfo&&state.captionInfo.language,captionTranslated:!!(state.captionInfo&&state.captionInfo.translated),captionSourceLanguage:state.captionInfo&&state.captionInfo.sourceLanguage,timingApproximate:!!(state.captionInfo&&state.captionInfo.timingApproximate),duration:score.duration,words:score.words,chords:score.chords,sections:score.sections}};
    store.set('tc_pending',pending);build.st='idle';go('/preview');
  };
  window.montarCifraAgora=window.viewNeuralScore;
  window.startNeuralMic=function(){try{const name=document.getElementById('nname');prepare(name&&name.value.trim()||'Gravação');state.video='';state.mode='recording';state.recorded=0;state.resamplePhase=0;check(bridge.neuralBegin(state.id,state.language));panel();bridge.captureStart('mic');}catch(e){fail(e);}};
  window.onCapture=function(type){if(state.mode!=='recording')return;if(type==='nomic'||type==='denied'||type==='error')fail('Não foi possível ouvir o microfone. Confira a permissão de áudio.');};
  window.onPcm=function(encoded){
    if(state.mode!=='recording')return;
    try{const bytes=atob(encoded),count=bytes.length>>1,raw=new Float32Array(count);for(let i=0;i<count;i++)raw[i]=(bytes.charCodeAt(i*2)|(bytes.charCodeAt(i*2+1)<<8))<<16>>16;
      const out=[];let p=state.resamplePhase;for(;p<count-1;p+=22050/16000){const a=Math.floor(p),f=p-a;out.push(((a<0?state.previousSample||0:raw[a])*(1-f)+raw[a+1]*f)/32768);}state.resamplePhase=p-count;state.previousSample=raw[count-1];
      check(bridge.neuralAppend(state.id,encodePcm(out)));state.recorded+=count/22050;const msg=document.getElementById('nmessage');if(msg)msg.textContent='Gravando · '+fmtT(state.recorded);
    }catch(e){fail(e);}
  };
  window.stopNeuralMic=function(){if(state.mode!=='recording')return;try{bridge.captureStop();state.mode='run';panel();watchStage(600000,'A análise parou de responder. Tente um trecho menor.');check(bridge.neuralFinish(state.id));}catch(e){fail(e);}};
  window.onPlayer=function(type,value){if(typeof junto!=='undefined'&&junto.on&&originalPlayer)originalPlayer(type,value);};
  window.TeclaNeuralState=state;
  if(location.hash==='#/montar')panel();
})();
