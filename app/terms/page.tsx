import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalSection as Section } from '@/components/LegalSection';
import {
  OPERATOR_NAME,
  SUPPORT_EMAIL,
  SERVICE_DOMAIN,
  LEGAL_EFFECTIVE_DATE_TEXT,
  GOVERNING_LAW,
  JURISDICTION_VENUE,
  REFUND_WINDOW_DAYS,
} from '@/lib/legalConfig';

/**
 * app/terms/page.tsx
 * 服务条款（服务端组件）
 *
 * 编写原则与 /privacy 相同：条款里的每条事实性描述都必须与产品实际行为一致
 * （例如「积分一次性购买、无订阅」「1 积分 = 1 次生成」对应 app/api/generate/route.ts
 * 与 pricing_packages 表的实现）。改产品逻辑时请同步本页。
 *
 * 注意：本文档不构成法律意见。上线前建议由律师按你的司法辖区过一遍 ——
 *       特别是责任限制、退款与适用法律三节。
 */

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The terms that govern your use of Magic Cartoon Avatar, including credits, payments, refunds, acceptable use and ownership of your generated avatars.',
  alternates: {
    canonical: '/terms',
  },
};

const TOC = [
  { id: 'agreement', label: 'Agreement to these terms' },
  { id: 'the-service', label: 'The Service' },
  { id: 'your-account', label: 'Your account' },
  { id: 'credits', label: 'Credits and payments' },
  { id: 'refunds', label: 'Refunds' },
  { id: 'your-content', label: 'Your photos and your avatars' },
  { id: 'acceptable-use', label: 'Acceptable use' },
  { id: 'ai-output', label: 'AI-generated results' },
  { id: 'third-parties', label: 'Third-party services' },
  { id: 'our-ip', label: 'Our intellectual property' },
  { id: 'availability', label: 'Availability and changes' },
  { id: 'termination', label: 'Suspension and termination' },
  { id: 'disclaimers', label: 'Disclaimers' },
  { id: 'liability', label: 'Limitation of liability' },
  { id: 'law', label: 'Governing law' },
  { id: 'changes', label: 'Changes to these terms' },
];

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <header className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Terms of Service</h1>
          <p className="mt-3 text-gray-500">
            Effective date: {LEGAL_EFFECTIVE_DATE_TEXT} · Applies to {SERVICE_DOMAIN}
          </p>
        </header>

        <nav aria-label="Sections of these terms" className="mb-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
            Contents
          </h2>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {TOC.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="text-sm text-blue-600 hover:underline">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <Section id="agreement" title="Agreement to these terms">
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) are a legal agreement between you and{' '}
            <strong>{OPERATOR_NAME}</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;) governing your
            use of {SERVICE_DOMAIN} (the &ldquo;Service&rdquo;).
          </p>
          <p>
            By creating an account, generating an avatar or purchasing credits, you agree to these
            Terms and to our{' '}
            <Link href="/privacy" className="text-blue-600 hover:underline">
              Privacy Policy
            </Link>
            . If you do not agree, please do not use the Service.
          </p>
        </Section>

        <Section id="the-service" title="The Service">
          <p>
            The Service uses artificial intelligence to turn a photo you upload into a
            cartoon-style avatar. You choose one of the available styles, and each generation costs
            one credit.
          </p>
          <p>
            Results are produced by an automated AI model and vary from photo to photo. We do not
            review results before they are shown to you.
          </p>
        </Section>

        <Section id="your-account" title="Your account">
          <ul className="list-disc ml-5 space-y-1.5">
            <li>
              You must provide accurate information and keep your login credentials confidential.
            </li>
            <li>
              You are responsible for everything that happens through your account. Contact us
              immediately if you believe it has been compromised.
            </li>
            <li>
              You must be at least 13 years old, or older if your country sets a higher age of
              digital consent (16 in some countries).
            </li>
            <li>
              One account is for one person. Do not share an account to circumvent credit or rate
              limits.
            </li>
          </ul>
        </Section>

        <Section id="credits" title="Credits and payments">
          <ul className="list-disc ml-5 space-y-1.5">
            <li>
              <strong>One credit = one avatar generation.</strong> You can choose any of the
              available styles without paying more.
            </li>
            <li>
              New accounts may receive a small number of free credits so you can try the Service.
              Free credits have no cash value.
            </li>
            <li>
              Credit packs are <strong>one-time purchases</strong>. There is no subscription and
              nothing recurring to cancel.
            </li>
            <li>
              Credits <strong>never expire</strong>. They are personal to your account, cannot be
              transferred to someone else, and have no cash value outside this Service.
            </li>
            <li>
              Prices are shown in US dollars on the{' '}
              <Link href="/pricing" className="text-blue-600 hover:underline">
                pricing page
              </Link>{' '}
              before you pay. We may change prices for future purchases; credits you have already
              bought are not affected.
            </li>
            <li>
              <strong>Credits are only deducted when a generation succeeds.</strong> If the AI fails
              to produce your avatar, you are not charged.
            </li>
          </ul>
          <div className="rounded-xl border border-gray-200 bg-white p-4 mt-4">
            <p className="font-semibold text-gray-900 mb-1.5">How payment works</p>
            <p className="text-sm">
              Payments are processed by <strong>Dodo Payments</strong>, which acts as the{' '}
              <em>merchant of record</em> for your purchase. That means Dodo Payments is the seller
              for the transaction: they handle the payment, the applicable sales taxes or VAT, and
              any payment-related customer service. Your bank or card statement will show their
              transaction descriptor. <strong>We never receive or store your card details.</strong>
            </p>
          </div>
        </Section>

        <Section id="refunds" title="Refunds">
          <ul className="list-disc ml-5 space-y-1.5">
            <li>
              <strong>Unused credits.</strong> You may request a refund for credits you have not
              used within <strong>{REFUND_WINDOW_DAYS} days</strong> of purchase. Refunds are
              returned to your original payment method through our payment provider.
            </li>
            <li>
              <strong>Used credits.</strong> Credits that have already been spent on generations
              cannot be refunded — the digital content has been delivered and consumed.
            </li>
            <li>
              <strong>If something breaks on our side.</strong> If you are charged but receive no
              avatar, or you cannot access a purchase, contact us and we will restore the credits or
              refund you.
            </li>
            <li>
              <strong>How to request.</strong> Email{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline">
                {SUPPORT_EMAIL}
              </a>{' '}
              from the address on your account, including your payment reference. We aim to answer
              within a few business days.
            </li>
          </ul>
          <p className="text-sm text-gray-500">
            If you are a consumer in the EU, UK or another jurisdiction with statutory withdrawal
            rights: by purchasing credits you ask us to begin performing the service immediately. By
            using credits, you acknowledge that you lose the right of withdrawal for the credits
            already consumed. Nothing in these Terms limits rights you have under mandatory local
            consumer law, including your right to a remedy when a digital purchase is faulty.
          </p>
        </Section>

        <Section id="your-content" title="Your photos and your avatars">
          <p>
            <strong>You keep the rights to your photos.</strong> Uploading a photo does not transfer
            ownership of it to us.
          </p>
          <p>
            To operate the Service, you grant us a limited licence to store the photo you upload,
            transmit it to our AI processing provider, and hold the resulting avatar alongside it —
            solely so that we can generate your avatar, show it to you and let you download it. That
            licence ends when you delete the content or close your account, apart from copies we must
            keep for legal or backup purposes.
          </p>
          <p>
            <strong>As between you and us, the avatars generated from your photo are yours</strong> —
            you may use them for personal or commercial purposes, including as your profile picture,
            on merchandise or in your own content. We do not claim ownership of them.
          </p>
          <p className="text-sm text-gray-500">
            One honest caveat: the copyright status of AI-generated images is still unsettled in
            many countries. We therefore cannot promise that an avatar is copyrightable, or that you
            could register or enforce rights in it — but we will not claim rights in it ourselves.
          </p>
          <p>
            You confirm that you own the photo you upload, or that you have permission from the
            person in it to use it for this purpose, and that doing so does not infringe anyone
            else&rsquo;s rights. Do not upload photos of other people without their consent, and do
            not upload photos of children.
          </p>
          <p>
            You can delete any creation or your whole history at any time from{' '}
            <Link href="/creations" className="text-blue-600 hover:underline">
              My Creations
            </Link>
            , or by asking us.
          </p>
        </Section>

        <Section id="acceptable-use" title="Acceptable use">
          <p>You agree not to use the Service to:</p>
          <ul className="list-disc ml-5 space-y-1.5">
            <li>
              upload a photo of someone else without their permission, or a photo of anyone under
              18;
            </li>
            <li>
              create content involving public figures, celebrities or private individuals that
              could mislead, defame, impersonate, imply an endorsement or be used to deceive
              anyone;
            </li>
            <li>
              create or share anything illegal, sexual, pornographic, sexually suggestive involving
              real people, violent, hateful, harassing, discriminatory or defamatory;
            </li>
            <li>
              bypass or attempt to bypass credits, rate limits, access controls or any other
              security measure, including automated or bulk requests;
            </li>
            <li>
              scrape the Service, resell or white-label it, or use it to build a competing
              product or a training dataset, without our written permission;
            </li>
            <li>infringe anyone&rsquo;s intellectual property, privacy or other rights.</li>
          </ul>
          <p>
            If you breach these rules we may remove the content involved and suspend or terminate
            your account. Where the breach is serious (for example, unlawful imagery or attempts to
            defraud the credit system), we may do so immediately and without a refund.
          </p>
        </Section>

        <Section id="ai-output" title="AI-generated results">
          <ul className="list-disc ml-5 space-y-1.5">
            <li>
              Results come from a probabilistic AI model. They can be imperfect, may not resemble you
              exactly, and may contain visual artefacts.
            </li>
            <li>
              We cannot guarantee a particular result or that you will like it. You are free to
              generate again — each generation costs one credit.
            </li>
            <li>
              Do not rely on avatars for identification, official documentation, age or identity
              verification, or any safety-critical purpose.
            </li>
            <li>
              Styles, and the underlying AI models, may change or be retired over time as the
              technology develops.
            </li>
          </ul>
        </Section>

        <Section id="third-parties" title="Third-party services">
          <p>
            The Service relies on third-party providers, including our AI processing provider, our
            database and authentication provider, our hosting provider, our payment provider and our
            analytics provider. Their services are governed by their own terms, and their
            availability is outside our control. The{' '}
            <Link href="/privacy" className="text-blue-600 hover:underline">
              Privacy Policy
            </Link>{' '}
            lists who they are and what they receive.
          </p>
        </Section>

        <Section id="our-ip" title="Our intellectual property">
          <p>
            The Service itself — the website, its design, its software, our name and logo, and the
            collection of AI styles we offer — belongs to us or our licensors and is protected by
            intellectual property law. These Terms give you a personal, non-exclusive,
            non-transferable right to use the Service; they do not transfer any ownership of it to
            you.
          </p>
        </Section>

        <Section id="availability" title="Availability and changes">
          <p>
            We aim to keep the Service available, but we do not promise uninterrupted access. We may
            modify, add or remove features, styles or credit packs. Individual AI models can be
            deprecated by our provider, and occasionally generations may fail or take longer than
            usual.
          </p>
          <p>
            If we discontinue the Service altogether, we will give reasonable advance notice on this
            site and, where possible, offer a refund for unused credits.
          </p>
        </Section>

        <Section id="termination" title="Suspension and termination">
          <p>
            You may stop using the Service at any time and ask us to close your account. We may
            suspend or terminate your access if you materially breach these Terms, if we are
            required to by law, or to protect the Service or other users. Where a breach is not
            serious, we will normally warn you first and give you the chance to fix it.
          </p>
          <p>
            If we terminate your account for a serious breach, unused credits are forfeited. If we
            terminate for any other reason, or if you close your account in good standing, you may
            ask us to refund any unused credits.
          </p>
        </Section>




        <Section id="disclaimers" title="Disclaimers">
          <p>
            The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the
            fullest extent permitted by law, we disclaim all implied warranties, including
            merchantability, fitness for a particular purpose and non-infringement. We do not warrant
            that the Service will be uninterrupted, error-free or secure, or that any AI-generated
            result will meet your expectations.
          </p>
          <p className="text-sm text-gray-500">
            Some jurisdictions do not allow the exclusion of certain warranties. Nothing in this
            section is intended to limit any right you have that cannot legally be limited.
          </p>
        </Section>

        <Section id="liability" title="Limitation of liability">
          <p>
            To the fullest extent permitted by law, we are not liable for indirect, incidental,
            special, consequential or punitive damages, or for lost profits, lost data, lost
            goodwill or business interruption arising from your use of the Service.
          </p>
          <p>
            Our total aggregate liability for all claims relating to the Service is limited to the
            greater of: (a) the amount you paid us in the twelve months before the event giving rise
            to the claim, or (b) US$50.
          </p>
          <p className="text-sm text-gray-500">
            Nothing in these Terms excludes or limits our liability for fraud, for death or personal
            injury caused by our negligence, or for anything else that cannot lawfully be excluded.
          </p>
        </Section>

        <Section id="law" title="Governing law">
          <p>
            These Terms are governed by <strong>{GOVERNING_LAW}</strong>, without regard to conflict
            of law rules. You and we agree to submit disputes to the exclusive jurisdiction of{' '}
            <strong>{JURISDICTION_VENUE}</strong>, except that either of us may seek relief in any
            court with competent jurisdiction to protect intellectual property or prevent unlawful
            use.
          </p>
          <p className="text-sm text-gray-500">
            If you are a consumer, this section does not deprive you of the protection of the
            mandatory consumer law of the country where you live, or of your right to bring
            proceedings there.
          </p>
        </Section>

        <Section id="changes" title="Changes to these terms">
          <p>
            We may update these Terms as the Service changes. The effective date at the top of this
            page will be updated, and for significant changes — for example, changes to pricing
            rules, credits or refunds — we will give notice by email or in the app before the change
            takes effect. Continuing to use the Service after that means you accept the updated
            Terms.
          </p>
          <p>
            If any provision of these Terms is found to be unenforceable, the remaining provisions
            stay in force. Our failure to enforce a provision is not a waiver of it. These Terms,
            together with the{' '}
            <Link href="/privacy" className="text-blue-600 hover:underline">
              Privacy Policy
            </Link>
            , are the entire agreement between you and us about the Service.
          </p>
        </Section>

        {/* 结尾 */}
        <div className="border-t border-gray-200 pt-8">
          <p className="text-gray-600">
            Questions about these Terms? Email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
          <a href="#top" className="inline-block mt-4 text-sm text-gray-500 hover:text-gray-700">
            ↑ Back to top
          </a>
        </div>
      </main>
    </div>
  );
}

