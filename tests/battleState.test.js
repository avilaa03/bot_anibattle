const path=require('path');
const ROOT=require('path').join(__dirname,'..','Commands','utils') + require('path').sep;

// --- duplo em memoria do model Battle e do economy ---
let docs=[]; let seq=1;
const saldos={};
function match(d,q){
  for(const [k,v] of Object.entries(q)){
    if(k==='$or') { if(!v.some(sub=>match(d,sub))) return false; continue; }
    if(k==='_id'){
      if(v&&typeof v==='object'&&'$in' in v){ if(!v.$in.map(String).includes(String(d._id))) return false; continue; }
      if(String(d._id)!==String(v)) return false; continue; }
    const val=k.split('.').reduce((o,p)=>o?.[p],d);
    if(v&&typeof v==='object'&&!Array.isArray(v)){
      if('$ne' in v){ const arr=Array.isArray(val)?val.map(String):[String(val)]; if(arr.includes(String(v.$ne))) return false; }
      if('$exists' in v){ if((val!==undefined)!==v.$exists) return false; }
      if('$lt' in v){ if(!(new Date(val)<new Date(v.$lt))) return false; }
      if('$in' in v){ if(!v.$in.map(String).includes(String(val))) return false; }
    } else if(val!==v) return false;
  }
  return true;
}
const Battle={
  async create(o){const d={...o,_id:seq++,createdAt:o.createdAt||new Date()};docs.push(d);return d;},
  async findOne(q){const d=docs.find(x=>match(x,q));return d?{...d,_id:d._id}:null;},
  find(q){const r=docs.filter(x=>match(x,q)).map(d=>({...d}));return{lean:async()=>r,then:(f)=>f(r)};},
  async exists(q){return docs.some(x=>match(x,q))?{_id:1}:null;},
  async findOneAndUpdate(q,u,o){const i=docs.findIndex(x=>match(x,q));if(i<0)return null;
    const d=docs[i];
    if(u.$push)for(const[k,v]of Object.entries(u.$push))(d[k]=d[k]||[]).push(v);
    if(u.$addToSet)for(const[k,v]of Object.entries(u.$addToSet)){d[k]=d[k]||[];if(!d[k].map(String).includes(String(v)))d[k].push(v);}
    for(const[k,v]of Object.entries(u))if(!k.startsWith('$'))d[k]=v;
    return {...d};},
  async updateOne(q,u){const d=docs.find(x=>match(x,q));if(!d)return{modifiedCount:0};
    for(const[k,v]of Object.entries(u))if(!k.startsWith('$'))d[k]=v;return{modifiedCount:1};},
  async deleteOne(q){const i=docs.findIndex(x=>match(x,q));if(i>=0)docs.splice(i,1);return{deletedCount:i>=0?1:0};},
  async deleteMany(q){const antes=docs.length;docs=docs.filter(x=>!match(x,q));return{deletedCount:antes-docs.length};},
};
const BattleCooldown={_m:new Map(),
  async findOne(q){const v=this._m.get(q.pairKey);return v?{pairKey:q.pairKey,lastAt:v}:null;},
  lean(){return this;},
  async findOneAndUpdate(q,u){this._m.set(q.pairKey,u.lastAt);return{};}};
BattleCooldown.findOne=async function(q){const v=this._m.get(q.pairKey);const r=v?{pairKey:q.pairKey,lastAt:v}:null;return{lean:async()=>r};};

require.cache[require.resolve(ROOT+'battleSchema.js')]={exports:{Battle,BattleCooldown}};
require.cache[require.resolve(ROOT+'economy.js')]={exports:{
  addBalance:async(id,a)=>{saldos[id]=(saldos[id]||0)+a;return{balance:saldos[id]};},
  trySpend:async(id,a)=>{if((saldos[id]||0)<a)return null;saldos[id]-=a;return{balance:saldos[id]};},
  MIN_WAGER:10,MARKET_TAX_RATE:0.05,applyMarketTax:p=>({total:p,tax:Math.floor(p*0.05),sellerReceives:p-Math.floor(p*0.05)})}};

const S=require(ROOT+'battleState.js');

