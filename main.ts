import fs from'node:fs'
let E=process.env,I=E.MAKEFUN_INPUT_DIR,O=E.MAKEFUN_OUTPUT_DIR
for(let n=0;++n<6;){
let t=fs.readFileSync(I+'/i00'+n+'/level.txt','utf8'),Q=t.search(/\n/)+1,W=j=>'#\n'.includes(t[j]),F=[-Q,Q,-1,1],B=[],P=0,p=O+'/i00'+n
for(let j=t.length,c;j--;){c=t[j];if(c=='$'||c=='*')B.push(j);if(c=='@'||c=='+')P=j}
let H=P/Q|0,L=(s,o)=>{let m=new Map([[s,'']]),q=[s];for(let j of q)for(let k=4;k--;){let v=j+F[k];if(!m.has(v)&&o(v)){m.set(v,m.get(j)+'udlr'[k]);q.push(v)}}return m},R=[]
for(let b of B){if(R.some(r=>r[2].includes(b)))continue;let M=L(b,j=>!W(j)&&(j/Q|0)!=H),rb=B.filter(x=>M.has(x)),e=0;for(let j=H*Q;j<(H+1)*Q&&!e;j++)if(!W(j)&&(M.has(j-Q)||M.has(j+Q)))e=j;if(e)R.push([M,e,rb])}
let u='',cu=[...B],pl=P
for(let r of R){let[M,e,b]=r,W2=L(pl,j=>!W(j)&&!cu.includes(j));u+=W2.get(e)||'';pl=e
M.set(e,'');let D=[...M.keys()].filter(x=>t[x]=='.'||t[x]=='*').map(g=>L(g,j=>M.has(j))),Y=b=>b.reduce((s,x)=>s+Math.min(...D.map(d=>(d.get(x)??{length:1/0}).length)),0),S=[[b,pl,-1]],K={[Y(b)]:[0]},sn=new Set(),sl=-1
while(sl<0){let cf=0;while(!K[cf]?.length)cf++;if(cf>1e3)break;let x=K[cf].pop(),[bx,p]=S[x],Rm=L(p,j=>M.has(j)&&!bx.includes(j)),ky=bx+'|'+Math.min(...Rm.keys()),he=Y(bx);if(!he){sl=x;break}if(sn.has(ky))continue;sn.add(ky);for(let i=4;i--;)for(let k=4;k--;){let z=bx[i]+F[k];if(!M.has(z)||bx.includes(z))continue;let q2=bx[i]-F[k];if(!Rm.has(q2))continue;let nb=[...bx];nb[i]=z;let f=cf-he+1+Y(nb);(K[f]||(K[f]=[])).push(S.length);S.push([nb,bx[i],x,q2,k])}}if(sl>-1){let mv='',y=sl;while(y>0){let nd=S[y],pr=S[nd[2]];mv=L(pr[1],j=>M.has(j)&&!pr[0].includes(j)).get(nd[3])+'udlr'[nd[4]]+mv;y=nd[2]}u+=mv;pl=S[sl][1];cu=cu.filter(x=>!b.includes(x)).concat(S[sl][0])}}
fs.mkdirSync(p,{recursive:true});fs.writeFileSync(p+'/solution.txt',u)
}
