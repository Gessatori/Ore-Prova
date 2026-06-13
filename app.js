
const $ = id => document.getElementById(id);
const cfg = window.TECNOPLAFON_CONFIG || {};
let db = null, session = null, cache = {collab:[], cantieri:[], lavorazioni:[], sotto:[]};

function initDb(){
  if(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.includes('INSERISCI')){
    db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }
  try{ session = JSON.parse(localStorage.getItem('tp_session') || 'null'); }catch(e){ session=null; }
}
function msg(el, text, type='success'){ if(!el) return; el.innerHTML = `<div class="${type}">${escapeHtml(text)}</div>`; }
function fmt(v){ return (v===null||v===undefined||v==='') ? '-' : Number(v).toLocaleString('it-CH',{minimumFractionDigits:0,maximumFractionDigits:2}); }

// Ore corrette: usare centesimi di ora (.50 = mezz'ora).
// Se qualcuno scrive il vecchio formato tipo 8.30, 8,30 o 8.3,
// il gestionale lo converte in 8.50 prima di salvare o sommare.
function oreToDecimal(v){
  if(v===null || v===undefined || v==='') return 0;
  const raw = String(v).trim().replace(',', '.');
  if(!raw) return 0;
  const neg = raw.startsWith('-');
  const clean = raw.replace('-', '');
  const parts = clean.split('.');
  let n = Number(raw);
  if(parts.length === 2){
    const h = Number(parts[0] || 0);
    const decTxt = parts[1];
    // 8.3 deve significare 8.30 minuti, quindi 8.50 decimale
    const min = decTxt.length === 1 ? Number(decTxt) * 10 : Number(decTxt);
    if([15,30,45].includes(min)){
      n = h + (min / 60);
      if(neg) n = -n;
    }
  } else if(Number.isFinite(n)) {
    const h = Math.trunc(Math.abs(n));
    const frac = Math.round((Math.abs(n) - h) * 100);
    if([15,30,45].includes(frac)){
      n = h + (frac / 60);
      if(v < 0) n = -n;
    }
  }
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
function fmtOre(v){
  if(v===null || v===undefined || v==='') return '-';
  return oreToDecimal(v).toFixed(2);
}
function normalizzaCampoOre(id){
  const x = $(id);
  if(x && x.value !== '') x.value = fmtOre(x.value);
}
function installOreAutoNormalize(){
  ['oreTot','admOreTot','reqOre','regOre','regMaxOre','regMeseOre','regMeseOreGiorno','regOreLunGio','regOreVenerdi','regOrePrefestivo','festivoOre','periodoOreLunGio','periodoOreVenerdi','periodoOrePrefestivo','manualOre','manualMaxOre','vacSaldoIniziale','vacOreAnnue'].forEach(id=>{
    const x = $(id);
    if(x && !x.dataset.oreNormalize){
      x.dataset.oreNormalize = '1';
      x.addEventListener('change',()=>normalizzaCampoOre(id));
      x.addEventListener('blur',()=>normalizzaCampoOre(id));
    }
  });
}


// Inserimento ore con voce: compila i campi, ma non salva automaticamente.
// Funziona nei browser che supportano SpeechRecognition / webkitSpeechRecognition.
function tpNormText(v){
  return String(v ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s\.\,]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function tpNumberWordToValue(w){
  const map = {
    'zero':0,'uno':1,'una':1,'due':2,'tre':3,'quattro':4,'cinque':5,'sei':6,'sette':7,'otto':8,'nove':9,'dieci':10,
    'undici':11,'dodici':12,'tredici':13,'quattordici':14,'quindici':15,'sedici':16,'diciassette':17,'diciotto':18,'diciannove':19,'venti':20
  };
  return Object.prototype.hasOwnProperty.call(map,w) ? map[w] : null;
}
function tpParseOreDaVoce(text){
  const t = tpNormText(text).replace(/,/g,'.');
  let m = t.match(/(\d+(?:\.\d+)?)\s*(?:ore|ora|h)\s*(?:e\s*)?(?:mezza|mezzo|30|trenta)?/);
  if(m){
    let ore = oreToDecimal(m[1]);
    if(/(?:ore|ora|h)\s*e\s*(?:mezza|mezzo|30|trenta)/.test(t.slice(m.index))) ore = Math.trunc(ore) + 0.5;
    return Math.round(ore * 100) / 100;
  }
  m = t.match(/(zero|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|tredici|quattordici|quindici|sedici|diciassette|diciotto|diciannove|venti)\s*(?:ore|ora|h)\s*(?:e\s*)?(?:mezza|mezzo|30|trenta)?/);
  if(m){
    let ore = tpNumberWordToValue(m[1]) || 0;
    if(/(?:ore|ora|h)\s*e\s*(?:mezza|mezzo|30|trenta)/.test(t.slice(m.index))) ore += 0.5;
    return Math.round(ore * 100) / 100;
  }
  m = t.match(/(?:mezza giornata|mezzo giorno)/);
  if(m) return 4;
  m = t.match(/(\d+(?:\.\d+)?)/);
  return m ? oreToDecimal(m[1]) : 0;
}
function tpBestMatchFromList(text, rows, labelFn){
  const nt = tpNormText(text);
  let best = null;
  let bestScore = 0;
  (rows || []).forEach(r=>{
    const lab = tpNormText(labelFn(r));
    if(!lab) return;
    const words = lab.split(' ').filter(w=>w.length >= 3);
    let score = 0;
    if(nt.includes(lab)) score += 100;
    words.forEach(w=>{ if(nt.includes(w)) score += Math.min(20, w.length * 2); });
    if(String(r.codice || '') && nt.includes(tpNormText(r.codice))) score += 30;
    if(score > bestScore){ bestScore = score; best = r; }
  });
  return bestScore > 0 ? best : null;
}
function tpSetSelectValue(id, value){
  const el = $(id);
  if(!el || value===null || value===undefined || value==='') return false;
  el.value = String(value);
  el.dispatchEvent(new Event('change'));
  return true;
}
function tpEstraiNotaVoce(text){
  const m = String(text || '').match(/(?:nota|note|descrizione|descrittivo)\s+(.+)$/i);
  return m ? m[1].trim() : '';
}
function tpCompilaOreDaVoce(text, prefisso){
  const isAdmin = prefisso === 'adm';
  const ids = isAdmin ? {
    cantiere:'admOreCantiere', lav:'admOreLav', sotto:'admOreSotto', ore:'admOreTot', note:'admOreNote', msg:'admOreMsg'
  } : {
    cantiere:'oreCantiere', lav:'oreLav', sotto:'oreSotto', ore:'oreTot', note:'oreNote', msg:'oreMsg'
  };

  const cantiere = tpBestMatchFromList(text, (cache.cantieri||[]).filter(c=>c.stato==='attivo'), c=>`${c.codice||''} ${c.nome||''} ${c.localita||''}`);
  const lav = tpBestMatchFromList(text, (cache.lavorazioni||[]).filter(l=>l.stato==='attivo'), l=>l.nome||'');
  const sottoList = lav ? (cache.sotto||[]).filter(s=>String(s.lavorazione_id)===String(lav.id) && s.stato==='attivo') : (cache.sotto||[]).filter(s=>s.stato==='attivo');
  const sotto = tpBestMatchFromList(text, sottoList, s=>s.nome||'');
  const ore = tpParseOreDaVoce(text);
  const nota = tpEstraiNotaVoce(text);

  if(cantiere) tpSetSelectValue(ids.cantiere, cantiere.id);
  if(lav) tpSetSelectValue(ids.lav, lav.id);
  // dopo il cambio lavorazione il select sotto-lavorazione viene ricaricato
  setTimeout(()=>{ if(sotto) tpSetSelectValue(ids.sotto, sotto.id); }, 80);
  if(ore > 0 && $(ids.ore)) $(ids.ore).value = fmtOre(ore);
  if(nota && $(ids.note)) $(ids.note).value = nota;

  const parti = [];
  parti.push(cantiere ? `cantiere: ${cantiere.nome || cantiere.codice}` : 'cantiere non riconosciuto');
  parti.push(lav ? `lavorazione: ${lav.nome}` : 'lavorazione non riconosciuta');
  parti.push(sotto ? `sotto-lavorazione: ${sotto.nome}` : 'sotto-lavorazione non riconosciuta');
  parti.push(ore > 0 ? `ore: ${fmtOre(ore)}` : 'ore non riconosciute');
  if(nota) parti.push(`note: ${nota}`);
  msg($(ids.msg), `Voce caricata. Controlla prima di salvare: ${parti.join(' · ')}` , (cantiere && lav && sotto && ore > 0) ? 'success' : 'error');
}
function tpStartVoiceOre(prefisso){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const msgId = prefisso === 'adm' ? 'admOreMsg' : 'oreMsg';
  if(!SR){
    msg($(msgId), 'Questo browser non supporta la voce. Prova con Chrome o Safari aggiornato.', 'error');
    return;
  }
  const rec = new SR();
  rec.lang = 'it-IT';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onstart = ()=>msg($(msgId), 'Sto ascoltando... parla adesso.');
  rec.onerror = e=>msg($(msgId), 'Voce non riuscita: ' + (e.error || 'errore'), 'error');
  rec.onresult = e=>{
    const text = e.results?.[0]?.[0]?.transcript || '';
    tpCompilaOreDaVoce(text, prefisso);
  };
  rec.start();
}
function installVoiceOreButtons(){
  const addBtn = (targetId, btnId, prefisso) => {
    const target = $(targetId);
    if(!target || $(btnId)) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = btnId;
    btn.className = 'secondary';
    btn.textContent = 'Inserisci con voce';
    btn.onclick = () => tpStartVoiceOre(prefisso);
    target.insertAdjacentElement('afterend', btn);
  };
  addBtn('oreNote', 'btnVoceOreCollaboratore', 'worker');
  addBtn('admOreNote', 'btnVoceOreAdmin', 'adm');
}
window.tpStartVoiceOre = tpStartVoiceOre;
window.installVoiceOreButtons = installVoiceOreButtons;


// Voce IA collaboratore: usa la Edge Function Supabase "voce-ia-ore".
// La chiave OpenAI resta nei Secrets di Supabase e non viene mai messa nei file pubblici.
let tpIaOreLastResult = null;
function tpListaIa(rows, fieldsFn){
  return (rows || []).filter(r=>r && r.stato === 'attivo').map(r=>fieldsFn(r));
}
function tpFindByIdOrName(rows, id, nome, labelFn){
  const sid = id === null || id === undefined ? '' : String(id);
  if(sid){
    const byId = (rows || []).find(r => String(r.id) === sid);
    if(byId) return byId;
  }
  const nn = tpNormText(nome || '');
  if(nn){
    const byName = (rows || []).find(r => tpNormText(labelFn(r)).includes(nn) || nn.includes(tpNormText(labelFn(r))));
    if(byName) return byName;
  }
  return null;
}
function tpRenderIaPreview(result, testo){
  const box = $('oreIaPreview');
  if(!box) return;
  const rows = [
    ['Testo capito', testo || '-'],
    ['Cantiere', result?.cantiere_nome || '-'],
    ['Lavorazione', result?.lavorazione_nome || '-'],
    ['Sotto-lavorazione', result?.sotto_lavorazione_nome || '-'],
    ['Ore', result?.ore ? fmtOre(result.ore) : '-'],
    ['Note', result?.note || '-']
  ];
  box.innerHTML = `<div class="ia-preview">
    <h3>Risultato Voce IA</h3>
    <table>${rows.map(r=>`<tr><th>${escapeHtml(r[0])}</th><td>${escapeHtml(r[1])}</td></tr>`).join('')}</table>
    <p class="muted">Controlla i campi compilati. Se sono corretti, premi Conferma e salva ore.</p>
    <button type="button" onclick="salvaOreOggi()">Conferma e salva ore</button>
  </div>`;
}
function tpApplicaRisultatoIaOre(result, testo){
  tpIaOreLastResult = result || null;
  const activeCantieri = (cache.cantieri || []).filter(c=>c.stato === 'attivo');
  const activeLav = (cache.lavorazioni || []).filter(l=>l.stato === 'attivo');
  const cantiere = tpFindByIdOrName(activeCantieri, result?.cantiere_id, result?.cantiere_nome, c=>`${c.codice||''} ${c.nome||''} ${c.localita||''}`);
  const lav = tpFindByIdOrName(activeLav, result?.lavorazione_id, result?.lavorazione_nome, l=>l.nome||'');
  if(cantiere) tpSetSelectValue('oreCantiere', cantiere.id);
  if(lav) tpSetSelectValue('oreLav', lav.id);
  setTimeout(()=>{
    const sottoRows = lav ? (cache.sotto || []).filter(s=>String(s.lavorazione_id) === String(lav.id) && s.stato === 'attivo') : (cache.sotto || []).filter(s=>s.stato === 'attivo');
    const sotto = tpFindByIdOrName(sottoRows, result?.sotto_lavorazione_id, result?.sotto_lavorazione_nome, s=>s.nome||'');
    if(sotto) tpSetSelectValue('oreSotto', sotto.id);
    if(result?.ore && $('oreTot')) $('oreTot').value = fmtOre(result.ore);
    if(result?.note && $('oreNote')) $('oreNote').value = result.note;
    enhanceWorkerChoices();
    tpRenderIaPreview(result, testo);
    const ok = cantiere && lav && sotto && result?.ore;
    msg($('oreMsg'), ok ? 'Voce IA caricata. Controlla e conferma il salvataggio.' : 'Voce IA caricata, ma manca qualche campo. Controlla e completa prima di salvare.', ok ? 'success' : 'error');
  }, 120);
}
async function tpAnalizzaTestoConIaOre(testo){
  if(!requireDb()) return;
  msg($('oreMsg'), 'Sto analizzando con IA...');
  const payload = {
    testo,
    cantieri: tpListaIa(cache.cantieri, c=>({id:c.id, codice:c.codice||'', nome:c.nome||'', localita:c.localita||''})),
    lavorazioni: tpListaIa(cache.lavorazioni, l=>({id:l.id, nome:l.nome||''})),
    sotto_lavorazioni: tpListaIa(cache.sotto, s=>({id:s.id, lavorazione_id:s.lavorazione_id, nome:s.nome||''}))
  };
  const { data, error } = await db.functions.invoke('voce-ia-ore', { body: payload });
  if(error) throw error;
  if(!data || data.error) throw new Error(data?.error || 'Risposta IA vuota');
  tpApplicaRisultatoIaOre(data.result, testo);
}
function tpStartVoiceIaOre(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ msg($('oreMsg'), 'Questo browser non supporta la voce. Prova con Chrome o Safari aggiornato.', 'error'); return; }
  const rec = new SR();
  rec.lang = 'it-IT';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onstart = ()=>msg($('oreMsg'), 'Voce IA: sto ascoltando... parla normalmente.');
  rec.onerror = e=>msg($('oreMsg'), 'Voce IA non riuscita: ' + (e.error || 'errore'), 'error');
  rec.onresult = async e=>{
    const text = e.results?.[0]?.[0]?.transcript || '';
    try{ await tpAnalizzaTestoConIaOre(text); }
    catch(err){ msg($('oreMsg'), 'Errore Voce IA: ' + (err.message || err), 'error'); }
  };
  rec.start();
}
function installVoiceIaOreButton(){
  if(!document.body || document.body.dataset.page !== 'worker') return;
  const target = $('oreNote');
  if(!target || $('btnVoceIaOre')) return;
  const row = document.createElement('div');
  row.className = 'row ia-actions';
  row.innerHTML = `<button type="button" id="btnVoceIaOre">Parla con IA</button>`;
  target.insertAdjacentElement('afterend', row);
  $('btnVoceIaOre').onclick = () => tpStartVoiceIaOre();
  if(!$('oreIaPreview')){
    const box = document.createElement('div');
    box.id = 'oreIaPreview';
    box.className = 'mini-list';
    row.insertAdjacentElement('afterend', box);
  }
}
window.tpStartVoiceIaOre = tpStartVoiceIaOre;
window.tpAnalizzaTestoConIaOre = tpAnalizzaTestoConIaOre;
window.installVoiceIaOreButton = installVoiceIaOreButton;


// Richiesta materiale collaboratore + sezione admin dedicata.
// Salva su tabella Supabase richieste_materiale: niente email, notifica interna con numerino admin.
function installMaterialeWorkerUI(){
  if($('materialeBox') || !session || session.role !== 'worker') return;
  const appBox = $('appBox');
  if(!appBox) return;
  const card = document.createElement('section');
  card.id = 'materialeBox';
  card.className = 'card';
  card.innerHTML = `
    <h2>Richiesta materiale</h2>
    <p class="muted">Scrivi o detta il materiale che serve. La richiesta resta nel gestionale e l'admin la vede con il numerino delle richieste aperte.</p>
    <label>Cantiere</label>
    <select id="matCantiere"></select>
    <label>Materiale / descrizione</label>
    <textarea id="matDescrizione" rows="4" placeholder="Esempio: 20 pannelli, 2 sacchi colla, 3 scotch..."></textarea>
    <div class="row">
      <button type="button" class="secondary" onclick="tpStartVoiceMateriale()">Richiesta materiale con voce</button>
      <button type="button" onclick="salvaRichiestaMaterialeWorker()">Invia richiesta materiale</button>
    </div>
    <div id="matMsg"></div>
    <div id="matStorico" class="table-wrap"></div>`;
  const right = Array.from(appBox.querySelectorAll('.card')).find(x => (x.textContent || '').includes('Richiesta vacanza'));
  if(right) right.insertAdjacentElement('afterend', card); else appBox.appendChild(card);
  fillSelectWithBlankSafe($('matCantiere'), (cache.cantieri||[]).filter(c=>c.stato==='attivo'), r=>tpCantiereLabel(r), 'Scegli cantiere...');
  caricaMaterialeWorker();
  setTimeout(()=>enhanceSingleSelectButtons('matCantiere'), 0);
}
function tpCompilaMaterialeDaVoce(text){
  const cantiere = tpBestMatchFromList(text, (cache.cantieri||[]).filter(c=>c.stato==='attivo'), c=>`${c.codice||''} ${c.nome||''} ${c.localita||''}`);
  if(cantiere) tpSetSelectValue('matCantiere', cantiere.id);
  let desc = String(text || '').trim();
  desc = desc.replace(/^(richiesta\s+)?materiale\s*(per|a|cantiere)?\s*/i, '').trim();
  if(cantiere){
    const nome = tpNormText(`${cantiere.codice||''} ${cantiere.nome||''} ${cantiere.localita||''}`);
    // Non togliamo troppo: lasciamo la frase completa se non siamo sicuri.
  }
  if($('matDescrizione')) $('matDescrizione').value = desc || String(text || '').trim();
  msg($('matMsg'), `Voce caricata. Controlla prima di inviare${cantiere ? ': cantiere ' + (cantiere.nome || cantiere.codice) : '. Cantiere non riconosciuto.'}`, cantiere ? 'success' : 'error');
}
function tpStartVoiceMateriale(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ msg($('matMsg'), 'Questo browser non supporta la voce. Prova con Chrome o Safari aggiornato.', 'error'); return; }
  const rec = new SR();
  rec.lang = 'it-IT';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onstart = ()=>msg($('matMsg'), 'Sto ascoltando la richiesta materiale... parla adesso.');
  rec.onerror = e=>msg($('matMsg'), 'Voce non riuscita: ' + (e.error || 'errore'), 'error');
  rec.onresult = e=>{
    const text = e.results?.[0]?.[0]?.transcript || '';
    tpCompilaMaterialeDaVoce(text);
  };
  rec.start();
}
async function salvaRichiestaMaterialeWorker(){
  try{
    if(!requireDb()) return;
    const cantiereId = $('matCantiere')?.value || null;
    const materiale = ($('matDescrizione')?.value || '').trim();
    if(!materiale){ msg($('matMsg'), 'Scrivi o detta il materiale richiesto.', 'error'); return; }
    const row = {
      collaboratore_id: session.user.id,
      cantiere_id: cantiereId,
      materiale,
      stato: 'in_attesa',
      created_at: new Date().toISOString()
    };
    const saved = await q(db.from('richieste_materiale').insert(row).select('id').single());
    const cantiereTxt = ($('matCantiere')?.selectedOptions?.[0]?.textContent || '-').trim();
    const mail = await inviaNotificaEmailAdmin('materiale', {
      numero: saved?.id,
      collaboratore: `${session?.user?.cognome || ''} ${session?.user?.nome || ''}`.trim(),
      cantiere: cantiereTxt,
      materiale,
      data: todayISO()
    });
    msg($('matMsg'), mail.ok ? "Richiesta materiale salvata. Email automatica inviata all'admin." : "Richiesta materiale salvata nel gestionale. Email automatica non configurata o non inviata.");
    if($('matDescrizione')) $('matDescrizione').value = '';
    await caricaMaterialeWorker();
  }catch(e){
    msg($('matMsg'), e.message + ' - Se manca la tabella, esegui setup_richieste_materiale.sql in Supabase.', 'error');
  }
}
async function caricaMaterialeWorker(){
  const box = $('matStorico');
  if(!box || !session?.user?.id) return;
  try{
    const rows = await q(db.from('richieste_materiale').select('*,cantieri(codice,nome)').eq('collaboratore_id', session.user.id).order('created_at',{ascending:false}).limit(10));
    box.innerHTML = rows.length ? `<h3>Ultime richieste materiale</h3><table><tr><th>Data</th><th>Cantiere</th><th>Materiale</th><th>Stato</th></tr>${rows.map(r=>`<tr><td>${String(r.created_at||'').slice(0,10)}</td><td>${escapeHtml(`${r.cantieri?.codice||''} ${r.cantieri?.nome||''}`.trim() || '-')}</td><td>${escapeHtml(r.materiale||'')}</td><td>${badgeStatoMateriale(r.stato)}</td></tr>`).join('')}</table>` : '<p class="muted">Nessuna richiesta materiale.</p>';
  }catch(e){
    box.innerHTML = `<div class="error">Richieste materiale non disponibili. Esegui setup_richieste_materiale_fix.sql.</div>`;
  }
}
function badgeStatoMateriale(s){
  const cls = s==='evasa' ? 'green' : s==='annullata' ? 'red' : 'yellow';
  return `<span class="badge ${cls}">${escapeHtml(s || 'in_attesa')}</span>`;
}
async function aggiornaBadgeMaterialeAdmin(){
  const badge = $('materialeBadge');
  if(!badge || !db || session?.role !== 'admin') return;
  try{
    const { count, error } = await db.from('richieste_materiale').select('id', { count:'exact', head:true }).eq('stato','in_attesa');
    if(error) throw error;
    const n = Number(count || 0);
    badge.textContent = String(n);
    badge.style.display = n > 0 ? 'inline-flex' : 'none';
  }catch(e){
    badge.style.display = 'none';
  }
}
window.aggiornaBadgeMaterialeAdmin = aggiornaBadgeMaterialeAdmin;
async function caricaMaterialeAdmin(){
  const box = $('adminMaterialeBox');
  if(!box) return;
  try{
    const rows = await q(db.from('richieste_materiale').select('*,collaboratori(nome,cognome),cantieri(codice,nome)').order('created_at',{ascending:false}).limit(200));
    const evase = rows.filter(r => r.stato === 'evasa');
    const toolbar = rows.length ? `<div class="row" style="margin-bottom:10px">
      <button type="button" class="secondary" onclick="caricaMaterialeAdmin()">Aggiorna</button>
      <button type="button" class="ghost" onclick="eliminaMaterialeEseguito()" ${evase.length ? '' : 'disabled'}>Cancella materiale eseguito (${evase.length})</button>
    </div>` : '';
    box.innerHTML = rows.length ? `${toolbar}<table><tr><th>Data</th><th>Collaboratore</th><th>Cantiere</th><th>Materiale / descrizione</th><th>Stato</th><th>Azioni</th></tr>${rows.map(r=>{
      const canDelete = r.stato === 'evasa' || r.stato === 'annullata';
      return `<tr><td>${String(r.created_at||'').slice(0,16).replace('T',' ')}</td><td>${escapeHtml(`${r.collaboratori?.cognome||''} ${r.collaboratori?.nome||''}`.trim())}</td><td>${escapeHtml(`${r.cantieri?.codice||''} ${r.cantieri?.nome||''}`.trim() || '-')}</td><td>${escapeHtml(r.materiale||'')}</td><td>${badgeStatoMateriale(r.stato)}</td><td><button onclick="setRichiestaMateriale('${r.id}','evasa')">Evasa</button> <button class="secondary" onclick="setRichiestaMateriale('${r.id}','in_attesa')">In attesa</button> <button class="ghost" onclick="setRichiestaMateriale('${r.id}','annullata')">Annulla</button>${canDelete ? ` <button class="ghost" onclick="eliminaRichiestaMateriale('${r.id}')">Cancella</button>` : ''}</td></tr>`;
    }).join('')}</table>` : '<p class="muted">Nessuna richiesta materiale.</p>';
    msg($('adminMaterialeMsg'), 'Richieste materiale caricate.');
    await aggiornaBadgeMaterialeAdmin();
  }catch(e){
    box.innerHTML = `<div class="error">${escapeHtml(e.message)}<br>Esegui setup_richieste_materiale_fix.sql in Supabase.</div>`;
  }
}
async function setRichiestaMateriale(id, stato){
  try{
    await q(db.from('richieste_materiale').update({stato, updated_at:new Date().toISOString()}).eq('id', id));
    await caricaMaterialeAdmin();
    await aggiornaBadgeMaterialeAdmin();
  }catch(e){ msg($('adminMaterialeMsg'), e.message, 'error'); }
}
async function eliminaRichiestaMateriale(id){
  try{
    if(!confirm('Vuoi cancellare definitivamente questa richiesta materiale eseguita?')) return;
    await q(db.from('richieste_materiale').delete().eq('id', id));
    msg($('adminMaterialeMsg'), 'Richiesta materiale cancellata.');
    await caricaMaterialeAdmin();
    await aggiornaBadgeMaterialeAdmin();
  }catch(e){
    msg($('adminMaterialeMsg'), e.message, 'error');
  }
}
async function eliminaMaterialeEseguito(){
  try{
    if(!confirm('Vuoi cancellare definitivamente tutte le richieste materiale segnate come evase?')) return;
    await q(db.from('richieste_materiale').delete().eq('stato', 'evasa'));
    msg($('adminMaterialeMsg'), 'Materiale eseguito cancellato.');
    await caricaMaterialeAdmin();
    await aggiornaBadgeMaterialeAdmin();
  }catch(e){
    msg($('adminMaterialeMsg'), e.message, 'error');
  }
}
window.installMaterialeWorkerUI = installMaterialeWorkerUI;
window.tpStartVoiceMateriale = tpStartVoiceMateriale;
window.salvaRichiestaMaterialeWorker = salvaRichiestaMaterialeWorker;
window.caricaMaterialeAdmin = caricaMaterialeAdmin;
window.setRichiestaMateriale = setRichiestaMateriale;
window.eliminaRichiestaMateriale = eliminaRichiestaMateriale;
window.eliminaMaterialeEseguito = eliminaMaterialeEseguito;



