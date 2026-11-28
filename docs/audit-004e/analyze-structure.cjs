#!/usr/bin/env node
// GIFTED-004E (#48), stage A: structural audit of the browser game (game.js, tutorial.js), read-only.
// Inspired by deslop-please (module-cycle, tangle, field-leak, shallow-module) for one-file JavaScript:
// "modules" are the logical sections of game.js (line ranges below) and tutorial.js. Uses the TypeScript
// compiler API (no new dependency in the repository; run with any installed `typescript`) to resolve every
// identifier to its declaration. Not part of CI; output is docs/audit-004e/structure.json.
// Usage: node docs/audit-004e/analyze-structure.cjs [--ts=<path to typescript>] [--out=<file>]
'use strict';
const fs=require('fs'),path=require('path');
const arg=k=>{const a=process.argv.find(x=>x.startsWith(`--${k}=`));return a&&a.slice(k.length+3);};
const ts=require(arg('ts')||'typescript');
const ROOT=path.join(__dirname,'..','..');
// Logical sections of game.js (headers /* === … === */ and the UI split into render / screens / input).
const SECTIONS=[['data',1,75],['rules-state',76,152],['ai-core',153,237],['ai-tactician',238,386],['ai-strategist',387,662],
 ['astro',663,766],['reveal-match',767,857],['ui-render',858,942],['ui-screens',943,1017],['ui-input',1018,1e9]];
const FILES=['game.js','tutorial.js'];
const program=ts.createProgram(FILES.map(f=>path.join(ROOT,f)),{allowJs:true,checkJs:false,noEmit:true,target:ts.ScriptTarget.ES2022,lib:['lib.es2022.d.ts','lib.dom.d.ts']});
const checker=program.getTypeChecker();
const src=f=>program.getSourceFile(path.join(ROOT,f));
const lineOf=(sf,pos)=>sf.getLineAndCharacterOfPosition(pos).line+1;
const sectionOf=(file,line)=>file==='tutorial.js'?'tutorial':SECTIONS.find(([,a,b])=>line>=a&&line<=b)[0];

// 1. Top-level declarations.
const decls=new Map(); // symbol -> {name,file,line,end,section,kind,mutable,chars}
for(const f of FILES){const sf=src(f);
 for(const st of sf.statements){
  const add=(nameNode,kind,node,mutable)=>{const sym=checker.getSymbolAtLocation(nameNode);if(!sym)return;
   const line=lineOf(sf,node.getStart(sf)),end=lineOf(sf,node.end);
   decls.set(sym,{name:nameNode.text,file:f,line,end,section:sectionOf(f,line),kind,mutable,chars:node.getText(sf).length,node});};
  if(ts.isFunctionDeclaration(st)&&st.name)add(st.name,'function',st,false);
  else if(ts.isVariableStatement(st)){const mutable=!(st.declarationList.flags&ts.NodeFlags.Const);
   for(const d of st.declarationList.declarations)if(ts.isIdentifier(d.name)){
    const init=d.initializer,isFn=init&&(ts.isArrowFunction(init)||ts.isFunctionExpression(init));
    add(d.name,isFn?'function':mutable?'let':'const',d,mutable);}}
  else if(ts.isClassDeclaration(st)&&st.name)add(st.name,'class',st,false);
 }}
const byName=new Map([...decls.values()].map(d=>[d.name,d]));

// 2. References from each top-level statement (and from each declaration) to top-level declarations.
const refs=[];// {from:decl|null, fromSection, to:decl, write:boolean, line}
const gField={};// section -> {read:Set, write:Set} of G.<field>
const dom={},rng={},timers={},aiG={};
const isWrite=id=>{const p=id.parent;
 if(ts.isBinaryExpression(p)&&p.left===id&&p.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&p.operatorToken.kind<=ts.SyntaxKind.LastAssignment)return true;
 if((ts.isPrefixUnaryExpression(p)||ts.isPostfixUnaryExpression(p))&&(p.operator===ts.SyntaxKind.PlusPlusToken||p.operator===ts.SyntaxKind.MinusMinusToken))return true;
 return false;};
