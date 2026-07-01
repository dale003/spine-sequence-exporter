export interface SpineJsonAnalysis {
  definedSlots: string[];
  referencedSlots: string[];
  missingSlots: string[];
  orphanedReferences: Array<{
    location: string;
    path: string;
    slotName: string;
    fullPath: string;
  }>;
  detailedReport: string;
}

type SkinRef = {
  skinName: string;
  slotName: string;
  fullPath: string;
};

function isSkinsArray(skins: unknown): skins is Array<{ name?: string; attachments?: Record<string, unknown> }> {
  return Array.isArray(skins);
}

function collectSkinRefs(skins: unknown): SkinRef[] {
  const refs: SkinRef[] = [];
  if (isSkinsArray(skins)) {
    skins.forEach((skin, skinIndex) => {
      const skinName = (skin && typeof skin.name === 'string') ? skin.name : String(skinIndex);
      const attachments = (skin && typeof skin === 'object' && 'attachments' in skin)
        ? (skin as { attachments?: Record<string, unknown> }).attachments
        : undefined;
      if (attachments && typeof attachments === 'object') {
        Object.keys(attachments).forEach((slotName) => {
          refs.push({
            skinName,
            slotName,
            fullPath: `skins.${skinName}.${slotName}`,
          });
        });
      }
    });
  } else if (skins && typeof skins === 'object') {
    const skinsObj = skins as Record<string, Record<string, unknown>>;
    Object.keys(skinsObj).forEach((skinName) => {
      const skin = skinsObj[skinName];
      if (skin && typeof skin === 'object') {
        Object.keys(skin).forEach((slotName) => {
          refs.push({
            skinName,
            slotName,
            fullPath: `skins.${skinName}.${slotName}`,
          });
        });
      }
    });
  }
  return refs;
}

export function analyzeSpineJson(json: Record<string, unknown>): SpineJsonAnalysis {
  const definedSlots: string[] = [];
  const referencedSlots: string[] = [];
  const orphanedReferences: Array<{
    location: string;
    path: string;
    slotName: string;
    fullPath: string;
  }> = [];

  const slots = json.slots as Array<{ name: string }> || [];
  slots.forEach((slot) => {
    if (slot.name && typeof slot.name === 'string') {
      definedSlots.push(slot.name);
    }
  });

  const addReference = (location: string, path: string, fullPath: string, slotName: string) => {
    if (!definedSlots.includes(slotName)) {
      orphanedReferences.push({ location, path, slotName, fullPath });
    }
    if (!referencedSlots.includes(slotName)) {
      referencedSlots.push(slotName);
    }
  };

  let detailedReport = '=== Spine JSON Slot 引用分析报告 ===\n\n';
  detailedReport += `已定义的 slots (共 ${definedSlots.length} 个):\n`;
  definedSlots.forEach(slot => detailedReport += `  - ${slot}\n`);
  detailedReport += '\n';

  if (json.skins) {
    detailedReport += '=== skins 中的 slot 引用 ===\n';
    const skinRefs = collectSkinRefs(json.skins);
    skinRefs.forEach(({ skinName, slotName, fullPath }) => {
      detailedReport += `  ${fullPath} -> ${slotName}\n`;
      addReference('skins', `${skinName}.${slotName}`, fullPath, slotName);
    });
    detailedReport += '\n';
  }

  if (json.animations) {
    detailedReport += '=== animations 中的 slot 引用 ===\n';
    const animations = json.animations as Record<string, unknown>;
    Object.keys(animations).forEach((animName) => {
      const anim = animations[animName] as Record<string, unknown>;
      if (anim.slots) {
        const animSlots = anim.slots as Record<string, unknown>;
        Object.keys(animSlots).forEach((slotName) => {
          const fullPath = `animations.${animName}.slots.${slotName}`;
          detailedReport += `  ${fullPath} -> ${slotName}\n`;
          addReference('animations', `${animName}.slots.${slotName}`, fullPath, slotName);
        });
      }
      if (anim.drawOrder) {
        const drawOrder = anim.drawOrder as Array<{ slot?: string }>;
        drawOrder.forEach((item, index) => {
          if (item.slot) {
            const fullPath = `animations.${animName}.drawOrder[${index}].slot`;
            detailedReport += `  ${fullPath} -> ${item.slot}\n`;
            addReference('animations', `${animName}.drawOrder[${index}].slot`, fullPath, item.slot);
          }
        });
      }
    });
    detailedReport += '\n';
  }

  if (json.drawOrder) {
    detailedReport += '=== drawOrder 中的 slot 引用 ===\n';
    const drawOrder = json.drawOrder as Array<{ slot?: string }>;
    drawOrder.forEach((item, index) => {
      if (item.slot) {
        const fullPath = `drawOrder[${index}].slot`;
        detailedReport += `  ${fullPath} -> ${item.slot}\n`;
        addReference('drawOrder', `[${index}].slot`, fullPath, item.slot);
      }
    });
    detailedReport += '\n';
  }

  if (json.constraints) {
    detailedReport += '=== constraints 中的 slot 引用 ===\n';
    const constraints = json.constraints as Record<string, Array<{ targets?: string[]; slot?: string }>>;
    
    if (constraints.slot) {
      constraints.slot.forEach((constraint, index) => {
        if (constraint.targets) {
          constraint.targets.forEach((target) => {
            const fullPath = `constraints.slot[${index}].targets[]`;
            detailedReport += `  ${fullPath} -> ${target}\n`;
            addReference('constraints', `slot[${index}].targets`, fullPath, target);
          });
        }
        if (constraint.slot && typeof constraint.slot === 'string') {
          const fullPath = `constraints.slot[${index}].slot`;
          detailedReport += `  ${fullPath} -> ${constraint.slot}\n`;
          addReference('constraints', `slot[${index}].slot`, fullPath, constraint.slot);
        }
      });
    }
    
    if (constraints.transform) {
      constraints.transform.forEach((constraint, index) => {
        if (constraint.targets) {
          constraint.targets.forEach((target) => {
            const fullPath = `constraints.transform[${index}].targets[]`;
            detailedReport += `  ${fullPath} -> ${target}\n`;
            addReference('constraints', `transform[${index}].targets`, fullPath, target);
          });
        }
      });
    }
    detailedReport += '\n';
  }

  const missingSlots = referencedSlots.filter((slot) => !definedSlots.includes(slot));
  
  detailedReport += '=== 缺失的 slots (已引用但未定义) ===\n';
  if (missingSlots.length > 0) {
    detailedReport += `发现 ${missingSlots.length} 个缺失的 slot:\n`;
    missingSlots.forEach(slot => detailedReport += `  ⚠️ ${slot}\n`);
    detailedReport += '\n';
    detailedReport += '=== 非法引用位置 ===\n';
    orphanedReferences.forEach(ref => {
      detailedReport += `  📍 ${ref.location} -> ${ref.fullPath}\n`;
      detailedReport += `     引用了不存在的 slot: ${ref.slotName}\n`;
    });
  } else {
    detailedReport += '✓ 未发现缺失的 slot 引用\n';
  }

  return {
    definedSlots,
    referencedSlots,
    missingSlots,
    orphanedReferences,
    detailedReport,
  };
}