(async()=>{
let falhas=0;
const check=(nome,cond,extra='')=>{console.log(`  ${cond?'OK  ':'FALHOU'} ${nome} ${extra}`);if(!cond)falhas++;};

console.log('=== 1. Restart com batalha pendente devolve as apostas ===');
saldos['A']=0;saldos['B']=0;
await S.createBattle('b1',{id:'A',username:'A'},{id:'B',username:'B'},'canal',100);
// simula que as apostas ja foram debitadas (escrow)
const rec=await S.recoverPendingBattles();
check('devolveu 200 no total',rec.devolvido===200,`(devolvido=${rec.devolvido})`);
check('A recebeu 100 de volta',saldos['A']===100);
check('B recebeu 100 de volta',saldos['B']===100);
check('batalha foi apagada',(await S.getBattle('b1'))===null);

console.log('\n=== 2. Nao devolve duas vezes ===');
saldos['C']=0;saldos['D']=0;
await S.createBattle('b2',{id:'C',username:'C'},{id:'D',username:'D'},'canal',50);
await S.releaseWager('b2');   // vencedor ja foi pago
const rec2=await S.recoverPendingBattles();
check('nao devolveu (wagerHeld=false)',saldos['C']===0&&saldos['D']===0,`(C=${saldos['C']} D=${saldos['D']})`);

console.log('\n=== 3. Deck nunca passa de 3 cartas ===');
await S.createBattle('b3',{id:'E',username:'E'},{id:'F',username:'F'},'canal',10);
const carta=n=>({_id:'card'+n,name:'C'+n,series:'S',rarity:'rare',overall:60,ATA:60,LIF:120,POW:50});
let aceitas=0;
for(let n=1;n<=5;n++){ if(await S.addCardToDeck('b3','X',carta(n))) aceitas++; }
const b3=await S.getBattle('b3');
check('so 3 cartas aceitas',aceitas===3,`(aceitas=${aceitas})`);
check('deckX tem exatamente 3',b3.deckX.length===3);

console.log('\n=== 4. Mesma carta nao entra duas vezes ===');
await S.createBattle('b4',{id:'G',username:'G'},{id:'H',username:'H'},'canal',10);
await S.addCardToDeck('b4','X',carta(1));
const dup=await S.addCardToDeck('b4','X',carta(1));
const b4=await S.getBattle('b4');
check('duplicata recusada',dup===null&&b4.deckX.length===1);

console.log('\n=== 5. Resolucao so pode ser reivindicada uma vez ===');
await S.createBattle('b5',{id:'I',username:'I'},{id:'J',username:'J'},'canal',10);
const c1=await S.claimForResolution('b5');
const c2=await S.claimForResolution('b5');
check('primeiro claim funciona',c1!==null);
check('segundo claim e recusado (sem pagamento duplo)',c2===null);

console.log('\n=== 6. cancelBattle devolve exatamente uma vez ===');
saldos['K']=0;saldos['L']=0;
await S.createBattle('b6',{id:'K',username:'K'},{id:'L',username:'L'},'canal',75);
await S.cancelBattle('b6');
await S.cancelBattle('b6'); // segunda chamada nao deve pagar de novo
check('K recebeu 75 (uma vez so)',saldos['K']===75,`(K=${saldos['K']})`);
check('L recebeu 75 (uma vez so)',saldos['L']===75,`(L=${saldos['L']})`);

console.log('\n=== 7. Varredura de batalha abandonada ===');
saldos['M']=0;saldos['N']=0;
const velha=await S.createBattle('b7',{id:'M',username:'M'},{id:'N',username:'N'},'canal',30);
docs.find(d=>d.battleId==='b7').createdAt=new Date(Date.now()-60*60*1000);
const sw=await S.sweepStaleBattles();
check('cancelou a abandonada',sw.canceladas===1);
check('devolveu 60',sw.devolvido===60&&saldos['M']===30&&saldos['N']===30);

console.log('\n=== 8. Uma batalha ativa por jogador ===');
await S.createBattle('b8',{id:'O',username:'O'},{id:'P',username:'P'},'canal',10);
check('detecta jogador ocupado',await S.temBatalhaAtiva('O')===true);
check('detecta jogador livre',await S.temBatalhaAtiva('ZZZ')===false);

console.log(falhas===0?'\n*** TODOS OS TESTES PASSARAM ***':`\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas?1:0);
})();
