"""Package the current source, launchers, local assets, release and visual evidence."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib

root = Path(__file__).resolve().parents[1]
destination = root.parent / 'Christmas-Particle-Experience-Auto-Camera.zip'
temporary = destination.with_suffix('.zip.tmp')
folders = {'src', 'scripts', 'public', 'dist', 'tests', 'e2e', 'licenses', 'release'}
root_files = {'package.json', 'package-lock.json', 'index.html', 'README.md', 'VALIDATION.md', 'CHANGES.md', 'GESTURE-ACCURACY.md', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', '.gitignore', '启动源码版.bat', '创建桌面快捷方式.bat'}
previews = {'01-tree.png', '02-number-1.png', '02-number-2.png', '02-number-3.png', '03-message.png', '04-question.png', '07-tree-rotated.png', '08-sky-after-30s.png', '09-touch.png', 'visual-tree.png', 'visual-number-transition.png', 'visual-number-settled.png', 'visual-calligraphy.png', 'visual-happy.png', 'visual-review.json', 'upright-christmas.png', 'enlarged-tree-stage.png'}
files = [root / name for name in root_files if (root / name).is_file()]
for folder in sorted(folders):
    for path in (root / folder).rglob('*'):
        rel = path.relative_to(root)
        if not path.is_file() or path.is_symlink():
            continue
        if any(part in {'__pycache__', 'node_modules', '.git'} for part in rel.parts):
            continue
        # Machine-specific private certificates and downloaded tunnel executables
        # are generated/downloaded by the release launchers when needed.
        if rel.parts[0] == 'release' and len(rel.parts) > 1 and rel.parts[1] in {'certs', 'tools'}:
            continue
        if path.suffix not in {'.tsbuildinfo', '.download', '.pyc'}:
            files.append(path)
files += [root / 'artifacts' / name for name in previews if (root / 'artifacts' / name).is_file()]
files = sorted(set(files))
required = ['src/three/ParticleText.ts', 'src/three/ParticleMorph.ts', 'public/models/hand_landmarker.task', 'public/mediapipe/hand.worker.js', 'dist/index.html', 'README.md', '启动源码版.bat', '创建桌面快捷方式.bat', 'scripts/open-local.ps1', 'scripts/create-desktop-shortcut.ps1', 'release/serve.mjs', 'release/site/index.html']
with ZipFile(temporary, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
    for path in files:
        archive.write(path, Path(root.name) / path.relative_to(root))
with ZipFile(temporary) as archive:
    assert archive.testzip() is None, 'ZIP integrity check failed'
    names = set(archive.namelist())
    for name in required:
        assert root.name + '/' + name in names, name
    for path in files:
        name = (Path(root.name) / path.relative_to(root)).as_posix()
        assert hashlib.sha256(archive.read(name)).digest() == hashlib.sha256(path.read_bytes()).digest(), name
# Preserve the last delivery until the new archive passes all checks.
temporary.replace(destination)
print('Archive:', destination)
print('Files:', len(names), 'Bytes:', destination.stat().st_size)
print('All packaged files match the current project byte for byte; ZIP integrity OK.')
print('SHA256:', hashlib.sha256(destination.read_bytes()).hexdigest())
