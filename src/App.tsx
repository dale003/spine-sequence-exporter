import { useState, useRef, useCallback } from 'react';
import {
  SequenceExportInput,
  validateInput,
  exportSequenceToSpineJson,
  downloadJson,
  ValidationError,
  loadImageDimensions,
  ExportMode,
} from './sequenceSpineExporter';
import {
  analyzeSpineJson,
  fixMissingSlots,
  removeOrphanedReferences,
  SpineJsonAnalysis,
} from './spineJsonAnalyzer';

function naturalSortPreview(files: Array<File & { width?: number; height?: number }>): Array<File & { width?: number; height?: number }> {
  const numPartRegex = /(\d+)/g;
  return [...files].sort((a, b) => {
    const aParts = a.name.split(numPartRegex);
    const bParts = b.name.split(numPartRegex);
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
  });
}

export default function App() {
  const [files, setFiles] = useState<Array<File & { width?: number; height?: number }>>([]);
  const [animationName, setAnimationName] = useState('sequence');
  const [fps, setFps] = useState('12');
  const [skeletonName, setSkeletonName] = useState('SequenceImport');
  const [imagesPath, setImagesPath] = useState('./images/');
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewJson, setPreviewJson] = useState<string | null>(null);
  const [exportMode, setExportMode] = useState<ExportMode>('new-project');
  const [targetSlotName, setTargetSlotName] = useState('frameSlot');
  const [targetBoneName, setTargetBoneName] = useState('root');
  const [targetSkinName, setTargetSkinName] = useState('default');
  const [spineCompatibilityVersion, setSpineCompatibilityVersion] = useState('4.2.0');
  const [attachmentNameStrategy, setAttachmentNameStrategy] = useState<'basename' | 'filename'>('basename');
  const [attachmentConflictStrategy, setAttachmentConflictStrategy] = useState<'error' | 'rename'>('error');
  const [analyzeJson, setAnalyzeJson] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<SpineJsonAnalysis | null>(null);
  const [fixedJson, setFixedJson] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analyzeInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      setLoading(true);
      try {
        const filesWithDimensions = await loadImageDimensions(Array.from(selectedFiles));
        const sortedFiles = naturalSortPreview(filesWithDimensions);
        setFiles(sortedFiles);
        setErrors([]);
        
        console.log('图片尺寸信息:');
        sortedFiles.forEach(file => {
          console.log(`文件: ${file.name}, 宽: ${file.width}, 高: ${file.height}`);
        });
      } catch (error) {
        setErrors([(error as Error).message]);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleExport = useCallback(() => {
    setExportStatus(null);
    
    const input: SequenceExportInput = {
      skeletonName,
      animationName,
      fps: parseFloat(fps),
      imagesPath,
      files,
      exportMode,
      targetSlotName: exportMode === 'merge' ? targetSlotName : 'frameSlot',
      targetBoneName: exportMode === 'merge' ? targetBoneName : 'root',
      targetSkinName,
      spineCompatibilityVersion,
      attachmentNameStrategy,
      attachmentConflictStrategy,
    };

    const validationErrors = validateInput(input);
    if (validationErrors.length > 0) {
      setErrors(validationErrors.map((err: ValidationError) => err.message));
      return;
    }

    const json = exportSequenceToSpineJson(input);

    console.log('导出的 JSON:');
    console.log(JSON.stringify(json, null, 2));

    setPreviewJson(JSON.stringify(json, null, 2));
    downloadJson(json, `${skeletonName}.json`);
    setErrors([]);
    setExportStatus('✓ JSON 文件已成功保存！');
    
    // 3秒后自动清除状态提示
    setTimeout(() => {
      setExportStatus(null);
    }, 3000);
  }, [skeletonName, animationName, fps, imagesPath, files, exportMode, targetSlotName, targetBoneName, targetSkinName, spineCompatibilityVersion, attachmentNameStrategy, attachmentConflictStrategy]);

  const handleAnalyzeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const jsonContent = event.target?.result as string;
          const json = JSON.parse(jsonContent);
          setAnalyzeJson(jsonContent);
          const analysis = analyzeSpineJson(json);
          setAnalysisResult(analysis);
          setFixedJson(null);
        } catch (error) {
          setErrors(['JSON 解析错误: ' + (error as Error).message]);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleFixAddSlots = () => {
    if (analyzeJson) {
      try {
        const json = JSON.parse(analyzeJson);
        const fixed = fixMissingSlots(json);
        const fixedStr = JSON.stringify(fixed, null, 2);
        setFixedJson(fixedStr);
      } catch (error) {
        setErrors(['修复失败: ' + (error as Error).message]);
      }
    }
  };

  const handleFixRemoveReferences = () => {
    if (analyzeJson) {
      try {
        const json = JSON.parse(analyzeJson);
        const fixed = removeOrphanedReferences(json);
        const fixedStr = JSON.stringify(fixed, null, 2);
        setFixedJson(fixedStr);
      } catch (error) {
        setErrors(['修复失败: ' + (error as Error).message]);
      }
    }
  };

  const handleDownloadFixed = () => {
    if (fixedJson) {
      const blob = new Blob([fixedJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fixed_skeleton.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '18px', marginBottom: '20px' }}>Spine 序列帧导入工具</h1>

      <div style={{ marginBottom: '30px', padding: '15px', border: '1px solid #ddd', borderRadius: '4px' }}>
        <h2 style={{ fontSize: '16px', marginBottom: '15px' }}>功能一：序列帧导出</h2>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            选择 PNG 图片（可多选）
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png"
            multiple
            onChange={handleFileChange}
            style={{ width: '100%' }}
            disabled={loading}
          />
          {loading && <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>读取图片尺寸中...</div>}
        </div>

        {files.length > 0 && (
          <div style={{ marginBottom: '15px', fontSize: '12px', color: '#666' }}>
            <strong>已选择 {files.length} 张图片（排序后）：</strong>
            <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
              {files.map((f, i) => (
                <li key={i}>
                  {f.name} 
                  {f.width && f.height && `(宽: ${f.width}, 高: ${f.height})`}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            导出模式
          </label>
          <select
            value={exportMode}
            onChange={(e) => setExportMode(e.target.value as ExportMode)}
            style={{ width: '100%', padding: '5px' }}
          >
            <option value="new-project">新建项目 (New project)</option>
            <option value="merge">合并到现有骨架 (Merge into project)</option>
          </select>
          <small style={{ color: '#666', fontSize: '11px' }}>
            新建项目: 创建完整骨架，适合从头开始；合并模式: 只导出动画和附件，可导入到现有骨架
          </small>
        </div>

        {exportMode === 'merge' && (
          <>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                目标 Slot 名称
              </label>
              <input
                type="text"
                value={targetSlotName}
                onChange={(e) => setTargetSlotName(e.target.value)}
                style={{ width: '100%', padding: '5px' }}
                placeholder="现有骨架中 slot 的名称"
              />
              <small style={{ color: '#666', fontSize: '11px' }}>
                必须与现有骨架中的 slot 名称完全匹配
              </small>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                目标 Skin 名称
              </label>
              <input
                type="text"
                value={targetSkinName}
                onChange={(e) => setTargetSkinName(e.target.value)}
                style={{ width: '100%', padding: '5px' }}
                placeholder="现有骨架中 skin 的名称（通常是 default）"
              />
              <small style={{ color: '#666', fontSize: '11px' }}>
                必须与现有骨架中的 skin 名称匹配
              </small>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                目标 Bone 名称
              </label>
              <input
                type="text"
                value={targetBoneName}
                onChange={(e) => setTargetBoneName(e.target.value)}
                style={{ width: '100%', padding: '5px' }}
                placeholder="现有骨架中 bone 的名称"
              />
              <small style={{ color: '#666', fontSize: '11px' }}>
                必须与现有骨架中的 bone 名称完全匹配（合并模式下仅用于 attachment 定位）
              </small>
            </div>
          </>
        )}

        {exportMode === 'new-project' && (
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Skeleton 名称
            </label>
            <input
              type="text"
              value={skeletonName}
              onChange={(e) => setSkeletonName(e.target.value)}
              style={{ width: '100%', padding: '5px' }}
            />
          </div>
        )}

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Spine 兼容版本
          </label>
          <input
            type="text"
            value={spineCompatibilityVersion}
            onChange={(e) => setSpineCompatibilityVersion(e.target.value)}
            style={{ width: '100%', padding: '5px' }}
            placeholder="例如 3.8.99 / 4.0.64 / 4.2.0"
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            附件命名策略
          </label>
          <select
            value={attachmentNameStrategy}
            onChange={(e) => setAttachmentNameStrategy(e.target.value as 'basename' | 'filename')}
            style={{ width: '100%', padding: '5px' }}
          >
            <option value="basename">去扩展名（basename）</option>
            <option value="filename">保留完整文件名（filename）</option>
          </select>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            附件重名处理
          </label>
          <select
            value={attachmentConflictStrategy}
            onChange={(e) => setAttachmentConflictStrategy(e.target.value as 'error' | 'rename')}
            style={{ width: '100%', padding: '5px' }}
          >
            <option value="error">报错并停止</option>
            <option value="rename">自动重命名（_1, _2...）</option>
          </select>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            动画名称
          </label>
          <input
            type="text"
            value={animationName}
            onChange={(e) => setAnimationName(e.target.value)}
            style={{ width: '100%', padding: '5px' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            FPS
          </label>
          <input
            type="number"
            value={fps}
            onChange={(e) => setFps(e.target.value)}
            min="1"
            step="1"
            style={{ width: '100%', padding: '5px' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            图片路径（images path）
          </label>
          <input
            type="text"
            value={imagesPath}
            onChange={(e) => setImagesPath(e.target.value)}
            style={{ width: '100%', padding: '5px' }}
          />
          <small style={{ color: '#666', fontSize: '11px' }}>
            在 Spine 中导入时需设置对应的图片目录
          </small>
        </div>

        {errors.length > 0 && (
          <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#fee', border: '1px solid #c00', borderRadius: '4px' }}>
            {errors.map((err, i) => (
              <div key={i} style={{ color: '#c00', fontSize: '13px' }}>{err}</div>
            ))}
          </div>
        )}

        <button
          onClick={handleExport}
          disabled={files.length === 0 || loading}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            cursor: (files.length === 0 || loading) ? 'not-allowed' : 'pointer',
            opacity: (files.length === 0 || loading) ? 0.5 : 1,
          }}
        >
          导出 JSON
        </button>

        {exportStatus && (
          <div style={{
            marginLeft: '15px',
            display: 'inline-block',
            padding: '8px 16px',
            fontSize: '13px',
            color: '#0a0',
            backgroundColor: '#e8f5e9',
            border: '1px solid #4caf50',
            borderRadius: '4px',
          }}>
            {exportStatus}
          </div>
        )}

        {previewJson && (
          <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '10px', borderRadius: '4px', maxHeight: '300px', overflow: 'auto' }}>
            <h3 style={{ fontSize: '14px', marginBottom: '10px' }}>JSON 预览</h3>
            <pre style={{ fontSize: '11px', fontFamily: 'monospace', margin: 0 }}>{previewJson}</pre>
          </div>
        )}
      </div>

      <div style={{ padding: '15px', border: '1px solid #ddd', borderRadius: '4px' }}>
        <h2 style={{ fontSize: '16px', marginBottom: '15px' }}>功能二：Spine JSON 分析与修复</h2>
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            上传 Spine JSON 文件进行分析
          </label>
          <input
            ref={analyzeInputRef}
            type="file"
            accept=".json"
            onChange={handleAnalyzeFile}
            style={{ width: '100%' }}
          />
        </div>

        {analysisResult && (
          <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
            <h3 style={{ fontSize: '14px', marginBottom: '10px' }}>分析结果</h3>
            
            <div style={{ marginBottom: '10px', fontSize: '13px' }}>
              <strong>已定义的 slots:</strong>
              <div style={{ color: '#333' }}>{analysisResult.definedSlots.join(', ') || '无'}</div>
            </div>

            <div style={{ marginBottom: '10px', fontSize: '13px' }}>
              <strong>被引用的 slots:</strong>
              <div style={{ color: '#333' }}>{analysisResult.referencedSlots.join(', ') || '无'}</div>
            </div>

            {analysisResult.missingSlots.length > 0 && (
              <div style={{ marginBottom: '10px', padding: '10px', backgroundColor: '#fee', borderRadius: '4px' }}>
                <strong style={{ color: '#c00' }}>缺失的 slots（已引用但未定义）:</strong>
                <div style={{ color: '#c00' }}>{analysisResult.missingSlots.join(', ')}</div>
              </div>
            )}

            {analysisResult.orphanedReferences.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <strong style={{ color: '#c00' }}>非法引用位置:</strong>
                <ul style={{ margin: '5px 0', paddingLeft: '20px', color: '#c00', fontSize: '12px' }}>
                  {analysisResult.orphanedReferences.map((ref, i) => (
                    <li key={i}>
                      <strong>{ref.location}</strong>: {ref.fullPath} {'->'} {ref.slotName}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ marginBottom: '10px', padding: '10px', backgroundColor: '#fff', borderRadius: '4px', border: '1px solid #ddd' }}>
              <strong style={{ fontSize: '13px' }}>详细分析报告:</strong>
              <pre style={{ fontSize: '11px', fontFamily: 'monospace', margin: '5px 0 0 0', whiteSpace: 'pre-wrap' }}>
                {analysisResult.detailedReport}
              </pre>
            </div>

            {analysisResult.missingSlots.length === 0 && (
              <div style={{ color: '#0a0', fontSize: '13px' }}>✓ 未发现缺失的 slot 引用</div>
            )}
          </div>
        )}

        {analysisResult && analysisResult.missingSlots.length > 0 && (
          <div style={{ marginBottom: '15px' }}>
            <button
              onClick={handleFixAddSlots}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                marginRight: '10px',
                cursor: 'pointer',
              }}
            >
              修复方案一：补全缺失的 slots
            </button>
            <button
              onClick={handleFixRemoveReferences}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              修复方案二：删除非法引用
            </button>
          </div>
        )}

        {fixedJson && (
          <div style={{ marginBottom: '15px' }}>
            <div style={{ marginBottom: '10px' }}>
              <h3 style={{ fontSize: '14px', marginBottom: '10px' }}>修复后的 JSON</h3>
              <button
                onClick={handleDownloadFixed}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  marginBottom: '10px',
                }}
              >
                下载修复后的 JSON
              </button>
            </div>
            <div style={{ border: '1px solid #ccc', padding: '10px', borderRadius: '4px', maxHeight: '300px', overflow: 'auto' }}>
              <pre style={{ fontSize: '11px', fontFamily: 'monospace', margin: 0 }}>{fixedJson}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
