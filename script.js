/* ---------- Theme ---------- */
const root = document.documentElement;
const themeBtns = document.querySelectorAll('[data-theme-btn]');
function applyTheme(t){
  root.setAttribute('data-theme', t);
  themeBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeBtn === t)));
  try { localStorage.setItem('calc-theme', t); } catch(e){}
}
let saved = null;
try { saved = localStorage.getItem('calc-theme'); } catch(e){}
applyTheme(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
themeBtns.forEach(b => b.addEventListener('click', () => applyTheme(b.dataset.themeBtn)));

/* ---------- Keys ---------- */
const SCI_KEYS = [
  ['sin','sin','fn'],['cos','cos','fn'],['tan','tan','fn'],['√','√','fn'],['deg','deg','fn'],
  ['π','pi','fn'],['x²','sq','fn'],['^','^','fn'],['(','(','fn'],[')',')','fn']
];
const KEYS = [
  ['AC','AC',''],['±','neg',''],['%','%',''],['÷','÷','op'],
  ['7','7',''],['8','8',''],['9','9',''],['×','×','op'],
  ['4','4',''],['5','5',''],['6','6',''],['−','−','op'],
  ['1','1',''],['2','2',''],['3','3',''],['=','=','eq'],
  ['0','0',''],['.','.',''],['+','+','op']
];
function buildKeys(list, container){
  list.forEach(([label,k,cls]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'key ' + cls; b.textContent = label; b.dataset.k = k;
    if (k === 'deg') b.id = 'degBtn';
    container.appendChild(b);
  });
}
const keysEl = document.getElementById('keys');
const sciEl = document.getElementById('sciKeys');
buildKeys(SCI_KEYS, sciEl);
buildKeys(KEYS, keysEl);
[keysEl, sciEl].forEach(c => c.addEventListener('click', e => {
  const b = e.target.closest('.key'); if (b) press(b.dataset.k);
}));
document.getElementById('back').addEventListener('click', () => press('back'));

/* ---------- Evaluator (no eval): tokenizer + recursive descent parser ---------- */
let useDeg = true;
const FUNCS = ['sin','cos','tan','√'];
function applyFn(name, v){
  const a = useDeg && name !== '√' ? v * Math.PI / 180 : v;
  let r = name === 'sin' ? Math.sin(a) : name === 'cos' ? Math.cos(a) : name === 'tan' ? Math.tan(a) : Math.sqrt(v);
  if (!isFinite(r)) throw new Error('Invalid input');
  return Math.abs(r) < 1e-12 ? 0 : r;
}
function evaluate(src){
  const t = src.match(/\d+\.?\d*|\.\d+|sin|cos|tan|√|[+−×÷()%^]/g) || [];
  let open = t.filter(x => x === '(').length - t.filter(x => x === ')').length;
  while (open-- > 0) t.push(')');           // auto-close brackets
  let i = 0;
  const peek = () => t[i], next = () => t[i++];
  const bad = () => { throw new Error('incomplete'); };
  function expression(){
    let v = term();
    while (peek() === '+' || peek() === '−'){ const o = next(), r = term(); v = o === '+' ? v + r : v - r; }
    return v;
  }

  function power(){
    let v = (unary());
    if (peek() === '^'){ next(); return Math.pow(v, power()); }
    return v;
    }

  function term(){
    let v = power();
    while (peek() === '×' || peek() === '÷'){
      const o = next(), r = power();
      if (o === '÷' && r === 0) throw new Error('Can’t divide by zero');
      v = o === '×' ? v * r : v / r;
    }
    return v;
  }
  function unary(){
    if (peek() === '−'){ next(); return -unary(); }
    if (peek() === '+'){ next(); return unary(); }
    let v = primary();
    while (peek() === '%'){ next(); v /= 100; }
    return v;
  }
  function primary(){
    const x = next();
    if (x === undefined) bad();
    if (/^[\d.]/.test(x)) return parseFloat(x);
    if (x === '('){ const v = expression(); if (next() !== ')') bad(); return v; }
    if (FUNCS.includes(x)){
      if (next() !== '(') bad();
      const v = expression(); if (next() !== ')') bad();
      return applyFn(x, v);
    }
    bad();
  }
  const r = expression();
  if (i < t.length) bad();
  return r;
}

/* ---------- State & display ---------- */
let expr = '', done = false, shownExpr = '', lastGood = '0';
const exprEl = document.querySelector('#expr span'), resEl = document.getElementById('result');
const isDigit = c => /\d/.test(c), isOp = c => '+−×÷'.includes(c);

function pretty(n){
  const s = parseFloat(n.toPrecision(12));
  if (s !== 0 && (Math.abs(s) >= 1e15 || Math.abs(s) < 1e-9)) return s.toExponential(6).replace(/\.?0+e/, 'e');
  return s.toLocaleString('en-US', { maximumFractionDigits: 10 }).replace('-', '−');
}
function plain(n){
  return parseFloat(n.toPrecision(12)).toLocaleString('en-US', { useGrouping:false, maximumFractionDigits:10 }).replace('-', '−');
}
function show(text, err){
  resEl.textContent = text;
  resEl.className = 'result' + (err ? ' err' : text.length > 16 ? ' sm' : text.length > 10 ? ' md' : '');
}
function render(){
  if (done){ exprEl.textContent = shownExpr; show(lastGood); return; }
  exprEl.textContent = expr;
  if (!expr){ lastGood = '0'; show('0'); return; }
  if (/^[\d.]+$/.test(expr)){               // plain number being typed: keep dots/zeros as typed
    const [a, b] = expr.split('.');
    lastGood = Number(a).toLocaleString('en-US') + (b !== undefined ? '.' + b : '');
    show(lastGood); return;
  }
  try { lastGood = pretty(evaluate(expr)); show(lastGood); }
  catch(e){ show(lastGood); }               // incomplete expression: keep last valid result
}

let glowTimer = null;
const calcEl = document.querySelector('.calc');
function glowCalc(){
  calcEl.classList.add('glow');
  clearTimeout(glowTimer);
  glowTimer = setTimeout(() => calcEl.classList.remove('glow'), 1000);
}

function press(k){
    glowCalc();
  const last = expr.slice(-1);
  if (k === 'deg'){
    useDeg = !useDeg;
    document.getElementById('degBtn').textContent = useDeg ? 'deg' : 'rad';
    return render();
  }
  if (k === 'AC'){ expr = ''; done = false; lastGood = '0'; return render(); }
  if (k === 'back'){
    if (done){ done = false; }
    expr = /(sin|cos|tan|√)\($/.test(expr) ? expr.replace(/(sin|cos|tan|√)\($/, '') : expr.slice(0, -1);
    return render();
  }
  if (k === '='){
    if (!expr) return;
    try {
      const r = evaluate(expr);
      shownExpr = expr + ' =';
      lastGood = pretty(r);
      expr = plain(r); done = true;
      render();
      try { celebrate(); } catch(err){}
    } catch(e){
      if (e.message === 'incomplete') return;
      show(e.message, true);
    }
    return;
  }
  if (k === 'neg'){
    if (!expr) return;
    done = false;
    const wrapped = expr.match(/\(−(\d*\.?\d+)\)$/);
    if (wrapped) expr = expr.slice(0, wrapped.index) + wrapped[1];
    else {
      const m = expr.match(/\d*\.?\d+$/);
      if (m){
        const before = expr.slice(0, m.index);
        expr = before.endsWith('−') && (before.length === 1) ? m[0] : before + '(−' + m[0] + ')';
      }
    }
    return render();
  }
  const startsNew = done && !isOp(k) && k !== '%';   // after "=", numbers/functions start fresh
  if (startsNew){ expr = ''; }
  done = false;
  const l = expr.slice(-1);

  if (k === 'pi'){ if (isDigit(l) || l === ')' || l === '%') 
    expr += '×'; expr += '(' + Math.PI + ')'; return render(); }
  if (isDigit(k)){
    if (l === ')' || l === '%') expr += '×';
    expr += k;
  } else if (k === '.'){
    if (l === ')' || l === '%') expr += '×';
    const cur = expr.match(/[\d.]*$/)[0];
    if (cur.includes('.')) return render();
    expr += cur ? '.' : '0.';
  } else if (isOp(k)){
    if (!expr){ if (k === '−') expr = '−'; return render(); }
    if (l === '('){ if (k === '−') expr += k; return render(); }
    if (isOp(l)){
      if (k === '−' && '×÷'.includes(l)) expr += k;
      else expr = expr.slice(0, -1) + k;
    } else expr += k;
  } else if (k === '%'){
    if (isDigit(l) || l === ')' || l === '%') expr += '%';
  } else if (k === '(' || k === ')'){
    if (k === '(' && (isDigit(l) || l === ')')) expr += '×';
    expr += k;
} else if (FUNCS.includes(k)){
    if (isDigit(l) || l === ')' || l === '%') expr += '×';
    expr += k + '(';
  }
  else if (k === 'sq'){
    const m = expr.match(/\(−?\d*\.?\d+\)$|\d*\.?\d+$/);
    if (!m) return render();
    const before = expr.slice(0, m.index);
    expr = before + '(' + m[0] + '×' + m[0] + ')';
    }
  else if (k === '^'){
    if (isDigit(l) || l === ')') expr += k;
  }

  render();
}

/* ---------- Fireworks (canvas sits in the middle of the circle) ---------- */
const fx = document.getElementById('fx'), ctx = fx.getContext('2d');
let sparks = [], raf = null, W = 0, H = 0;
function sizeFx(){
const d = Math.round(document.getElementById('keys').clientWidth * .94);
const dpr = window.devicePixelRatio || 1;
W = H = d;
fx.width = d * dpr; fx.height = d * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', sizeFx);
function burst(x, y){
  const hue = Math.random() * 360, n = 70;
  for (let i = 0; i < n; i++){
    const a = (i / n) * Math.PI * 2 + Math.random() * .2, s = 1.2 + Math.random() * 3.2;
    sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1,
      color: 'hsl(' + ((hue + Math.random() * 60) % 360) + ',100%,' + (62 + Math.random() * 18) + '%)' });
  }
}
function frame(){
  ctx.globalCompositeOperation = 'destination-out';      // fade old frame to leave trails
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';              // glowing, additive colours
  sparks = sparks.filter(p => p.life > 0);
  for (const p of sparks){
    p.vx *= .97; p.vy = p.vy * .97 + .045;               // drag + gravity
    p.x += p.vx; p.y += p.vy; p.life -= .014;
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.2 * p.life + .6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (sparks.length) raf = requestAnimationFrame(frame);
  else { ctx.clearRect(0, 0, W, H); raf = null; }
}
function celebrate(){
  if (!raf) sizeFx();
  burst(W / 2, H / 2);                                   // first burst: dead centre
  setTimeout(() => burst(W * (.35 + Math.random() * .3), H * (.3 + Math.random() * .2)), 280);
  setTimeout(() => burst(W * (.3 + Math.random() * .4), H * (.4 + Math.random() * .25)), 560);
  if (!raf) raf = requestAnimationFrame(frame);
}
sizeFx();

/* ---------- Keyboard ---------- */
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  const map = { '*':'×', '/':'÷', '-':'−', 'Enter':'=', '=':'=', 'Backspace':'back', 'Escape':'AC', 'Delete':'AC' };
  if (isDigit(k) || k === '.' || k === '+' || k === '%'){ press(k); }
  else if (map[k]){ e.preventDefault(); press(map[k]); }
  else if (k === '(' ){ press('(' ); }
  else return;
  if (k === 'Enter') e.preventDefault();
});
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}