'use client';

import { FileText, Image as ImageIcon, FileVideo, FileAudio, FileType, Archive, Code, FileSpreadsheet, File as FileIcon, Folder } from 'lucide-react';
import { categoryOf } from '@/app/lib/fileTypes';

export function FileTypeIcon({ name, mime, size = 18, className = '' }) {
  const cat = categoryOf(mime || '', name);
  const cls = `${className} shrink-0`;
  switch (cat) {
    case 'image': return <ImageIcon size={size} className={`${cls} text-emerald-400`} />;
    case 'video': return <FileVideo size={size} className={`${cls} text-pink-400`} />;
    case 'audio': return <FileAudio size={size} className={`${cls} text-purple-400`} />;
    case 'pdf':   return <FileType size={size} className={`${cls} text-red-400`} />;
    case 'archive': return <Archive size={size} className={`${cls} text-amber-400`} />;
    case 'text':  return <Code size={size} className={`${cls} text-sky-400`} />;
    case 'doc':   return <FileSpreadsheet size={size} className={`${cls} text-blue-400`} />;
    default:      return <FileIcon size={size} className={`${cls} text-ink-faint`} />;
  }
}

export function FolderIcon({ size = 18, className = '' }) {
  return <Folder size={size} className={`${className} text-amber-300 shrink-0`} fill="currentColor" fillOpacity={0.18} />;
}

export { FileText };
