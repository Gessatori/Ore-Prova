// Quando un collaboratore invia una richiesta materiale, chiama subito la funzione push.
// Cosi la notifica arriva senza dover aprire manualmente il link Supabase.
(function(){
  function ready(fn){
    if(document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(fn, 0);
    else document.addEventListener('DOMContentLoaded', fn);
  }

  async function inviaPushMaterialeSubito(){
    try{
      if(typeof db !== 'undefined' && db && db.functions && db.functions.invoke){
        await db.functions.invoke('notifica-materiale-push', { body: { source: 'worker_materiale' } });
        return true;
      }
      const cfg = window.TECNOPLAFON_CONFIG || {};
      if(cfg.SUPABASE_URL){
        await fetch(cfg.SUPABASE_URL + '/functions/v1/notifica-materiale-push', { method: 'POST' });
        return true;
      }
    }catch(e){
      console.warn('Notifica push materiale non inviata subito', e);
    }
    return false;
  }

  function installWrapper(){
    if(!document.body || document.body.dataset.page !== 'worker') return false;
    if(window.__tpPushAfterMaterialeInstalled) return true;
    if(typeof window.salvaRichiestaMaterialeWorker !== 'function') return false;

    const original = window.salvaRichiestaMaterialeWorker;
    window.salvaRichiestaMaterialeWorker = async function(){
      const before = (document.getElementById('matDescrizione')?.value || '').trim();
      const result = await original.apply(this, arguments);
      // Se prima c'era testo e dopo il campo e vuoto, la richiesta e stata salvata.
      const after = (document.getElementById('matDescrizione')?.value || '').trim();
      if(before && !after){
        await inviaPushMaterialeSubito();
      }
      return result;
    };
    window.__tpPushAfterMaterialeInstalled = true;
    return true;
  }

  ready(function(){
    const timer = setInterval(function(){
      if(installWrapper()) clearInterval(timer);
    }, 300);
    setTimeout(function(){ clearInterval(timer); installWrapper(); }, 8000);
  });
})();
