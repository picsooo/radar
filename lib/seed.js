import { db, ensureSchema } from './db.js';

// Maquettes déjà en ligne au moment du branchement (adresse -> nom de la société).
// Les nouvelles maquettes s'ajoutent toutes seules à leur première visite.
export const SEED = [
  ['sauce-liart.vercel.app', 'Sauce Time'], ['wazni.vercel.app', 'Wazni'], ['swiss-chi-nine.vercel.app', 'Swiss Inox'],
  ['ijar-pi.vercel.app', 'Ijar Leasing Algérie'], ['ensc-five.vercel.app', 'ENSCRBC'], ['tired-liard.vercel.app', 'Torex'],
  ['barakaa-three.vercel.app', 'El Baraka'], ['bm-woad.vercel.app', 'BMS Electric'], ['evaneos-five.vercel.app', 'Evaneos Travel'],
  ['evaneos-tqpi.vercel.app', 'Evaneos Travel'], ['mabro.vercel.app', 'Mabro'], ['mabro-xclv.vercel.app', 'Mabro'],
  ['alaa-chi-seven.vercel.app', 'Alaa Élevage'], ['daizy-one.vercel.app', 'Dayzy'], ['laitages.vercel.app', 'Laitages du Maghreb'],
  ['cophydd.vercel.app', 'Cophyd'], ['sanevents.vercel.app', 'SAN Event'], ['swan-beige.vercel.app', 'Swan Events'],
  ['inpk.vercel.app', 'Inpak Emballage'], ['ig-vert.vercel.app', 'El Djazair Idjar'], ['enii.vercel.app', 'ENICAB'],
  ['fixx-beta.vercel.app', 'KIMFIX'], ['tut-nu-nine.vercel.app', 'Liner'], ['plat-black.vercel.app', 'Platinum Algérie'],
  ['magicooo.vercel.app', 'Magico'], ['biopack-flame.vercel.app', 'Ultra'], ['biopackk.vercel.app', 'Ultra'],
  ['cleanplusss.netlify.app', 'Clean Plus'], ['linaaa-xi.vercel.app', 'Lina Clean'],
  ['picerie-picsooos-projects.vercel.app', "L'Épicerie Sacré-Coeur"], ['divindus-seven.vercel.app', 'Divindus Capref'],
  ['allobooth.vercel.app', 'Allobooth'], ['apm-taupe.vercel.app', 'APM'], ['sgp-lime.vercel.app', 'SGP Immo'],
  ['fourseasons-theta.vercel.app', 'Four Seasons Ice Cream'], ['zeboudj.vercel.app', 'Zebboudj Promotion'],
  ['iwane-sigma.vercel.app', 'IWANE Promotion'], ['elmalko.vercel.app', 'Emlako Immobilier'], ['mjs-amber.vercel.app', 'MJS HTT Promotion'],
  ['sinova-one.vercel.app', 'Samsung Sinova'], ['kmagroup.vercel.app', 'KMA Group'], ['kmapromotion.vercel.app', 'KMA Promotion'],
  ['etm.vercel.app', 'ETM Car-Solution'], ['etm-five.vercel.app', 'ETM Car-Solution'], ['etm1.vercel.app', 'ETM Car-Solution'],
  ['etm2.vercel.app', 'ETM Car-Solution'], ['etm3.vercel.app', 'ETM Car-Solution'], ['etm4.vercel.app', 'ETM Car-Solution'],
  ['essasoud.vercel.app', 'ESASOUD'], ['assas-six.vercel.app', 'ESASOUD'], ['as1-five.vercel.app', 'ESASOUD'], ['as2-orpin.vercel.app', 'ESASOUD'],
  ['benz-ashen.vercel.app', 'Benz Promotion'], ['benz1.vercel.app', 'Benz Promotion'],
];

let done;
export function ensureSeed() {
  if (!done) done = (async () => {
    await ensureSchema();
    const p = db();
    await p.query(`insert into sites(id,name,prospect,url,host)
      select substr(md5(random()::text || h),1,8), n, n, 'https://' || h, h
      from unnest($1::text[], $2::text[]) as t(h, n)
      on conflict (host) do nothing`, [SEED.map((s) => s[0]), SEED.map((s) => s[1])]);
    await ensureLinks();
  })().catch((e) => { done = null; throw e; });
  return done;
}

// Chaque maquette a au moins un lien « Prospect » créé automatiquement
export async function ensureLinks() {
  await db().query(`insert into links(id,site_id,label)
    select substr(md5(random()::text || s.id),1,6), s.id, 'Prospect' from sites s
    where not exists (select 1 from links l where l.site_id = s.id)`);
}
