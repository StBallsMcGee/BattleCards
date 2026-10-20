/* Battle Cards — phone layout. Loaded before the shared UI (../public/js/ui.js), which reads
 * window.BCLayout to place the board on a portrait 720 × 1440 stage instead of the desktop 1600 × 900. */
(function () {
  'use strict';
  window.BCArtBase = '../public/art/';
  window.BCLayout = {
    W: 720, H: 1440,
    CX: 360, CY: 607,
    AW: 184, AH: 258, RW: 128, RH: 179,
    activeDX: 100, readyDX: 200,
    //  0– 64 opponent bar · 70–130 their Support · their Ready / Active rows · 584–632 status band
    //  your Active / Ready rows · 1084–1148 your Support · 1152–1212 your bar · 1216+ your hand
    rows: { oppReady: 134, oppActive: 320, meActive: 636, meReady: 900 },
    HW: 168,
    hand: { y: 1218, curve: 0.8, rot: 1.2, maxSpread: 150, span: 704, oppY: -400 },
    menu: { minX: 10, maxX: 710 },
    previewW: 300,
    touch: true,
    afterBuild(UI) {
      // The game log lives behind a button instead of in a side column.
      const btn = document.createElement('button');
      btn.id = 'btn-log';
      btn.className = 'btn subtle small';
      btn.title = 'Game log';
      btn.textContent = '📜';
      btn.addEventListener('click', () => document.getElementById('board').classList.toggle('log-open'));
      document.getElementById('board').appendChild(btn);
      document.getElementById('log').addEventListener('click', () => document.getElementById('board').classList.remove('log-open'));
    },
  };
})();
