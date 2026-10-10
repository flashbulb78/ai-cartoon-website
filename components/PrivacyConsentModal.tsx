/**
 * components/PrivacyConsentModal.tsx
 * Privacy consent modal with multi-language support
 * Requires user to actively consent before uploading face images
 *
 * ⚠️ 这里的告知文案必须与**实际数据处理行为**保持一致 —— 这是同意有效性的前提：
 *      • 照片会发送给第三方 AI 服务商（MiniMax）用于生成头像
 *      • 上传的原图与生成结果都会入库保存，且仅保留最近 10 条
 *      • 用户可在「My Creations」自行删除单条或全部记录
 *
 *    历史问题（已修正）：早期文案写着「图片在处理后不会存储在我们的服务器上」
 *    「图片不会与第三方共享」，这两条与代码实际行为相反 ——
 *    原图确实会入库（app/api/generate/route.ts），图片确实会发给 MiniMax（lib/minimax.ts）。
 *    失实告知比没有告知更糟：既损害用户信任，也让同意失去法律基础。
 *
 * 修改数据处理逻辑时，请同步更新本文件 **7 种语言**的文案，并运行
 *   bash scripts/verification/run.sh
 * （scripts/verification/legal.test.js 会检查失实声明是否被重新引入）
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from './ui/Button';

interface PrivacyConsentModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Callback when user accepts */
  onAccept: () => void;
  /** Callback when user declines */
  onDecline: () => void;
}

/**
 * Multi-language consent text
 */
const CONSENT_TEXTS = {
  en: {
    title: 'Privacy Notice',
    subtitle: 'Your face image will only be used to generate cartoon avatars',
    statement: `The face image you upload is processed by AI to generate your cartoon avatar. Here is exactly how it is handled:

• It is sent to our AI provider for the sole purpose of generating your avatar
• Your upload and the result are saved in your account so you can view them again; we keep only your 10 most recent generations
• You can delete any generation, or your whole history, at any time
• We never use your image to identify you, to train AI models or for advertising, and we never sell it

By clicking "I Accept", you confirm that you understand and agree to these terms.`,
    accept: 'I Accept',
    decline: 'Cancel',
  },
  fr: {
    title: 'Avis de confidentialité',
    subtitle: "Votre image de visage sera utilisée uniquement pour générer des avatars cartoon",
    statement: `L'image de votre visage que vous téléchargez est traitée par IA pour générer votre avatar cartoon. Voici exactement comment elle est traitée :

• Elle est envoyée à notre fournisseur d'IA dans le seul but de générer votre avatar
• Votre image et le résultat sont enregistrés dans votre compte pour que vous puissiez les revoir ; nous ne conservons que vos 10 générations les plus récentes
• Vous pouvez supprimer une génération, ou tout votre historique, à tout moment
• Nous n'utilisons jamais votre image pour vous identifier, pour entraîner des modèles d'IA ni à des fins publicitaires, et nous ne la vendons jamais

En cliquant sur "J'accepte", vous confirmez que vous comprenez et acceptez ces conditions.`,
    accept: "J'accepte",
    decline: 'Annuler',
  },
  ms: {
    title: 'Notis Privasi',
    subtitle: 'Imej wajah anda akan hanya digunakan untuk penjanaan avatar kartun',
    statement: `Imej wajah yang anda muat naik diproses oleh AI untuk menjana avatar kartun anda. Berikut adalah cara ia dikendalikan:

• Ia dihantar kepada pembekal AI kami semata-mata untuk menjana avatar anda
• Muat naik dan hasilnya disimpan dalam akaun anda supaya anda boleh melihatnya semula; kami hanya menyimpan 10 penjanaan terkini anda
• Anda boleh memadam mana-mana penjanaan, atau seluruh sejarah anda, pada bila-bila masa
• Kami tidak pernah menggunakan imej anda untuk mengenal pasti anda, untuk melatih model AI atau untuk pengiklanan, dan kami tidak pernah menjualnya

Dengan mengklik "Saya Terima", anda mengesahkan bahawa anda memahami dan bersetuju dengan terma ini.`,
    accept: 'Saya Terima',
    decline: 'Batal',
  },
  ja: {
    title: 'プライバシーに関するお知らせ',
    subtitle: '顔写真はカートゥーンアバターの生成にのみ使用されます',
    statement: `アップロードされた顔写真は、カートゥーンアバターを生成するためにAIで処理されます。取り扱いは次のとおりです：

• アバターを生成するためだけに、当社のAI提供事業者へ送信されます
• アップロードした写真と生成結果は、後で見返せるようにアカウントに保存されます。保持するのは直近10件の生成記録のみです
• 生成記録は、個別にも全件も、いつでも削除できます
• 画像を本人確認、AIモデルの学習、広告に利用することは一切なく、販売もしません

「同意する」をクリックすることで、これらの条件を理解し、同意することを確認したことになります。`,
    accept: '同意する',
    decline: 'キャンセル',
  },
  ko: {
    title: '개인정보 보호 고지',
    subtitle: '얼굴 이미지는 카툰 아바타 생성에만 사용됩니다',
    statement: `업로드하신 얼굴 이미지는 카툰 아바타를 생성하기 위해 AI로 처리됩니다. 처리 방식은 다음과 같습니다:

• 아바타를 생성하기 위한 목적으로만 당사의 AI 제공업체로 전송됩니다
• 업로드한 이미지와 생성 결과는 나중에 다시 볼 수 있도록 계정에 저장되며, 최근 10건의 생성 기록만 보관합니다
• 생성 기록은 개별적으로도, 전체를 한 번에 삭제할 수도 있습니다
• 이미지를 본인 확인, AI 모델 학습, 광고에 사용하지 않으며 판매하지도 않습니다

"동의함"을 클릭하면, 이러한 조건을 이해하고 동의하시는 것입니다.`,
    accept: '동의함',
    decline: '취소',
  },
  es: {
    title: 'Aviso de privacidad',
    subtitle: 'Su imagen solo se utilizará para generar avatares de dibujos animados',
    statement: `La imagen de su rostro que carga se procesa con IA para generar su avatar de dibujos animados. Así es exactamente como se trata:

• Se envía a nuestro proveedor de IA con el único fin de generar su avatar
• Su imagen y el resultado se guardan en su cuenta para que pueda volver a verlos; solo conservamos sus 10 generaciones más recientes
• Puede eliminar cualquier generación, o todo su historial, en cualquier momento
• Nunca utilizamos su imagen para identificarle, para entrenar modelos de IA ni con fines publicitarios, y nunca la vendemos

Al hacer clic en "Acepto", confirma que comprende y acepta estos términos.`,
    accept: 'Acepto',
    decline: 'Cancelar',
  },
  zh: {
    title: '隐私声明',
    subtitle: '您的面部图片仅用于生成卡通头像',
    statement: `您上传的面部图片会通过 AI 处理以生成卡通头像。具体处理方式如下：

• 仅为了生成您的头像而发送给我们的 AI 服务商
• 您上传的图片与生成结果会保存在您的账号中以便您再次查看；我们只保留您最近 10 条生成记录
• 您可以随时删除单条生成记录，或清空全部历史记录
• 我们绝不会将您的图片用于身份识别、训练 AI 模型或广告用途，也绝不会出售

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

          {/* 指向完整隐私政策：同意前的告知不可能涵盖所有细节，
              这里给出可进一步阅读的入口（新窗口打开，不打断同意流程） */}
          <p className="mt-4 text-sm text-gray-500">
            See the full{' '}
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Privacy Policy
            </Link>{' '}
            for complete details.
          </p>
          
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