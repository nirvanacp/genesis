import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import {API} from 'typescript/unstable/sync';
import {isCallExpression,isPropertyAccessExpression} from 'typescript/unstable/ast';
import {readdir,readFile} from 'node:fs/promises';
import { readApplet, requireValue, containedFile } from './manifest.mjs';
const require = createRequire(import.meta.url);
export async function checkApplet(directory) {
  const applet = await readApplet(directory);
  const config = await containedFile(applet.base, 'tsconfig.json');
  const compiler = path.join(path.dirname(require.resolve('typescript/package.json')), 'lib/tsc.js');
  const result = spawnSync(process.execPath, [compiler, '-p', config, '--noEmit'], { cwd: applet.base, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  requireValue(!result.error && result.status === 0, `TypeScript check failed\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  if(applet.manifest.schemaVersion===3){
    const api=new API({cwd:applet.base});
    try {
      const snapshot=api.updateSnapshot({openProjects:[config]});const project=snapshot.getProject(config);
      requireValue(project,'Cannot inspect applet syntax');
      for(const file of project.program.getSourceFileNames()){
        if(!file.startsWith(applet.base+path.sep)||file.includes(path.sep+'node_modules'+path.sep))continue;
        const source=project.program.getSourceFile(file);if(!source)continue;
        const visit=node=>{if(isCallExpression(node)&&isPropertyAccessExpression(node.expression)&&node.expression.name.text==='open'&&isPropertyAccessExpression(node.expression.expression)&&node.expression.expression.name.text==='webViews')requireValue(false,`Use declared navigation instead of webViews.open: ${file}`);node.forEachChild(visit);};visit(source);
      }
      snapshot.dispose();
    }finally{api.close();}
    for(const c of applet.manifest.routeContracts)for(const r of c.routes)if(r.path==='/*'&&r.result.kind==='custom')process.stderr.write(`Review broad custom route ${c.id}/${r.id}: a route match does not prove content support.\n`);
  }
  return applet;
}
