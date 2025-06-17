
import React from 'react';
import { BlockDefinition } from '../types';

interface NextBlockPreviewProps {
  definition: BlockDefinition | null;
}

const NextBlockPreview: React.FC<NextBlockPreviewProps> = ({ definition }) => {
  if (!definition) {
    return (
      <div className="p-4 bg-white/10 backdrop-blur-sm rounded-lg shadow-md text-center">
        <h3 className="text-xl font-semibold mb-3 text-white">다음 블록</h3>
        <div className="w-12 h-12 mx-auto mb-2 rounded-sm bg-gray-500/50 animate-pulse"></div>
        <p className="text-gray-300">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white/10 backdrop-blur-sm rounded-lg shadow-md">
      <h3 className="text-xl font-semibold mb-3 text-center text-white">다음 블록</h3>
      <div
        className="w-12 h-12 mx-auto mb-2 rounded-sm transition-all duration-300"
        style={{ backgroundColor: `#${definition.color.toString(16).padStart(6, '0')}` }}
        aria-label={`${definition.name} 다음 블록 미리보기`}
      ></div>
      <p className="text-center text-white">{definition.name}</p>
    </div>
  );
};

export default NextBlockPreview;
