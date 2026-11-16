#!/usr/bin/env bash
# Passage du cron d'emails (chaque minute, voir README) : appelle le site depuis son conteneur, avec CRON_SECRET.
# N'écrit que si ça échoue (journal : ~/elegance-cron.log).
docker exec elegance node -e "fetch('http://127.0.0.1:3000/api/cron/send-emails',{headers:{authorization:'Bearer '+process.env.CRON_SECRET}}).then(r=>{if(!r.ok){console.error('HTTP '+r.status);process.exit(1)}}).catch(e=>{console.error(String(e));process.exit(1)})" \
  || echo "$(date -Is) échec du cron d'emails" >> "$HOME/elegance-cron.log"
