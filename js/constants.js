export const NS = 'http://www.w3.org/2000/svg';

export const SHAPES = [
  {value:'rect',label:'Rectangle',
   svg:'<rect x="3" y="7" width="34" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
  {value:'rounded',label:'Rounded',
   svg:'<rect x="3" y="7" width="34" height="14" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
  {value:'stadium',label:'Stadium / pill',
   svg:'<rect x="3" y="7" width="34" height="14" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
  {value:'subroutine',label:'Subroutine',
   svg:'<rect x="3" y="7" width="34" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="7" x2="8" y2="21" stroke="currentColor" stroke-width="1"/><line x1="32" y1="7" x2="32" y2="21" stroke="currentColor" stroke-width="1"/>'},
  {value:'cylinder',label:'Cylinder / DB',
   svg:'<path d="M6,11 A14,4 0 0 1 34,11 L34,19 A14,4 0 0 1 6,19 Z" fill="none" stroke="currentColor" stroke-width="1.5"/><ellipse cx="20" cy="11" rx="14" ry="4" fill="none" stroke="currentColor" stroke-width="1"/>'},
  {value:'circle',label:'Circle',
   svg:'<ellipse cx="20" cy="14" rx="13" ry="10" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
  {value:'doubleCircle',label:'Double circle',
   svg:'<ellipse cx="20" cy="14" rx="13" ry="10" fill="none" stroke="currentColor" stroke-width="1.5"/><ellipse cx="20" cy="14" rx="9" ry="7" fill="none" stroke="currentColor" stroke-width="1"/>'},
  {value:'asymmetric',label:'Asymmetric / flag',
   svg:'<polygon points="3,7 33,7 38,14 33,21 3,21" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
  {value:'rhombus',label:'Rhombus / decision',
   svg:'<polygon points="20,4 37,14 20,24 3,14" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
  {value:'hexagon',label:'Hexagon',
   svg:'<polygon points="10,7 30,7 37,14 30,21 10,21 3,14" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
  {value:'parallelogram',label:'Parallelogram →',
   svg:'<polygon points="8,7 37,7 32,21 3,21" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
  {value:'parallelogramAlt',label:'Parallelogram ←',
   svg:'<polygon points="3,7 32,7 37,21 8,21" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
  {value:'trapezoid',label:'Trapezoid ∨',
   svg:'<polygon points="8,7 32,7 38,21 2,21" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
  {value:'trapezoidAlt',label:'Trapezoid ∧',
   svg:'<polygon points="2,7 38,7 32,21 8,21" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
  {value:'delay',label:'Delay (D-shape)',
   svg:'<path d="M5,7 L26,7 A10,7 0 0 1 26,21 L5,21 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
  {value:'manualInput',label:'Manual input',
   svg:'<polygon points="5,11 35,7 35,21 5,21" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
  {value:'doc',label:'Document',
   svg:'<path d="M5,7 L35,7 L35,17 Q25,23 20,17 Q15,11 5,17 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
  {value:'display',label:'Display',
   svg:'<path d="M5,7 L30,7 A10,7 0 0 1 30,21 L5,21 L9,14 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
  {value:'hourglass',label:'Hourglass',
   svg:'<polygon points="5,7 35,7 20,14 35,21 5,21 20,14" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
];

export const edgeTokens = {
  'arrow':'-->','line':'---','dotted-arrow':'-.->','dotted-line':'-.-',
  'thick-arrow':'==>','thick-line':'===','circle-arrow':'--o','cross-arrow':'--x',
  'bidirectional':'<-->','circle-both':'o--o','cross-both':'x--x',
  'thick-bidir':'<==>','dotted-bidir':'<-.->'
};

export const tokenToType = Object.fromEntries(
  Object.entries(edgeTokens).map(([k,v]) => [v, k])
);

export const edgeStyles = {
  'arrow':        {dash:false, thick:false, mStart:'none', mEnd:'arrow'},
  'line':         {dash:false, thick:false, mStart:'none', mEnd:'none'},
  'dotted-arrow': {dash:true,  thick:false, mStart:'none', mEnd:'arrow'},
  'dotted-line':  {dash:true,  thick:false, mStart:'none', mEnd:'none'},
  'thick-arrow':  {dash:false, thick:true,  mStart:'none', mEnd:'arrow'},
  'thick-line':   {dash:false, thick:true,  mStart:'none', mEnd:'none'},
  'circle-arrow': {dash:false, thick:false, mStart:'none', mEnd:'circle'},
  'cross-arrow':  {dash:false, thick:false, mStart:'none', mEnd:'cross'},
  'bidirectional':{dash:false, thick:false, mStart:'arrow', mEnd:'arrow'},
  'circle-both':  {dash:false, thick:false, mStart:'circle', mEnd:'circle'},
  'cross-both':   {dash:false, thick:false, mStart:'cross', mEnd:'cross'},
  'thick-bidir':  {dash:false, thick:true,  mStart:'arrow', mEnd:'arrow'},
  'dotted-bidir': {dash:true,  thick:false, mStart:'arrow', mEnd:'arrow'},
};
