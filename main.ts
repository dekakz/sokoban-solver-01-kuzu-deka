import fs from'node:fs'
let{MAKEFUN_INPUT_DIR:I,MAKEFUN_OUTPUT_DIR:O}=process.env
for(let n=6;--n;){
let t=fs.readFileSync(I+'/i00'+n+'/level.txt')+'',W=t.search('\n')+1,cu=[],P=t.indexOf('@')
for(let j=t.length;j--;)t[j]>'#'&&t[j]<'-'&&cu.push(j)
let H=P/W|0,D=[-W,W,-1,1],w=j=>'#\n'.includes(t[j])
let u='',pl=P,dn=[]
for(let b of cu){if(dn.includes(b))continue
let M=new Set(),A=[],G=0,S=0,L=[],x=1,F=s=>{if(M.has(s)||w(s)||(s/W|0)==H)return;M.add(s);A[s]=x;t[s]>'$'&&(G+=x,L.push(s));t[s]>'#'&&t[s]<'-'&&(S+=x,dn.push(s));x*=2;for(let e of D)F(s+e)}
F(b)
let Q=[[S,pl,'']],N=[],V=new Set(),mv=0
while(Q.length&&!mv){for(let[s,p,pa]of Q){if(s==G){mv=pa;pl=p;break}
for(let d=4;d--;){let q=p+D[d],r=s,X=Q,y;if(!M.has(q)&&(w(q)||cu.includes(q)))continue
if(s/A[q]&1){y=A[q+D[d]];if(!y|s/y&1)continue;r=s-A[q]+y;X=N}
let k=r*1024+q;if(!V.has(k))V.add(k),X.push([r,q,pa+'udlr'[d]])}}Q=N;N=[]}
u+=mv;cu=cu.filter(x=>!M.has(x)).concat(L)}
let o=O+'/i00'+n;fs.mkdirSync(o,{recursive:!0});fs.writeFileSync(o+'/solution.txt',u)}
