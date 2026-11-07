import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Build-time only: capture the data used by the existing update functions.
// The browser receives ordinary compiled functions, never eval or source strings.
export function createSnapshotCompiler(root) {
  const files=fs.readdirSync(path.join(root,'src')).filter(f=>f.endsWith('.ts')).map(f=>path.join(root,'src',f));
  const program=ts.createProgram(files,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,skipLibCheck:true});
  const checker=program.getTypeChecker(),printer=ts.createPrinter(),definitions=new Map(),captures=new WeakMap();
  globalThis.__captureCampus=(fn,key,bindings)=>{captures.set(fn,{key,bindings});return fn;};
  const isReference=node=>{
    const p=node.parent;
    if(ts.isPropertyAccessExpression(p)&&p.name===node)return false;
    if((ts.isPropertyAssignment(p)||ts.isMethodDeclaration(p))&&p.name===node)return false;
    if(ts.isVariableDeclaration(p)&&p.name===node||ts.isParameter(p)&&p.name===node||ts.isFunctionDeclaration(p)&&p.name===node)return false;
    if(ts.isBindingElement(p)&&p.name===node)return false;
    return true;
  };
  function describe(fn,file){
    const deps=new Map(),refs=new Set();
    function walk(n){
      if(ts.isTypeNode(n))return;
      if(ts.isIdentifier(n)&&isReference(n)){
        const symbol=ts.isShorthandPropertyAssignment(n.parent)?checker.getShorthandAssignmentValueSymbol(n.parent):checker.getSymbolAtLocation(n),decls=symbol?.getDeclarations()??[];
        if(decls.length&&!decls.some(d=>d.getSourceFile()===file&&d.pos>=fn.pos&&d.end<=fn.end)){
          if(decls.some(d=>d.getSourceFile().fileName.replaceAll('\\','/').includes('/src/'))){deps.set(n.text,n);refs.add(n);}
        }
      }
      ts.forEachChild(n,walk);
    }
    for(const p of fn.parameters)if(p.initializer)walk(p.initializer);
    walk(fn.body);
    const key=path.basename(file.fileName)+':'+fn.pos;
    definitions.set(key,{fn,file,deps,refs});return{key,deps};
  }
  function compile(fileName){
    const file=program.getSourceFile(fileName);if(!file)throw Error('Missing source '+fileName);
    const transformed=ts.transform(file,[context=>{
      const f=context.factory;
      const register=(fn,key,deps)=>f.createCallExpression(f.createPropertyAccessExpression(f.createIdentifier('globalThis'),'__captureCampus'),undefined,[fn,f.createStringLiteral(key),f.createArrowFunction(undefined,undefined,[],undefined,f.createToken(ts.SyntaxKind.EqualsGreaterThanToken),f.createParenthesizedExpression(f.createObjectLiteralExpression([...deps.keys()].map(k=>f.createShorthandPropertyAssignment(k)))))]);
      function visit(node){
        if(ts.isFunctionDeclaration(node)&&node.body&&node.name){
          const info=describe(node,file),next=ts.visitEachChild(node,visit,context);
          return[next,f.createExpressionStatement(register(f.createIdentifier(node.name.text),info.key,info.deps))];
        }
        if((ts.isArrowFunction(node)||ts.isFunctionExpression(node))&&node.body){
          const info=describe(node,file),next=ts.visitEachChild(node,visit,context);
          return register(next,info.key,info.deps);
        }
        if(ts.isMethodDeclaration(node)&&node.body&&node.parent&&ts.isObjectLiteralExpression(node.parent)){
          const info=describe(node,file),next=ts.visitEachChild(node,visit,context);
          return f.createPropertyAssignment(node.name,register(f.createFunctionExpression(undefined,node.asteriskToken,undefined,node.typeParameters,node.parameters,node.type,next.body),info.key,info.deps));
        }
        return ts.visitEachChild(node,visit,context);
      }
      return node=>ts.visitNode(node,visit);
    }]);
    const code=printer.printFile(transformed.transformed[0]);transformed.dispose();
    return ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  }
  function emit(keys){
    const rows=[];
    for(const key of keys){
      const {fn,file,refs}=definitions.get(key);
      const transformed=ts.transform(fn,[context=>{
        const f=context.factory;
        function visit(node){
          if(ts.isTypeNode(node))return node;
          if(ts.isShorthandPropertyAssignment(node)&&refs.has(node.name))return f.createPropertyAssignment(node.name,f.createPropertyAccessExpression(f.createIdentifier('__env'),node.name.text));
          if(refs.has(node))return f.createPropertyAccessExpression(f.createIdentifier('__env'),node.text);
          return ts.visitEachChild(node,visit,context);
        }
        return node=>ts.visitNode(node,visit);
      }]);
      let node=transformed.transformed[0];
      if(ts.isFunctionDeclaration(node)||ts.isMethodDeclaration(node))node=ts.factory.createFunctionExpression(undefined,node.asteriskToken,ts.isIdentifier(node.name)?node.name:undefined,node.typeParameters,node.parameters,node.type,node.body);
      const code=printer.printNode(ts.EmitHint.Expression,node,file);
      rows.push(`${JSON.stringify(key)}: (__env) => (${code})`);transformed.dispose();
    }
    return '// @ts-nocheck\n// Generated from the existing campus functions during the build.\nexport const updaters = {\n'+rows.join(',\n')+'\n};\n';
  }
  return{compile,captures,emit};
}