// Is node the target (or the base of the target) of an assignment / update / delete?
const assignedBase=node=>{let n=node;while(n.parent&&(ts.isPropertyAccessExpression(n.parent)||ts.isElementAccessExpression(n.parent))&&n.parent.expression===n)n=n.parent;
 const p=n.parent;if(!p)return false;
 if(ts.isBinaryExpression(p)&&p.left===n&&p.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&p.operatorToken.kind<=ts.SyntaxKind.LastAssignment)return true;
 if((ts.isPrefixUnaryExpression(p)||ts.isPostfixUnaryExpression(p))&&(p.operator===ts.SyntaxKind.PlusPlusToken||p.operator===ts.SyntaxKind.MinusMinusToken))return true;
 if(ts.isDeleteExpression(p))return true;
 // mutating array methods on G.x (push, splice, …)
 if(ts.isPropertyAccessExpression(p)&&p.expression===n&&/^(push|pop|shift|unshift|splice|sort|reverse|fill|set|delete|add|clear)$/.test(p.name.text)&&ts.isCallExpression(p.parent))return true;
 return false;};
const bump=(o,s,k)=>{(o[s]=o[s]||{})[k]=(o[s][k]||0)+1;};
for(const f of FILES){const sf=src(f);
 for(const st of sf.statements){
  // the declaration that owns this statement (for function-level edges)
  const own=[...decls.values()].filter(d=>d.file===f&&d.node.getStart(sf)>=st.getStart(sf)&&d.node.end<=st.end);
  const ownerAt=pos=>own.find(d=>pos>=d.node.getStart(sf)&&pos<=d.node.end)||null;
  const visit=n=>{
   if(ts.isIdentifier(n)){
    const sym=checker.getSymbolAtLocation(n),d=sym&&decls.get(sym);
    const line=lineOf(sf,n.getStart(sf)),from=ownerAt(n.getStart(sf)),fromSection=sectionOf(f,line);
    if(d&&!(from&&from.node.name===n)&&d.node.name!==n)refs.push({from,fromSection,to:d,write:isWrite(n),line,file:f});
    if(n.text==='G'&&d&&ts.isPropertyAccessExpression(n.parent)&&n.parent.expression===n){
     const fld=n.parent.name.text,s=(gField[fromSection]=gField[fromSection]||{read:{},write:{}});
     (assignedBase(n.parent)?s.write:s.read)[fld]=((assignedBase(n.parent)?s.write:s.read)[fld]||0)+1;}
    const keyOnly=(ts.isPropertyAccessExpression(n.parent)&&n.parent.name===n)||(ts.isPropertyAssignment(n.parent)&&n.parent.name===n);
    if(!d&&!keyOnly&&/^(document|window|localStorage|navigator|location|requestAnimationFrame|matchMedia)$/.test(n.text))bump(dom,fromSection,n.text);
    if(d&&d.name==='G'&&from&&/^ai-/.test(fromSection))(aiG[from.name]=aiG[from.name]||{section:fromSection,line:from.line,refs:0}).refs++;
    if(!d&&/^(setTimeout|setInterval|clearTimeout|Date)$/.test(n.text)&&!(ts.isPropertyAccessExpression(n.parent)&&n.parent.name===n))bump(timers,fromSection,n.text);
   }
   if(ts.isPropertyAccessExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='Math'&&n.name.text==='random')bump(rng,sectionOf(f,lineOf(sf,n.getStart(sf))),'Math.random');
   if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='$')bump(dom,sectionOf(f,lineOf(sf,n.getStart(sf))),'$()');
   ts.forEachChild(n,visit);};
  visit(st);
 }}

// 3. Section graph, cycles (Tarjan SCC), tangles (mutual section pairs), fan-in/out.
const secNames=[...SECTIONS.map(s=>s[0]),'tutorial'];
const edges={};for(const s of secNames)edges[s]={};
for(const r of refs){if(r.fromSection===r.to.section)continue;edges[r.fromSection][r.to.section]=(edges[r.fromSection][r.to.section]||0)+1;}
let idx=0;const I={},low={},on=new Set(),stack=[],sccs=[];
const strong=v=>{I[v]=low[v]=idx++;stack.push(v);on.add(v);
 for(const w of Object.keys(edges[v])){if(I[w]===undefined){strong(w);low[v]=Math.min(low[v],low[w]);}else if(on.has(w))low[v]=Math.min(low[v],I[w]);}
 if(low[v]===I[v]){const c=[];let w;do{w=stack.pop();on.delete(w);c.push(w);}while(w!==v);sccs.push(c);}};
