import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalSection as Section } from '@/components/LegalSection';
import {
  OPERATOR_NAME,
  SUPPORT_EMAIL,
  SERVICE_DOMAIN,
  LEGAL_EFFECTIVE_DATE_TEXT,
  GENERATION_HISTORY_LIMIT,
} from '@/lib/legalConfig';

/**
 * app/privacy/page.tsx
 * 隐私政策（服务端组件）
 *
 * 编写原则（重要）：
 *   本文档刻意**只描述代码里真实发生的事**。每条声明都能在仓库里找到对应实现，
 *   例如「只保留最近 10 条生成记录」对应 app/api/generate/route.ts 的清理逻辑，
 *   「照片会发送给 MiniMax」对应 lib/minimax.ts 的接口调用。
 *
 *   因此：**修改数据处理逻辑时必须同步更新本页**，
 *   否则页面会与实现脱节 —— 而这比没有隐私政策更糟。
 *   （scripts/verification/legal.test.js 会对关键声明做回归检查）
 *
 * 注意：本文档不构成法律意见。上线前建议由熟悉你所在司法辖区的律师过一遍。
 */

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How Magic Cartoon Avatar collects, uses, stores and protects your personal data, including the photos you upload to generate cartoon avatars.',
  alternates: {
    canonical: '/privacy',
  },
};
const TOC = [
  { id: 'summary', label: 'The short version' },
  { id: 'who-we-are', label: 'Who we are' },
  { id: 'what-we-collect', label: 'What we collect' },
  { id: 'photos', label: 'Your photos and avatars' },
  { id: 'how-we-use', label: 'How we use your information' },
  { id: 'sharing', label: 'Who we share it with' },
  { id: 'cookies', label: 'Cookies and local storage' },
  { id: 'retention', label: 'How long we keep it' },
  { id: 'your-rights', label: 'Your choices and rights' },
  { id: 'security', label: 'How we protect it' },
  { id: 'transfers', label: 'International transfers' },
  { id: 'children', label: "Children's privacy" },
  { id: 'changes', label: 'Changes to this policy' },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* 标题区 */}
        <header className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Privacy Policy</h1>
          <p className="mt-3 text-gray-500">
            Effective date: {LEGAL_EFFECTIVE_DATE_TEXT} · Applies to {SERVICE_DOMAIN}
          </p>
        </header>

        {/* 摘要 */}
        <div id="summary" className="scroll-mt-24 mb-10 rounded-2xl border border-blue-200 bg-blue-50 p-5 sm:p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-2">The short version</h2>
          <ul className="space-y-2 text-gray-700 text-sm sm:text-base">
            <li>• You need an account (email or Google) to generate avatars.</li>
            <li>
              • <strong>Your photo is sent to our AI provider (MiniMax)</strong> solely to
              generate your avatar — that is the only reason it leaves our servers.
            </li>
            <li>
              • We store your uploads and results so you can view them again, but only your{' '}
              <strong>{GENERATION_HISTORY_LIMIT} most recent generations</strong>. Older ones are
              deleted automatically.
            </li>
            <li>• You can delete any or all of your creations yourself, at any time, in the app.</li>
            <li>• We do <strong>not</strong> sell your personal information.</li>
            <li>• We use Microsoft Clarity to understand how the site is used.</li>
          </ul>
          <p className="mt-4 text-sm text-gray-600">
            The sections below explain this in full detail.
          </p>
        </div>

        {/* 目录 */}
        <nav aria-label="Sections of this policy" className="mb-10">
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

        <Section id="who-we-are" title="Who we are">
          <p>
            {SERVICE_DOMAIN} (the &ldquo;Service&rdquo;), an AI cartoon avatar generator, is
            operated by <strong>{OPERATOR_NAME}</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;). We
            are the data controller for the personal information described in this policy.
          </p>
          <p>
            For any privacy question, or to exercise any of the rights in{' '}
            <a href="#your-rights" className="text-blue-600 hover:underline">
              Your choices and rights
            </a>
            , contact us at{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </Section>

        <Section id="what-we-collect" title="What we collect">
          <p>We collect the following categories of information:</p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-3 font-semibold text-gray-900">Category</th>
                  <th className="text-left p-3 font-semibold text-gray-900">What exactly</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr>
                  <td className="p-3 align-top font-medium text-gray-900">Account</td>
                  <td className="p-3 align-top">
                    Your email address, a username (defaults to the part of your email before the
                    &ldquo;@&rdquo;), your full name if you provide one, and — when you sign in
                    with Google — your Google profile name and profile picture URL. Also your
                    credit balance and account timestamps.
                  </td>
                </tr>
                <tr>
                  <td className="p-3 align-top font-medium text-gray-900">Password</td>
                  <td className="p-3 align-top">
                    Only if you register with email. Passwords are handled and stored in hashed
                    form by our authentication provider (Supabase) — we never see your password in
                    plain text. Signing in with Google does not involve a password with us.
                  </td>
                </tr>
                <tr>
                  <td className="p-3 align-top font-medium text-gray-900">Photos &amp; avatars</td>
                  <td className="p-3 align-top">
                    The photo you upload, the cartoon avatar generated from it, and the style you
                    selected. See{' '}
                    <a href="#photos" className="text-blue-600 hover:underline">
                      the next section
                    </a>
                    .
                  </td>
                </tr>
                <tr>
                  <td className="p-3 align-top font-medium text-gray-900">Payment records</td>
                  <td className="p-3 align-top">
                    A record of each purchase: amount, number of credits, payment status and the
                    payment reference. <strong>We never receive or store your card number</strong>{' '}
                    — card details are handled entirely by our payment provider.
                  </td>
                </tr>
                <tr>
                  <td className="p-3 align-top font-medium text-gray-900">Technical &amp; logs</td>
                  <td className="p-3 align-top">
                    Your IP address, browser user-agent, device type, an approximate location
                    derived from your IP (country level), the time of each sign-in, and which
                    sign-in method you used. We also keep short-lived records for rate limiting and
                    abuse prevention.
                  </td>
                </tr>
                <tr>
                  <td className="p-3 align-top font-medium text-gray-900">Usage analytics</td>
                  <td className="p-3 align-top">
                    How the site is used — pages viewed, clicks, scrolling behaviour and session
                    replays — collected through Microsoft Clarity. See{' '}
                    <a href="#cookies" className="text-blue-600 hover:underline">
                      Cookies and local storage
                    </a>
                    .
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="photos" title="Your photos and avatars">
          <p>
            This Service exists to turn a photo of you into a cartoon avatar, so the photo you
            upload is at the centre of how it works. Here is exactly what happens to it:
          </p>
          <ol className="list-decimal ml-5 space-y-2">
            <li>
              You choose a photo in your browser. Before uploading, the app asks for your explicit
              consent and tells you the image will be processed by AI.
            </li>
            <li>
              The photo is sent over HTTPS to our servers and forwarded to our AI processing
              provider, <strong>MiniMax</strong>, which produces the cartoon version. MiniMax
              receives the image only in order to generate your result.
            </li>
            <li>
              The result — and the source photo alongside it — are saved to your account so that
              you can view and download them again later from{' '}
              <Link href="/creations" className="text-blue-600 hover:underline">
                My Creations
              </Link>
              .
            </li>
            <li>
              <strong>We keep only your {GENERATION_HISTORY_LIMIT} most recent generations.</strong>{' '}
              Once you exceed that, the oldest entries (source photo plus result) are deleted
              automatically.
            </li>
            <li>
              You can delete any individual creation, or wipe your entire history, at any time from{' '}
              <Link href="/creations" className="text-blue-600 hover:underline">
                My Creations
              </Link>
              . Deletion takes effect immediately.
            </li>
          </ol>
          <div className="rounded-xl border border-gray-200 bg-white p-4 mt-4">
            <p className="font-semibold text-gray-900 mb-1.5">What we do NOT do with your photos</p>
            <ul className="space-y-1.5 text-sm">
              <li>• We do not use them to identify or authenticate you.</li>
              <li>
                • We do not create biometric templates, faceprints or any other biometric
                identifier from them.
              </li>
              <li>• We do not use them to train AI models.</li>
              <li>• We do not sell, rent or share them for advertising.</li>
              <li>• We do not publish them — your avatars are never shown to other users.</li>
            </ul>
          </div>
          <p className="text-sm text-gray-500">
            Please upload only photos of yourself, or photos of someone who has given you
            permission to use them this way. Do not upload images of other people without their
            consent, and do not upload images of children.
          </p>
        </Section>

        <Section id="how-we-use" title="How we use your information">
          <p>We use your information only for the purposes below.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-3 font-semibold text-gray-900">Purpose</th>
                  <th className="text-left p-3 font-semibold text-gray-900">Data used</th>
                  <th className="text-left p-3 font-semibold text-gray-900">Legal basis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr>
                  <td className="p-3 align-top">
                    Creating your account, signing you in, showing your credit balance
                  </td>
                  <td className="p-3 align-top">Account data, credentials, log data</td>
                  <td className="p-3 align-top">Performance of a contract</td>
                </tr>
                <tr>
                  <td className="p-3 align-top">
                    Generating your cartoon avatar and saving it to your history
                  </td>
                  <td className="p-3 align-top">Your photo, the generated avatar, chosen style</td>
                  <td className="p-3 align-top">
                    Your consent (given in the AI processing notice before upload), and performance
                    of a contract
                  </td>
                </tr>
                <tr>
                  <td className="p-3 align-top">Taking payment and keeping purchase records</td>
                  <td className="p-3 align-top">Order data, payment reference</td>
                  <td className="p-3 align-top">
                    Performance of a contract, and legal obligations (accounting and tax)
                  </td>
                </tr>
                <tr>
                  <td className="p-3 align-top">
                    Protecting the Service — abuse prevention, rate limiting, fraud and security
                    investigations
                  </td>
                  <td className="p-3 align-top">
                    IP address, user-agent, device type, sign-in logs
                  </td>
                  <td className="p-3 align-top">
                    Our legitimate interests in keeping the Service safe and available
                  </td>
                </tr>
                <tr>
                  <td className="p-3 align-top">
                    Understanding how the Service is used so we can improve it
                  </td>
                  <td className="p-3 align-top">Usage analytics and session replays</td>
                  <td className="p-3 align-top">
                    Consent where required by law, otherwise our legitimate interests in improving
                    the product
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            We do not currently send marketing emails, we do not sell data, and we do not use
            automated decision-making to make decisions that produce legal effects about you.
          </p>
        </Section>

        <Section id="sharing" title="Who we share it with">
          <p>
            <strong>We do not sell your personal information.</strong> We share it only with the
            service providers listed below, and only to the extent needed to run the Service. Each
            is contractually limited to processing your data on our instructions.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-3 font-semibold text-gray-900">Provider</th>
                  <th className="text-left p-3 font-semibold text-gray-900">What they do for us</th>
                  <th className="text-left p-3 font-semibold text-gray-900">What they receive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr>
                  <td className="p-3 align-top font-medium text-gray-900">Supabase</td>
                  <td className="p-3 align-top">Database, authentication and file storage</td>
                  <td className="p-3 align-top">
                    All account data, generations and logs described above — they host the database
                    itself
                  </td>
                </tr>
                <tr>
                  <td className="p-3 align-top font-medium text-gray-900">MiniMax</td>
                  <td className="p-3 align-top">AI image generation</td>
                  <td className="p-3 align-top">
                    The photo you upload and the style requested —{' '}
                    <strong>solely to produce your avatar</strong>
                  </td>
                </tr>
                <tr>
                  <td className="p-3 align-top font-medium text-gray-900">Dodo Payments</td>
                  <td className="p-3 align-top">Payment processing, acting as merchant of record</td>
                  <td className="p-3 align-top">
                    Your email address and order details. Card data goes to them directly and never
                    reaches us
                  </td>
                </tr>
                <tr>
                  <td className="p-3 align-top font-medium text-gray-900">Vercel</td>
                  <td className="p-3 align-top">Hosting, CDN and edge network</td>
                  <td className="p-3 align-top">
                    Standard web request data, including your IP address and approximate country
                  </td>
                </tr>
                <tr>
                  <td className="p-3 align-top font-medium text-gray-900">Microsoft Clarity</td>
                  <td className="p-3 align-top">
                    Product analytics and session replay, so we can see where the interface is
                    confusing
                  </td>
                  <td className="p-3 align-top">
                    Pages viewed, clicks and scrolling. Text input fields are masked, and your
                    photos are never sent to it
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            We may also disclose information where the law requires it (for example, in response to
            a valid legal request), or as part of a merger or acquisition — in which case we will
            tell you before your data becomes subject to a different privacy policy.
          </p>
        </Section>

        <Section id="cookies" title="Cookies and local storage">
          <p>We use a small, deliberately limited set of cookies and browser storage:</p>
          <ul className="space-y-2">
            <li>
              <strong>Essential (authentication).</strong> Cookies set by Supabase to keep you
              signed in. The Service cannot work without them.
            </li>
            <li>
              <strong>Your theme preference.</strong> Stored in your browser&rsquo;s local storage
              (light or dark), not on our servers, and containing no personal data.
            </li>
            <li>
              <strong>Microsoft Clarity (analytics).</strong> Sets cookies to distinguish sessions
              and to record anonymised interaction data and session replays. It runs only on the
              production site, never during local development.
            </li>
          </ul>
          <p>
            We do not use advertising cookies, we do not run third-party ad networks, and we do not
            sell data derived from cookies. Where your jurisdiction requires consent for analytics
            cookies, you may withdraw it at any time by blocking or deleting cookies for this site
            in your browser settings; the Service will keep working (analytics simply will not
            collect data).
          </p>
        </Section>

        <Section id="retention" title="How long we keep it">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-3 font-semibold text-gray-900">Data</th>
                  <th className="text-left p-3 font-semibold text-gray-900">Retention</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr>
                  <td className="p-3 align-top font-medium text-gray-900">
                    Photos and generated avatars
                  </td>
                  <td className="p-3 align-top">
                    Only your <strong>{GENERATION_HISTORY_LIMIT} most recent generations</strong>;
                    older ones are deleted automatically as you generate more. Anything you delete
                    yourself in the app is removed immediately.
                  </td>
                </tr>
                <tr>
                  <td className="p-3 align-top font-medium text-gray-900">Account data</td>
                  <td className="p-3 align-top">
                    For as long as your account is active. On an account deletion request we delete
                    it within 30 days, except where we must keep records by law.
                  </td>
                </tr>
                <tr>
                  <td className="p-3 align-top font-medium text-gray-900">
                    Sign-in and security logs
                  </td>
                  <td className="p-3 align-top">
                    For as long as your account is active, and for up to 12 months afterwards, so we
                    can investigate abuse and security incidents.
                  </td>
                </tr>
                <tr>
                  <td className="p-3 align-top font-medium text-gray-900">
                    Purchase and transaction records
                  </td>
                  <td className="p-3 align-top">
                    As long as tax and accounting law requires (this period depends on the
                    jurisdiction, typically several years). These records are kept even after you
                    close your account.
                  </td>
                </tr>
                <tr>
                  <td className="p-3 align-top font-medium text-gray-900">
                    Rate-limiting records
                  </td>
                  <td className="p-3 align-top">
                    Minutes to hours — they exist only to slow down abuse.
                  </td>
                </tr>
                <tr>
                  <td className="p-3 align-top font-medium text-gray-900">Analytics data</td>
                  <td className="p-3 align-top">
                    Retained by Microsoft Clarity under Microsoft&rsquo;s own retention terms, which
                    you can review in Microsoft&rsquo;s privacy documentation.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="your-rights" title="Your choices and rights">
          <p>
            <strong>In the app, right now.</strong> Open{' '}
            <Link href="/creations" className="text-blue-600 hover:underline">
              My Creations
            </Link>{' '}
            to delete any single creation, or to delete every record of your uploads and avatars in
            one action. This is immediate and cannot be undone.
          </p>
          <p>
            <strong>By contacting us at{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline">
                {SUPPORT_EMAIL}
              </a>
            </strong>
            , you can also ask us to:
          </p>
          <ul className="list-disc ml-5 space-y-1.5">
            <li>confirm what personal data we hold about you, and give you a copy of it;</li>
            <li>correct anything inaccurate;</li>
            <li>delete your account and the personal data associated with it;</li>
            <li>
              restrict or object to particular processing (for example, opt out of analytics);
            </li>
            <li>provide your data in a portable, machine-readable format;</li>
            <li>withdraw any consent you previously gave — for example for photo processing.</li>
          </ul>
          <p>
            We will respond within 30 days. We may ask you to verify that you control the email
            address on the account before acting on a request, and we will not charge you for
            exercising these rights.
          </p>
          <p className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
            <strong>California and similar US state laws:</strong> we do not sell your personal
            information, and we do not share it for cross-context behavioural advertising. We do not
            use or disclose sensitive personal information for purposes beyond providing the
            Service. You will not be treated differently for exercising any privacy right.
          </p>
        </Section>

        <Section id="security" title="How we protect it">
          <p>We take a deliberately conservative approach to security:</p>
          <ul className="space-y-1.5">
            <li>All traffic is served over HTTPS.</li>
            <li>
              Passwords are hashed by our authentication provider — nobody, including us, can read
              them.
            </li>
            <li>
              Access to user data is enforced at the database level (row-level security), so one
              account cannot read another account&rsquo;s records even if a client is fully
              compromised.
            </li>
            <li>
              Sensitive account fields (such as your credit balance) can only be changed by trusted
              server-side code, never directly by a browser.
            </li>
            <li>Access to production systems is limited, and abuse is rate-limited.</li>
          </ul>
          <p className="text-sm text-gray-500">
            No online service can promise perfect security. If you believe your account has been
            compromised, contact{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline">
              {SUPPORT_EMAIL}
            </a>{' '}
            and we will help you secure it.
          </p>
        </Section>

        <Section id="transfers" title="International transfers">
          <p>
            Our service providers are located in several countries, primarily the United States
            (and our AI provider operates internationally). This means your information may be
            transferred to, and processed in, a country other than the one you live in.
          </p>
          <p>
            Where the law of your country requires it — for example if you are in the European
            Economic Area, the United Kingdom or Switzerland — such transfers are covered by
            appropriate safeguards, such as standard contractual clauses approved for this purpose.
            You can ask us for more detail using the contact address above.
          </p>
        </Section>

        <Section id="children" title="Children's privacy">
          <p>
            The Service is not intended for children. You must be at least 13 years old to use it,
            and if you are in a jurisdiction where the age of digital consent is higher (16 in some
            countries), you must meet that age. If you are under the age of majority where you live,
            please use the Service only with the involvement of a parent or guardian.
          </p>
          <p>
            We do not knowingly collect personal information from children, and we ask that you do
            not upload photos of children. If you believe a child has provided us with personal
            information, contact us and we will delete it.
          </p>
        </Section>

        <Section id="changes" title="Changes to this policy">
          <p>
            We may update this policy as the Service evolves. When we do, we will change the
            effective date at the top of this page. If a change is significant — for example, a new
            purpose for which we use your photos, or a new category of recipient — we will give
            notice by email or in the app before it takes effect.
          </p>
        </Section>

        {/* 结尾 */}
        <div className="border-t border-gray-200 pt-8">
          <p className="text-gray-600">
            See also our{' '}
            <Link href="/terms" className="text-blue-600 hover:underline">
              Terms of Service
            </Link>
            . Questions about this policy? Email{' '}
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






