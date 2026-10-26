/* 法宝与丹药的纯展示图形；不读取或修改战斗状态。 */
(function (root) {
  'use strict';
  const D = root.WX_DATA || (typeof require === 'function' ? require('./data.js') : null);
  const RELIC_MOTIFS = {
    qing_feng: ['sword-tassel', '<path d="M37 7h26l-5 13-8 5-8-5zM47 25h6v35h-6zM39 59h22M45 61v17l5 8 5-8V61"/><path d="M42 21q-14 13-18 40m34-40q14 13 18 40"/>'],
    yao_nang: ['herb-pouch', '<path d="M37 27q13 5 26 0l8 36q1 22-21 24Q28 85 29 63zM40 21h20M35 27h30"/><path d="M50 66V40m0 17q-11-3-12-11 10 0 12 11zm0-7q2-12 13-13-1 10-13 13z"/>'],
    tie_jia: ['armor-plate', '<path d="M26 19 50 9l24 10v47L50 88 26 66zM34 27l16-7 16 7v34L50 76 34 61z"/><path d="M50 21v54M35 43h30"/>'],
    qing_yu: ['gourd', '<path d="M44 12q6-6 12 0l-3 16q13 6 13 18-1 9-8 12 19 11 16 24-3 11-24 11S29 89 26 82q-3-13 16-24-7-3-8-12 0-12 13-18z"/><path d="M41 19h18M32 72q18 11 36 0"/>'],
    wu_xing_huan: ['five-ring', '<circle cx="50" cy="50" r="34"/><circle cx="50" cy="50" r="21"/><path d="M50 9v21M88 37 68 43M74 78 62 63M26 78l12-15M12 37l20 6"/><circle class="relic-element-node wood" cx="50" cy="15" r="4" stroke="none"/><circle class="relic-element-node fire" cx="83" cy="39" r="4" stroke="none"/><circle class="relic-element-node earth" cx="70" cy="78" r="4" stroke="none"/><circle class="relic-element-node metal" cx="30" cy="78" r="4" stroke="none"/><circle class="relic-element-node water" cx="17" cy="39" r="4" stroke="none"/>'],
    huo_ling_zhu: ['pearl-fire', '<circle cx="50" cy="51" r="31"/><path d="M49 74q-20-8-9-28 1 9 6 6-3-12 8-23-1 13 7 17 4-5 2-9 16 20-2 33-5 4-12 4z"/>'],
    xuan_tie_jian: ['black-sword', '<path d="m50 5 10 15-5 49-5 9-5-9-5-49zM26 65h48M44 77h12v12H44z"/><path d="M50 15v53M31 73l-7 8m45-8 7 8"/>'],
    gui_jia: ['tortoise-shell', '<path d="M50 10 74 22l14 28-14 28-24 12-24-12-14-28 14-28z"/><path d="m50 25 20 12v26L50 75 30 63V37zM50 25V10M30 37 26 22m44 15 4-15M30 63 26 78m44-15 4 15"/>'],
    ju_qi_lu: ['furnace', '<path d="M30 27h40l-4 41q-16 14-32 0zM23 30q-9-15 5-18l8 16M77 30q9-15-5-18l-8 16M35 72l-5 17m35-17 5 17M50 76v13"/><path d="M38 49q12-18 24 0-11 16-24 0z"/>'],
    ling_hu_fu: ['fox-talisman', '<path d="M31 8h38l-4 81-15-7-15 7zM37 17h26"/><path d="m35 47 7-12 8 7 8-7 7 12-15 17zM44 51h1m10 0h1M46 59l4 4 4-4"/>'],
    hui_chun_zan: ['leaf-hairpin', '<path d="M17 76 78 24M73 16q13 5 8 18-12 4-18-6z"/><path d="M35 59q-3-25 18-35 6 22-18 35zm0 0 18-35"/>'],
    po_jun_ling: ['command-token', '<path d="M30 9h40l7 71-27 11-27-11zM35 22h30M35 73h30"/><path d="M50 28v37m-14-24h28m-24 15 10 10 10-10"/>'],
    shang_ren_mian: ['half-mask', '<path d="M17 32q33-22 66 0L70 71 50 82 30 71zM22 37l-13-9m69 9 13-9"/><path d="M29 46q8-7 16 0l-7 6zm26 0q8-7 16 0l-9 6zM50 55v16"/>'],
    shuang_yu_pei: ['twin-fish', '<path d="M50 9q34 5 34 41T50 91Q16 85 16 50T50 9z"/><path d="M50 18q30 7 16 33-7 13-16 13-18 0-18 18M50 82q-30-7-16-33 7-13 16-13 18 0 18-18"/><circle cx="58" cy="47" r="2"/><circle cx="42" cy="53" r="2"/>'],
    di_ling_zhu: ['pearl-earth', '<circle cx="50" cy="51" r="31"/><path d="m30 66 15-27 8 10 9-18 11 35zM39 67h30"/>'],
    jin_ling_zhu: ['pearl-metal', '<circle cx="50" cy="51" r="31"/><path d="m50 25 8 14-5 25-3 7-3-7-5-25zM30 58h40M50 18v8m-20 7 7 7m33-7-7 7"/>'],
    shui_ling_zhu: ['pearl-water', '<circle cx="50" cy="51" r="31"/><path d="M29 51q13-19 28-2t16-2M28 64q17-12 29 1t16-3M50 27q-13 10-7 18"/>'],
    mu_ling_zhu: ['pearl-wood', '<circle cx="50" cy="51" r="31"/><path d="M50 72V31M50 53q-15-2-17-17 15 0 17 17zm0-11q2-17 18-18-1 17-18 18z"/>'],
    tu_ling_zhu: ['pearl-mountain', '<circle cx="50" cy="51" r="31"/><path d="m28 68 15-30 8 13 9-22 13 39zM34 70h33M49 46l6 12"/>'],
    jiu_hua_lu: ['dew-flask', '<path class="relic-flask-body" d="M39 12h22v11l9 47q2 18-20 18T30 70l9-47z"/><path d="M36 21h28M50 34q13 16 0 30-13-14 0-30zM37 72q13 9 26 0"/>'],
    cang_jian_xia: ['sword-case', '<path class="relic-case-body" d="M12 36 85 22l5 37-73 15z"/><path d="M20 44l64-13M22 66l65-14M45 37l4 30M69 32l4 30"/><path class="relic-case-edge" d="M32 51l48-9"/>'],
    gu_deng: ['ancient-lamp', '<path d="M41 18h18l-7 16h-4zM27 42q23-12 46 0l-8 29H35zM37 71h26l6 15H31z"/><path d="M50 13q-11 19 0 21 11-2 0-21zM35 50h30"/>'],
    xue_yu: ['blood-jade', '<path d="M50 8 75 27 81 60 50 90 19 60 25 27z"/><path d="M50 19 62 42 50 75 38 42zM25 27l13 15m37-15L62 42"/>'],
    yu_pei: ['jade-ring', '<path d="M50 12a38 38 0 1 0 32 18l-13 9a22 22 0 1 1-19-11z"/><path d="M63 14l-2 16"/>'],
    fate_sword_box: ['fate-sword-case', '<path d="M12 35 83 17l7 45-71 19zM22 44l61-16M26 70l59-15M51 30l7 37"/><path d="M50 9v18m-20 0 7 8m42-13-7 10M50 76v15"/>'],
    fate_alchemy_furnace: ['fate-furnace', '<path d="M26 26h48l-5 50H31zM18 31q-4-18 12-19l6 15m46 4q4-18-12-19l-6 15M35 76l-4 15m34-15 4 15M50 76v15"/><circle cx="50" cy="49" r="13"/><path d="M50 25v11m-10 4 20 20m-20 0 20-20"/>'],
    fate_monk_stele: ['fate-stele', '<path d="M32 8h36l7 73H25zM17 81h66v10H17z"/><path d="m50 20-15 43h30zM38 69h24M50 14v13"/>'],
    fate_five_elements_book: ['fate-book', '<path d="M13 23q20-9 37 2 17-11 37-2v59q-20-8-37 3-17-11-37-3zM50 25v60"/><path d="M22 37h19m-19 9h19m19-9h19m-19 9h19M35 61l6 10m24-10-6 10"/>'],
    fate_hunyuan_pearl: ['fate-pearl', '<circle cx="50" cy="50" r="35"/><circle cx="50" cy="50" r="24"/><path d="M23 50q27-35 54 0T23 50zM50 15v70M15 50h70"/>'],
    fate_creation_jade: ['fate-jade-slip', '<path d="M19 14h62v65L50 91 19 79zM30 24h40v46L50 80 30 70z"/><path d="M50 25v46M36 39h28M36 52h28"/>']
  };

  function relicArt(id) {
    const relic = D?.relicMap?.[id];
    const motif = RELIC_MOTIFS[id];
    if (!relic || !motif) return '';
    const rarity = relic.rarity;
    return `<span class="relic-art relic-art-${id.replaceAll('_', '-')} motif-${motif[0]} rarity-${rarity}" aria-hidden="true"><svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" focusable="false">${motif[1]}</svg></span>`;
  }

  const POTION_MOTIFS = {
    heal: '<path class="potion-body" d="M32 24h36l8 16v35q-26 20-52 0V40z"/><path class="potion-stop" d="M36 16h28v11H36z"/><circle class="potion-core" cx="50" cy="58" r="14"/><path class="potion-mark" d="M50 69V43m0 14q-13-3-13-13 12 0 13 13zm0-7q3-11 13-12-1 10-13 12z"/>',
    fire: '<path class="potion-body" d="M43 19h14v27l14 24q2 12-21 17-23-5-21-17l14-24z"/><path class="potion-stop" d="M40 13h20v9H40z"/><path class="potion-core" d="M50 78q-20-10-6-27 1 8 6 5-3-8 5-16-1 10 6 14 3-4 2-7 14 17-4 28z"/>',
    block: '<path class="potion-body" d="M18 39q32-17 64 0l4 27Q50 88 14 66z"/><path class="potion-stop" d="M35 30h30v12H35z"/><path class="potion-mark" d="m50 42 16 10v17L50 78 34 69V52zM50 42v36M34 52l16 10 16-10"/>',
    energy: '<path class="potion-body" d="M42 17h16l-3 19q13 9 13 19-1 7-6 11 14 7 13 16-3 9-25 9t-25-9q-1-9 13-16-5-4-6-11 0-10 13-19z"/><path class="potion-stop" d="M39 13h22v8H39z"/><path class="potion-mark" d="M33 74q30-20 35 4M36 82q21 7 28-11M43 54q7-11 14 0"/>',
    draw: '<path class="potion-body" d="M39 13h22l-4 21 11 11-4 40H36l-4-40 11-11z"/><path class="potion-stop" d="M37 10h26v9H37z"/><path class="potion-mark" d="M37 51q13-8 26 0m-26 11q13 8 26 0m-26 10q13-8 26 0"/>',
    cleanse: '<path class="potion-body" d="M34 27h32l9 50-25 12-25-12z"/><path class="potion-stop" d="M30 19h40v11H30z"/><path class="potion-mark" d="M50 40v31m-13-15 13 15 13-15M42 47l8-7 8 7"/>',
    strength: '<path class="potion-body" d="M43 16h14v16l11 10 7 39-25 10-25-10 7-39 11-10z"/><path class="potion-stop" d="M39 11h22v10H39z"/><path class="potion-mark" d="m50 38 9 16-7 8 7 8-9 11-9-11 7-8-7-8zM50 38v43"/>',
    chain: '<path class="potion-body" d="M33 21h34l13 18-4 39-26 14-26-14-4-39z"/><path class="potion-stop" d="M35 13h30v12H35z"/><circle class="potion-core" cx="50" cy="56" r="22"/><path class="potion-mark" d="M50 34v44M28 56h44M35 40l30 32m0-32L35 72"/><circle class="potion-element-dot wood" cx="50" cy="37" r="4"/><circle class="potion-element-dot fire" cx="69" cy="51" r="4"/><circle class="potion-element-dot earth" cx="62" cy="72" r="4"/><circle class="potion-element-dot metal" cx="38" cy="72" r="4"/><circle class="potion-element-dot water" cx="31" cy="51" r="4"/>'
  };
  function potionArt(id) {
    const potion = D?.potionMap?.[id];
    if (!potion || !POTION_MOTIFS[id]) return '';
    return `<span class="potion-vessel potion-art-${id}" aria-hidden="true"><svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" focusable="false">${POTION_MOTIFS[id]}</svg></span>`;
  }

  const API = { relicArt, potionArt };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.WXItemArt = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