for(const s of secNames)if(I[s]===undefined)strong(s);
const tangles=[];for(const a of secNames)for(const b of secNames)if(a<b&&edges[a][b]&&edges[b][a])tangles.push({a,b,aToB:edges[a][b],bToA:edges[b][a],
 examplesAtoB:[...new Set(refs.filter(r=>r.fromSection===a&&r.to.section===b).map(r=>r.to.name))].slice(0,8),
 examplesBtoA:[...new Set(refs.filter(r=>r.fromSection===b&&r.to.section===a).map(r=>r.to.name))].slice(0,8)});

// 4. Interfaces: per section, declarations used from other sections ("exports") vs. internal ones.
const iface={};
for(const s of secNames){const own=[...decls.values()].filter(d=>d.section===s);
 const ext=own.filter(d=>refs.some(r=>r.to===d&&r.fromSection!==s));
 iface[s]={declarations:own.length,usedOutside:ext.length,lines:own.reduce((a,d)=>a+d.end-d.line+1,0),chars:own.reduce((a,d)=>a+d.chars,0),
  exported:ext.map(d=>({name:d.name,users:[...new Set(refs.filter(r=>r.to===d&&r.fromSection!==s).map(r=>r.fromSection))]}))};}

// 5. Mutable global state: who writes each top-level `let` (reassignment) — field-leak across sections.
const mutables=[...decls.values()].filter(d=>d.mutable).map(d=>({name:d.name,section:d.section,line:d.line,
 writtenBy:[...new Set(refs.filter(r=>r.to===d&&r.write).map(r=>r.fromSection))],
 readBy:[...new Set(refs.filter(r=>r.to===d&&!r.write).map(r=>r.fromSection))]}));
// G fields: sections that write each field.
const gWriters={};for(const [s,x] of Object.entries(gField))for(const k of Object.keys(x.write))(gWriters[k]=gWriters[k]||new Set()).add(s);
const gFields=Object.fromEntries(Object.entries(gWriters).map(([k,v])=>[k,[...v].sort()]).sort());

// 6. Function-level metrics: largest functions, fan-in.
const fns=[...decls.values()].filter(d=>d.kind==='function').map(d=>({name:d.name,file:d.file,line:d.line,section:d.section,lines:d.end-d.line+1,chars:d.chars,
 fanIn:new Set(refs.filter(r=>r.to===d&&r.from&&r.from!==d).map(r=>r.from.name)).size,
 fanOut:new Set(refs.filter(r=>r.from===d&&r.to!==d).map(r=>r.to.name)).size}));
const largest=[...fns].sort((a,b)=>b.chars-a.chars).slice(0,15);
const hubs=[...fns].sort((a,b)=>b.fanIn-a.fanIn).slice(0,15);

// 7. Function-level cycles across sections (examples of call edges that close a section cycle).
const fnEdges=[];for(const r of refs)if(r.from&&r.to.kind==='function'&&r.from.section!==r.to.section)fnEdges.push(`${r.from.section}:${r.from.name} -> ${r.to.section}:${r.to.name}`);
const crossCalls={};for(const e of new Set(fnEdges)){const [a,b]=e.split(' -> ');const k=a.split(':')[0]+' -> '+b.split(':')[0];(crossCalls[k]=crossCalls[k]||[]).push(e);}

const out={generated:new Date().toISOString(),typescript:ts.version,files:Object.fromEntries(FILES.map(f=>[f,{lines:fs.readFileSync(path.join(ROOT,f),'utf8').split('\n').length,chars:fs.statSync(path.join(ROOT,f)).size}])),
 sections:SECTIONS.map(([n,a,b])=>({name:n,from:a,to:Math.min(b,src('game.js').getLineAndCharacterOfPosition(src('game.js').end).line+1)})),
 declarations:decls.size,references:refs.length,sectionEdges:edges,stronglyConnected:sccs.filter(c=>c.length>1),tangles,interfaces:iface,
 mutableGlobals:mutables,aiFunctionsReadingG:aiG,gFieldWriters:gFields,dom,timers,rng,largestFunctions:largest,mostUsedFunctions:hubs,crossSectionCalls:crossCalls};
const file=arg('out')||path.join(__dirname,'structure.json');
fs.writeFileSync(file,JSON.stringify(out,null,1)+'\n');
console.log(`declarations ${decls.size}, references ${refs.length}; section cycles: ${out.stronglyConnected.map(c=>c.join('↔')).join(' | ')||'none'}; tangles ${tangles.length}; wrote ${path.relative(process.cwd(),file)}`);
