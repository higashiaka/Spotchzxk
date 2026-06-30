import { useState } from 'react';
import { LegalModal, LegalTab } from './LegalModal';

export const LegalFooter = () => {
  const [legalTab, setLegalTab] = useState<LegalTab | null>(null);

  return (
    <>
      <footer className="w-full max-w-full box-border clear-both mt-8 mb-2 md:mb-0 px-4 pt-5 pb-20 md:pb-5 border-t border-primary-token flex justify-center">
        <div className="w-full max-w-sm flex items-center justify-center gap-3 text-[11px] font-bold text-dim-token">
          <button
            type="button"
            onClick={() => setLegalTab('terms')}
            className="hover:text-main-token transition-colors"
          >
            이용약관
          </button>
          <span aria-hidden="true" className="opacity-40">|</span>
          <button
            type="button"
            onClick={() => setLegalTab('privacy')}
            className="hover:text-main-token transition-colors"
          >
            개인정보처리방침
          </button>
        </div>
      </footer>

      {legalTab && (
        <LegalModal
          initialTab={legalTab}
          onClose={() => setLegalTab(null)}
        />
      )}
    </>
  );
};
