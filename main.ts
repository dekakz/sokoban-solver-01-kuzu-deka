import fs from'node:fs'
let E=process.env,I=E.MAKEFUN_INPUT_DIR,O=E.MAKEFUN_OUTPUT_DIR
for(let n=0;++n<6;){
let t=fs.readFileSync(I+'/i00'+n+'/level.txt','utf8'),W=t.indexOf('\n')+1,B=[],P=0
for(let j=t.length;j--;){let c=t[j];if(c=='$'||c=='*')B.push(j);if(c=='@'||c=='+')P=j}
let H=P/W|0,D=[-W,W,-1,1],w=j=>'#\n'.includes(t[j])
let F=(s,ok,m=new Set([s]))=>{for(let k=4;k--;){let y=s+D[k];if(!m.has(y)&&ok(y))m.add(y),F(y,ok,m)}return m}
let u='',cu=[...B],pl=P,dn=[]
for(let b of B){if(dn.includes(b))continue;let M=F(b,j=>!w(j)&&(j/W|0)!==H)
let R2=F(pl,j=>!w(j)&&!cu.includes(j))
let A=[],GM=0,BM=0,GL=[],ci=0
for(let c of M){let b=A[c]=2**ci++;if(t[c]>='*'){GM+=b;GL.push(c)}if(t[c]=='$'||t[c]=='*'){BM+=b;dn.push(c)}}
let par=new Map([[BM*1024+pl,'']]),Q=[[BM,pl]],N=[],mv=0
while(Q.length&&!mv){for(let[bm,p]of Q){
if(bm==GM){mv=par.get(bm*1024+p);pl=p;break}
for(let d=4;d--;){let np=p+D[d];if(!M.has(np)&&!R2.has(np))continue;let b=A[np],nm=bm,X=Q
if(bm/b&1){let z=np+D[d],b2=A[z];if(!b2||bm/b2&1)continue;nm=bm-b+b2;X=N}
let nk=nm*1024+np
if(!par.has(nk))par.set(nk,par.get(bm*1024+p)+'udlr'[d]),X.push([nm,np])}}
Q=N;N=[]}
if(!mv)throw'x'
u+=mv;cu=cu.filter(x=>!M.has(x)).concat(GL)
}
let o=O+'/i00'+n;fs.mkdirSync(o,{recursive:!0});fs.writeFileSync(o+'/solution.txt',u)
}
