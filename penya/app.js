(function(){
  "use strict";

  // El full de Google on viuen les dades. Nomes el propietari hi pot escriure;
  // aquesta pagina nomes el llegeix.
  var FULL="1Ktz-pU3JNFMVZnp_8B6hxAPn1ec7KppSKm3-pdJnQr0";

  // Dues portes al mateix full. La primera (gviz) dona SEMPRE l'ultim apunt i
  // n'hi ha prou que el full estigui compartit amb enllac. Si el navegador la
  // bloqueja per CORS es prova la segona, que necessita «Publica a la web» i
  // pot anar uns minuts endarrerida: val mes ensenyar dades d'ara fa cinc
  // minuts que una pantalla d'error.
  function portes(){
    var t="&_="+Date.now();
    return ["https://docs.google.com/spreadsheets/d/"+FULL+"/gviz/tq?tqx=out:csv"+t,
            "https://docs.google.com/spreadsheets/d/e/"+FULL+"/pub?output=csv"+t];
  }

  var DIES=["dg","dl","dt","dc","dj","dv","ds"];
  var MESOS=["gen","feb","mar","abr","mai","jun","jul","ago","set","oct","nov","des"];

  var state=null, error="", carregant=true, quan=null;

  /* ---------- llegir el full ---------- */

  function csv(text){
    var files=[], f=[], c="", dinsCometes=false, i=0;
    while(i<text.length){
      var ch=text[i];
      if(dinsCometes){
        if(ch==='"'){ if(text[i+1]==='"'){ c+='"'; i++; } else dinsCometes=false; }
        else c+=ch;
      }else{
        if(ch==='"') dinsCometes=true;
        else if(ch===","){ f.push(c); c=""; }
        else if(ch==="\n"){ f.push(c); files.push(f); f=[]; c=""; }
        else if(ch!=="\r") c+=ch;
      }
      i++;
    }
    f.push(c); files.push(f);
    return files;
  }

  function cel(fila,n){ return (fila && fila[n]!==undefined) ? String(fila[n]).trim() : ""; }

  function num(v){
    v=String(v||"").replace(/[^0-9,.\-]/g,"");
    if(v==="") return 0;
    // «1.234,56» i «1234,56» surten del full en catala/castella; «1234.56», en angles.
    if(v.indexOf(",")>-1 && v.indexOf(".")>-1) v=v.replace(/\./g,"").replace(",",".");
    else if(v.indexOf(",")>-1) v=v.replace(",",".");
    var n=Number(v);
    return isNaN(n)?0:n;
  }

  function pad(n){ n=String(n); return n.length<2?"0"+n:n; }

  // El full pot tornar la data de tres maneres segons com la tingui formatada
  // l'usuari. Es proven totes tres abans de donar la fila per dolenta.
  function data(v){
    v=String(v||"").trim();
    if(!v) return null;
    var m=v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m) return m[1]+"-"+m[2]+"-"+m[3];
    m=v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if(m) return m[3]+"-"+pad(m[2])+"-"+pad(m[1]);
    m=v.match(/^Date\((\d+),(\d+),(\d+)\)/);
    if(m) return m[1]+"-"+pad(Number(m[2])+1)+"-"+pad(m[3]);
    return null;
  }

  function siNo(v){ return /^(s|si|sí|true|x|1|repartit)/i.test(String(v||"").trim()); }

  function llegir(files){
    var s={membres:[],sortejos:[],aportacions:[],combis:[],reintegrament:""};
    for(var r=1;r<files.length;r++){
      var f=files[r];
      var d1=data(cel(f,0));
      if(d1) s.sortejos.push({data:d1, jugat:num(cel(f,1)), premi:num(cel(f,2)),
                              repartit:siNo(cel(f,3)), nota:cel(f,4)});
      var d2=data(cel(f,6));
      if(d2 && cel(f,7)) s.aportacions.push({data:d2, membre:cel(f,7), "import":num(cel(f,8))});
      if(cel(f,10)) s.membres.push(cel(f,10));
      if(cel(f,12)) s.combis.push(cel(f,12));
      if(cel(f,14) && !s.reintegrament) s.reintegrament=cel(f,14);
    }
    return s;
  }

  function carregar(){
    var urls=portes(), i=0;
    function prova(){
      if(i>=urls.length){
        carregant=false;
        error="No s'han pogut llegir les dades del full.";
        pinta(); return;
      }
      var u=urls[i++];
      fetch(u,{cache:"no-store"})
        .then(function(r){ if(!r.ok) throw new Error(r.status); return r.text(); })
        .then(function(t){
          if(t.indexOf("<!DOCTYPE")===0 || t.indexOf("<html")===0) throw new Error("no es CSV");
          var s=llegir(csv(t));
          if(!s.sortejos.length && !s.aportacions.length && !s.membres.length) throw new Error("full buit");
          state=s; carregant=false; error=""; quan=new Date(); pinta();
        })
        .catch(function(){ prova(); });
    }
    prova();
  }

  /* ---------- comptes ---------- */

  function eur(n){ return (Math.round((Number(n)||0)*100)/100).toFixed(2).replace(".",",")+" €"; }
  function signed(n){ return (n>0?"+":(n<0?"−":""))+eur(Math.abs(n)); }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }

  function fmtDate(iso){
    var p=String(iso||"").split("-"); if(p.length!==3) return iso||"";
    var d=new Date(Number(p[0]),Number(p[1])-1,Number(p[2]));
    if(isNaN(d.getTime())) return iso;
    return DIES[d.getDay()]+" "+Number(p[2])+" "+MESOS[Number(p[1])-1];
  }

  function byDate(a,b){ return a.data<b.data?-1:(a.data>b.data?1:0); }

  function calc(){
    var n=Math.max(1,state.membres.length), jugat=0, premis=0, repartit=0, wins=0, posat=0;
    state.sortejos.forEach(function(s){
      jugat+=s.jugat; premis+=s.premi;
      if(s.premi>0){ wins++; if(s.repartit) repartit+=s.premi; }
    });
    state.aportacions.forEach(function(a){ posat+=a["import"]; });
    var ord=state.sortejos.slice().sort(byDate);
    var setmanal=ord.length?ord[ord.length-1].jugat:10;
    return {n:n,jugat:jugat,premis:premis,repartit:repartit,posat:posat,wins:wins,
            setmanes:state.sortejos.length, balanc:premis-jugat,
            caixa:posat+premis-repartit-jugat, setmanal:setmanal||10};
  }

  /* ---------- pintar ---------- */

  function pinta(){ document.getElementById("app").innerHTML=vista(); }

  function vista(){
    if(carregant) return '<p class="empty" style="padding:60px 16px">Carregant els comptes…</p>';
    if(error) return '<section class="card"><p class="empty" style="padding:34px 16px">'+esc(error)+
      '<br><br><span style="color:var(--ink-3);font-size:13px">Comprova que el full de Google estigui compartit amb enllaç.</span></p></section>';

    var c=calc(), h=[];

    h.push('<header class="top"><span class="eyebrow">Penya de la cuina</span>');
    h.push('<h1>El pot de la cuina</h1>');
    h.push('<p class="sub">La Primitiva · sorteig de dissabte · '+c.n+' participants</p></header>');

    h.push('<section class="card hero"><span class="label">A la caixa</span>');
    h.push('<div class="big num '+(c.caixa>0?"pos":(c.caixa<0?"neg":""))+'">'+eur(c.caixa)+'</div>');
    var setm=Math.floor(c.caixa/(c.setmanal||1));
    h.push('<div class="foot">'+(c.setmanes?c.setmanes+(c.setmanes===1?" setmana jugada · ":" setmanes jugades · "):"")+
      'balanç '+signed(c.balanc)+(setm>0?' · dona per '+setm+(setm===1?' setmana':' setmanes')+' més':' · toca posar diners')+'</div></section>');

    h.push('<div class="stats">');
    h.push('<div class="stat"><span class="k">Posat</span><span class="v num">'+eur(c.posat)+'</span></div>');
    h.push('<div class="stat"><span class="k">Gastat</span><span class="v num">'+eur(c.jugat)+'</span></div>');
    h.push('<div class="stat"><span class="k">Guanyat</span><span class="v num'+(c.premis>0?" green":"")+'">'+eur(c.premis)+'</span></div>');
    h.push('</div>');

    if(c.setmanes){
      h.push('<div class="card streak">');
      state.sortejos.slice().sort(byDate).forEach(function(s){
        h.push('<span class="tick'+(s.premi>0?" win":"")+'" title="'+esc(fmtDate(s.data))+'"></span>'); });
      h.push('<span class="cap">'+c.wins+'/'+c.setmanes+' amb premi</span></div>');
    }

    h.push('<div class="sechead"><h2>Les nostres combinacions</h2>'+
      (state.combis.length?'<span class="note">'+state.combis.length+(state.combis.length===1?' aposta':' apostes')+'</span>':'')+'</div>');
    h.push('<section class="card combis">');
    if(!state.combis.length){ h.push('<p class="empty">Encara no hi són apuntades.</p>'); }
    else{
      state.combis.forEach(function(cb,i){
        h.push('<div class="crow"><span class="cidx">'+(i+1)+'</span><span class="balls">');
        String(cb).split(/[^0-9]+/).filter(Boolean).forEach(function(nn){ h.push('<span class="ball">'+esc(nn)+'</span>'); });
        h.push('</span></div>');
      });
      if(state.reintegrament){
        h.push('<div class="rei"><span>Reintegrament</span><span class="balls">');
        state.reintegrament.split(/[^0-9]+/).filter(Boolean).forEach(function(nn){ h.push('<span class="ball">'+esc(nn)+'</span>'); });
        h.push('</span></div>');
      }
    }
    h.push('</section>');

    h.push('<div class="sechead"><h2>Setmana a setmana</h2>'+(c.setmanes?'<span class="note">'+c.setmanes+'</span>':'')+'</div>');
    h.push('<section class="card ledger">');
    var list=state.sortejos.slice().sort(byDate);
    if(!list.length){ h.push('<p class="empty">Encara no hi ha cap sorteig apuntat.</p>'); }
    else{
      for(var i=list.length-1;i>=0;i--){
        var s=list[i];
        h.push('<div class="lrow"><span class="idx">'+(i+1)+'</span><span class="d"><span class="dt">'+esc(fmtDate(s.data))+
          (s.premi>0?'<span class="chip '+(s.repartit?"rep":"pot")+'">'+(s.repartit?"repartit":"al pot")+'</span>':'')+'</span>');
        h.push('<span class="meta">jugat '+eur(s.jugat)+(s.nota?' · '+esc(s.nota):'')+'</span></span>');
        h.push('<span class="amt '+(s.premi>0?"win":"none")+'">'+(s.premi>0?"+"+eur(s.premi):"—")+'</span></div>');
      }
    }
    h.push('</section>');

    h.push('<div class="sechead"><h2>Qui ha posat</h2><span class="note">'+eur(c.posat)+' en total</span></div>');
    h.push('<section class="card ledger">');
    var aps=state.aportacions.slice().sort(byDate);
    if(!aps.length){ h.push('<p class="empty">Cap aportació apuntada.</p>'); }
    else{
      for(var j=aps.length-1;j>=0;j--){
        var a=aps[j];
        h.push('<div class="lrow"><span class="idx">'+(j+1)+'</span><span class="d"><span class="dt">'+esc(a.membre)+'</span>');
        h.push('<span class="meta">'+esc(fmtDate(a.data))+'</span></span>');
        h.push('<span class="amt inn">+'+eur(a["import"])+'</span></div>');
      }
    }
    h.push('</section>');

    var prizes=state.sortejos.slice().sort(byDate).filter(function(s){return s.premi>0;});
    h.push('<div class="sechead"><h2>Repartiment de premis</h2>'+(prizes.length?'<span class="note">entre '+c.n+'</span>':'')+'</div>');
    h.push('<section class="card split">');
    if(!prizes.length){ h.push('<p class="empty" style="padding:6px 0">Quan caigui un premi, aquí surt quant toca a cadascú.</p>'); }
    else{
      var cobrat=0;
      prizes.reverse().forEach(function(s){
        var base=Math.floor(s.premi/c.n*100)/100, sob=Math.round((s.premi-base*c.n)*100)/100;
        if(s.repartit) cobrat+=base;
        h.push('<div class="splitrow"><div class="splittop"><span class="when">'+esc(fmtDate(s.data))+
          '</span><span class="tot green">+'+eur(s.premi)+'</span></div>');
        if(s.repartit){
          h.push('<div class="people">');
          state.membres.forEach(function(m){ h.push('<span class="person">'+esc(m)+'<span class="pv">'+eur(base)+'</span></span>'); });
          h.push('</div>');
          if(sob>0) h.push('<span class="rest">Sobren '+eur(sob)+' de cèntims: queden a la caixa.</span>');
        }else{
          h.push('<span class="rest">Es queda a la caixa · serien '+eur(base)+' per persona si es repartís.</span>');
        }
        h.push('</div>');
      });
      if(cobrat>0) h.push('<div class="splittop"><span class="when">Total cobrat per persona</span><span class="tot green">'+eur(cobrat)+'</span></div>');
    }
    h.push('</section>');

    if(state.membres.length){
      var per={}; state.membres.forEach(function(m){ per[m]=0; });
      state.aportacions.forEach(function(a){ if(per[a.membre]!==undefined) per[a.membre]+=a["import"]; });
      h.push('<div class="sechead"><h2>La penya</h2><span class="note">ha posat cadascú</span></div>');
      h.push('<section class="card split"><div class="people">');
      state.membres.forEach(function(m){ h.push('<span class="person">'+esc(m)+'<span class="pv">'+eur(per[m])+'</span></span>'); });
      h.push('</div></section>');
    }

    h.push('<footer class="note">Aquesta pàgina és només per mirar i sempre ensenya l’últim apunt.'+
      (quan?'<br>Comptes refrescats a les '+pad(quan.getHours())+":"+pad(quan.getMinutes()):"")+'</footer>');
    return h.join("");
  }

  /* ---------- engegar ---------- */

  carregar();

  // Tornar a la pestanya ja refresca: qui la deixa oberta al mobil no s'ha de
  // quedar amb els comptes de fa tres dies.
  document.addEventListener("visibilitychange",function(){
    if(!document.hidden) carregar();
  });
})();
