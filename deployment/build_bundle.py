"""Package deployable sources and bundled YOLO weights without operational data."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root=Path(__file__).resolve().parents[1]
target=root/'deployment'/'rescue-ai-drone-source.zip'
files=set()
for directory in ['frontend/src','frontend/public','frontend/tests','backend/app','backend/tests']:
    for path in (root/directory).rglob('*'):
        if path.is_file() and not any(part in {'__pycache__','assets'} for part in path.relative_to(root).parts):
            files.add(path)
for folder,names in {
    '':['Dockerfile','docker-compose.yml','render.yaml','requirements.txt','README.md','.dockerignore','.gitignore'],
    'frontend':['package.json','package-lock.json','index.html','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json','vercel.json','components.json','.env.example','.vercelignore','.oxlintrc.json'],
    'backend':['serve.py','.env.example','models/best.pt'],
    'deployment':['DEPLOYMENT.md','build_bundle.py'],
}.items():
    files.update(root/folder/name for name in names)
with ZipFile(target,'w',ZIP_DEFLATED) as archive:
    for path in sorted(files):
        archive.write(path,path.relative_to(root).as_posix())
print(f'{target.name}: {len(files)} files, {target.stat().st_size/1024/1024:.1f} MiB')