// UI collaboratore: trasforma i menu a tendina in scelte eleganti a chip.
// I select originali restano presenti e vengono aggiornati: il codice esistente continua a funzionare uguale.
const TP_WORKER_SELECT_LABELS = {
  oreCantiere: 'Scegli cantiere',
  oreLav: 'Scegli lavorazione',
  oreSotto: 'Scegli sotto-lavorazione',
  reqTipo: 'Scegli tipo richiesta',
  matCantiere: 'Scegli cantiere materiale',
  myMese: 'Scegli mese'
};
function tpShortChoiceText(txt){
  return String(txt || '').replace(/\s+/g,' ').trim();
}
function enhanceSingleSelectButtons(selectId){
  const sel = $(selectId);
  if(!sel || !document.body || document.body.dataset.page !== 'worker') return;
  sel.classList.add('tp-original-select');
  let box = $(selectId + 'Buttons');
  if(!box){
    box = document.createElement('div');
    box.id = selectId + 'Buttons';
    box.className = 'choice-buttons';
    sel.insertAdjacentElement('afterend', box);
  }

  const options = Array.from(sel.options || []);
  const realOptions = options.filter(o => String(o.value || '') !== '');
  const searchId = selectId + 'ChoiceSearch';
  const goId = selectId + 'ChoiceGo';
  const oldSearch = $(searchId);
  const searchText = oldSearch ? oldSearch.value : '';

  if(!realOptions.length){
    box.innerHTML = `<div class="choice-empty">${selectId==='oreSotto' ? 'Prima scegli la lavorazione.' : 'Nessuna scelta disponibile.'}</div>`;
    return;
  }

  const current = String(sel.value || '');
  const q = tpNormText(searchText);
  const words = q.split(' ').filter(Boolean);

  const scoreOption = (option) => {
    const txt = tpNormText(option.textContent);
    if(!q) return 1;
    let score = 0;
    if(txt === q) score += 1000;
    if(txt.startsWith(q)) score += 700;
    if(txt.includes(q)) score += 350;
    words.forEach(w => {
      if(txt.startsWith(w)) score += 140;
      else if(txt.includes(w)) score += 70;
    });
    return score;
  };

  const filteredOptions = q
    ? realOptions.map(o => ({option:o, score:scoreOption(o)})).filter(x => x.score > 0).sort((a,b)=>b.score-a.score).map(x=>x.option)
    : realOptions;

  const firstValue = filteredOptions[0] ? String(filteredOptions[0].value) : '';
  const selectedOption = realOptions.find(o => String(o.value) === current);
  const selectedText = selectedOption ? tpShortChoiceText(selectedOption.textContent) : '';
  const selectedTextNorm = tpNormText(selectedText);
  const sceltaGiaConfermata = !!(selectedOption && q && selectedTextNorm === q);

  const helperHtml = q
    ? (firstValue
        ? (sceltaGiaConfermata
            ? `<div class="choice-selected">Scelta inserita nella ricerca: <b>${escapeHtml(selectedText)}</b></div>`
            : `<div class="choice-selected">Menu a tendina aperto: tocca il nome corretto.</div>`)
        : '<div class="choice-no-results">Nessun risultato trovato.</div>')
    : (selectedOption
        ? `<div class="choice-selected">Selezionato: <b>${escapeHtml(selectedText)}</b></div>`
        : '<div class="choice-selected muted">Scrivi nella riga di ricerca: sotto si apre il menu a tendina.</div>');

  const suggestionHtml = q && filteredOptions.length && !sceltaGiaConfermata
    ? `<div class="choice-suggestions choice-dropdown">${filteredOptions.slice(0, 12).map(o => `
        <button type="button" class="choice-suggestion ${String(o.value) === current ? 'active' : ''}" data-value="${escapeHtml(o.value)}">
          <span class="choice-suggestion-main">${escapeHtml(tpShortChoiceText(o.textContent))}</span>
        </button>`).join('')}</div>`
    : '';

  const searchHtml = `
    <div class="choice-search-row">
      <input id="${searchId}" class="choice-search" type="search" placeholder="Scrivi qui e scegli dalla tendina..." value="${escapeHtml(searchText)}" autocomplete="off">
    </div>`;

  box.innerHTML = `${searchHtml}${suggestionHtml}${helperHtml}`;

  const chooseValue = (value, labelText) => {
    if(!value) return;
    const chosen = realOptions.find(o => String(o.value) === String(value));
    const chosenText = tpShortChoiceText(labelText || chosen?.textContent || '');
    const currentSearch = $(searchId);
    if(currentSearch && chosenText) currentSearch.value = chosenText;
    sel.value = String(value);
    sel.dispatchEvent(new Event('change', {bubbles:true}));
    enhanceSingleSelectButtons(selectId);
    const freshSearch = $(searchId);
    if(freshSearch && chosenText){
      freshSearch.value = chosenText;
      freshSearch.focus();
      freshSearch.setSelectionRange(chosenText.length, chosenText.length);
    }
    if(selectId === 'oreLav') setTimeout(()=>enhanceSingleSelectButtons('oreSotto'), 0);
  };

  const search = $(searchId);
  if(search){
    search.oninput = () => {
      const pos = search.selectionStart || search.value.length;
      enhanceSingleSelectButtons(selectId);
      const fresh = $(searchId);
      if(fresh){ fresh.focus(); fresh.setSelectionRange(pos, pos); }
    };
    search.onkeydown = (ev) => {
      if(ev.key === 'Enter'){
        ev.preventDefault();
        const freshQ = tpNormText(search.value);
        const freshWords = freshQ.split(' ').filter(Boolean);
        const scored = realOptions.map(o => {
          const txt = tpNormText(o.textContent);
          let score = 0;
          if(txt === freshQ) score += 1000;
          if(txt.startsWith(freshQ)) score += 700;
          if(txt.includes(freshQ)) score += 350;
          freshWords.forEach(w => score += txt.includes(w) ? 70 : 0);
          return {o, score};
        }).filter(x => !freshQ || x.score > 0).sort((a,b)=>b.score-a.score);
        const first = (freshQ ? scored.map(x=>x.o) : realOptions)[0];
        if(first) chooseValue(first.value, first.textContent);
      }
    };
  }

  box.querySelectorAll('.choice-suggestion').forEach(btn => {
    btn.onclick = () => chooseValue(btn.dataset.value, btn.querySelector('.choice-suggestion-main')?.textContent || '');
  });

}
function enhanceWorkerChoices(){
  ['oreCantiere','oreLav','oreSotto','reqTipo','matCantiere','myMese'].forEach(enhanceSingleSelectButtons);
}
window.enhanceSingleSelectButtons = enhanceSingleSelectButtons;
window.enhanceWorkerChoices = enhanceWorkerChoices;



