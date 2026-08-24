import { getTranslations } from 'next-intl/server';

import { ResetForm } from './reset-form';

export async function generateMetadata() {
  const t = await getTranslations('marketing.reset');
  return { title: t('title') };
}

/**
 * A server shell for the title; the form itself holds state.
 *
 * The 460px is here rather than in the layout because sign-in beside it is
 * wider — see the note in ../layout.tsx.
 */
export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-[460px]">
      <ResetForm />
    </div>
  );
}
