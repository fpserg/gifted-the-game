# Usage: python3 scripts/measure-tactician-browser.py [games=60] [chrome=/usr/bin/google-chrome] [strategy=tactician]
# GIFTED-004B (#42), 004C (#46), optional: AI planning time (Tactician or Strategist vs Novice) in headless Chrome with CDP CPU throttling
# (rates 1x, 4x, 6x). An emulation on this machine, NOT a smartphone measurement. Needs Python Playwright.
import json,sys
from playwright.sync_api import sync_playwright
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),".."))
N=int(sys.argv[1]) if len(sys.argv)>1 else 60
CHROME=sys.argv[2] if len(sys.argv)>2 else "/usr/bin/google-chrome"
STRAT=sys.argv[3] if len(sys.argv)>3 else "tactician"
assert STRAT.isidentifier()
src=open('tutorial.js').read()+'\n'+open('game.js').read()
js="""async ([src,n])=>{
 const ev=new Function('document',src+'\\n;return (code)=>eval(code);')(undefined);
 let x=1;const rnd=()=>((x=(Math.imul(x,1664525)+1013904223)>>>0)/4294967296);const real=Math.random;
 ev("globalThis.__t=[];const __p=AI_STRATEGIES.__STRAT__.plan;AI_STRATEGIES.__STRAT__=Object.freeze({...AI_STRATEGIES.__STRAT__,plan(c){const s=performance.now();__p(c);__t.push(performance.now()-s);}});FAST=true;");
 for(let g=0;g<n;g++){x=g+11;Math.random=rnd;const seat=g%2?'e':'p';ev(`setAiStrategy('p','novice');setAiStrategy('e','novice');setAiStrategy('${seat}','__STRAT__');newGame('${['eng','ast','kee'][g%3]}')`);
  for(let i=0;i<6;i++)await ev("(async()=>{aiPlan('p');await endTurn()})()");}
 Math.random=real;const t=ev('__t').slice().sort((a,b)=>a-b),q=p=>Math.round(t[Math.min(t.length-1,Math.floor(t.length*p))]*10)/10;
 return {calls:t.length,p50:q(.5),p95:q(.95),max:q(1),ua:navigator.userAgent};
}"""
with sync_playwright() as p:
  b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox'],headless=True)
  out={}
  for rate in [1,4,6]:
    pg=b.new_page();cdp=pg.context.new_cdp_session(pg);cdp.send('Emulation.setCPUThrottlingRate',{'rate':rate})
    pg.goto('about:blank');out[rate]=pg.evaluate(js.replace('__STRAT__',STRAT),[src,N]);pg.close()
  b.close()
print(json.dumps(out,ensure_ascii=False))
