import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const releaseDir = path.join(root, 'release-standalone');
const indexPath = path.join(distDir, 'index.html');

const html = await readFile(indexPath, 'utf8');
const scriptMatch = html.match(/<script[^>]+src="\.\/assets\/([^"]+)"[^>]*><\/script>/);

if (!scriptMatch) {
  throw new Error('Could not find the bundled JavaScript asset in dist/index.html.');
}

const scriptFile = scriptMatch[1];
const script = await readFile(path.join(distDir, 'assets', scriptFile), 'utf8');

const standaloneHtml = html
  .replace(scriptMatch[0], `<script type="module">\n${script}\n</script>`)
  .replace('<title>Spine 序列帧导出工具</title>', '<title>Spine 序列帧导出工具 - 单文件版</title>');

await mkdir(releaseDir, { recursive: true });
await writeFile(path.join(releaseDir, 'SpineSequenceExporter.html'), standaloneHtml, 'utf8');
await writeFile(
  path.join(releaseDir, '使用说明.txt'),
  [
    'Spine 序列帧导出工具 - 单文件离线版',
    '',
    '使用方法：',
    '1. 把 SpineSequenceExporter.html 复制到其他 Windows 电脑。',
    '2. 用 Chrome 或 Edge 打开 SpineSequenceExporter.html。',
    '3. 选择 PNG 序列帧，设置参数，点击“导出 JSON”。',
    '',
    '注意：',
    '- 不需要安装 Node.js。',
    '- 不需要运行 npm run dev。',
    '- 不需要安装程序。',
    '- 这是单文件版本，不需要额外复制 assets 文件夹。',
    '',
  ].join('\n'),
  'utf8',
);

console.log(`Wrote ${path.join(releaseDir, 'SpineSequenceExporter.html')}`);
