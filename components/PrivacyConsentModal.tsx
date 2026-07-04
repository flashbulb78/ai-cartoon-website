/**
 * components/PrivacyConsentModal.tsx
 * Privacy consent modal with multi-language support
 * Requires user to actively consent before uploading face images
 */

import { useState, useCallback } from 'react';
import { Button } from './ui/Button';

interface PrivacyConsentModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Callback when user accepts */
  onAccept: () => void;
  /** Callback when user declines */
  onDecline: () => void;
  /** Modal title */
  title?: string;
}

/**
 * Multi-language consent text
 */
const CONSENT_TEXTS = {
  en: {
    title: 'Privacy Notice',
    subtitle: 'Your face image will only be used to generate cartoon avatars',
    statement: `The face image you upload will ONLY be used for generating cartoon avatars with AI technology. We want to be completely transparent:

• Your image will NOT be stored on our servers after processing
• Your image will NOT be shared with third parties
• Your image will NOT be used for any other purposes
• You can delete your generation history at any time

By clicking "I Accept", you confirm that you understand and agree to these terms.`,
    accept: 'I Accept',
    decline: 'Cancel',
  },
  fr: {
    title: 'Avis de confidentialité',
    subtitle: "Votre image de visage sera utilisée uniquement pour générer des avatars cartoon",
    statement: `L'image de votre visage sera UNIQUEMENT utilisée pour générer des avatars cartoon avec la technologie IA. Nous voulons être complètement transparents:

• Votre image ne sera PAS stockée sur nos serveurs après le traitement
• Votre image ne sera PAS partagée avec des tiers
• Votre image ne sera PAS utilisée à d'autres fins
• Vous pouvez supprimer votre historique de génération à tout moment

En cliquant sur "J'accepte", vous confirmez que vous comprenez et acceptez ces conditions.`,
    accept: "J'accepte",
    decline: 'Annuler',
  },
  ms: {
    title: 'Notis Privasi',
    subtitle: 'Imej wajah anda akan hanya digunakan untuk penjanaan avatar kartun',
    statement: `Imej wajah yang anda muat naik akan HANYA digunakan untuk penjanaan avatar kartun dengan teknologi AI. Kami ingin menjadi telus sepenuhnya:

• Imej anda TIDAK akan disimpan di pelayan kami selepas pemprosesan
• Imej anda TIDAK akan dikongsi dengan pihak ketiga
• Imej anda TIDAK akan digunakan untuk tujuan lain
• Anda boleh memadam sejarah penjanaan anda pada bila-bila masa

Dengan mengklik "Saya Terima", anda mengesahkan bahawa anda memahami dan bersetuju dengan terma ini.`,
    accept: 'Saya Terima',
    decline: 'Batal',
  },
  ja: {
    title: 'プライバシーに関するお知らせ',
    subtitle: '面部画像は卡通アバターを生成するためにのみ使用されます',
    statement: `アップロードした面部画像は、AI技術を使用して卡通アバターを生成するためだけに使用されます。透明性を確保したいと考えています：

• 画像は処理後に当社のサーバーに保存されません
• 画像は第三者と共有されません
• 画像は他の目的には使用されません
• 生成履歴はいつでも削除できます

「同意する」をクリックすることで、これらの条件を理解し、同意することを確認したことになります。`,
    accept: '同意する',
    decline: 'キャンセル',
  },
  ko: {
    title: '개인정보 보호 고지',
    subtitle: '얼굴 이미지는 카툰 아바타 생성에만 사용됩니다',
    statement: `업로드하신 얼굴 이미지는 AI 기술로 카툰 아바타를 생성하는 데만 사용됩니다. 완전히 투명하게 안내드립니다:

• 이미지는 처리 후 당사 서버에 저장되지 않습니다
• 이미지는 제3자와 공유되지 않습니다
• 이미지는 다른 목적으로 사용되지 않습니다
• 생성 기록은 언제든지 삭제할 수 있습니다

"동의함"을 클릭하면, 이러한 조건을 이해하고 동의하시는 것입니다.`,
    accept: '동의함',
    decline: '취소',
  },
  es: {
    title: 'Aviso de privacidad',
    subtitle: 'Su imagen de rostro solo se utilizará para generar avatares de cartoon',
    statement: `La imagen de su rostro que cargue se utilizará ÚNICAMENTE para generar avatares de cartoon con tecnología de IA. Queremos ser completamente transparentes:

• Su imagen NO se almacenará en nuestros servidores después del procesamiento
• Su imagen NO se compartirá con terceros
• Su imagen NO se utilizará para ningún otro propósito
• Puede eliminar su historial de generaciones en cualquier momento

Al hacer clic en "Acepto", confirma que comprende y acepta estos términos.`,
    accept: 'Acepto',
    decline: 'Cancelar',
  },
  zh: {
    title: '隐私声明',
    subtitle: '您的面部图片仅用于生成卡通头像',
    statement: `您上传的面部图片仅会使用AI技术生成卡通头像。我们希望完全透明：

• 您的图片在处理后不会存储在我们的服务器上
• 您的图片不会与第三方共享
• 您的图片不会用于任何其他目的
• 您可以随时删除您的生成历史

点击"我同意"，即表示您确认理解并同意这些条款。`,
    accept: '我同意',
    decline: '取消',
  },
};

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'ms', name: 'Bahasa Melayu' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'es', name: 'Español' },
  { code: 'zh', name: '中文' },
] as const;

export function PrivacyConsentModal({
  isOpen,
  onAccept,
  onDecline,
  title = 'Privacy Notice',
}: PrivacyConsentModalProps) {
  const [selectedLang, setSelectedLang] = useState<keyof typeof CONSENT_TEXTS>('en');
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [isConsentChecked, setIsConsentChecked] = useState(false);

  const currentText = CONSENT_TEXTS[selectedLang];

  const handleAccept = useCallback(() => {
    if (!isConsentChecked) {
      return;
    }
    onAccept();
  }, [isConsentChecked, onAccept]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const element = e.target as HTMLDivElement;
    const isAtBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 50;
    setHasScrolledToBottom(isAtBottom);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900">{currentText.title}</h2>
            </div>
          </div>
          <p className="text-blue-600 font-medium text-center">{currentText.subtitle}</p>
          
          {/* Language selector */}
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => setSelectedLang(lang.code as keyof typeof CONSENT_TEXTS)}
                className={`
                  px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                  ${selectedLang === lang.code
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }
                `}
              >
                {lang.name}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto p-6"
          onScroll={handleScroll}
        >
          <div className="prose prose-sm max-w-none text-gray-600 whitespace-pre-line">
            {currentText.statement}
          </div>
          
          {/* Scroll indicator */}
          {!hasScrolledToBottom && (
            <div className="mt-4 text-center text-sm text-gray-400">
              ↓ Please scroll to read the entire statement ↓
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 border-t border-gray-100 bg-gray-50">
          {/* Checkbox - requires active consent */}
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                id="consent-checkbox"
                className="mt-1 w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                checked={isConsentChecked}
                onChange={(e) => setIsConsentChecked(e.target.checked)}
              />
              <span className="text-sm text-amber-800">
                I have read and understood the privacy statement above, and I voluntarily agree to upload my face image for avatar generation.
              </span>
            </label>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onDecline}
              className="flex-1"
            >
              {currentText.decline}
            </Button>
            <Button
              variant="primary"
              onClick={handleAccept}
              disabled={!isConsentChecked}
              className="flex-1"
            >
              {currentText.accept}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}