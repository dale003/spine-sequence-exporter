import { useState, useRef, useCallback, useEffect } from 'react';
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

type TabType = 'export' | 'analyze';

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
  const [activeTab, setActiveTab] = useState<TabType>('export');
  const [files, setFiles] = useState<Array<File & { width?: number; height?: number; preview?: string }>>([]);
  const [animationName, setAnimationName] = useState('sequence');
  const [fps, setFps] = useState('30');
  const [skeletonName, setSkeletonName] = useState('SequenceImport');
  const [imagesPath, setImagesPath] = useState('./images/');
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewJson, setPreviewJson] = useState<string | null>(null);
  const [exportMode, setExportMode] = useState<ExportMode>('new-project');
  const [targetSlotName, setTargetSlotName] = useState('frameSlot');
  const [targetBoneName, setTargetBoneName] = useState('root');
  const [targetSkinName, setTargetSkinName] = useState('default');
  const [spineCompatibilityVersion, setSpineCompatibilityVersion] = useState('3.8.99');
  const [attachmentNameStrategy, setAttachmentNameStrategy] = useState<'basename' | 'filename'>('basename');
  const [attachmentConflictStrategy, setAttachmentConflictStrategy] = useState<'error' | 'rename'>('error');
  const [analyzeJson, setAnalyzeJson] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<SpineJsonAnalysis | null>(null);
  const [fixedJson, setFixedJson] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [analyzeDragOver, setAnalyzeDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analyzeInputRef = useRef<HTMLInputElement>(null);

  // 清理预览 URL
  useEffect(() => {
    return () => {
      files.forEach(f => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
    };
  }, [files]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      setLoading(true);
      try {
        const filesWithDimensions = await loadImageDimensions(Array.from(selectedFiles));
        // 生成预览 URL
        const filesWithPreview = filesWithDimensions.map(f => ({
          ...f,
          preview: URL.createObjectURL(f),
        }));
        const sortedFiles = naturalSortPreview(filesWithPreview);
        setFiles(sortedFiles);
        setErrors([]);
      } catch (error) {
        setErrors([(error as Error).message]);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      setLoading(true);
      try {
        const pngFiles = Array.from(droppedFiles).filter(f => f.name.toLowerCase().endsWith('.png'));
        if (pngFiles.length === 0) {
          setErrors(['请拖入 PNG 格式的图片文件']);
          setLoading(false);
          return;
        }
        const filesWithDimensions = await loadImageDimensions(pngFiles);
        const filesWithPreview = filesWithDimensions.map(f => ({
          ...f,
          preview: URL.createObjectURL(f),
        }));
        const sortedFiles = naturalSortPreview(filesWithPreview);
        setFiles(prev => {
          // 合并并去重
          const merged = [...prev, ...sortedFiles];
          const seen = new Set<string>();
          return merged.filter(f => {
            if (seen.has(f.name)) return false;
            seen.add(f.name);
            return true;
          });
        });
        setErrors([]);
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

    setPreviewJson(JSON.stringify(json, null, 2));
    downloadJson(json, `${skeletonName}.json`);
    setErrors([]);
    setExportStatus('✓ JSON 文件已成功保存！');

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

  const handleAnalyzeDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setAnalyzeDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.toLowerCase().endsWith('.json')) {
      const fakeEvent = {
        target: { files: [droppedFile] },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleAnalyzeFile(fakeEvent);
    } else {
      setErrors(['请拖入 JSON 文件']);
    }
  };

  const handleFixAddSlots = () => {
    if (analyzeJson) {
      try {
        const json = JSON.parse(analyzeJson);
        const fixed = fixMissingSlots(json);
        setFixedJson(JSON.stringify(fixed, null, 2));
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
        setFixedJson(JSON.stringify(fixed, null, 2));
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

  const handleClearFiles = () => {
    files.forEach(f => {
      if (f.preview) URL.revokeObjectURL(f.preview);
    });
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="app-container">
      {/* 侧边栏 */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">🦴</div>
            <div className="sidebar-logo-text">
              <h1>Spine 导入工具</h1>
              <span>v0.1.0</span>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-title">功能模块</div>
          <div
            className={`nav-item ${activeTab === 'export' ? 'active' : ''}`}
            onClick={() => setActiveTab('export')}
          >
            <span className="nav-item-icon">📤</span>
            <span>序列帧导入</span>
          </div>
          <div
            className={`nav-item ${activeTab === 'analyze' ? 'active' : ''}`}
            onClick={() => setActiveTab('analyze')}
          >
            <span className="nav-item-icon">🔍</span>
            <span>JSON 分析与修复</span>
          </div>
        </nav>

        <div className="sidebar-footer">
          Spine Sequence Importer
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="main-content">
        {/* 顶部栏 */}
        <header className="content-header">
          <h2>{activeTab === 'export' ? '序列帧导入' : 'JSON 分析与修复'}</h2>
          <div className="content-header-actions">
            {files.length > 0 && activeTab === 'export' && (
              <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                {files.length} 张图片已加载
              </span>
            )}
          </div>
        </header>

        {/* 内容体 */}
        <div className="content-body">
          {/* ========== 导入功能 ========== */}
          {activeTab === 'export' && (
            <div className="conditional-section">
              {/* 文件上传卡片 */}
              <div className="card">
                <div className="card-header">
                  <div className="card-header-icon">🖼️</div>
                  <div>
                    <h3>图片资源</h3>
                    <p>选择或拖入 PNG 序列帧图片</p>
                  </div>
                </div>

                <div
                  className={`file-drop-zone ${isDragOver ? 'dragover' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="file-drop-zone-icon">📁</div>
                  <div className="file-drop-zone-text">
                    {files.length === 0 ? (
                      <>点击选择 或 <strong>拖入 PNG 图片</strong></>
                    ) : (
                      <>已选择 {files.length} 张图片，点击或拖入可追加</>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".png"
                    multiple
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                    disabled={loading}
                  />
                </div>

                {loading && (
                  <div className="loading-text">
                    <span className="loading-spinner"></span>
                    读取图片尺寸中...
                  </div>
                )}

                {/* 图片预览网格 */}
                {files.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>预览（自然排序）</span>
                      <button className="btn btn-secondary btn-sm" onClick={handleClearFiles}>清空</button>
                    </div>
                    <div className="thumbnail-grid">
                      {files.map((f, i) => (
                        <div key={f.name + i} className="thumbnail-item" title={f.name}>
                          <img src={f.preview} alt={f.name} />
                          <span className="thumbnail-index">{i + 1}</span>
                          {f.width && f.height && (
                            <span className="thumbnail-size">{f.width}×{f.height}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 导入设置卡片 */}
              <div className="card">
                <div className="card-header">
                  <div className="card-header-icon">⚙️</div>
                  <div>
                    <h3>导入设置</h3>
                    <p>配置 Spine JSON 导入参数</p>
                  </div>
                </div>

                {/* 导入模式 */}
                <div className="form-group">
                  <label className="form-label">导入模式</label>
                  <select
                    className="form-select"
                    value={exportMode}
                    onChange={(e) => setExportMode(e.target.value as ExportMode)}
                  >
                    <option value="new-project">新建项目 (New project)</option>
                    <option value="merge">合并到现有骨架 (Merge into project)</option>
                  </select>
                  <div className="form-hint">
                    新建项目：创建完整骨架，适合从头开始；合并模式：只导入动画和附件，可合并到现有骨架
                  </div>
                </div>

                {/* 合并模式专属字段 */}
                {exportMode === 'merge' && (
                  <div className="conditional-section">
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">目标 Slot 名称</label>
                        <input
                          className="form-input"
                          type="text"
                          value={targetSlotName}
                          onChange={(e) => setTargetSlotName(e.target.value)}
                          placeholder="现有骨架中 slot 的名称"
                        />
                        <div className="form-hint">必须与现有骨架中的 slot 名称完全匹配</div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">目标 Skin 名称</label>
                        <input
                          className="form-input"
                          type="text"
                          value={targetSkinName}
                          onChange={(e) => setTargetSkinName(e.target.value)}
                          placeholder="通常是 default"
                        />
                        <div className="form-hint">必须与现有骨架中的 skin 名称匹配</div>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">目标 Bone 名称</label>
                      <input
                        className="form-input"
                        type="text"
                        value={targetBoneName}
                        onChange={(e) => setTargetBoneName(e.target.value)}
                        placeholder="现有骨架中 bone 的名称"
                      />
                      <div className="form-hint">必须与现有骨架中的 bone 名称完全匹配</div>
                    </div>
                  </div>
                )}

                {/* 新建项目专属字段 */}
                {exportMode === 'new-project' && (
                  <div className="conditional-section">
                    <div className="form-group">
                      <label className="form-label">Skeleton 名称</label>
                      <input
                        className="form-input"
                        type="text"
                        value={skeletonName}
                        onChange={(e) => setSkeletonName(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="divider"></div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Spine 兼容版本</label>
                    <input
                      className="form-input"
                      type="text"
                      value={spineCompatibilityVersion}
                      onChange={(e) => setSpineCompatibilityVersion(e.target.value)}
                      placeholder="例如 3.8.99 / 4.0.64 / 4.2.0"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">动画名称</label>
                    <input
                      className="form-input"
                      type="text"
                      value={animationName}
                      onChange={(e) => setAnimationName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">FPS（帧率）</label>
                    <input
                      className="form-input"
                      type="number"
                      value={fps}
                      onChange={(e) => setFps(e.target.value)}
                      min="1"
                      step="1"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">图片路径（images path）</label>
                    <input
                      className="form-input"
                      type="text"
                      value={imagesPath}
                      onChange={(e) => setImagesPath(e.target.value)}
                      placeholder="./images/"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">附件命名策略</label>
                    <select
                      className="form-select"
                      value={attachmentNameStrategy}
                      onChange={(e) => setAttachmentNameStrategy(e.target.value as 'basename' | 'filename')}
                    >
                      <option value="basename">去扩展名（basename）</option>
                      <option value="filename">保留完整文件名（filename）</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">附件重名处理</label>
                    <select
                      className="form-select"
                      value={attachmentConflictStrategy}
                      onChange={(e) => setAttachmentConflictStrategy(e.target.value as 'error' | 'rename')}
                    >
                      <option value="error">报错并停止</option>
                      <option value="rename">自动重命名（_1, _2...）</option>
                    </select>
                  </div>
                </div>

                {/* 错误提示 */}
                {errors.length > 0 && (
                  <div className="error-list">
                    {errors.map((err, i) => (
                      <div key={i} className="error-item">
                        <span className="error-item-icon">⚠️</span>
                        <span>{err}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="btn-group">
                  <button
                    className="btn btn-primary"
                    onClick={handleExport}
                    disabled={files.length === 0 || loading}
                  >
                    📦 导入 JSON
                  </button>
                  {exportStatus && (
                    <span className="status-toast success">{exportStatus}</span>
                  )}
                </div>
              </div>

              {/* JSON 预览 */}
              {previewJson && (
                <div className="card conditional-section">
                  <div className="json-preview">
                    <div className="json-preview-header">
                      <h4>📋 JSON 预览</h4>
                    </div>
                    <div className="json-preview-body">
                      <pre>{previewJson}</pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========== JSON 分析与修复 ========== */}
          {activeTab === 'analyze' && (
            <div className="conditional-section">
              {/* 文件上传 */}
              <div className="card">
                <div className="card-header">
                  <div className="card-header-icon">📂</div>
                  <div>
                    <h3>上传 Spine JSON</h3>
                    <p>拖入或选择需要分析的 skeleton JSON 文件</p>
                  </div>
                </div>

                <div
                  className={`file-drop-zone ${analyzeDragOver ? 'dragover' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setAnalyzeDragOver(true); }}
                  onDragLeave={() => setAnalyzeDragOver(false)}
                  onDrop={handleAnalyzeDrop}
                  onClick={() => analyzeInputRef.current?.click()}
                >
                  <div className="file-drop-zone-icon">📄</div>
                  <div className="file-drop-zone-text">
                    点击选择 或 <strong>拖入 JSON 文件</strong>
                  </div>
                  <input
                    ref={analyzeInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleAnalyzeFile}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>

              {/* 分析结果 */}
              {analysisResult && (
                <div className="card conditional-section">
                  <div className="card-header">
                    <div className="card-header-icon">📊</div>
                    <div>
                      <h3>分析报告</h3>
                      <p>Slot 引用关系检测</p>
                    </div>
                  </div>

                  {/* 统计 */}
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-value">{analysisResult.definedSlots.length}</div>
                      <div className="stat-label">已定义 slots</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{analysisResult.referencedSlots.length}</div>
                      <div className="stat-label">被引用 slots</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value" style={{ color: analysisResult.missingSlots.length > 0 ? 'var(--error)' : 'var(--success)' }}>
                        {analysisResult.missingSlots.length}
                      </div>
                      <div className="stat-label">缺失 slots</div>
                    </div>
                  </div>

                  {/* 已定义 slots */}
                  <div className="analysis-section">
                    <div className="analysis-section-title">已定义的 slots</div>
                    <div className="analysis-tags">
                      {analysisResult.definedSlots.length > 0 ? (
                        analysisResult.definedSlots.map(s => (
                          <span key={s} className="analysis-tag success">{s}</span>
                        ))
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>无</span>
                      )}
                    </div>
                  </div>

                  {/* 被引用 slots */}
                  <div className="analysis-section">
                    <div className="analysis-section-title">被引用的 slots</div>
                    <div className="analysis-tags">
                      {analysisResult.referencedSlots.length > 0 ? (
                        analysisResult.referencedSlots.map(s => (
                          <span key={s} className="analysis-tag">{s}</span>
                        ))
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>无</span>
                      )}
                    </div>
                  </div>

                  {/* 缺失 slots */}
                  {analysisResult.missingSlots.length > 0 && (
                    <div className="analysis-section">
                      <div className="analysis-section-title" style={{ color: 'var(--error)' }}>
                        ⚠️ 缺失的 slots（已引用但未定义）
                      </div>
                      <div className="analysis-tags">
                        {analysisResult.missingSlots.map(s => (
                          <span key={s} className="analysis-tag danger">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 非法引用 */}
                  {analysisResult.orphanedReferences.length > 0 && (
                    <div className="analysis-section">
                      <div className="analysis-section-title" style={{ color: 'var(--error)' }}>
                        ⚠️ 非法引用位置
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', paddingLeft: '16px' }}>
                        {analysisResult.orphanedReferences.map((ref, i) => (
                          <div key={i} style={{ padding: '4px 0', fontFamily: 'monospace' }}>
                            <span style={{ color: 'var(--warning)' }}>{ref.location}</span>: {ref.fullPath} → {ref.slotName}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 详细报告 */}
                  <div className="json-preview" style={{ marginTop: '16px' }}>
                    <div className="json-preview-header">
                      <h4>📝 详细分析报告</h4>
                    </div>
                    <div className="json-preview-body">
                      <pre style={{ whiteSpace: 'pre-wrap' }}>{analysisResult.detailedReport}</pre>
                    </div>
                  </div>

                  {/* 成功提示 */}
                  {analysisResult.missingSlots.length === 0 && analysisResult.orphanedReferences.length === 0 && (
                    <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-md)', color: 'var(--success)', fontSize: '13px' }}>
                      ✓ 未发现缺失的 slot 引用，JSON 结构完整
                    </div>
                  )}
                </div>
              )}

              {/* 修复按钮 */}
              {analysisResult && analysisResult.missingSlots.length > 0 && (
                <div className="card conditional-section">
                  <div className="card-header">
                    <div className="card-header-icon">🔧</div>
                    <div>
                      <h3>修复方案</h3>
                      <p>选择一种方式修复 JSON 问题</p>
                    </div>
                  </div>
                  <div className="btn-group">
                    <button className="btn btn-success" onClick={handleFixAddSlots}>
                      ➕ 补全缺失的 slots
                    </button>
                    <button className="btn btn-warning" onClick={handleFixRemoveReferences}>
                      🗑️ 删除非法引用
                    </button>
                  </div>
                </div>
              )}

              {/* 修复结果 */}
              {fixedJson && (
                <div className="card conditional-section">
                  <div className="card-header">
                    <div className="card-header-icon">✅</div>
                    <div>
                      <h3>修复后的 JSON</h3>
                      <p>检查无误后可下载</p>
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={handleDownloadFixed} style={{ marginBottom: '16px' }}>
                    💾 下载修复后的 JSON
                  </button>
                  <div className="json-preview">
                    <div className="json-preview-body">
                      <pre>{fixedJson}</pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
