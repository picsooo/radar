const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function notifyOpen({ site, link, session, dashboard }) {
  const key = process.env.RESEND_API_KEY;
  const to = [...String(process.env.NOTIFY_TO || '').split(','), ...String(site.notify_emails || '').split(',')]
    .map((s) => s.trim()).filter(Boolean);
  if (!key || !to.length) return false;
  const who = site.prospect || site.name;
  const place = [session.city, session.country].filter(Boolean).join(', ') || 'Lieu inconnu';
  const visit = session.visit_no > 1 ? `${session.visit_no}e visite` : 'Première visite';
  const subject = `${who} ouvre sa maquette (${visit.toLowerCase()})`;
  const url = `${dashboard}/#/s/${session.id}`;
  const rows = [
    ['Maquette', site.name], ['Lien', link ? link.label : 'Lien générique'], ['Visite', visit],
    ['Lieu', place], ['Appareil', `${session.device}, ${session.os}, ${session.browser}`],
    ["Page d'entrée", session.entry_path || '/'],
  ].map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#6a7383;font-size:13px">${esc(k)}</td><td style="padding:6px 0;font-size:14px;color:#172a4a">${esc(v)}</td></tr>`).join('');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#172a4a">
  <div style="height:4px;width:48px;background:#e8772e;margin-bottom:18px"></div>
  <p style="font-size:20px;font-weight:bold;margin:0 0 6px">${esc(who)} est sur sa maquette</p>
  <p style="font-size:14px;color:#6a7383;margin:0 0 18px">C'est le bon moment pour appeler.</p>
  <table style="border-collapse:collapse">${rows}</table>
  <p style="margin:22px 0 0"><a href="${url}" style="background:#172a4a;color:#fff;text-decoration:none;padding:11px 18px;border-radius:6px;font-size:14px;display:inline-block">Suivre la visite</a></p>
  <p style="font-size:12px;color:#9aa2ae;margin-top:22px">Webminds Radar</p></div>`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.RESEND_FROM || 'Webminds Radar <onboarding@resend.dev>', to, subject, html }),
    });
    if (!r.ok) console.error('mail', r.status, await r.text());
    return r.ok;
  } catch (e) { console.error('mail', e.message); return false; } finally { clearTimeout(t); }
}
