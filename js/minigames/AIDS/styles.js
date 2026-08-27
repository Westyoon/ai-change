const STYLE_ID = 'aids-egg-sort-styles';

function removeNode(node) {
    if (typeof node?.remove === 'function') {
        node.remove();
        return;
    }
    node?.parentNode?.removeChild?.(node);
}

const CSS = `
.aids-ui-root{
  width:100%; height:100%; min-width:0; min-height:0; padding:0;
  overflow:hidden; display:grid; place-items:center;
}
.aids-ui-root > .aids-frame-viewport{
  position:relative; min-width:0; min-height:0; overflow:hidden;
}
.aids-logical-frame{
  position:absolute; width:390px; height:740px; overflow:hidden;
  transform-origin:top left;
}
.aids-root{
  position:relative; width:100%; height:100%;
  display:flex; flex-direction:column;
  background: linear-gradient(180deg, #FFE9CF 0%, #FFF6EC 55%);
  color:#241C33; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  overflow:hidden; user-select:none; -webkit-tap-highlight-color:transparent;
  box-sizing:border-box;
}
.aids-root *{ box-sizing:border-box; }

.aids-topbar{ flex:0 0 auto; display:flex; justify-content:space-between; align-items:center; padding:16px 18px 6px; }
.aids-timer{ font-size:26px; font-weight:800; background:#fff; border-radius:14px; padding:4px 14px; box-shadow:0 3px 0 rgba(0,0,0,0.08); min-width:46px; text-align:center; }
.aids-timer.aids-blink{ animation: aids-blink-timer 0.6s infinite; }
@keyframes aids-blink-timer{ 0%,100%{ color:#241C33; background:#fff; } 50%{ color:#fff; background:#FF5D6C; } }

.aids-hearts{ display:flex; gap:3px; }
.aids-heart{ width:20px; height:20px; color:#E7DCC9; transition:color .2s ease, transform .2s ease; }
.aids-heart svg{ width:100%; height:100%; display:block; }
.aids-heart.aids-on{ color:#FF5D6C; }
.aids-heart.aids-pop{ transform:scale(1.4); }

.aids-pipe-row{ flex:0 0 auto; display:flex; justify-content:center; margin-top:2px; }
.aids-pipe{ width:64px; height:26px; background:#4A3F63; border-radius:0 0 10px 10px; position:relative; }
.aids-pipe::before{ content:""; position:absolute; top:-8px; left:-6px; right:-6px; height:12px; background:#241C33; border-radius:8px; }

.aids-field{ position:relative; flex:1 1 auto; margin:0 14px; overflow:hidden; min-height:200px; }

.aids-egg{
  position:absolute; width:40px; height:40px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  font-size:13px; font-weight:800; color:#fff;
  box-shadow: inset -4px -5px 0 rgba(0,0,0,0.12), 0 4px 6px rgba(0,0,0,0.15);
  z-index:5;
}
.aids-egg-in{ background: radial-gradient(circle at 35% 30%, #FFB27A, #FF9152 60%, #E4711F); }
.aids-egg-de{ background: radial-gradient(circle at 35% 30%, #6FDAD3, #38B8B0 60%, #1F8E88); }

.aids-platform-wrap{
  position:absolute; width:84px; height:22px; margin-left:-42px; margin-top:-11px;
  transform-origin:50% 50%; transition: transform .2s cubic-bezier(.4,1.6,.6,1); z-index:4;
  filter: drop-shadow(0 4px 4px rgba(0,0,0,0.18));
}
.aids-platform-wrap.aids-tilt-left{ transform: rotate(-16deg); }
.aids-platform-wrap.aids-tilt-right{ transform: rotate(16deg); }
.aids-platform-bar{
  position:absolute; top:50%; left:0; right:0; height:16px; margin-top:-8px; border-radius:10px;
  background: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(160,214,255,0.55) 55%, rgba(120,190,245,0.5));
  border:2px solid rgba(255,255,255,0.85);
  box-shadow: inset 0 2px 3px rgba(255,255,255,0.8), inset 0 -3px 4px rgba(70,140,200,0.25);
}
.aids-platform-pivot{
  position:absolute; left:50%; top:50%; width:15px; height:15px; margin-left:-7.5px; margin-top:-7.5px;
  background: radial-gradient(circle at 35% 30%, #FFEFB0, #F4C430 55%, #C98A0F); border-radius:50%;
  box-shadow: 0 2px 2px rgba(0,0,0,0.25);
}

.aids-miss-marker{ position:absolute; z-index:6; }

.aids-boxes{ flex:0 0 auto; display:flex; justify-content:space-between; padding:0 26px; margin-top:4px; }
.aids-box{
  width:120px; height:66px; border-radius:16px 16px 8px 8px;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;
  font-weight:800; font-size:14px; border:3px solid rgba(0,0,0,0.08);
  transition: background .2s ease, transform .15s ease; position:relative;
}
.aids-box-left{ background:#FFE3C9; }
.aids-box-right{ background:#D6F3EF; }
.aids-box-dot{ width:14px; height:14px; border-radius:50%; }
.aids-box-left .aids-box-dot{ background:#FF9152; }
.aids-box-right .aids-box-dot{ background:#38B8B0; }
.aids-box.aids-flash-good{ background:#4CD97B !important; transform:scale(1.06); }
.aids-box.aids-flash-bad{ background:#FF5D6C !important; transform:scale(0.94); }

.aids-float-text{
  position:absolute; top:-22px; left:50%; transform:translateX(-50%);
  font-size:15px; font-weight:800; animation: aids-float-up .7s ease forwards; pointer-events:none;
}
.aids-float-text.aids-good{ color:#2C9C52; }
.aids-float-text.aids-bad{ color:#D8323F; }
@keyframes aids-float-up{ 0%{ opacity:1; transform:translate(-50%,0); } 100%{ opacity:0; transform:translate(-50%,-24px); } }

.aids-controls{ flex:0 0 auto; display:flex; gap:12px; padding:14px 18px 20px; }
.aids-ctrl-btn{
  flex:1; height:64px; border-radius:18px; border:none; font-size:22px; font-weight:800; color:#fff;
  background: linear-gradient(180deg, #5A4C7E, #241C33); box-shadow:0 5px 0 #150F20;
  display:flex; align-items:center; justify-content:center; gap:6px;
  transition: transform .06s ease, box-shadow .06s ease;
}
.aids-ctrl-btn:active, .aids-ctrl-btn.aids-active{ transform: translateY(4px); box-shadow: 0 1px 0 #150F20; }
.aids-ctrl-left.aids-active{ background: linear-gradient(180deg,#FFB27A,#E4711F); box-shadow:0 1px 0 #C9622A; }
.aids-ctrl-right.aids-active{ background: linear-gradient(180deg,#6FDAD3,#1F8E88); box-shadow:0 1px 0 #16645F; }
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
