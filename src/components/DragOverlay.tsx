import { FileArchive, MousePointer2 } from 'lucide-react';

export function DragOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="drag-overlay">
      <div className="drag-card">
        <div className="drag-icon">
          <FileArchive size={34} />
        </div>
        <h2>释放以载入模型</h2>
        <p>.ysm 加密包或包含 ysm.json 的模型目录</p>
        <div className="drag-hint">
          <MousePointer2 size={13} />
          文件只会在内存中解密，不会写入磁盘
        </div>
      </div>
    </div>
  );
}