// Home collaboratore iPhone: menu iniziale con 4 pulsanti e pagine separate.
// Non cambia salvataggi, select o struttura dati: mostra/nasconde solo le card esistenti.
function installWorkerSectionButtons(){
  if(!document.body || document.body.dataset.page !== 'worker' || $('workerHomeMenu')) return;
  const appBox = $('appBox');
  if(!appBox) return;

  const cards = Array.from(appBox.querySelectorAll('section.card'));
  const oreCard = cards.find(c => (c.textContent || '').includes('Segna ore oggi'));
  const vacCard = cards.find(c => (c.textContent || '').includes('Richiesta vacanza'));
  const richiesteCard = cards.find(c => (c.textContent || '').includes('Le mie richieste'));
  const matCard = $('materialeBox');
  const stampaCard = cards.find(c => (c.textContent || '').includes('Stampa mese personale'));

  const pages = [
    {key:'ore', title:'Segna ore oggi', sub:'Inserisci le ore lavorate', icon:'🕒', cards:[oreCard]},
    {key:'vacanze', title:'Vacanza / congedo', sub:'Richieste e storico', icon:'🌴', cards:[vacCard, richiesteCard]},
    {key:'materiale', title:'Richiesta materiale', sub:'Invia materiale necessario', icon:'📦', cards:[matCard]},
    {key:'stampa', title:'Stampa mese', sub:'Riepilogo personale', icon:'🖨️', cards:[stampaCard]}
  ].map(p => Object.assign({}, p, {cards:p.cards.filter(Boolean)})).filter(p => p.cards.length);

  pages.forEach(page => {
    page.cards.forEach(card => {
      card.classList.add('worker-page-section','hidden');
      card.dataset.workerPage = page.key;
      if(!card.querySelector('.worker-back-menu')){
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'worker-back-menu ghost';
        back.textContent = '← Torna al menu';
        back.onclick = () => showWorkerMenu();
        card.insertAdjacentElement('afterbegin', back);
      }
    });
  });

  const menu = document.createElement('section');
  menu.id = 'workerHomeMenu';
  menu.className = 'worker-home-menu card';
  menu.innerHTML = `
    <div class="worker-home-head">
      <h2>Menu collaboratore</h2>
      <p>Scegli cosa vuoi fare.</p>
    </div>
    <div class="worker-home-grid">
      ${pages.map(x => `
        <button type="button" class="worker-home-btn" data-target="${x.key}">
          <span class="worker-home-icon">${x.icon}</span>
          <span class="worker-home-text"><b>${escapeHtml(x.title)}</b><small>${escapeHtml(x.sub)}</small></span>
        </button>`).join('')}
    </div>`;

  const title = appBox.querySelector('.page-title');
  if(title) title.insertAdjacentElement('afterend', menu); else appBox.prepend(menu);

  function showWorkerMenu(){
    document.body.classList.remove('worker-page-open');
    menu.classList.remove('hidden');
    pages.forEach(page => page.cards.forEach(card => card.classList.add('hidden')));
    window.scrollTo({top:0, behavior:'smooth'});
  }

  function showWorkerPage(key){
    document.body.classList.add('worker-page-open');
    menu.classList.add('hidden');
    pages.forEach(page => page.cards.forEach(card => card.classList.toggle('hidden', page.key !== key)));
    const first = pages.find(page => page.key === key)?.cards?.[0];
    if(first) first.scrollIntoView({behavior:'smooth', block:'start'});
  }

  menu.querySelectorAll('.worker-home-btn').forEach(btn => {
    btn.onclick = () => showWorkerPage(btn.dataset.target);
  });

  window.showWorkerMenu = showWorkerMenu;
  window.showWorkerPage = showWorkerPage;
  showWorkerMenu();
}
window.installWorkerSectionButtons = installWorkerSectionButtons;

