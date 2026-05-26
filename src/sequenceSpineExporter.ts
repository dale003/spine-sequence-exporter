export type ExportMode = 'new-project' | 'merge';
export type AttachmentNameStrategy = 'basename' | 'filename';
export type AttachmentConflictStrategy = 'error' | 'rename';

export interface SequenceExportInput {
  skeletonName: string;
  animationName: string;
  fps: number;
  imagesPath: string;
  files: Array<File & { width?: number; height?: number }>;
  exportMode: ExportMode;
  targetSlotName: string;
  targetBoneName: string;
  targetSkinName: string;
  spineCompatibilityVersion: string;
  attachmentNameStrategy: AttachmentNameStrategy;
  attachmentConflictStrategy: AttachmentConflictStrategy;
}

interface SpineJson {
  skeleton?: Record<string, unknown>;
  bones?: Array<{ name: string }>;
  slots?: Array<{ name: string; bone: string; attachment: string | null }>;
  skins: Record<string, Record<string, Record<string, unknown>>> | Array<{ name: string; attachments: Record<string, Record<string, unknown>> }>;
  animations: Record<string, { slots?: Record<string, { attachment?: Array<{ time: number; name: string }> }> }>;
}

function naturalSort(a: string, b: string): number {
  const numPartRegex = /(\d+)/g;
  const aParts = a.split(numPartRegex);
  const bParts = b.split(numPartRegex);

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    if (i >= aParts.length) return -1;
    if (i >= bParts.length) return 1;

    const aNum = parseInt(aParts[i], 10);
    const bNum = parseInt(bParts[i], 10);

    if (!isNaN(aNum) && !isNaN(bNum)) {
      if (aNum !== bNum) return aNum - bNum;
    } else {
      if (aParts[i] < bParts[i]) return -1;
      if (aParts[i] > bParts[i]) return 1;
    }
  }
  return 0;
}

function getAttachmentName(file: File, strategy: AttachmentNameStrategy): string {
  if (strategy === 'filename') {
    return file.name;
  }
  return file.name.replace(/\.[^.]+$/, '');
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ExportResult {
  success: boolean;
  errors?: ValidationError[];
  json?: Record<string, unknown>;
}

export function validateInput(input: SequenceExportInput): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!input.files || input.files.length === 0) {
    errors.push({ field: 'files', message: '请至少选择一张图片' });
    return errors;
  }

  for (const file of input.files) {
    if (!file.name.toLowerCase().endsWith('.png')) {
      errors.push({ field: 'files', message: `文件 "${file.name}" 不是 PNG 格式` });
    }
  }

  if (input.fps <= 0) {
    errors.push({ field: 'fps', message: 'FPS 必须大于 0' });
  }

  if (!input.animationName.trim()) {
    errors.push({ field: 'animationName', message: '动画名称不能为空' });
  }

  if (!input.targetSlotName.trim()) {
    errors.push({ field: 'targetSlotName', message: '目标 Slot 名称不能为空' });
  }

  if (!input.targetSkinName.trim()) {
    errors.push({ field: 'targetSkinName', message: '目标 Skin 名称不能为空' });
  }

  if (!input.spineCompatibilityVersion.trim()) {
    errors.push({ field: 'spineCompatibilityVersion', message: 'Spine 兼容版本不能为空' });
  }

  const attachmentNames = input.files.map(file => getAttachmentName(file, input.attachmentNameStrategy));
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const name of attachmentNames) {
    if (seen.has(name) && input.attachmentConflictStrategy === 'error') {
      if (!duplicates.includes(name)) {
        duplicates.push(name);
      }
    }
    seen.add(name);
  }

  if (duplicates.length > 0) {
    errors.push({
      field: 'files',
      message: `存在重复的附件名称（去扩展名后）: ${duplicates.join(', ')}`
    });
  }

  return errors;
}

export function loadImageDimensions(files: File[]): Promise<Array<File & { width: number; height: number }>> {
  return Promise.all(
    files.map(file => {
      return new Promise<File & { width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const fileWithDimensions = file as File & { width: number; height: number };
          fileWithDimensions.width = img.width;
          fileWithDimensions.height = img.height;
          resolve(fileWithDimensions);
        };
        img.onerror = () => {
          reject(new Error(`无法读取图片尺寸: ${file.name}`));
        };
        img.src = URL.createObjectURL(file);
      });
    })
  );
}

export function exportSequenceToSpineJson(input: SequenceExportInput): Record<string, unknown> {
  const sortedFiles = [...input.files].sort((a, b) => naturalSort(a.name, b.name));

  const slotName = input.targetSlotName || 'frameSlot';
  const boneName = input.targetBoneName || 'root';
  const skinName = input.targetSkinName || 'default';
  const isSpine38 = input.spineCompatibilityVersion.trim().startsWith('3.8');

  const skinAttachmentsBySlot: Record<string, Record<string, unknown>> = {
    [slotName]: {} as Record<string, unknown>,
  };

  const spineJson: SpineJson = {
    skins: isSpine38
      ? [
          {
            name: skinName,
            attachments: skinAttachmentsBySlot,
          },
        ]
      : {
          [skinName]: skinAttachmentsBySlot,
        },
    animations: {},
  };

  if (input.exportMode === 'new-project') {
    spineJson.skeleton = {
      spine: input.spineCompatibilityVersion,
      hash: '',
      imagesPath: input.imagesPath,
    };
    spineJson.bones = [{ name: boneName }];
    spineJson.slots = [{ name: slotName, bone: boneName, attachment: null }];
  } else {
    // Merge 模式也补充最小 slot/bone 定义，避免旧版 Spine 解析动画时出现 Slot not found。
    spineJson.bones = [{ name: boneName }];
    spineJson.slots = [{ name: slotName, bone: boneName, attachment: null }];
  }

  const usedAttachmentNames = new Set<string>();
  const makeUniqueAttachmentName = (baseName: string): string => {
    if (input.attachmentConflictStrategy === 'error') {
      return baseName;
    }
    if (!usedAttachmentNames.has(baseName)) {
      usedAttachmentNames.add(baseName);
      return baseName;
    }
    let index = 1;
    let candidate = `${baseName}_${index}`;
    while (usedAttachmentNames.has(candidate)) {
      index += 1;
      candidate = `${baseName}_${index}`;
    }
    usedAttachmentNames.add(candidate);
    return candidate;
  };

  const timelineNames: string[] = [];
  for (const file of sortedFiles) {
    const rawName = getAttachmentName(file, input.attachmentNameStrategy);
    const name = makeUniqueAttachmentName(rawName);
    timelineNames.push(name);
    skinAttachmentsBySlot[slotName][name] = {
      type: 'region',
      name: name,
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      width: file.width || 0,
      height: file.height || 0,
    };
  }

  const slotTimeline: Array<{ time: number; name: string }> = timelineNames.map((name, index) => ({
    time: index / input.fps,
    name,
  }));

  spineJson.animations[input.animationName] = {
    slots: {
      [slotName]: {
        attachment: slotTimeline,
      },
    },
  };

  return spineJson as unknown as Record<string, unknown>;
}

export function downloadJson(json: Record<string, unknown>, filename: string): void {
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
