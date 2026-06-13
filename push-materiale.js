// Notifiche push materiale - pagina admin
// Mostra un pulsante per registrare il telefono e salva la subscription in Supabase.
(function(){
  const VAPID_PUBLIC_KEY = 'BKN5tlq0RodUoBLk25we96hg9OeGgS3f_DGr7EbIMOo81oXR3tWBM6ViS94pln709jdxxCxOwvrRGFGx5jKMs5M';

  function ready(fn){
    if(document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(fn, 0);
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function b64ToUint8Array(base64String){
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function getDb(){
    if(typeof db !== 'undefined' && db) return db;
    if(window.supabase && window.TECNOPLAFON_CONFIG){
      const cfg = window.TECNOPLAFON_CONFIG;
      if(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY){
        return window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
      }
    }
    return null;
  }

  function showStatus(text, type){
    const el = document.getElementById('pushMaterialeMsg');
    if(!el) return;
    el.innerHTML = '<div class="' + (type || 'success') + '">' + String(text).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]; }) + '</div>';
  }

  function installButton(){
    if(!document.body || document.body.dataset.page !== 'admin') return;
    if(document.getElementById('pushMaterialeBox')) return;

    const box = document.createElement('div');
    box.id = 'pushMaterialeBox';
    box.className = 'card';
    box.style.margin = '12px 0';
    box.innerHTML = '<h2>Notifiche materiale telefono</h2><p class="muted">Attiva questo pulsante sul telefono dove vuoi ricevere gli avvisi quando arriva una richiesta materiale.</p><button type="button" id="btnPushMateriale">Attiva notifiche materiale</button><div id="pushMaterialeMsg"></div>';

    const adminBox = document.getElementById('adminBox');
    const tabs = document.querySelector('.tabs');
    if(tabs) tabs.insertAdjacentElement('afterend', box);
    else if(adminBox) adminBox.insertAdjacentElement('afterbegin', box);
    else document.body.appendChild(box);

    document.getElementById('btnPushMateriale').onclick = attivaNotificheMateriale;
  }

  async function attivaNotificheMateriale(){
    try{
      if(!('serviceWorker' in navigator)) throw new Error('Questo telefono/browser non supporta Service Worker.');
      if(!('PushManager' in window)) throw new Error('Questo telefono/browser non supporta le notifiche push web.');

      const permission = await Notification.requestPermission();
      if(permission !== 'granted') throw new Error('Permesso notifiche non concesso. Controlla Impostazioni del telefono.');

      const reg = await navigator.serviceWorker.register('./service-worker.js');
      await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if(!sub){
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToUint8Array(VAPID_PUBLIC_KEY)
        });
      }

      const json = sub.toJSON();
      const dbx = getDb();
      if(!dbx) throw new Error('Database non pronto. Ricarica la pagina.');

      const row = {
        user_role: 'admin',
        endpoint: json.endpoint,
        p256dh: json.keys && json.keys.p256dh ? json.keys.p256dh : '',
        auth: json.keys && json.keys.auth ? json.keys.auth : '',
        last_seen_at: new Date().toISOString()
      };

      const { error } = await dbx.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' });
      if(error) throw error;

      showStatus('Notifiche materiale attivate su questo telefono.', 'success');
      await aggiornaNumeroIconaMateriale();
    }catch(e){
      showStatus(e.message || String(e), 'error');
    }
  }

  async function aggiornaNumeroIconaMateriale(){
    try{
      const dbx = getDb();
      if(!dbx) return;
      const { count, error } = await dbx.from('richieste_materiale').select('id', { count:'exact', head:true }).in('stato', ['in_attesa','vista']);
      if(error) throw error;
      const n = Number(count || 0);
      if(navigator.setAppBadge){
        if(n > 0) await navigator.setAppBadge(n);
        else if(navigator.clearAppBadge) await navigator.clearAppBadge();
      }
    }catch(e){}
  }

  function rendiVisteSempreVisibili(){
    if(window.__tpVistaMaterialeVisibile) return true;
    if(typeof window.tpRenderMaterialeAdminChiaro !== 'function') return false;
    const original = window.tpRenderMaterialeAdminChiaro;
    window.tpRenderMaterialeAdminChiaro = function(rows){
      original(rows);
      const sel = document.getElementById('matAdminStato');
      if(sel){
        const opt = Array.from(sel.options).find(o => o.value === 'aperti');
        if(opt) opt.textContent = 'In attesa + viste';
      }
    };
    window.__tpVistaMaterialeVisibile = true;
    return true;
  }

  window.attivaNotificheMateriale = attivaNotificheMateriale;
  window.aggiornaNumeroIconaMateriale = aggiornaNumeroIconaMateriale;
  ready(function(){
    installButton();
    aggiornaNumeroIconaMateriale();
    const timer = setInterval(function(){
      installButton();
      aggiornaNumeroIconaMateriale();
      if(rendiVisteSempreVisibili()) clearInterval(timer);
    }, 1500);
    setTimeout(function(){ clearInterval(timer); rendiVisteSempreVisibili(); aggiornaNumeroIconaMateriale(); }, 8000);
  });
})();
