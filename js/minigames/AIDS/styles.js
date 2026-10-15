const STYLE_ID = 'aids-egg-sort-styles';

function removeNode(node) {
    if (typeof node?.remove === 'function') {
        node.remove();
        return;
    }
    node?.parentNode?.removeChild?.(node);
}

const CSS = `
.minigame-stage.aids-stage{
  container-type:inline-size;
}
.minigame-frame.aids-frame-host{
  padding-block:clamp(12px, 2vw, 24px);
}
.aids-ui-root{
  width:100%; height:auto; min-width:0;
  min-height:max(430px, min(999px, calc(100dvh - 200px))); padding:0;
  overflow-x:hidden; overflow-y:auto; display:grid;
  align-items:safe center; justify-items:center;
}
.aids-ui-root > .aids-frame-viewport{
  position:relative; min-width:0; min-height:0; overflow:hidden;
}
.aids-logical-frame{
  position:absolute; width:390px; height:740px; overflow:hidden;
  transform-origin:top left;
}
.aids-root{
  --aids-ink:#682344;
  --aids-ink-deep:#3B182F;
  --aids-cream:#FFF8E8;
  --aids-cream-shadow:#E8D8C4;
  --aids-peach:#FFB27A;
  --aids-peach-light:#FFE3C9;
  --aids-peach-shadow:#D96F4F;
  --aids-mint:#6FDAD3;
  --aids-mint-light:#D6F3EF;
  --aids-mint-shadow:#289F99;
  --aids-yellow:#FFD45C;
  --aids-yellow-shadow:#D39428;
  --aids-focus:#2AB5E4;
  position:relative; width:100%; height:100%;
  display:flex; flex-direction:column;
  background-color:#FFF6EC;
  background-position:center;
  background-repeat:no-repeat;
  background-size:100% 100%;
  color:#241C33; font-family:var(--font-body);
  overflow:hidden; user-select:none; -webkit-tap-highlight-color:transparent;
  box-sizing:border-box;
}
.aids-root *{ box-sizing:border-box; }

.aids-topbar{ flex:0 0 auto; display:flex; justify-content:space-between; align-items:center; padding:16px 18px 6px; }
.aids-timer{
  min-width:46px; height:39px; padding:4px 14px;
  display:flex; align-items:center; justify-content:center;
  color:var(--aids-ink-deep); background:var(--aids-cream);
  border:2px solid var(--aids-ink); border-radius:4px;
  box-shadow:0 3px 0 var(--aids-cream-shadow);
  font-size:26px; font-weight:800; line-height:1; text-align:center;
}
.aids-timer.aids-blink{ animation: aids-blink-timer 0.6s infinite; }
@keyframes aids-blink-timer{
  0%,100%{ color:var(--aids-ink-deep); background:var(--aids-cream); }
  50%{ color:#fff; background:#FF5D6C; }
}

.aids-hearts{
  min-height:39px; padding:7px 8px 8px;
  display:flex; align-items:center; gap:3px;
  background:var(--aids-cream); border:2px solid var(--aids-ink); border-radius:4px;
  box-shadow:0 3px 0 var(--aids-cream-shadow);
}
.aids-heart{ width:20px; height:20px; color:#E7DCC9; transition:color .2s ease, transform .2s ease; }
.aids-heart svg{ width:100%; height:100%; display:block; }
.aids-heart.aids-on{ color:#FF5D6C; }
.aids-heart.aids-pop{ transform:scale(1.4); }

.aids-pipe-row{ flex:0 0 auto; display:flex; justify-content:center; margin-top:2px; }
.aids-pipe{
  position:relative; width:64px; height:26px;
}
.aids-pipe-art{
  position:absolute; left:50%; bottom:0; width:76px; aspect-ratio:1114 / 494;
  transform:translateX(-50%); overflow:hidden; pointer-events:none;
}
/* Original 2172x724 PNG: visible artwork is x=529..1642, y=127..620.
   Crop transparent padding in CSS without changing the image or field geometry. */
.aids-pipe-image{
  position:absolute; left:calc(-529 / 1114 * 100%); top:calc(-127 / 494 * 100%);
  width:calc(2172 / 1114 * 100%); height:auto; max-width:none;
  display:block; image-rendering:pixelated;
}

.aids-field{ position:relative; flex:1 1 auto; margin:0 14px; overflow:hidden; min-height:200px; }

.aids-egg{
  position:absolute; width:40px; height:40px;
  border:0; background:transparent; z-index:5;
  pointer-events:none;
}
.aids-egg-sprite{
  position:absolute; left:-3px; top:-3px; width:46px; height:46px;
  max-width:none; display:block; object-fit:contain; image-rendering:pixelated;
  transform-origin:center; will-change:transform;
}

.aids-platform-wrap{
  --aids-tilt-angle:16deg;
  position:absolute; width:84px; height:22px; margin-left:-42px; margin-top:-11px;
  transform-origin:50% 50%; z-index:4;
}
.aids-platform-wrap.aids-tilt-left{ transform: rotate(calc(0deg - var(--aids-tilt-angle))); }
.aids-platform-wrap.aids-tilt-right{ transform: rotate(var(--aids-tilt-angle)); }
.aids-platform-bar{
  position:absolute; top:50%; left:0; right:0; height:16px; margin-top:-8px; border-radius:3px;
  background:var(--aids-cream); border:2px solid var(--aids-ink);
  box-shadow:inset 0 -3px 0 var(--aids-cream-shadow), 0 3px 0 var(--aids-ink-deep);
}
.aids-platform-bar::before{
  content:""; position:absolute; top:2px; left:5px; right:5px; height:2px;
  background:#fff;
}
.aids-platform-pivot{
  position:absolute; left:50%; top:50%; width:15px; height:15px; margin-left:-7.5px; margin-top:-7.5px;
  background:var(--aids-yellow); border:2px solid var(--aids-ink); border-radius:50%;
  box-shadow:inset -3px -3px 0 var(--aids-yellow-shadow), 0 2px 0 var(--aids-ink-deep);
}
.aids-platform-pivot::before{
  content:""; position:absolute; top:2px; left:3px; width:3px; height:3px;
  background:var(--aids-cream); border-radius:1px;
}

.aids-miss-marker{ position:absolute; z-index:6; }

.aids-boxes{ flex:0 0 auto; display:flex; justify-content:space-between; padding:0 26px; margin-top:4px; }
.aids-box{
  width:120px; height:66px; border-radius:4px;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;
  color:var(--aids-ink-deep); font-weight:800; font-size:14px;
  border:3px solid var(--aids-ink); box-shadow:0 5px 0 var(--aids-ink-deep);
  transition:background-color .12s steps(2,end), transform .12s steps(2,end);
  position:relative;
}
.aids-box::before{
  content:""; position:absolute; top:-8px; left:8px; right:8px; height:9px;
  border:3px solid var(--aids-ink); border-bottom:0; border-radius:3px 3px 0 0;
}
.aids-box-left, .aids-box-left::before{ background:#DCEDFF; }
.aids-box-egg{ width:44px; height:44px; object-fit:contain; image-rendering:pixelated; pointer-events:none; }
.aids-box-right, .aids-box-right::before{ background:#FCE3F2; }
.aids-box.aids-flash-good, .aids-box.aids-flash-good::before{ background:#75DF91 !important; }
.aids-box.aids-flash-bad, .aids-box.aids-flash-bad::before{ background:#FF7D88 !important; }
.aids-box.aids-flash-good{ transform:translateY(-2px); }
.aids-box.aids-flash-bad{ transform:translateY(3px); }

.aids-float-text{
  position:absolute; top:-22px; left:50%; transform:translateX(-50%);
  font-size:15px; font-weight:800; animation: aids-float-up .7s ease forwards; pointer-events:none;
}
.aids-float-text.aids-good{ color:#2C9C52; }
.aids-float-text.aids-bad{ color:#D8323F; }
@keyframes aids-float-up{ 0%{ opacity:1; transform:translate(-50%,0); } 100%{ opacity:0; transform:translate(-50%,-24px); } }

.aids-controls{ flex:0 0 auto; display:flex; gap:12px; padding:14px 18px 20px; }
.aids-ctrl-btn{
  flex:1; height:64px; border-radius:4px; border:3px solid var(--aids-ink);
  font-size:22px; font-weight:800; color:var(--aids-ink-deep);
  box-shadow:0 6px 0 var(--aids-ink-deep);
  display:flex; align-items:center; justify-content:center; gap:6px;
  transition:transform .06s steps(2,end), box-shadow .06s steps(2,end);
}
.aids-ctrl-left{ background:#2AB5E4; }
.aids-ctrl-right{ background:#FCB5DD; }
.aids-ctrl-btn:active, .aids-ctrl-btn.aids-active{
  transform:translateY(4px); box-shadow:0 2px 0 var(--aids-ink-deep);
}
.aids-ctrl-left.aids-active{ background:#83D6F2; }
.aids-ctrl-right.aids-active{ background:#EA88BB; }
.aids-ctrl-btn:focus-visible{
  outline:3px solid var(--aids-focus); outline-offset:3px;
}

@media (orientation:landscape) and (max-height:560px){
  .aids-ui-root{ min-height:max(120px, calc(100dvh - 200px)); }
}
`;

export function injectStyles(uiRoot) {
    const doc = uiRoot?.ownerDocument ?? globalThis.document;
    if (
        !doc ||
        typeof doc.createElement !== 'function' ||
        typeof doc.getElementById !== 'function'
    ) {
        return null;
    }
    if (doc.getElementById(STYLE_ID)) return null;
    const head = doc.head ?? doc.querySelector?.('head');
    if (typeof head?.appendChild !== 'function' && typeof head?.append !== 'function') {
        return null;
    }
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    if (typeof head.appendChild === 'function') head.appendChild(style);
    else head.append(style);
    return style;
}

export function removeStyles(uiRoot, injectedStyle) {
    if (arguments.length > 1) {
        removeNode(injectedStyle);
        return;
    }
    const doc = uiRoot?.ownerDocument ?? globalThis.document;
    if (typeof doc?.getElementById !== 'function') return;
    removeNode(doc.getElementById(STYLE_ID));
}
