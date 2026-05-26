import { exportSequenceToSpineJson } from './sequenceSpineExporter';

// 模拟 File 对象
class MockFile extends File {
  constructor(name: string, width: number, height: number) {
    super([''], name, { type: 'image/png' });
    (this as any).width = width;
    (this as any).height = height;
  }
}

async function testExport() {
  console.log('测试 Spine JSON 导出...');
  
  // 模拟文件
  const files = [
    new MockFile('碎_001.png', 100, 100),
    new MockFile('碎_002.png', 100, 100),
    new MockFile('碎_005.png', 100, 100),
  ];
  
  const input = {
    skeletonName: 'TestSkeleton',
    animationName: 'test',
    fps: 12,
    imagesPath: './images/',
    files: files as any,
    exportMode: 'new-project' as const,
    targetSlotName: 'frameSlot',
    targetBoneName: 'root',
    targetSkinName: 'default',
    spineCompatibilityVersion: '4.2.0',
    attachmentNameStrategy: 'basename' as const,
    attachmentConflictStrategy: 'error' as const,
  };
  
  const json = exportSequenceToSpineJson(input);
  console.log('导出结果:');
  console.log(JSON.stringify(json, null, 2));
  
  // 验证碎_005 是否包含 width/height
  const attachment = (json as any).skins.default.frameSlot['碎_005'];
  console.log('\n验证 碎_005 附件:');
  console.log('包含 width:', 'width' in attachment);
  console.log('width 值:', attachment.width);
  console.log('包含 height:', 'height' in attachment);
  console.log('height 值:', attachment.height);
  
  // 验证所有附件是否都包含必要字段
  const attachments = (json as any).skins.default.frameSlot;
  Object.keys(attachments).forEach(name => {
    const att = attachments[name];
    console.log(`\n验证附件 ${name}:`);
    console.log('type:', att.type);
    console.log('name:', att.name);
    console.log('x:', att.x);
    console.log('y:', att.y);
    console.log('rotation:', att.rotation);
    console.log('scaleX:', att.scaleX);
    console.log('scaleY:', att.scaleY);
    console.log('width:', att.width);
    console.log('height:', att.height);
  });
}

testExport().catch(console.error);
