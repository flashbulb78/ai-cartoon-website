/**
 * components/LegalSection.tsx
 * 法律页面（/privacy、/terms）共用的章节容器（服务端组件，无需 'use client'）
 *
 * 抽出来的原因：两个法律页各有 10 多个章节，若各自定义一份容器，
 * 后续调整间距/锚点偏移时必然只改一处、另一处逐渐走样。
 */
export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 mb-10">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-3 text-gray-600 leading-relaxed">{children}</div>
    </section>
  );
}