function tpDisplayText(s){ return String(s??'').replace(/cartongesso/gi, m => (m === m.toUpperCase() ? 'COSTRUZIONE A SECCO' : 'Costruzione a secco')); }
function escapeHtml(s){ return tpDisplayText(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
async function q(promise){ const {data,error}=await promise; if(error){ console.error(error); throw error; } return data; }
function requireDb(){ if(!db){ alert('Configura prima config.js con SUPABASE_URL e SUPABASE_ANON_KEY.'); return false;} return true; }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function monthName(n){ return ['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][Number(n)]||n; }
function fillMonths(el){ if(!el) return; el.innerHTML = Array.from({length:12},(_,i)=>`<option value="${i+1}">${monthName(i+1)}</option>`).join(''); el.value = new Date().getMonth()+1; }

function setDateRangeForSelectedMonth(){
  const anno = Number($('adminAnno')?.value || new Date().getFullYear());
  const mese = Number($('adminMese')?.value || (new Date().getMonth()+1));
  if(!$('filtroMeseDal') || !$('filtroMeseAl')) return;
  const start = `${anno}-${String(mese).padStart(2,'0')}-01`;
  const last = new Date(anno, mese, 0).getDate();
  const end = `${anno}-${String(mese).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
  if(!$('filtroMeseDal').value) $('filtroMeseDal').value = start;
  if(!$('filtroMeseAl').value) $('filtroMeseAl').value = end;
}

function fillSelect(el, rows, label, value='id'){ if(el) el.innerHTML='<option value="">Scegli...</option>'+rows.map(r=>`<option value="${r[value]}">${escapeHtml(label(r))}</option>`).join(''); }

function tpCantiereLabel(c){
  const parts = [];
  if(c?.codice) parts.push(c.codice);
  if(c?.nome) parts.push(c.nome);
  if(c?.cliente) parts.push('Cliente: ' + c.cliente);
  if(c?.localita) parts.push(c.localita);
  const km = Number(c?.km || 0);
  if(km) parts.push(fmt(km) + ' km');
  return parts.join(' · ');
}


// V16 - filtri safe: non toccano dashboard e non duplicano ID.
function normSearchSafe(v){
  return String(v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
}
function selectHasValueSafe(sel, value){
  return !!sel && [...(sel.options||[])].some(o=>String(o.value)===String(value));
}
function filterRowsSafe(rows, text, fieldsFn, onlyActive=false){
  const q = normSearchSafe(text);
  return (rows || []).filter(r=>{
    if(onlyActive && r.stato !== 'attivo') return false;
    if(!q) return true;
    return normSearchSafe(fieldsFn(r)).includes(q);
  });
}
function fillSelectWithBlankSafe(el, rows, label, blankLabel='Tutti'){
  if(!el) return;
  el.innerHTML = `<option value="">${blankLabel}</option>` + (rows||[]).map(r=>`<option value="${r.id}">${escapeHtml(label(r))}</option>`).join('');
}
function aggiornaFiltriAdminSafe(){
  // V17: filtri semplificati. Nessun filtro testo sui select, per evitare blocchi.
  fillSelect($('adminCollabMese'), cache.collab || [], r=>`${r.cognome} ${r.nome} (${r.stato})`);
  fillSelect($('admOreCollab'), (cache.collab || []).filter(c=>c.stato==='attivo'), r=>`${r.cognome} ${r.nome}`);
  fillSelect($('admOreCantiere'), (cache.cantieri || []).filter(c=>c.stato==='attivo'), r=>tpCantiereLabel(r));
  fillSelect($('admOreLav'), (cache.lavorazioni || []).filter(l=>l.stato==='attivo'), r=>r.nome);
  fillSelect($('admOreSotto'), cache.sotto || [], r=>r.nome);
}

function aggiornaSottoLavorazioniAdminInserimento(){
  const lavEl = $('admOreLav');
  const sottoEl = $('admOreSotto');
  if(!lavEl || !sottoEl) return;
  const lavId = lavEl.value;
  fillSelect(sottoEl, (cache.sotto || []).filter(s=>String(s.lavorazione_id)===String(lavId) && s.stato==='attivo'), r=>r.nome);
}
window.aggiornaSottoLavorazioniAdminInserimento = aggiornaSottoLavorazioniAdminInserimento;

window.aggiornaFiltriAdminSafe=aggiornaFiltriAdminSafe;

let v16MeseRows = [], v16MeseRie = null, v16MeseTr = [], v16RegolaMese = null, v16MeseInfo = null;

function v16FiltraMeseRows(rows){
  const dal = $('filtroMeseDal')?.value || '';
  const al = $('filtroMeseAl')?.value || '';
  const txt = normSearchSafe($('filtroMeseTesto')?.value || '');

  return (rows||[]).filter(r=>{
    const day = String(r.giorno).padStart(2,'0');
    const mese = String(v16MeseInfo?.mese || $('adminMese')?.value || '').padStart(2,'0');
    const anno = String(v16MeseInfo?.anno || $('adminAnno')?.value || '');
    const data = `${anno}-${mese}-${day}`;
    const okDal = !dal || data >= dal;
    const okAl = !al || data <= al;
    const all = normSearchSafe(`${r.cantiere||''} ${r.lavorazione||''} ${r.sotto_lavorazione||''} ${r.note||''} ${r.fascia_trasferta||''} ${r.tipo_giorno_stampa||''}`);
    const okTxt = !txt || all.includes(txt);
    return okDal && okAl && okTxt;
  });
}
function v16RenderMeseTable(rows, tableEl){
  if(!tableEl) return;
  tableEl.innerHTML = `<table><tr><th>Giorno</th><th>Tipo</th><th>Cantiere</th><th>Km</th><th>Lavorazione</th><th>Sotto-lavorazione</th><th>Inizio</th><th>Pausa</th><th>Fine</th><th>Ore da fare</th><th>Ore fatte</th><th>Ore richiesta</th><th>AVS</th><th>Trasferta</th><th>Note</th></tr>`+
  rows.map(r=>`<tr><td>${String(r.giorno).padStart(2,'0')} ${r.giorno_settimana}</td><td>${escapeHtml(r.tipo_giorno_stampa)}</td><td>${escapeHtml(r.cantiere||'-')}</td><td>${r.km??'-'}</td><td>${escapeHtml(r.lavorazione||'-')}</td><td>${escapeHtml(r.sotto_lavorazione||'-')}</td><td>${r.ora_inizio||'-'}</td><td>${r.pausa_inizio&&r.pausa_fine?`${r.pausa_inizio}-${r.pausa_fine}`:'-'}</td><td>${r.ora_fine||'-'}</td><td>${fmtOre(r.ore_da_fare)}</td><td>${fmtOre(r.ore_fatte)}</td><td>${fmtOre(oreToDecimal(r.ore_richiesta_a_ore||0)+oreToDecimal(r.ore_vacanza_richieste||0)+oreToDecimal(r.ore_vacanza_approvate||0))}</td><td>${r.avs_testo||'-'}</td><td>${escapeHtml(r.fascia_trasferta||'-')}</td><td>${escapeHtml(r.note||'')}</td></tr>`).join('')+'</table>';
}
function filtraRiepilogoMeseVisibile(){
  if(!v16MeseInfo) return;
  const filtered = v16FiltraMeseRows(v16MeseRows);
  v16RenderMeseTable(filtered, $('adminMeseBox'));
  if($('contaFiltriMeseStampa')) $('contaFiltriMeseStampa').textContent = `Mostrate ${filtered.length} righe su ${v16MeseRows.length}.`;
  renderPrintableMonthlyReport(v16MeseInfo.collabId, v16MeseInfo.anno, v16MeseInfo.mese, filtered, v16MeseRie, v16MeseTr, v16RegolaMese);
}
window.filtraRiepilogoMeseVisibile=filtraRiepilogoMeseVisibile;


const EMAIL_RICHIESTE_DESTINATARIO = 'info@tecnoplafon.ch';
async function inviaNotificaEmailAdmin(tipo, dettagli){
  try{
    if(!db || !db.functions || !db.functions.invoke) return {ok:false, skipped:true};
    const { error } = await db.functions.invoke('notifica-admin', {
      body: { tipo, destinatario: EMAIL_RICHIESTE_DESTINATARIO, dettagli }
    });
    if(error) throw error;
    return {ok:true};
  }catch(e){
    console.warn('Email automatica admin non inviata', e);
    return {ok:false, error:e};
  }
}
function testoTipoRichiesta(tipo){
  const t = String(tipo || '').replace(/_/g,' ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Richiesta';
}
function apriEmailRichiestaCollaboratore(row){
  try{
    const collaboratore = `${session?.user?.cognome || ''} ${session?.user?.nome || ''}`.trim() || 'Collaboratore';
    const tipo = testoTipoRichiesta(row.tipo);
    const ore = row.giornata_intera ? 'Giornata intera' : `${fmtOre(row.ore_richieste)} ore`;
    const descrizione = row.note || '-';
    const subject = `Richiesta ${tipo} - ${collaboratore}`;
    const body = [
      'Buongiorno,',
      '',
      'è stata inserita una nuova richiesta dal gestionale Tecnoplafon.',
      '',
      `Collaboratore: ${collaboratore}`,
      `Tipo richiesta: ${tipo}`,
      `Dal giorno: ${row.data_inizio}`,
      `Al giorno: ${row.data_fine}`,
      `Ore / giornata: ${ore}`,
      `Descrizione: ${descrizione}`,
      '',
      'Richiesta in attesa di approvazione admin.',
      '',
      'Grazie'
    ].join('\n');
    const mailto = `mailto:${EMAIL_RICHIESTE_DESTINATARIO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  }catch(e){
    console.warn('Email richiesta non aperta', e);
  }
}

function logout(){ localStorage.removeItem('tp_session'); location.href='index.html'; }
window.logout=logout;

async function loadBase(){
  cache.collab = await q(db.from('collaboratori').select('*').order('cognome'));
  cache.cantieri = await q(db.from('cantieri').select('*').order('id'));
  cache.lavorazioni = await q(db.from('lavorazioni').select('*').order('nome'));
  cache.sotto = await q(db.from('sotto_lavorazioni').select('*').order('nome'));
}

async function loginCollaboratore(){
  if(!requireDb()) return;
  const pass=$('workerPass').value.trim();
  try{
    const data=await q(db.from('collaboratori').select('*').eq('password_accesso',pass).eq('stato','attivo').maybeSingle());
    if(!data){ msg($('loginMsg'),'Password non valida o collaboratore terminato.','error'); return; }
    localStorage.setItem('tp_session', JSON.stringify({role:'worker', user:data}));
    location.reload();
  }catch(e){ msg($('loginMsg'), 'Errore login: '+e.message, 'error'); }
}
async function loginAdmin(){
  if(!requireDb()) return;
  const pass=$('adminPass').value.trim();
  try{
    const data=await q(db.from('admin_utenti').select('*').eq('password_accesso',pass).eq('attivo',true).maybeSingle());
    if(!data){ msg($('adminLoginMsg'),'Password admin non valida.','error'); return; }
    localStorage.setItem('tp_session', JSON.stringify({role:'admin', user:data}));
    location.href='admin.html';
  }catch(e){ msg($('adminLoginMsg'), 'Errore login: '+e.message, 'error'); }
}
window.loginCollaboratore=loginCollaboratore; window.loginAdmin=loginAdmin; window.oreToDecimal=oreToDecimal; window.fmtOre=fmtOre;

async function initWorker(){
  fillMonths($('myMese'));
  if(!requireDb()) return;
  await loadBase();
  if(session?.role!=='worker'){ $('loginBox').classList.remove('hidden'); return; }
  $('appBox').classList.remove('hidden');
  $('workerName').textContent = `${session.user.cognome} ${session.user.nome}`;
  $('todayLabel').textContent = new Date().toLocaleDateString('it-CH');
  $('reqDa').value=todayISO(); $('reqA').value=todayISO(); $('myAnno').value=new Date().getFullYear();
  fillSelect($('oreCantiere'), cache.cantieri.filter(c=>c.stato==='attivo'), r=>tpCantiereLabel(r));
  fillSelect($('oreLav'), cache.lavorazioni.filter(l=>l.stato==='attivo'), r=>r.nome);
  $('oreLav').addEventListener('change',()=>{ fillSelect($('oreSotto'), cache.sotto.filter(s=>s.lavorazione_id===$('oreLav').value && s.stato==='attivo'), r=>r.nome); setTimeout(()=>enhanceSingleSelectButtons('oreSotto'), 0); });
  // Voce rimossa dalla sezione ore: inserimento ore solo manuale.
  installMaterialeWorkerUI();
  installWorkerSectionButtons();
  enhanceWorkerChoices();
  setTimeout(enhanceWorkerChoices, 250);
  await caricaOreOggi(); await caricaRichiesteWorker(); await caricaSaldoVacanzeWorker();
}

async function caricaOreOggi(){
  const rows=await q(db.from('ore_lavoro').select('*,cantieri(codice,nome),lavorazioni(nome),sotto_lavorazioni(nome)').eq('collaboratore_id',session.user.id).eq('data',todayISO()).neq('stato','annullato'));
  $('oreOggiBox').innerHTML = rows.length ? `<h3>Ore già inserite oggi</h3><table><tr><th>Cantiere</th><th>Lavorazione</th><th>Ore</th><th>Note</th></tr>${rows.map(r=>`<tr><td>${escapeHtml(r.cantieri?.codice||'')} ${escapeHtml(r.cantieri?.nome||'')}</td><td>${escapeHtml(r.lavorazioni?.nome||'')} / ${escapeHtml(r.sotto_lavorazioni?.nome||'')}</td><td>${fmtOre(r.ore_totali)}</td><td>${escapeHtml(r.note||'')}</td></tr>`).join('')}</table>` : '<p class="muted">Nessuna ora inserita oggi.</p>';
}
async function salvaOreOggi(){
  try{
    const row={collaboratore_id:session.user.id,cantiere_id:$('oreCantiere').value,lavorazione_id:$('oreLav').value,sotto_lavorazione_id:$('oreSotto').value,data:todayISO(),ore_totali:oreToDecimal($('oreTot').value),note:$('oreNote').value,created_by:'collaboratore'};
    if(!row.cantiere_id || !row.lavorazione_id || !row.sotto_lavorazione_id || !row.ore_totali){ msg($('oreMsg'),'Compila cantiere, lavorazione, sotto-lavorazione e ore.','error'); return; }
    await q(db.from('ore_lavoro').insert(row));
    msg($('oreMsg'),'Ore salvate correttamente.');
    await caricaOreOggi();
  }catch(e){ msg($('oreMsg'), e.message, 'error'); }
}
window.salvaOreOggi=salvaOreOggi;

async function salvaRichiesta(){
  try{
    const row={collaboratore_id:session.user.id,tipo:$('reqTipo').value,data_inizio:$('reqDa').value,data_fine:$('reqA').value,giornata_intera:$('reqGiornata').checked,ore_richieste:$('reqGiornata').checked?null:oreToDecimal($('reqOre').value||0),note:$('reqNote').value,stato:'in_attesa'};
    const saved = await q(db.from('richieste_congedo').insert(row).select('id').single());
    const mail = await inviaNotificaEmailAdmin('vacanza_congedo', {
      numero: saved?.id,
      collaboratore: `${session?.user?.cognome || ''} ${session?.user?.nome || ''}`.trim(),
      tipo: testoTipoRichiesta(row.tipo),
      data_inizio: row.data_inizio,
      data_fine: row.data_fine,
      ore: row.giornata_intera ? 'Giornata intera' : `${fmtOre(row.ore_richieste)} ore`,
      descrizione: row.note || '-'
    });
    msg($('reqMsg'), mail.ok ? 'Richiesta salvata. Email automatica inviata all admin.' : 'Richiesta salvata nel gestionale. Email automatica non configurata o non inviata.');
    await caricaRichiesteWorker();
  }catch(e){ msg($('reqMsg'), e.message, 'error'); }
}
window.salvaRichiesta=salvaRichiesta;

async function caricaRichiesteWorker(){
  const rows=await q(db.from('richieste_congedo').select('*').eq('collaboratore_id',session.user.id).order('created_at',{ascending:false}));
  $('richiesteBox').innerHTML=renderRichiesteTable(rows,false);
}
function renderRichiesteTable(rows, admin){
  if(!rows.length) return '<p class="muted">Nessuna richiesta.</p>';
  return `<table><tr><th>Tipo</th><th>Da</th><th>A</th><th>Ore</th><th>Stato</th><th>Note</th>${admin?'<th>Azioni</th>':''}</tr>`+
  rows.map(r=>`<tr><td>${escapeHtml(r.tipo)}</td><td>${r.data_inizio}</td><td>${r.data_fine}</td><td>${r.giornata_intera?'giornata':fmtOre(r.ore_richieste)}</td><td>${badgeStato(r.stato)}</td><td>${escapeHtml(r.note||'')}</td>${admin?`<td><button onclick="setRichiesta('${r.id}','approvata')">Approva</button> <button class="secondary" onclick="setRichiesta('${r.id}','rifiutata')">Rifiuta</button></td>`:''}</tr>`).join('')+'</table>';
}
function badgeStato(s){ const cls=s==='approvata'?'green':s==='rifiutata'?'red':'yellow'; return `<span class="badge ${cls}">${escapeHtml(s)}</span>`; }

async function caricaMesePersonale(){
  await renderMese(session.user.id, $('myAnno').value, $('myMese').value, $('myRiepilogo'), $('myMeseBox'), null);
}
window.caricaMesePersonale=caricaMesePersonale;

async function initAdmin(){
  fillMonths($('adminMese'));
  if(!requireDb()) return;
  if(session?.role!=='admin'){ $('adminLoginBox').classList.remove('hidden'); return; }
  $('adminBox').classList.remove('hidden');
  await loadBase();
  $('dashDate').value=todayISO(); $('adminAnno').value=new Date().getFullYear(); $('admOreData').value=todayISO(); if($('regData')) $('regData').value=todayISO(); if($('regAnno')) $('regAnno').value=new Date().getFullYear(); fillMonths($('regMese')); fillMonths($('calMeseVista')); if($('regMese')) $('regMese').value=new Date().getMonth()+1; if($('calMeseVista')) $('calMeseVista').value=new Date().getMonth()+1;
  aggiornaFiltriAdminSafe();
  $('admOreLav')?.addEventListener('change', aggiornaSottoLavorazioniAdminInserimento);
  $('admOreData')?.addEventListener('change',()=>{ if($('admOreCollab')?.value) caricaOreAdminCollaboratore(); });
  $('admOreCollab')?.addEventListener('change',()=>{ if($('admOreCollab')?.value) caricaOreAdminCollaboratore(); });
  // Voce rimossa dalla gestione ore admin: inserimento ore solo manuale.
  await aggiornaBadgeMaterialeAdmin();
  aggiornaFiltriAdmin();
  setDateRangeForSelectedMonth();
  caricaDashboard(); caricaRichiesteAdmin(); caricaVacanzeAdmin(); caricaAnagrafiche(); caricaLavorazioni();
  if($('regMese')) await caricaRegolaMese();
  if($('regData')) await caricaRegolaGiorno();
  if($('calAnno')) { await caricaFestivi(); await caricaRegolePeriodo(); }
}

function showAdminTab(tab){
  document.querySelectorAll('.admin-tab').forEach(x=>x.classList.add('hidden'));
  $('tab-'+tab).classList.remove('hidden');
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));
  const btn=[...document.querySelectorAll('.tabs button')].find(b=>b.getAttribute('onclick')?.includes(`'${tab}'`)); if(btn) btn.classList.add('active');
  if(tab==='materiale') caricaMaterialeAdmin();
  if(tab==='regie') setTimeout(()=>inizializzaRegieFirma(),0);
  if(tab==='calendario') { caricaCalendarioAnno(); caricaRiepilogoCalendarioAnno(); }
}
window.showAdminTab=showAdminTab;

async function caricaDashboard(){
  const date=$('dashDate').value;
  const regola = await getRegolaGiorno(date);
  const tipo = regola?.tipo_giorno || 'lavorativo';
  const nonLav = isNonLavorativo(regola);
  const info = $('dayInfo');
  if(info){
    info.innerHTML = `<b>${escapeHtml(tipo)}</b> · Ore da fare: <b>${fmtOre(regola?.ore_da_fare ?? 8)}</b>${regola?.nome_festivo ? ' · '+escapeHtml(regola.nome_festivo) : ''}`;
  }
  const cols=cache.collab.filter(c=>c.stato==='attivo');
  const ore=await q(db.from('ore_lavoro').select('*').eq('data',date).neq('stato','annullato'));
  const richieste=await q(db.from('richieste_congedo').select('*').lte('data_inizio',date).gte('data_fine',date));
  $('collabStatusList').innerHTML=cols.map(c=>{
    const has=ore.some(o=>o.collaboratore_id===c.id);
    const req=richieste.find(r=>r.collaboratore_id===c.id && r.stato!=='rifiutata');
    const dot=has?'green':req?'yellow':nonLav?'gray':'red';
    const txt=has?'Ore inserite':req?`Richiesta ${req.stato}`:nonLav?'Non lavorativo':'Mancano ore';
    return `<div class="person" onclick="mostraDettaglioGiorno('${c.id}')"><span class="dot ${dot}"></span><div><b>${escapeHtml(c.cognome)} ${escapeHtml(c.nome)}</b><span>${escapeHtml(txt)}</span></div></div>`;
  }).join('');
}
window.caricaDashboard=caricaDashboard;

async function mostraDettaglioGiorno(collabId){
  const date=$('dashDate').value;
  const c=cache.collab.find(x=>x.id===collabId);
  const ore=await q(db.from('ore_lavoro').select('*,cantieri(codice,nome),lavorazioni(nome),sotto_lavorazioni(nome)').eq('data',date).eq('collaboratore_id',collabId).neq('stato','annullato'));
  $('collabDayDetail').classList.remove('hidden');
  $('collabDayDetail').innerHTML=`<h2>${escapeHtml(c.cognome)} ${escapeHtml(c.nome)} - ${date}</h2>` + (ore.length?`<table><tr><th>Cantiere</th><th>Lavorazione</th><th>Ore</th><th>Note</th><th>Azioni</th></tr>${ore.map(r=>`<tr><td>${escapeHtml(r.cantieri?.codice||'')} ${escapeHtml(r.cantieri?.nome||'')}</td><td>${escapeHtml(r.lavorazioni?.nome||'')} / ${escapeHtml(r.sotto_lavorazioni?.nome||'')}</td><td>${fmtOre(r.ore_totali)}</td><td>${escapeHtml(r.note||'')}</td><td><button class="secondary" onclick="annullaOra('${r.id}')">Annulla</button></td></tr>`).join('')}</table>`:'<p class="muted">Nessuna ora.</p>');
}
window.mostraDettaglioGiorno=mostraDettaglioGiorno;
async function annullaOra(id){ await q(db.from('ore_lavoro').update({stato:'annullato'}).eq('id',id)); caricaDashboard(); }
window.annullaOra=annullaOra;

async function adminSalvaOre(){
  try{
    const row={collaboratore_id:$('admOreCollab').value,cantiere_id:$('admOreCantiere').value,lavorazione_id:$('admOreLav').value,sotto_lavorazione_id:$('admOreSotto').value,data:$('admOreData').value,ore_totali:oreToDecimal($('admOreTot').value),note:$('admOreNote').value,created_by:'admin'};
    if(!row.collaboratore_id || !row.cantiere_id || !row.lavorazione_id || !row.sotto_lavorazione_id || !row.data || !row.ore_totali){ msg($('admOreMsg'),'Compila tutti i campi obbligatori.','error'); return; }
    await q(db.from('ore_lavoro').insert(row));
    msg($('admOreMsg'),'Ore salvate.');
    await caricaOreAdminCollaboratore();
  }catch(e){ msg($('admOreMsg'),e.message,'error'); }
}
window.adminSalvaOre=adminSalvaOre;

async function caricaOreAdminCollaboratore(){
  const box=$('admOreLista');
  if(!box) return;
  const collabId=$('admOreCollab')?.value;
  const data=$('admOreData')?.value;
  if(!collabId || !data){ box.innerHTML='<p class="muted">Seleziona collaboratore e data.</p>'; return; }
  try{
    const rows=await q(db.from('ore_lavoro').select('*,cantieri(codice,nome),lavorazioni(nome),sotto_lavorazioni(nome)').eq('collaboratore_id',collabId).eq('data',data).neq('stato','annullato').order('created_at',{ascending:true}));
    if(!rows.length){ box.innerHTML='<p class="muted">Nessuna ora caricata per questo collaboratore in questa data.</p>'; return; }
    box.innerHTML=`<table><tr><th>Ora inserimento</th><th>Cantiere</th><th>Lavorazione</th><th>Sotto-lavorazione</th><th>Ore</th><th>Note</th><th>Inserito da</th><th>Azioni</th></tr>${rows.map(r=>`<tr><td>${String(r.created_at||'').slice(0,16).replace('T',' ')}</td><td>${escapeHtml(`${r.cantieri?.codice||''} ${r.cantieri?.nome||''}`.trim())}</td><td>${escapeHtml(r.lavorazioni?.nome||'')}</td><td>${escapeHtml(r.sotto_lavorazioni?.nome||'')}</td><td>${fmtOre(r.ore_totali)}</td><td>${escapeHtml(r.note||'')}</td><td>${escapeHtml(r.created_by||'-')}</td><td><button class="secondary" onclick="annullaOraAdmin('${r.id}')">Annulla</button></td></tr>`).join('')}</table>`;
  }catch(e){ box.innerHTML=`<div class="error">${escapeHtml(e.message)}</div>`; }
}
window.caricaOreAdminCollaboratore=caricaOreAdminCollaboratore;
async function annullaOraAdmin(id){
  try{ await q(db.from('ore_lavoro').update({stato:'annullato'}).eq('id',id)); await caricaOreAdminCollaboratore(); await caricaDashboard(); }
  catch(e){ msg($('admOreMsg'),e.message,'error'); }
}
window.annullaOraAdmin=annullaOraAdmin;

async function setRichiesta(id,stato){ await q(db.from('richieste_congedo').update({stato}).eq('id',id)); caricaRichiesteAdmin(); }
window.setRichiesta=setRichiesta;
async function caricaRichiesteAdmin(){
  const rows=await q(db.from('richieste_congedo').select('*,collaboratori(nome,cognome)').order('created_at',{ascending:false}).limit(100));
  $('adminRichiesteBox').innerHTML=rows.length?`<table><tr><th>Collaboratore</th><th>Tipo</th><th>Da</th><th>A</th><th>Ore</th><th>Stato</th><th>Note</th><th>Azioni</th></tr>${rows.map(r=>`<tr><td>${escapeHtml(r.collaboratori?.cognome||'')} ${escapeHtml(r.collaboratori?.nome||'')}</td><td>${escapeHtml(r.tipo)}</td><td>${r.data_inizio}</td><td>${r.data_fine}</td><td>${r.giornata_intera?'giornata':fmtOre(r.ore_richieste)}</td><td>${badgeStato(r.stato)}</td><td>${escapeHtml(r.note||'')}</td><td><button onclick="setRichiesta('${r.id}','approvata')">Approva</button> <button class="secondary" onclick="setRichiesta('${r.id}','rifiutata')">Rifiuta</button></td></tr>`).join('')}</table>`:'<p class="muted">Nessuna richiesta.</p>';
}
window.caricaRichiesteAdmin=caricaRichiesteAdmin;

async function caricaSaldoVacanzeWorker(){
  if(!session?.user?.id || !$('workerSaldoVacanze')) return;
  try{
    const anno = new Date().getFullYear();
    const saldo = await calcolaSaldoVacanze(session.user.id, anno);
    $('workerSaldoVacanze').innerHTML = `Saldo vacanze ${anno}: <b>${fmtOre(saldo.residue)} ore residue</b> · usate/approvate ${fmtOre(saldo.usate)} ore · annue ${fmtOre(saldo.annue)} ore`;
  }catch(e){ $('workerSaldoVacanze').innerHTML = 'Saldo vacanze non disponibile: '+escapeHtml(e.message); }
}

async function calcolaSaldoVacanze(collabId, anno){
  const collab = cache.collab.find(c=>c.id===collabId) || await q(db.from('collaboratori').select('*').eq('id',collabId).maybeSingle());
  const nascita = Number(collab?.anno_nascita || 0);
  const eta = nascita ? (Number(anno) - nascita) : 0;
  const auto = collab?.vacanze_auto === false ? false : true;
  const annue = auto ? (eta >= 50 ? 240 : 200) : Number(collab?.vacanze_ore_annue || 0);
  const saldoIniziale = Number(collab?.vacanze_saldo_iniziale || 0);
  const inizio=`${anno}-01-01`, fine=`${anno}-12-31`;
  const richieste = await q(db.from('richieste_congedo').select('*').eq('collaboratore_id',collabId).eq('tipo','vacanza').eq('stato','approvata').gte('data_inizio',inizio).lte('data_inizio',fine));
  let usate = 0;
  for(const r of richieste){
    if(r.giornata_intera){
      const d1=new Date(r.data_inizio), d2=new Date(r.data_fine);
      const giorni = Math.max(1, Math.round((d2-d1)/(24*3600*1000))+1);
      usate += giorni * 8;
    }else usate += oreToDecimal(r.ore_richieste||0);
  }
  return {annue, saldoIniziale, usate, residue: saldoIniziale + annue - usate};
}

async function caricaVacanzeAdmin(){
  const box=$('vacanzeAdminBox'); if(!box) return;
  const anno=new Date().getFullYear();
  try{
    const rows=[];
    for(const c of cache.collab){ if(c.stato==='attivo'){ const s=await calcolaSaldoVacanze(c.id, anno); rows.push({c,s}); } }
    box.innerHTML=`<table><tr><th>Collaboratore</th><th>Anno nascita</th><th>Ore annue</th><th>Saldo iniziale</th><th>Usate</th><th>Residue</th><th>Auto</th></tr>${rows.map(x=>`<tr><td>${escapeHtml(x.c.cognome)} ${escapeHtml(x.c.nome)}</td><td>${x.c.anno_nascita||'-'}</td><td>${fmtOre(x.s.annue)}</td><td>${fmtOre(x.s.saldoIniziale)}</td><td>${fmtOre(x.s.usate)}</td><td><b>${fmtOre(x.s.residue)}</b></td><td>${x.c.vacanze_auto===false?'No':'Sì'}</td></tr>`).join('')}</table>`;
    fillSelect($('vacCollabSelect'), cache.collab, r=>`${r.cognome} ${r.nome}`);
  }catch(e){ box.innerHTML=`<div class="error">${escapeHtml(e.message)}</div>`; }
}
window.caricaVacanzeAdmin=caricaVacanzeAdmin;

async function caricaVacanzeCollaboratoreForm(){
  const id=$('vacCollabSelect').value; const c=cache.collab.find(x=>x.id===id); if(!c) return;
  $('vacAnnoNascita').value=c.anno_nascita||''; $('vacSaldoIniziale').value=fmtOre(c.vacanze_saldo_iniziale||0); $('vacOreAnnue').value=c.vacanze_ore_annue||''; $('vacAuto').value=String(c.vacanze_auto!==false);
}
window.caricaVacanzeCollaboratoreForm=caricaVacanzeCollaboratoreForm;
async function salvaVacanzeCollaboratore(){
  const id=$('vacCollabSelect').value; if(!id){ msg($('vacFormMsg'),'Scegli collaboratore.','error'); return; }
  try{
    await q(db.from('collaboratori').update({anno_nascita:$('vacAnnoNascita').value?Number($('vacAnnoNascita').value):null,vacanze_saldo_iniziale:oreToDecimal($('vacSaldoIniziale').value||0),vacanze_ore_annue:$('vacOreAnnue').value?oreToDecimal($('vacOreAnnue').value):null,vacanze_auto:$('vacAuto').value==='true'}).eq('id',id));
    msg($('vacFormMsg'),'Dati vacanze salvati.');
    await loadBase(); await caricaVacanzeAdmin();
  }catch(e){ msg($('vacFormMsg'),e.message,'error'); }
}
window.salvaVacanzeCollaboratore=salvaVacanzeCollaboratore;

function setMyMonthDefaults(){ fillMonths($('myMese')); }

async function renderMese(collabId, anno, mese, riepilogoEl, tableEl, extraEl){
  const first=`${anno}-${String(mese).padStart(2,'0')}-01`;
  const lastDay=new Date(Number(anno),Number(mese),0).getDate();
  const last=`${anno}-${String(mese).padStart(2,'0')}-${lastDay}`;
  const collab = cache.collab.find(c=>c.id===collabId);
  const ore=await q(db.from('ore_lavoro').select('*,cantieri(codice,nome,km),lavorazioni(nome),sotto_lavorazioni(nome)').eq('collaboratore_id',collabId).gte('data',first).lte('data',last).neq('stato','annullato'));
  const richieste=await q(db.from('richieste_congedo').select('*').eq('collaboratore_id',collabId).lte('data_inizio',last).gte('data_fine',first));
  const regole = await q(db.from('calendario_giorni').select('*').gte('data',first).lte('data',last));
  const regolaMese = await q(db.from('regole_mensili').select('*').eq('anno',Number(anno)).eq('mese',Number(mese)).maybeSingle());
  const vacSaldo = await calcolaSaldoVacanze(collabId, Number(anno));

  const rows=[];
  let oreFatte=0, oreDaFare=0, oreRich=0, oreVacAppr=0, oreVacPend=0, trasferte=0, avsGiorni=0, giorniLavorativi=0, oreStraordinarie=0;
  for(let d=1; d<=lastDay; d++){
    const data=`${anno}-${String(mese).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dt=new Date(data+'T00:00:00');
    const weekday=dt.getDay();
    const reg = regole.find(x=>x.data===data) || defaultRegolaGiorno(data);
    const dayOre = ore.filter(o=>o.data===data);
    const reqs = richieste.filter(r=>r.data_inizio<=data && r.data_fine>=data);
    const hasVacAppr = reqs.some(r=>r.tipo==='vacanza' && r.stato==='approvata');
    const hasVacPend = reqs.some(r=>r.tipo==='vacanza' && r.stato==='in_attesa');
    const reqOre = reqs.filter(r=>!r.giornata_intera).reduce((a,b)=>a+oreToDecimal(b.ore_richieste||0),0);
    const reqFull = reqs.filter(r=>r.giornata_intera && r.stato!=='rifiutata').length;
    const fatti = dayOre.reduce((a,b)=>a+oreToDecimal(b.ore_totali),0);
    const dafare = oreToDecimal(reg.ore_da_fare ?? (weekday===0||weekday===6?0:8));
    const trasf = getTrasfertaForDay(dayOre, Number(anno));
    const avs = getAvsForDay(dayOre, regolaMese);
    oreFatte += fatti; oreDaFare += dafare; oreRich += reqOre; trasferte += trasf.importo; if(avs) avsGiorni++;
    if(dafare>0) giorniLavorativi++;
    if(hasVacAppr) oreVacAppr += dafare;
    if(hasVacPend) oreVacPend += dafare;
    if(fatti > dafare) oreStraordinarie += (fatti - dafare);
    const cantiereTxt = dayOre.map(o=>`${o.cantieri?.codice||''} ${o.cantieri?.nome||''}`.trim()).filter(Boolean).join(' / ');
    const kmTxt = dayOre.map(o=>o.cantieri?.km).filter(v=>v!==null&&v!==undefined).join(' / ');
    const lavTxt = dayOre.map(o=>o.lavorazioni?.nome||'').filter(Boolean).join(' / ');
    const sottoTxt = dayOre.map(o=>o.sotto_lavorazioni?.nome||'').filter(Boolean).join(' / ');
    rows.push({giorno:d,giorno_settimana:['Dom','Lun','Mar','Mer','Gio','Ven','Sab'][weekday],tipo_giorno_stampa:getTipoGiornoStampa(reg, hasVacAppr, hasVacPend, reqs),data,cantiere:cantiereTxt,km:kmTxt,lavorazione:lavTxt,sotto_lavorazione:sottoTxt,ora_inizio:reg.ora_inizio,pausa_inizio:reg.pausa_inizio,pausa_fine:reg.pausa_fine,ora_fine:reg.ora_fine,ore_da_fare:dafare,ore_fatte:fatti,ore_richiesta_a_ore:reqOre,ore_vacanza_richieste:hasVacPend?dafare:0,ore_vacanza_approvate:hasVacAppr?dafare:0,trasferta_importo:trasf.importo,fascia_trasferta:trasf.descrizione,avs_testo:avs?'Sì':'No',note:dayOre.map(o=>o.note||'').filter(Boolean).join(' / ')});
  }
  const mesePrevisto = regolaMese?.ore_previste_mese ?? oreDaFare;
  riepilogoEl.innerHTML=`<div class="summary"><div class="box"><span>Ore previste mese</span><div class="big">${fmtOre(mesePrevisto)}</div></div><div class="box"><span>Ore fatte</span><div class="big">${fmtOre(oreFatte)}</div></div><div class="box"><span>Ore straordinarie</span><div class="big">${fmtOre(oreStraordinarie)}</div></div><div class="box"><span>Trasferte CHF</span><div class="big">${fmt(trasferte)}</div></div><div class="box"><span>Vacanze residue</span><div class="big">${fmtOre(vacSaldo.residue)}</div></div></div>`;
  tableEl.innerHTML=`<table><tr><th>Giorno</th><th>Tipo</th><th>Cantiere</th><th>Km</th><th>Lavorazione</th><th>Sotto-lavorazione</th><th>Inizio</th><th>Pausa</th><th>Fine</th><th>Ore da fare</th><th>Ore fatte</th><th>Ore richiesta</th><th>AVS</th><th>Trasferta</th><th>Note</th></tr>`+
  rows.map(r=>`<tr><td>${String(r.giorno).padStart(2,'0')} ${r.giorno_settimana}</td><td>${escapeHtml(r.tipo_giorno_stampa)}</td><td>${escapeHtml(r.cantiere||'-')}</td><td>${r.km||'-'}</td><td>${escapeHtml(r.lavorazione||'-')}</td><td>${escapeHtml(r.sotto_lavorazione||'-')}</td><td>${r.ora_inizio||'-'}</td><td>${r.pausa_inizio&&r.pausa_fine?`${r.pausa_inizio}-${r.pausa_fine}`:'-'}</td><td>${r.ora_fine||'-'}</td><td>${fmtOre(r.ore_da_fare)}</td><td>${fmtOre(r.ore_fatte)}</td><td>${fmtOre(r.ore_richiesta_a_ore+r.ore_vacanza_richieste+r.ore_vacanza_approvate)}</td><td>${r.avs_testo}</td><td>${escapeHtml(r.fascia_trasferta||'-')}</td><td>${escapeHtml(r.note||'')}</td></tr>`).join('')+'</table>';
  if(extraEl) renderTrasferte(rows, extraEl);
  v16MeseRows = rows; v16MeseRie = {mesePrevisto, oreFatte, oreStraordinarie, trasferte, vacSaldo}; v16MeseTr = rows; v16RegolaMese = regolaMese; v16MeseInfo = {collabId, anno, mese};
  if(typeof setDateRangeForSelectedMonth === 'function') setDateRangeForSelectedMonth();
  if(typeof filtraRiepilogoMeseVisibile === 'function' && tableEl?.id === 'adminMeseBox') filtraRiepilogoMeseVisibile();
  renderPrintableMonthlyReport(collabId, anno, mese, rows, v16MeseRie, rows, regolaMese);
}

function getTipoGiornoStampa(reg, vacAppr, vacPend, reqs){
  if(vacAppr) return 'vacanza approvata';
  if(vacPend) return 'vacanza richiesta';
  const altre = reqs.find(r=>r.stato!=='rifiutata' && r.tipo!=='vacanza');
  if(altre) return `${altre.tipo} ${altre.stato}`;
  return reg?.nome_festivo || reg?.tipo_giorno || 'lavorativo';
}
function defaultRegolaGiorno(data){
  const dt=new Date(data+'T00:00:00'); const wd=dt.getDay();
  return {data, tipo_giorno:wd===0?'domenica':wd===6?'sabato':'lavorativo', ore_da_fare:wd===0||wd===6?0:8, max_ore_inseribili:10, ora_inizio:'07:30', pausa_inizio:'12:00', pausa_fine:'13:00', ora_fine:'16:30', consenti_inserimento_ore:false};
}
function isNonLavorativo(reg){ return ['sabato','domenica','festivo','vacanza_aziendale','chiusura_aziendale'].includes(reg?.tipo_giorno) || Number(reg?.ore_da_fare||0)===0; }

async function getRegolaGiorno(data){
  try{ const r=await q(db.from('calendario_giorni').select('*').eq('data',data).maybeSingle()); return r || defaultRegolaGiorno(data); }
  catch(e){ return defaultRegolaGiorno(data); }
}

function getAvsForDay(dayOre, regolaMese){
  if(!dayOre.length || !regolaMese?.avs_regola_km_attiva) return false;
  const kms=dayOre.map(o=>Number(o.cantieri?.km||0)).filter(n=>n>0); const maxKm=Math.max(...kms,0);
  const limite=Number(regolaMese.avs_limite_km||0);
  return maxKm<=limite ? !!regolaMese.avs_applica_entro_km : !!regolaMese.avs_applica_fuori_km;
}
async function loadKmRules(anno){
  try{ return await q(db.from('regole_indennita_km').select('*').eq('anno',anno).order('km_da')); }catch(e){ return []; }
}
function findKmRule(km, rules){ return rules.find(r=>km>=Number(r.km_da) && (r.km_a===null || km<=Number(r.km_a))); }
function getTrasfertaForDay(dayOre, anno){
  const kms=dayOre.map(o=>Number(o.cantieri?.km||0)).filter(n=>n>0); const maxKm=Math.max(...kms,0);
  const bands=[{km_da:0,km_a:30,importo_chf:0,descrizione:'0-30 km'},{km_da:30.01,km_a:60,importo_chf:16,descrizione:'30-60 km'},{km_da:60.01,km_a:null,importo_chf:27,descrizione:'oltre 60 km'}];
  const r=findKmRule(maxKm,bands); return r?{importo:Number(r.importo_chf||0),descrizione:r.descrizione}:{importo:0,descrizione:'-'};
}
function renderTrasferte(rows, el){
  el.innerHTML=`<h3>Dettaglio trasferte</h3><table><tr><th>Giorno</th><th>Cantiere</th><th>Km</th><th>Fascia</th><th>Importo</th><th>AVS</th></tr>${rows.filter(r=>r.trasferta_importo>0).map(r=>`<tr><td>${r.giorno}</td><td>${escapeHtml(r.cantiere)}</td><td>${r.km}</td><td>${escapeHtml(r.fascia_trasferta)}</td><td>${fmt(r.trasferta_importo)}</td><td>${r.avs_testo}</td></tr>`).join('')}</table>`;
}

async function caricaMeseAdmin(){
  const collabId=$('adminCollabMese').value; if(!collabId){ alert('Scegli collaboratore'); return; }
  setDateRangeForSelectedMonth();
  await renderMese(collabId, $('adminAnno').value, $('adminMese').value, $('adminRiepilogo'), $('adminMeseBox'), $('adminTrasferteBox'));
}
window.caricaMeseAdmin=caricaMeseAdmin;

function renderPrintableMonthlyReport(collabId, anno, mese, rows, rie, trasferteRows, regolaMese){
  const report = $('adminPrintReport');
  if(!report) return;
  const collab = cache.collab.find(c=>c.id===collabId) || {};
  const azienda = {nome:'Tecnoplafon SA',via:'Via Cantonale 34A',cap:'6928 Manno',tel:'+41 91 605 33 33',mail:'info@tecnoplafon.ch'};
  const totaleTrasferte = (rows||[]).reduce((a,b)=>a+Number(b.trasferta_importo||0),0);
  const avsGiorni = (rows||[]).filter(r=>r.avs_testo==='Sì').length;
  const oreFatte = (rows||[]).reduce((a,b)=>a+oreToDecimal(b.ore_fatte||0),0);
  const oreDaFare = (rows||[]).reduce((a,b)=>a+oreToDecimal(b.ore_da_fare||0),0);
  const straord = Math.max(0, oreFatte-oreDaFare);
  const giorniLavorati = (rows||[]).filter(r=>oreToDecimal(r.ore_fatte)>0).length;
  const ferieApprovate = (rows||[]).reduce((a,b)=>a+oreToDecimal(b.ore_vacanza_approvate||0),0);
  const ferieRichieste = (rows||[]).reduce((a,b)=>a+oreToDecimal(b.ore_vacanza_richieste||0),0);
  report.innerHTML = `
    <div class="print-sheet">
      <div class="print-header">
        <div class="print-logo-block"><div class="print-logo-mark">TP</div><div><div class="print-logo-title">TECNOPLAFON</div><div class="print-logo-sub">GESTIONE ORE</div></div></div>
        <div class="print-header-title"><h1>Rapporto mensile ore</h1><div class="print-header-sub">${escapeHtml(monthName(mese))} ${anno}</div></div>
        <div class="print-company-info"><b>${azienda.nome}</b><br>${azienda.via}<br>${azienda.cap}<br>${azienda.tel}<br>${azienda.mail}</div>
      </div>
      <div class="print-meta-row">
        <div class="print-meta-card"><span>Collaboratore</span><b>${escapeHtml(`${collab.cognome||''} ${collab.nome||''}`.trim())}</b></div>
        <div class="print-meta-card"><span>Ore previste mese</span><b>${fmtOre(regolaMese?.ore_previste_mese ?? oreDaFare)}</b></div>
        <div class="print-meta-card"><span>Ore fatte</span><b>${fmtOre(oreFatte)}</b></div>
      </div>
      <table class="print-calendar-table"><thead><tr><th>Giorno</th><th>Tipo</th><th>Cantiere</th><th>Km</th><th>Lavorazione</th><th>Sotto-lav.</th><th>Inizio</th><th>Pausa</th><th>Fine</th><th>Da fare</th><th>Fatte</th><th>Rich.</th><th>AVS</th><th>Trasferta</th></tr></thead><tbody>
        ${(rows||[]).map(r=>{
          const cls = r.tipo_giorno_stampa?.includes('domenica')||r.tipo_giorno_stampa?.includes('sabato')?'is-weekend':r.tipo_giorno_stampa?.includes('festivo')?'is-holiday':r.tipo_giorno_stampa?.includes('vacanza')?'is-vac-richiesta':'';
          return `<tr class="${cls}"><td>${String(r.giorno).padStart(2,'0')} ${r.giorno_settimana}</td><td>${escapeHtml(r.tipo_giorno_stampa)}</td><td>${escapeHtml(r.cantiere||'-')}</td><td>${r.km||'-'}</td><td>${escapeHtml(r.lavorazione||'-')}</td><td>${escapeHtml(r.sotto_lavorazione||'-')}</td><td>${r.ora_inizio||'-'}</td><td>${r.pausa_inizio&&r.pausa_fine?`${r.pausa_inizio}-${r.pausa_fine}`:'-'}</td><td>${r.ora_fine||'-'}</td><td>${fmtOre(r.ore_da_fare)}</td><td>${fmtOre(r.ore_fatte)}</td><td>${fmtOre(oreToDecimal(r.ore_richiesta_a_ore||0)+oreToDecimal(r.ore_vacanza_richieste||0)+oreToDecimal(r.ore_vacanza_approvate||0))}</td><td>${r.avs_testo||'-'}</td><td>${escapeHtml(r.fascia_trasferta||'-')}</td></tr>`;
        }).join('')}
      </tbody></table>
      <div class="print-bottom-grid">
        <div class="print-panel"><div class="print-panel-title">Riepilogo ore</div><div class="print-summary-grid"><div class="print-summary-item"><span>Giorni lavorati</span><b>${giorniLavorati}</b></div><div class="print-summary-item"><span>Ore straordinarie</span><b>${fmtOre(straord)}</b></div><div class="print-summary-item"><span>Ferie approvate</span><b>${fmtOre(ferieApprovate)}</b></div><div class="print-summary-item"><span>Ferie richieste</span><b>${fmtOre(ferieRichieste)}</b></div></div></div>
        <div class="print-panel"><div class="print-panel-title">Indennità / AVS</div><table class="print-small-table"><tr><th>Voce</th><th>Totale</th></tr><tr><td>Trasferte CHF</td><td>${fmt(totaleTrasferte)}</td></tr><tr><td>Giorni AVS</td><td>${avsGiorni}</td></tr></table></div>
        <div class="print-panel"><div class="print-panel-title">Regole applicate</div><ul class="print-rules-list"><li>Le ore sono calcolate in centesimi: 8.50 = otto ore e mezza.</li><li>Ferie e richieste approvate sono riportate nel giorno indicato.</li><li>Trasferte calcolate in base ai km del cantiere.</li></ul></div>
      </div>
      <div class="print-signatures"><div class="sig-box">Firma collaboratore<span></span></div><div class="sig-box">Data<span></span></div><div class="sig-box">Firma responsabile<span></span></div><div class="sig-box">Controllo<span></span></div></div>
    </div>`;
}

async function caricaAnagrafiche(){
  $('collabTable').innerHTML=`<table><tr><th>Nome</th><th>Password</th><th>Stato</th></tr>${cache.collab.map(c=>`<tr><td>${escapeHtml(c.cognome)} ${escapeHtml(c.nome)}</td><td>${escapeHtml(c.password_accesso||'')}</td><td>${escapeHtml(c.stato)}</td></tr>`).join('')}</table>`;
  $('cantieriTable').innerHTML=`<table><tr><th>Codice</th><th>Nome</th><th>Cliente</th><th>Località</th><th>Km</th><th>Stato</th><th>Azioni</th></tr>${cache.cantieri.map(c=>`<tr><td>${escapeHtml(c.codice||'')}</td><td>${escapeHtml(c.nome)}</td><td>${escapeHtml(c.cliente||'')}</td><td>${escapeHtml(c.localita||'')}</td><td>${fmt(c.km||0)}</td><td>${escapeHtml(c.stato)}</td><td><button class="secondary" onclick="toggleCantiere('${c.id}','${c.stato==='attivo'?'terminato':'attivo'}')">${c.stato==='attivo'?'Termina':'Riattiva'}</button></td></tr>`).join('')}</table>`;
}
window.caricaAnagrafiche=caricaAnagrafiche;
async function creaCollaboratore(){ await q(db.from('collaboratori').insert({nome:$('newColNome').value,cognome:$('newColCognome').value,password_accesso:$('newColPass').value,stato:$('newColStato').value})); await loadBase(); caricaAnagrafiche(); aggiornaFiltriAdmin(); }
async function creaCantiere(){ await q(db.from('cantieri').insert({nome:$('newCanNome').value,localita:$('newCanLocalita').value,cliente:$('newCanCliente').value,km:Number($('newCanKm').value||0),stato:$('newCanStato').value})); await loadBase(); caricaAnagrafiche(); aggiornaFiltriAdmin(); }
async function toggleCantiere(id,stato){ await q(db.from('cantieri').update({stato}).eq('id',id)); await loadBase(); caricaAnagrafiche(); aggiornaFiltriAdmin(); }
window.creaCollaboratore=creaCollaboratore; window.creaCantiere=creaCantiere; window.toggleCantiere=toggleCantiere;

async function caricaLavorazioni(){
  fillSelect($('newSottoLav'), cache.lavorazioni, r=>r.nome);
  $('lavTable').innerHTML=`<table><tr><th>Lavorazione</th><th>Sotto-lavorazioni</th></tr>${cache.lavorazioni.map(l=>`<tr><td>${escapeHtml(l.nome)}</td><td>${escapeHtml(cache.sotto.filter(s=>s.lavorazione_id===l.id).map(s=>s.nome).join(', '))}</td></tr>`).join('')}</table>`;
}
async function creaLavorazione(){ await q(db.from('lavorazioni').insert({nome:$('newLavNome').value,stato:'attivo'})); await loadBase(); caricaLavorazioni(); }
async function creaSottoLavorazione(){ await q(db.from('sotto_lavorazioni').insert({lavorazione_id:$('newSottoLav').value,nome:$('newSottoNome').value,stato:'attivo'})); await loadBase(); caricaLavorazioni(); }
window.creaLavorazione=creaLavorazione; window.creaSottoLavorazione=creaSottoLavorazione; window.caricaLavorazioni=caricaLavorazioni;

function aggiornaFiltriAdmin(){
  aggiornaFiltriAdminSafe();
  fillSelect($('regieCollaboratore'), cache.collab, r=>`${r.cognome} ${r.nome} (${r.stato})`);
  fillSelect($('regieCantiere'), cache.cantieri, r=>tpCantiereLabel(r));
  fillSelect($('regieLavorazione'), cache.lavorazioni, r=>r.nome);
  fillSelect($('regieSottoLavorazione'), cache.sotto, r=>r.nome);
  fillSelect($('vacCollabSelect'), cache.collab, r=>`${r.cognome} ${r.nome}`);
}

// Regole calendario
async function caricaRegolaGiorno(){
  const r=await getRegolaGiorno($('regData').value);
  $('regTipo').value=r.tipo_giorno||'lavorativo'; $('regNomeFestivo').value=r.nome_festivo||''; $('regInizio').value=r.ora_inizio||'07:30'; $('regPausaInizio').value=r.pausa_inizio||'12:00'; $('regPausaFine').value=r.pausa_fine||'13:00'; $('regFine').value=r.ora_fine||'16:30'; $('regOre').value=fmtOre(r.ore_da_fare??8); $('regMaxOre').value=fmtOre(r.max_ore_inseribili??10); $('regConsenti').checked=!!r.consenti_inserimento_ore; $('regNote').value=r.note_admin||'';
}
async function salvaRegolaGiorno(){
  const row={data:$('regData').value,tipo_giorno:$('regTipo').value,nome_festivo:$('regNomeFestivo').value||null,ora_inizio:$('regInizio').value,pausa_inizio:$('regPausaInizio').value,pausa_fine:$('regPausaFine').value,ora_fine:$('regFine').value,ore_da_fare:oreToDecimal($('regOre').value),max_ore_inseribili:oreToDecimal($('regMaxOre').value),consenti_inserimento_ore:$('regConsenti').checked,note_admin:$('regNote').value};
  await q(db.from('calendario_giorni').upsert(row,{onConflict:'data'})); msg($('regMsg'),'Regola salvata.');
}
function impostaGiornoLavorativo(){ $('regTipo').value='lavorativo'; $('regOre').value='8.00'; $('regMaxOre').value='10.00'; $('regConsenti').checked=false; }
function impostaGiornoNonLavorativo(){ $('regTipo').value='festivo'; $('regOre').value='0.00'; $('regMaxOre').value='0.00'; $('regConsenti').checked=false; }
window.caricaRegolaGiorno=caricaRegolaGiorno; window.salvaRegolaGiorno=salvaRegolaGiorno; window.impostaGiornoLavorativo=impostaGiornoLavorativo; window.impostaGiornoNonLavorativo=impostaGiornoNonLavorativo;

async function caricaRegolaMese(){
  const anno=Number($('regAnno').value||new Date().getFullYear()), mese=Number($('regMese').value||1);
  const r=await q(db.from('regole_mensili').select('*').eq('anno',anno).eq('mese',mese).maybeSingle());
  $('regMeseGiorni').value=r?.giorni_lavorativi??''; $('regMeseOre').value=r?.ore_previste_mese??''; $('regMeseOreGiorno').value=r?.ore_previste_giorno_default??'8.00'; $('regAvsKm').value=r?.avs_limite_km??30; $('regAvsPerc').value=r?.avs_percentuale??0.7; $('regOrarioTipo').value=r?.orario_tipo??''; $('regAvsKmAttiva').checked=!!r?.avs_regola_km_attiva; $('regAvsEntro').checked=!!r?.avs_applica_entro_km; $('regAvsFuori').checked=!!r?.avs_applica_fuori_km; $('regMeseNote').value=r?.note??'';
}
async function salvaRegolaMese(){
  const row={anno:Number($('regAnno').value),mese:Number($('regMese').value),giorni_lavorativi:Number($('regMeseGiorni').value||0),ore_previste_mese:oreToDecimal($('regMeseOre').value||0),ore_previste_giorno_default:oreToDecimal($('regMeseOreGiorno').value||8),avs_regola_km_attiva:$('regAvsKmAttiva').checked,avs_limite_km:Number($('regAvsKm').value||30),avs_applica_entro_km:$('regAvsEntro').checked,avs_applica_fuori_km:$('regAvsFuori').checked,avs_percentuale:Number($('regAvsPerc').value||0.7),orario_tipo:$('regOrarioTipo').value,note:$('regMeseNote').value};
  await q(db.from('regole_mensili').upsert(row,{onConflict:'anno,mese'})); msg($('regMeseMsg'),'Regola mese salvata.');
}
window.caricaRegolaMese=caricaRegolaMese; window.salvaRegolaMese=salvaRegolaMese;

async function caricaKmRules(){ try{ const rows=await q(db.from('regole_indennita_km').select('*').order('km_da')); $('regKmBox').innerHTML=rows.length?`<table><tr><th>Anno</th><th>Da</th><th>A</th><th>CHF</th><th>Descrizione</th></tr>${rows.map(r=>`<tr><td>${r.anno}</td><td>${r.km_da}</td><td>${r.km_a??'oltre'}</td><td>${fmt(r.importo_chf)}</td><td>${escapeHtml(r.descrizione||'')}</td></tr>`).join('')}</table>`:'<p class="muted">Nessuna fascia km.</p>'; }catch(e){} }
async function salvaRegolaKm(){ const row={anno:Number($('kmAnno').value),km_da:Number($('kmDa').value),km_a:$('kmA').value?Number($('kmA').value):null,importo_chf:Number($('kmImporto').value),descrizione:$('kmDesc').value}; await q(db.from('regole_indennita_km').insert(row)); msg($('kmMsg'),'Fascia salvata.'); caricaKmRules(); }
window.salvaRegolaKm=salvaRegolaKm;

// Calendario annuale
async function creaCalendarioAnno(){
  const anno=Number($('calAnno').value); const rows=[];
  for(let m=1;m<=12;m++){ const last=new Date(anno,m,0).getDate(); for(let d=1;d<=last;d++){ const data=`${anno}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; rows.push(defaultRegolaGiorno(data)); } }
  await q(db.from('calendario_giorni').upsert(rows,{onConflict:'data'})); msg($('calMsg'),'Calendario creato.'); caricaCalendarioAnno();
}
async function eliminaCalendarioAnno(){ if(!confirm('Eliminare calendario anno?')) return; const anno=String($('calAnno').value); await q(db.from('calendario_giorni').delete().gte('data',anno+'-01-01').lte('data',anno+'-12-31')); msg($('calMsg'),'Calendario eliminato.'); }
async function caricaCalendarioAnno(){
  const anno=String($('calAnno').value||new Date().getFullYear()); const mese=String($('calMeseVista')?.value||new Date().getMonth()+1).padStart(2,'0');
  const rows=await q(db.from('calendario_giorni').select('*').gte('data',`${anno}-${mese}-01`).lte('data',`${anno}-${mese}-31`).order('data'));
  const box=$('calGiorniBox'); if(!box) return;
  box.innerHTML=rows.length?`<table><tr><th>Data</th><th>Tipo</th><th>Nome</th><th>Ore</th><th>Max</th><th>Orario</th><th>Consenti</th><th>Note</th></tr>${rows.map(r=>`<tr class="${r.tipo_giorno==='sabato'||r.tipo_giorno==='domenica'?'cal-weekend':r.tipo_giorno==='festivo'?'cal-festivo':r.tipo_giorno==='giorno_speciale'?'cal-speciale':''}"><td>${r.data}</td><td>${escapeHtml(r.tipo_giorno)}</td><td>${escapeHtml(r.nome_festivo||'')}</td><td>${fmtOre(r.ore_da_fare)}</td><td>${fmtOre(r.max_ore_inseribili)}</td><td>${r.ora_inizio||''} ${r.pausa_inizio||''}-${r.pausa_fine||''} ${r.ora_fine||''}</td><td>${r.consenti_inserimento_ore?'Sì':'No'}</td><td>${escapeHtml(r.note_admin||'')}</td></tr>`).join('')}</table>`:'<p class="muted">Nessun calendario.</p>';
}
async function caricaRiepilogoCalendarioAnno(){
  const anno=String($('calAnno').value||new Date().getFullYear()); const rows=await q(db.from('calendario_giorni').select('*').gte('data',anno+'-01-01').lte('data',anno+'-12-31'));
  const by={}; rows.forEach(r=>{ const m=r.data.slice(5,7); by[m]=by[m]||{giorni:0,ore:0}; if(Number(r.ore_da_fare)>0){by[m].giorni++; by[m].ore+=oreToDecimal(r.ore_da_fare);} });
  $('calRiepilogoBox').innerHTML=`<table><tr><th>Mese</th><th>Giorni lavorativi</th><th>Ore da fare</th></tr>${Array.from({length:12},(_,i)=>{ const m=String(i+1).padStart(2,'0'); return `<tr><td>${monthName(i+1)}</td><td>${by[m]?.giorni||0}</td><td>${fmtOre(by[m]?.ore||0)}</td></tr>`; }).join('')}</table>`;
}
window.creaCalendarioAnno=creaCalendarioAnno; window.eliminaCalendarioAnno=eliminaCalendarioAnno; window.caricaCalendarioAnno=caricaCalendarioAnno; window.caricaRiepilogoCalendarioAnno=caricaRiepilogoCalendarioAnno;

async function salvaFestivo(){
  const data=$('festivoData').value; if(!data) return;
  const row={...defaultRegolaGiorno(data), data, tipo_giorno:'festivo', nome_festivo:$('festivoNome').value, ore_da_fare:oreToDecimal($('festivoOre').value||0), max_ore_inseribili:oreToDecimal($('festivoOre').value||0), consenti_inserimento_ore:$('festivoConsenti').value==='true'};
  await q(db.from('calendario_giorni').upsert(row,{onConflict:'data'})); msg($('festivoMsg'),'Festivo salvato.'); caricaFestivi();
}
async function caricaFestivi(){ try{ const rows=await q(db.from('calendario_giorni').select('*').eq('tipo_giorno','festivo').order('data')); $('festiviBox').innerHTML=rows.length?`<table><tr><th>Data</th><th>Nome</th><th>Ore</th><th>Consenti</th></tr>${rows.map(r=>`<tr><td>${r.data}</td><td>${escapeHtml(r.nome_festivo||'')}</td><td>${fmtOre(r.ore_da_fare)}</td><td>${r.consenti_inserimento_ore?'Sì':'No'}</td></tr>`).join('')}</table>`:'<p class="muted">Nessun festivo.</p>'; }catch(e){} }
window.salvaFestivo=salvaFestivo; window.caricaFestivi=caricaFestivi;

function presetPeriodoInverno(){ $('periodoNome').value='Orario inverno'; $('periodoTipo').value='normale'; $('periodoOreLunGio').value='8.00'; $('periodoOreVenerdi').value='7.50'; $('periodoOrePrefestivo').value='7.50'; $('periodoInizio').value='07:30'; $('periodoPausaInizio').value='12:00'; $('periodoPausaFine').value='13:00'; $('periodoFineLunGio').value='16:30'; $('periodoFineVenerdi').value='16:00'; $('periodoFinePrefestivo').value='16:00'; }
function presetPeriodoEstivo(){ $('periodoNome').value='Orario estivo'; $('periodoTipo').value='estivo'; $('periodoOreLunGio').value='8.50'; $('periodoOreVenerdi').value='8.00'; $('periodoOrePrefestivo').value='8.00'; $('periodoInizio').value='07:00'; $('periodoPausaInizio').value='12:00'; $('periodoPausaFine').value='13:00'; $('periodoFineLunGio').value='16:30'; $('periodoFineVenerdi').value='16:00'; $('periodoFinePrefestivo').value='16:00'; }
window.presetPeriodoInverno=presetPeriodoInverno; window.presetPeriodoEstivo=presetPeriodoEstivo;

async function salvaRegolaPeriodo(){ const row={anno:Number($('calAnno')?.value||new Date().getFullYear()),nome:$('periodoNome').value,tipo:$('periodoTipo').value,data_da:$('periodoDa').value,data_a:$('periodoA').value,ore_lun_gio:oreToDecimal($('periodoOreLunGio').value||0),ore_venerdi:oreToDecimal($('periodoOreVenerdi').value||0),ore_prefestivo:oreToDecimal($('periodoOrePrefestivo').value||0),ora_inizio:$('periodoInizio').value,pausa_inizio:$('periodoPausaInizio').value,pausa_fine:$('periodoPausaFine').value,ora_fine_lun_gio:$('periodoFineLunGio').value,ora_fine_venerdi:$('periodoFineVenerdi').value,ora_fine_prefestivo:$('periodoFinePrefestivo').value}; await q(db.from('regole_orarie_periodi').insert(row)); msg($('periodoMsg'),'Periodo salvato.'); caricaRegolePeriodo(); }
async function caricaRegolePeriodo(){ try{ const anno=Number($('calAnno')?.value||new Date().getFullYear()); const rows=await q(db.from('regole_orarie_periodi').select('*').eq('anno',anno).order('data_da')); $('periodiBox').innerHTML=rows.length?`<table><tr><th>Nome</th><th>Da</th><th>A</th><th>Tipo</th><th>Lun-Gio</th><th>Ven</th></tr>${rows.map(r=>`<tr><td>${escapeHtml(r.nome)}</td><td>${r.data_da}</td><td>${r.data_a}</td><td>${escapeHtml(r.tipo)}</td><td>${fmtOre(r.ore_lun_gio)}</td><td>${fmtOre(r.ore_venerdi)}</td></tr>`).join('')}</table>`:'<p class="muted">Nessun periodo.</p>'; }catch(e){} }
async function applicaRegoleAnnuali(){
  const anno=Number($('calAnno')?.value||new Date().getFullYear()); const periods=await q(db.from('regole_orarie_periodi').select('*').eq('anno',anno));
  for(const p of periods){
    let d=new Date(p.data_da+'T00:00:00'), end=new Date(p.data_a+'T00:00:00');
    while(d<=end){
      const data=d.toISOString().slice(0,10); const cur=await getRegolaGiorno(data);
      if(!['festivo','giorno_speciale','chiusura_aziendale'].includes(cur.tipo_giorno)){
        const wd=d.getDay(); let ore=0, fine=p.ora_fine_lun_gio; if(wd>=1&&wd<=4){ore=p.ore_lun_gio; fine=p.ora_fine_lun_gio;} else if(wd===5){ore=p.ore_venerdi; fine=p.ora_fine_venerdi;} else {ore=0; fine='';}
        const row={...cur,data,tipo_giorno:wd===0?'domenica':wd===6?'sabato':'lavorativo',ore_da_fare:ore,max_ore_inseribili:ore,ora_inizio:ore?p.ora_inizio:null,pausa_inizio:ore?p.pausa_inizio:null,pausa_fine:ore?p.pausa_fine:null,ora_fine:ore?fine:null};
        await q(db.from('calendario_giorni').upsert(row,{onConflict:'data'}));
      }
      d.setDate(d.getDate()+1);
    }
  }
  msg($('periodoMsg'),'Regole applicate.'); caricaCalendarioAnno(); caricaRiepilogoCalendarioAnno();
}
async function eliminaTutteRegolePeriodoAnno(){ if(!confirm('Eliminare periodi?')) return; await q(db.from('regole_orarie_periodi').delete().eq('anno',Number($('calAnno')?.value||new Date().getFullYear()))); caricaRegolePeriodo(); }
window.salvaRegolaPeriodo=salvaRegolaPeriodo; window.caricaRegolePeriodo=caricaRegolePeriodo; window.applicaRegoleAnnuali=applicaRegoleAnnuali; window.eliminaTutteRegolePeriodoAnno=eliminaTutteRegolePeriodoAnno;

async function caricaGiornoManuale(){ const r=await getRegolaGiorno($('manualData').value); $('manualTipo').value=r.tipo_giorno||'lavorativo'; $('manualOre').value=fmtOre(r.ore_da_fare??0); $('manualMaxOre').value=fmtOre(r.max_ore_inseribili??0); $('manualInizio').value=r.ora_inizio||''; $('manualPausaInizio').value=r.pausa_inizio||''; $('manualPausaFine').value=r.pausa_fine||''; $('manualFine').value=r.ora_fine||''; $('manualNote').value=r.note_admin||''; $('manualConsenti').checked=!!r.consenti_inserimento_ore; }
async function salvaGiornoManuale(){ const row={data:$('manualData').value,tipo_giorno:$('manualTipo').value,ore_da_fare:oreToDecimal($('manualOre').value||0),max_ore_inseribili:oreToDecimal($('manualMaxOre').value||0),ora_inizio:$('manualInizio').value||null,pausa_inizio:$('manualPausaInizio').value||null,pausa_fine:$('manualPausaFine').value||null,ora_fine:$('manualFine').value||null,note_admin:$('manualNote').value,consenti_inserimento_ore:$('manualConsenti').checked}; await q(db.from('calendario_giorni').upsert(row,{onConflict:'data'})); msg($('manualMsg'),'Giorno salvato.'); }
window.caricaGiornoManuale=caricaGiornoManuale; window.salvaGiornoManuale=salvaGiornoManuale;

// Regie / firme
function inizializzaRegieFirma(){
  aggiornaFiltriAdmin();
  const today=todayISO();
  if(!$('regieDataDal').value) $('regieDataDal').value=today;
  if(!$('regieDataAl').value) $('regieDataAl').value=today;
}
async function cercaRegieFirma(){
  try{
    const dal=$('regieDataDal').value||'1900-01-01', al=$('regieDataAl').value||'2999-12-31';
    let rows=await q(db.from('ore_lavoro').select('*,collaboratori(nome,cognome),cantieri(codice,nome,cliente,localita),lavorazioni(nome),sotto_lavorazioni(nome)').gte('data',dal).lte('data',al).neq('stato','annullato').order('data',{ascending:true}));
    if($('regieCollaboratore').value) rows=rows.filter(r=>r.collaboratore_id===$('regieCollaboratore').value);
    if($('regieCantiere').value) rows=rows.filter(r=>r.cantiere_id===$('regieCantiere').value);
    if($('regieLavorazione').value) rows=rows.filter(r=>r.lavorazione_id===$('regieLavorazione').value);
    if($('regieSottoLavorazione').value) rows=rows.filter(r=>r.sotto_lavorazione_id===$('regieSottoLavorazione').value);
    const txt=normSearchSafe($('regieTesto').value); if(txt) rows=rows.filter(r=>normSearchSafe(`${r.note||''} ${r.cantieri?.nome||''} ${r.lavorazioni?.nome||''} ${r.sotto_lavorazioni?.nome||''}`).includes(txt));
    renderRegieRisultati(rows);
  }catch(e){ msg($('regieMsg'),e.message,'error'); }
}
function renderRegieRisultati(rows){
  const tot=rows.reduce((a,b)=>a+oreToDecimal(b.ore_totali||0),0);
  $('regieRiepilogo').innerHTML=`<div class="box"><span>Righe trovate</span><div class="big">${rows.length}</div></div><div class="box"><span>Ore totali</span><div class="big">${fmtOre(tot)}</div></div>`;
  $('regieRisultati').innerHTML=rows.length?`<table><tr><th>Data</th><th>Collaboratore</th><th>Cantiere</th><th>Lavorazione</th><th>Sotto-lavorazione</th><th>Ore</th><th>Note</th></tr>${rows.map(r=>`<tr><td>${r.data}</td><td>${escapeHtml(r.collaboratori?.cognome||'')} ${escapeHtml(r.collaboratori?.nome||'')}</td><td>${escapeHtml(`${r.cantieri?.codice||''} ${r.cantieri?.nome||''}`.trim())}</td><td>${escapeHtml(r.lavorazioni?.nome||'')}</td><td>${escapeHtml(r.sotto_lavorazioni?.nome||'')}</td><td>${fmtOre(r.ore_totali)}</td><td>${escapeHtml(r.note||'')}</td></tr>`).join('')}</table>`:'<p class="muted">Nessun risultato.</p>';
  renderRegiePrint(rows);
}
function renderRegiePrint(rows){
  const area=$('regiePrintArea'); if(!area) return;
  const group=$('regieGruppo').value;
  const groups={}; rows.forEach(r=>{ const k=group==='collaboratore'?`${r.collaboratori?.cognome} ${r.collaboratori?.nome}`:group==='cantiere'?`${r.cantieri?.codice||''} ${r.cantieri?.nome||''}`:r.data; groups[k]=groups[k]||[]; groups[k].push(r); });
  area.innerHTML=Object.entries(groups).map(([k,rs])=>`<div class="regie-group"><h2>Regie - ${escapeHtml(k)}</h2><table><tr><th>Data</th><th>Collaboratore</th><th>Cantiere</th><th>Lavorazione</th><th>Sotto-lavorazione</th><th>Ore</th><th>Note</th></tr>${rs.map(r=>`<tr><td>${r.data}</td><td>${escapeHtml(r.collaboratori?.cognome||'')} ${escapeHtml(r.collaboratori?.nome||'')}</td><td>${escapeHtml(`${r.cantieri?.codice||''} ${r.cantieri?.nome||''}`.trim())}</td><td>${escapeHtml(r.lavorazioni?.nome||'')}</td><td>${escapeHtml(r.sotto_lavorazioni?.nome||'')}</td><td>${fmtOre(r.ore_totali)}</td><td>${escapeHtml(r.note||'')}</td></tr>`).join('')}</table><div class="print-signatures"><div class="sig-box">Firma operaio / responsabile<span></span></div><div class="sig-box">Firma DL<span></span></div><div class="sig-box">Firma admin / ditta<span></span></div><div class="sig-box">Data<span></span></div></div></div>`).join('');
}
function resetRegieFirma(){ ['regieCollaboratore','regieCantiere','regieLavorazione','regieSottoLavorazione','regieTesto'].forEach(id=>{ if($(id)) $(id).value=''; }); }
window.inizializzaRegieFirma=inizializzaRegieFirma; window.cercaRegieFirma=cercaRegieFirma; window.resetRegieFirma=resetRegieFirma;

// init
initDb();
document.addEventListener('DOMContentLoaded',()=>{
  installOreAutoNormalize();
  if(document.body.dataset.page==='worker') initWorker();
  if(document.body.dataset.page==='admin') initAdmin();
});