export function fixMissingSlots(json: Record<string, unknown>): Record<string, unknown> {
  const analysis = analyzeSpineJson(json);
  
  if (analysis.missingSlots.length === 0) {
    return json;
  }

  const fixedJson = { ...json };
  const slots = (fixedJson.slots as Array<{ name: string; bone: string; attachment: string | null }>) || [];
  
  analysis.missingSlots.forEach((slotName) => {
    if (!slots.some(s => s.name === slotName)) {
      slots.push({
        name: slotName,
        bone: 'root',
        attachment: null,
      });
    }
  });
  
  fixedJson.slots = slots;
  return fixedJson;
}

export function removeOrphanedReferences(json: Record<string, unknown>): Record<string, unknown> {
  const analysis = analyzeSpineJson(json);
  
  if (analysis.orphanedReferences.length === 0) {
    return json;
  }

  const fixedJson = JSON.parse(JSON.stringify(json)) as Record<string, unknown>;

  analysis.orphanedReferences.forEach((ref) => {
    try {
      if (ref.location === 'skins') {
        const [skinName, slotName] = ref.path.split('.');
        const skins = fixedJson.skins as unknown;
        if (isSkinsArray(skins)) {
          skins.forEach((skin) => {
            if (skin && skin.name === skinName && skin.attachments && skin.attachments[slotName]) {
              delete skin.attachments[slotName];
            }
          });
        } else if (skins && typeof skins === 'object') {
          const skinsObj = skins as Record<string, Record<string, unknown>>;
          if (skinsObj[skinName] && skinsObj[skinName][slotName]) {
            delete skinsObj[skinName][slotName];
          }
        }
      } else if (ref.location === 'animations') {
        const parts = ref.path.split('.');
        if (parts.length >= 3) {
          const animName = parts[0];
          const timelineType = parts[1];
          const slotName = parts[2];
          
          if (fixedJson.animations &&
              (fixedJson.animations as Record<string, unknown>)[animName] &&
              (fixedJson.animations as Record<string, Record<string, unknown>>)[animName][timelineType] &&
              (fixedJson.animations as Record<string, Record<string, Record<string, unknown>>>)[animName][timelineType][slotName]) {
            delete (fixedJson.animations as Record<string, Record<string, Record<string, unknown>>>)[animName][timelineType][slotName];
          }
        }
      } else if (ref.location === 'drawOrder') {
        const match = ref.path.match(/\[(\d+)\]/);
        if (match && fixedJson.drawOrder) {
          const index = parseInt(match[1], 10);
          (fixedJson.drawOrder as Array<unknown>).splice(index, 1);
        }
      } else if (ref.location === 'constraints') {
        const match = ref.path.match(/(\w+)\[(\d+)\]/);
        if (match && fixedJson.constraints) {
          const constraintType = match[1];
          const index = parseInt(match[2], 10);
          const constraints = (fixedJson.constraints as Record<string, Array<unknown>>)[constraintType];
          if (constraints && constraints[index]) {
            const constraint = constraints[index] as Record<string, unknown>;
            if (constraint.targets) {
              const targets = constraint.targets as string[];
              const targetIndex = targets.indexOf(ref.slotName);
              if (targetIndex > -1) {
                targets.splice(targetIndex, 1);
              }
            }
            if (constraint.slot === ref.slotName) {
              constraint.slot = undefined;
            }
          }
        }
      }
    } catch (e) {
      console.warn(`Failed to remove reference: ${ref.fullPath}`, e);
    }
  });

  return fixedJson;
}