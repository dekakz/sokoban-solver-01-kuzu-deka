import fs from'node:fs'
let E=process.env,I=E.MAKEFUN_INPUT_DIR,O=E.MAKEFUN_OUTPUT_DIR
for(let n=1;n<6;n++){
let d='i00'+n,t=fs.readFileSync(I+'/'+d+'/level.txt','utf8'),Q=t.indexOf('\n')+1,N=t.length,W=j=>j<0||j>=N||'#\n'.includes(t[j]),F=[-Q,Q,-1,1],C='udlr',B=[],P=0,p=O+'/'+d
for(let j=0,c;j<N;j++){c=t[j];if(c=='$'||c=='*')B.push(j);if(c=='@'||c=='+')P=j}
let H=P/Q|0,L=(s,o)=>{let m=new Map([[s,'']]),q=[s];for(let j of q)for(let k=0;k<4;k++){let v=j+F[k];if(!m.has(v)&&o(v)){m.set(v,m.get(j)+C[k]);q.push(v)}}return m},R=[]
for(let b of B){if(R.some(r=>r[2].includes(b)))continue;let M=L(b,j=>!W(j)&&j/Q|0!=H),rb=B.filter(x=>M.has(x));if(!rb.length)continue;let e=0;for(let j=H*Q;j<(H+1)*Q;j++)if(!W(j)&&(M.has(j-Q)||M.has(j+Q))){e=j;break}if(e)R.push([M,e,rb])}
let u='',cu=[...B],pl=P
for(let r of R){let[M,e,b]=r,W2=L(pl,j=>!W(j)&&!cu.includes(j));u+=W2.get(e)||'';pl=e
M.set(e,'');let gs=new Set([...M.keys()].filter(x=>t[x]=='.'||t[x]=='*')),D=[];for(let g of gs){let d=new Array(N).fill(-1),q=[g];d[g]=0;for(let y of q)for(let o of F){let v=y+o;if(M.has(v)&&d[v]<0){d[v]=d[y]+1;q.push(v)}}D.push(d)};let al=new Set(gs),aq=[...gs];for(let y of aq)for(let o of F){let x=y-o;if(x!=e&&M.has(x)&&M.has(y-2*o)&&!al.has(x)){al.add(x);aq.push(x)}};let E=(b,i=0,c=0,u=0)=>{if(i==b.length)return c;let m=1/0;for(let j=0;j<b.length;j++){if(u>>j&1)continue;let d=D[j][b[i]];if(d<0)continue;let r=E(b,i+1,c+d,u|1<<j);if(r<m)m=r}return m};let Bk=[],cf=0,cn=1,sn=new Set(),sl=null;Bk[E(b)]=[[b,pl,'']]
while(!sl&&cn){cf=0;while(!Bk[cf]||!Bk[cf].length)cf++;let[bx,p,mv]=Bk[cf].pop();cn--;if(bx.every(x=>gs.has(x))){sl=[mv,bx,p];break}let Rm=L(p,j=>M.has(j)&&!bx.includes(j)),ky=bx+'|'+Math.min(...Rm.keys()),he=E(bx);if(sn.has(ky))continue;sn.add(ky);let _d=0;for(let x of bx){if(gs.has(x))continue;for(let t of[x,x-1,x-Q,x-Q-1]){if([t,t+1,t+Q,t+Q+1].every(y=>W(y)||bx.includes(y))){_d=1;break}}if(_d)break}if(_d)continue;for(let i=0;i<bx.length;i++)for(let k=0;k<4;k++){let o=F[k],z=bx[i]+o;if(!M.has(z)||bx.includes(z)||!al.has(z))continue;let pp=bx[i]-o;if(!Rm.has(pp))continue;let nb=[...bx];nb[i]=z;let f=cf-he+1+E(nb);(Bk[f]||(Bk[f]=[])).push([nb,bx[i],mv+Rm.get(pp)+C[k]]);cn++}}if(sl)u+=sl[0],pl=sl[2],cu=cu.filter(x=>!b.includes(x)).concat(sl[1])}
fs.mkdirSync(p,{recursive:true});fs.writeFileSync(p+'/solution.txt',u)
}
