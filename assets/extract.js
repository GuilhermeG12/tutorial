// Roda escondido dentro da página do site de cifras (WebView invisível do app).
// mode 'search': lista da página de busca · 'web': resultados do Google · 'lyrics': letra · 'song': cifra + versões.
// Devolve JSON em texto, ou null enquanto a página ainda não terminou de montar.
(function (mode) {
  var ZW = /[​-‏‪-‮⁠-⁤﻿]/g;
  var SP = /[  -   　\t]/g;
  var NL = /\r?\n/;
  var clean = function (s) { return (s || '').replace(ZW, '').replace(/\s+/g, ' ').trim(); };
  var norm = function (s) { return clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
  var host = location.hostname;
  // só aceita o conteúdo quando o tamanho não mudou entre duas leituras seguidas (página terminou de carregar)
  var stable = function (k, len) { var key = '__tc_' + k; var ok = window[key] === len; window[key] = len; return ok; };
  var slugName = function (s) { return decodeURIComponent(s || '').replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); };

  if (mode === 'search') {
    var bad = /^(busca|search|menu|login|entrar|cadastro|top|estilos?|generos?|artistas?|playlists?|listas?|aulas?|academy|blog|contato|termos|privacidade|news|noticias|videoaulas|afinador|metronomo|dicionario|acordes|app|pro|ajuda|sobre|enviar|letras?|trending|novidades|ranking|mais-acessadas)$/i;
    var params = new URLSearchParams(location.search);
    var q = norm(params.get('q') || params.get('value') || '');
    var words = q.split(' ').filter(function (w) { return w.length > 1; });
    var seen = {}, out = [];
    Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (a) {
      var u; try { u = new URL(a.href); } catch (e) { return; }
      if (u.hostname !== host) return;
      var segs = u.pathname.split('/').filter(Boolean);
      if (segs[0] === 'cifra' && segs.length === 3) segs = segs.slice(1);
      if (segs.length !== 2 || bad.test(segs[0]) || bad.test(segs[1]) || /\./.test(segs[1])) return;
      var lines = (a.innerText || '').split(NL).map(clean).filter(Boolean);
      if (!lines.length || lines[0].length > 80) return;
      var url = u.origin + u.pathname;
      if (seen[url]) return; seen[url] = 1;
      var title = lines[0], artist = lines[1] && lines[1].length < 60 ? lines[1] : slugName(segs[0]);
      var hay = norm(title + ' ' + artist + ' ' + segs.join(' ').replace(/-/g, ' '));
      var score = 0; words.forEach(function (w) {   // tolera erro de digitação
        if (hay.indexOf(w) >= 0) score += 1;
        else if (w.length >= 4 && hay.indexOf(w.slice(0, -1)) >= 0) score += 0.5;
        else if (w.length >= 5 && hay.indexOf(w.slice(0, 3)) >= 0) score += 0.3;
      });
      out.push({ title: title, artist: artist, url: url, score: score });
    });
    var good = out.filter(function (r) { return r.score > 0; });
    if (!good.length) return null;
    good.sort(function (a, b) { return b.score - a.score; });
    return JSON.stringify({ results: good.slice(0, 25) });
  }

  if (mode === 'web') {
    var hosts = /(^|\.)(cifraclub\.com\.br|bananacifras\.com(?:\.br)?|cifras\.com\.br|ultimate-guitar\.com|cifrasgospel\.com\.br|letras\.mus\.br)$/;
    var res = [], seen = {};
    var bodyText = clean(document.body && document.body.innerText || '');
    if (/unusual traffic|verify you are human|confirme que voc[eê] [eé] humano|tr[aá]fego incomum|our systems have detected/i.test(bodyText))
      return JSON.stringify({error:'O mecanismo de busca pediu uma verificação. Abra a pesquisa no navegador ou tente mais tarde.'});
    Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (a) {
      var u;try{u=new URL(a.href,location.href);}catch(e){return;}
      if(/(^|\.)google\.[a-z.]+$/.test(u.hostname)&&u.pathname==='/url'){
        try{u=new URL(u.searchParams.get('q')||u.searchParams.get('url'));}catch(e){return;}
      }
      if(!/^https?:$/.test(u.protocol)||!hosts.test(u.hostname))return;
      var path=u.pathname.split('/').filter(Boolean);
      if(path.length<2||/^(busca|search|login|cadastro|trending|top|blog)$/i.test(path[0]))return;
      var heading=a.querySelector('h3,h2,[role="heading"]');
      var title=clean(heading&&(heading.innerText||heading.textContent)||a.innerText||a.textContent);
      if(!title||title.length<3||/^(imagens|images|cached|em cache|traduzir|translate)$/i.test(title))return;
      var url=u.origin+u.pathname;if(seen[url])return;seen[url]=true;
      var parts=title.split(/\s+[-|–]\s+/);
      res.push({title:parts[0].slice(0,160),artist:parts.length>2?parts[1]:'',url:url});
    });
    if(res.length)return JSON.stringify({results:res.slice(0,30)});
    return document.readyState==='complete'&&stable('web',bodyText.length)?JSON.stringify({results:[]}):null;
  }

  if (mode === 'yt') {   // página de busca do YouTube: primeiro vídeo
    var v = /"videoId":"([\w-]{11})"/.exec(document.documentElement.innerHTML) || /\/watch\?v=([\w-]{11})/.exec(document.documentElement.innerHTML);
    return v ? JSON.stringify({ id: v[1] }) : null;
  }

  if (mode === 'ytcaps') {   // legendas do vídeo (do canal ou automáticas), com o tempo de cada palavra
    if (window.__tcCaps !== undefined) return window.__tcCaps;
    if (window.__tcCapsBusy) return null;
    var html = document.documentElement.innerHTML, at = html.indexOf('"captionTracks":');
    if (at < 0) return document.readyState === 'complete' && stable('c', html.length) ? (window.__tcCaps = JSON.stringify({ none: true })) : null;
    var i0 = html.indexOf('[', at), depth = 0, i1 = i0;
    for (; i1 < html.length; i1++) { var ch = html[i1]; if (ch === '[') depth++; else if (ch === ']') { depth--; if (!depth) break; } }
    var tracks; try { tracks = JSON.parse(html.slice(i0, i1 + 1)); } catch (e) { return null; }
    var pt = function (t) { return /^pt/.test(t.languageCode || ''); };
    var tr = tracks.filter(function (t) { return pt(t) && t.kind !== 'asr'; })[0] || tracks.filter(function (t) { return pt(t); })[0]
      || tracks.filter(function (t) { return t.kind === 'asr'; })[0] || tracks[0];
    if (!tr || !tr.baseUrl) return (window.__tcCaps = JSON.stringify({ none: true }));
    window.__tcCapsBusy = true;
    var cu = new URL(tr.baseUrl.replace(/\\u0026/g, '&'), location.href); cu.searchParams.set('fmt', 'json3');
    fetch(location.origin + cu.pathname + cu.search, { credentials: 'include' }).then(function (r) { return r.text(); }).then(function (t) {
      var d = JSON.parse(t), evs = [];
      (d.events || []).forEach(function (ev) {
        if (!ev.segs) return;
        var t0 = (ev.tStartMs || 0) / 1000, words = [];
        ev.segs.forEach(function (s) {
          var w = clean((s.utf8 || '').replace(/\n/g, ' ')); if (!w) return;
          words.push({ t: t0 + (s.tOffsetMs || 0) / 1000, w: w, c: s.acAsrConf != null ? s.acAsrConf : null });
        });
        if (words.length) evs.push({ t0: t0, t1: t0 + (ev.dDurationMs || 0) / 1000, words: words });
      });
      window.__tcCaps = JSON.stringify(evs.length ? { auto: tr.kind === 'asr', lang: tr.languageCode, events: evs } : { none: true });
    }).catch(function () { window.__tcCaps = JSON.stringify({ none: true }); });
    return null;
  }

  if (mode === 'ytdesc') {   // página do vídeo: descrição completa (muitas vezes traz a letra)
    var dm = /"shortDescription":"((?:[^"\\]|\\.)*)"/.exec(document.documentElement.innerHTML);
    if (!dm) return null;
    try { return JSON.stringify({ desc: JSON.parse('"' + dm[1] + '"') }); } catch (e) { return null; }
  }

  if (mode === 'lyrics') {   // página "Letra" da música: só o texto
    var cands = Array.prototype.slice.call(document.querySelectorAll('.lyric-original, .letra, .cnt-letra, [class*="lyric"], [class*="letra"], article, main'));
    var bestL = null, bn = 0, bt = 1e9;
    cands.forEach(function (el) {
      var n = el.querySelectorAll('br').length + el.querySelectorAll('p').length, t = (el.innerText || '').length;
      if (n > 3 && (n > bn || (n === bn && t < bt))) { bestL = el; bn = n; bt = t; }
    });
    var exact = document.querySelector('.lyric-original, .cnt-letra');
    if (exact && (exact.innerText || '').length > 40) bestL = exact;
    if (!bestL) return null;
    var JUNK = /^(rolagem|m[ií]dia|op[cç][oõ]es|informa[cç][oõ]es da m[uú]sica|composi[cç][aã]o|essa informa|revisar|envio por|enviad[ao] por|legenda|tradu[cç][aã]o|significado|ver mais|compartilhar|imprimir|corrigir|cifra|tom|afinador)/i;
    var lyr = [];
    (bestL.innerText || '').split(NL).map(clean).filter(Boolean).some(function (l) {
      if (JUNK.test(l)) return lyr.length > 3;   // chegou no menu/rodapé da página: para
      lyr.push(l); return false;
    });
    if (!stable('l', lyr.join('|').length)) return null;
    return lyr.length >= 4 ? JSON.stringify({ lines: lyr }) : null;
  }


  // ---- mode 'song' ----
  // Banana renders an initially empty PRE from a public, same-origin JSON
  // URL declared by the page. Read that declaration if its renderer stalls.
  if (/(^|\.)bananacifras\.com$/.test(host)) {
    var bananaPre=document.querySelector('#song-pre');
    if(bananaPre&&!bananaPre.textContent.trim()){
      if(window.__tcBanana){bananaPre.textContent=window.__tcBanana.content||'';}
      else if(!window.__tcBananaBusy){
        var config=null;
        Array.prototype.some.call(document.scripts,function(script){
          var found=/"init_tab",(\{[^}]*\})/.exec(script.textContent||'');
          if(!found)return false;try{config=JSON.parse(found[1]);return !!config.json;}catch(e){return false;}
        });
        if(config&&config.json){
          var endpoint;try{endpoint=new URL(config.json,location.href);}catch(e){}
          if(endpoint&&endpoint.origin===location.origin&&endpoint.pathname==='/json/tab.json'){
            window.__tcBananaBusy=true;
            fetch(endpoint.href,{credentials:'same-origin'}).then(function(r){if(!r.ok)throw Error('HTTP');return r.json();}).then(function(data){
              if(data&&typeof data.content==='string')window.__tcBanana=data;
            }).catch(function(){window.__tcBananaFailed=true;});
          }
        }
      }
    }
  }
  var readScore=function(el){
    var out='';
    var walk=function(node){
      if(node.nodeType===3){out+=node.nodeValue;return;}
      if(node.nodeType!==1)return;
      var tag=node.tagName.toLowerCase();
      if(/^(script|style|button|iframe|noscript)$/.test(tag))return;
      if(tag==='br'){out+='\n';return;}
      var chord=node.getAttribute('data-chord')||node.getAttribute('data-acorde');
      if(chord&&/^[A-Ga-g][#b]?(?:[^\s]*)$/.test(chord)){
        out+=chord.replace(/^([a-g])/,function(x){return x.toUpperCase();}).replace(/\/([a-g])(?=[#b]?$)/,function(_,x){return '/'+x.toUpperCase();});return;
      }
      var block=/^(div|p|section|li)$/.test(tag);
      if(block&&out&&out.slice(-1)!=='\n')out+='\n';
      Array.prototype.forEach.call(node.childNodes,walk);
      if(block&&out.slice(-1)!=='\n')out+='\n';
    };walk(el);return out;
  };
  var pres=Array.prototype.slice.call(document.querySelectorAll('pre'));
  var best=null,bestLen=0;
  pres.forEach(function(p){var t=readScore(p);if(t.length>bestLen){best=p;bestLen=t.length;}});
  if(!best||bestLen<20){
    var cands=document.querySelectorAll('[ref="songChords"],.cifra_cnt,#cifra,.cifra-content,.cifra_content,[data-testid="chord-sheet"],.chord-sheet');
    Array.prototype.forEach.call(cands,function(el){var t=readScore(el);if(t.length>bestLen){best=el;bestLen=t.length;}});
  }
  if(!best||bestLen<20){
    var txt=clean(document.body&&document.body.innerText||'');
    if(/verify you are human|unusual traffic|tr[aá]fego incomum|access denied/i.test(txt))return JSON.stringify({error:'O site pediu uma verificação. Abra a página original.'});
    return null;
  }
  var area=best.closest('[ref="songChords"],.cifra_cnt,.cifra,[class*="cifra"],article,main')||best.parentElement||document.body;
  var blocks=best.tagName.toLowerCase()==='pre'?Array.prototype.filter.call(area.querySelectorAll('pre'),function(p){return readScore(p).trim().length>0&&!p.querySelector('pre');}):[best];
  if(blocks.indexOf(best)<0)blocks=[best];
  var full=blocks.map(readScore).join('\n');
  if(!stable('s',full))return null;
  var text=full.replace(ZW,'').replace(SP,' ').replace(/\r/g,'');
  var chords={};
  Array.prototype.forEach.call(area.querySelectorAll('pre b,pre strong,[data-chord],[data-acorde]'),function(el){
    var c=clean(el.getAttribute('data-chord')||el.getAttribute('data-acorde')||el.textContent);
    c=c.replace(/\/([a-g])(?=[#b]?$)/,function(_,x){return '/'+x.toUpperCase();});
    if(/^[A-G][#b]?[^\s]*$/.test(c)&&c.length<24)chords[c]=1;
  });

  var parts = document.title.split(/\s+[-|–]\s+/);
  var h1 = document.querySelector('h1'), h2 = document.querySelector('h2');
  var title = clean(h1 && (h1.innerText||h1.textContent)) || clean(parts[0]);
  var artistEl=document.querySelector('[itemprop=byArtist],h2 a[href],a[href][class*=artist]');
  var artist=clean(artistEl&&(artistEl.innerText||artistEl.textContent))||clean(parts[1])||clean(h2&&(h2.innerText||h2.textContent));

  var key = '';
  var tomEl = document.querySelector('#cifra_tom a, #cifra_tom, [data-tom], .js-tom');
  var tomTxt = tomEl ? (tomEl.getAttribute('data-tom') || tomEl.innerText||tomEl.textContent) : '';
  var m = /([A-G][#b]?m?)\s*$/.exec(clean(tomTxt)) || /\btom\s*:?\s*([A-G][#b]?m?)(?=\s|[),;]|$)/i.exec((document.body.innerText||document.body.textContent||'').slice(0,20000));
  if (m) key = m[1];
  if(window.__tcBanana&&typeof window.__tcBanana.tone==='string')key=window.__tcBanana.tone;
  if(key)key=key[0].toUpperCase()+key.slice(1);

  var y = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|vi\/)|youtu\.be\/|ytimg\.com\/vi\/)([\w-]{11})/.exec(document.documentElement.innerHTML);

  // versões: links que ficam "dentro" da pasta da música (ex.: /artista/musica/simplificada.html)
  var segs = location.pathname.split('/').filter(Boolean);
  var base = segs.length >= 2 ? '/' + segs.slice(0, segs[0] === 'cifra' ? 3 : 2).join('/') + '/' : null;
  var here = location.origin + location.pathname;
  var versions = [], vseen = {};
  if (base) {
    Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (a) {
      var u; try { u = new URL(a.href); } catch (e) { return; }
      if (u.hostname !== host) return;
      var p = u.pathname.replace(/\/?$/, u.pathname.slice(-5) === '.html' ? '' : '/');
      if (p.indexOf(base) !== 0) return;
      if (/letra|imprimir|video|aula|comentario|tabs?-?pro|\/pro\b|partitura|guitarpro|baixo|cavaco|ukulele|bateria|gaita|viola/i.test(p)) return;
      var name = clean(a.innerText);
      if (!name || name.length > 40) return;
      var url = u.origin + p;
      if (vseen[url]) return; vseen[url] = 1;
      versions.push({ name: name, url: url });
    });
  }
  if (!vseen[here] && !vseen[here + '/']) versions.unshift({ name: 'Esta versão', url: here });

  return JSON.stringify({
    title: title, artist: artist, key: key, yt: y ? y[1] : '', text: text,
    chords: Object.keys(chords), versions: versions, url: here, host: host
  });
})
