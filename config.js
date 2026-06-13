// CONFIGURAZIONE SUPABASE
// Chiave anon/public configurata per il progetto Tecnoplafon.
// Non inserire mai qui la service_role/secret key.
window.TECNOPLAFON_CONFIG = {
  SUPABASE_URL: "https://rmsrhtqtmcmgotgiediu.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6InJtc3JodHF0bWNtZ290Z2llZGl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MzE0OTIsImV4cCI6MjA5NjQwNzQ5Mn0.BI7C7p84cRyk83ZcKXKVPVcN5hTtbeq8z-jY8m45VA8"
};

// Miglioramento schermata Admin > Richieste materiale.
// Questo codice viene caricato da admin.html e sostituisce la tabella compatta con schede piu leggibili.
(function(){
  function ready(fn){
    if(document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(fn, 0);
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function installMaterialeAdminChiaro(){
    if(!document.body || document.body.dataset.page !== 'admin') return;
    if(window.__tpMaterialeAdminChiaroInstalled) return;
    if(typeof window.caricaMaterialeAdmin !== 'function') return;
    window.__tpMaterialeAdminChiaroInstalled = true;

    const style = document.createElement('style');
    style.id = 'tp-materiale-admin-chiaro-css';
    style.textContent = `
      #tab-materiale .materiale-toolbar{display:grid;grid-template-columns:1.4fr .8fr auto;gap:12px;align-items:end;margin:16px 0;padding:14px;border:1px solid #dbe3ef;border-radius:18px;background:#f8fafc}
      #tab-materiale .materiale-toolbar label{margin:0 0 6px 0;font-weight:800;color:#334155}
      #tab-materiale .materiale-toolbar input,#tab-materiale .materiale-toolbar select{margin:0;background:#fff}
      #tab-materiale .materiale-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:10px 0 14px}
      #tab-materiale .materiale-kpi{border-radius:18px;padding:12px 14px;background:#f8fafc;border:1px solid #dbe3ef}
      #tab-materiale .materiale-kpi span{display:block;font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
      #tab-materiale .materiale-kpi b{display:block;font-size:26px;color:#0f172a;line-height:1.1;margin-top:4px}
      #tab-materiale .materiale-list{display:grid;gap:14px;margin-top:12px}
      #tab-materiale .materiale-card{border:1px solid #dbe3ef;border-radius:22px;background:#fff;box-shadow:0 10px 26px rgba(15,23,42,.08);overflow:hidden}
      #tab-materiale .materiale-card.waiting{border-left:8px solid #f59e0b}
      #tab-materiale .materiale-card.done{border-left:8px solid #16a34a;opacity:.9}
      #tab-materiale .materiale-card.cancel{border-left:8px solid #ef4444;opacity:.82}
      #tab-materiale .materiale-card-head{display:flex;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid #e5e7eb;background:#f8fafc}
      #tab-materiale .materiale-title{font-size:18px;font-weight:900;color:#0f172a;margin:0}
      #tab-materiale .materiale-date{font-size:13px;color:#64748b;font-weight:800;margin-top:4px}
      #tab-materiale .materiale-body{padding:18px}
      #tab-materiale .materiale-desc-label{font-size:12px;font-weight:900;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px}
      #tab-materiale .materiale-desc{font-size:21px;line-height:1.35;font-weight:800;color:#111827;white-space:pre-wrap;background:#fff7ed;border:1px solid #fed7aa;border-radius:18px;padding:16px;margin-bottom:14px}
      #tab-materiale .materiale-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}
      #tab-materiale .materiale-meta div{background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:10px 12px}
      #tab-materiale .materiale-meta span{display:block;font-size:12px;font-weight:800;color:#64748b;margin-bottom:3px}
      #tab-materiale .materiale-meta b{display:block;font-size:16px;color:#0f172a}
      #tab-materiale .materiale-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
      #tab-materiale .materiale-actions button{width:auto;margin:0}
      #tab-materiale .materiale-print{display:none}
      @media(max-width:760px){#tab-materiale .materiale-toolbar{grid-template-columns:1fr}#tab-materiale .materiale-summary{grid-template-columns:1fr}#tab-materiale .materiale-card-head{display:block}#tab-materiale .materiale-meta{grid-template-columns:1fr}#tab-materiale .materiale-desc{font-size:19px}}
      @media print{#tab-materiale .materiale-toolbar,#tab-materiale .materiale-actions,#tab-materiale button{display:none!important}#tab-materiale .materiale-card{box-shadow:none;break-inside:avoid;margin-bottom:10px}#tab-materiale .materiale-desc{font-size:18px;background:#fff;border:1px solid #999}}
    `;
    document.head.appendChild(style);

    function safe(v){ return typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    function statoLabel(s){ return s === 'evasa' ? 'Evasa' : s === 'annullata' ? 'Annullata' : 'In attesa'; }
    function dateText(v){
      const d = String(v || '').slice(0,16).replace('T',' ');
      return d || '-';
    }
    function rowClass(r){ return r.stato === 'evasa' ? 'done' : r.stato === 'annullata' ? 'cancel' : 'waiting'; }
    function person(r){ return `${r.collaboratori?.cognome || ''} ${r.collaboratori?.nome || ''}`.trim() || '-'; }
    function site(r){ return `${r.cantieri?.codice || ''} ${r.cantieri?.nome || ''}`.trim() || '-'; }

    window.tpRenderMaterialeAdminChiaro = function(rows){
      const box = document.getElementById('adminMaterialeBox');
      if(!box) return;
      const all = rows || window.__tpMaterialeAdminRows || [];
      window.__tpMaterialeAdminRows = all;
      const q = (document.getElementById('matAdminSearch')?.value || '').toLowerCase().trim();
      const stato = document.getElementById('matAdminStato')?.value || 'aperti';
      let list = all.filter(r=>{
        const txt = `${person(r)} ${site(r)} ${r.materiale || ''} ${r.stato || ''}`.toLowerCase();
        const matchTxt = !q || txt.includes(q);
        const matchStato = stato === 'tutte' ? true : stato === 'aperti' ? (r.stato || 'in_attesa') === 'in_attesa' : (r.stato || '') === stato;
        return matchTxt && matchStato;
      });
      const nAttesa = all.filter(r=>(r.stato || 'in_attesa') === 'in_attesa').length;
      const nEvase = all.filter(r=>r.stato === 'evasa').length;
      const nAnnullate = all.filter(r=>r.stato === 'annullata').length;
      const toolbar = `
        <div class="materiale-toolbar">
          <div><label>Cerca subito</label><input id="matAdminSearch" placeholder="Cerca collaboratore, cantiere o materiale..." value="${safe(q)}" oninput="tpRenderMaterialeAdminChiaro()"></div>
          <div><label>Mostra</label><select id="matAdminStato" onchange="tpRenderMaterialeAdminChiaro()">
            <option value="aperti" ${stato==='aperti'?'selected':''}>Solo in attesa</option>
            <option value="tutte" ${stato==='tutte'?'selected':''}>Tutte</option>
            <option value="evasa" ${stato==='evasa'?'selected':''}>Evase</option>
            <option value="annullata" ${stato==='annullata'?'selected':''}>Annullate</option>
          </select></div>
          <button type="button" class="secondary" onclick="caricaMaterialeAdmin()">Aggiorna</button>
        </div>
        <div class="materiale-summary">
          <div class="materiale-kpi"><span>Da preparare</span><b>${nAttesa}</b></div>
          <div class="materiale-kpi"><span>Evase</span><b>${nEvase}</b></div>
          <div class="materiale-kpi"><span>Annullate</span><b>${nAnnullate}</b></div>
        </div>`;
      if(!list.length){ box.innerHTML = toolbar + '<p class="muted">Nessuna richiesta materiale con questi filtri.</p>'; return; }
      box.innerHTML = toolbar + `<div class="materiale-list">${list.map(r=>`
        <article class="materiale-card ${rowClass(r)}">
          <div class="materiale-card-head">
            <div><h3 class="materiale-title">${safe(site(r))}</h3><div class="materiale-date">${safe(dateText(r.created_at))} - ${safe(person(r))}</div></div>
            <div>${typeof badgeStatoMateriale === 'function' ? badgeStatoMateriale(r.stato) : safe(statoLabel(r.stato))}</div>
          </div>
          <div class="materiale-body">
            <div class="materiale-desc-label">Ordine materiale</div>
            <div class="materiale-desc">${safe(r.materiale || '-')}</div>
            <div class="materiale-meta">
              <div><span>Collaboratore</span><b>${safe(person(r))}</b></div>
              <div><span>Data richiesta</span><b>${safe(dateText(r.created_at))}</b></div>
            </div>
            <div class="materiale-actions">
              <button type="button" onclick="setRichiestaMateriale('${safe(r.id)}','evasa')">Segna evasa</button>
              <button type="button" class="secondary" onclick="setRichiestaMateriale('${safe(r.id)}','in_attesa')">Rimetti in attesa</button>
              <button type="button" class="ghost" onclick="setRichiestaMateriale('${safe(r.id)}','annullata')">Annulla</button>
            </div>
          </div>
        </article>`).join('')}</div>`;
    };

    window.caricaMaterialeAdmin = async function(){
      const box = document.getElementById('adminMaterialeBox');
      if(!box) return;
      try{
        if(typeof q !== 'function' || !db){ box.innerHTML = '<div class="error">Database non pronto. Ricarica la pagina.</div>'; return; }
        const rows = await q(db.from('richieste_materiale').select('*,collaboratori(nome,cognome),cantieri(codice,nome)').order('created_at',{ascending:false}).limit(200));
        window.__tpMaterialeAdminRows = rows || [];
        window.tpRenderMaterialeAdminChiaro(rows || []);
        if(typeof msg === 'function') msg(document.getElementById('adminMaterialeMsg'), 'Vista materiale chiara aggiornata. Le richieste aperte sono mostrate in alto.');
        if(typeof aggiornaBadgeMaterialeAdmin === 'function') await aggiornaBadgeMaterialeAdmin();
      }catch(e){
        box.innerHTML = `<div class="error">${safe(e.message)}<br>Esegui setup_richieste_materiale_fix.sql in Supabase.</div>`;
      }
    };
  }

  ready(function(){
    const timer = setInterval(function(){
      installMaterialeAdminChiaro();
      if(window.__tpMaterialeAdminChiaroInstalled) clearInterval(timer);
    }, 250);
    setTimeout(function(){ clearInterval(timer); installMaterialeAdminChiaro(); }, 4000);
  });
})();